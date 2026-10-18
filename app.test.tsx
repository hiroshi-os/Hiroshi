/**
 * Automated tests for Hiroshi Multi-Agent Orchestration Cockpit
 * Tested through the GPUIX native test renderer.
 *
 *   bun run test
 */

import React from 'react'
import { describe, expect, it } from 'vitest'
import { connectTest } from '@gpuix/react/automation'
import { createTestRoot, hasNativeTestRenderer } from '@gpuix/react/testing'

import { HiroshiApp } from './app'

const describeNative = hasNativeTestRenderer ? describe : describe.skip

describeNative('Hiroshi Multi-Agent Orchestrator', () => {
  it('mounts and paints the swarm timeline, header, and sidebar', async () => {
    const { render, renderer } = createTestRoot({ width: 1200, height: 1600 })
    render(<HiroshiApp />)
    const app = await connectTest(renderer)

    const painted = renderer.getPaintedText()

    // Assert branding, active mission, and supervisor plan are painted
    expect(painted).toContain('Hiroshi')
    expect(painted).toContain('Multi-Agent Orchestrator')
    expect(painted).toContain('SWARM RUNNING')
    expect(painted).toContain('Implement Distributed State Synchronization with CRDT in Rust & GPUI')
    expect(painted).toContain('Swarm Orchestration DAG Decomposed (4 Subtasks)')

    await app.close()
  })

  it('switches between Timeline, Topology, Fleet, and Artifacts tabs', async () => {
    const { render, renderer } = createTestRoot({ width: 1200, height: 1600 })
    render(<HiroshiApp />)
    const app = await connectTest(renderer)

    // 1. Switch to Topology View
    await app.getByTestId('tab-topology').click()
    let painted = renderer.getPaintedText()
    expect(painted).toContain('Swarm Topology & Communication DAG')
    expect(painted).toContain('P2P BUS HEALTHY (120 FPS)')

    // 2. Switch to Fleet View
    await app.getByTestId('tab-fleet').click()
    painted = renderer.getPaintedText()
    expect(painted).toContain('Swarm Agent Fleet Roster')
    expect(painted).toContain('Atlas')
    expect(painted).toContain('Forge')

    // 3. Switch to Artifacts View
    await app.getByTestId('tab-artifacts').click()
    painted = renderer.getPaintedText()
    expect(painted).toContain('Swarm Artifacts')
    expect(painted).toContain('crdt.rs')
    expect(painted).toContain('engine.rs')

    // 4. Switch back to Timeline
    await app.getByTestId('tab-timeline').click()
    painted = renderer.getPaintedText()
    expect(painted).toContain('Active Swarm Mission')

    await app.close()
  })

  it('toggles swarm run and pause state', async () => {
    const { render, renderer } = createTestRoot({ width: 1200, height: 1600 })
    render(<HiroshiApp />)
    const app = await connectTest(renderer)

    expect(renderer.getPaintedText()).toContain('SWARM RUNNING')

    // Click pause button
    await app.getByTestId('swarm-toggle-btn').click()
    expect(renderer.getPaintedText()).toContain('SWARM PAUSED')

    // Click run button
    await app.getByTestId('swarm-toggle-btn').click()
    expect(renderer.getPaintedText()).toContain('SWARM RUNNING')

    await app.close()
  })

  it('switches active missions between swarms in sidebar', async () => {
    const { render, renderer } = createTestRoot()
    render(<HiroshiApp />)
    const app = await connectTest(renderer)

    // Initially on mission 1
    expect(renderer.getPaintedText()).toContain('Implement Distributed State Synchronization with CRDT in Rust & GPUI')

    // Click mission 2 (Security Audit)
    await app.getByTestId('mission-m-2').click()
    let painted = renderer.getPaintedText()
    expect(painted).toContain('Security Audit & Memory Leak Analysis on Canvas Render Loop')
    expect(painted).toContain('Audit passed: Framebuffer textures are properly unmapped on frame drop.')

    // Click back to mission 1
    await app.getByTestId('mission-m-1').click()
    painted = renderer.getPaintedText()
    expect(painted).toContain('Implement Distributed State Synchronization with CRDT in Rust & GPUI')

    await app.close()
  })

  it('steps to the next swarm turn', async () => {
    const { render, renderer } = createTestRoot({ width: 1200, height: 1600 })
    render(<HiroshiApp />)
    const app = await connectTest(renderer)

    // Click step next turn
    await app.getByTestId('step-next-btn').click()
    const painted = renderer.getPaintedText()
    expect(painted).toContain('Sentinel')
    expect(painted.some((line) => line.includes('zero data races'))).toBe(true)

    await app.close()
  })
})
