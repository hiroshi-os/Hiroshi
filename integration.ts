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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { connectStdio, type App, type TreeNode } from '@gpuix/react/automation'

import { toolFixture } from './engine/test/tool-fixture'

import { engineClient, type EngineClient } from './src/engine/client'
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
/** A command the session's inbox can be steered past. */
const INBOX_COMMAND = process.platform === 'win32' ? 'Start-Sleep -Seconds 30' : 'sleep 30'
/** The prompt admitted while that command is going, delivered by the interrupt. */
const INBOX_PROMPT = 'also-update-the-changelog'

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

async function openWindow(env: NodeJS.ProcessEnv, workspace: string): Promise<WindowSession> {
  const child = spawn(process.execPath, [path.resolve(import.meta.dir, 'app.tsx')], {
    cwd: workspace,
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
  const workspace = path.join(home, 'workspace')
  mkdirSync(workspace)
  writeFileSync(path.join(workspace, 'huge.txt'), 'window-full-output-marker\n' + 'z'.repeat(32 * 1024))
  const window = await openWindow({
    HIROSHI_HOME: home,
    HIROSHI_TOOL_FIXTURE_KEY: 'local-window-fixture',
    // Do not take the keyboard away from whoever is sitting at the machine.
    GPUIX_BACKGROUND: '1',
  }, workspace)

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

    // The inbox, through the window: a prompt admitted while a command is going
    // waits, and the interrupt stops the command and delivers it.
    await submit(app, INBOX_COMMAND)
    await app.getByTestId('interrupt-session').waitFor({ timeoutMs: STEP_DEADLINE_MS })

    await app.getByTestId('prompt-mode-steer').click()
    const promptInput = app.getByTestId('prompt-input')
    await promptInput.fill(INBOX_PROMPT)
    await promptInput.press('enter')

    await waitUntil(
      async () => {
        const text = await treeText(app)
        return text.includes('1 PENDING') && text.includes(INBOX_PROMPT) ? text : false
      },
      'the prompt to wait in the session inbox',
      STEP_DEADLINE_MS,
    )
    note('the prompt is waiting in the inbox, and the command is still running')

    await app.getByTestId('interrupt-session').click()
    const delivered = await waitUntil(
      async () => {
        const text = await treeText(app)
        return text.includes('0 PENDING') && text.includes('1 DELIVERED') ? text : false
      },
      'the interrupt to deliver the pending prompt',
      STEP_DEADLINE_MS,
    )
    check(
      delivered.includes('the operator stopped this command'),
      `the stopped run does not say why it stopped:\n${delivered}`,
    )
    note('the interrupt stopped the run and delivered the pending prompt')

    // The delivered prompt is a durable step: the local provider's answer is
    // in the transcript, and the strip shows which provider, attempt and
    // status produced it.
    const stepped = await waitUntil(
      async () => {
        const text = await treeText(app)
        return text.includes('STEP · LOCAL · SUCCEEDED') &&
          text.includes('The local provider received: also-update-the-changelog')
          ? text
          : false
      },
      'the step that answers the delivered prompt to finish',
      STEP_DEADLINE_MS,
    )
    check(stepped.includes('ATTEMPT 1'), `the step strip does not show its attempt:\n${stepped}`)
    note('the delivered prompt ran as a durable step and its answer is in the strip')

    // The main composer uses the engine catalog, and its transcript draws
    // provider failures and real streamed answers rather than demo replies.
    await app.getByTestId('model-picker').click()
    await app.getByTestId('model-restricted/chat').click()
    const composer = app.getByTestId('composer')
    await composer.fill('window-provider-denial')
    await composer.press('enter')
    await waitUntil(async () => {
      const nodes = await app.getByTestId('engine-transcript').all()
      return nodes.some((node) => flatten(node).join('\n').includes('provider_denied')) || false
    }, 'a policy denial in the main transcript')
    note('the main transcript shows the denied provider')

    await app.getByTestId('model-picker').click()
    await app.getByTestId('model-local/echo').click()
    await composer.fill('window-main-composer')
    await composer.press('enter')
    await waitUntil(async () => {
      const nodes = await app.getByTestId('engine-transcript').all()
      return nodes.some((node) => flatten(node).join('\n').includes('The local provider received: window-main-composer')) || false
    }, 'the selected engine model to answer in the main transcript')
    const selected = await app.getByTestId('model-picker').textContent()
    check(selected.includes('Local echo'), `the picker did not show the selected engine model: ${selected}`)
    note('the main composer used the catalog model and drew its real answer')

    // Real tool requests travel through the daemon and the cockpit's gate.
    await app.getByTestId('model-picker').click()
    await app.getByTestId('model-fixture/tools').click()
    const record = readRegistry(localPaths(home).registry)!
    const client = engineClient(record)
    const pending = async () => {
      for (const session of (await client.listSessions()).sessions) {
        const detail = await client.session({ id: session.id })
        const permission = detail.permissions.find((p) => p.state === 'pending')
        if (permission) return { detail, permission }
      }
      return false
    }
    for (const action of ['allow', 'deny'] as const) {
      await composer.fill(action === 'allow' ? 'approve' : 'deny')
      await composer.press('enter')
      const { permission } = await waitUntil(pending, 'the model tool permission question')
      await app.getByTestId(`permission-${permission.id}`).waitFor()
      check(!existsSync(path.join(workspace, action === 'allow' ? 'approved.txt' : 'denied.txt')), 'the tool ran before its answer')
      if (action === 'allow') await app.getByTestId(`permission-remember-${permission.id}`).click()
      await app.getByTestId(`permission-${action}-${permission.id}`).click()
      await waitUntil(async () => (await treeText(app)).includes(`Tool turn complete: ${action === 'allow' ? 'approve' : 'deny'}`) || false,
        'the model to continue after the cockpit answer')
      if (action === 'allow') check(readFileSync(path.join(workspace, 'approved.txt'), 'utf8') === 'approved from the model', 'the approved write did not run')
      else check(!existsSync(path.join(workspace, 'denied.txt')), 'the declined write ran')
      note(`the cockpit answered ${action} and the model continued`)
    }
    await composer.fill('huge')
    await composer.press('enter')
    const { permission: huge } = await waitUntil(pending, 'the large read permission')
    await app.getByTestId(`permission-allow-${huge.id}`).waitFor()
    await app.getByTestId(`permission-allow-${huge.id}`).click()
    await waitUntil(async () => (await treeText(app)).includes('Tool turn complete: huge') || false, 'the large read to finish')
    await app.getByTestId(`tool-output-${huge.toolCallID}`).click()
    await app.getByTestId('tool-output-viewer').waitFor()
    check((await treeText(app)).includes('window-full-output-marker'), 'the full output did not open')
    try {
      const shots = path.join(process.cwd(), 'screenshots')
      mkdirSync(shots, { recursive: true })
      await app.screenshot({ path: path.join(shots, 'windowed-tools.png') })
    } catch (error) { note(`tool screenshot unavailable: ${String(error)}`) }
    await app.getByTestId('tool-output-close').click()
    note('the cockpit opened the complete managed tool result')

    // A checkpoint precedes the prompt, so one click restores code and chat.
    writeFileSync(path.join(workspace, 'approved.txt'), 'window-before-checkpoint')
    await composer.fill('checkpoint-window-change')
    await composer.press('enter')
    await waitUntil(async () => (await treeText(app)).includes('Tool turn complete: checkpoint-window-change') || false, 'the checkpointed tool turn to finish')
    check(readFileSync(path.join(workspace, 'approved.txt'), 'utf8') === 'approved from the model', 'the checkpointed tool did not change the workspace')
    const target = await waitUntil(async () => {
      for (const session of (await client.listSessions()).sessions) {
        const detail = await client.session({ id: session.id })
        const checkpoint = detail.checkpoints.find((checkpoint) => checkpoint.label === 'checkpoint-window-change')
        if (checkpoint) return checkpoint
      }
      return false
    }, 'the pre-prompt checkpoint')
    await app.getByTestId('checkpoint-toggle').click()
    await app.getByTestId(`checkpoint-restore-${target.id}`).waitFor()
    await app.getByTestId(`checkpoint-restore-${target.id}`).click()
    await waitUntil(async () => {
      const nodes = await app.getByTestId('engine-transcript').all()
      const text = nodes.map((node) => flatten(node).join('\n')).join('\n')
      return text.includes('Rewound workspace and conversation to checkpoint') && !text.includes('Tool turn complete: checkpoint-window-change') || false
    }, 'the checkpoint rewind to update the main transcript')
    check(readFileSync(path.join(workspace, 'approved.txt'), 'utf8') === 'window-before-checkpoint', 'the checkpoint did not restore the workspace')
    await app.getByTestId('checkpoint-toggle').click()
    await app.getByTestId('rewind-history-toggle').click()
    await app.getByTestId('rewind-archived-history').waitFor()
    check((await treeText(app)).includes('Tool turn complete: checkpoint-window-change'), 'rewound history was lost')
    try {
      const shots = path.join(process.cwd(), 'screenshots')
      mkdirSync(shots, { recursive: true })
      await app.screenshot({ path: path.join(shots, 'windowed-checkpoints.png') })
    } catch (error) { note(`checkpoint screenshot unavailable: ${String(error)}`) }
    await app.getByTestId('rewind-history-toggle').click()
    note('the cockpit restored workspace and conversation together, retaining earlier history')

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
      const { sessions } = await client.listSessions()
      for (const session of sessions) {
        const detail = await client.session({ id: session.id })
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
        await engineClient({ url: record.url, token: record.token }).shutdown()
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
  const fixture = toolFixture()
  writeFileSync(path.join(home, 'providers.json'), JSON.stringify({
    providers: [{ id: 'restricted', adapter: 'openai', models: [{
      id: 'chat', model: 'fixture-never-called', label: 'Restricted model', contextWindow: 32768, reservedOutput: 1024,
    }] }, fixture.provider],
    policy: [{ provider: 'restricted', action: 'deny' }],
  }))
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
    const client = engineClient({ url: record.url, token: record.token })
    const survivor = await readTheSurvivor(client)

    check(survivor.status === 'succeeded', `the run ended as ${survivor.status}, not succeeded`)
    check(survivor.exitCode === 0, `the run exited with ${survivor.exitCode}, not 0`)
    check(
      survivor.output.includes(SURVIVOR),
      `the durable log does not hold the run's output: ${JSON.stringify(survivor.output)}`,
    )
    note(`the run outlived the window: exit ${survivor.exitCode}, "${SURVIVOR}" is in the log`)
    const reopened = await openWindow({ HIROSHI_HOME: home, GPUIX_BACKGROUND: '1', HIROSHI_TOOL_FIXTURE_KEY: 'local-window-fixture' }, path.join(home, 'workspace'))
    try {
      await waitUntil(async () => (await treeText(reopened.app)).includes('Rewound workspace and conversation to checkpoint') || false,
        'the reopened cockpit to show the restored conversation')
      const nodes = await reopened.app.getByTestId('engine-transcript').all()
      check(!nodes.map((node) => flatten(node).join('\n')).join('\n').includes('Tool turn complete: checkpoint-window-change'), 'reopening restored the archived turn into the active conversation')
      note('reopening the cockpit preserved the rewind and its active transcript')
    } finally { await reopened.close() }

  } catch (error) {
    failure = error
  }

  await stopTheDaemon(home)
  fixture.server.stop(true)
  if (failure) throw failure
  note('all assertions passed')
}

await main()
