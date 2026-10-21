/**
 * Sessions: the durable unit a client attaches to.
 *
 * Creating one and prompting one are both recorded facts, not rows inserted
 * behind the client's back. The title is derived once from the first prompt so
 * the sidebar has something to show, and it is never derived again.
 */

import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

import { invalid, notFound } from './errors'
import type { Logger } from './log'
import type { CreateSessionRequest, Message, Session, SessionDetail } from './protocol'
import type { Store } from './store'

const DEFAULT_TITLE = 'New task'
const TITLE_LIMIT = 64

function newSessionID(): string {
  return `ses_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function titleFromText(text: string): string {
  const firstLine = text.trim().split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (!firstLine) return DEFAULT_TITLE
  return firstLine.length > TITLE_LIMIT ? `${firstLine.slice(0, TITLE_LIMIT - 1)}…` : firstLine
}

export class Sessions {
  readonly #store: Store
  readonly #log: Logger
  readonly #defaultCwd: string

  constructor(store: Store, log: Logger, defaults: { cwd: string }) {
    this.#store = store
    this.#log = log.child('sessions')
    this.#defaultCwd = defaults.cwd
  }

  create(input: CreateSessionRequest = {}): Session {
    const cwd = path.resolve(input.cwd || this.#defaultCwd)
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
      throw invalid('bad_working_directory', `${cwd} is not a directory`)
    }

    const at = Date.now()
    const id = newSessionID()
    const title = input.title?.trim() || DEFAULT_TITLE
    const session = { id, title, cwd, createdAt: at, updatedAt: at }

    this.#store.record({
      type: 'session.created',
      sessionID: id,
      data: { session: { ...session, runs: 0, running: 0, lastRunAt: null } },
      at,
      project: () => this.#store.createSession(session),
    })

    this.#log.info('session created', { session: id, cwd })
    return this.#store.session(id)!
  }

  list(): Session[] {
    return this.#store.sessions()
  }

  detail(id: string): SessionDetail {
    const detail = this.#store.snapshot(id)
    if (!detail) throw notFound('session')
    return detail
  }

  prompt(id: string, text: string): Message {
    const session = this.#store.session(id)
    if (!session) throw notFound('session')
    const body = text.trim()
    if (!body) throw invalid('empty_prompt', 'text is required')

    const at = Date.now()
    const message = this.#store.appendMessage(id, 'user', body, at)
    const rename = session.title === DEFAULT_TITLE ? titleFromText(body) : null

    this.#store.record({
      type: 'message.created',
      sessionID: id,
      data: { message },
      at,
      project: () => {
        if (rename) this.#store.renameSession(id, rename, at)
        else this.#store.touchSession(id, at)
      },
    })

    if (rename) {
      this.#store.record({
        type: 'session.updated',
        sessionID: id,
        data: { session: this.#store.session(id) },
        at,
      })
    }

    return message
  }
}
