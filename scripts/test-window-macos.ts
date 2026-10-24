import { mkdirSync } from 'node:fs'
import path from 'node:path'
if (process.platform !== 'darwin') throw new Error('This native bridge test requires macOS')
mkdirSync('dist', { recursive: true })
const binary = path.resolve('dist/test-window-macos')
const build = Bun.spawnSync(['clang', '-fobjc-arc', '-framework', 'Cocoa', path.resolve('scripts/test-window-macos.m'), '-o', binary])
if (build.exitCode !== 0) throw new Error(build.stderr.toString())
const child = Bun.spawn([binary], { stdout: 'inherit', stderr: 'inherit' })
const timer = setTimeout(() => child.kill('SIGKILL'), 15000)
try { if (await child.exited !== 0) throw new Error('Native macOS drag contract failed') }
finally { clearTimeout(timer) }
