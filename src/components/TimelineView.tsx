import React, { useState } from 'react'
import { C, FONT } from '../theme'
import { Icon } from '../icons'
import type { Mission, Agent, MissionTurn, ToolCall, SubtaskPlan } from '../types'

interface TimelineViewProps {
  mission: Mission
  agents: Agent[]
  onApproveAction: (turnId: string) => void
  onRejectAction: (turnId: string) => void
}

export function TimelineView({
  mission,
  agents,
  onApproveAction,
  onRejectAction,
}: TimelineViewProps) {
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({
    't-5': true,
  })
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({
    'tc-1': true,
    'tc-2': true,
  })
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const toggleReasoning = (id: string) => {
    setExpandedReasoning((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleCopy = (id: string, text: string) => {
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const getAgent = (agentId?: string): Agent | undefined => {
    return agents.find((a) => a.id === agentId)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        height: '100%',
        minHeight: 0,
        backgroundColor: C.canvas,
      }}
    >
      {/* Scrollable Timeline Stream */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          overflowY: 'scroll',
          paddingTop: 20,
          paddingBottom: 40,
          paddingLeft: 28,
          paddingRight: 28,
          gap: 20,
        }}
      >
        {/* Mission Goal Card */}
        <div
          style={{
            borderRadius: 10,
            backgroundColor: C.surface,
            borderWidth: 1,
            borderColor: C.borderMedium,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  backgroundColor: C.accentSubtle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="sparkle" size={13} color={C.accent} />
              </div>
              <text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: FONT.sans }}>
                Active Swarm Mission
              </text>
            </div>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <text style={{ fontSize: 11, color: C.tertiary, fontFamily: FONT.mono }}>
                Project: {mission.project}
              </text>
            </div>
          </div>

          <text style={{ fontSize: 14.5, fontWeight: '600', color: C.text, fontFamily: FONT.sans, lineHeight: 22 }}>
            {mission.title}
          </text>

          {/* Tags */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {mission.turns[0]?.tags?.map((tag) => (
              <div
                key={tag}
                style={{
                  paddingLeft: 7,
                  paddingRight: 7,
                  paddingTop: 2,
                  paddingBottom: 2,
                  borderRadius: 4,
                  backgroundColor: C.overlayStrong,
                  borderWidth: 1,
                  borderColor: C.border,
                }}
              >
                <text style={{ fontSize: 10, color: C.secondary, fontFamily: FONT.mono }}>
                  #{tag}
                </text>
              </div>
            ))}
          </div>
        </div>

        {/* Turns Stream */}
        {mission.turns.map((turn) => {
          if (turn.kind === 'user_mission') {
            return (
              <div
                key={turn.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignSelf: 'flex-end',
                  maxWidth: 680,
                  backgroundColor: C.surfaceElevated,
                  borderWidth: 1,
                  borderColor: C.borderMedium,
                  borderRadius: 12,
                  paddingTop: 12,
                  paddingBottom: 12,
                  paddingLeft: 16,
                  paddingRight: 16,
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        backgroundColor: C.overlayStrong,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name="laptop" size={10} color={C.secondary} />
                    </div>
                    <text style={{ fontSize: 11, fontWeight: '600', color: C.secondary, fontFamily: FONT.sans }}>
                      Mission Objective
                    </text>
                  </div>
                  <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.mono }}>
                    {turn.timestamp}
                  </text>
                </div>
                <text style={{ fontSize: 13, color: C.text, fontFamily: FONT.sans, lineHeight: 20 }}>
                  {turn.userText}
                </text>
              </div>
            )
          }

          if (turn.kind === 'orchestrator_plan') {
            return (
              <div
                key={turn.id}
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
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        backgroundColor: C.supervisorBg,
                        borderWidth: 1,
                        borderColor: C.supervisor + '40',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name="layers" size={12} color={C.supervisor} />
                    </div>
                    <div>
                      <text style={{ fontSize: 12.5, fontWeight: '700', color: C.text, fontFamily: FONT.sans }}>
                        {turn.planTitle}
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
                      backgroundColor: C.supervisorBg,
                    }}
                  >
                    <text style={{ fontSize: 9.5, fontWeight: '700', color: C.supervisor, fontFamily: FONT.mono }}>
                      SUPERVISOR PLAN
                    </text>
                  </div>
                </div>

                {turn.planObjective && (
                  <text style={{ fontSize: 12, color: C.secondary, fontFamily: FONT.sans, lineHeight: 18 }}>
                    {turn.planObjective}
                  </text>
                )}

                {/* Subtask DAG Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {turn.subtasks?.map((st: SubtaskPlan, idx: number) => {
                    const assignedAgent = getAgent(st.assignedAgentId)
                    const isDone = st.status === 'completed'
                    const isInProgress = st.status === 'in_progress'

                    return (
                      <div
                        key={st.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: 8,
                          paddingBottom: 8,
                          paddingLeft: 10,
                          paddingRight: 10,
                          borderRadius: 6,
                          backgroundColor: C.surfaceElevated,
                          borderWidth: 1,
                          borderColor: isInProgress ? C.accent : C.border,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, flexGrow: 1 }}>
                          <div
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 9,
                              backgroundColor: isDone ? C.successBg : isInProgress ? C.accentSubtle : C.overlay,
                              borderWidth: 1,
                              borderColor: isDone ? C.success : isInProgress ? C.accent : C.tertiary,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {isDone ? (
                              <Icon name="check" size={10} color={C.success} />
                            ) : (
                              <text style={{ fontSize: 9, fontWeight: '700', color: isInProgress ? C.accent : C.tertiary, fontFamily: FONT.mono }}>
                                {idx + 1}
                              </text>
                            )}
                          </div>
                          <text
                            style={{
                              fontSize: 12,
                              color: isDone ? C.secondary : C.text,
                              fontFamily: FONT.sans,
                              textDecoration: isDone ? 'line-through' : undefined,
                            }}
                          >
                            {st.title}
                          </text>
                        </div>

                        {/* Assigned Agent Chip */}
                        {assignedAgent && (
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 5,
                              paddingLeft: 6,
                              paddingRight: 6,
                              paddingTop: 2,
                              paddingBottom: 2,
                              borderRadius: 4,
                              backgroundColor: assignedAgent.color + '18',
                              borderWidth: 1,
                              borderColor: assignedAgent.color + '40',
                            }}
                          >
                            <div
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: 2.5,
                                backgroundColor: assignedAgent.color,
                              }}
                            />
                            <text style={{ fontSize: 10, fontWeight: '600', color: assignedAgent.color, fontFamily: FONT.mono }}>
                              {assignedAgent.name}
                            </text>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }

          if (turn.kind === 'agent_turn') {
            const agent = getAgent(turn.agentId)
            const isReasoningOpen = expandedReasoning[turn.id] ?? false

            return (
              <div
                key={turn.id}
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
                {/* Agent Header */}
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        backgroundColor: (agent?.color ?? C.accent) + '25',
                        borderWidth: 1,
                        borderColor: (agent?.color ?? C.accent) + '60',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <text style={{ fontSize: 12, fontWeight: '700', color: agent?.color ?? C.accent, fontFamily: FONT.mono }}>
                        {agent?.name.slice(0, 1) ?? 'A'}
                      </text>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <text style={{ fontSize: 13, fontWeight: '600', color: C.text, fontFamily: FONT.sans }}>
                          {agent?.name ?? 'Agent'}
                        </text>
                        <div
                          style={{
                            paddingLeft: 5,
                            paddingRight: 5,
                            paddingTop: 1,
                            paddingBottom: 1,
                            borderRadius: 3,
                            backgroundColor: (agent?.color ?? C.tertiary) + '20',
                          }}
                        >
                          <text style={{ fontSize: 9.5, fontWeight: '700', color: agent?.color ?? C.secondary, fontFamily: FONT.mono }}>
                            {agent?.role.toUpperCase()}
                          </text>
                        </div>
                      </div>
                      <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.sans }}>
                        {agent?.model}
                      </text>
                    </div>
                  </div>

                  <text style={{ fontSize: 10.5, color: C.tertiary, fontFamily: FONT.mono }}>
                    {turn.timestamp}
                  </text>
                </div>

                {/* Reasoning Trace (Collapsible Fold) */}
                {turn.reasoning && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div
                      onClick={() => toggleReasoning(turn.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        paddingTop: 3,
                        paddingBottom: 3,
                      }}
                    >
                      <Icon
                        name={isReasoningOpen ? 'chevronDown' : 'chevronRight'}
                        size={11}
                        color={C.tertiary}
                      />
                      <text style={{ fontSize: 11, fontWeight: '500', color: C.secondary, fontFamily: FONT.sans }}>
                        {turn.reasoningDuration ?? 'Thought process'}
                      </text>
                    </div>

                    {isReasoningOpen && (
                      <div
                        style={{
                          paddingTop: 8,
                          paddingBottom: 8,
                          paddingLeft: 12,
                          paddingRight: 12,
                          borderRadius: 6,
                          backgroundColor: C.codeBg,
                          borderLeftWidth: 2,
                          borderColor: agent?.color ?? C.accent,
                        }}
                      >
                        <text style={{ fontSize: 11, color: C.secondary, fontFamily: FONT.mono, lineHeight: 18 }}>
                          {turn.reasoning}
                        </text>
                      </div>
                    )}
                  </div>
                )}

                {/* Agent Message Text */}
                {turn.messageText && (
                  <text style={{ fontSize: 13, color: C.text, fontFamily: FONT.sans, lineHeight: 21 }}>
                    {turn.messageText}
                  </text>
                )}

                {/* Tool Executions */}
                {turn.toolCalls && turn.toolCalls.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {turn.toolCalls.map((tc: ToolCall) => {
                      const isOpen = expandedTools[tc.id] ?? false
                      return (
                        <div
                          key={tc.id}
                          style={{
                            borderRadius: 6,
                            backgroundColor: C.surfaceElevated,
                            borderWidth: 1,
                            borderColor: C.border,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            onClick={() => toggleTool(tc.id)}
                            style={{
                              paddingTop: 7,
                              paddingBottom: 7,
                              paddingLeft: 10,
                              paddingRight: 10,
                              display: 'flex',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer',
                              hover: { backgroundColor: C.overlay },
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Icon
                                name={tc.status === 'success' ? 'check' : 'wrench'}
                                size={12}
                                color={tc.status === 'success' ? C.success : C.accent}
                              />
                              <div
                                style={{
                                  paddingLeft: 5,
                                  paddingRight: 5,
                                  paddingTop: 1.5,
                                  paddingBottom: 1.5,
                                  borderRadius: 4,
                                  backgroundColor: C.overlayStrong,
                                }}
                              >
                                <text style={{ fontSize: 10, fontWeight: '700', color: C.text, fontFamily: FONT.mono }}>
                                  {tc.toolName}
                                </text>
                              </div>
                              <text style={{ fontSize: 11, color: C.secondary, fontFamily: FONT.mono }}>
                                {tc.inputSummary}
                              </text>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              {tc.durationMs && (
                                <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.mono }}>
                                  {tc.durationMs}ms
                                </text>
                              )}
                              <Icon
                                name={isOpen ? 'chevronDown' : 'chevronRight'}
                                size={11}
                                color={C.tertiary}
                              />
                            </div>
                          </div>

                          {isOpen && tc.output && (
                            <div
                              style={{
                                padding: 10,
                                borderTopWidth: 1,
                                borderColor: C.border,
                                backgroundColor: C.codeBg,
                              }}
                            >
                              <text style={{ fontSize: 10.5, color: C.secondary, fontFamily: FONT.mono, lineHeight: 16 }}>
                                {tc.output}
                              </text>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Code Block Card */}
                {turn.codeBlock && (
                  <div
                    style={{
                      borderRadius: 8,
                      backgroundColor: C.codeBg,
                      borderWidth: 1,
                      borderColor: C.borderMedium,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div
                      style={{
                        paddingTop: 6,
                        paddingBottom: 6,
                        paddingLeft: 12,
                        paddingRight: 12,
                        backgroundColor: C.surfaceElevated,
                        borderBottomWidth: 1,
                        borderColor: C.border,
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Icon name="code" size={12} color={C.accent} />
                        <text style={{ fontSize: 11, fontWeight: '600', color: C.text, fontFamily: FONT.mono }}>
                          {turn.codeBlock.filename}
                        </text>
                        <div
                          style={{
                            paddingLeft: 5,
                            paddingRight: 5,
                            paddingTop: 1,
                            paddingBottom: 1,
                            borderRadius: 3,
                            backgroundColor: C.overlay,
                          }}
                        >
                          <text style={{ fontSize: 9.5, color: C.tertiary, fontFamily: FONT.mono }}>
                            {turn.codeBlock.language}
                          </text>
                        </div>
                      </div>

                      <div
                        onClick={() => handleCopy(turn.id, turn.codeBlock?.code ?? '')}
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingLeft: 6,
                          paddingRight: 6,
                          paddingTop: 2,
                          paddingBottom: 2,
                          borderRadius: 4,
                          cursor: 'pointer',
                          backgroundColor: C.overlay,
                          hover: { backgroundColor: C.overlayStrong },
                        }}
                      >
                        <Icon
                          name={copiedId === turn.id ? 'check' : 'copy'}
                          size={11}
                          color={copiedId === turn.id ? C.success : C.secondary}
                        />
                        <text style={{ fontSize: 10, color: copiedId === turn.id ? C.success : C.secondary, fontFamily: FONT.sans }}>
                          {copiedId === turn.id ? 'Copied' : 'Copy'}
                        </text>
                      </div>
                    </div>

                    <code
                      code={turn.codeBlock.code}
                      language={turn.codeBlock.language}
                      showLineNumbers
                      style={{
                        padding: 12,
                        fontSize: 11.5,
                        lineHeight: 18,
                      }}
                    />
                  </div>
                )}

                {/* Diff Patch Card */}
                {turn.diffPatch && (
                  <div
                    style={{
                      borderRadius: 8,
                      backgroundColor: C.codeBg,
                      borderWidth: 1,
                      borderColor: C.borderMedium,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div
                      style={{
                        paddingTop: 6,
                        paddingBottom: 6,
                        paddingLeft: 12,
                        paddingRight: 12,
                        backgroundColor: C.surfaceElevated,
                        borderBottomWidth: 1,
                        borderColor: C.border,
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Icon name="diff" size={12} color={C.success} />
                        <text style={{ fontSize: 11, fontWeight: '600', color: C.text, fontFamily: FONT.mono }}>
                          Diff Patch Preview
                        </text>
                        <text style={{ fontSize: 10.5, color: C.success, fontFamily: FONT.mono }}>
                          +8
                        </text>
                        <text style={{ fontSize: 10.5, color: C.error, fontFamily: FONT.mono }}>
                          -2
                        </text>
                      </div>
                    </div>

                    <diff
                      patch={turn.diffPatch}
                      wordDiff
                      style={{ padding: 10, minHeight: 110 }}
                    />
                  </div>
                )}
              </div>
            )
          }

          if (turn.kind === 'approval_request') {
            const isApproved = turn.approvalStatus === 'approved'
            const isRejected = turn.approvalStatus === 'rejected'

            return (
              <div
                key={turn.id}
                style={{
                  borderRadius: 10,
                  backgroundColor: C.surface,
                  borderWidth: 1.5,
                  borderColor: isApproved ? C.success : isRejected ? C.error : C.warning,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        backgroundColor: isApproved ? C.successBg : isRejected ? C.errorBg : C.warningBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon
                        name={isApproved ? 'check' : isRejected ? 'trash' : 'alertCircle'}
                        size={14}
                        color={isApproved ? C.success : isRejected ? C.error : C.warning}
                      />
                    </div>
                    <text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: FONT.sans }}>
                      {turn.actionTitle}
                    </text>
                  </div>

                  <div
                    style={{
                      paddingLeft: 6,
                      paddingRight: 6,
                      paddingTop: 2,
                      paddingBottom: 2,
                      borderRadius: 4,
                      backgroundColor: C.warningBg,
                    }}
                  >
                    <text style={{ fontSize: 9.5, fontWeight: '700', color: C.warning, fontFamily: FONT.mono }}>
                      {turn.riskLevel?.toUpperCase()} RISK
                    </text>
                  </div>
                </div>

                <div
                  style={{
                    padding: 10,
                    borderRadius: 6,
                    backgroundColor: C.codeBg,
                    borderWidth: 1,
                    borderColor: C.border,
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Icon name="terminal" size={13} color={C.accent} />
                  <text style={{ fontSize: 11.5, color: C.text, fontFamily: FONT.mono }}>
                    {turn.actionCommand}
                  </text>
                </div>

                {/* Approval Action Controls */}
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                  {turn.approvalStatus === 'pending' ? (
                    <>
                      <div
                        onClick={() => onRejectAction(turn.id)}
                        style={{
                          height: 30,
                          paddingLeft: 12,
                          paddingRight: 12,
                          borderRadius: 6,
                          backgroundColor: C.errorBg,
                          borderWidth: 1,
                          borderColor: C.error + '40',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          hover: { backgroundColor: C.errorBg },
                          active: { backgroundColor: C.surfaceElevated },
                        }}
                      >
                        <text style={{ fontSize: 11.5, fontWeight: '600', color: C.error, fontFamily: FONT.sans, pointerEvents: 'none' }}>
                          Reject & Abort
                        </text>
                      </div>

                      <div
                        testId="approve-gate-btn"
                        onClick={() => onApproveAction(turn.id)}
                        style={{
                          height: 30,
                          paddingLeft: 14,
                          paddingRight: 14,
                          borderRadius: 6,
                          backgroundColor: C.success,
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                          hover: { backgroundColor: '#2dc48d' },
                          active: { backgroundColor: '#23a876' },
                        }}
                      >
                        <Icon name="check" size={12} color={C.onAccent} />
                        <text style={{ fontSize: 11.5, fontWeight: '700', color: C.onAccent, fontFamily: FONT.sans, pointerEvents: 'none' }}>
                          Approve Execution
                        </text>
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        paddingLeft: 10,
                        paddingRight: 10,
                        paddingTop: 4,
                        paddingBottom: 4,
                        borderRadius: 6,
                        backgroundColor: isApproved ? C.successBg : C.errorBg,
                      }}
                    >
                      <text style={{ fontSize: 11, fontWeight: '600', color: isApproved ? C.success : C.error, fontFamily: FONT.sans }}>
                        {isApproved ? 'Approved by Operator' : 'Rejected by Operator'}
                      </text>
                    </div>
                  )}
                </div>
              </div>
            )
          }

          if (turn.kind === 'swarm_summary') {
            return (
              <div
                key={turn.id}
                style={{
                  borderRadius: 10,
                  backgroundColor: C.surface,
                  borderWidth: 1,
                  borderColor: C.success + '40',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      backgroundColor: C.successBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="circleCheck" size={14} color={C.success} />
                  </div>
                  <div>
                    <text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: FONT.sans }}>
                      Swarm Mission Completed
                    </text>
                    <text style={{ fontSize: 11, color: C.secondary, fontFamily: FONT.sans }}>
                      All subtasks validated and checked into git branch
                    </text>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <div>
                    <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.mono }}>DURATION</text>
                    <text style={{ fontSize: 12, fontWeight: '600', color: C.text, fontFamily: FONT.mono }}>
                      {turn.summaryStats?.duration}
                    </text>
                  </div>
                  <div>
                    <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.mono }}>TOKENS</text>
                    <text style={{ fontSize: 12, fontWeight: '600', color: C.accent, fontFamily: FONT.mono }}>
                      {turn.summaryStats?.tokensBurned.toLocaleString()}
                    </text>
                  </div>
                  <div>
                    <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.mono }}>TOOLS</text>
                    <text style={{ fontSize: 12, fontWeight: '600', color: C.text, fontFamily: FONT.mono }}>
                      {turn.summaryStats?.toolsExecuted}
                    </text>
                  </div>
                </div>
              </div>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
