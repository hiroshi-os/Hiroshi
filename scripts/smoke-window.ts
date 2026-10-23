import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { connectStdio } from '@gpuix/react/automation'
import { discover } from '../src/engine/discovery'
import { engineClient } from '../src/engine/client'
import { stopEngine } from '../src/engine/supervisor'

const home = mkdtempSync(path.join(os.tmpdir(), 'hiroshi-launcher-'))
const binary = path.resolve('dist', process.platform === 'win32' ? 'hiroshi.exe' : 'hiroshi')
const child = spawn(binary, [], { cwd: home, env: { ...process.env, HIROSHI_HOME: home, GPUIX_BACKGROUND: '1' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
let listener: ((value: string) => void) | undefined, output = ''
child.stdout!.on('data', (data) => listener?.(data.toString()))
child.stderr!.on('data', (data) => { output = (output + data.toString()).slice(-4096) })
const exited = new Promise<number | null>((resolve) => child.once('exit', resolve))
const deadline = <T>(promise: Promise<T>) => Promise.race([promise, new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('Launcher smoke timed out: ' + output)), 25000); timer.unref() })])
try {
  const app = await deadline(connectStdio({ write: (data) => { child.stdin!.write(data) }, feed: (receive) => { listener = receive }, close: async () => { child.kill() } }))
  await app.getByTestId('composer').waitFor({ timeoutMs: 20000 })
  let attached = await discover(path.join(home, 'engine.json'))
  for (let i = 0; i < 100 && attached.state !== 'running'; i++) { await Bun.sleep(100); attached = await discover(path.join(home, 'engine.json')) }
  if (attached.state !== 'running') throw new Error('The supervised window did not attach its sidecar')
  await app.getByTestId('window-close').click().catch(() => {})
  if (await deadline(exited) !== 0) throw new Error('Intentional window close did not end supervision cleanly')
  await engineClient(attached.record).health()
  console.log('Packaged launcher opened one window, closed without restarting, and left its sidecar alive')
} finally {
  child.kill()
  await stopEngine({ home })
  for (let i = 0; i < 20; i++) { try { rmSync(home, { recursive: true, force: true }); break } catch { await Bun.sleep(100) } }
}
