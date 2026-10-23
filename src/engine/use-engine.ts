/**
 * The cockpit's one engine connection.
 *
 * Mount it once. It ensures a daemon, reads the session snapshot at the
 * engine's watermark, then follows the feed forever, reattaching with backoff
 * when the daemon restarts. Everything the cockpit shows about a run comes
 * through here: there is no local run state to fall out of step with.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { DeliveryMode } from '../../engine/src/protocol'
import { EngineRequestError, engineClient, type EngineClient } from './client'
import { apply, hydrate, initialSnapshot, type Snapshot } from './reducer'
import { ensureEngine, stopEngine } from './supervisor'

export interface EngineHandle {
  snapshot: Snapshot
  /** Run a command in the engine's session for this workspace. */
  exec: (command: string) => void
  /** Admit a prompt to the session's inbox; it is delivered at a boundary. */
  prompt: (text: string, mode?: DeliveryMode, model?: string) => void
  /** Stop every run the session is holding, keeping the pending inbox. */
  interrupt: () => void
  cancel: (runID: string) => void
  restart: () => void
}

export interface EngineOptions {
  enabled: boolean
  workspace: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function describe(error: unknown): string {
  if (error instanceof EngineRequestError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

export function useEngine({ enabled, workspace }: EngineOptions): EngineHandle {
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot)
  const [attempt, setAttempt] = useState(0)
  const client = useRef<EngineClient | null>(null)
  const session = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    if (typeof Bun === 'undefined') {
      setSnapshot((current) =>
        current.status === 'unavailable'
          ? current
          : { ...current, status: 'unavailable', error: 'this build cannot start a local engine' },
      )
      return
    }

    let stopped = false
    const abort = new AbortController()
    const update = (next: (snapshot: Snapshot) => Snapshot) => {
      if (!stopped) setSnapshot(next)
    }

    const loop = async () => {
      while (!stopped) {
        update((current) => ({
          ...current,
          status: current.status === 'ready' ? 'ready' : 'starting',
          error: null,
        }))

        const attached = await ensureEngine({ workspace })
        if (stopped) return

        if (attached.status === 'mismatch') {
          update((current) => ({
            ...current,
            status: 'mismatch',
            error: `the engine at ${attached.url} speaks protocol ${attached.health.protocol}; this cockpit speaks ${attached.expected}`,
          }))
          return
        }
        if (attached.status === 'unavailable') {
          update((current) => ({ ...current, status: 'unavailable', error: attached.reason }))
          return
        }
        if (attached.status === 'failed') {
          update((current) => ({ ...current, status: 'failed', error: attached.reason }))
          await sleep(1500)
          continue
        }

        const connection = engineClient(attached)
        client.current = connection
        update((current) => ({ ...current, status: 'ready', health: attached.health, error: null }))

        let after = 0
        try {
          const catalog = await connection.models()
          update((current) => ({ ...current, models: catalog.models, defaultModel: catalog.defaultModel }))
          const { sessions } = await connection.listSessions()
          const existing = sessions.find((candidate) => candidate.cwd === workspace) ?? sessions[0]
          const chosen =
            existing ?? (await connection.createSession({ cwd: workspace, title: 'Workspace' })).session
          const detail = await connection.session({ id: chosen.id })
          if (stopped) return
          session.current = chosen.id
          after = detail.seq
          update((current) =>
            hydrate({ ...current, status: 'ready', health: attached.health, sessions }, detail),
          )
        } catch (error) {
          update((current) => ({ ...current, status: 'unreachable', error: describe(error) }))
          await sleep(800)
          continue
        }

        let dropped = ''
        try {
          await connection.feed({
            after,
            signal: abort.signal,
            onEvent: (event) => {
              after = event.seq
              update((current) => apply(current, event))
            },
            onOverflow: (reason) => {
              // Only this window lost its place. The loop below reconnects
              // from `after` and the replay fills the gap from the log.
              dropped = reason
              update((current) => ({
                ...current,
                error: `the engine dropped this window's feed (${reason}); resuming from ${after}`,
              }))
            },
          })
          if (stopped) return
          update((current) => ({
            ...current,
            status: 'unreachable',
            error: dropped
              ? `the engine dropped this window's feed (${dropped}); resuming from ${after}`
              : 'the engine closed the event feed',
          }))
        } catch (error) {
          if (stopped) return
          update((current) => ({ ...current, status: 'unreachable', error: describe(error) }))
        }

        await sleep(800)
      }
    }

    void loop()

    return () => {
      stopped = true
      abort.abort()
      client.current = null
    }
  }, [enabled, workspace, attempt])

  const exec = useCallback((command: string) => {
    const connection = client.current
    const sessionID = session.current
    if (!connection || !sessionID) return
    void connection.startRun({ id: sessionID, command }).catch((error) => {
      setSnapshot((current) => ({ ...current, error: describe(error) }))
    })
  }, [])

  const cancel = useCallback((runID: string) => {
    const connection = client.current
    if (!connection) return
    void connection.cancelRun({ id: runID }).catch((error) => {
      setSnapshot((current) => ({ ...current, error: describe(error) }))
    })
  }, [])

  const prompt = useCallback((text: string, mode: DeliveryMode = 'queue', model?: string) => {
    const connection = client.current
    const sessionID = session.current
    if (!connection || !sessionID) return
    const body = text.trim()
    if (!body) return
    // One key per send. A retry of the same send is a no-op in the engine.
    const key = `k_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    void connection.prompt({ id: sessionID, text: body, mode, key, ...(model ? { model } : {}) }).catch((error) => {
      setSnapshot((current) => ({ ...current, error: describe(error) }))
    })
  }, [])

  const interrupt = useCallback(() => {
    const connection = client.current
    const sessionID = session.current
    if (!connection || !sessionID) return
    void connection.interrupt({ id: sessionID }).catch((error) => {
      setSnapshot((current) => ({ ...current, error: describe(error) }))
    })
  }, [])

  const restart = useCallback(() => {
    void (async () => {
      const connection = client.current
      if (connection) await connection.shutdown().catch(() => {})
      await stopEngine().catch(() => {})
      setAttempt((value) => value + 1)
    })()
  }, [])

  return { snapshot, exec, prompt, interrupt, cancel, restart }
}
