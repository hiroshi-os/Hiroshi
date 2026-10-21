/**
 * The acceptance criteria for the engine, as tests.
 *
 * A run belongs to the engine, not to the window that asked for it. These
 * tests close the client, attach another one, and crash the daemon on purpose.
 * If any of that loses a run, the engine is not an engine.
 */

import { describe, expect, test } from 'bun:test'
import path from 'node:path'

import { engineClient } from '../../src/engine/client'
import { discover, processAlive } from '../src/registry'
import { sleep, startDaemon, until } from './harness'

const ENTRY = path.resolve(import.meta.dir, '../src/index.ts')

function longCommand(seconds: number): string {
  return process.platform === 'win32' ? `Start-Sleep -Seconds ${seconds}; echo done` : `sleep ${seconds}; echo done`
}

describe('survival', () => {
  test('a run outlives the client that started it, and a second client sees it', async () => {
    const daemon = await startDaemon()

    try {
      const { session } = await daemon.client.createSession({ cwd: daemon.workspace, title: 'survives' })
      const { run } = await daemon.client.startRun({ id: session.id, command: longCommand(2) })

      // The cockpit closes: nothing holds the run, nothing is subscribed.
      await sleep(700)

      const found = await discover(daemon.paths.registry)
      expect(found.state).toBe('running')
      if (found.state !== 'running') throw new Error('the daemon vanished')

      // A second cockpit attaches from the discovery file alone.
      const second = engineClient(found.record)
      const midway = await second.session({ id: session.id })
      expect(midway.runs.find((candidate) => candidate.id === run.id)?.status).toBe('running')

      await until(
        async () =>
          (await second.session({ id: session.id })).runs.find((candidate) => candidate.id === run.id)?.status !==
          'running',
        20_000,
      )

      const finished = await second.session({ id: session.id })
      const record = finished.runs.find((candidate) => candidate.id === run.id)!
      expect(record.status).toBe('succeeded')

      const output = finished.chunks
        .filter((chunk) => chunk.runID === run.id)
        .map((chunk) => chunk.data)
        .join('')
      expect(output).toContain('done')

      // And the client that never closed the window sees the same ending.
      const fromFirst = await daemon.client.session({ id: session.id })
      expect(fromFirst.runs.find((candidate) => candidate.id === run.id)?.status).toBe('succeeded')
    } finally {
      await daemon.stop()
    }
  }, 60_000)

  test('a run the engine died inside is settled as interrupted on the next start', async () => {
    const daemon = await startDaemon()

    let restarted: Awaited<ReturnType<typeof startDaemon>> | null = null
    try {
      const { session } = await daemon.client.createSession({ cwd: daemon.workspace, title: 'crash' })
      const { run } = await daemon.client.startRun({ id: session.id, command: longCommand(30) })
      await sleep(600)

      // No shutdown, no cleanup: this is what a kill or a power cut looks like.
      await daemon.crash()

      restarted = await startDaemon({ home: daemon.home })
      const detail = await restarted.client.session({ id: session.id })
      const record = detail.runs.find((candidate) => candidate.id === run.id)!

      expect(record.status).toBe('interrupted')
      expect(record.endedAt).not.toBeNull()

      const output = detail.chunks
        .filter((chunk) => chunk.runID === run.id)
        .map((chunk) => chunk.data)
        .join('')
      expect(output).toContain('was not resumed')
    } finally {
      if (restarted) await restarted.stop()
      else await daemon.stop()
    }
  }, 90_000)

  test('a shut down engine settles the run it was holding', async () => {
    const daemon = await startDaemon()

    let restarted: Awaited<ReturnType<typeof startDaemon>> | null = null
    try {
      const { session } = await daemon.client.createSession({ cwd: daemon.workspace, title: 'shutdown' })
      const { run } = await daemon.client.startRun({ id: session.id, command: longCommand(30) })
      await sleep(600)

      // A graceful stop still owns the run: it may not hand the next start a
      // row that claims to be running.
      await daemon.client.shutdown().catch(() => {})
      await until(() => !processAlive(daemon.record.pid), 15_000)

      restarted = await startDaemon({ home: daemon.home })
      const detail = await restarted.client.session({ id: session.id })
      const record = detail.runs.find((candidate) => candidate.id === run.id)!

      // An asked-for stop cancels the run; it does not leave a `running` row
      // for the next start to reinterpret as a crash.
      expect(record.status).toBe('cancelled')
      expect(record.endedAt).not.toBeNull()

      const output = detail.chunks
        .filter((chunk) => chunk.runID === run.id)
        .map((chunk) => chunk.data)
        .join('')
      expect(output).toContain('was shut down')
    } finally {
      if (restarted) await restarted.stop()
      else await daemon.stop()
    }
  }, 90_000)

  test('closing and reopening the cockpit leaves one daemon, not two', async () => {
    const daemon = await startDaemon()
    try {
      const found = await discover(daemon.paths.registry)
      expect(found.state).toBe('running')
      if (found.state !== 'running') throw new Error('the daemon vanished')

      // A second `serve` against the same data directory must adopt the first.
      const second = Bun.spawn({
        cmd: [process.execPath, ENTRY, 'serve', '--data-dir', daemon.home],
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, HIROSHI_HOME: daemon.home },
      })
      const text = await new Response(second.stdout).text()
      const code = await second.exited

      expect(code).toBe(0)
      expect(text).toContain('already running')

      const still = await discover(daemon.paths.registry)
      expect(still.state).toBe('running')
      if (still.state === 'running') expect(still.record.pid).toBe(daemon.record.pid)
    } finally {
      await daemon.stop()
    }
  }, 60_000)
})
