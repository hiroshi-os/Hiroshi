/** Focused native project flow; windows run sequentially and await OS exit. */
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openWindow, waitUntil, treeText, stopTheDaemon } from './integration'
import { readRegistry, localPaths } from './src/engine/discovery'
import { engineClient } from './src/engine/client'

const root = mkdtempSync(path.join(tmpdir(), 'hiroshi-project-window-'))
const home = path.join(root, 'engine'), alpha = path.join(root, 'alpha'), beta = path.join(root, 'beta')
mkdirSync(home)
for (const cwd of [alpha, beta]) {
  mkdirSync(cwd)
  const result = Bun.spawnSync(['git', '-C', cwd, 'init', '-b', 'main'])
  if (result.exitCode) throw new Error('Could not initialize project fixture')
  writeFileSync(path.join(cwd, 'AGENTS.md'), `Instructions for ${path.basename(cwd)}`)
}
const check = (value: unknown, message: string) => { if (!value) throw new Error(message) }
const env = { HIROSHI_HOME: home, GPUIX_BACKGROUND: '1' }
try {
  const window = await openWindow(env, alpha)
  try {
    const app = window.app
    await waitUntil(async () => (await app.getByTestId('engine-workspace').textContent()) === alpha &&
      !(await app.getByTestId('engine-run-status').textContent()).includes('Connecting'), 'the initial project')
    const record = await waitUntil(async () => readRegistry(localPaths(home).registry), 'the engine discovery file')
    const client = engineClient(record)
    const switchProject = async (cwd: string) => {
      await app.getByTestId('open-project').click()
      await app.getByTestId('project-path').fill(cwd)
      await app.getByTestId('project-open-path').click()
      await waitUntil(async () => (await app.getByTestId('engine-workspace').textContent()) === cwd &&
        !(await app.getByTestId('engine-run-status').textContent()).includes('Connecting'), 'the selected project folder')
      await waitUntil(async () => (await client.health()).execution?.active === 0, 'previous workspace reads to settle')
    }
    const send = async (text: string) => {
      await app.getByTestId('composer').fill(text); await app.getByTestId('composer').press('enter')
      await waitUntil(async () => (await treeText(app)).includes(`The local provider received: ${text}`), 'a response in the selected project')
    }
    await send('window-alpha-task')
    await app.getByTestId('open-project').click()
    await app.getByTestId('project-path').fill(path.join(root, 'missing'))
    await app.getByTestId('project-open-path').click()
    await app.getByTestId('project-error').waitFor()
    await app.getByTestId('project-dialog-cancel').click()
    check((await app.getByTestId('engine-workspace').textContent()) === alpha, 'invalid selection changed project')
    await app.getByTestId('composer').fill('unsent alpha draft')
    await switchProject(beta)
    const afterSwitch = await treeText(app)
    if (afterSwitch.includes('window-alpha-task')) {
      mkdirSync('screenshots', { recursive: true })
      writeFileSync('screenshots/project-switch-tree.json', JSON.stringify(await app.call('getTree', {}), null, 2))
      await app.screenshot({ path: path.resolve('screenshots/project-switch-failure.png') })
    }
    check(!afterSwitch.includes('window-alpha-task'), 'alpha history leaked into beta')
    await app.getByTestId('composer').press('enter')
    const second = (await client.listSessions()).sessions.find((item) => item.cwd === beta)!
    check((await client.session({ id: second.id })).messages.length === 0, 'alpha draft leaked into beta')
    await send('window-beta-task')
    await switchProject(alpha)
    await waitUntil(async () => (await treeText(app)).includes('The local provider received: window-alpha-task'), 'alpha history to return')
    check(!(await treeText(app)).includes('window-beta-task'), 'beta history leaked into alpha')
    await switchProject(beta)
    await waitUntil(async () => (await treeText(app)).includes('The local provider received: window-beta-task'), 'beta history to return')
    check(!(await treeText(app)).includes('window-alpha-task'), 'alpha history remained after reopening beta')
    await app.getByTestId('open-project').click()
    mkdirSync('screenshots', { recursive: true })
    await app.screenshot({ path: path.resolve('screenshots/windowed-projects.png') })
    await app.getByTestId('project-dialog-cancel').click()
  } finally { await window.close() }
  const restored = await openWindow(env, alpha)
  try {
    await waitUntil(async () => (await restored.app.getByTestId('engine-workspace').textContent()) === beta, 'the last project after window restart')
    await waitUntil(async () => (await treeText(restored.app)).includes('The local provider received: window-beta-task'), 'the saved beta task')
  } finally { await restored.close() }
  renameSync(beta, path.join(root, 'moved-beta'))
  const missing = await openWindow(env, alpha)
  try {
    await missing.app.getByTestId('project-unavailable').waitFor()
    check((await treeText(missing.app)).includes('window-beta-task'), 'unavailable project history was lost')
    await missing.app.getByTestId('open-project').click()
    await missing.app.getByTestId('project-path').fill(alpha)
    await missing.app.getByTestId('project-open-path').click()
    await waitUntil(async () => (await missing.app.getByTestId('engine-workspace').textContent()) === alpha, 'opening a readable project from unavailable history')
  } finally { await missing.close() }
  console.log('Project windows passed: invalid/cancel, isolation, task restore, moved-folder history and recovery.')
} finally { await stopTheDaemon(home) }
