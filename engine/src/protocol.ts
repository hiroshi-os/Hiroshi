/**
 * The wire shapes between the engine and whatever draws it.
 *
 * The daemon and the cockpit import this same file, so a shape cannot drift
 * between the two sides. `PROTOCOL_VERSION` changes only when a client built
 * against the previous shape would misread the new daemon: a client that sees
 * another protocol version refuses to attach instead of guessing.
 *
 * Everything here is data. Nothing in this file may import a runtime module,
 * because the cockpit bundles it for the GPU renderer and for the browser.
 */

export const ENGINE_NAME = 'hiroshi-engine'

/**
 * The version of the shapes below. Bump it when a field is renamed, removed or
 * reinterpreted. Adding an optional field does not need a bump.
 */
export const PROTOCOL_VERSION = 1

/** Kept in step with `package.json` by a test. */
export const ENGINE_VERSION = '0.3.0'

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'

export type EventType =
  | 'session.created'
  | 'session.updated'
  | 'message.created'
  | 'run.started'
  | 'run.output'
  | 'run.truncated'
  | 'run.ended'

export interface Health {
  name: string
  version: string
  protocol: number
  pid: number
  startedAt: number
  uptimeMs: number
  database: string
  workspace: string
  /** Sequence of the newest durable event, for diagnostics and resumption. */
  lastSeq: number
}

export interface Session {
  id: string
  title: string
  cwd: string
  createdAt: number
  updatedAt: number
  runs: number
  running: number
  lastRunAt: number | null
}

export type MessageRole = 'user' | 'system'

export interface Message {
  id: string
  sessionID: string
  /** Monotonic inside a session. */
  seq: number
  role: MessageRole
  text: string
  at: number
}

export interface Run {
  id: string
  sessionID: string
  command: string
  cwd: string
  /** The shell that ran it, or the one that will run it. */
  shell: string
  status: RunStatus
  exitCode: number | null
  startedAt: number
  endedAt: number | null
}

export type OutputStream = 'stdout' | 'stderr'

export interface RunChunk {
  runID: string
  seq: number
  stream: OutputStream
  data: string
  at: number
}

/** One durable fact, in the order the engine committed it. */
export interface EventRecord {
  seq: number
  type: EventType
  at: number
  sessionID: string | null
  runID: string | null
  data: unknown
}

/** A session and everything the engine has committed about it. */
export interface SessionDetail {
  session: Session
  messages: Message[]
  runs: Run[]
  chunks: RunChunk[]
  /** The watermark this snapshot was read at. Subscribe with `after: seq`. */
  seq: number
}

export interface RunDetail {
  run: Run
  chunks: RunChunk[]
}

export interface CreateSessionRequest {
  title?: string
  cwd?: string
}

export interface PromptRequest {
  text: string
}

export interface StartRunRequest {
  command: string
  cwd?: string
}

export interface SessionsResponse {
  sessions: Session[]
}

/** The discovery contract: what a live daemon writes next to its database. */
export interface RegistryRecord {
  name: string
  version: string
  protocol: number
  url: string
  host: string
  port: number
  pid: number
  token: string
  startedAt: number
  database: string
  log: string
}

export interface ErrorBody {
  error: {
    code: string
    message: string
  }
}
