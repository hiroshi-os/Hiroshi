import { expect, test } from 'bun:test'
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startDaemon, tempHome, until } from './harness'
import { workspaceGit } from '../src/workspace-git'

function repository(home: string) {
  const cwd = join(home, 'repo'); mkdirSync(cwd)
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' }
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(['git', '-C', cwd, ...(args[0] === 'init' ? [] : [`--git-dir=${join(cwd, '.git')}`, `--work-tree=${cwd}`]), ...args], { cwd, env, timeout: 8000, windowsHide: true })
    if (result.exitCode) throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`)
    return result.stdout.toString().trim()
  }
  git('init', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@local'); git('config', 'commit.gpgsign', 'false')
  git('config', 'core.autocrlf', 'false')
  writeFileSync(join(cwd, 'file.txt'), 'committed\n'); git('add', '.'); git('commit', '-m', 'initial')
  return { cwd: realpathSync(cwd), git }
}

test('real daemon creates and switches branches with stale-ref, dirty-file and active-run protection', async () => {
  const home = tempHome(), { cwd, git } = repository(home), daemon = await startDaemon({ home })
  try {
    const { session: original } = await daemon.client.openProject({ cwd })
    const state = await daemon.client.workspaceGit({ id: original.id })
    expect(state.available).toBe(true); expect(state.current).toBe('main'); expect(state.dirty).toBe(false)
    const input = { id: original.id, action: 'create' as const, name: 'feature/navigation', revision: state.revision }
    const { session: next } = await daemon.client.changeWorkspaceGit(input)
    expect(next.id).not.toBe(original.id); expect(next.cwd).toBe(cwd)
    expect(git('branch', '--show-current')).toBe('feature/navigation')
    expect((await daemon.client.session({ id: original.id })).session.id).toBe(original.id)
    await expect(daemon.client.changeWorkspaceGit(input)).rejects.toMatchObject({ code: 'workspace_changed' })
    const fresh = await daemon.client.workspaceGit({ id: next.id })
    for (const name of ['../escape', '--detach', 'bad name', 'a..b', 'HEAD']) {
      await expect(daemon.client.changeWorkspaceGit({ ...input, id: next.id, name, revision: fresh.revision })).rejects.toMatchObject({ status: 400 })
    }
    writeFileSync(join(cwd, 'file.txt'), 'unsaved\n')
    const dirty = await daemon.client.workspaceGit({ id: next.id })
    await expect(daemon.client.changeWorkspaceGit({ id: next.id, action: 'checkout', name: 'main', revision: dirty.revision })).rejects.toMatchObject({ code: 'workspace_dirty' })
    expect(readFileSync(join(cwd, 'file.txt'), 'utf8')).toBe('unsaved\n')
    git('restore', 'file.txt')
    const clean = await daemon.client.workspaceGit({ id: next.id })
    const { run } = await daemon.client.startRun({ id: next.id, command: process.platform === 'win32' ? 'Start-Sleep -Seconds 10' : 'sleep 10' })
    await expect(daemon.client.changeWorkspaceGit({ id: next.id, action: 'checkout', name: 'main', revision: clean.revision })).rejects.toMatchObject({ code: 'workspace_busy' })
    await daemon.client.cancelRun({ id: run.id }); await until(async () => (await daemon.client.run({ id: run.id })).run.status !== 'running')
    const { session: returned } = await daemon.client.changeWorkspaceGit({ id: next.id, action: 'checkout', name: 'main', revision: clean.revision })
    expect(returned.id).not.toBe(next.id); expect(git('branch', '--show-current')).toBe('main')
  } finally { await daemon.stop() }
}, 45000)

test('real worktree isolates committed files and task cwd, survives daemon restart, and prevents double checkout', async () => {
  const home = tempHome(), { cwd, git } = repository(home)
  let daemon = await startDaemon({ home })
  try {
    const { session } = await daemon.client.openProject({ cwd })
    writeFileSync(join(cwd, 'file.txt'), 'local uncommitted\n')
    const state = await daemon.client.workspaceGit({ id: session.id })
    const { session: isolated } = await daemon.client.changeWorkspaceGit({ id: session.id, action: 'worktree', name: 'feature/isolated', revision: state.revision })
    expect(isolated.cwd).not.toBe(cwd); expect(isolated.workspaceIdentity).not.toBe(session.workspaceIdentity)
    expect(readFileSync(join(isolated.cwd, 'file.txt'), 'utf8')).toBe('committed\n')
    writeFileSync(join(isolated.cwd, 'file.txt'), 'isolated changes\n')
    expect(readFileSync(join(cwd, 'file.txt'), 'utf8')).toBe('local uncommitted\n')
    const view = await daemon.client.workspaceGit({ id: isolated.id })
    expect(view.local).toBe(cwd); expect(view.current).toBe('feature/isolated'); expect(view.worktrees.length).toBe(2)
    git('restore', 'file.txt')
    const local = await daemon.client.workspaceGit({ id: session.id })
    await expect(daemon.client.changeWorkspaceGit({ id: session.id, action: 'checkout', name: 'feature/isolated', revision: local.revision })).rejects.toMatchObject({ code: 'workspace_branch_busy' })
    await expect(daemon.client.changeWorkspaceGit({ id: session.id, action: 'worktree', name: 'feature/isolated', revision: local.revision })).rejects.toMatchObject({ code: 'workspace_branch' })
    expect(git('branch', '--show-current')).toBe('main')
    await daemon.crash(); daemon = await startDaemon({ home })
    expect((await daemon.client.session({ id: isolated.id })).session.cwd).toBe(isolated.cwd)
    expect((await daemon.client.openProject({ cwd: isolated.cwd })).session.id).toBe(isolated.id)
    expect((await daemon.client.workspaceGit({ id: session.id })).worktrees.some((w) => w.cwd === isolated.cwd)).toBe(true)
  } finally { await daemon.stop() }
}, 45000)

test('concurrent Git changes admit one action, nonrepositories fail clearly, detached and unborn repositories stay usable', async () => {
  const home = tempHome(), { cwd, git } = repository(home), daemon = await startDaemon({ home })
  try {
    const { session } = await daemon.client.openProject({ cwd })
    const view = await daemon.client.workspaceGit({ id: session.id })
    const results = await Promise.allSettled(['first', 'second'].map((name) => daemon.client.changeWorkspaceGit({ id: session.id, action: 'create', name, revision: view.revision })))
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1)
    expect(git('branch', '--list').split('\n').length).toBe(2)
    const { session: scratch } = await daemon.client.createSession({ projectless: true })
    expect((await daemon.client.workspaceGit({ id: scratch.id })).available).toBe(false)
    await expect(daemon.client.changeWorkspaceGit({ id: scratch.id, action: 'create', name: 'nope', revision: '' })).rejects.toMatchObject({ code: 'workspace_git' })
    git('checkout', '--detach')
    const detached = await daemon.client.workspaceGit({ id: session.id })
    expect(detached.current).toBe(''); expect(detached.head).toHaveLength(40)
    git('switch', '--orphan', 'empty')
    const unborn = await daemon.client.workspaceGit({ id: session.id })
    expect(unborn.head).toBe('')
    await expect(daemon.client.changeWorkspaceGit({ id: session.id, action: 'worktree', name: 'no-commit', revision: unborn.revision })).rejects.toMatchObject({ code: 'workspace_head' })
  } finally { await daemon.stop() }
}, 45000)

test('Git navigation refuses a nested directory instead of silently acting on its parent', async () => {
  const home = tempHome(), { cwd } = repository(home)
  try { const nested = join(cwd, 'nested'); mkdirSync(nested); expect((await workspaceGit(nested)).available).toBe(false) }
  finally { rmSync(home, { recursive: true, force: true }) }
})

test('changing a checkout blocks its old native CLI continuation before a new task can run', async () => {
  const home = tempHome(), { cwd } = repository(home)
  writeFileSync(join(home, 'providers.json'), JSON.stringify({ defaultModel: 'cli/chat', providers: [{ id: 'cli', adapter: 'cursor-cli', command: [process.execPath, join(import.meta.dir, 'fixtures/cli-response.ts')], models: [{ id: 'chat', model: 'default', label: 'Fixture', contextWindow: 32768, reservedOutput: 1024 }] }] }))
  const daemon = await startDaemon({ home })
  try {
    const { session } = await daemon.client.openProject({ cwd })
    await daemon.client.prompt({ id: session.id, text: 'before branch change' })
    await until(async () => (await daemon.client.session({ id: session.id })).cliConversation?.status === 'ready', 15000)
    const view = await daemon.client.workspaceGit({ id: session.id })
    const { session: next } = await daemon.client.changeWorkspaceGit({ id: session.id, action: 'create', name: 'fresh-context', revision: view.revision })
    expect((await daemon.client.session({ id: session.id })).cliConversation?.status).toBe('blocked')
    await expect(daemon.client.prompt({ id: session.id, text: 'must not resume' })).rejects.toMatchObject({ code: 'cli_recovery_required' })
    expect((await daemon.client.session({ id: next.id })).cliConversation).toBeNull()
    await daemon.client.prompt({ id: next.id, text: 'fresh branch context' })
    await until(async () => (await daemon.client.session({ id: next.id })).cliConversation?.status === 'ready', 15000)
  } finally { await daemon.stop() }
}, 45000)

test('queued prompts held behind an interrupted native conversation prevent changing its checkout', async () => {
  const home = tempHome(), { cwd } = repository(home)
  writeFileSync(join(home, 'providers.json'), JSON.stringify({ defaultModel: 'cli/chat', providers: [{ id: 'cli', adapter: 'cursor-cli', command: [process.execPath, join(import.meta.dir, 'fixtures/cli-response.ts')], models: [{ id: 'chat', model: 'default', label: 'Fixture', contextWindow: 32768, reservedOutput: 1024 }] }] }))
  const daemon = await startDaemon({ home, env: { HIROSHI_CLI_FIXTURE: 'hang' } })
  try {
    const { session } = await daemon.client.openProject({ cwd })
    await daemon.client.prompt({ id: session.id, text: 'hold this conversation' })
    await until(async () => (await daemon.client.session({ id: session.id })).cliConversation?.status === 'running', 15000)
    await daemon.client.prompt({ id: session.id, text: 'queued for the original checkout', mode: 'queue' })
    await daemon.client.interrupt({ id: session.id, reason: 'test queued checkout protection' })
    await until(async () => (await daemon.client.session({ id: session.id })).cliConversation?.status === 'blocked', 15000)
    expect((await daemon.client.session({ id: session.id })).inbox.some((item) => item.state === 'pending')).toBe(true)
    const view = await daemon.client.workspaceGit({ id: session.id })
    await expect(daemon.client.changeWorkspaceGit({ id: session.id, action: 'create', name: 'must-wait', revision: view.revision })).rejects.toMatchObject({ code: 'workspace_busy' })
  } finally { await daemon.stop() }
}, 45000)
