/**
 * The wire shapes between the engine and whatever draws it.
 *
 * The daemon and the cockpit import this same file, so a shape cannot drift
 * between the two sides. It holds three things:
 *
 *   - the shapes: a session, a message, a run, a snapshot;
 *   - `EventPayloads`: the union of everything the engine can publish;
 *   - `operations`: the route table every command is declared in, which the
 *     daemon matches and the client is generated from.
 *
 * `PROTOCOL_VERSION` changes only when a client built against the previous
 * shape would misread the new daemon: a client that sees another protocol
 * version refuses to attach instead of guessing.
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

/**
 * The payload each durable event carries.
 *
 * This table is the whole of what the engine can publish: `EventType` is
 * derived from it, `EngineEvent` is derived from it, and the store checks the
 * payload of every `record()` against it. Adding an event means adding one row
 * here; nothing else in the protocol has to learn about it.
 */
export interface EventPayloads {
  'session.created': { session: Session }
  'session.updated': { session: Session }
  'message.created': { message: Message }
  'run.started': { run: Run }
  'run.output': { runID: string; stream: OutputStream; data: string }
  'run.truncated': { runID: string; limit: number }
  'run.ended': { run: Run }
}

export type EventType = keyof EventPayloads

/**
 * One durable fact, as the feed publishes it.
 *
 * A union rather than `{ type: EventType; data: unknown }`, so a subscriber
 * that switches on `type` sees the payload without a cast and a new event
 * cannot be published with the wrong body.
 */
export type EngineEvent = {
  [Type in EventType]: {
    seq: number
    type: Type
    at: number
    sessionID: string | null
    runID: string | null
    data: EventPayloads[Type]
  }
}[EventType]

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

/** A command that names a session. The `id` is the path, not the body. */
export interface SessionRef {
  id: string
}

/** A command that names a run. The `id` is the path, not the body. */
export interface RunRef {
  id: string
}

/** A command that carries nothing. */
export type NoInput = Record<string, never>

export type PromptInput = SessionRef & PromptRequest

export type StartRunInput = SessionRef & StartRunRequest

/**
 * Every command: what it takes and what it answers.
 *
 * This table is types only. The runtime side is `operations` below, and the
 * two are tied together by `OperationName`, so a row cannot name a command
 * without a shape and a client method cannot take the wrong body.
 */
export interface OperationShapes {
  health: { request: NoInput; response: Health }
  listSessions: { request: NoInput; response: SessionsResponse }
  createSession: { request: CreateSessionRequest; response: { session: Session } }
  session: { request: SessionRef; response: SessionDetail }
  prompt: { request: PromptInput; response: { message: Message } }
  startRun: { request: StartRunInput; response: { run: Run } }
  run: { request: RunRef; response: RunDetail }
  cancelRun: { request: RunRef; response: { run: Run } }
  shutdown: { request: NoInput; response: { ok: boolean } }
}

export type OperationName = keyof OperationShapes

export type OperationRequest<Name extends OperationName> = OperationShapes[Name]['request']

export type OperationResponse<Name extends OperationName> = OperationShapes[Name]['response']

/**
 * One row of the route table.
 *
 * `:name` segments come from the request and are consumed; whatever the
 * request has left over is the body. The daemon matches the same rows, so a
 * path is written once and both sides read it from here.
 */
export interface Operation<Name extends OperationName = OperationName> {
  readonly name: Name
  readonly method: 'GET' | 'POST'
  readonly path: string
  /** The status a success answers with. `200` when the row omits it. */
  readonly status?: number
}

export const operations: readonly Operation[] = [
  { name: 'health', method: 'GET', path: '/v1/health' },
  { name: 'listSessions', method: 'GET', path: '/v1/sessions' },
  { name: 'createSession', method: 'POST', path: '/v1/sessions', status: 201 },
  { name: 'session', method: 'GET', path: '/v1/sessions/:id' },
  { name: 'prompt', method: 'POST', path: '/v1/sessions/:id/messages', status: 201 },
  { name: 'startRun', method: 'POST', path: '/v1/sessions/:id/runs', status: 201 },
  { name: 'run', method: 'GET', path: '/v1/runs/:id' },
  { name: 'cancelRun', method: 'POST', path: '/v1/runs/:id/cancel' },
  { name: 'shutdown', method: 'POST', path: '/v1/shutdown' },
]

/**
 * The one feed. It is not a command: it answers with a stream rather than a
 * body, so it is not a row of the table above.
 */
export const FEED_PATH = '/v1/events'

/**
 * The frame names the feed sends besides events.
 *
 * An event frame has no name and carries one `EngineEvent` in its `data`. The
 * two named frames are the feed talking about itself: the watermark it opened
 * at, and the reason a connection is about to close.
 */
export const FEED_HELLO = 'hello'
export const FEED_OVERFLOW = 'overflow'

/**
 * The first frame on every feed: the durable edge the connection opened at.
 *
 * A client compares `lastSeq` with the watermark it asked from. `lastSeq`
 * ahead of `after` means the replay will fill the gap; `lastSeq` behind
 * `after` means the log lost ground (a different database) and replaying
 * cannot help, so the client has to take a fresh snapshot instead.
 */
export interface FeedHello {
  /** The newest durable sequence when this connection opened. */
  lastSeq: number
  /** The watermark the client asked from, echoed for the log. */
  after: number
}

/**
 * The last frame a connection sees before the feed closes it.
 *
 * A queue that overflows loses one connection, not the run: the client knows
 * the last sequence it applied and reconnects from it.
 */
export interface FeedOverflow {
  reason: 'client_too_slow'
  /** Frames one connection's queue holds before it is dropped. */
  capacity: number
}

export interface OperationMatch {
  operation: Operation
  /** The path segments the template named. */
  params: Record<string, string>
}

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

/**
 * Find the row a request names, or nothing.
 *
 * Pure string work, no runtime imports: the daemon routes on the result and
 * the client builds its paths from the same rows.
 */
export function matchOperation(method: string, pathname: string): OperationMatch | null {
  const verb = method.toUpperCase()
  const segments = pathname.split('/').filter((segment) => segment.length > 0)

  for (const operation of operations) {
    if (operation.method !== verb) continue
    const pattern = operation.path.split('/').filter((segment) => segment.length > 0)
    if (pattern.length !== segments.length) continue

    const params: Record<string, string> = {}
    let matched = true
    for (let index = 0; index < pattern.length; index += 1) {
      const expected = pattern[index]!
      const actual = segments[index]!
      if (expected.startsWith(':')) {
        const value = decode(actual)
        if (value === null) {
          matched = false
          break
        }
        params[expected.slice(1)] = value
      } else if (expected !== actual) {
        matched = false
        break
      }
    }

    if (matched) return { operation, params }
  }

  return null
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
