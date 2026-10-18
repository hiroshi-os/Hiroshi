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

// Wait for UI to mount
await app.getByTestId('composer').waitFor({ timeoutMs: 60_000 })
await app.clock.pause()

// 1. Transition to Settings
await app.getByTestId('settings').click()
await app.getByTestId('settings-back').waitFor({ timeoutMs: 10_000 })

// 2. Capture General
await app.screenshot({ path: path.join(outDir, 'settings-general.png') })
console.log('[screenshot] wrote screenshots/settings-general.png')

// 3. Capture Appearance
await app.getByTestId('settings-section-appearance').click()
await app.screenshot({ path: path.join(outDir, 'settings-appearance.png') })
console.log('[screenshot] wrote screenshots/settings-appearance.png')

// 4. Capture Providers
await app.getByTestId('settings-section-providers').click()
await app.screenshot({ path: path.join(outDir, 'settings-providers.png') })
console.log('[screenshot] wrote screenshots/settings-providers.png')

// 5. Capture Skills
await app.getByTestId('settings-section-skills').click()
await app.screenshot({ path: path.join(outDir, 'settings-skills.png') })
console.log('[screenshot] wrote screenshots/settings-skills.png')

// 6. Capture Usage
await app.getByTestId('settings-section-usage').click()
await app.screenshot({ path: path.join(outDir, 'settings-usage.png') })
console.log('[screenshot] wrote screenshots/settings-usage.png')

// 7. Capture Daemon
await app.getByTestId('settings-section-daemon').click()
await app.screenshot({ path: path.join(outDir, 'settings-daemon.png') })
console.log('[screenshot] wrote screenshots/settings-daemon.png')

// 8. Return back to chat
await app.getByTestId('settings-back').click()
await app.getByTestId('composer').waitFor({ timeoutMs: 10_000 })
await app.screenshot({ path: path.join(outDir, 'chat-main.png') })
console.log('[screenshot] wrote screenshots/chat-main.png')

await app.close()
console.log('[screenshot] all 6 settings views captured successfully!')
