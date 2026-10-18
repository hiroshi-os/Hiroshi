import React, { useState } from 'react'
import { C, FONT } from '../theme'
import { Icon } from '../icons'
import type { Agent, SwarmTopologyNode } from '../types'

interface TopologyViewProps {
  agents: Agent[]
  topologyNodes: SwarmTopologyNode[]
}

export function TopologyView({ agents, topologyNodes }: TopologyViewProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>('agent-supervisor')

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? agents[0]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexGrow: 1,
        height: '100%',
        minHeight: 0,
        backgroundColor: C.canvas,
      }}
    >
      {/* Topology Canvas Area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          padding: 24,
          gap: 16,
          overflowY: 'scroll',
        }}
      >
        {/* Banner */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderColor: C.border,
          }}
        >
          <div>
            <text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: FONT.sans }}>
              Swarm Topology & Communication DAG
            </text>
            <text style={{ fontSize: 11, color: C.secondary, fontFamily: FONT.sans }}>
              Hierarchical delegation protocol • 0-lock memory bus • Real-time event propagation
            </text>
          </div>

          <div
            style={{
              paddingLeft: 8,
              paddingRight: 8,
              paddingTop: 3,
              paddingBottom: 3,
              borderRadius: 6,
              backgroundColor: C.overlayStrong,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.success }} />
            <text style={{ fontSize: 10.5, fontWeight: '600', color: C.text, fontFamily: FONT.mono }}>
              P2P BUS HEALTHY (120 FPS)
            </text>
          </div>
        </div>

        {/* Supervisor Node (Root of the DAG) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {topologyNodes
            .filter((n) => n.role === 'supervisor')
            .map((node) => {
              const isSelected = selectedAgentId === node.agentId
              const agent = agents.find((a) => a.id === node.agentId)

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedAgentId(node.agentId)}
                  style={{
                    width: 320,
                    borderRadius: 10,
                    backgroundColor: C.surfaceElevated,
                    borderWidth: 1.5,
                    borderColor: isSelected ? C.supervisor : C.borderMedium,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    cursor: 'pointer',
                    hover: { backgroundColor: C.surfaceHighlight },
                    active: { backgroundColor: C.surfaceElevated },
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          backgroundColor: C.supervisorBg,
                          borderWidth: 1,
                          borderColor: C.supervisor + '60',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name="sparkle" size={14} color={C.supervisor} />
                      </div>
                      <div>
                        <text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: FONT.sans }}>
                          {node.label}
                        </text>
                        <text style={{ fontSize: 10, color: C.supervisor, fontFamily: FONT.mono }}>
                          SUPERVISOR ORCHESTRATOR
                        </text>
                      </div>
                    </div>

                    <div
                      style={{
                        paddingLeft: 6,
                        paddingRight: 6,
                        paddingTop: 2,
                        paddingBottom: 2,
                        borderRadius: 4,
                        backgroundColor: C.overlayStrong,
                      }}
                    >
                      <text style={{ fontSize: 10, color: C.accent, fontFamily: FONT.mono }}>
                        {node.throughput}
                      </text>
                    </div>
                  </div>

                  <text style={{ fontSize: 11.5, color: C.secondary, fontFamily: FONT.sans, lineHeight: 16 }}>
                    {node.activeTask}
                  </text>
                </div>
              )
            })}

          {/* Connection Pipe Indicator */}
          <div
            style={{
              width: 2,
              height: 24,
              backgroundColor: C.borderStrong,
            }}
          />
        </div>

        {/* Worker Tier Nodes */}
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
          {topologyNodes
            .filter((n) => n.role !== 'supervisor')
            .map((node) => {
              const isSelected = selectedAgentId === node.agentId
              const agent = agents.find((a) => a.id === node.agentId)
              const color = agent?.color ?? C.accent

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedAgentId(node.agentId)}
                  style={{
                    width: 220,
                    borderRadius: 9,
                    backgroundColor: C.surface,
                    borderWidth: 1.5,
                    borderColor: isSelected ? color : C.border,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    cursor: 'pointer',
                    hover: { backgroundColor: C.surfaceElevated },
                    active: { backgroundColor: C.surfaceHighlight },
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          backgroundColor: color + '20',
                          borderWidth: 1,
                          borderColor: color + '50',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <text style={{ fontSize: 11, fontWeight: '700', color, fontFamily: FONT.mono }}>
                          {node.label.slice(0, 1)}
                        </text>
                      </div>
                      <div>
                        <text style={{ fontSize: 12.5, fontWeight: '600', color: C.text, fontFamily: FONT.sans }}>
                          {node.label}
                        </text>
                        <text style={{ fontSize: 9.5, color, fontFamily: FONT.mono }}>
                          {node.role.toUpperCase()}
                        </text>
                      </div>
                    </div>

                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 3.5,
                        backgroundColor:
                          node.status === 'executing'
                            ? C.accent
                            : node.status === 'done'
                            ? C.success
                            : C.warning,
                      }}
                    />
                  </div>

                  <text style={{ fontSize: 11, color: C.secondary, fontFamily: FONT.sans, lineHeight: 16 }}>
                    {node.activeTask}
                  </text>

                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, borderTopWidth: 1, borderColor: C.border }}>
                    <text style={{ fontSize: 9.5, color: C.tertiary, fontFamily: FONT.mono }}>THROUGHPUT</text>
                    <text style={{ fontSize: 10, fontWeight: '600', color: C.text, fontFamily: FONT.mono }}>
                      {node.throughput}
                    </text>
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* Selected Agent Inspector Drawer */}
      {selectedAgent && (
        <div
          style={{
            width: 320,
            borderLeftWidth: 1,
            borderColor: C.border,
            backgroundColor: C.surface,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            flexShrink: 0,
            overflowY: 'scroll',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: selectedAgent.color + '25',
                  borderWidth: 1,
                  borderColor: selectedAgent.color + '60',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <text style={{ fontSize: 14, fontWeight: '700', color: selectedAgent.color, fontFamily: FONT.mono }}>
                  {selectedAgent.name.slice(0, 1)}
                </text>
              </div>
              <div>
                <text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: FONT.sans }}>
                  {selectedAgent.name}
                </text>
                <text style={{ fontSize: 11, color: selectedAgent.color, fontFamily: FONT.mono }}>
                  {selectedAgent.title}
                </text>
              </div>
            </div>
          </div>

          {/* Model & Config Strip */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.mono }}>
                UNDERLYING MODEL
              </text>
              <div
                style={{
                  marginTop: 4,
                  padding: 8,
                  borderRadius: 6,
                  backgroundColor: C.surfaceElevated,
                  borderWidth: 1,
                  borderColor: C.border,
                }}
              >
                <text style={{ fontSize: 12, fontWeight: '600', color: C.text, fontFamily: FONT.sans }}>
                  {selectedAgent.model}
                </text>
              </div>
            </div>

            {/* Context Tokens Usage */}
            <div>
              <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.mono }}>CONTEXT WINDOW</text>
                <text style={{ fontSize: 10, color: C.secondary, fontFamily: FONT.mono }}>
                  {selectedAgent.contextTokens.toLocaleString()} / {selectedAgent.maxContextTokens.toLocaleString()}
                </text>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: C.overlayStrong,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.round((selectedAgent.contextTokens / selectedAgent.maxContextTokens) * 100)}%`,
                    backgroundColor: selectedAgent.color,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Enabled Tools */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.mono }}>
                GRANTED TOOLS
              </text>
              <div
                style={{
                  paddingLeft: 4,
                  paddingRight: 4,
                  paddingTop: 1,
                  paddingBottom: 1,
                  borderRadius: 3,
                  backgroundColor: C.overlayStrong,
                }}
              >
                <text style={{ fontSize: 9.5, color: C.secondary, fontFamily: FONT.mono }}>
                  {selectedAgent.tools.length}
                </text>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {selectedAgent.tools.map((tool) => (
                <div
                  key={tool}
                  style={{
                    paddingLeft: 7,
                    paddingRight: 7,
                    paddingTop: 3,
                    paddingBottom: 3,
                    borderRadius: 4,
                    backgroundColor: C.surfaceElevated,
                    borderWidth: 1,
                    borderColor: C.border,
                  }}
                >
                  <text style={{ fontSize: 10.5, color: C.secondary, fontFamily: FONT.mono }}>
                    {tool}
                  </text>
                </div>
              ))}
            </div>
          </div>

          {/* System Prompt Excerpt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.mono }}>
              SYSTEM INSTRUCTION
            </text>
            <div
              style={{
                padding: 10,
                borderRadius: 6,
                backgroundColor: C.codeBg,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <text style={{ fontSize: 11, color: C.secondary, fontFamily: FONT.mono, lineHeight: 17 }}>
                {selectedAgent.systemPrompt}
              </text>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
