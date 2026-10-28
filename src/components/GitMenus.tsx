import React, { useEffect, useRef, useState } from 'react'
import { Button, Select, SelectContent, SelectTrigger, useGpuix, type PublicInstance } from '@gpuix/react'
import type { EngineHandle } from '../engine/use-engine'
import type { WorkspaceGit } from '../../engine/src/protocol'

const row = { display: 'flex' as const, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, padding: 8, borderRadius: 6, flexShrink: 0, hover: { backgroundColor: '#303030' } }
const text = { fontSize: 12, color: '#dddddd', whiteSpace: 'nowrap' as const }
const paths = { branch: 'M5 2v8a3 3 0 0 0 6 0V7M11 4v1', laptop: 'M3 3h10v8H3zM1 13h14', plus: 'M8 3v10M3 8h10', check: 'm3 8 3 3 7-7' }
function Symbol({ kind }: { kind: keyof typeof paths }) { return <svg style={{ width: 13, height: 13, flexShrink: 0 }} source={`<svg viewBox="0 0 16 16" fill="none" stroke="#999999" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[kind]}"/></svg>`} /> }

export function GitMenus({ engine, cwd }: { engine: EngineHandle; cwd: string }) {
  const [state, setState] = useState<WorkspaceGit | null>(null), [menu, setMenu] = useState<'workspace' | 'branch' | null>(null)
  const [form, setForm] = useState<'create' | 'worktree' | null>(null), [query, setQuery] = useState(''), [name, setName] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [active, setActive] = useState(-1)
  const pending = useRef(false), epoch = useRef(0), trigger = useRef<PublicInstance | null>(null)
  const { renderer } = useGpuix()
  const id = engine.snapshot.sessionID, ready = engine.snapshot.status === 'ready'
  const load = async (clearError = true) => {
    const token = ++epoch.current
    setLoading(true)
    try { const next = await engine.workspaceGit(); if (token === epoch.current) { setState(next); if (clearError) setError('') } }
    catch (e) { if (token === epoch.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (token === epoch.current) setLoading(false) }
  }
  useEffect(() => {
    setState(null); setMenu(null); setError(''); setForm(null)
    if (ready) void load()
    return () => { epoch.current++ }
  }, [cwd, id, ready, engine.workspaceGit])
  const open = (value: 'workspace' | 'branch', next: boolean) => {
    if (pending.current) return
    setMenu(next ? value : null); setForm(null); setQuery(''); setName(''); setActive(-1)
    if (next) void load()
  }
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return
    const token = epoch.current
    pending.current = true; setBusy(true); setError('')
    try { await action(); if (token === epoch.current) { setMenu(null); setForm(null) } }
    catch (e) { if (token === epoch.current) { setError(e instanceof Error ? e.message : String(e)); void load(false) } }
    finally { pending.current = false; setBusy(false) }
  }
  const change = (action: 'checkout' | 'create' | 'worktree', name: string) => {
    if (state) void run(() => engine.changeWorkspaceGit({ action, name, revision: state.revision }))
  }
  const branches = state?.branches.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase())) ?? []
  const local = state?.local === cwd || state?.local.replaceAll('\\', '/').toLowerCase() === cwd.replaceAll('\\', '/').toLowerCase()
  const close = () => { if (!pending.current) { setMenu(null); setForm(null); if (trigger.current) renderer?.focusElement?.(trigger.current.id) } }
  const key = (event: any) => { event.stopPropagation(); if (event.key === 'escape') { event.preventDefault(); if (form) setForm(null); else close() } }
  const disabled = busy || loading || !ready
  const creation = <>
    <div style={{ ...row, padding: 4 }}><Symbol kind="plus" /><text style={{ ...text, fontWeight: 600 }}>{form === 'worktree' ? 'Create a new worktree' : 'Create and checkout new branch'}</text></div>
    <input testId="git-new-name" autoFocus value={name} placeholder="New branch name" disabled={disabled} onChange={(e) => setName(e.value ?? '')}
      onKeyDown={key} onSubmit={() => { if (!disabled && name.trim() && form) change(form, name.trim()) }}
      style={{ height: 35, padding: 9, borderWidth: 1, borderColor: '#3a3a3a', borderRadius: 9, backgroundColor: '#191919', color: '#dddddd', fontSize: 12 }} />
    <text style={{ fontSize: 11, color: '#999999', padding: 4 }}>{busy ? 'Creating workspace…' : form === 'worktree' ? 'Starts from the current commit in a separate folder.' : 'Press Return to create · Esc to cancel'}</text>
  </>
  const footer = <>
    {loading && <text style={{ fontSize: 11, color: '#999999', padding: 4 }}>Reading Git workspace…</text>}
    {!loading && !state?.available && <text style={{ fontSize: 12, color: '#999999', padding: 4 }}>{state?.reason ?? 'Git workspace unavailable.'}</text>}
    {error && <text testId="git-menu-error" style={{ fontSize: 12, color: '#f87171', padding: 4 }}>{error}</text>}
  </>
  return <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
    {(['workspace', 'branch'] as const).map((kind) => <Select key={kind} open={menu === kind} onOpenChange={(next) => open(kind, next)}>
      <SelectTrigger ref={menu === kind ? trigger : undefined} testId={`git-${kind}`} disabled={!ready} style={{ ...row, cursor: 'pointer', padding: 6 }}>
        <Symbol kind={kind === 'workspace' ? 'laptop' : 'branch'} />
        <text style={text}>{kind === 'workspace' ? state?.available && !local ? 'Worktree' : 'Local' : state?.current || (state?.available ? state.head ? `Detached ${state.head.slice(0, 7)}` : 'No commits' : 'Branch')}</text>
      </SelectTrigger>
      <SelectContent testId={`git-${kind}-menu`} side="top" sideOffset={8} onKeyDown={key} style={{ width: form || kind === 'branch' ? 360 : 230, maxWidth: 380, padding: 10, borderRadius: 13, backgroundColor: '#222222', borderWidth: 1, borderColor: '#3a3a3a', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {form ? creation : kind === 'workspace' ? <>
          <text style={{ fontSize: 11, color: '#999999', padding: 3 }}>Work in</text>
          <Button testId="git-local" disabled={disabled || !state?.available || local} onClick={() => state && void run(() => engine.openProject(state.local))} style={row}><Symbol kind="laptop" /><text style={{ ...text, flexGrow: 1 }}>Local</text>{local && <Symbol kind="check" />}</Button>
          {state?.worktrees.filter((w) => w.cwd !== state.local).map((w, at) => <Button key={w.cwd} testId={`git-worktree-${at}`} disabled={disabled || w.prunable || w.locked || w.cwd === cwd} onClick={() => void run(() => engine.openProject(w.cwd))} style={row}><Symbol kind="branch" /><text style={{ ...text, flexGrow: 1 }}>{w.branch || 'Detached worktree'}</text>{w.cwd === cwd && <Symbol kind="check" />}</Button>)}
          <Button testId="git-new-worktree" disabled={disabled || !state?.available || !state.head} onClick={() => { setName(''); setForm('worktree') }} style={row}><Symbol kind="plus" /><text style={text}>New worktree…</text></Button>
        </> : <>
          <input testId="git-branch-search" autoFocus value={query} placeholder="Search branches" onChange={(e) => { setQuery(e.value ?? ''); setActive(-1) }}
            onKeyDown={(event) => { key(event); const d = event.key === 'down' ? 1 : event.key === 'up' ? -1 : 0; if (d && branches.length) { event.preventDefault(); setActive((i) => (i + d + branches.length) % branches.length) } }}
            onSubmit={() => { const b = branches[active < 0 ? 0 : active]; if (b && !disabled && !b.checkedOut) change('checkout', b.name) }}
            style={{ height: 32, padding: 9, backgroundColor: '#191919', borderRadius: 9, color: '#dddddd', fontSize: 12 }} />
          <text style={{ fontSize: 11, color: '#999999', padding: 4 }}>Branches</text>
          <div style={{ maxHeight: 220, overflowY: 'scroll', display: 'flex', flexDirection: 'column' }}>
            {branches.map((b, at) => <Button key={b.name} testId={`git-branch-${at}`} disabled={disabled || !!b.checkedOut} onMouseEnter={() => setActive(at)} onClick={() => change('checkout', b.name)} style={{ ...row, backgroundColor: active === at ? '#303030' : '#00000000' }}>
              <Symbol kind="branch" /><text style={{ ...text, flexGrow: 1, color: b.checkedOut && b.name !== state?.current ? '#777777' : '#dddddd' }}>{b.name}</text>{b.name === state?.current && <Symbol kind="check" />}
            </Button>)}
            {!branches.length && !loading && <text style={{ fontSize: 12, color: '#999999', padding: 8 }}>No matching branches</text>}
          </div>
          <div style={{ height: 1, backgroundColor: '#363636' }} />
          <Button testId="git-create-branch" disabled={disabled || !state?.available} onClick={() => { setForm('create'); setName('') }} style={row}><Symbol kind="plus" /><text style={text}>Create and checkout new branch…</text></Button>
          {state?.dirty && <text style={{ fontSize: 11, color: '#999999', padding: 4 }}>Commit or stash changes before switching branches.</text>}
        </>}
        {footer}
      </SelectContent>
    </Select>)}
  </div>
}
