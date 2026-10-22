/**
 * The durable side of the engine: one SQLite file, one write path.
 *
 * Every method that changes state goes through `record()`: the projector and
 * the event row commit in the same transaction, and subscribers are told only
 * after the transaction is on disk. Nothing outside this file writes SQL, so
 * "the log is the truth and the tables are a projection of it" stays true by
 * construction rather than by convention.
 *
 * The engine is the only writer. It opens the database with WAL, so a reader
 * (a second daemon inspecting a stale file, a script) never blocks a write.
 */

import { Database } from 'bun:sqlite'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

import type {
  DeliveryMode,
  EngineEvent,
  EventPayloads,
  EventType,
  InboxItem,
  InboxState,
  Message,
  MessageRole,
  OutputStream,
  Run,
  RunChunk,
  RunStatus,
  Session,
  SessionDetail,
} from './protocol'

interface Migration {
  id: number
  name: string
  sql: string
}

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'core',
    sql: `
      create table session (
        id         text primary key,
        title      text not null,
        cwd        text not null,
        created_at integer not null,
        updated_at integer not null
      );

      create table message (
        id         text primary key,
        session_id text not null references session(id) on delete cascade,
        seq        integer not null,
        role       text not null,
        text       text not null,
        at         integer not null,
        unique (session_id, seq)
      );

      create table run (
        id         text primary key,
        session_id text not null references session(id) on delete cascade,
        command    text not null,
        cwd        text not null,
        shell      text not null,
        status     text not null,
        exit_code  integer,
        started_at integer not null,
        ended_at   integer
      );
      create index run_session on run (session_id, started_at);
      create index run_status on run (status);

      create table run_chunk (
        run_id text not null references run(id) on delete cascade,
        seq    integer not null,
        stream text not null,
        data   text not null,
        at     integer not null,
        primary key (run_id, seq)
      );

      create table event (
        seq        integer primary key autoincrement,
        type       text not null,
        session_id text,
        run_id     text,
        at         integer not null,
        data       text not null
      );
      create index event_session on event (session_id, seq);
    `,
  },
  {
    id: 2,
    name: 'inbox',
    sql: `
      alter table message add column mode text;

      create table inbox (
        id           text primary key,
        session_id   text not null references session(id) on delete cascade,
        seq          integer not null,
        text         text not null,
        mode         text not null,
        state        text not null,
        key          text,
        admitted_at  integer not null,
        delivered_at integer,
        message_id   text references message(id) on delete set null,
        unique (session_id, seq)
      );
      create unique index inbox_key on inbox (session_id, key) where key is not null;
      create index inbox_pending on inbox (session_id, state, seq);
    `,
  },
]

type Row = Record<string, any>

const SESSION_SELECT = `
  select s.id, s.title, s.cwd, s.created_at, s.updated_at,
    (select count(*) from run r where r.session_id = s.id)                              as runs,
    (select count(*) from run r where r.session_id = s.id and r.status = 'running')    as running,
    (select max(r.started_at) from run r where r.session_id = s.id)                    as last_run_at
  from session s`

function toSession(row: Row): Session {
  return {
    id: row.id,
    title: row.title,
    cwd: row.cwd,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    runs: row.runs ?? 0,
    running: row.running ?? 0,
    lastRunAt: row.last_run_at ?? null,
  }
}

function toMessage(row: Row): Message {
  const message: Message = {
    id: row.id,
    sessionID: row.session_id,
    seq: row.seq,
    role: row.role as MessageRole,
    text: row.text,
    at: row.at,
  }
  if (row.mode) message.mode = row.mode as DeliveryMode
  return message
}

function toInboxItem(row: Row): InboxItem {
  return {
    id: row.id,
    sessionID: row.session_id,
    seq: row.seq,
    text: row.text,
    mode: row.mode as DeliveryMode,
    state: row.state as InboxState,
    key: row.key ?? null,
    admittedAt: row.admitted_at,
    deliveredAt: row.delivered_at ?? null,
    messageID: row.message_id ?? null,
  }
}

function toRun(row: Row): Run {
  return {
    id: row.id,
    sessionID: row.session_id,
    command: row.command,
    cwd: row.cwd,
    shell: row.shell,
    status: row.status as RunStatus,
    exitCode: row.exit_code ?? null,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? null,
  }
}

function toChunk(row: Row): RunChunk {
  return {
    runID: row.run_id,
    seq: row.seq,
    stream: row.stream as OutputStream,
    data: row.data,
    at: row.at,
  }
}

function toEvent(row: Row): EngineEvent {
  // The daemon wrote the type and the payload together, in one insert, from a
  // record the compiler checked. Reading the pair back is the one place that
  // has to take the row's word for it.
  return {
    seq: row.seq,
    type: row.type as EventType,
    at: row.at,
    sessionID: row.session_id ?? null,
    runID: row.run_id ?? null,
    data: JSON.parse(row.data),
  } as EngineEvent
}

/** One event, minus what the store fills in. `data` is checked per type. */
export type RecordInputOf<Type extends EventType> = {
  type: Type
  data: EventPayloads[Type]
  sessionID?: string | null
  runID?: string | null
  at?: number
  /** Runs inside the same transaction as the event insert. */
  project?: () => void
}

export type RecordInput = { [Type in EventType]: RecordInputOf<Type> }[EventType]

export class Store {
  readonly #db: Database
  readonly #listeners = new Set<(event: EngineEvent) => void>()
  #closed = false

  private constructor(file: string) {
    if (file !== ':memory:') {
      const directory = dirname(file)
      if (directory && directory !== '.') mkdirSync(directory, { recursive: true })
    }
    this.#db = new Database(file, { create: true })
    this.#db.exec('pragma journal_mode = wal')
    // The engine can lose power; it must not lose the transcript. FULL is the
    // price of that promise and the engine is not a hot loop.
    this.#db.exec('pragma synchronous = full')
    this.#db.exec('pragma foreign_keys = on')
    this.#db.exec('pragma busy_timeout = 5000')
  }

  static open(file: string): Store {
    return new Store(file)
  }

  migrate(): void {
    this.#db.exec(`create table if not exists schema_migration (
      id integer primary key,
      name text not null,
      applied_at integer not null
    )`)
    const applied = new Set(
      (this.#db.query('select id from schema_migration').all() as Row[]).map((row) => row.id as number),
    )
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue
      const apply = this.#db.transaction(() => {
        this.#db.exec(migration.sql)
        this.#db.run('insert into schema_migration (id, name, applied_at) values (?, ?, ?)', [
          migration.id,
          migration.name,
          Date.now(),
        ])
      })
      apply()
    }
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#listeners.clear()
    this.#db.close()
  }

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /**
   * Append one durable fact and project it.
   *
   * The listener call happens after the transaction returns, so no subscriber
   * can observe an event whose projection is not visible yet.
   */
  record<Type extends EventType>(input: RecordInputOf<Type>): EngineEvent {
    const at = input.at ?? Date.now()
    const sessionID = input.sessionID ?? null
    const runID = input.runID ?? null
    const payload = JSON.stringify(input.data)

    const commit = this.#db.transaction(() => {
      input.project?.()
      const result = this.#db.run(
        'insert into event (type, session_id, run_id, at, data) values (?, ?, ?, ?, ?)',
        [input.type, sessionID, runID, at, payload],
      )
      return Number(result.lastInsertRowid)
    })

    const seq = commit()
    // `type` and `data` were checked against the same `EventPayloads` row by
    // the generic input, which is what this assertion restates for the union.
    const event = {
      seq,
      type: input.type,
      at,
      sessionID,
      runID,
      data: input.data,
    } as EngineEvent
    for (const listener of [...this.#listeners]) {
      try {
        listener(event)
      } catch {
        // A subscriber that throws is the subscriber's problem. Losing one
        // event for one client must not fail the write that just committed.
      }
    }
    return event
  }

  /**
   * Durable events after `after`, oldest first.
   *
   * The limit is what the caller asks for; there is no default, because a
   * default is a cap nobody named and a replay silently cut short. A caller
   * that wants a page passes one and keeps asking until it reaches its
   * watermark: the feed pages so one long replay cannot block the daemon.
   */
  eventsSince(after: number, limit?: number): EngineEvent[] {
    const statement =
      limit === undefined
        ? this.#db.query('select * from event where seq > ? order by seq asc')
        : this.#db.query('select * from event where seq > ? order by seq asc limit ?')
    const rows = (
      limit === undefined ? statement.all(after) : statement.all(after, limit)
    ) as Row[]
    return rows.map(toEvent)
  }

  lastSeq(): number {
    const row = this.#db.query('select coalesce(max(seq), 0) as seq from event').get() as Row
    return row.seq ?? 0
  }

  // -- sessions ------------------------------------------------------------

  createSession(session: Omit<Session, 'runs' | 'running' | 'lastRunAt'>): void {
    this.#db.run('insert into session (id, title, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)', [
      session.id,
      session.title,
      session.cwd,
      session.createdAt,
      session.updatedAt,
    ])
  }

  touchSession(id: string, at: number): void {
    this.#db.run('update session set updated_at = ? where id = ?', [at, id])
  }

  renameSession(id: string, title: string, at: number): void {
    this.#db.run('update session set title = ?, updated_at = ? where id = ?', [title, at, id])
  }

  session(id: string): Session | null {
    const row = this.#db.query(`${SESSION_SELECT} where s.id = ?`).get(id) as Row | null
    return row ? toSession(row) : null
  }

  sessions(): Session[] {
    const rows = this.#db.query(`${SESSION_SELECT} order by s.updated_at desc`).all() as Row[]
    return rows.map(toSession)
  }

  // -- transcript ----------------------------------------------------------

  /** Reserve the identity and sequence of a message that is not written yet. */
  newMessage(sessionID: string, role: MessageRole, text: string, at: number, mode?: DeliveryMode): Message {
    const next = this.#db
      .query('select coalesce(max(seq), -1) + 1 as seq from message where session_id = ?')
      .get(sessionID) as Row
    const message: Message = {
      id: `msg_${(at).toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      sessionID,
      seq: next.seq as number,
      role,
      text,
      at,
    }
    if (mode) message.mode = mode
    return message
  }

  /**
   * Write a reserved message. Called by the projector of the event that made
   * it durable, so the row and the event commit together.
   */
  insertMessage(message: Message): void {
    this.#db.run(
      'insert into message (id, session_id, seq, role, text, at, mode) values (?, ?, ?, ?, ?, ?, ?)',
      [message.id, message.sessionID, message.seq, message.role, message.text, message.at, message.mode ?? null],
    )
  }

  messages(sessionID: string): Message[] {
    const rows = this.#db.query('select * from message where session_id = ? order by seq asc').all(sessionID) as Row[]
    return rows.map(toMessage)
  }

  message(id: string): Message | null {
    const row = this.#db.query('select * from message where id = ?').get(id) as Row | null
    return row ? toMessage(row) : null
  }

  // -- inbox ---------------------------------------------------------------

  /** The next admission sequence inside a session. */
  inboxSeq(sessionID: string): number {
    const next = this.#db
      .query('select coalesce(max(seq), -1) + 1 as seq from inbox where session_id = ?')
      .get(sessionID) as Row
    return next.seq as number
  }

  insertInboxItem(item: InboxItem): void {
    this.#db.run(
      `insert into inbox (id, session_id, seq, text, mode, state, key, admitted_at, delivered_at, message_id)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.sessionID,
        item.seq,
        item.text,
        item.mode,
        item.state,
        item.key,
        item.admittedAt,
        item.deliveredAt,
        item.messageID,
      ],
    )
  }

  deliverInboxItem(id: string, messageID: string, at: number): void {
    this.#db.run("update inbox set state = 'delivered', delivered_at = ?, message_id = ? where id = ?", [
      at,
      messageID,
      id,
    ])
  }

  inboxItem(id: string): InboxItem | null {
    const row = this.#db.query('select * from inbox where id = ?').get(id) as Row | null
    return row ? toInboxItem(row) : null
  }

  inboxByKey(sessionID: string, key: string): InboxItem | null {
    const row = this.#db.query('select * from inbox where session_id = ? and key = ?').get(sessionID, key) as Row | null
    return row ? toInboxItem(row) : null
  }

  /** A session's inbox, oldest first. `state` narrows it to what is waiting. */
  inbox(sessionID: string, state?: InboxState): InboxItem[] {
    const statement =
      state === undefined
        ? this.#db.query('select * from inbox where session_id = ? order by seq asc')
        : this.#db.query('select * from inbox where session_id = ? and state = ? order by seq asc')
    const rows = (state === undefined ? statement.all(sessionID) : statement.all(sessionID, state)) as Row[]
    return rows.map(toInboxItem)
  }

  /** Sessions with anything still waiting, for the startup delivery sweep. */
  inboxSessions(): string[] {
    const rows = this.#db
      .query("select distinct session_id from inbox where state = 'pending' order by session_id")
      .all() as Row[]
    return rows.map((row) => row.session_id as string)
  }

  // -- runs ----------------------------------------------------------------

  insertRun(run: Run): void {
    this.#db.run(
      `insert into run (id, session_id, command, cwd, shell, status, exit_code, started_at, ended_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [run.id, run.sessionID, run.command, run.cwd, run.shell, run.status, run.exitCode, run.startedAt, run.endedAt],
    )
  }

  finishRun(id: string, status: RunStatus, exitCode: number | null, at: number): void {
    this.#db.run('update run set status = ?, exit_code = ?, ended_at = ? where id = ?', [status, exitCode, at, id])
  }

  run(id: string): Run | null {
    const row = this.#db.query('select * from run where id = ?').get(id) as Row | null
    return row ? toRun(row) : null
  }

  runs(sessionID: string): Run[] {
    const rows = this.#db.query('select * from run where session_id = ? order by started_at asc').all(sessionID) as Row[]
    return rows.map(toRun)
  }

  /** Runs a dead process left behind, for the startup sweep. */
  runningRuns(sessionID?: string): Run[] {
    const statement =
      sessionID === undefined
        ? this.#db.query("select * from run where status = 'running' order by started_at asc")
        : this.#db.query("select * from run where status = 'running' and session_id = ? order by started_at asc")
    const rows = (sessionID === undefined ? statement.all() : statement.all(sessionID)) as Row[]
    return rows.map(toRun)
  }

  appendChunk(runID: string, stream: OutputStream, data: string, at: number): RunChunk {
    const next = this.#db
      .query('select coalesce(max(seq), -1) + 1 as seq from run_chunk where run_id = ?')
      .get(runID) as Row
    const chunk: RunChunk = { runID, seq: next.seq as number, stream, data, at }
    this.#db.run('insert into run_chunk (run_id, seq, stream, data, at) values (?, ?, ?, ?, ?)', [
      chunk.runID,
      chunk.seq,
      chunk.stream,
      chunk.data,
      chunk.at,
    ])
    return chunk
  }

  chunks(runID: string): RunChunk[] {
    const rows = this.#db.query('select * from run_chunk where run_id = ? order by seq asc').all(runID) as Row[]
    return rows.map(toChunk)
  }

  chunksForSession(sessionID: string): RunChunk[] {
    const rows = this.#db
      .query(
        `select c.* from run_chunk c join run r on r.id = c.run_id
         where r.session_id = ? order by c.run_id, c.seq asc`,
      )
      .all(sessionID) as Row[]
    return rows.map(toChunk)
  }

  // -- snapshots -----------------------------------------------------------

  /**
   * Everything a client needs to draw a session, read at one watermark.
   *
   * The watermark is what makes a reconnect gap-free: the client takes the
   * snapshot, then subscribes from `seq`, so an event either lands in the
   * snapshot or arrives on the feed, never both and never neither.
   */
  snapshot(sessionID: string): SessionDetail | null {
    const read = this.#db.transaction((): SessionDetail | null => {
      const session = this.session(sessionID)
      if (!session) return null
      return {
        session,
        messages: this.messages(sessionID),
        runs: this.runs(sessionID),
        chunks: this.chunksForSession(sessionID),
        inbox: this.inbox(sessionID, 'pending'),
        seq: this.lastSeq(),
      }
    })
    return read()
  }
}
