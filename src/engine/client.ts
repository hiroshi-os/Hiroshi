/**
 * A typed client for the engine.
 *
 * Plain `fetch`, no runtime imports: the cockpit uses it, the tests use it,
 * and a browser build can carry it without dragging a process API along.
 */

import type {
  CreateSessionRequest,
  EventRecord,
  Health,
  Message,
  Run,
  RunDetail,
  Session,
  SessionDetail,
  SessionsResponse,
} from '../../engine/src/protocol'

export interface EngineConnection {
  url: string
  token: string
}

export class EngineRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'EngineRequestError'
  }
}

export interface FeedOptions {
  after: number
  signal?: AbortSignal
  onEvent: (event: EventRecord) => void
  onOpen?: () => void
  onOverflow?: (reason: string) => void
}

const REQUEST_TIMEOUT_MS = 15_000

export class EngineClient {
  readonly url: string
  readonly token: string
  readonly #fetch: typeof fetch

  constructor(connection: EngineConnection, fetchImpl: typeof fetch = fetch) {
    this.url = connection.url.replace(/\/+$/, '')
    this.token = connection.token
    this.#fetch = fetchImpl
  }

  get connection(): EngineConnection {
    return { url: this.url, token: this.token }
  }

  #headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }
  }

  async #request<T>(method: string, path: string, payload?: unknown): Promise<T> {
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await this.#fetch(`${this.url}${path}`, {
        method,
        headers: this.#headers(),
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal,
      })
    } catch (error) {
      throw new EngineRequestError(0, 'unreachable', `the engine did not answer: ${String(error)}`)
    }

    const text = await response.text()
    let parsed: any = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }

    if (!response.ok) {
      const code = parsed?.error?.code ?? 'request_failed'
      const message = parsed?.error?.message ?? `${method} ${path} failed with ${response.status}`
      throw new EngineRequestError(response.status, code, message)
    }

    return parsed as T
  }

  health(): Promise<Health> {
    return this.#request<Health>('GET', '/v1/health')
  }

  async sessions(): Promise<Session[]> {
    const response = await this.#request<SessionsResponse>('GET', '/v1/sessions')
    return response.sessions
  }

  async createSession(input: CreateSessionRequest): Promise<Session> {
    const response = await this.#request<{ session: Session }>('POST', '/v1/sessions', input)
    return response.session
  }

  session(id: string): Promise<SessionDetail> {
    return this.#request<SessionDetail>('GET', `/v1/sessions/${encodeURIComponent(id)}`)
  }

  async prompt(id: string, text: string): Promise<Message> {
    const response = await this.#request<{ message: Message }>(
      'POST',
      `/v1/sessions/${encodeURIComponent(id)}/messages`,
      { text },
    )
    return response.message
  }

  async startRun(sessionID: string, command: string, cwd?: string): Promise<Run> {
    const response = await this.#request<{ run: Run }>(
      'POST',
      `/v1/sessions/${encodeURIComponent(sessionID)}/runs`,
      { command, cwd },
    )
    return response.run
  }

  run(id: string): Promise<RunDetail> {
    return this.#request<RunDetail>('GET', `/v1/runs/${encodeURIComponent(id)}`)
  }

  async cancelRun(id: string): Promise<Run> {
    const response = await this.#request<{ run: Run }>('POST', `/v1/runs/${encodeURIComponent(id)}/cancel`)
    return response.run
  }

  async shutdown(): Promise<void> {
    await this.#request<{ ok: boolean }>('POST', '/v1/shutdown')
  }

  /**
   * Follow the durable feed from `after` until the stream ends.
   *
   * Resolves when the daemon closes the connection (a slow client, a
   * shutdown) or the caller aborts. The caller decides how to reconnect: the
   * engine keeps the sequence numbers, so a reconnect resumes exactly where
   * the last received event left off.
   */
  async feed(options: FeedOptions): Promise<void> {
    let response: Response
    try {
      response = await this.#fetch(`${this.url}/v1/events?after=${options.after}`, {
        headers: { authorization: `Bearer ${this.token}`, accept: 'text/event-stream' },
        signal: options.signal,
      })
    } catch (error) {
      if (options.signal?.aborted) return
      throw new EngineRequestError(0, 'unreachable', `the engine feed did not open: ${String(error)}`)
    }

    if (!response.ok || !response.body) {
      throw new EngineRequestError(response.status, 'feed_failed', `the engine feed answered ${response.status}`)
    }

    options.onOpen?.()

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let boundary = buffer.indexOf('\n\n')
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          this.#dispatch(frame, options)
          boundary = buffer.indexOf('\n\n')
        }
      }
    } catch (error) {
      // An aborted feed is a feed the caller meant to close.
      if (options.signal?.aborted) return
      throw error
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // Already released.
      }
    }
  }

  #dispatch(frame: string, options: FeedOptions): void {
    let eventName = 'message'
    const data: string[] = []

    for (const line of frame.split('\n')) {
      if (line.startsWith(':')) continue
      if (line.startsWith('event:')) eventName = line.slice('event:'.length).trim()
      else if (line.startsWith('data:')) data.push(line.slice('data:'.length).trimStart())
    }

    if (eventName === 'overflow') {
      let reason = 'client_too_slow'
      try {
        reason = (JSON.parse(data.join('\n')) as { reason?: string }).reason ?? reason
      } catch {
        // Keep the default reason.
      }
      options.onOverflow?.(reason)
      return
    }

    if (data.length === 0) return
    try {
      options.onEvent(JSON.parse(data.join('\n')) as EventRecord)
    } catch {
      // A frame the engine cannot have written. Skip it rather than drop the feed.
    }
  }
}
