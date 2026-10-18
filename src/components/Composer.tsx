import React, { useState } from 'react'
import { C, FONT } from '../theme'
import { Icon } from '../icons'
import type { Agent } from '../types'

interface ComposerProps {
  onDispatchMission: (prompt: string, targetAgentId?: string) => void
  agents: Agent[]
}

export function Composer({ onDispatchMission, agents }: ComposerProps) {
  const [promptText, setPromptText] = useState('')
  const [selectedAgentTarget, setSelectedAgentTarget] = useState<string>('all')
  const [mode, setMode] = useState<'swarm' | 'sequential' | 'supervised'>('swarm')

  const handleSend = () => {
    if (!promptText.trim()) return
    onDispatchMission(
      promptText.trim(),
      selectedAgentTarget === 'all' ? undefined : selectedAgentTarget
    )
    setPromptText('')
  }

  return (
    <div
      testId="composer"
      style={{
        paddingTop: 10,
        paddingBottom: 14,
        paddingLeft: 20,
        paddingRight: 20,
        backgroundColor: C.composer,
        borderTopWidth: 1,
        borderColor: C.border,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flexShrink: 0,
      }}
    >
      {/* Top Chips Strip: Target Agent + Mode */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/* Target Chip */}
          <div
            onClick={() => {
              const targets = ['all', ...agents.map((a) => a.id)]
              const currIdx = targets.indexOf(selectedAgentTarget)
              setSelectedAgentTarget(targets[(currIdx + 1) % targets.length])
            }}
            style={{
              paddingLeft: 8,
              paddingRight: 8,
              paddingTop: 3,
              paddingBottom: 3,
              borderRadius: 5,
              backgroundColor: C.surfaceElevated,
              borderWidth: 1,
              borderColor: C.borderMedium,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              cursor: 'pointer',
              hover: { backgroundColor: C.surfaceHighlight },
            }}
          >
            <Icon name="bot" size={11} color={C.accent} />
            <text style={{ fontSize: 11, fontWeight: '600', color: C.text, fontFamily: FONT.sans }}>
              Target:{' '}
              {selectedAgentTarget === 'all'
                ? 'Autonomous Swarm'
                : agents.find((a) => a.id === selectedAgentTarget)?.name}
            </text>
          </div>

          {/* Mode Chip */}
          <div
            onClick={() => {
              setMode(mode === 'swarm' ? 'sequential' : mode === 'sequential' ? 'supervised' : 'swarm')
            }}
            style={{
              paddingLeft: 8,
              paddingRight: 8,
              paddingTop: 3,
              paddingBottom: 3,
              borderRadius: 5,
              backgroundColor: C.surfaceElevated,
              borderWidth: 1,
              borderColor: C.borderMedium,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              cursor: 'pointer',
              hover: { backgroundColor: C.surfaceHighlight },
            }}
          >
            <Icon name="zap" size={11} color={C.secondary} />
            <text style={{ fontSize: 11, color: C.secondary, fontFamily: FONT.sans }}>
              Mode: {mode === 'swarm' ? 'Auto-DAG' : mode === 'sequential' ? 'Sequential' : 'Supervised'}
            </text>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.mono }}>
            Press Enter to dispatch
          </text>
        </div>
      </div>

      {/* Main Input Field & Send Action */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: C.canvas,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: C.borderStrong,
          paddingLeft: 12,
          paddingRight: 6,
          height: 38,
          gap: 8,
        }}
      >
        <input
          value={promptText}
          onChange={(e) => setPromptText(e.value ?? '')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSend()
            }
          }}
          placeholder="Direct Hiroshi swarm, describe mission goal, or instruct an agent..."
          style={{
            flexGrow: 1,
            minWidth: 0,
            fontSize: 12.5,
            color: C.text,
            backgroundColor: 'transparent',
            fontFamily: FONT.sans,
          }}
        />

        <div
          testId="composer-send-btn"
          onClick={handleSend}
          style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            backgroundColor: promptText.trim() ? C.accent : C.overlayStrong,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: promptText.trim() ? 'pointer' : 'default',
            hover: promptText.trim() ? { backgroundColor: C.accentHover } : undefined,
            active: promptText.trim() ? { backgroundColor: C.accent } : undefined,
          }}
        >
          <Icon
            name="arrowUp"
            size={13}
            color={promptText.trim() ? C.onAccent : C.tertiary}
          />
        </div>
      </div>
    </div>
  )
}
