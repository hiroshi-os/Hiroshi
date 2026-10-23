import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureEngine, stopEngine } from '../src/engine/supervisor'
import { engineClient } from '../src/engine/client'
import { ENGINE_VERSION } from '../engine/src/protocol'

const suffix = process.platform === 'win32' ? '.exe' : ''
const binary = path.resolve('dist', `hiroshi${suffix}`), engine = path.resolve('dist', `hiroshi-engine${suffix}`)
const home = mkdtempSync(path.join(os.tmpdir(), 'hiroshi-packaged-'))
const previous = process.env.HIROSHI_ENGINE
process.env.HIROSHI_ENGINE = engine
try {
  const version = Bun.spawnSync([binary, '--version'], { cwd: home, windowsHide: true })
  if (version.exitCode || version.stdout.toString().trim() !== ENGINE_VERSION) throw new Error(`Packaged version failed: ${version.stderr}`)
  const attached = await ensureEngine({ home, workspace: home })
  if (attached.status !== 'ready') throw new Error(JSON.stringify(attached))
  const client = engineClient(attached), { session } = await client.createSession({ cwd: home })
  await client.prompt({ id: session.id, text: 'packaged sidecar smoke test', model: 'local/echo' })
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const detail = await client.session({ id: session.id })
    if (detail.steps.at(-1)?.status === 'succeeded') {
      if (!detail.messages.some((m) => m.role === 'assistant' && m.text.includes('packaged sidecar smoke test'))) throw new Error('The packaged engine lost its answer')
      console.log(`Packaged Hiroshi ${ENGINE_VERSION} and sidecar passed in an isolated working directory`)
      process.exitCode = 0
      break
    }
    await Bun.sleep(100)
  }
  if (Date.now() >= deadline) throw new Error('Packaged engine did not complete its step')
} finally {
  await stopEngine({ home })
  if (previous === undefined) delete process.env.HIROSHI_ENGINE; else process.env.HIROSHI_ENGINE = previous
  for (let attempt = 0; attempt < 20; attempt++) {
    try { rmSync(home, { recursive: true, force: true }); break }
    catch { await Bun.sleep(100) }
  }
}
