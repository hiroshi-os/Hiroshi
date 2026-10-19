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

// 1. Capture initial state
await app.screenshot({ path: path.join(outDir, 'anim-01-initial.png') })
console.log('[test] captured initial state')

// 2. Open right surface panel
await app.getByTestId('panel-right-open').click()
await new Promise((r) => setTimeout(r, 250))
await app.screenshot({ path: path.join(outDir, 'anim-02-surface-open.png') })
console.log('[test] captured surface panel open')

// 3. Select Terminal surface card
await app.getByTestId('surface-card-terminal').click()
await new Promise((r) => setTimeout(r, 250))
await app.screenshot({ path: path.join(outDir, 'anim-03-surface-terminal.png') })
console.log('[test] captured surface terminal tab')

// 4. Select Browser tab via plus menu
await app.getByTestId('surface-plus-menu').click()
await new Promise((r) => setTimeout(r, 150))
await app.getByTestId('surface-select-browser').click()
await new Promise((r) => setTimeout(r, 250))
await app.screenshot({ path: path.join(outDir, 'anim-04-surface-browser.png') })
console.log('[test] captured surface browser tab')

// 5. Close surface tab with close tab button
await app.getByTestId('surface-close-tab').click()
await new Promise((r) => setTimeout(r, 250))
await app.screenshot({ path: path.join(outDir, 'anim-05-surface-tab-closed.png') })
console.log('[test] captured surface tab closed')

// 6. Test New Task addition
await app.getByTestId('new-task').click()
await new Promise((r) => setTimeout(r, 300))
await app.screenshot({ path: path.join(outDir, 'anim-06-new-task-added.png') })
console.log('[test] captured new task addition in sidebar')

// 7. Delete the newly added active task (task-1)
await app.getByTestId('delete-task-1').click()
await new Promise((r) => setTimeout(r, 300))
await app.screenshot({ path: path.join(outDir, 'anim-07-conversation-deleted.png') })
console.log('[test] captured conversation deletion in sidebar')

await app.close()
console.log('[test] all animation tests passed successfully!')
