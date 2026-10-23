/**
 * The provider seam: one model call, behind an interface.
 *
 * The engine owns the step — its durability, attempts and retries — and knows
 * nothing about how tokens arrive. A provider is an adapter: it takes the
 * history the step reloaded and streams text and normalized parts for one
 * answer. Configured adapters share this seam; the built-in `local` provider needs
 * no credentials and no network.
 *
 * A provider reports a failure it understands as a `ProviderError`, with the
 * retry decision on the error. The engine retries only what it can name; a
 * plain exception is a bug or a failure that must not be replayed.
 */

import type { Message, InstructionSource } from './protocol'

export interface RemoteModelOptions {
  name: string
  model: string
  providerModel: string
  apiKey: string
  baseURL: string
  context: { window: number; reservedOutput: number }
}

export type ProviderPart =
  | { kind: 'reasoning'; text: string }
  | { kind: 'tool'; phase: 'start' | 'delta' | 'end'; callID: string; name?: string; text: string }

export interface ProviderRequest {
  sessionID: string
  stepID: string
  provider: string
  model: string
  /** The history the step sees, oldest first, reloaded for every attempt. */
  messages: Message[]
  instructions: InstructionSource[]
  tools: unknown[]
  reservedOutput: number
  signal: AbortSignal
}

export interface Provider {
  readonly name: string
  readonly model: string
  /** Model limits, including reserved output. Omission uses the conservative local default. */
  readonly context?: { window: number; reservedOutput: number }
  readonly tools?: unknown[]
  /** Check local policy and credentials before context preparation or I/O. */
  check?: () => void
  /**
   * Stream one answer. `onText` is called for each piece; the promise settles
   * when the answer is complete. An aborted signal must end the promise,
   * whether by throwing or by returning once the stream is closed.
   */
  stream(request: ProviderRequest, onText: (text: string) => void, onPart?: (part: ProviderPart) => void): Promise<void>
}

export class ProviderError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'ProviderError'
    this.code = code
    this.retryable = options.retryable ?? false
  }
}
