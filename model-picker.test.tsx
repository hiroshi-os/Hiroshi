import React from 'react'
import { describe, expect, it } from 'vitest'
import { connectTest } from '@gpuix/react/automation'
import { createTestRoot, hasNativeTestRenderer } from '@gpuix/react/testing'
import { ModelPicker } from './app'

;(hasNativeTestRenderer ? describe : describe.skip)('engine model picker', () => {
  it('renders configured catalog models, marks a denied provider and reports the selected catalog id', async () => {
    const { render, renderer } = createTestRoot({ width: 800, height: 600 })
    let chosen = ''
    render(
      <div style={{ width: 800, height: 600, padding: 24, display: 'flex', backgroundColor: '#212121' }}>
        <ModelPicker value="custom/main" onChange={(id) => { chosen = id }} models={[
          { id: 'custom/main', label: 'My configured model', group: 'custom', icon: 'sparkle' },
          { id: 'restricted/other', label: 'Restricted model · denied', group: 'restricted', icon: 'sparkle' },
        ]} />
      </div>,
    )
    const app = await connectTest(renderer)
    try {
      expect(renderer.getPaintedText().join('\n')).toContain('My configured model')
      expect(renderer.getPaintedText().join('\n')).not.toContain('Grok')
      await app.getByTestId('model-picker').click()
      await app.getByTestId('model-restricted/other').waitFor()
      expect(renderer.getPaintedText().join('\n')).toContain('Restricted model · denied')
      await app.getByTestId('model-restricted/other').click()
      expect(chosen).toBe('restricted/other')
    } finally { await app.close() }
  })
})
