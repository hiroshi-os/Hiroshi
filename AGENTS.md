# Hiroshi Development Guidelines & GPUIX Invariants

## 1. App Identity & Branding
- **Name**: The application is strictly **Hiroshi**. Never name it Waku or use upstream placeholder branding.
- **Branding**: Window title is `Hiroshi · Multi-Agent Orchestrator`, daemons are `Hiroshi daemon`, etc.
- **Context**: Hiroshi is a multi-agent orchestration desktop app built with GPUIX.

## 2. GPUIX Desktop Framework Rules

### Window Draggability (Windows vs macOS)
- In the `render()` entry point, set:
  ```tsx
  titlebarTransparent: process.platform !== 'win32',
  ```
  Setting `titlebarTransparent: true` on Windows breaks native caption hit-testing and loses titlebar draggability.

### Centered Modals & DialogPortals
- When using `DialogPortal` in GPUIX, explicitly pass `position: { x: 0, y: 0 }` and window dimensions to bypass trigger anchoring and ensure full-viewport centering and backdrop dimming:
  ```tsx
  <DialogPortal
    {...({ position: { x: 0, y: 0 } } as any)}
    onMouseDown={onClose}
    style={{
      width: 1180,
      height: 820,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#00000088',
    }}
  >
  ```

### Single-String `<text>` Elements
- In GPUIX, multi-child `<text>Prefix {dynamic} Suffix</text>` can trigger unwanted word-wrapping into multiple lines.
- Always use a single template literal string and `whiteSpace: 'nowrap'` when text should stay on one line:
  ```tsx
  <text style={{ whiteSpace: 'nowrap' }}>{`Prefix ${dynamic} Suffix`}</text>
  ```

### Vector SVGs for UI Symbols
- Never use Unicode symbols that may resolve to Windows system emojis (e.g., `✳`, `❇`). Always render SVG icons with explicit strokes and colors.

## 3. PowerShell Commands
- In Windows PowerShell, use `;` rather than `&&` for chaining commands (e.g. `bun run typecheck ; git status`).
