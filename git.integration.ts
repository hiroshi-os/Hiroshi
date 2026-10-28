/** One bounded real window, real daemon, real Git checkout and worktree. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openWindow, waitUntil, stopTheDaemon } from './integration'
import { readRegistry, localPaths } from './src/engine/discovery'
import { engineClient } from './src/engine/client'

const root = mkdtempSync(path.join(tmpdir(), 'hiroshi-git-window-')), home = path.join(root, 'engine'), cwd = path.join(root, 'repo')
mkdirSync(home); mkdirSync(cwd)
const git = (...args: string[]) => {
  const result = Bun.spawnSync(['git', '-C', cwd, ...args], { timeout: 8000, windowsHide: true })
  if (result.exitCode) throw new Error(result.stderr.toString())
  return result.stdout.toString().trim()
}
git('init', '-b', 'main'); git('config', 'user.name', 'Window test'); git('config', 'user.email', 'window@local'); git('config', 'commit.gpgsign', 'false')
writeFileSync(path.join(cwd, 'file.txt'), 'committed file\n'); git('add', '.'); git('commit', '-m', 'initial'); git('branch', 'available')
const check = (value: unknown, message: string) => { if (!value) throw new Error(message) }
try {
  const window = await openWindow({ HIROSHI_HOME: home, GPUIX_BACKGROUND: '1' }, cwd)
  let stage = 'initial branch'
  try {
    const app = window.app
    await waitUntil(async () => (await app.getByTestId('git-branch').textContent()) === 'main', 'the actual Git branch')
    const client = engineClient((await waitUntil(async () => readRegistry(localPaths(home).registry), 'the daemon registry')))
    const original = (await client.listSessions()).sessions.find((s) => s.cwd === cwd)!
    const settle = async () => { await app.clock.pause(); await app.clock.fastForward(320); await app.clock.resume() }
    stage = 'branch search and checkout'
    await app.getByTestId('git-branch').click(); await app.getByTestId('git-branch-search').waitFor(); await app.getByTestId('git-branch-search').fill('available')
    await app.getByTestId('git-branch-search').press('enter')
    await waitUntil(async () => (await app.getByTestId('git-branch').textContent()) === 'available', 'checkout from the real menu')
    check(git('branch', '--show-current') === 'available', 'The menu did not change Git HEAD')
    check((await client.listSessions()).sessions.length === 2, 'Branch change did not create a fresh task')
    await settle()
    stage = 'inline branch creation'
    await app.getByTestId('git-branch').click(); await app.getByTestId('git-create-branch').waitFor(); await app.getByTestId('git-create-branch').click()
    await app.getByTestId('git-new-name').waitFor(); await app.getByTestId('git-new-name').fill('created-in-window'); await app.getByTestId('git-new-name').press('enter')
    await waitUntil(async () => (await app.getByTestId('git-branch').textContent()) === 'created-in-window', 'inline branch creation')
    check(git('branch', '--show-current') === 'created-in-window', 'Inline creation did not switch branches')
    await settle()
    stage = 'dirty checkout refusal'
    writeFileSync(path.join(cwd, 'file.txt'), 'unsaved local data\n')
    await app.getByTestId('git-branch').click(); await app.getByTestId('git-branch-search').waitFor(); await app.getByTestId('git-branch-search').fill('main'); await app.getByTestId('git-branch-search').press('enter')
    await app.getByTestId('git-menu-error').waitFor()
    check((await app.getByTestId('git-menu-error').textContent()).includes('Commit or stash'), 'Dirty checkout did not explain its refusal')
    check(git('branch', '--show-current') === 'created-in-window', 'Dirty refusal changed HEAD')
    await app.getByTestId('git-branch-search').press('escape'); await settle()
    stage = 'isolated worktree creation'
    await app.getByTestId('git-workspace').click(); await app.getByTestId('git-new-worktree').waitFor(); await app.getByTestId('git-new-worktree').click()
    await app.getByTestId('git-new-name').waitFor(); await app.getByTestId('git-new-name').fill('isolated-in-window'); await app.getByTestId('git-new-name').press('enter')
    await waitUntil(async () => (await app.getByTestId('git-branch').textContent()) === 'isolated-in-window', 'the isolated worktree')
    const isolated = (await client.listSessions()).sessions.find((s) => s.cwd !== cwd)!
    check(!!isolated && readFileSync(path.join(isolated.cwd, 'file.txt'), 'utf8') === 'committed file\n', 'Worktree did not start from the committed snapshot')
    check(readFileSync(path.join(cwd, 'file.txt'), 'utf8') === 'unsaved local data\n', 'Worktree creation changed local dirty data')
    await settle()
    stage = 'return to local'
    await app.getByTestId('git-workspace').click(); await app.getByTestId('git-local').waitFor(); await app.getByTestId('git-local').click()
    await waitUntil(async () => (await app.getByTestId('engine-workspace').textContent()) === cwd && (await app.getByTestId('git-branch').textContent()) === 'created-in-window', 'returning to the local checkout')
    check((await client.session({ id: original.id })).session.cwd === cwd, 'Original task was rebound to the worktree')
    await settle()
    stage = 'existing worktree menu'
    await app.getByTestId('git-workspace').click(); await app.getByTestId('git-worktree-0').waitFor()
    mkdirSync('screenshots', { recursive: true }); await app.screenshot({ path: path.resolve('screenshots/windowed-git-worktrees.png') })
    await app.getByTestId('git-worktree-0').click()
    await waitUntil(async () => (await app.getByTestId('engine-workspace').textContent()) === isolated.cwd, 'reopening an existing worktree')
    console.log('Git window passed: branch search, checkout, creation, dirty refusal, isolated worktree and Local/worktree navigation.')
  } catch (error) {
    console.error(`Git window failed during ${stage}`)
    mkdirSync('screenshots', { recursive: true })
    try { writeFileSync('screenshots/git-failure-tree.json', JSON.stringify(await window.app.call('getTree', {}), null, 2)); await window.app.screenshot({ path: path.resolve('screenshots/git-failure.png') }) } catch {}
    throw error
  } finally { await window.close() }
} finally { await stopTheDaemon(home) }
