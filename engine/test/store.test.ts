import { describe, expect, test } from 'bun:test'

import { silentLogger } from '../src/log'
import { Sessions } from '../src/sessions'
import { Store } from '../src/store'
import type { Session } from '../src/protocol'

function setup() {
  const store = Store.open(':memory:')
  store.migrate()
  const sessions = new Sessions(store, silentLogger(), { cwd: process.cwd() })
  return { store, sessions }
}

describe('store', () => {
  test('migrations are idempotent', () => {
    const { store } = setup()
    store.migrate()
    store.migrate()
    expect(store.sessions()).toEqual([])
    store.close()
  })

  test('a session is a durable event, not a row nobody can replay', () => {
    const { store, sessions } = setup()
    const session = sessions.create({ title: 'first' })

    const events = store.eventsSince(0)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('session.created')
    expect(events[0]!.sessionID).toBe(session.id)
    expect((events[0]!.data as { session: Session }).session.id).toBe(session.id)
    expect(store.session(session.id)?.title).toBe('first')

    store.close()
  })

  test('the first prompt names an untitled session, and only the first', () => {
    const { store, sessions } = setup()
    const session = sessions.create({})
    expect(session.title).toBe('New task')

    sessions.prompt(session.id, 'ship the drag fix\nand then the rest')
    expect(store.session(session.id)?.title).toBe('ship the drag fix')

    sessions.prompt(session.id, 'something else entirely')
    expect(store.session(session.id)?.title).toBe('ship the drag fix')

    store.close()
  })

  test('a subscriber is told only after the projection is visible', () => {
    const { store, sessions } = setup()
    const session = sessions.create({})

    let sawMessage = false
    let sawRun = false
    store.subscribe((event) => {
      if (event.type === 'message.created') sawMessage = store.messages(session.id).length === 1
      if (event.type === 'run.ended') sawRun = store.run(event.runID!)?.status === 'succeeded'
    })

    sessions.prompt(session.id, 'hello')

    store.insertRun({
      id: 'run_projection',
      sessionID: session.id,
      command: 'true',
      cwd: session.cwd,
      shell: 'sh',
      status: 'running',
      exitCode: null,
      startedAt: Date.now(),
      endedAt: null,
    })
    store.record({
      type: 'run.ended',
      sessionID: session.id,
      runID: 'run_projection',
      data: { run: { id: 'run_projection', status: 'succeeded' } },
      project: () => store.finishRun('run_projection', 'succeeded', 0, Date.now()),
    })

    expect(sawMessage).toBe(true)
    expect(sawRun).toBe(true)

    store.close()
  })

  test('chunk sequence numbers are contiguous per run', () => {
    const { store, sessions } = setup()
    const session = sessions.create({})
    store.insertRun({
      id: 'run_chunks',
      sessionID: session.id,
      command: 'true',
      cwd: session.cwd,
      shell: 'sh',
      status: 'running',
      exitCode: null,
      startedAt: Date.now(),
      endedAt: null,
    })

    store.appendChunk('run_chunks', 'stdout', 'one', 1)
    store.appendChunk('run_chunks', 'stderr', 'two', 2)
    store.appendChunk('run_chunks', 'stdout', 'three', 3)

    expect(store.chunks('run_chunks').map((chunk) => chunk.seq)).toEqual([0, 1, 2])
    store.close()
  })

  test('the snapshot carries the watermark it was read at', () => {
    const { store, sessions } = setup()
    const session = sessions.create({})
    sessions.prompt(session.id, 'one')
    sessions.prompt(session.id, 'two')

    const detail = store.snapshot(session.id)!
    expect(detail.seq).toBe(store.lastSeq())
    expect(detail.messages).toHaveLength(2)
    expect(detail.messages.map((message) => message.seq)).toEqual([0, 1])

    store.close()
  })
})
