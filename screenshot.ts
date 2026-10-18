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

// 1. Capture Main Chat View (with custom titlebar controls in top-right)
await app.screenshot({ path: path.join(outDir, 'chat-main.png') })
console.log('[screenshot] wrote screenshots/chat-main.png')

// 2. Click Settings button to transition to Settings view
await app.getByTestId('settings').click()
await app.getByTestId('settings-back').waitFor({ timeoutMs: 10_000 })

// 3. Capture Settings View
await app.screenshot({ path: path.join(outDir, 'settings-view.png') })
console.log('[screenshot] wrote screenshots/settings-view.png')

// 4. Click Back to transition back to Chat
await app.getByTestId('settings-back').click()
await app.getByTestId('composer').waitFor({ timeoutMs: 10_000 })

// 5. Capture returned Chat view
await app.screenshot({ path: path.join(outDir, 'chat-returned.png') })
console.log('[screenshot] wrote screenshots/chat-returned.png')

await app.close()
console.log('[screenshot] all views and transitions captured successfully!')
