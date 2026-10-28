/** Bounded, argument-only Git navigation. Never discard or carry dirty files. */
import { createHash } from 'node:crypto'
import { mkdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { git } from './workspace'
import { conflict, invalid } from './errors'
import type { WorkspaceGit } from './protocol'

async function checked(cwd: string, args: string[]) {
  const result = await git(cwd, args)
  if (result.code !== 0 || result.truncated) throw invalid('workspace_git', result.truncated ? 'Git exceeded its time or output limit. Refresh the workspace.' : result.stderr.toString().trim().slice(0, 500) || 'Git could not complete this action.')
  return result.stdout.toString()
}
export async function workspaceGit(cwd: string): Promise<WorkspaceGit> {
  const root = await git(cwd, ['rev-parse', '--show-toplevel'])
  const empty: WorkspaceGit = { available: false, reason: 'Open a Git repository root to select branches and worktrees.', root: cwd, local: cwd, current: '', head: '', revision: '', dirty: false, branches: [], worktrees: [] }
  if (root.code !== 0) return empty
  if (root.truncated || await realpath(root.stdout.toString().trim()) !== await realpath(cwd)) return empty
  const trees = await checked(cwd, ['worktree', 'list', '--porcelain', '-z'])
  const worktrees = await Promise.all(trees.split('\0\0').filter(Boolean).map(async (record) => {
    const fields = record.split('\0')
    const directory = fields.find((f) => f.startsWith('worktree '))?.slice(9) ?? ''
    return { cwd: directory ? await realpath(directory).catch(() => directory) : '', branch: fields.find((f) => f.startsWith('branch refs/heads/'))?.slice(18) ?? '', locked: fields.some((f) => f.startsWith('locked')), prunable: fields.some((f) => f.startsWith('prunable')) }
  })).then((items) => items.filter((item) => item.cwd))
  const current = (await git(cwd, ['symbolic-ref', '--short', '-q', 'HEAD'])).stdout.toString().trim()
  const head = (await git(cwd, ['rev-parse', '--verify', 'HEAD'])).stdout.toString().trim()
  const refs = await checked(cwd, ['for-each-ref', '--format=%(refname:strip=2)', 'refs/heads/'])
  const status = await checked(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=normal'])
  const branches = refs.split('\n').filter(Boolean).map((name) => ({ name, checkedOut: worktrees.find((item) => item.branch === name)?.cwd ?? null }))
  const revision = createHash('sha256').update(JSON.stringify([trees, current, head, refs, status])).digest('hex')
  return { ...empty, available: true, reason: null, local: worktrees[0]?.cwd ?? cwd, current, head, revision, dirty: !!status, branches, worktrees }
}
export async function changeWorkspaceGit(cwd: string, home: string, input: { action: 'checkout' | 'create' | 'worktree'; name: string; revision: string }, assertIdle: () => void) {
  if (!['checkout', 'create', 'worktree'].includes(input.action) || typeof input.name !== 'string' || !input.name || input.name.length > 200 || input.name !== input.name.trim() || input.name.startsWith('-') || typeof input.revision !== 'string') throw invalid('workspace_git_input', 'Choose a valid branch name and refresh the branch list.')
  if ((await checked(cwd, ['check-ref-format', '--branch', input.name])).trim() !== input.name) throw invalid('workspace_branch', 'Use a literal branch name rather than a checkout shorthand.')
  const state = await workspaceGit(cwd)
  if (!state.available) throw invalid('workspace_git', state.reason!)
  if (input.revision !== state.revision) throw conflict('workspace_changed', 'The repository changed. Refresh before trying again.')
  if (input.action !== 'worktree' && state.dirty) throw conflict('workspace_dirty', 'Commit or stash your changes before switching branches.')
  const branch = state.branches.find((b) => b.name === input.name)
  if (input.action === 'checkout' && !branch) throw invalid('workspace_branch', 'This branch no longer exists.')
  if (input.action !== 'checkout' && branch) throw conflict('workspace_branch', 'This branch already exists. Choose a different name.')
  if (input.action === 'checkout' && branch?.checkedOut && branch.name !== state.current) throw conflict('workspace_branch_busy', 'This branch is checked out in another worktree.')
  if (input.action === 'worktree' && !state.head) throw invalid('workspace_head', 'Create the first commit before adding a worktree.')
  assertIdle()
  if (input.action === 'worktree') {
    // A random task directory prevents collisions, path traversal and adoption
    // of unrelated folders. Git owns creation of the final directory.
    const parent = path.join(home, 'workspaces', 'git')
    await mkdir(parent, { recursive: true })
    const target = path.join(parent, crypto.randomUUID())
    assertIdle()
    await checked(cwd, ['-c', 'core.hooksPath=', 'worktree', 'add', '-b', input.name, '--', target, state.head])
    return target
  }
  await checked(cwd, ['-c', 'core.hooksPath=', 'switch', '--no-guess', ...(input.action === 'create' ? ['-c'] : []), input.name])
  return cwd
}
