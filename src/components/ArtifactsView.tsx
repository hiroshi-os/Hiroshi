import React, { useState } from 'react'
import { C, FONT } from '../theme'
import { Icon } from '../icons'
import type { ArtifactFile } from '../types'

interface ArtifactsViewProps {
  artifacts: ArtifactFile[]
}

export function ArtifactsView({ artifacts }: ArtifactsViewProps) {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>(artifacts[0]?.id ?? '')
  const [copied, setCopied] = useState(false)

  const selected = artifacts.find((a) => a.id === selectedArtifactId) ?? artifacts[0]

  const handleCopy = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexGrow: 1,
        height: '100%',
        minHeight: 0,
        backgroundColor: C.canvas,
      }}
    >
      {/* Left Pane: Files List */}
      <div
        style={{
          width: 280,
          borderRightWidth: 1,
          borderColor: C.border,
          backgroundColor: C.sidebar,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: 14,
            borderBottomWidth: 1,
            borderColor: C.border,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <text style={{ fontSize: 12, fontWeight: '700', color: C.text, fontFamily: FONT.sans }}>
              Swarm Artifacts
            </text>
            <div
              style={{
                paddingLeft: 4,
                paddingRight: 4,
                paddingTop: 1,
                paddingBottom: 1,
                borderRadius: 3,
                backgroundColor: C.overlayStrong,
              }}
            >
              <text style={{ fontSize: 9.5, fontWeight: '700', color: C.secondary, fontFamily: FONT.mono }}>
                {artifacts.length}
              </text>
            </div>
          </div>
          <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.mono }}>
            STAGE: CHECKED IN
          </text>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', padding: 8, gap: 4 }}>
          {artifacts.map((art) => {
            const isSelected = art.id === selectedArtifactId
            return (
              <div
                key={art.id}
                onClick={() => setSelectedArtifactId(art.id)}
                style={{
                  padding: 10,
                  borderRadius: 6,
                  backgroundColor: isSelected ? C.surfaceElevated : 'transparent',
                  borderWidth: 1,
                  borderColor: isSelected ? C.borderMedium : 'transparent',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  cursor: 'pointer',
                  hover: isSelected ? undefined : { backgroundColor: C.overlay },
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="code" size={12} color={isSelected ? C.accent : C.tertiary} />
                    <text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? C.text : C.secondary, fontFamily: FONT.mono }}>
                      {art.name}
                    </text>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <text style={{ fontSize: 10, color: C.success, fontFamily: FONT.mono }}>
                      +{art.linesAdded}
                    </text>
                    {art.linesRemoved > 0 && (
                      <text style={{ fontSize: 10, color: C.error, fontFamily: FONT.mono }}>
                        -{art.linesRemoved}
                      </text>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <text style={{ fontSize: 10, color: C.tertiary, fontFamily: FONT.mono, overflow: 'hidden' }}>
                    {art.path}
                  </text>
                  <text style={{ fontSize: 9.5, color: C.ghost, fontFamily: FONT.sans }}>
                    {art.agentName.split(' ')[0]}
                  </text>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right Pane: Code / Patch Viewer */}
      {selected && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            height: '100%',
            minHeight: 0,
            overflowY: 'scroll',
          }}
        >
          {/* File Header */}
          <div
            style={{
              paddingTop: 10,
              paddingBottom: 10,
              paddingLeft: 16,
              paddingRight: 16,
              backgroundColor: C.surface,
              borderBottomWidth: 1,
              borderColor: C.border,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: FONT.mono }}>
                {selected.path}
              </text>
              <text style={{ fontSize: 10.5, color: C.secondary, fontFamily: FONT.sans }}>
                Authored by {selected.agentName}
              </text>
            </div>

            <div
              onClick={handleCopy}
              style={{
                height: 28,
                paddingLeft: 10,
                paddingRight: 10,
                borderRadius: 5,
                backgroundColor: C.surfaceElevated,
                borderWidth: 1,
                borderColor: C.border,
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                hover: { backgroundColor: C.surfaceHighlight },
                active: { backgroundColor: C.overlayStrong },
              }}
            >
              <Icon name={copied ? 'check' : 'copy'} size={11} color={copied ? C.success : C.secondary} />
              <text style={{ fontSize: 11, color: copied ? C.success : C.text, fontFamily: FONT.sans }}>
                {copied ? 'Copied' : 'Copy Contents'}
              </text>
            </div>
          </div>

          {/* Content: Patch or Code */}
          <div style={{ padding: 16, flexGrow: 1 }}>
            {selected.patch ? (
              <div
                style={{
                  borderRadius: 8,
                  backgroundColor: C.codeBg,
                  borderWidth: 1,
                  borderColor: C.borderMedium,
                  overflow: 'hidden',
                }}
              >
                <diff patch={selected.patch} wordDiff style={{ padding: 12, minHeight: 200 }} />
              </div>
            ) : (
              <div
                style={{
                  borderRadius: 8,
                  backgroundColor: C.codeBg,
                  borderWidth: 1,
                  borderColor: C.borderMedium,
                  overflow: 'hidden',
                }}
              >
                <code
                  code={selected.content}
                  language={selected.language}
                  showLineNumbers
                  style={{ padding: 14, fontSize: 12, lineHeight: 19 }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
