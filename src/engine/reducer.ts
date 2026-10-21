/**
 * Turning the engine's feed into what the cockpit draws.
 *
 * Pure on purpose: the cockpit holds no run state of its own, so the only
 * place a run's state can change is here, from an event the engine published
 * or from a snapshot it returned. That makes the projection testable without
 * a window, and it makes "two windows show the same thing" a consequence of
 * the code instead of a hope.
 */

import type {
  EventRecord,
  Health,
  Message,
  Run,
  Session,
  SessionDetail,
} from '../../engine/src/protocol'

export type EngineStatus =
  | 'off'
  | 'starting'
  | 'ready'
  | 'unreachable'
  | 'mismatch'
  | 'unavailable'
  | 'failed'

export interface OutputState {
  text: string
  truncated: boolean
}

export interface Snapshot {
  status: EngineStatus
  health: Health | null
  error: string | null
  sessions: Session[]
  sessionID: string | null
  messages: Message[]
  runs: Run[]
  output: Record<string, OutputState>
}

/** In-memory ceiling for one run's output. The durable copy is the source. */
const MEMORY_OUTPUT_LIMIT = 256 * 1024

export function initialSnapshot(): Snapshot {
  return {
    status: 'off',
    health: null,
    error: null,
    sessions: [],
    sessionID: null,
    messages: [],
    runs: [],
    output: {},
  }
}

function upsertSession(sessions: Session[], next: Session): Session[] {
  const index = sessions.findIndex((session) => session.id === next.id)
  if (index < 0) return [next, ...sessions]
  const copy = sessions.slice()
  copy[index] = { ...copy[index], ...next }
  return copy
}

function upsertRun(runs: Run[], next: Run): Run[] {
  const index = runs.findIndex((run) => run.id === next.id)
  if (index < 0) return [...runs, next]
  const copy = runs.slice()
  copy[index] = { ...copy[index], ...next }
  return copy
}

/** Merge a snapshot from the engine into the view. */
export function hydrate(snapshot: Snapshot, detail: SessionDetail): Snapshot {
  const output: Record<string, OutputState> = {}
  for (const chunk of detail.chunks) {
    const entry = output[chunk.runID] ?? { text: '', truncated: false }
    entry.text = (entry.text + chunk.data).slice(-MEMORY_OUTPUT_LIMIT)
    output[chunk.runID] = entry
  }

  return {
    ...snapshot,
    sessionID: detail.session.id,
    sessions: upsertSession(snapshot.sessions, detail.session),
    messages: detail.messages,
    runs: detail.runs,
    output,
    error: null,
  }
}

/** Apply one durable event. */
export function apply(snapshot: Snapshot, event: EventRecord): Snapshot {
  switch (event.type) {
    case 'session.created': {
      const session = (event.data as { session: Session }).session
      return { ...snapshot, sessions: upsertSession(snapshot.sessions, session) }
    }

    case 'session.updated': {
      const session = (event.data as { session: Session }).session
      return { ...snapshot, sessions: upsertSession(snapshot.sessions, session) }
    }

    case 'message.created': {
      const message = (event.data as { message: Message }).message
      if (message.sessionID !== snapshot.sessionID) {
        // Another session's transcript must not leak into this one.
        return { ...snapshot, sessions: snapshot.sessions }
      }
      if (snapshot.messages.some((existing) => existing.id === message.id)) return snapshot
      const messages = [...snapshot.messages, message].sort((a, b) => a.seq - b.seq)
      return { ...snapshot, messages }
    }

    case 'run.started': {
      const run = (event.data as { run: Run }).run
      if (run.sessionID !== snapshot.sessionID) return snapshot
      return {
        ...snapshot,
        runs: upsertRun(snapshot.runs, run),
        output: snapshot.output[run.id] ? snapshot.output : { ...snapshot.output, [run.id]: { text: '', truncated: false } },
      }
    }

    case 'run.output': {
      const payload = event.data as { runID: string; data: string }
      const current = snapshot.output[payload.runID] ?? { text: '', truncated: false }
      const text = (current.text + payload.data).slice(-MEMORY_OUTPUT_LIMIT)
      return {
        ...snapshot,
        output: { ...snapshot.output, [payload.runID]: { ...current, text } },
      }
    }

    case 'run.truncated': {
      const payload = event.data as { runID: string }
      const current = snapshot.output[payload.runID] ?? { text: '', truncated: false }
      return {
        ...snapshot,
        output: { ...snapshot.output, [payload.runID]: { ...current, truncated: true } },
      }
    }

    case 'run.ended': {
      const run = (event.data as { run: Run }).run
      return { ...snapshot, runs: upsertRun(snapshot.runs, run) }
    }

    default:
      return snapshot
  }
}

/** Runs newest first, which is the order the terminal reads. */
export function orderedRuns(runs: Run[]): Run[] {
  return runs.slice().sort((a, b) => a.startedAt - b.startedAt)
}
