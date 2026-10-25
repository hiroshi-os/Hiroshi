import React, { useRef, useState } from 'react'
import { Button, Dialog, DialogPortal, useGpuix, useWindowSize } from '@gpuix/react'
import type { EngineHandle } from '../engine/use-engine'

export function ProjectSwitcher({ engine, cwd, open, onOpen, onClose }: { engine: EngineHandle; cwd: string; open: boolean; onOpen: () => void; onClose: () => void }) {
  const { renderer } = useGpuix(), size = useWindowSize()
  const [path, setPath] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const identity = engine.snapshot.sessions.find((item) => item.id === engine.snapshot.sessionID)?.workspaceIdentity
  const current = engine.snapshot.projects.find((item) => item.cwd === cwd &&
    engine.snapshot.sessions.find((session) => session.id === item.sessionID)?.workspaceIdentity === identity)
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return
    pending.current = true
    setBusy(true); setError('')
    try { await action() } catch (error) { setError(error instanceof Error ? error.message : 'Could not open project folder') }
    finally { pending.current = false; setBusy(false) }
  }
  const choose = (folder: string) => run(async () => { await engine.openProject(folder); setPath(''); onClose() })
  const button = (id: string, label: string, action: () => void, disabled = false) => <Button testId={id} disabled={disabled || busy} onClick={action}
    style={{ padding: 9, borderRadius: 6, backgroundColor: '#2c2c2c', cursor: 'pointer', flexShrink: 0 }}><text style={{ fontSize: 12, color: '#dddddd', whiteSpace: 'nowrap' }}>{label}</text></Button>
  return <>
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', padding: 8, gap: 10, flexShrink: 0 }}>
      {button('open-project', current?.name ?? 'Open project', () => { setError(''); onOpen(); void engine.refreshProjects().catch(() => {}) }, engine.snapshot.status !== 'ready')}
      <text testId="engine-workspace" style={{ fontSize: 11, color: '#929292', flexGrow: 1, minWidth: 0 }}>{cwd}</text>
    </div>
    {current?.detail && <text testId="project-unavailable" style={{ fontSize: 12, color: '#F3BC84', padding: 8 }}>{current.detail}</text>}
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose() }}><DialogPortal {...({ position: { x: 0, y: 0 } } as any)} style={{ width: size.width, height: size.height, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000088' }}>
      <div testId="project-dialog" style={{ width: Math.min(680, size.width - 48), maxHeight: size.height - 80, display: 'flex', flexDirection: 'column', gap: 14, padding: 24, borderRadius: 12, borderWidth: 1, borderColor: '#383838', backgroundColor: '#202020' }}>
        <text style={{ fontSize: 20, color: '#eeeeee', fontWeight: 600 }}>Open project</text>
        <text style={{ fontSize: 12, color: '#a0a0a0' }}>Choose an existing folder. Each task keeps its own project, history and running work.</text>
        {button('project-choose-folder', 'Choose folder…', () => void run(async () => {
          if (!renderer?.promptForPaths) throw new Error('Native folder picker is unavailable. Enter the absolute folder path below.')
          const paths = await renderer.promptForPaths({ files: false, directories: true, multiple: false, prompt: 'Open project' })
          if (!paths?.length) return
          await engine.openProject(paths[0]!); setPath(''); onClose()
        }))}
        <input testId="project-path" value={path} placeholder="Or enter an absolute folder path" onChange={(event) => setPath(event.value ?? '')}
          style={{ height: 34, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#383838', backgroundColor: '#191919', color: '#dddddd', fontSize: 12 }} />
        {error && <text testId="project-error" style={{ fontSize: 12, color: '#F87171' }}>{error}</text>}
        <div style={{ display: 'flex', flexDirection: 'row', gap: 10 }}>
          {button('project-open-path', 'Open folder', () => void choose(path.trim()), !path.trim())}
          {button('project-dialog-cancel', 'Cancel', onClose)}
        </div>
        <text style={{ fontSize: 13, color: '#aaaaaa' }}>Recent projects</text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflow: 'scroll', flexShrink: 0 }}>
          {engine.snapshot.projects.map((item) => <Button key={item.id} testId={`project-recent-${item.id}`} disabled={busy} onClick={() => {
            if (item.status === 'ready') void choose(item.cwd)
            else { engine.selectSession(item.sessionID); onClose() }
          }} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10, borderRadius: 6, backgroundColor: '#292929', flexShrink: 0 }}>
            <text style={{ fontSize: 13, color: '#dddddd', whiteSpace: 'nowrap' }}>{`${item.name}${item.status === 'ready' ? '' : ` · ${item.status}`}`}</text>
            <text style={{ fontSize: 11, color: '#999999' }}>{item.cwd}</text>
          </Button>)}
        </div>
      </div>
    </DialogPortal></Dialog>
  </>
}
