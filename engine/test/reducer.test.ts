import { describe, expect, test } from 'bun:test'

import { apply, hydrate, initialSnapshot, type Snapshot } from '../../src/engine/reducer'
import type {
  EngineEvent,
  EventPayloads,
  EventType,
  InboxItem,
  Message,
  Run,
  Session,
  SessionDetail,
} from '../src/protocol'

let clock = 0

/**
 * One event, with its payload checked against the shape module.
 *
 * The cast assembles the union member from the two halves the caller passes;
 * a payload that does not belong to the type is a compile error at the call.
 */
function event<Type extends EventType>(
  type: Type,
  data: EventPayloads[Type],
  extra: { sessionID?: string | null; runID?: string | null } = {},
): EngineEvent {
  clock += 1
  return {
    seq: clock,
    type,
    at: clock,
    sessionID: extra.sessionID === undefined ? 'ses_one' : extra.sessionID,
    runID: extra.runID ?? null,
    data,
  } as EngineEvent
}

const session: Session = {
  id: 'ses_one',
  title: 'one',
  cwd: '/workspace',
  createdAt: 1,
  updatedAt: 1,
  runs: 0,
  running: 0,
  lastRunAt: null,
}

const run: Run = {
  id: 'run_one',
  sessionID: 'ses_one',
  command: 'echo hi',
  cwd: '/workspace',
  shell: 'sh',
  status: 'running',
  exitCode: null,
  startedAt: 10,
  endedAt: null,
}

function ready(): Snapshot {
  return { ...initialSnapshot(), status: 'ready', sessionID: 'ses_one' }
}

describe('the projection', () => {
  test('a run grows from started to ended, and its output accumulates', () => {
    let snapshot = ready()

    snapshot = apply(snapshot, event('run.started', { run }, { runID: run.id }))
    expect(snapshot.runs).toHaveLength(1)
    expect(snapshot.runs[0]!.status).toBe('running')

    snapshot = apply(snapshot, event('run.output', { runID: run.id, stream: 'stdout', data: 'hel' }, { runID: run.id }))
    snapshot = apply(snapshot, event('run.output', { runID: run.id, stream: 'stdout', data: 'lo\n' }, { runID: run.id }))
    expect(snapshot.output[run.id]!.text).toBe('hello\n')

    snapshot = apply(
      snapshot,
      event('run.ended', { run: { ...run, status: 'succeeded', exitCode: 0, endedAt: 20 } }, { runID: run.id }),
    )
    expect(snapshot.runs[0]!.status).toBe('succeeded')
    expect(snapshot.runs[0]!.exitCode).toBe(0)
  })

  test('a run from another session never lands in this one', () => {
    const other = { ...run, id: 'run_other', sessionID: 'ses_two' }
    const snapshot = apply(ready(), event('run.started', { run: other }, { sessionID: 'ses_two', runID: other.id }))
    expect(snapshot.runs).toHaveLength(0)
  })

  test('a prompt sits in the inbox until one event delivers it with its message', () => {
    const item: InboxItem = {
      id: 'inb_one',
      sessionID: 'ses_one',
      seq: 0,
      text: 'ship it',
      mode: 'steer',
      state: 'pending',
      key: 'k1',
      admittedAt: 5,
      deliveredAt: null,
      messageID: null,
    }

    let snapshot = apply(ready(), event('prompt.admitted', { item }))
    expect(snapshot.inbox).toHaveLength(1)
    expect(snapshot.messages).toHaveLength(0)

    const message: Message = {
      id: 'msg_one',
      sessionID: 'ses_one',
      seq: 0,
      role: 'user',
      text: 'ship it',
      at: 6,
      mode: 'steer',
    }
    const delivered: InboxItem = { ...item, state: 'delivered', deliveredAt: 6, messageID: message.id }
    snapshot = apply(snapshot, event('prompt.delivered', { item: delivered, message }))

    expect(snapshot.inbox).toHaveLength(0)
    expect(snapshot.messages).toHaveLength(1)
    expect(snapshot.messages[0]!.mode).toBe('steer')

    // A replay of the same delivery draws nothing a second time.
    snapshot = apply(snapshot, event('prompt.delivered', { item: delivered, message }))
    expect(snapshot.messages).toHaveLength(1)
  })

  test('another session’s inbox never leaks into this one', () => {
    const item: InboxItem = {
      id: 'inb_two',
      sessionID: 'ses_two',
      seq: 0,
      text: 'not mine',
      mode: 'queue',
      state: 'pending',
      key: null,
      admittedAt: 1,
      deliveredAt: null,
      messageID: null,
    }
    const snapshot = apply(ready(), event('prompt.admitted', { item }, { sessionID: 'ses_two' }))
    expect(snapshot.inbox).toHaveLength(0)
  })

  test('hydrating a snapshot rebuilds the output from the engine chunks', () => {
    const detail: SessionDetail = {
      session,
      messages: [{ id: 'msg_one', sessionID: 'ses_one', seq: 0, role: 'user', text: 'hi', at: 1 }],
      runs: [{ ...run, status: 'succeeded', exitCode: 0, endedAt: 20 }],
      chunks: [
        { runID: run.id, seq: 0, stream: 'stdout', data: 'hel', at: 11 },
        { runID: run.id, seq: 1, stream: 'stdout', data: 'lo\n', at: 12 },
        { runID: run.id, seq: 2, stream: 'stderr', data: 'warn\n', at: 13 },
      ],
      inbox: [],
      seq: 9,
    }

    const snapshot = hydrate({ ...initialSnapshot(), status: 'ready' }, detail)
    expect(snapshot.sessionID).toBe('ses_one')
    expect(snapshot.messages).toHaveLength(1)
    expect(snapshot.runs[0]!.status).toBe('succeeded')
    expect(snapshot.output[run.id]!.text).toBe('hello\nwarn\n')
    expect(snapshot.inbox).toEqual([])
  })

  test('the in-memory copy keeps the tail, not the head', () => {
    let snapshot = ready()
    snapshot = apply(snapshot, event('run.started', { run }, { runID: run.id }))

    const chunk = 'x'.repeat(64 * 1024)
    for (let index = 0; index < 6; index += 1) {
      snapshot = apply(snapshot, event('run.output', { runID: run.id, stream: 'stdout', data: chunk }, { runID: run.id }))
    }

    const drawn = snapshot.output[run.id]!.text
    expect(drawn.length).toBeLessThanOrEqual(256 * 1024)
    expect(drawn.length).toBeGreaterThanOrEqual(256 * 1024 - 1)
  })
})
