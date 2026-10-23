/** A local provider that requests real tools, then checks their protocol results. */
export function toolFixture(adapter: 'openai' | 'anthropic' = 'openai') {
  const requests: any[] = []
  const frame = (value: object) => `data: ${JSON.stringify(value)}\n\n`
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', async fetch(req) {
    const body: any = await req.json()
    requests.push(body)
    const history = adapter === 'openai' ? body.input : body.messages
    const userIndex = history.findLastIndex((item: any) => item.role === 'user' &&
      (typeof item.content === 'string' || item.content?.some((part: any) => part.type === 'text')))
    const user = history[userIndex]
    const prompt = typeof user?.content === 'string' ? user.content : user?.content?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ') ?? ''
    const result = adapter === 'openai' ? history.slice(userIndex + 1).find((item: any) => item.type === 'function_call_output')
      : history.slice(userIndex).flatMap((item: any) => item.content ?? []).findLast((part: any) => part.type === 'tool_result')
    let events: object[]
    if (result) {
      const text = `Tool turn complete: ${prompt}`
      events = adapter === 'openai' ? [{ type: 'response.output_text.delta', delta: text }, { type: 'response.completed' }]
        : [{ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }, { type: 'message_stop' }]
    } else {
      const name = prompt.includes('huge') ? 'read_file' : (prompt.includes('crash') || prompt.includes('model-shell')) ? 'shell' : 'write_file'
      const input = name === 'read_file' ? { path: 'huge.txt' } : name === 'shell' ? { command: prompt.includes('model-shell') ? 'echo model-shell-marker' : 'echo crash-marker', timeoutMs: 30000 }
        : { path: prompt.includes('deny') ? 'denied.txt' : 'approved.txt', content: 'approved from the model' }
      const id = `fixture_${requests.length}`
      events = adapter === 'openai' ? [
        { type: 'response.output_item.done', item: { type: 'reasoning', id: `reason_${id}`, encrypted_content: 'opaque-reasoning', summary: [] } },
        { type: 'response.output_item.added', item: { type: 'function_call', id, call_id: id, name } },
        { type: 'response.function_call_arguments.delta', item_id: id, delta: JSON.stringify(input) },
        { type: 'response.output_item.done', item: { type: 'function_call', id, call_id: id, name } }, { type: 'response.completed' },
      ] : [
        { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Use the declared tool.' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'opaque-signature' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id, name, input: {} } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
        { type: 'content_block_stop', index: 1 }, { type: 'message_stop' },
      ]
    }
    return new Response(events.map(frame).join(''), { headers: { 'content-type': 'text/event-stream' } })
  } })
  const provider = { id: 'fixture', adapter, apiKeyEnv: 'HIROSHI_TOOL_FIXTURE_KEY', baseURL: server.url.href.replace(/\/$/, ''),
    models: [{ id: 'tools', model: 'tool-fixture', label: 'Tool fixture', contextWindow: 131072, reservedOutput: 1024 }] }
  return { server, requests, provider }
}
