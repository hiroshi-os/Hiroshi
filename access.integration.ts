/** One real native window at a time, an isolated daemon and actual tool effects. */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openWindow, waitUntil, stopTheDaemon } from './integration'
import { readRegistry, localPaths } from './src/engine/discovery'
import { engineClient } from './src/engine/client'
import { accessFixture } from './engine/test/access-fixture'
import type { AccessMode } from './engine/src/protocol'

const root = mkdtempSync(path.join(tmpdir(), 'hiroshi-access-window-')), home = path.join(root, 'engine'), cwd = path.join(root, 'project')
mkdirSync(home); mkdirSync(cwd)
if (Bun.spawnSync(['git', '-C', cwd, 'init', '-b', 'main']).exitCode) throw new Error('Could not initialize the temporary project')
const fixture = accessFixture()
writeFileSync(path.join(home, 'providers.json'), JSON.stringify({ defaultModel: 'fixture/tools', providers: [fixture.provider] }))
writeFileSync(path.join(home, 'execution.json'), JSON.stringify({ maxActive: 1, minFreeMemoryMB: 128, processMemoryMB: 512, maxProcesses: 4, timeoutMs: 30000 }))
const env = { HIROSHI_HOME: home, GPUIX_BACKGROUND: '1', HIROSHI_ACCESS_TEST_KEY: 'local-fixture' }
const check = (value: unknown, message: string) => { if (!value) throw new Error(message) }
try {
  const window = await openWindow(env, cwd)
  let id = ''
  try {
    const app = window.app, record = await waitUntil(async () => readRegistry(localPaths(home).registry), 'the isolated daemon')
    const client = engineClient(record)
    await waitUntil(async () => (await app.getByTestId('access-picker').textContent()) === 'Supervised' && !(await app.getByTestId('engine-run-status').textContent()).includes('Connecting') && (await client.listSessions()).sessions.length > 0, 'the default supervised task')
    id = (await client.listSessions()).sessions[0]!.id
    const select = async (mode: AccessMode, label: string) => {
      await app.getByTestId('access-picker').click(); await app.getByTestId(`access-${mode}`).waitFor(); await app.getByTestId(`access-${mode}`).click()
      await waitUntil(async () => (await client.session({ id })).access?.mode === mode && (await app.getByTestId('access-picker').textContent()) === label, 'the saved permission mode')
    }
    const send = async (tool: string, input: object) => { await app.getByTestId('composer').fill(JSON.stringify({ tool, input })); await app.getByTestId('composer').press('enter') }
    const done = async (count: number) => waitUntil(async () => { const d = await client.session({ id }); return d.toolCalls.filter((call) => !!call.resultMessageID).length >= count && d.messages.at(-1)?.role === 'assistant' && d.steps.at(-1)?.status === 'succeeded' }, 'the real tool effect and model continuation')
    await send('write_file', { path: 'supervised.txt', content: 'must wait' })
    const question = await waitUntil(async () => (await client.session({ id })).permissions.find((item) => item.state === 'pending'), 'a supervised approval question')
    check(!existsSync(path.join(cwd, 'supervised.txt')), 'Supervised wrote a file before approval')
    await app.getByTestId(`permission-deny-${question.id}`).click(); await done(1)
    await select('edits', 'Auto-accept edits')
    await send('write_file', { path: 'edits.txt', content: 'automatically accepted edit' }); await done(2)
    check(existsSync(path.join(cwd, 'edits.txt')), 'Auto-accept edits did not execute the edit')
    await select('auto', 'Auto')
    await send('write_file', { path: 'auto.txt', content: 'independently reviewed edit' }); await done(3)
    check((await client.session({ id })).accessReviews?.[0]?.status === 'allow' && fixture.reviews.length === 1, 'Auto did not obtain an independent model approval')
    check(existsSync(path.join(cwd, 'auto.txt')), 'The approved Auto action did not execute')
    await select('full', 'Full access')
    await send('shell', { command: 'echo window-full-access' }); await done(4)
    check((await client.session({ id })).toolCalls.at(-1)?.output?.includes('window-full-access'), 'Full access did not execute the shell command')
    await app.getByTestId('access-picker').click()
    mkdirSync('screenshots', { recursive: true })
    await app.screenshot({ path: path.resolve('screenshots/windowed-permission-modes.png') })
    await app.getByTestId('access-full').click()
  } finally { await window.close() }
  const restored = await openWindow(env, cwd)
  try {
    const app = restored.app
    await waitUntil(async () => (await app.getByTestId('access-picker').textContent()) === 'Full access', 'the restored task permission mode')
    await app.getByTestId('new-task').click()
    await waitUntil(async () => (await app.getByTestId('access-picker').textContent()) === 'Supervised' && !(await app.getByTestId('engine-run-status').textContent()).includes('Connecting'), 'a new task to default to Supervised')
    await app.getByTestId(`thread-${id}`).click()
    await waitUntil(async () => (await app.getByTestId('access-picker').textContent()) === 'Full access', 'the original task to retain its own mode')
    const client = engineClient(readRegistry(localPaths(home).registry)!)
    await client.updateAccess({ id, mode: 'ask', revision: (await client.session({ id })).access!.revision })
    await waitUntil(async () => (await app.getByTestId('access-picker').textContent()) === 'Supervised', 'another client mode update to reach the live picker')
  } finally { await restored.close() }
  console.log('Permission windows passed: Supervised, automatic edits, independent AI review, full-access shell, restart, task isolation and live synchronization.')
} finally { await stopTheDaemon(home); fixture.releaseReview(); fixture.releaseTurn(); fixture.server.stop(true) }
