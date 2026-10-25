import React, { useEffect, useState } from 'react'
import { Button } from '@gpuix/react'
import type { EngineHandle } from '../engine/use-engine'
import type { AgentInfo, ProviderUpdate } from '../../engine/src/protocol'

const ink = '#dddddd', muted = '#969696'
const input = { height: 30, fontSize: 12, color: ink, backgroundColor: '#191919', borderWidth: 1, borderColor: '#383838', borderRadius: 5, padding: 6, flexGrow: 1, minWidth: 0 }
const labels = { unchecked: 'Not checked', missing: 'Missing', unsupported: 'Unsupported', disabled: 'Disabled', installed: 'Installed · sign-in unknown', signed_out: 'Signed out', blocked: 'Policy required', ready: 'Ready · response only' }
function Action({ id, label, disabled, onClick }: { id: string; label: string; disabled?: boolean; onClick: () => void }) {
  return <Button testId={id} disabled={disabled} onClick={onClick} style={{ padding: 7, borderRadius: 5, backgroundColor: '#2c2c2c', flexShrink: 0, cursor: disabled ? undefined : 'pointer' }}>
    <text style={{ fontSize: 12, color: disabled ? '#777777' : ink, whiteSpace: 'nowrap' }}>{label}</text>
  </Button>
}
function AgentRow({ agent, busy, update }: { agent: AgentInfo; busy: boolean; update: (input: Omit<ProviderUpdate, 'revision'>) => Promise<void> }) {
  const [path, setPath] = useState(agent.command?.[0] ?? ''), [entry, setEntry] = useState(agent.command?.[1] ?? ''), [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const signature = agent.command?.join('\0') ?? ''
  useEffect(() => { setPath(agent.command?.[0] ?? ''); setEntry(agent.command?.[1] ?? '') }, [signature])
  const save = (value: Omit<ProviderUpdate, 'revision'>) => { setError(''); void update({ agent: agent.id, ...value }).catch((error) => setError(error.message)) }
  return <div testId={`provider-${agent.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderWidth: 1, borderColor: '#333333', borderRadius: 8, backgroundColor: '#202020' }}>
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <text style={{ fontSize: 15, color: ink, fontWeight: 600, flexGrow: 1, whiteSpace: 'nowrap' }}>{agent.name}</text>
      <text testId={`provider-status-${agent.id}`} style={{ fontSize: 12, color: agent.status === 'ready' ? '#9FCF9F' : muted, whiteSpace: 'nowrap' }}>{labels[agent.status]}</text>
      <Action id={`provider-enable-${agent.id}`} label={agent.enabled ? 'Disable' : 'Enable'} disabled={busy} onClick={() => save({ enabled: !agent.enabled })} />
      <Action id={`provider-setup-${agent.id}`} label={expanded ? 'Hide setup' : 'Setup'} onClick={() => setExpanded(!expanded)} />
    </div>
    <text style={{ fontSize: 12, color: muted }}>{agent.detail}</text>
    <text testId={`provider-evidence-${agent.id}`} style={{ fontSize: 11, color: muted }}>{`${agent.version ? `Version ${agent.version}` : 'Version unknown'} · ${agent.checkedAt ? `Checked ${new Date(agent.checkedAt).toLocaleString()}` : 'Never checked'} · ${agent.source ?? 'No executable'}`}</text>
    {expanded && <>
    <text style={{ fontSize: 11, color: muted }}>Executable path</text>
    <input testId={`provider-path-${agent.id}`} value={path} placeholder="Absolute executable path" style={input} onChange={(event) => setPath(event.value ?? '')} />
    <text style={{ fontSize: 11, color: muted }}>Script entry point (optional, for Node installations)</text>
    <input testId={`provider-entry-${agent.id}`} value={entry} placeholder="Absolute JS entry point, or leave empty" style={input} onChange={(event) => setEntry(event.value ?? '')} />
    <div style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
      <Action id={`provider-save-${agent.id}`} label="Save path" disabled={busy || !path.trim()} onClick={() => save({ command: [path.trim(), ...(entry.trim() ? [entry.trim()] : [])] })} />
      <Action id={`provider-auto-${agent.id}`} label="Use automatic discovery" disabled={busy} onClick={() => save({ command: null })} />
    </div>
    {agent.id === 'cursor' && <>
      <text style={{ fontSize: 11, color: muted }}>Cursor requires workspace trust before reading project context. Enable only for projects you trust.</text>
      <Action id="provider-trust-cursor" label={agent.trustWorkspace ? 'Workspace trust enabled · turn off' : 'Allow workspace trust'} disabled={busy} onClick={() => save({ trustWorkspace: !agent.trustWorkspace })} />
    </>}
    <text style={{ fontSize: 11, color: muted }}>{agent.capabilities.responses ? `Responses · cancellation · ${agent.capabilities.instructions === 'supplied-only' ? 'supplied instructions' : 'native and supplied instructions'}` : 'Response capability not verified'}</text>
    <text style={{ fontSize: 11, color: muted }}>Coding approvals and native conversation continuation are unavailable.</text>
    </>}
    {error && <text testId={`provider-error-${agent.id}`} style={{ fontSize: 12, color: '#F87171' }}>{error}</text>}
  </div>
}
export function ProviderSettings({ engine }: { engine?: EngineHandle }) {
  const state = engine?.snapshot.providers
  const selected = state?.models.find((model) => model.id === state.defaultModel)
  const [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const update = async (value: Omit<ProviderUpdate, 'revision'>) => {
    if (!engine) throw new Error('Provider setup requires a connected desktop engine')
    setSaving(true)
    try { await engine.updateProviders(value) } finally { setSaving(false) }
  }
  const run = (action: () => Promise<void>) => { setError(''); void action().catch((error) => setError(error.message)) }
  const busy = saving || state?.refreshing || engine?.snapshot.status !== 'ready'
  return <div testId="provider-settings" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <text style={{ fontSize: 22, fontWeight: 600, color: ink, flexGrow: 1 }}>Providers</text>
      <Action id="providers-refresh" label={state?.refreshing ? 'Checking…' : 'Refresh'} disabled={!!busy || !state} onClick={() => run(engine!.refreshProviders)} />
      {state?.refreshing && <Action id="providers-cancel" label="Cancel refresh" onClick={() => run(engine!.cancelProviderRefresh)} />}
    </div>
    <text style={{ fontSize: 13, color: muted }}>Refresh checks installed CLIs without sending an AI prompt. Sign in with each CLI's own login flow, then refresh here.</text>
    {!state && <text testId="providers-unavailable" style={{ fontSize: 13, color: muted }}>Provider setup requires a connected desktop engine. No installation or sign-in check has run.</text>}
    {(error || state?.error) && <text testId="providers-error" style={{ fontSize: 12, color: '#F87171' }}>{error || state!.error!}</text>}
    {state && <>
      <text style={{ fontSize: 15, color: ink, fontWeight: 600 }}>Default agent and model</text>
      <text testId="provider-default" style={{ fontSize: 12, color: muted }}>{selected ? `${selected.label}${selected.reason ? ` · ${selected.reason}` : ''}` : `Unavailable selection: ${state.defaultModel}`}</text>
      <Action id="provider-choose-default" label={choosing ? 'Hide model choices' : 'Change default'} disabled={!!busy} onClick={() => setChoosing(!choosing)} />
      {choosing && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflow: 'scroll', flexShrink: 0 }}>
      {state.models.map((model) => <div key={model.id} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <text style={{ flexGrow: 1, fontSize: 12, color: muted }}>{`${model.label}${model.id === state.defaultModel ? ' · current default' : ''}${model.reason ? ` · ${model.reason}` : ''}`}</text>
        <Action id={`provider-default-${model.id}`} label="Use by default" disabled={!!busy || !!model.reason}
          onClick={() => run(async () => { await update({ defaultModel: model.id }); setChoosing(false) })} />
      </div>)}
      </div>}
    </>}
    {state?.agents.map((agent) => <AgentRow key={agent.id} agent={agent} busy={!!busy} update={update} />)}
  </div>
}
