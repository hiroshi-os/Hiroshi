import React, { useState } from 'react'
import { C, FONT } from '../theme'
import { Icon } from '../icons'
import type { Agent } from '../types'

interface FleetViewProps {
  agents: Agent[]
  onUpdateAgentModel: (agentId: string, newModel: string) => void
  onToggleTool: (agentId: string, tool: string) => void
}

const AVAILABLE_MODELS = [
  { id: 'sonnet-3-7', label: 'Sonnet 3.7', full: 'Claude 3.7 Sonnet (Thinking)' },
  { id: 'haiku-3-5', label: 'Haiku 3.5', full: 'Claude 3.5 Haiku' },
  { id: 'deepseek-r1', label: 'DeepSeek R1', full: 'DeepSeek R1' },
  { id: 'gpt-4o', label: 'GPT-4o', full: 'GPT-4o' },
]

export function FleetView({ agents, onUpdateAgentModel, onToggleTool }: FleetViewProps) {
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        height: '100%',
        minHeight: 0,
        backgroundColor: C.canvas,
        overflowY: 'scroll',
        padding: 24,
        gap: 20,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderColor: C.border,
        }}
      >
        <div>
          <text style={{ fontSize: 16, fontWeight: '700', color: C.text, fontFamily: FONT.sans }}>
            Swarm Agent Fleet Roster
          </text>
          <text style={{ fontSize: 12, color: C.secondary, fontFamily: FONT.sans }}>
            Configure agent personas, model assignments, temperature, and tool sandboxing.
          </text>
        </div>

        <div
          style={{
            height: 30,
            paddingLeft: 12,
            paddingRight: 12,
            borderRadius: 6,
            backgroundColor: C.accent,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            hover: { backgroundColor: C.accentHover },
            active: { backgroundColor: C.accent },
          }}
        >
          <Icon name="plus" size={12} color={C.onAccent} />
          <text style={{ fontSize: 11.5, fontWeight: '700', color: C.onAccent, fontFamily: FONT.sans }}>
            Provision Specialist
          </text>
        </div>
      </div>

      {/* Agents Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {agents.map((agent) => {
          return (
            <div
              key={agent.id}
              style={{
                borderRadius: 10,
                backgroundColor: C.surface,
                borderWidth: 1,
                borderColor: C.borderMedium,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: agent.color + '25',
                      borderWidth: 1,
                      borderColor: agent.color + '60',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <text style={{ fontSize: 14, fontWeight: '700', color: agent.color, fontFamily: FONT.mono }}>
                      {agent.name.slice(0, 1)}
                    </text>
                  </div>

                  <div>
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: FONT.sans }}>
                        {agent.name}
                      </text>
                      <div
                        style={{
                          paddingLeft: 6,
                          paddingRight: 6,
                          paddingTop: 1.5,
                          paddingBottom: 1.5,
                          borderRadius: 4,
                          backgroundColor: agent.color + '20',
                        }}
                      >
                        <text style={{ fontSize: 10, fontWeight: '700', color: agent.color, fontFamily: FONT.mono }}>
                          {agent.role.toUpperCase()}
                        </text>
                      </div>
                    </div>
                    <text style={{ fontSize: 11, color: C.secondary, fontFamily: FONT.sans }}>
                      {agent.title}
                    </text>
                  </div>
                </div>

                {/* Model Selector Strip */}
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {AVAILABLE_MODELS.map((m) => {
                    const isCurrent = agent.model.includes(m.label.split(' ')[0]) || agent.model === m.full
                    return (
                      <div
                        key={m.id}
                        onClick={() => onUpdateAgentModel(agent.id, m.full)}
                        style={{
                          paddingLeft: 8,
                          paddingRight: 8,
                          paddingTop: 3,
                          paddingBottom: 3,
                          borderRadius: 5,
                          backgroundColor: isCurrent ? C.accentSubtle : C.surfaceElevated,
                          borderWidth: 1,
                          borderColor: isCurrent ? C.accent : C.border,
                          cursor: 'pointer',
                          hover: { backgroundColor: C.surfaceHighlight },
                        }}
                      >
                        <text
                          style={{
                            fontSize: 10.5,
                            fontWeight: isCurrent ? '700' : '500',
                            color: isCurrent ? C.accent : C.secondary,
                            fontFamily: FONT.mono,
                          }}
                        >
                          {m.label}
                        </text>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Tools Badges */}
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.mono }}>
                  TOOLS:
                </text>
                {agent.tools.map((tool) => (
                  <div
                    key={tool}
                    onClick={() => onToggleTool(agent.id, tool)}
                    style={{
                      paddingLeft: 7,
                      paddingRight: 7,
                      paddingTop: 2,
                      paddingBottom: 2,
                      borderRadius: 4,
                      backgroundColor: C.surfaceElevated,
                      borderWidth: 1,
                      borderColor: C.border,
                      cursor: 'pointer',
                      hover: { borderColor: agent.color },
                    }}
                  >
                    <text style={{ fontSize: 10.5, color: C.secondary, fontFamily: FONT.mono }}>
                      {tool}
                    </text>
                  </div>
                ))}
              </div>

              {/* System Prompt Bar */}
              <div
                style={{
                  padding: 10,
                  borderRadius: 6,
                  backgroundColor: C.codeBg,
                  borderWidth: 1,
                  borderColor: C.border,
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <text style={{ fontSize: 11, color: C.secondary, fontFamily: FONT.mono, lineHeight: 17, flexGrow: 1 }}>
                  {agent.systemPrompt}
                </text>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
