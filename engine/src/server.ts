/**
 * The HTTP surface.
 *
 * Commands go in over `POST`, state goes out over one event feed. The feed is
 * a single stream: the client names the last sequence it has and gets every
 * durable event after it, then everything that happens next. A client that
 * stops reading is disconnected instead of being allowed to grow the daemon's
 * memory, and the other clients never notice.
 */

import { timingSafeEqual } from 'node:crypto'

import { EngineError, invalid, notFound } from './errors'
import type { Logger } from './log'
import type {
  CreateSessionRequest,
  EventRecord,
  Health,
  PromptRequest,
  StartRunRequest,
} from './protocol'
import { ENGINE_NAME } from './protocol'
import type { Runs } from './runs'
import type { Sessions } from './sessions'
import type { Store } from './store'

export interface ServerOptions {
  store: Store
  runs: Runs
  sessions: Sessions
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
  const { store, runs, sessions, log } = options

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
    const encoder = new TextEncoder()

    let unsubscribe: (() => void) | null = null
    let heartbeat: ReturnType<typeof setInterval> | null = null
    let closed = false

    const cleanup = () => {
      if (closed) return
      closed = true
      unsubscribe?.()
      if (heartbeat) clearInterval(heartbeat)
    }

    const stream = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          const send = (frame: string) => {
            if (closed) return
            try {
              controller.enqueue(encoder.encode(frame))
            } catch {
              cleanup()
            }
          }
          const sendEvent = (event: EventRecord) => send(`data: ${JSON.stringify(event)}\n\n`)

          // Replay what the client missed, in order, before it sees anything live.
          for (const event of store.eventsSince(after)) sendEvent(event)
          send(': listening\n\n')

          unsubscribe = store.subscribe((event) => {
            // The queue is bounded by the stream's high water mark. A client
            // that has not read for 1024 events is dropped: only that client.
            if (controller.desiredSize !== null && controller.desiredSize <= 0) {
              send('event: overflow\ndata: {"reason":"client_too_slow"}\n\n')
              cleanup()
              try {
                controller.close()
              } catch {
                // Already closed by the client.
              }
              return
            }
            sendEvent(event)
          })

          heartbeat = setInterval(() => send(': heartbeat\n\n'), 15_000)
          ;(heartbeat as unknown as { unref?: () => void }).unref?.()

          signal?.addEventListener('abort', () => {
            cleanup()
            try {
              controller.close()
            } catch {
              // Already closed.
            }
          })
        },
        cancel() {
          cleanup()
        },
      },
      new CountQueuingStrategy({ highWaterMark: 1024 }),
    )

    return new Response(stream, { headers: SSE_HEADERS })
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method

    if (!authorized(request, options.token)) {
      return failure('unauthorized', 'a bearer token is required', 401)
    }

    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'v1') return failure('not_found', `${method} ${url.pathname} is not a route`, 404)
    const [, resource, id, action] = parts

    if (resource === 'health' && !id && method === 'GET') return json(health())

    if (resource === 'sessions') {
      if (!id && method === 'GET') return json({ sessions: sessions.list() })
      if (!id && method === 'POST') {
        const input = await body<CreateSessionRequest>(request)
        return json({ session: sessions.create(input) }, 201)
      }
      if (id && !action && method === 'GET') return json(sessions.detail(id))
      if (id && action === 'messages' && method === 'POST') {
        const input = await body<PromptRequest>(request)
        return json({ message: sessions.prompt(id, input.text ?? '') }, 201)
      }
      if (id && action === 'runs' && method === 'POST') {
        const input = await body<StartRunRequest>(request)
        return json({ run: runs.start(id, input.command ?? '', input.cwd) }, 201)
      }
    }

    if (resource === 'runs' && id) {
      if (!action && method === 'GET') {
        const run = store.run(id)
        if (!run) throw notFound('run')
        return json({ run, chunks: store.chunks(id) })
      }
      if (action === 'cancel' && method === 'POST') return json({ run: runs.cancel(id) })
    }

    if (resource === 'events' && !id && method === 'GET') return feed(url, request.signal)

    if (resource === 'shutdown' && !id && method === 'POST') {
      setTimeout(options.onShutdown, 25)
      return json({ ok: true })
    }

    return failure('not_found', `${method} ${url.pathname} is not a route`, 404)
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
    stop: () => server.stop(true),
  }
}
