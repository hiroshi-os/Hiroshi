/**
 * Runs: a command the engine owns.
 *
 * A run is durable before it has any effect. The row and the `run.started`
 * event commit first, then the process is spawned. A spawn failure is a
 * recorded failure, not an exception that leaves the database believing a
 * command is running.
 *
 * Output is written in batches: one durable event and one projection row per
 * batch, so a chatty command cannot turn into one transaction per line. The
 * stored output is bounded; a command that floods the terminal is marked
 * truncated instead of filling the disk.
 *
 * A run that was still marked `running` when the engine died is settled as
 * `interrupted` on the next start. The engine never replays a side effect it
 * cannot prove, so it does not resume the command either: it says what
 * happened and stops.
 */

import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

import { invalid, notFound } from './errors'
import type { Logger } from './log'
import type { OutputStream, Run, RunStatus } from './protocol'
import { resolveShell, type ResolvedShell } from './shell'
import type { Store } from './store'

/** Per run. Past this the output stops being stored and the run is marked. */
const DEFAULT_OUTPUT_LIMIT = Number(process.env.HIROSHI_OUTPUT_LIMIT) || 512 * 1024
/** How often a partial batch is flushed while a command keeps writing. */
const FLUSH_MS = 40
/** A batch is also flushed early once it is this large. */
const FLUSH_CHARS = 8 * 1024

interface Proc {
  pid: number
  readonly exited: Promise<number>
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<Uint8Array>
  kill(signal?: string | number): void
}

interface ActiveRun {
  run: Run
  proc: Proc
  cancelled: boolean
}

function newRunID(): string {
  return `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Stop the process and everything it started. */
function killTree(proc: Proc): void {
  if (process.platform === 'win32') {
    try {
      Bun.spawnSync({
        cmd: ['taskkill', '/pid', String(proc.pid), '/t', '/f'],
        stdio: ['ignore', 'ignore', 'ignore'],
        windowsHide: true,
      })
      return
    } catch {
      // Fall through to the plain signal if taskkill is unavailable.
    }
  }
  try {
    proc.kill('SIGTERM')
  } catch {
    // Already gone.
  }
  const timer = setTimeout(() => {
    try {
      proc.kill('SIGKILL')
    } catch {
      // Already gone.
    }
  }, 2000)
  ;(timer as unknown as { unref?: () => void }).unref?.()
}

export class Runs {
  readonly #store: Store
  readonly #log: Logger
  readonly #active = new Map<string, ActiveRun>()
  readonly #limit: number

  constructor(store: Store, log: Logger, options: { outputLimit?: number } = {}) {
    this.#store = store
    this.#log = log.child('runs')
    this.#limit = options.outputLimit ?? DEFAULT_OUTPUT_LIMIT
  }

  /** The number of commands currently executing, for status output and tests. */
  get active(): number {
    return this.#active.size
  }

  start(sessionID: string, command: string, cwd?: string): Run {
    const trimmed = command.trim()
    if (!trimmed) throw invalid('empty_command', 'a command is required')

    const session = this.#store.session(sessionID)
    if (!session) throw notFound('session')

    const target = cwd ? path.resolve(session.cwd, cwd) : session.cwd
    if (!existsSync(target) || !statSync(target).isDirectory()) {
      throw invalid('bad_working_directory', `${target} is not a directory`)
    }

    const shell = resolveShell()
    const at = Date.now()
    const run: Run = {
      id: newRunID(),
      sessionID,
      command: trimmed,
      cwd: target,
      shell: shell.label,
      status: 'running',
      exitCode: null,
      startedAt: at,
      endedAt: null,
    }

    // Durable before the effect. If the process cannot start, the failure is
    // recorded below against a run that already exists.
    this.#store.record({
      type: 'run.started',
      sessionID,
      runID: run.id,
      data: { run },
      at,
      project: () => {
        this.#store.insertRun(run)
        this.#store.touchSession(sessionID, at)
      },
    })

    let proc: Proc
    try {
      proc = Bun.spawn({
        cmd: [...shell.argv, trimmed],
        cwd: target,
        env: process.env,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        windowsHide: true,
      }) as unknown as Proc
    } catch (error) {
      this.#write(run, 'stderr', `hiroshi-engine: the command could not start: ${String(error)}\n`)
      this.#finish(run, 'failed', null)
      this.#log.error('spawn failed', { run: run.id, command: trimmed, error: String(error) })
      return this.#store.run(run.id) ?? run
    }

    this.#active.set(run.id, { run, proc, cancelled: false })
    this.#log.info('run started', { run: run.id, session: sessionID, shell: shell.label, pid: proc.pid })
    void this.#execute(run, proc, shell)
    return run
  }

  /** Ask a run to stop. The end event is written when the process is gone. */
  cancel(runID: string): Run {
    const run = this.#store.run(runID)
    if (!run) throw notFound('run')
    const active = this.#active.get(runID)
    if (!active) return run
    active.cancelled = true
    this.#log.info('run cancel requested', { run: runID, pid: active.proc.pid })
    killTree(active.proc)
    return run
  }

  /**
   * Settle every run the previous process left behind. Called once on startup
   * and once on shutdown, and safe to call twice: a run is only settled while
   * it is still `running`.
   */
  settleInterrupted(note: string): number {
    const stale = this.#store.runningRuns()
    for (const run of stale) {
      const at = Date.now()
      this.#write(run, 'stderr', `${note}\n`)
      this.#finish(run, 'interrupted', null, at)
    }
    if (stale.length > 0) this.#log.warn('settled interrupted runs', { runs: stale.length })
    return stale.length
  }

  /**
   * End every run the daemon is still holding, then kill the children.
   *
   * A shutdown the operator asked for is not an accident: each held run ends as
   * `cancelled`, with a line that says why, and the row is written before the
   * kill so it is on disk even if the process goes away immediately after. The
   * next start then finds nothing to guess about.
   */
  async stopAll(note = 'hiroshi-engine: the engine was shut down while this command was running'): Promise<void> {
    const active = [...this.#active.values()]
    for (const entry of active) {
      entry.cancelled = true
      this.#write(entry.run, 'stderr', `${note}\n`)
      this.#finish(entry.run, 'cancelled', null)
      killTree(entry.proc)
    }
    this.#active.clear()
    if (active.length > 0) {
      // Let the children die, but never hang the shutdown on one that will not.
      await Promise.race([Promise.all(active.map((entry) => entry.proc.exited)), sleep(1500)])
    }
  }

  // -- internals -----------------------------------------------------------

  #write(run: Run, stream: OutputStream, text: string): void {
    const at = Date.now()
    this.#store.record({
      type: 'run.output',
      sessionID: run.sessionID,
      runID: run.id,
      at,
      data: { runID: run.id, stream, data: text },
      project: () => {
        this.#store.appendChunk(run.id, stream, text, at)
      },
    })
  }

  #truncate(run: Run): void {
    this.#store.record({
      type: 'run.truncated',
      sessionID: run.sessionID,
      runID: run.id,
      data: { runID: run.id, limit: this.#limit },
    })
  }

  #finish(run: Run, status: RunStatus, exitCode: number | null, at = Date.now()): void {
    const current = this.#store.run(run.id)
    if (!current || current.status !== 'running') return
    const ended: Run = { ...current, status, exitCode, endedAt: at }
    this.#store.record({
      type: 'run.ended',
      sessionID: run.sessionID,
      runID: run.id,
      data: { run: ended },
      at,
      project: () => {
        this.#store.finishRun(run.id, status, exitCode, at)
        this.#store.touchSession(run.sessionID, at)
      },
    })
    this.#log.info('run ended', { run: run.id, status, exitCode })
  }

  async #execute(run: Run, proc: Proc, shell: ResolvedShell): Promise<void> {
    const buffers: Record<OutputStream, string> = { stdout: '', stderr: '' }
    let stored = 0
    let truncated = false

    const flush = (): void => {
      for (const stream of ['stdout', 'stderr'] as const) {
        let text = buffers[stream]
        if (!text) continue
        buffers[stream] = ''
        if (truncated) continue
        const room = this.#limit - stored
        if (text.length > room) {
          text = text.slice(0, Math.max(0, room))
          truncated = true
        }
        if (text.length > 0) {
          stored += text.length
          this.#write(run, stream, text)
        }
        if (truncated) {
          this.#write(run, 'stderr', `\nhiroshi-engine: output truncated after ${this.#limit} characters\n`)
          this.#truncate(run)
        }
      }
    }

    const timer = setInterval(flush, FLUSH_MS)
    try {
      // One decoder per stream, kept for the whole run: a multi-byte character
      // split across two reads must not be decoded as two replacement glyphs.
      const decoders: Record<OutputStream, TextDecoder> = {
        stdout: new TextDecoder(),
        stderr: new TextDecoder(),
      }
      const decode = (stream: OutputStream) => (bytes: Uint8Array) => {
        buffers[stream] += decoders[stream].decode(bytes, { stream: true })
        if (buffers[stream].length >= FLUSH_CHARS) flush()
      }
      await Promise.all([this.#pump(proc.stdout, decode('stdout')), this.#pump(proc.stderr, decode('stderr'))])
      const code = await proc.exited
      flush()
      const active = this.#active.get(run.id)
      const status: RunStatus = active?.cancelled ? 'cancelled' : code === 0 ? 'succeeded' : 'failed'
      this.#finish(run, status, code)
    } catch (error) {
      flush()
      this.#write(run, 'stderr', `hiroshi-engine: the run failed: ${String(error)}\n`)
      this.#finish(run, 'failed', null)
      this.#log.error('run failed', { run: run.id, error: String(error) })
    } finally {
      clearInterval(timer)
      this.#active.delete(run.id)
    }
  }

  async #pump(stream: ReadableStream<Uint8Array>, onText: (text: Uint8Array) => void): Promise<void> {
    const reader = stream.getReader()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) onText(value)
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // Already released.
      }
    }
  }
}

export { DEFAULT_OUTPUT_LIMIT }
