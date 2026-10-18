import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { launch } from '@gpuix/react/automation'

const outDir = 'screenshots'
mkdirSync(outDir, { recursive: true })

const app = await launch({
  command: 'bun',
  args: ['app.tsx'],
  env: { GPUIX_BACKGROUND: '1' },
})

// Wait for the UI root to mount
await app.getByTestId('composer').waitFor({ timeoutMs: 60_000 })
await app.clock.pause()

// 1. Capture Main Chat View
await app.screenshot({ path: path.join(outDir, 'chat-main.png') })
console.log('[screenshot] wrote screenshots/chat-main.png')

// 2. Capture with Inspector Open
await app.getByTestId('inspector-toggle').click()
await app.screenshot({ path: path.join(outDir, 'chat-inspector.png') })
console.log('[screenshot] wrote screenshots/chat-inspector.png')

// 3. Switch conversation
await app.getByTestId('thread-c2').click()
await app.screenshot({ path: path.join(outDir, 'chat-thread2.png') })
console.log('[screenshot] wrote screenshots/chat-thread2.png')

await app.close()
console.log('[screenshot] all views captured successfully!')
