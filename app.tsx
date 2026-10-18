/**
 * Hiroshi — Multi-Agent Orchestration Cockpit
 * Rendered natively on the GPU by GPUIX.
 *
 * Desktop:  bun run dev
 * Browser:  bun run web:build && bun run web:dev
 * Binary:   bun run build && ./dist/hiroshi
 */

import React, { useState } from 'react'
import { motion, render } from '@gpuix/react'

import { C } from './src/theme'
import {
  INITIAL_AGENTS,
  INITIAL_MISSIONS,
  TOPOLOGY_NODES,
  INITIAL_ARTIFACTS,
} from './src/data/mock-data'
import type { ViewMode, Mission, Agent, SwarmTopologyNode, ArtifactFile, MissionTurn } from './src/types'

import { Sidebar } from './src/components/Sidebar'
import { Header } from './src/components/Header'
import { TimelineView } from './src/components/TimelineView'
import { TopologyView } from './src/components/TopologyView'
import { FleetView } from './src/components/FleetView'
import { ArtifactsView } from './src/components/ArtifactsView'
import { Composer } from './src/components/Composer'

export function HiroshiApp() {
  const [missions, setMissions] = useState<Mission[]>(INITIAL_MISSIONS)
  const [activeMissionId, setActiveMissionId] = useState<string>(INITIAL_MISSIONS[0].id)
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS)
  const [topologyNodes, setTopologyNodes] = useState<SwarmTopologyNode[]>(TOPOLOGY_NODES)
  const [artifacts, setArtifacts] = useState<ArtifactFile[]>(INITIAL_ARTIFACTS)
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [isSwarmRunning, setIsSwarmRunning] = useState<boolean>(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true)

  const activeMission = missions.find((m) => m.id === activeMissionId) ?? missions[0]

  // Approval Gate Handlers
  const handleApproveAction = (turnId: string) => {
    setMissions((prev) =>
      prev.map((m) => {
        if (m.id !== activeMissionId) return m
        return {
          ...m,
          turns: m.turns.map((t) => {
            if (t.id === turnId) {
              return { ...t, approvalStatus: 'approved' }
            }
            return t
          }),
        }
      })
    )
  }

  const handleRejectAction = (turnId: string) => {
    setMissions((prev) =>
      prev.map((m) => {
        if (m.id !== activeMissionId) return m
        return {
          ...m,
          turns: m.turns.map((t) => {
            if (t.id === turnId) {
              return { ...t, approvalStatus: 'rejected' }
            }
            return t
          }),
        }
      })
    )
  }

  // Swarm Step Simulation
  const handleStepNext = () => {
    const nextTurnId = `t-${Date.now()}`
    const timeStr = new Date().toTimeString().slice(0, 8)
    const newTurn: MissionTurn = {
      id: nextTurnId,
      timestamp: timeStr,
      kind: 'agent_turn',
      agentId: 'agent-verifier',
      reasoning: 'Cargo test suite completed: 18 passed, 0 failed. Concurrency race check clean.',
      reasoningDuration: 'Executed sandbox in 1.8s',
      messageText:
        'Sentinel report: All distributed CRDT sync tests passed with zero data races. The event pump maintains 120fps during 10,000 parallel delta merges.',
      toolCalls: [
        {
          id: `tc-${Date.now()}`,
          toolName: 'cargo_test',
          inputSummary: 'crates/hiroshi-core concurrency suite',
          output: 'test result: ok. 18 passed; 0 failed; 0 ignored; finished in 1.42s',
          status: 'success',
          durationMs: 1420,
        },
      ],
    }

    setMissions((prev) =>
      prev.map((m) => {
        if (m.id !== activeMissionId) return m
        return {
          ...m,
          turns: [...m.turns, newTurn],
        }
      })
    )
  }

  // Dispatch prompt from composer
  const handleDispatchMission = (prompt: string, targetAgentId?: string) => {
    const timeStr = new Date().toTimeString().slice(0, 8)
    const userTurn: MissionTurn = {
      id: `t-user-${Date.now()}`,
      timestamp: timeStr,
      kind: 'user_mission',
      userText: prompt,
      tags: targetAgentId ? [targetAgentId] : ['Swarm', 'Auto-Plan'],
    }

    setMissions((prev) =>
      prev.map((m) => {
        if (m.id !== activeMissionId) return m
        return {
          ...m,
          turns: [...m.turns, userTurn],
        }
      })
    )
  }

  // Create new mission
  const handleNewMission = () => {
    const newId = `m-${Date.now()}`
    const newMission: Mission = {
      id: newId,
      title: 'New Swarm Directive',
      project: 'hiroshi-workspace',
      branch: 'main',
      createdAt: 'Just now',
      status: 'running',
      activeFleet: ['agent-supervisor', 'agent-coder'],
      turns: [
        {
          id: `t-${Date.now()}`,
          timestamp: new Date().toTimeString().slice(0, 8),
          kind: 'user_mission',
          userText: 'Ready for new swarm objective. Decompose and orchestrate.',
          tags: ['Staged'],
        },
      ],
    }
    setMissions((prev) => [newMission, ...prev])
    setActiveMissionId(newId)
    setViewMode('timeline')
  }

  // Update agent model
  const handleUpdateAgentModel = (agentId: string, newModel: string) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, model: newModel } : a))
    )
  }

  // Toggle tool
  const handleToggleTool = (agentId: string, tool: string) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id !== agentId) return a
        const has = a.tools.includes(tool)
        return {
          ...a,
          tools: has ? a.tools.filter((t) => t !== tool) : [...a.tools, tool],
        }
      })
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        backgroundColor: C.canvas,
      }}
    >
      {/* Collapsible Left Sidebar */}
      {isSidebarOpen && (
        <Sidebar
          missions={missions}
          activeMissionId={activeMissionId}
          onSelectMission={setActiveMissionId}
          onNewMission={handleNewMission}
          agents={agents}
          onOpenFleet={() => setViewMode('fleet')}
        />
      )}

      {/* Main Workspace Column */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          height: '100%',
          minWidth: 0,
        }}
      >
        {/* Top Header */}
        <Header
          mission={activeMission}
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          isSwarmRunning={isSwarmRunning}
          onToggleSwarmRun={() => setIsSwarmRunning(!isSwarmRunning)}
          onStepNext={handleStepNext}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          isSidebarOpen={isSidebarOpen}
        />

        {/* Central View Area */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {viewMode === 'timeline' && (
            <TimelineView
              mission={activeMission}
              agents={agents}
              onApproveAction={handleApproveAction}
              onRejectAction={handleRejectAction}
            />
          )}

          {viewMode === 'topology' && (
            <TopologyView agents={agents} topologyNodes={topologyNodes} />
          )}

          {viewMode === 'fleet' && (
            <FleetView
              agents={agents}
              onUpdateAgentModel={handleUpdateAgentModel}
              onToggleTool={handleToggleTool}
            />
          )}

          {viewMode === 'artifacts' && (
            <ArtifactsView artifacts={artifacts} />
          )}
        </div>

        {/* Bottom Mission Composer */}
        <Composer
          onDispatchMission={handleDispatchMission}
          agents={agents}
        />
      </div>
    </div>
  )
}

// Backwards compatibility alias
export const TodoApp = HiroshiApp
export default HiroshiApp

// Only open a window when this file is the program entry. A test imports `HiroshiApp`.
const isEntryPoint =
  typeof Bun !== 'undefined'
    ? Bun.isStandaloneExecutable || Bun.main === import.meta.path
    : typeof window !== 'undefined'

if (isEntryPoint) {
  render(<HiroshiApp />, {
    title: 'Hiroshi — Multi-Agent Orchestrator',
    width: 1200,
    height: 800,
    titlebarTransparent: true,
    windowBackground: 'blurred',
    trafficLightX: 16,
    trafficLightY: 17,
    focus: typeof process === 'undefined' || process.env.GPUIX_BACKGROUND !== '1',
  })
}
