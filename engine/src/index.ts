#!/usr/bin/env bun
/**
 * Hiroshi engine.
 *
 *   hiroshi-engine serve    run the daemon (the default)
 *   hiroshi-engine status   report the daemon the registry points at
 *   hiroshi-engine stop     ask the daemon to shut down
 *   hiroshi-engine version  print the version and the protocol
 *
 * The daemon outlives whatever started it. It writes its URL, pid and bearer
 * token to `<data>/engine.json` once it is listening, and every client finds
 * it there. Closing the cockpit never stops a run; only `stop` does.
 */

import { mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

import { ENGINE_NAME, ENGINE_VERSION, PROTOCOL_VERSION, type RegistryRecord } from './protocol'
import { enginePaths, type EnginePaths } from './paths'
import { createLogger, type Logger } from './log'
import { Store } from './store'
import { Inbox } from './inbox'
import { Sessions } from './sessions'
import { Runs } from './runs'
import { startServer } from './server'
import {
  acquireStartLock,
  clearRegistry,
  discover,
  processAlive,
  releaseStartLock,
  removeRegistry,
  writeRegistry,
  type Discovery,
} from './registry'

type Flags = Record<string, string | boolean>

function parse(argv: string[]): { command: string; flags: Flags; positionals: string[] } {
  const flags: Flags = {}
  const positionals: string[] = []
  let command = ''

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (arg.startsWith('--')) {
      const [key, inline] = arg.slice(2).split('=', 2)
      if (inline !== undefined) flags[key!] = inline
      else if (argv[index + 1] && !argv[index + 1]!.startsWith('--')) flags[key!] = argv[++index]!
      else flags[key!] = true
      continue
    }
    if (!command) command = arg
    else positionals.push(arg)
  }

  return { command: command || 'serve', flags, positionals }
}

function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name]
  return typeof value === 'string' ? value : undefined
}

function numberFlag(flags: Flags, name: string): number | undefined {
  const value = stringFlag(flags, name)
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function resolvePaths(flags: Flags): EnginePaths {
  const home = stringFlag(flags, 'data-dir')
  return enginePaths(home)
}

function humanDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function describe(discovery: Discovery, paths: EnginePaths): string {
  if (discovery.state === 'running') {
    const { record, health } = discovery
    return [
      `${ENGINE_NAME} ${record.version} (protocol ${record.protocol})`,
      `  state:    running`,
      `  url:      ${record.url}`,
      `  pid:      ${record.pid}`,
      `  uptime:   ${humanDuration(health.uptimeMs)}`,
      `  database: ${record.database}`,
      `  log:      ${record.log}`,
    ].join('\n')
  }
  if (discovery.state === 'stale') {
    return [
      `${ENGINE_NAME} is not running`,
      `  stale registry: ${paths.registry}`,
      `  reason: ${discovery.reason}`,
    ].join('\n')
  }
  return `${ENGINE_NAME} is not running\n  no registry at ${paths.registry}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function serve(flags: Flags): Promise<number> {
  const paths = resolvePaths(flags)
  mkdirSync(paths.home, { recursive: true })
  const log = createLogger(paths.log)

  const existing = await discover(paths.registry)
  if (existing.state === 'running') {
    log.info('engine already running', { url: existing.record.url, pid: existing.record.pid })
    process.stdout.write(`${ENGINE_NAME} already running at ${existing.record.url} (pid ${existing.record.pid})\n`)
    return 0
  }
  if (existing.state === 'stale') {
    log.warn('discarding a stale registry', { reason: existing.reason })
    removeRegistry(paths.registry)
  }

  const lock = acquireStartLock(paths.lock)
  if (!lock.ok) {
    process.stdout.write(`${ENGINE_NAME} is already starting (pid ${lock.pid ?? 'unknown'})\n`)
    return 3
  }

  const store = Store.open(paths.database)
  store.migrate()

  const workspace = stringFlag(flags, 'workspace') || process.cwd()
  const inbox = new Inbox(store, log)
  const sessions = new Sessions(store, log, { cwd: workspace, inbox })
  // A run ending is the engine's safe boundary: the inbox reads the database
  // after `run.ended` is committed and delivers only when nothing is running.
  const runs = new Runs(store, log, { onIdle: (sessionID) => void inbox.deliver(sessionID) })

  // A previous process may have died mid-command. Say so rather than pretend
  // the command is still running.
  runs.settleInterrupted('hiroshi-engine: the engine stopped while this command was running; it was not resumed')
  // Settlement is a boundary of its own: prompts admitted before the crash get
  // delivered instead of waiting for a run that will never end.
  inbox.deliverIdle()

  const hostname = stringFlag(flags, 'host') || '127.0.0.1'
  const port = numberFlag(flags, 'port') ?? 0
  const startedAt = Date.now()
  const token = randomBytes(32).toString('hex')

  let shuttingDown = false
  let server: { url: string; port: number; stop: () => void }

  const shutdown = async (reason: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    log.info('shutting down', { reason })
    try {
      server.stop()
    } catch {
      // Already stopped.
    }
    await runs.stopAll()
    // A backstop: a run nothing was holding any more is genuinely unaccounted
    // for, so it gets the crash wording rather than the shutdown one.
    runs.settleInterrupted('hiroshi-engine: the engine stopped while this command was running; it was not resumed')
    clearRegistry(paths.registry, process.pid)
    releaseStartLock(paths.lock)
    store.close()
    process.exit(0)
  }

  server = startServer(
    {
      store,
      runs,
      sessions,
      log,
      token,
      version: ENGINE_VERSION,
      protocol: PROTOCOL_VERSION,
      database: paths.database,
      workspace,
      startedAt,
      onShutdown: () => void shutdown('api'),
    },
    { hostname, port },
  )

  const record: RegistryRecord = {
    name: ENGINE_NAME,
    version: ENGINE_VERSION,
    protocol: PROTOCOL_VERSION,
    url: server.url,
    host: hostname,
    port: server.port,
    pid: process.pid,
    token,
    startedAt,
    database: paths.database,
    log: paths.log,
  }
  writeRegistry(paths.registry, record)

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGHUP', () => void shutdown('SIGHUP'))

  // A daemon must not vanish because one request rejected. Log and keep serving.
  process.on('unhandledRejection', (reason) => log.error('unhandled rejection', { reason: String(reason) }))
  process.on('uncaughtException', (error) => log.error('uncaught exception', { error: error.message }))

  log.info('listening', { url: server.url, pid: process.pid, protocol: PROTOCOL_VERSION, workspace })
  process.stdout.write(
    `${ENGINE_NAME} ${ENGINE_VERSION} listening on ${server.url} (pid ${process.pid}, protocol ${PROTOCOL_VERSION})\n`,
  )

  // The HTTP server keeps the process alive; this promise never settles.
  return new Promise<number>(() => {})
}

async function status(flags: Flags): Promise<number> {
  const paths = resolvePaths(flags)
  const discovery = await discover(paths.registry)
  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ ...discovery, registry: paths.registry }, null, 2)}\n`)
    return 0
  }
  process.stdout.write(`${describe(discovery, paths)}\n`)
  return discovery.state === 'running' ? 0 : 1
}

async function stop(flags: Flags): Promise<number> {
  const paths = resolvePaths(flags)
  const discovery = await discover(paths.registry)
  if (discovery.state !== 'running') {
    removeRegistry(paths.registry)
    process.stdout.write(`${ENGINE_NAME} is not running\n`)
    return 0
  }

  const { record } = discovery
  try {
    await fetch(`${record.url}/v1/shutdown`, {
      method: 'POST',
      headers: { authorization: `Bearer ${record.token}` },
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // It may already be on its way out.
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (!processAlive(record.pid)) break
    await sleep(100)
  }

  if (processAlive(record.pid)) {
    try {
      if (process.platform === 'win32') {
        Bun.spawnSync({ cmd: ['taskkill', '/pid', String(record.pid), '/t', '/f'], stdio: ['ignore', 'ignore', 'ignore'] })
      } else {
        process.kill(record.pid, 'SIGKILL')
      }
    } catch {
      // Gone between the check and the signal.
    }
  }

  removeRegistry(paths.registry)
  process.stdout.write(`${ENGINE_NAME} stopped (pid ${record.pid})\n`)
  return 0
}

async function main(): Promise<number> {
  const { command, flags } = parse(process.argv.slice(2))

  if (flags.help || command === 'help') {
    process.stdout.write(
      [
        `${ENGINE_NAME} ${ENGINE_VERSION} (protocol ${PROTOCOL_VERSION})`,
        '',
        'usage: hiroshi-engine <command> [flags]',
        '',
        '  serve     run the daemon in the foreground (default)',
        '  status    report the daemon the registry points at',
        '  stop      ask the running daemon to shut down',
        '  version   print the version and the protocol version',
        '',
        'flags:',
        '  --data-dir <path>  where the database, registry and log live',
        '  --workspace <path> the directory new sessions start in',
        '  --host <address>   bind address, loopback by default',
        '  --port <number>    bind port, an ephemeral one by default',
        '  --json             machine readable `status`',
        '',
      ].join('\n'),
    )
    return 0
  }

  if (command === 'version') {
    process.stdout.write(`${ENGINE_NAME} ${ENGINE_VERSION} (protocol ${PROTOCOL_VERSION})\n`)
    return 0
  }

  if (command === 'serve') return serve(flags)
  if (command === 'status') return status(flags)
  if (command === 'stop') return stop(flags)

  process.stderr.write(`hiroshi-engine: unknown command "${command}"\n`)
  return 2
}

const code = await main()
process.exit(code)
