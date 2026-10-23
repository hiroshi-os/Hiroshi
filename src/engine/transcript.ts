import type { Snapshot } from './reducer'

export type EngineTurn =
  | { kind: 'user'; text: string }
  | { kind: 'markdown'; source: string }
  | { kind: 'code'; language: string; source: string }

/** Only engine facts become transcript rows. Streaming output is replaced by
 * its committed assistant message on completion, never shown twice. */
export function engineTranscript(snapshot: Snapshot): EngineTurn[] {
  const turns: EngineTurn[] = []
  const steps = new Map(snapshot.steps.map((step) => [step.messageID, step]))
  const partsByStep = new Map<string, Snapshot['parts']>()
  for (const part of snapshot.parts) {
    const group = partsByStep.get(part.stepID) ?? []
    group.push(part)
    partsByStep.set(part.stepID, group)
  }
  for (const message of snapshot.messages) {
    turns.push(message.role === 'user'
      ? { kind: 'user', text: message.text }
      : { kind: 'markdown', source: message.text })
    if (message.role !== 'user') continue
    const step = steps.get(message.id)
    if (!step) continue
    const parts = partsByStep.get(step.id) ?? []
    const reasoning = parts.filter((part) => part.kind === 'reasoning').map((part) => part.text).join('')
    if (reasoning) turns.push({ kind: 'markdown', source: `Reasoning summary\n\n${reasoning}` })
    const calls = new Map<string, { name: string; input: string }>()
    for (const part of parts) {
      if (part.kind !== 'tool') continue
      const call = calls.get(part.callID) ?? { name: part.name ?? part.callID, input: '' }
      if (part.name) call.name = part.name
      call.input += part.text
      calls.set(part.callID, call)
    }
    for (const call of calls.values()) {
      turns.push({ kind: 'code', language: 'text', source: `Tool requested: ${call.name}\n${call.input}\nNot executed` })
    }
    if (step.status !== 'succeeded' && step.output) turns.push({ kind: 'markdown', source: step.output })
    if (step.error && step.status !== 'running') turns.push({ kind: 'markdown', source: `${step.error.code}: ${step.error.message}` })
    if (step.status === 'running' && !step.output && parts.length === 0) {
      turns.push({ kind: 'markdown', source: `Waiting for ${step.model}…` })
    }
  }
  return turns
}
