import React from 'react'
import { describe, expect, it } from 'vitest'
import { connectTest } from '@gpuix/react/automation'
import { createTestRoot, hasNativeTestRenderer } from '@gpuix/react/testing'
import type { EngineHandle } from '../engine/use-engine'
import type { UsageRate, UsageReport } from '../../engine/src/protocol'
import { aggregateUsage } from '../../engine/src/usage'
import { UsageSettings } from './UsageSettings'

;(hasNativeTestRenderer ? describe : describe.skip)('usage analytics controls', () => {
  it('shows unpriced usage, switches views/date windows, and saves explicit model rates', async () => {
    const at = Date.now() - 1000; let calls = 0, revision = 0, saved: Record<string, UsageRate> = {}
    const requests: unknown[] = []
    const engine = { usageReport: async (input: any): Promise<UsageReport> => {
      calls++; requests.push(input)
      return { ...aggregateUsage([{ id: 'usage', at, model: 'model', provider: 'api', project: '/project', inputTokens: 100, cachedInputTokens: 80, cacheWriteTokens: 0, outputTokens: 10 }], saved),
        ...input, generatedAt: Date.now(), pricing: saved, pricingRevision: revision, scannedRecords: 1, sources: [], warnings: [] }
    }, updateUsagePricing: async (input: any) => { saved = { [input.model]: input.rate }; revision++ },
    } as unknown as EngineHandle
    const { render, renderer } = createTestRoot({ width: 1180, height: 1500 })
    render(<UsageSettings engine={engine} />)
    const app = await connectTest(renderer)
    try {
      await expect.poll(() => calls).toBe(1)
      expect(await app.getByTestId('usage-total-cost').textContent()).toBe('—')
      await app.getByTestId('usage-period-months').click()
      await app.getByTestId('usage-period-projects').click()
      await app.getByTestId('usage-row-api::model').click()
      for (const [key, value] of [['input', '2'], ['cachedInput', '.2'], ['cacheWrite', '2'], ['output', '3']]) await app.getByTestId(`usage-rate-${key}`).fill(value!)
      await app.getByTestId('usage-rates-save').click()
      await expect.poll(() => revision).toBe(1)
      await expect.poll(async () => app.getByTestId('usage-total-cost').textContent()).toBe('$0.00')
      expect(saved['api::model']).toMatchObject({ input: 2, cachedInput: .2, output: 3 })
      await app.getByTestId('usage-range').click(); await app.getByTestId('usage-range-7').waitFor(); await app.getByTestId('usage-range-7').click()
      await expect.poll(() => requests.length).toBe(3)
      await expect.poll(async () => app.getByTestId('usage-refresh').textContent()).toBe('Refresh')
      expect((requests.at(-1) as any).to - (requests.at(-1) as any).from).toBe(7 * 86400000)
      await app.getByTestId('usage-history-toggle').click()
      await expect.poll(() => (requests.at(-1) as any).includeHistory).toBe(false)
    } finally { await app.close() }
  })
  it('shows an unavailable report as an error instead of a fabricated zero', async () => {
    const engine = { usageReport: async () => { throw new Error('Engine disconnected') } } as unknown as EngineHandle
    const { render, renderer } = createTestRoot({ width: 1180, height: 820 })
    render(<UsageSettings engine={engine} />)
    const app = await connectTest(renderer)
    try { await app.getByTestId('usage-error').waitFor(); expect(await app.getByTestId('usage-error').textContent()).toBe('Engine disconnected'); expect(await app.getByTestId('usage-total-cost').textContent()).toBe('—') }
    finally { await app.close() }
  })
})
