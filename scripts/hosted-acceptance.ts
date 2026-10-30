/** Explicit hosted acceptance. Owns one daemon at a time; no desktop is launched. */
import { join } from 'node:path'
import { create, OpenTunnelStorage } from '@opentunnel/client'
import { startDaemon, tempHome, until } from '../engine/test/harness'
import type { EngineEvent, PairingConnection } from '../engine/src/protocol'
import { engineClient, type EngineClient } from '../src/engine/client'
import { externalReachability } from './external-reachability'

if (!process.argv.includes('--live')) throw new Error('Pass --live to create a temporary public tunnel for verification.')
const flag = (name: string) => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1] }
const home = flag('--home') ?? tempHome(), executable = flag('--engine')
let daemon = await startDaemon({ home, executable })
console.log(`Live acceptance uses isolated data: ${home}`)
const request = (url: string, init?: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(15000), redirect: 'error' })
const check = (value: unknown, message: string) => { if (!value) throw new Error(message) }
const streams: { controller: AbortController; done: Promise<void> }[] = []
function listen(client: EngineClient, after: number) {
  const controller = new AbortController(), events: EngineEvent[] = []; let opened = false, ended = false
  const done = client.feed({ after, signal: controller.signal, onOpen: () => { opened = true }, onEvent: (event) => { if (events.length >= 4096) throw new Error('Acceptance event cap exceeded'); events.push(event) } }).then(() => { ended = true }, () => { ended = true })
  streams.push({ controller, done }); return { controller, done, events, opened: () => opened, ended: () => ended }
}
async function connected(timeout = 300000) {
  await until(async () => {
    const state = await daemon.client.internetSettings()
    if (state.state === 'failed') throw new Error(state.error ?? 'Tunnel failed')
    return state.state === 'connected'
  }, timeout, 1000)
  return (await daemon.client.internetSettings()).url!
}
try {
  await daemon.client.updateInternet({ revision: (await daemon.client.internetSettings()).revision, enabled: true })
  const origin = await connected()
  console.log('Acceptance: hosted HTTPS connected')
  check(!(await daemon.client.networkSettings()).enabled, 'Internet access enabled LAN exposure')
  if (flag('--external-ref')) console.log(`Independent reachability passed: ${await externalReachability(origin, flag('--external-ref')!)}`)
  check((await request(origin + '/v1/health')).status === 401, 'Public health accepted an unauthenticated request')
  const pair = async (name: string) => {
    const invitation = await daemon.client.createPairing({ remote: true }), payload = JSON.parse(invitation.payload)
    check(payload.urls.length === 1 && payload.urls[0] === origin, 'The QR advertised a different endpoint')
    const response = await request(origin + '/v1/pairing/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: payload.code, name }) })
    check(response.status === 200, `Public pairing returned ${response.status}`)
    return await response.json() as PairingConnection
  }
  const phone = await pair('Acceptance phone'), tablet = await pair('Acceptance tablet')
  const phoneClient = engineClient({ url: origin, token: phone.token }), tabletClient = engineClient({ url: origin, token: tablet.token })
  for (const path of ['/v1/internet', '/v1/network/token', '/v1/network/pairing', '/v1/shutdown']) check((await request(origin + path, { headers: { authorization: `Bearer ${phone.token}` } })).status === 403, 'Public endpoint exposed owner controls')
  const first = listen(phoneClient, 0), other = listen(tabletClient, 0)
  await until(() => first.opened() && other.opened(), 15000)
  const session = await phoneClient.createSession({})
  await phoneClient.prompt({ id: session.session.id, text: 'Hosted acceptance first prompt', model: 'local/echo', key: 'hosted-first' })
  await until(async () => (await daemon.client.session({ id: session.session.id })).steps[0]?.status === 'succeeded')
  await until(() => first.events.some((event) => event.type === 'step.completed') && other.events.some((event) => event.type === 'step.completed'), 15000)
  const cursor = first.events.at(-1)!.seq
  first.controller.abort(); await first.done
  await daemon.client.prompt({ id: session.session.id, text: 'Offline event recovery', model: 'local/echo', key: 'hosted-offline' })
  await until(async () => (await daemon.client.session({ id: session.session.id })).steps.at(-1)?.status === 'succeeded')
  const resumed = listen(phoneClient, cursor)
  await until(() => resumed.events.some((event) => event.type === 'step.completed'), 15000)
  check(resumed.events.every((event, i) => event.seq > cursor && (!i || event.seq > resumed.events[i - 1]!.seq)), 'Event recovery repeated or reordered events')
  await daemon.client.revokePairedDevice({ deviceID: phone.device.id, revision: (await daemon.client.pairingState()).revision })
  await until(resumed.ended, 15000)
  check((await request(origin + '/v1/health', { headers: { authorization: `Bearer ${phone.token}` } })).status === 401, 'Revoked credential remained usable')
  check((await tabletClient.health()).pid === daemon.health.pid && !other.ended(), 'Revoking one device disconnected another')
  const restartCursor = other.events.at(-1)?.seq ?? 0
  await daemon.crash(); await until(other.ended, 15000)
  daemon = await startDaemon({ home, executable })
  check(await connected(60000) === origin, 'Restart changed the public route/identity')
  check((await tabletClient.health()).pid === daemon.health.pid, 'Saved device credential failed after restart')
  check(phone.server.id === tablet.server.id, 'Paired devices disagree on daemon identity')
  const replay = listen(tabletClient, restartCursor); await until(replay.opened, 15000)
  await tabletClient.prompt({ id: session.session.id, text: 'After daemon restart', model: 'local/echo', key: 'hosted-restart' })
  await until(() => replay.events.some((event) => event.type === 'step.completed'), 15000)
  check((await daemon.client.session({ id: session.session.id })).messages.some((message) => message.text.includes('Offline event recovery')), 'Restart lost the transcript')
  await daemon.client.rotateNetworkToken({ revision: (await daemon.client.networkSettings()).revision })
  await until(replay.ended, 15000)
  check((await request(origin + '/v1/health', { headers: { authorization: `Bearer ${tablet.token}` } })).status === 401, 'Token rotation retained paired access')
  const final = await pair('Disable acceptance'), finalClient = engineClient({ url: origin, token: final.token }), finalFeed = listen(finalClient, (await daemon.client.health()).lastSeq)
  await until(finalFeed.opened, 15000)
  await daemon.client.updateInternet({ revision: (await daemon.client.internetSettings()).revision, enabled: false }); await until(finalFeed.ended, 15000)
  check((await daemon.client.health()).pid === daemon.health.pid && !(await daemon.client.networkSettings()).enabled, 'Internet disable damaged local/LAN state')
  const offline = await request(origin + '/v1/health', { headers: { authorization: `Bearer ${final.token}` } }).then((response) => response.status !== 200, () => true)
  check(offline, 'Disabled endpoint still served the daemon')
  console.log('Hosted acceptance passed: two device credentials, live events, cursor recovery, independent revocation, crash/restart, stable route, persisted transcript, token rotation and disable. One daemon at a time.')
} finally {
  for (const stream of streams) stream.controller.abort()
  await Promise.all(streams.map((stream) => stream.done))
  try { await daemon.client.updateInternet({ revision: (await daemon.client.internetSettings()).revision, enabled: false }) } catch {}
  try { await daemon.client.shutdown() } catch {}
  await daemon.crash()
  const cleanup = create({ store: OpenTunnelStorage.xdg({ env: { XDG_DATA_HOME: join(home, 'remote') }, home }) })
  try {
    if (await cleanup.tunnel.get()) { await cleanup.tunnel.remove(); console.log('The hosted acceptance tunnel was deleted.') }
    else if (await cleanup.tunnel.pending()) console.log(`Pending certificate identity preserved in ${home}.`)
  } finally { await cleanup.dispose() }
}
