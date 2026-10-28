import React from 'react'
import { describe, expect, it } from 'vitest'
import { connectTest } from '@gpuix/react/automation'
import { createTestRoot, hasNativeTestRenderer } from '@gpuix/react/testing'
import type { EngineHandle } from '../engine/use-engine'
import type { WorkspaceGit } from '../../engine/src/protocol'
import { initialSnapshot } from '../engine/reducer'
import { GitMenus } from './GitMenus'
import type { App } from '@gpuix/react/automation'

async function settle(app: App) { await app.clock.pause(); await app.clock.fastForward(320); await app.clock.resume() }
async function openMenu(app: App, kind: 'branch' | 'workspace') {
  await app.getByTestId(`git-${kind}`).click(); await app.getByTestId(`git-${kind}-menu`).waitFor()
  await expect.poll(async () => (await app.getByTestId('git-loading').all()).length).toBe(0)
  await settle(app)
}

const state: WorkspaceGit = { available: true, reason: null, root: '/repo', local: '/repo', current: 'main', head: 'abc123', revision: 'rev', dirty: false,
  branches: [{ name: 'main', checkedOut: '/repo' }, { name: 'feature/available', checkedOut: null }, { name: 'feature/busy', checkedOut: '/other' }],
  worktrees: [{ cwd: '/repo', branch: 'main', locked: false, prunable: false }, { cwd: '/other', branch: 'feature/busy', locked: false, prunable: false }] }
async function setup(change: EngineHandle['changeWorkspaceGit'] = async () => {}, opened: string[] = []) {
  const engine = { snapshot: { ...initialSnapshot(), status: 'ready', sessionID: 'one' }, workspaceGit: async () => state,
    changeWorkspaceGit: change, openProject: async (cwd: string) => { opened.push(cwd) } } as unknown as EngineHandle
  const { render, renderer } = createTestRoot({ width: 850, height: 650 })
  render(<div style={{ width: 850, height: 650, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 30 }}><GitMenus engine={engine} cwd="/repo" /></div>)
  const app = await connectTest(renderer)
  await expect.poll(() => app.getByTestId('git-branch').textContent()).toBe('main')
  return app
}
;(hasNativeTestRenderer ? describe : describe.skip)('Git menus', () => {
  it('searches real branches, submits the available branch with its observed revision, and cancels creation', async () => {
    const changes: unknown[] = [], app = await setup(async (value) => { changes.push(value) })
    try {
      await openMenu(app, 'branch'); await app.getByTestId('git-branch-search').waitFor()
      await app.getByTestId('git-branch-search').fill('available'); await app.getByTestId('git-branch-search').press('enter')
      await expect.poll(() => changes).toEqual([{ action: 'checkout', name: 'feature/available', revision: 'rev' }])
      await expect.poll(async () => JSON.stringify(await app.call('getTree', {})).includes('git-branch-menu')).toBe(false)
      await openMenu(app, 'branch'); await app.getByTestId('git-create-branch').waitFor(); await app.getByTestId('git-create-branch').click()
      await app.getByTestId('git-new-name').waitFor(); await settle(app); await app.getByTestId('git-new-name').fill('discarded'); await app.getByTestId('git-new-name').press('escape')
      await app.getByTestId('git-branch-search').waitFor(); expect(changes).toHaveLength(1)
    } finally { await app.close() }
  })
  it('keeps failed branch input and actionable errors, then creates a separate worktree', async () => {
    const changes: unknown[] = []; let fail = true
    const app = await setup(async (value) => { changes.push(value); if (fail) throw new Error('Commit or stash your changes before switching branches.') })
    try {
      await openMenu(app, 'branch'); await app.getByTestId('git-create-branch').waitFor(); await app.getByTestId('git-create-branch').click()
      await app.getByTestId('git-new-name').waitFor(); await settle(app); await app.getByTestId('git-new-name').fill('new-branch'); await app.getByTestId('git-new-name').press('enter')
      await app.getByTestId('git-menu-error').waitFor(); expect(await app.getByTestId('git-menu-error').textContent()).toContain('Commit or stash')
      await expect.poll(async () => (await app.getByTestId('git-loading').all()).length).toBe(0); await settle(app)
      await app.getByTestId('git-new-name').press('escape'); await app.getByTestId('git-branch-search').waitFor(); await settle(app); await app.getByTestId('git-branch-search').press('escape')
      fail = false
      await openMenu(app, 'workspace'); await app.getByTestId('git-new-worktree').waitFor(); await app.getByTestId('git-new-worktree').click()
      await app.getByTestId('git-new-name').waitFor(); await settle(app); await app.getByTestId('git-new-name').fill('isolated'); await app.getByTestId('git-new-name').press('enter')
      await expect.poll(() => changes).toHaveLength(2)
      expect(changes[1]).toEqual({ action: 'worktree', name: 'isolated', revision: 'rev' })
    } finally { await app.close() }
  })
  it('opens an existing worktree through project selection', async () => {
    const opened: string[] = [], app = await setup(undefined, opened)
    try { await openMenu(app, 'workspace'); await app.getByTestId('git-worktree-0').waitFor(); console.log('Git worktree button bounds', await app.getByTestId('git-worktree-0').bounds()); await app.getByTestId('git-worktree-0').click(); await expect.poll(() => opened).toEqual(['/other']) }
    finally { await app.close() }
  })
})
