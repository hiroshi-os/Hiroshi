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
await new Promise((r) => setTimeout(r, 400))

// 1. Capture Main Empty State (New chat page matching media_1792361923259_91e4dedb.png)
await app.screenshot({ path: path.join(outDir, 'new-task-empty.png') })
console.log('[screenshot] wrote screenshots/new-task-empty.png')

// 2. Open Environment & Tasks menu by clicking info (i) button (matching media_1792361940172_1d8741c1.png)
await app.getByTestId('inspector-toggle').click()
await app.getByTestId('env-commit-push').waitFor({ timeoutMs: 10_000 })
await new Promise((r) => setTimeout(r, 200))
await app.screenshot({ path: path.join(outDir, 'environment-menu.png') })
console.log('[screenshot] wrote screenshots/environment-menu.png')

// 3. Open Commit & Push modal by clicking "Commit or push" (matching media_1792361952266_f70665e0.png)
await app.getByTestId('env-commit-push').click()
await app.getByTestId('commit-modal-close').waitFor({ timeoutMs: 10_000 })
await new Promise((r) => setTimeout(r, 300))
await app.screenshot({ path: path.join(outDir, 'commit-push-modal.png') })
console.log('[screenshot] wrote screenshots/commit-push-modal.png')

// 4. Close modal and test Compare Branch -> opens Review in right sidebar
await app.getByTestId('commit-modal-close').click()
await new Promise((r) => setTimeout(r, 300))
await app.getByTestId('inspector-toggle').click()
await app.getByTestId('env-compare-branch').waitFor({ timeoutMs: 10_000 })
await app.getByTestId('env-compare-branch').click()
await new Promise((r) => setTimeout(r, 400))
await app.screenshot({ path: path.join(outDir, 'review-sidebar.png') })
console.log('[screenshot] wrote screenshots/review-sidebar.png')

// 5. Close right panel, hover window-close button to test close hover state & tooltip
await app.getByTestId('surface-panel-toggle').click()
await new Promise((r) => setTimeout(r, 300))
await app.mouse.move(app.getByTestId('window-close'))
await new Promise((r) => setTimeout(r, 300))
await app.screenshot({ path: path.join(outDir, 'window-controls-hover.png') })
console.log('[screenshot] wrote screenshots/window-controls-hover.png')

await app.close()
console.log('[screenshot] all requested views captured successfully!')
