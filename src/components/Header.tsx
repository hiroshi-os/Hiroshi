import React from 'react'
import { C, FONT, TITLEBAR_CLEARANCE } from '../theme'
import { Icon } from '../icons'
import type { ViewMode, Mission } from '../types'

interface HeaderProps {
  mission: Mission
  viewMode: ViewMode
  onChangeViewMode: (mode: ViewMode) => void
  isSwarmRunning: boolean
  onToggleSwarmRun: () => void
  onStepNext: () => void
  onToggleSidebar: () => void
  isSidebarOpen: boolean
}

export function Header({
  mission,
  viewMode,
  onChangeViewMode,
  isSwarmRunning,
  onToggleSwarmRun,
  onStepNext,
  onToggleSidebar,
  isSidebarOpen,
}: HeaderProps) {
  const tabs: { id: ViewMode; label: string; icon: any }[] = [
    { id: 'timeline', label: 'Timeline', icon: 'zap' },
    { id: 'topology', label: 'Topology', icon: 'network' },
    { id: 'fleet', label: 'Fleet & Agents', icon: 'bot' },
    { id: 'artifacts', label: 'Artifacts & Diffs', icon: 'code' },
  ]

  return (
    <div
      style={{
        height: 48,
        paddingLeft: TITLEBAR_CLEARANCE,
        paddingRight: 16,
        backgroundColor: C.header,
        borderBottomWidth: 1,
        borderColor: C.border,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      {/* Left: Sidebar Toggle + Active Mission Indicator */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <div
          onClick={onToggleSidebar}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backgroundColor: isSidebarOpen ? C.overlayStrong : 'transparent',
            hover: { backgroundColor: C.overlayStrong },
            active: { backgroundColor: C.surfaceHighlight },
          }}
        >
          <Icon name="panelLeft" size={14} color={C.secondary} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 2,
              paddingBottom: 2,
              borderRadius: 4,
              backgroundColor: C.overlayStrong,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Icon name="gitBranch" size={11} color={C.accent} />
            <text style={{ fontSize: 10.5, fontWeight: '600', color: C.text, fontFamily: FONT.mono }}>
              {mission.branch}
            </text>
          </div>

          <div
            style={{
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 2,
              paddingBottom: 2,
              borderRadius: 4,
              backgroundColor: isSwarmRunning ? C.successBg : C.warningBg,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: isSwarmRunning ? C.success : C.warning,
              }}
            />
            <text
              style={{
                fontSize: 10,
                fontWeight: '600',
                color: isSwarmRunning ? C.success : C.warning,
                fontFamily: FONT.mono,
              }}
            >
              {isSwarmRunning ? 'SWARM RUNNING' : 'SWARM PAUSED'}
            </text>
          </div>
        </div>
      </div>

      {/* Center: View Switcher Tabs */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: C.canvas,
          padding: 3,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: C.border,
          gap: 2,
        }}
      >
        {tabs.map((tab) => {
          const isActive = viewMode === tab.id
          return (
            <div
              key={tab.id}
              testId={`tab-${tab.id}`}
              onClick={() => onChangeViewMode(tab.id)}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingLeft: 10,
                paddingRight: 10,
                height: 26,
                borderRadius: 6,
                backgroundColor: isActive ? C.surfaceElevated : 'transparent',
                borderWidth: 1,
                borderColor: isActive ? C.borderMedium : 'transparent',
                cursor: 'pointer',
                hover: isActive ? undefined : { backgroundColor: C.overlay },
                active: { backgroundColor: C.surfaceHighlight },
              }}
            >
              <Icon
                name={tab.icon}
                size={12}
                color={isActive ? C.accent : C.tertiary}
              />
              <text
                style={{
                  fontSize: 11.5,
                  fontWeight: isActive ? '600' : '500',
                  color: isActive ? C.text : C.secondary,
                  fontFamily: FONT.sans,
                }}
              >
                {tab.label}
              </text>
            </div>
          )
        })}
      </div>

      {/* Right: Swarm Run / Pause / Step Controls */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <div
          testId="step-next-btn"
          onClick={onStepNext}
          style={{
            height: 28,
            paddingLeft: 10,
            paddingRight: 10,
            borderRadius: 6,
            backgroundColor: C.surfaceElevated,
            borderWidth: 1,
            borderColor: C.borderMedium,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            hover: { backgroundColor: C.surfaceHighlight },
            active: { backgroundColor: C.surfaceHighlight },
          }}
        >
          <Icon name="arrowRight" size={11} color={C.secondary} />
          <text style={{ fontSize: 11, fontWeight: '600', color: C.text, fontFamily: FONT.sans }}>
            Step Turn
          </text>
        </div>

        <div
          testId="swarm-toggle-btn"
          onClick={onToggleSwarmRun}
          style={{
            height: 28,
            paddingLeft: 11,
            paddingRight: 11,
            borderRadius: 6,
            backgroundColor: isSwarmRunning ? C.surfaceElevated : C.accent,
            borderWidth: 1,
            borderColor: isSwarmRunning ? C.borderStrong : C.accent,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            hover: {
              backgroundColor: isSwarmRunning ? C.surfaceHighlight : C.accentHover,
            },
            active: { backgroundColor: isSwarmRunning ? C.surfaceElevated : C.accent },
          }}
        >
          <Icon
            name={isSwarmRunning ? 'pause' : 'play'}
            size={10}
            color={isSwarmRunning ? C.warning : C.onAccent}
          />
          <text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: isSwarmRunning ? C.text : C.onAccent,
              fontFamily: FONT.sans,
            }}
          >
            {isSwarmRunning ? 'Pause Swarm' : 'Run Swarm'}
          </text>
        </div>
      </div>
    </div>
  )
}
