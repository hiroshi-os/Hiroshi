/** Socket-backed daemon IPC. Bun 1.3.5 aliases bare undici and node:http to
 * its proxy-inheriting fetch, so load Undici's installed dispatcher directly.
 * Browser and non-loopback requests keep their normal fetch behavior. */
type SocketRequest = (this: import('undici').Agent, options: import('undici').Dispatcher.RequestOptions) => Promise<import('undici').Dispatcher.ResponseData>
let direct: { agent: import('undici').Agent; request: SocketRequest } | undefined
export const daemonFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (typeof Bun === 'undefined' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname.toLowerCase())) return fetch(input, init)
  if (!direct) {
    const Agent = require('undici/lib/dispatcher/agent.js') as typeof import('undici').Agent
    direct = { agent: new Agent({ connections: 8 }), request: require('undici/lib/api/api-request.js') }
  }
  const request = new Request(input, init)
  const headers: Record<string, string> = {}
  request.headers.forEach((value, name) => { headers[name] = value })
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined
  const result = await direct.request.call(direct.agent, { origin: url.origin, path: url.pathname + url.search, method: request.method as import('undici').Dispatcher.HttpMethod, headers, body, signal: request.signal })
  const responseHeaders = new Headers()
  for (const [name, value] of Object.entries(result.headers)) {
    if (Array.isArray(value)) for (const item of value) responseHeaders.append(name, item)
    else if (value !== undefined) responseHeaders.set(name, value)
  }
  const empty = request.method === 'HEAD' || [204, 205, 304].includes(result.statusCode)
  const { Readable } = require('node:stream') as typeof import('node:stream')
  if (empty) result.body.resume()
  // request() never follows redirects, so a daemon token cannot cross origins.
  return new Response(empty ? null : Readable.toWeb(result.body) as unknown as ReadableStream<Uint8Array>, { status: result.statusCode, headers: responseHeaders })
}) as typeof fetch
