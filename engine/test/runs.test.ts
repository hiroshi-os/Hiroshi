import { describe, expect, test } from 'bun:test'

import { silentLogger } from '../src/log'
import { Runs } from '../src/runs'
import { Sessions } from '../src/sessions'
import { Store } from '../src/store'
import { sleep, until } from './harness'

function setup(options: { outputLimit?: number } = {}) {
  const store = Store.open(':memory:')
  store.migrate()
  const sessions = new Sessions(store, silentLogger(), { cwd: process.cwd() })
  const runs = new Runs(store, silentLogger(), options)
  const session = sessions.create({ title: 'runs' })
  return { store, runs, session }
}

async function settle(store: Store, runID: string, timeoutMs = 20_000): Promise<void> {
  await until(() => store.run(runID)?.status !== 'running', timeoutMs)
}

describe('runs', () => {
  test('records the output and the exit code', async () => {
    const { store, runs, session } = setup()
    const run = runs.start(session.id, 'echo hello')

    await settle(store, run.id)

    expect(store.run(run.id)?.status).toBe('succeeded')
    expect(store.run(run.id)?.exitCode).toBe(0)
    const output = store.chunks(run.id).map((chunk) => chunk.data).join('')
    expect(output).toContain('hello')

    const events = store.eventsSince(0).map((event) => event.type)
    expect(events).toContain('run.started')
    expect(events).toContain('run.output')
    expect(events).toContain('run.ended')

    store.close()
  }, 30_000)

  test('a non-zero exit is a failed run, not a thrown request', async () => {
    const { store, runs, session } = setup()
    const run = runs.start(session.id, 'exit 7')

    await settle(store, run.id)

    expect(store.run(run.id)?.status).toBe('failed')
    expect(store.run(run.id)?.exitCode).toBe(7)

    store.close()
  }, 30_000)

  test('a cancelled run stops and says so', async () => {
    const { store, runs, session } = setup()
    const command = process.platform === 'win32' ? 'Start-Sleep -Seconds 30' : 'sleep 30'
    const run = runs.start(session.id, command)

    await sleep(400)
    expect(store.run(run.id)?.status).toBe('running')

    runs.cancel(run.id)
    await settle(store, run.id, 15_000)

    expect(store.run(run.id)?.status).toBe('cancelled')
    expect(runs.active).toBe(0)

    store.close()
  }, 30_000)

  test('an empty command is rejected before anything is recorded', () => {
    const { store, runs, session } = setup()
    expect(() => runs.start(session.id, '   ')).toThrow()
    expect(store.eventsSince(0).filter((event) => event.type === 'run.started')).toHaveLength(0)
    store.close()
  })

  test('output is bounded and the run is marked truncated', async () => {
    const { store, runs, session } = setup({ outputLimit: 200 })
    const run = runs.start(session.id, `bun -e "process.stdout.write('x'.repeat(5000))"`)

    await settle(store, run.id)

    const stored = store.chunks(run.id).reduce((total, chunk) => total + chunk.data.length, 0)
    expect(stored).toBeLessThan(600)
    expect(store.eventsSince(0).map((event) => event.type)).toContain('run.truncated')
    expect(store.run(run.id)?.status).toBe('succeeded')

    store.close()
  }, 30_000)

  test('a run the previous process left behind is settled as interrupted', () => {
    const { store, runs, session } = setup()
    const at = Date.now()
    store.insertRun({
      id: 'run_orphan',
      sessionID: session.id,
      command: 'sleep 30',
      cwd: session.cwd,
      shell: 'sh',
      status: 'running',
      exitCode: null,
      startedAt: at,
      endedAt: null,
    })

    const settled = runs.settleInterrupted('the engine stopped while this command was running')

    expect(settled).toBe(1)
    expect(store.run('run_orphan')?.status).toBe('interrupted')
    const output = store.chunks('run_orphan').map((chunk) => chunk.data).join('')
    expect(output).toContain('the engine stopped while this command was running')

    // Settling twice must not write a second ending.
    expect(runs.settleInterrupted('again')).toBe(0)
    store.close()
  })
})
