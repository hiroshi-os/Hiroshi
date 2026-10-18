import React, { useState } from 'react'
import { C, FONT } from '../theme'
import { Icon, type IconName } from '../icons'
import type { Mission, Agent } from '../types'

interface SidebarProps {
  missions: Mission[]
  activeMissionId: string
  onSelectMission: (id: string) => void
  onNewMission: () => void
  agents: Agent[]
  onOpenFleet: () => void
}

export function Sidebar({
  missions,
  activeMissionId,
  onSelectMission,
  onNewMission,
  agents,
  onOpenFleet,
}: SidebarProps) {
  const [search, setSearch] = useState('')

  const filteredMissions = missions.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.project.toLowerCase().includes(search.toLowerCase())
  )

  const activeMissions = filteredMissions.filter((m) => m.status === 'running')
  const completedMissions = filteredMissions.filter((m) => m.status === 'completed' || m.status === 'idle')

  return (
    <div
      style={{
        width: 260,
        height: '100%',
        backgroundColor: C.sidebar,
        borderRightWidth: 1,
        borderColor: C.sidebarBorder,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Brand & Swarm Engine Indicator */}
      <div
        style={{
          paddingTop: 18,
          paddingBottom: 14,
          paddingLeft: 16,
          paddingRight: 16,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottomWidth: 1,
          borderColor: C.border,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              backgroundColor: C.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="sparkle" size={15} color={C.onAccent} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <text style={{ fontSize: 13.5, fontWeight: '700', color: C.text, fontFamily: FONT.sans }}>
                Hiroshi
              </text>
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
                <text style={{ fontSize: 9.5, fontWeight: '600', color: C.accent, fontFamily: FONT.mono }}>
                  GPU
                </text>
              </div>
            </div>
            <text style={{ fontSize: 10.5, color: C.tertiary, fontFamily: FONT.sans }}>
              Multi-Agent Orchestrator
            </text>
          </div>
        </div>

        {/* Global Agent Fleet Button */}
        <div
          onClick={onOpenFleet}
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backgroundColor: C.overlay,
            hover: { backgroundColor: C.overlayStrong },
          }}
        >
          <Icon name="network" size={13} color={C.secondary} />
        </div>
      </div>

      {/* Action Strip: New Mission + Search */}
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          onClick={onNewMission}
          style={{
            height: 32,
            borderRadius: 7,
            backgroundColor: C.surfaceElevated,
            borderWidth: 1,
            borderColor: C.borderMedium,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 10,
            paddingRight: 10,
            cursor: 'pointer',
            hover: { backgroundColor: C.surfaceHighlight, borderColor: C.accent },
            active: { backgroundColor: C.surfaceElevated },
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="plus" size={13} color={C.accent} />
            <text style={{ fontSize: 12, fontWeight: '600', color: C.text, fontFamily: FONT.sans }}>
              New Swarm Mission
            </text>
          </div>
          <div
            style={{
              paddingLeft: 4,
              paddingRight: 4,
              paddingTop: 1,
              paddingBottom: 1,
              borderRadius: 3,
              backgroundColor: C.overlay,
            }}
          >
            <text style={{ fontSize: 9.5, color: C.tertiary, fontFamily: FONT.mono }}>
              ⌘N
            </text>
          </div>
        </div>

        {/* Search / Filter */}
        <div
          style={{
            height: 28,
            borderRadius: 6,
            backgroundColor: C.surface,
            borderWidth: 1,
            borderColor: C.border,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 8,
            paddingRight: 8,
            gap: 6,
          }}
        >
          <Icon name="search" size={12} color={C.tertiary} />
          <input
            value={search}
            onChange={(e) => setSearch(e.value ?? '')}
            placeholder="Filter swarms & missions..."
            style={{
              fontSize: 11,
              color: C.text,
              backgroundColor: 'transparent',
              flexGrow: 1,
              minWidth: 0,
            }}
          />
        </div>
      </div>

      {/* Missions List */}
      <div
        style={{
          flexGrow: 1,
          overflowY: 'scroll',
          paddingLeft: 10,
          paddingRight: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Active Swarms */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              paddingLeft: 6,
              paddingRight: 6,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <text style={{ fontSize: 10.5, fontWeight: '700', color: C.tertiary, fontFamily: FONT.sans }}>
                ACTIVE SWARMS
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
                <text style={{ fontSize: 9.5, fontWeight: '700', color: C.secondary, fontFamily: FONT.mono }}>
                  {activeMissions.length}
                </text>
              </div>
            </div>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: C.success,
              }}
            />
          </div>

          {activeMissions.map((mission) => {
            const isSelected = mission.id === activeMissionId
            return (
              <div
                key={mission.id}
                testId={`mission-${mission.id}`}
                onClick={() => onSelectMission(mission.id)}
                style={{
                  paddingTop: 8,
                  paddingBottom: 8,
                  paddingLeft: 10,
                  paddingRight: 10,
                  borderRadius: 8,
                  backgroundColor: isSelected ? C.surfaceElevated : 'transparent',
                  borderWidth: 1,
                  borderColor: isSelected ? C.borderMedium : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  hover: isSelected ? undefined : { backgroundColor: C.overlay },
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: isSelected ? C.accent : C.success,
                      flexShrink: 0,
                    }}
                  />
                  <text
                    style={{
                      fontSize: 12,
                      fontWeight: isSelected ? '600' : '500',
                      color: isSelected ? C.text : C.secondary,
                      fontFamily: FONT.sans,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {mission.title}
                  </text>
                </div>

                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <div
                      style={{
                        paddingLeft: 4,
                        paddingRight: 4,
                        paddingTop: 1,
                        paddingBottom: 1,
                        borderRadius: 3,
                        backgroundColor: C.overlay,
                      }}
                    >
                      <text style={{ fontSize: 9.5, color: C.tertiary, fontFamily: FONT.mono }}>
                        {mission.project}
                      </text>
                    </div>
                    <text style={{ fontSize: 9.5, color: C.ghost, fontFamily: FONT.sans }}>
                      {mission.activeFleet.length} agents
                    </text>
                  </div>
                  <text style={{ fontSize: 9.5, color: C.tertiary, fontFamily: FONT.mono }}>
                    {mission.createdAt}
                  </text>
                </div>
              </div>
            )
          })}
        </div>

        {/* Prior Missions / Archive */}
        {completedMissions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ paddingLeft: 6, paddingRight: 6, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <text style={{ fontSize: 10.5, fontWeight: '700', color: C.tertiary, fontFamily: FONT.sans }}>
                RECENT MISSIONS
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
                <text style={{ fontSize: 9.5, fontWeight: '700', color: C.secondary, fontFamily: FONT.mono }}>
                  {completedMissions.length}
                </text>
              </div>
            </div>

            {completedMissions.map((mission) => {
              const isSelected = mission.id === activeMissionId
              return (
                <div
                  key={mission.id}
                  testId={`mission-${mission.id}`}
                  onClick={() => onSelectMission(mission.id)}
                  style={{
                    paddingTop: 8,
                    paddingBottom: 8,
                    paddingLeft: 10,
                    paddingRight: 10,
                    borderRadius: 8,
                    backgroundColor: isSelected ? C.surfaceElevated : 'transparent',
                    borderWidth: 1,
                    borderColor: isSelected ? C.borderMedium : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    hover: isSelected ? undefined : { backgroundColor: C.overlay },
                  }}
                >
                  <text
                    style={{
                      fontSize: 12,
                      fontWeight: isSelected ? '600' : '500',
                      color: isSelected ? C.text : C.secondary,
                      fontFamily: FONT.sans,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {mission.title}
                  </text>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <div
                        style={{
                          paddingLeft: 4,
                          paddingRight: 4,
                          paddingTop: 1,
                          paddingBottom: 1,
                          borderRadius: 3,
                          backgroundColor: C.overlay,
                        }}
                      >
                        <text style={{ fontSize: 9.5, color: C.tertiary, fontFamily: FONT.mono }}>
                          {mission.project}
                        </text>
                      </div>
                      <text style={{ fontSize: 9.5, color: C.ghost, fontFamily: FONT.sans }}>
                        completed
                      </text>
                    </div>
                    <text style={{ fontSize: 9.5, color: C.tertiary, fontFamily: FONT.mono }}>
                      {mission.createdAt}
                    </text>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Swarm Fleet Status Bar */}
      <div
        style={{
          padding: 12,
          borderTopWidth: 1,
          borderColor: C.sidebarBorder,
          backgroundColor: C.surface,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="bot" size={13} color={C.secondary} />
            <text style={{ fontSize: 11, fontWeight: '600', color: C.text, fontFamily: FONT.sans }}>
              Swarm Fleet
            </text>
          </div>
          <div
            onClick={onOpenFleet}
            style={{
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 2,
              paddingBottom: 2,
              borderRadius: 4,
              backgroundColor: C.overlayStrong,
              cursor: 'pointer',
              hover: { backgroundColor: C.surfaceHighlight },
            }}
          >
            <text style={{ fontSize: 10, fontWeight: '600', color: C.accent, fontFamily: FONT.mono }}>
              5 Online
            </text>
          </div>
        </div>

        {/* Micro avatar fleet strip */}
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {agents.map((agent) => (
            <div
              key={agent.id}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                backgroundColor: agent.color + '25',
                borderWidth: 1,
                borderColor: agent.color + '60',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <text style={{ fontSize: 10, fontWeight: '700', color: agent.color, fontFamily: FONT.mono }}>
                {agent.name.slice(0, 1)}
              </text>
            </div>
          ))}
          <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.sans, marginLeft: 4 }}>
            120fps sync
          </text>
        </div>
      </div>
    </div>
  )
}
