/**
 * The windowed integration test.
 *
 *   bun run test:integration
 *
 * `bun run test` drives the cockpit through GPUIX's in-process test renderer:
 * no window, no child process, no daemon. This script is the other half. It
 * starts the app the way a person starts it, drives the real window over the
 * automation protocol, and then asserts the part that only exists when every
 * piece is real: a command handed to the terminal keeps running after the
 * window is gone, and lands in the engine's durable log.
 *
 * Two things the automation client does not do for us, and `openWindow` does:
 *
 * - `launch()` waits for the app's `initialize` with no deadline. The
 *   automation server is installed *after* the native window exists
 *   (`@gpuix/native`'s `renderer.init` calls `enableAutomation`), so a machine
 *   that cannot open a window is a silent hang rather than a failure. This
 *   launcher races that wait against a deadline.
 * - `launch()` reads the child's stdout only. Whatever the app wrote to stderr
 *   on its way down is dropped, so a hang says nothing about why. Both streams
 *   are kept here and printed when a step fails.
 *
 * The daemon is the one the cockpit spawns for itself. `HIROSHI_HOME` points at
 * a scratch directory, so a run never touches the profile of the machine it
 * runs on, and the daemon is shut down on every path out of this file.
 *
 * The text assertions read the automation tree, not the painted canvas:
 * `getPaintedText` answers with nothing while the window is in the background,
 * and the tree answers either way.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { connectStdio, type App, type TreeNode } from '@gpuix/react/automation'

import { EngineClient } from './src/engine/client'
import { localPaths, readRegistry, type LocalPaths } from './src/engine/discovery'

/** How long the window may take to appear before the wait is called a hang. */
const WINDOW_DEADLINE_MS = 90_000
/** How long a single assertion may wait. */
const STEP_DEADLINE_MS = 30_000
/** How long the daemon may take to answer. */
const DAEMON_DEADLINE_MS = 60_000

/** The first command: it prints a line and exits. */
const MARKER = 'hiroshi-from-the-window'
const FIRST_COMMAND = `echo ${MARKER}`
/** The second one outlives the window, which is the whole point. */
const SURVIVOR = 'survived-the-window'
const SECOND_COMMAND = `bun -e "setTimeout(() => console.log('${SURVIVOR}'), 4000)"`

function note(line: string): void {
  console.log(`[integration] ${line}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

/** A capped buffer of what the app wrote, so a failure message stays readable. */
function createTail(limit = 16 * 1024): { push: (chunk: string) => void; text: () => string } {
  let buffer = ''
  return {
    push(chunk) {
      buffer += chunk
      if (buffer.length > limit) buffer = buffer.slice(buffer.length - limit)
    },
    text() {
      return buffer.trim()
    },
  }
}

/**
 * Split a stream into lines and hand over the ones the app wrote itself. The
 * automation protocol shares stdout with the app's logs, and a `data:` frame is
 * a reply, not a message: printing them buries the reason for a failure.
 */
function lineReader(sink: (line: string) => void): (chunk: string) => void {
  let pending = ''
  return (chunk) => {
    pending += chunk
    let boundary = pending.indexOf('\n')
    while (boundary >= 0) {
      const line = pending.slice(0, boundary)
      pending = pending.slice(boundary + 1)
      if (line && !line.startsWith('data:')) sink(line)
      boundary = pending.indexOf('\n')
    }
  }
}

async function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  // The loser of the race may reject after the race is over. That is a promise
  // nobody is waiting for any more, not an unhandled rejection.
  work.catch(() => {})
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} did not answer within ${Math.round(ms / 1000)}s`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function waitUntil<T>(
  probe: () => Promise<T | false | null | undefined>,
  what: string,
  timeoutMs = STEP_DEADLINE_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last = 'nothing yet'
  for (;;) {
    let value: T | false | null | undefined
    try {
      value = await probe()
    } catch (error) {
      // A locator that matches nothing throws. That is "not yet", not a
      // failure: the caller's deadline decides when to give up.
      value = false
      last = error instanceof Error ? error.message : String(error)
    }
    if (value !== false && value !== null && value !== undefined) return value
    if (Date.now() >= deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what} (${last})`)
    await sleep(100)
  }
}

interface WindowSession {
  app: App
  /** Everything the app itself wrote, for a failure message. */
  output: () => string
  close: () => Promise<void>
}

async function openWindow(env: NodeJS.ProcessEnv): Promise<WindowSession> {
  const child = spawn(process.execPath, ['app.tsx'], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const tail = createTail()
  const listeners: ((chunk: string) => void)[] = []
  const readStdout = lineReader((line) => tail.push(`${line}\n`))
  child.stdout?.on('data', (buffer: Buffer) => {
    const chunk = buffer.toString('utf8')
    readStdout(chunk)
    for (const listener of listeners) listener(chunk)
  })
  const readStderr = lineReader((line) => tail.push(`${line}\n`))
  child.stderr?.on('data', (buffer: Buffer) => readStderr(buffer.toString('utf8')))

  const kill = () => {
    try {
      child.kill()
    } catch {
      // Already gone.
    }
  }

  try {
    const app = await withDeadline(
      connectStdio({
        write: (chunk) => {
          child.stdin?.write(chunk)
        },
        feed: (listener) => {
          listeners.push(listener)
        },
        close: async () => kill(),
      }),
      WINDOW_DEADLINE_MS,
      'the window',
    )
    return {
      app,
      output: () => tail.text(),
      close: async () => {
        await app.close()
        kill()
      },
    }
  } catch (error) {
    kill()
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `the window could not be driven: ${reason}\n--- what the app wrote ---\n${tail.text() || '(nothing)'}`,
    )
  }
}

/** Every text node in the automation tree, in document order. */
function flatten(node: TreeNode | null): string[] {
  if (!node) return []
  const lines: string[] = []
  if (node.text) lines.push(node.text)
  for (const child of node.children ?? []) lines.push(...flatten(child))
  return lines
}

async function treeText(app: App): Promise<string> {
  const { tree } = await app.call('getTree', {})
  return flatten(tree).join('\n')
}

/** Wait until an element stops moving, so a click lands where it is drawn. */
async function settle(locator: { bounds: () => Promise<{ x: number; y: number }> }): Promise<void> {
  let previous: { x: number; y: number } | null = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const bounds = await locator.bounds()
    if (previous && bounds.x === previous.x && bounds.y === previous.y) return
    previous = bounds
    await sleep(25)
  }
}

async function openTerminal(app: App): Promise<void> {
  // The panel slides in, and the automation clicks the last painted bounds.
  // Freeze the clock, open it, advance past the animation, then wait for the
  // card to stop moving.
  await app.clock.pause()
  await app.getByTestId('panel-right-open').click()
  await app.clock.fastForward(320)
  await app.clock.resume()

  const card = app.getByTestId('surface-card-terminal')
  await card.waitFor({ timeoutMs: STEP_DEADLINE_MS })
  await settle(card)
  await card.click()
  await app.getByTestId('terminal-input').waitFor({ timeoutMs: STEP_DEADLINE_MS })
}

async function submit(app: App, command: string): Promise<void> {
  const input = app.getByTestId('terminal-input')
  await input.fill(command)
  await input.press('enter')
}

/** The text of every run card the terminal has drawn. */
async function runsText(app: App): Promise<string> {
  const runs = await app.getByTestId('terminal-run').all()
  return runs.map((run) => flatten(run).join('\n')).join('\n---\n')
}

/** The window half: the cockpit, the terminal and two commands through it. */
async function driveTheWindow(home: string): Promise<void> {
  const window = await openWindow({
    HIROSHI_HOME: home,
    // Do not take the keyboard away from whoever is sitting at the machine.
    GPUIX_BACKGROUND: '1',
  })

  try {
    const { app } = window
    await app.getByTestId('composer').waitFor({ timeoutMs: WINDOW_DEADLINE_MS })
    note('the cockpit mounted')

    const mounted = await treeText(app)
    for (const line of ['New Task', 'Search', 'Local', 'master']) {
      check(mounted.includes(line), `the cockpit did not draw "${line}"`)
    }

    await openTerminal(app)
    note('the Terminal surface is open')

    // The terminal draws `terminal-offline` until a daemon answers, and the
    // listening line once one does.
    await waitUntil(
      async () => {
        const text = await treeText(app)
        if (text.includes('The daemon is listening for')) return text
        const offline = await app.getByTestId('terminal-offline').textContent()
        if (offline.trim()) throw new Error(`the terminal is offline: ${offline.trim()}`)
        return false
      },
      'the daemon to answer the cockpit',
      DAEMON_DEADLINE_MS,
    )
    note('the daemon answered')

    await submit(app, FIRST_COMMAND)
    const first = await waitUntil(
      async () => {
        const text = await runsText(app)
        return text.includes(MARKER) && text.includes('exit 0') ? text : false
      },
      'the first command to print its output and its exit code',
      STEP_DEADLINE_MS,
    )
    check(first.includes(`> ${FIRST_COMMAND}`), `the terminal did not show the command it ran:\n${first}`)
    note(`the first command came back with exit 0: ${FIRST_COMMAND}`)

    // A command that outlives the window. It is still running when the window
    // goes away, and the daemon has to finish it without one.
    await submit(app, SECOND_COMMAND)
    await waitUntil(
      async () => {
        const text = await runsText(app)
        return text.includes(SURVIVOR) && text.includes('running') ? text : false
      },
      'the long command to start',
      STEP_DEADLINE_MS,
    )
    note('the long command is running, and the window is about to close')

    // Evidence, not an assertion: a live renderer may not implement
    // screenshots, and that is not what this test is about.
    try {
      const shots = path.join(process.cwd(), 'screenshots')
      mkdirSync(shots, { recursive: true })
      await app.screenshot({ path: path.join(shots, 'windowed-terminal.png') })
      note('wrote screenshots/windowed-terminal.png')
    } catch (error) {
      note(`the window did not give a screenshot: ${error instanceof Error ? error.message : String(error)}`)
    }
  } finally {
    await window.close()
    const said = window.output()
    if (said) note(`the app wrote:\n${said}`)
  }
}

/** The daemon half: the run that started before the window closed. */
async function readTheSurvivor(client: EngineClient): Promise<{ exitCode: number | null; status: string; output: string }> {
  return waitUntil(
    async () => {
      const sessions = await client.sessions()
      for (const session of sessions) {
        const detail = await client.session(session.id)
        const run = detail.runs.find((candidate) => candidate.command.includes(SURVIVOR))
        if (!run) continue
        if (run.status === 'running') return false
        const output = detail.chunks
          .filter((chunk) => chunk.runID === run.id)
          .map((chunk) => chunk.data)
          .join('')
        return { exitCode: run.exitCode, status: run.status, output }
      }
      return false
    },
    'the run that started before the window closed to finish',
    DAEMON_DEADLINE_MS,
  )
}

/**
 * Stop the daemon the cockpit started.
 *
 * The cockpit spawns it during mount and leaves it running on purpose, so the
 * test is the only thing that will ever stop it. An assertion that fails early
 * can get here before the daemon has written its discovery file, so this waits
 * for the file rather than reading it once: a failed run must not leave a
 * daemon behind either.
 */
async function stopTheDaemon(home: string): Promise<void> {
  const registry = localPaths(home).registry
  const giveUpAt = Date.now() + DAEMON_DEADLINE_MS
  for (;;) {
    const record = readRegistry(registry)
    if (record) {
      try {
        await new EngineClient({ url: record.url, token: record.token }).shutdown()
        note(`the daemon is shut down (pid ${record.pid})`)
      } catch (error) {
        note(`the daemon did not answer the shutdown: ${error instanceof Error ? error.message : String(error)}`)
      }
      return
    }
    if (Date.now() >= giveUpAt) {
      note('no daemon was left behind')
      return
    }
    await sleep(200)
  }
}

async function main(): Promise<void> {
  const home = mkdtempSync(path.join(tmpdir(), 'hiroshi-windowed-'))
  const paths: LocalPaths = localPaths(home)
  note(`HIROSHI_HOME is ${home}`)

  let failure: unknown = null
  try {
    await driveTheWindow(home)
    note('the window is closed; the daemon is on its own')

    const record = await waitUntil(
      async () => readRegistry(paths.registry),
      'the discovery file the cockpit left behind',
      STEP_DEADLINE_MS,
    )
    const client = new EngineClient({ url: record.url, token: record.token })
    const survivor = await readTheSurvivor(client)

    check(survivor.status === 'succeeded', `the run ended as ${survivor.status}, not succeeded`)
    check(survivor.exitCode === 0, `the run exited with ${survivor.exitCode}, not 0`)
    check(
      survivor.output.includes(SURVIVOR),
      `the durable log does not hold the run's output: ${JSON.stringify(survivor.output)}`,
    )
    note(`the run outlived the window: exit ${survivor.exitCode}, "${SURVIVOR}" is in the log`)
  } catch (error) {
    failure = error
  }

  await stopTheDaemon(home)
  if (failure) throw failure
  note('all assertions passed')
}

await main()
