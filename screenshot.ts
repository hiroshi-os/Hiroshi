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

// 1. Capture Timeline View
await app.screenshot({ path: path.join(outDir, 'timeline.png') })
console.log('[screenshot] wrote screenshots/timeline.png')

// 2. Capture Topology View
await app.getByTestId('tab-topology').click()
await app.screenshot({ path: path.join(outDir, 'topology.png') })
console.log('[screenshot] wrote screenshots/topology.png')

// 3. Capture Fleet & Agents View
await app.getByTestId('tab-fleet').click()
await app.screenshot({ path: path.join(outDir, 'fleet.png') })
console.log('[screenshot] wrote screenshots/fleet.png')

// 4. Capture Artifacts View
await app.getByTestId('tab-artifacts').click()
await app.screenshot({ path: path.join(outDir, 'artifacts.png') })
console.log('[screenshot] wrote screenshots/artifacts.png')

await app.close()
console.log('[screenshot] all views captured successfully!')
