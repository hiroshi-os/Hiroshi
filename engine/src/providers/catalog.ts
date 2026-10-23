/** The only adapter registration table. Credentials never leave this module. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ProviderError, type Provider, type RemoteModelOptions } from '../provider'
import type { ModelInfo } from '../protocol'
import { LocalProvider } from './local'
import { OpenAIProvider } from './openai'
import { AnthropicProvider } from './anthropic'

export interface ModelConfig {
  id: string
  model: string
  label: string
  contextWindow: number
  reservedOutput: number
}
export interface ProviderConfig {
  id: string
  adapter: string
  apiKeyEnv?: string
  baseURL?: string
  models: ModelConfig[]
}
export interface ProvidersConfig {
  defaultModel?: string
  providers?: ProviderConfig[]
  policy?: { provider: string; action: 'allow' | 'deny' }[]
}

type Factory = (options: RemoteModelOptions) => Provider
const adapters: Record<string, { endpoint: string; credential: string; create: Factory }> = {
  openai: { endpoint: 'https://api.openai.com/v1', credential: 'OPENAI_API_KEY', create: (options) => new OpenAIProvider(options) },
  anthropic: { endpoint: 'https://api.anthropic.com/v1', credential: 'ANTHROPIC_API_KEY', create: (options) => new AnthropicProvider(options) },
}

export function readProvidersConfig(home: string): ProvidersConfig {
  try {
    const value = JSON.parse(readFileSync(join(home, 'providers.json'), 'utf8'))
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('shape')
    return value
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    // Do not echo parser errors: they can contain the configuration contents.
    throw new ProviderError('provider_configuration', 'providers.json must contain a valid configuration object')
  }
}

export class ProviderCatalog {
  readonly defaultModel: string
  readonly #models = new Map<string, { info: ModelInfo; provider: Provider }>()

  constructor(config: ProvidersConfig = {}, env: Record<string, string | undefined> = process.env, local = new LocalProvider()) {
    if (config.policy !== undefined && !Array.isArray(config.policy)) throw new ProviderError('provider_configuration', 'policy must be an array')
    const denied = (provider: string) => {
      let result = false
      for (const rule of config.policy ?? []) {
        if (!rule || typeof rule.provider !== 'string' || !['allow', 'deny'].includes(rule.action)) {
          throw new ProviderError('provider_configuration', 'provider policy needs provider and allow/deny action')
        }
        if (rule.provider === '*' || rule.provider === provider) result = rule.action === 'deny'
      }
      return result
    }
    const add = (info: ModelInfo, provider: Provider) => {
      if (this.#models.has(info.id)) throw new ProviderError('provider_configuration', 'duplicate catalog model id')
      const reason = info.reason
      const check = () => {
        if (reason) throw new ProviderError(reason, reason === 'provider_denied'
          ? 'this provider is denied by local policy' : 'this provider needs a local credential')
      }
      this.#models.set(info.id, { info, provider: {
        check,
        name: info.provider, model: info.id, context: { window: info.contextWindow, reservedOutput: info.reservedOutput },
        stream: async (request, onText, onPart) => {
          check()
          await provider.stream(request, onText, onPart)
        },
      } })
    }
    add({ id: 'local/echo', provider: 'local', label: 'Local echo', contextWindow: 32768, reservedOutput: 1024,
      reason: denied('local') ? 'provider_denied' : null }, local)
    const ids = new Set(['local'])
    if (config.providers !== undefined && !Array.isArray(config.providers)) throw new ProviderError('provider_configuration', 'providers must be an array')
    for (const entry of config.providers ?? []) {
      if (!entry || typeof entry.id !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(entry.id) || ids.has(entry.id)) {
        throw new ProviderError('provider_configuration', 'provider ids must be unique lowercase names')
      }
      ids.add(entry.id)
      const adapter = Object.hasOwn(adapters, entry.adapter) ? adapters[entry.adapter] : undefined
      if (!adapter || !Array.isArray(entry.models) || entry.models.length === 0) {
        throw new ProviderError('provider_configuration', 'each provider needs a registered adapter and models')
      }
      const credential = entry.apiKeyEnv ?? adapter.credential
      if (typeof credential !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(credential)) {
        throw new ProviderError('provider_configuration', 'apiKeyEnv must name an environment variable')
      }
      let endpoint: URL
      try { endpoint = new URL(entry.baseURL ?? adapter.endpoint) } catch { throw new ProviderError('provider_configuration', 'invalid provider baseURL') }
      if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
        (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)))) {
        throw new ProviderError('provider_configuration', 'provider URLs need HTTPS or loopback HTTP, without credentials or query strings')
      }
      for (const model of entry.models) {
        if (!model || typeof model.id !== 'string' || !/^[a-zA-Z0-9_.-]{1,128}$/.test(model.id) ||
          typeof model.model !== 'string' || model.model.length === 0 || model.model.length > 256 ||
          typeof model.label !== 'string' || !model.label || model.label.length > 128 ||
          !Number.isSafeInteger(model.contextWindow) || !Number.isSafeInteger(model.reservedOutput) ||
          model.reservedOutput < 1 || model.contextWindow <= model.reservedOutput) {
          throw new ProviderError('provider_configuration', 'models need ids, labels and positive context/output limits')
        }
        const id = `${entry.id}/${model.id}`
        const apiKey = env[credential]?.trim() ?? ''
        const reason = denied(entry.id) ? 'provider_denied' : !apiKey ? 'credentials_missing' : null
        add({ id, provider: entry.id, label: model.label, contextWindow: model.contextWindow, reservedOutput: model.reservedOutput, reason },
          adapter.create({ name: entry.id, model: id, providerModel: model.model, apiKey,
            baseURL: endpoint.href.replace(/\/$/, ''), context: { window: model.contextWindow, reservedOutput: model.reservedOutput } }))
      }
    }
    this.defaultModel = config.defaultModel ?? 'local/echo'
    if (!this.has(this.defaultModel)) throw new ProviderError('provider_configuration', 'defaultModel must name a configured catalog model')
  }

  has(id: string): boolean { return this.#models.has(id) }
  models(): ModelInfo[] { return [...this.#models.values()].map(({ info }) => ({ ...info })) }
  resolve(id = this.defaultModel): Provider {
    const entry = this.#models.get(id)
    if (entry) return entry.provider
    // A model removed since a prompt was admitted still gets a durable failed
    // step on restart. Never silently switch it to a different provider.
    return { name: 'unavailable', model: id, async stream() {
      throw new ProviderError('model_unavailable', 'the selected model is no longer configured')
    } }
  }
}
