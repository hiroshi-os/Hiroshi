/**
 * The HTTP surface.
 *
 * Commands go in over `POST`, state goes out over one event feed. The feed
 * encodes each event once and gives every connection its own bounded queue: a
 * client that stops reading is closed with an `overflow` frame instead of
 * being allowed to grow the daemon's memory, and the other clients never
 * notice. Replay and live delivery share the same encoder and the same order.
 */

import { timingSafeEqual } from 'node:crypto'

import { EngineError, invalid, notFound } from './errors'
import { Feed } from './feed'
import type { ProviderCatalog } from './providers/catalog'
import type { Logger } from './log'
import type { CreateSessionRequest, Health, InterruptRequest, PromptRequest, StartRunRequest } from './protocol'
import { ENGINE_NAME, FEED_PATH, matchOperation } from './protocol'
import type { Runs } from './runs'
import type { Sessions } from './sessions'
import type { Steps } from './steps'
import type { Store } from './store'

export interface ServerOptions {
  store: Store
  runs: Runs
  sessions: Sessions
  steps: Steps
  catalog?: ProviderCatalog
  log: Logger
  token: string
  version: string
  protocol: number
  database: string
  workspace: string
  startedAt: number
  onShutdown: () => void
}

export interface StartedServer {
  url: string
  port: number
  stop: () => void
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function failure(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status)
}

/** The handler the switch would reach only if a row had no case of its own. */
function unhandled(name: never): Response {
  return failure('internal', `the engine has no handler for ${String(name)}`, 500)
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function authorized(request: Request, token: string): boolean {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return false
  return safeEqual(header.slice('Bearer '.length), token)
}

async function body<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw invalid('bad_body', 'the request body is not JSON')
  }
}

/** The reason an interrupt carries into the step transcript. */
function operatorReason(input: InterruptRequest): string {
  const why = (input.reason ?? '').trim()
  return why ? `the operator stopped this step: ${why}` : 'the operator stopped this step'
}

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
}

export function startServer(
  options: ServerOptions,
  listen: { hostname: string; port: number },
): StartedServer {
  const { store, runs, sessions, steps, log } = options
  // One subscription to the store, one encoding per event, one queue per client.
  const hub = new Feed(store)

  function health(): Health {
    return {
      name: ENGINE_NAME,
      version: options.version,
      protocol: options.protocol,
      pid: process.pid,
      startedAt: options.startedAt,
      uptimeMs: Date.now() - options.startedAt,
      database: options.database,
      workspace: options.workspace,
      lastSeq: store.lastSeq(),
    }
  }

  function feed(url: URL, signal?: AbortSignal): Response {
    const requested = Number(url.searchParams.get('after') ?? '0')
    const after = Number.isFinite(requested) && requested > 0 ? requested : 0

    const connection = hub.open(after)
    // `request.signal` is the client hanging up. The queue goes with it.
    signal?.addEventListener('abort', () => connection.close(), { once: true })
    return new Response(connection.stream, { headers: SSE_HEADERS })
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method

    if (!authorized(request, options.token)) {
      return failure('unauthorized', 'a bearer token is required', 401)
    }

    if (url.pathname === FEED_PATH && method === 'GET') return feed(url, request.signal)

    const matched = matchOperation(method, url.pathname)
    if (!matched) return failure('not_found', `${method} ${url.pathname} is not a route`, 404)

    const { operation, params } = matched
    // The row says what a success looks like; the switch says what it means.
    const status = operation.status ?? 200

    switch (operation.name) {
      case 'models':
        return json({ models: options.catalog?.models() ?? [], defaultModel: options.catalog?.defaultModel ?? 'local/echo' }, status)

      case 'health':
        return json(health(), status)

      case 'listSessions':
        return json({ sessions: sessions.list() }, status)

      case 'createSession': {
        const input = await body<CreateSessionRequest>(request)
        return json({ session: sessions.create(input) }, status)
      }

      case 'session':
        return json(sessions.detail(params.id), status)

      case 'prompt': {
        const input = await body<PromptRequest>(request)
        const existing = typeof input.key === 'string' ? store.inboxByKey(params.id, input.key.trim()) : null
        if (!existing && input.model !== undefined && (typeof input.model !== 'string' || !options.catalog?.has(input.model))) {
          throw invalid('unknown_model', 'model must name a model in the engine catalog')
        }
        input.model ??= options.catalog?.defaultModel
        return json(sessions.prompt(params.id, input), status)
      }

      case 'interrupt': {
        const input = await body<InterruptRequest>(request)
        // The step goes first: it is the work in flight. Stopping the runs then
        // creates the boundary that delivers anything the operator had queued,
        // which may legitimately start the next step.
        const stoppedSteps = steps.interrupt(params.id, operatorReason(input))
        return json({ runs: runs.interrupt(params.id, input.reason), steps: stoppedSteps }, status)
      }

      case 'startRun': {
        const input = await body<StartRunRequest>(request)
        return json({ run: runs.start(params.id, input.command ?? '', input.cwd) }, status)
      }

      case 'run': {
        const run = store.run(params.id)
        if (!run) throw notFound('run')
        return json({ run, chunks: store.chunks(params.id) }, status)
      }

      case 'cancelRun':
        return json({ run: runs.cancel(params.id) }, status)

      case 'shutdown':
        setTimeout(options.onShutdown, 25)
        return json({ ok: true }, status)
    }

    // Unreachable while the table and the switch agree; a new row lands here
    // as a compile error rather than a route with no handler.
    return unhandled(operation.name)
  }

  const server = Bun.serve({
    hostname: listen.hostname,
    port: listen.port,
    development: false,
    fetch: async (request) => {
      try {
        return await handle(request)
      } catch (error) {
        if (error instanceof EngineError) return failure(error.code, error.message, error.status)
        log.error('request failed', {
          method: request.method,
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : String(error),
        })
        return failure('internal', 'the engine failed to handle the request', 500)
      }
    },
  })

  const host = listen.hostname === '0.0.0.0' || listen.hostname === '::' ? '127.0.0.1' : listen.hostname
  const port = server.port ?? listen.port

  return {
    url: `http://${host}:${port}`,
    port,
    stop: () => {
      hub.close()
      server.stop(true)
    },
  }
}
