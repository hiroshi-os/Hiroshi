import type { Snapshot } from './reducer'

export type EngineTurn =
  | { kind: 'user'; text: string }
  | { kind: 'markdown'; source: string }
  | { kind: 'code'; language: string; source: string }

/** Only engine facts become transcript rows. Streaming output is replaced by
 * its committed assistant message on completion, never shown twice. */
export function engineTranscript(snapshot: Snapshot): EngineTurn[] {
  const turns: EngineTurn[] = []
  const steps = new Map<string | null, Snapshot['steps']>()
  for (const step of snapshot.steps) {
    const assistant = snapshot.messages.find((message) => message.stepID === step.id)
    const parentResults = step.parentID ? snapshot.toolCalls.filter((call) => call.stepID === step.parentID && call.resultMessageID) : []
    const anchor = assistant?.id ?? parentResults.at(-1)?.resultMessageID ?? step.messageID
    const group = steps.get(anchor) ?? []
    group.push(step)
    steps.set(anchor, group)
  }
  const partsByStep = new Map<string, Snapshot['parts']>()
  for (const part of snapshot.parts) {
    const group = partsByStep.get(part.stepID) ?? []
    group.push(part)
    partsByStep.set(part.stepID, group)
  }
  for (const message of snapshot.messages) {
    if (message.toolResult) {
      const call = snapshot.toolCalls.find((call) => call.id === message.toolResult!.toolCallID)
      turns.push({ kind: 'code', language: 'text', source: `${call?.tool ?? 'Tool'} · ${message.toolResult.status}\nCall: ${message.toolResult.toolCallID}\n${message.text}` })
    } else if (message.text) {
      turns.push(message.role === 'user'
        ? { kind: 'user', text: message.text }
        : { kind: 'markdown', source: message.text })
    }
    for (const step of steps.get(message.id) ?? []) {
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
      for (const [id, call] of calls) {
        const execution = snapshot.toolCalls.find((value) => value.stepID === step.id && value.callID === id)
        const status = execution ? `${execution.status} · ${execution.id}` : 'Not executed'
        turns.push({ kind: 'code', language: 'text', source: `Tool requested: ${call.name}\n${call.input}\n${status}` })
      }
      if (step.status !== 'succeeded' && step.output) turns.push({ kind: 'markdown', source: step.output })
      if (step.error && step.status !== 'running') turns.push({ kind: 'markdown', source: `${step.error.code}: ${step.error.message}` })
      if (step.status === 'running' && !step.output && parts.length === 0) {
        turns.push({ kind: 'markdown', source: `Waiting for ${step.model}…` })
      }
    }
  }
  return turns
}
