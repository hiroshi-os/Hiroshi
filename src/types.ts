export type AgentRole =
  | 'supervisor'
  | 'architect'
  | 'researcher'
  | 'coder'
  | 'verifier'
  | 'security'

export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'waiting_approval' | 'error' | 'done'

export interface Agent {
  id: string
  name: string
  role: AgentRole
  title: string
  model: string
  color: string
  badgeColor: string
  status: AgentStatus
  currentTask?: string
  tools: string[]
  contextTokens: number
  maxContextTokens: number
  temperature: number
  systemPrompt: string
}

export interface ToolCall {
  id: string
  toolName: string
  inputSummary: string
  rawInput?: string
  output?: string
  status: 'running' | 'success' | 'failed' | 'requires_approval'
  durationMs?: number
}

export interface SubtaskPlan {
  id: string
  title: string
  assignedAgentId: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  dependsOn?: string[]
}

export interface MissionTurn {
  id: string
  timestamp: string
  kind: 'user_mission' | 'orchestrator_plan' | 'agent_turn' | 'approval_request' | 'swarm_summary'
  // user_mission
  userText?: string
  tags?: string[]
  // orchestrator_plan
  planTitle?: string
  planObjective?: string
  subtasks?: SubtaskPlan[]
  // agent_turn
  agentId?: string
  reasoning?: string
  reasoningDuration?: string
  isReasoningExpanded?: boolean
  messageText?: string
  toolCalls?: ToolCall[]
  codeBlock?: {
    language: string
    filename: string
    code: string
  }
  diffPatch?: string
  // approval_request
  approvalId?: string
  actionTitle?: string
  actionCommand?: string
  riskLevel?: 'low' | 'moderate' | 'high'
  approvalStatus?: 'pending' | 'approved' | 'rejected'
  status?: 'pending' | 'in_progress' | 'completed' | 'failed'
  // swarm_summary
  summaryStats?: {
    duration: string
    tokensBurned: number
    filesModified: number
    toolsExecuted: number
  }
}

export interface Mission {
  id: string
  title: string
  project: string
  branch: string
  createdAt: string
  status: 'running' | 'paused' | 'completed' | 'idle'
  activeFleet: string[]
  turns: MissionTurn[]
}

export type ViewMode = 'timeline' | 'topology' | 'fleet' | 'artifacts'

export interface SwarmTopologyNode {
  id: string
  agentId: string
  label: string
  role: AgentRole
  x: number // layout percentage or grid col
  y: number
  status: AgentStatus
  activeTask?: string
  connectedTo: string[]
  throughput: string
}

export interface ArtifactFile {
  id: string
  name: string
  path: string
  agentName: string
  language: string
  linesAdded: number
  linesRemoved: number
  content: string
  patch?: string
}
