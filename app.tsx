/**
 * The GPUIX chat example, rendered directly on the GPU.
 *
 * It demonstrates a transparent titlebar, traffic lights in the sidebar,
 * graphite surfaces, composer chips, and a workspace footer. Threads, sends,
 * and chrome controls are interactive. Replies stay in this demo.
 *
 * Run on desktop: cd examples && bun --hot chat.tsx
 * Run in a browser: bun run web
 * Slow CPU: THROTTLE=utility bun --hot chat.tsx
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyMacCpuThrottleFromEnv,
  Button,
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  motion,
  render,
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  useGpuix,
  useWindowInsets,
  type Props,
  type PublicInstance,
  type StyleDesc,
} from '@gpuix/react'
import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'
import type { Root } from 'mdast'
import iconCompose from './assets/icons/compose.svg' with { type: 'text' }
import iconSearch from './assets/icons/search.svg' with { type: 'text' }
import iconSidebar from './assets/icons/panel-left.svg' with { type: 'text' }
import iconPanelRight from './assets/icons/panel-right.svg' with { type: 'text' }
import iconArrowLeft from './assets/icons/arrow-left.svg' with { type: 'text' }
import iconArrowRight from './assets/icons/arrow-right.svg' with { type: 'text' }
import iconFolder from './assets/icons/folder.svg' with { type: 'text' }
import iconSettings from './assets/icons/settings.svg' with { type: 'text' }
import iconGitBranch from './assets/icons/git-branch.svg' with { type: 'text' }
import iconLaptop from './assets/icons/laptop.svg' with { type: 'text' }
import iconLockOpen from './assets/icons/lock-open.svg' with { type: 'text' }
import iconLock from './assets/icons/lock.svg' with { type: 'text' }
import iconList from './assets/icons/list.svg' with { type: 'text' }
import iconZap from './assets/icons/zap.svg' with { type: 'text' }
import iconPencil from './assets/icons/pencil.svg' with { type: 'text' }
import iconChevronDown from './assets/icons/chevron-down.svg' with { type: 'text' }
import iconChevronRight from './assets/icons/chevron-right.svg' with { type: 'text' }
import iconListFilter from './assets/icons/list-filter.svg' with { type: 'text' }
import iconSparkle from './assets/icons/sparkle.svg' with { type: 'text' }
import iconWrench from './assets/icons/wrench.svg' with { type: 'text' }
import iconSend from './assets/icons/arrow-up.svg' with { type: 'text' }
import iconCopy from './assets/icons/copy.svg' with { type: 'text' }
import iconCheck from './assets/icons/check.svg' with { type: 'text' }
import iconRetry from './assets/icons/rotate-ccw.svg' with { type: 'text' }
import iconThumbsUp from './assets/icons/thumbs-up.svg' with { type: 'text' }
import iconThumbsDown from './assets/icons/thumbs-down.svg' with { type: 'text' }
import iconShare from './assets/icons/share.svg' with { type: 'text' }
import iconMore from './assets/icons/ellipsis.svg' with { type: 'text' }
import iconWindowMinimize from './assets/icons/window-minimize.svg' with { type: 'text' }
import iconWindowMaximize from './assets/icons/window-maximize.svg' with { type: 'text' }
import iconWindowClose from './assets/icons/window-close.svg' with { type: 'text' }
import iconContrast from './assets/icons/contrast.svg' with { type: 'text' }
import iconBlocks from './assets/icons/blocks.svg' with { type: 'text' }
import iconCube from './assets/icons/cube.svg' with { type: 'text' }
import iconActivity from './assets/icons/activity.svg' with { type: 'text' }
import iconServer from './assets/icons/server.svg' with { type: 'text' }
import iconTrash from './assets/icons/trash.svg' with { type: 'text' }

const C = {
  canvas: '#1A1A1A',
  sidebar: '#181818',
  raised: '#232323',
  composer: '#212121',
  overlay: '#E6EAF20D',
  overlayStrong: '#E6EAF217',
  item: '#F0F0F00F',
  border: '#E6EAF212',
  borderStrong: '#E6EAF224',
  sidebarBorder: '#292929',
  text: '#E2E2E2',
  secondary: '#A3A3A3',
  tertiary: '#7D7D7D',
  ghost: '#575757',
  accent: '#E2795B',
  inverse: '#E7E9EC',
  onInverse: '#17181C',
  codeText: '#E0A882',
}

const SIDEBAR_WIDTH = 252
const TRAFFIC_LIGHT_CLEARANCE =
  typeof process !== 'undefined' && process.platform === 'darwin' ? 86 : 8
const CONTENT_MAX_WIDTH = 720
const TITLEBAR_HEIGHT = 48

const FONT_SANS = typeof window === 'undefined' ? 'Helvetica' : 'IBM Plex Sans'
const FONT_MONO = typeof window === 'undefined' ? 'Menlo' : 'Lilex'

const ICONS = {
  compose: iconCompose,
  search: iconSearch,
  sidebar: iconSidebar,
  panelRight: iconPanelRight,
  arrowLeft: iconArrowLeft,
  arrowRight: iconArrowRight,
  folder: iconFolder,
  settings: iconSettings,
  gitBranch: iconGitBranch,
  laptop: iconLaptop,
  lockOpen: iconLockOpen,
  lock: iconLock,
  list: iconList,
  zap: iconZap,
  pencil: iconPencil,
  chevronDown: iconChevronDown,
  chevronRight: iconChevronRight,
  listFilter: iconListFilter,
  sparkle: iconSparkle,
  wrench: iconWrench,
  send: iconSend,
  copy: iconCopy,
  check: iconCheck,
  retry: iconRetry,
  thumbsUp: iconThumbsUp,
  thumbsDown: iconThumbsDown,
  share: iconShare,
  more: iconMore,
  windowMinimize: iconWindowMinimize,
  windowMaximize: iconWindowMaximize,
  windowClose: iconWindowClose,
  contrast: iconContrast,
  blocks: iconBlocks,
  cube: iconCube,
  activity: iconActivity,
  server: iconServer,
  trash: iconTrash,
} as const

type IconName = keyof typeof ICONS

function Icon({ name, size = 14, color }: { name: IconName; size?: number; color: string }) {
  return (
    <svg
      source={ICONS[name]}
      style={{ width: size, height: size, flexShrink: 0, color, pointerEvents: 'none' }}
    />
  )
}

const CHAT_THEME = {
  text: C.text,
  textMuted: C.secondary,
  textFaint: C.tertiary,
  textDim: C.secondary,
  border: C.border,
  bg: C.canvas,
  accent: C.accent,
  caret: C.accent,
  fontSans: FONT_SANS,
  codeText: C.codeText,
  codeWash: '#E6EAF214',
  metrics: {
    mdTextSize: 14,
    mdLineHeight: 22,
    mdBlockGap: 14,
    mdHeadingSizes: [20, 16, 14, 14],
    mdHeadingLineHeights: [28, 24, 22, 22],
    codeTextSize: 12.5,
    codeLineHeight: 20,
    diffLineHeight: 20,
    diffFileHeaderHeight: 34,
  },
}

type Turn =
  | { kind: 'user'; text: string }
  | { kind: 'fold'; duration: string }
  | { kind: 'markdown'; source: string }
  | { kind: 'code'; language: string; source: string }
  | { kind: 'diff'; patch: string }

interface Conversation {
  id: string
  title: string
  group: string
  project: string
  time: string
  turns: Turn[]
}

const MODELS = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', group: 'DeepSeek', icon: 'sparkle' as const },
  { id: 'deepseek-v4', label: 'DeepSeek V4', group: 'DeepSeek', icon: 'sparkle' as const },
  { id: 'opus-4.6', label: 'Claude Opus 4.6', group: 'Claude', icon: 'sparkle' as const },
  { id: 'sonnet-4.6', label: 'Claude Sonnet 4.6', group: 'Claude', icon: 'sparkle' as const },
  { id: 'gpt-5.4', label: 'GPT-5.4', group: 'OpenAI', icon: 'sparkle' as const },
  { id: 'grok-4', label: 'Grok 4', group: 'xAI', icon: 'sparkle' as const },
]

const REASONING = [
  { id: 'high', label: 'High', hint: 'Default' },
  { id: 'medium', label: 'Medium', hint: undefined },
  { id: 'low', label: 'Low', hint: undefined },
]

const ACCESS = [
  {
    id: 'ask',
    label: 'Supervised',
    description: 'Ask before every tool call',
    icon: 'lock' as const,
  },
  {
    id: 'edits',
    label: 'Auto-accept edits',
    description: 'Edit files without asking',
    icon: 'pencil' as const,
  },
  {
    id: 'auto',
    label: 'Auto',
    description: 'Run most tools without asking',
    icon: 'sparkle' as const,
  },
  {
    id: 'full',
    label: 'Full access',
    description: 'No permission prompts',
    icon: 'lockOpen' as const,
  },
]

const PROJECTS = [
  { id: 'gpuix', label: 'gpuix' },
  { id: 'example-app', label: 'example-app' },
  { id: 'none', label: 'No project' },
]

const WORKSPACES = [
  { id: 'local', label: 'Local', icon: 'laptop' as const },
  { id: 'worktree', label: 'New worktree', icon: 'gitBranch' as const },
]

const BRANCHES = [
  { id: 'main', label: 'main' },
  { id: 'feat-selectors', label: 'feat/selectors' },
  { id: 'chat-example', label: 'chat-example' },
]

const OVERVIEW = `**GPUIX** is a React renderer for GPUI, Zed's GPU-accelerated UI framework. It renders native desktop interfaces through Metal, DirectX, or Vulkan. No Electron or web view.`

const ARCHITECTURE = `React sends host mutations through napi-rs. Rust keeps the retained tree and translates it into GPUI elements for each frame.`

const SELECTION = `Selection is rebuilt from the paint pass. Each string registers in document order, so a drag can cross elements.`

const SELECTION_CODE = `pub fn resolve_spans(
    elements: &[(&str, &str)],
    a: (usize, usize),
    b: (usize, usize),
) -> Vec<Span> {
    let (start, end) = if a <= b { (a, b) } else { (b, a) };
    let mut spans = Vec::new();
    for (ei, (key, text)) in elements.iter().enumerate().take(end.0 + 1).skip(start.0) {
        let from = if ei == start.0 { start.1 } else { 0 };
        let to = if ei == end.0 { end.1 } else { text.len() };
        if from < to {
            spans.push(Span { key: key.to_string(), range: from..to });
        }
    }
    spans
}`

const GUTTER = `The gutter width now follows the largest line number, so a five-digit line no longer hits the accent bar.`

const GUTTER_DIFF = [
  'diff --git a/packages/native/src/diff/mod.rs b/packages/native/src/diff/mod.rs',
  'index 8f2a1c4..d91b7e0 100644',
  '--- a/packages/native/src/diff/mod.rs',
  '+++ b/packages/native/src/diff/mod.rs',
  '@@ -78,12 +78,15 @@ impl FileDiff {',
  ' /// Width of one line-number gutter, fitted to the largest line number.',
  '-pub fn gutter_width(file: &FileDiff) -> f32 {',
  '-    GUTTER_WIDTH',
  '+pub fn gutter_width(file: &FileDiff, metrics: &Metrics) -> f32 {',
  '+    let digits = file.max_line.max(1).ilog10() + 1;',
  '+    (digits as f32 * 6.6 + 8.0 + 6.0).max(metrics.diff_gutter_width)',
  ' }',
].join('\n')

const HOT_RELOAD = `**No.** A \`.node\` cannot unload. The loop rebuilds and restarts.`

const SKILLS = `Skills are \`SKILL.md\` files. A mail-style list on the left, the body on the right.`

const WIRE_MODELS = `Default is DeepSeek V4 Flash. Keep Opus for long diffs. Hide GPT-5.4 behind the picker.`

const SDK_VS_GPUI = `GPUI is the renderer. A native SDK would still talk to it. GPUIX is the React layer on that same GPUI tree, so you keep JSX and skip a second UI stack.`

const SCRIPT_C = `scriptc is a Vercel Labs experiment. This demo has no live runtime for it. The chat still shows how a coding agent would walk that kind of patch in GPUIX.`

const MEMORY = `The chat example keeps one retained React child per turn. Pass \`itemCount\` and a window when the list grows. Native paint stays on visible rows only.`

const TURNS: Turn[] = [
  { kind: 'user', text: 'give me a quick overview' },
  { kind: 'fold', duration: 'Worked for 10 seconds' },
  { kind: 'markdown', source: OVERVIEW },
  { kind: 'user', text: 'How does React reach GPUI?' },
  { kind: 'fold', duration: 'Worked for 6 seconds' },
  { kind: 'markdown', source: ARCHITECTURE },
  { kind: 'user', text: 'How does cross-element text selection work?' },
  { kind: 'fold', duration: 'Worked for 14 seconds' },
  { kind: 'markdown', source: SELECTION },
  { kind: 'code', language: 'rust', source: SELECTION_CODE },
  { kind: 'user', text: 'Make the diff gutter width adapt to the largest line number.' },
  { kind: 'fold', duration: 'Worked for 8 seconds' },
  { kind: 'markdown', source: GUTTER },
  { kind: 'diff', patch: GUTTER_DIFF },
  { kind: 'user', text: 'Do I get hot reload when I edit the Rust side?' },
  { kind: 'fold', duration: 'Worked for 4 seconds' },
  { kind: 'markdown', source: HOT_RELOAD },
  { kind: 'user', text: 'How do skills show up in the app?' },
  { kind: 'fold', duration: 'Worked for 7 seconds' },
  { kind: 'markdown', source: SKILLS },
  { kind: 'user', text: 'Which models should I wire up?' },
  { kind: 'fold', duration: 'Worked for 5 seconds' },
  { kind: 'markdown', source: WIRE_MODELS },
]

const CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    title: 'give me a quick overview',
    group: 'Yesterday',
    project: 'gpuix',
    time: '16m',
    turns: TURNS,
  },
  {
    id: 'c2',
    title: 'Native SDK vs GPUI comparison',
    group: 'Yesterday',
    project: 'No project',
    time: '14h',
    turns: [
      { kind: 'user', text: 'Native SDK vs GPUI comparison' },
      { kind: 'fold', duration: 'Worked for 9 seconds' },
      { kind: 'markdown', source: SDK_VS_GPUI },
    ],
  },
  {
    id: 'c3',
    title: 'Vercel Labs scriptc implementat...',
    group: 'Yesterday',
    project: 'No project',
    time: '15h',
    turns: [
      { kind: 'user', text: 'Vercel Labs scriptc implementation notes' },
      { kind: 'fold', duration: 'Worked for 12 seconds' },
      { kind: 'markdown', source: SCRIPT_C },
    ],
  },
  {
    id: 'c4',
    title: 'check if any memory optimizatio...',
    group: 'This Month',
    project: 'gpuix',
    time: '2d',
    turns: [
      { kind: 'user', text: 'check if any memory optimizations are left' },
      { kind: 'fold', duration: 'Worked for 11 seconds' },
      { kind: 'markdown', source: MEMORY },
    ],
  },
]

const SAFE_MDX_STRESS = `# React-composed Markdown

This message uses **safe-mdx**, *styled spans*, ~~deleted text~~, an
\`inline code value\`, and [a link](https://github.com/holocron-hq/safe-mdx).

> The parser runs in TypeScript. Every Markdown node becomes a normal React component.
>
> GPUIX renders the resulting \`div\`, \`text\`, and \`code\` tree.

- nested **inline formatting** inside a list
- a second item with a long sentence that must wrap without leaving the transcript column
- [x] a GFM task item

| Path | Renderer | Native Markdown element | Host nodes | Scroll | When to use |
|:-----|:---------|:------------------------|-----------:|:-------|:------------|
| safe-mdx | React tree of div and text | no | many | overflow-x on this grid | Custom MDX components and React state inside a message |
| pulldown-cmark | one native markdown node | yes | one | overflow-x inside Rust | Default chat transcript. Cheapest paint. |
| grid table | one CSS grid of cells | no | one per cell | overflow-x on the flex parent | Wide comparison tables that must stay readable |

\`\`\`typescript
const tree = mdxParse(source)
return <SafeMdxRenderer markdown={source} mdast={tree} />
\`\`\`

<Callout title="Custom MDX component">
  MDX components also map to ordinary GPUIX React components.
</Callout>`

function IconButton({
  icon,
  onClick,
  dimmed,
  size = 14,
  testId,
}: {
  icon: IconName
  onClick?: () => void
  dimmed?: boolean
  size?: number
  testId?: string
}) {
  return (
    <Button
      testId={testId}
      disabled={dimmed}
      style={{
        width: 26,
        height: 26,
        flexShrink: 0,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        opacity: dimmed ? 0.35 : 1,
        hover: dimmed ? undefined : { backgroundColor: C.overlay },
        active: dimmed ? undefined : { backgroundColor: C.overlayStrong },
      }}
      onClick={onClick}
    >
      <Icon name={icon} size={size} color={C.tertiary} />
    </Button>
  )
}

function SidebarAction({
  icon,
  label,
  onClick,
  testId,
}: {
  icon: IconName
  label: string
  onClick?: () => void
  testId?: string
}) {
  return (
    <Button
      testId={testId}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 32,
        paddingLeft: 4,
        paddingRight: 4,
        borderRadius: 7,
        cursor: 'pointer',
        hover: { backgroundColor: C.item },
        active: { backgroundColor: C.overlayStrong },
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={14} color={C.secondary} />
      </div>
      <text style={{ fontSize: 13, color: C.secondary }}>{label}</text>
    </Button>
  )
}

function ConversationRow({
  conversation,
  active,
  onSelect,
}: {
  conversation: Conversation
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <Button
      testId={`thread-${conversation.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 7,
        paddingBottom: 7,
        borderRadius: 7,
        cursor: 'pointer',
        backgroundColor: active ? C.item : '#00000000',
        hover: { backgroundColor: C.item },
      }}
      onClick={() => onSelect(conversation.id)}
    >
      <text
        style={{
          fontSize: 13.5,
          lineHeight: 18,
          color: C.text,
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        {conversation.title}
      </text>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Icon name="folder" size={12.5} color={C.tertiary} />
        <text
          style={{
            fontSize: 13,
            lineHeight: 15,
            color: C.tertiary,
            flexGrow: 1,
            minWidth: 0,
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {conversation.project}
        </text>
        <text style={{ fontSize: 12.5, color: C.ghost, flexShrink: 0 }}>{conversation.time}</text>
      </div>
    </Button>
  )
}

function Sidebar({
  conversations,
  activeId,
  onSelect,
  onCollapse,
  onNewTask,
  onSearch,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onSettings,
  onFilter,
  filterActive,
}: {
  conversations: Conversation[]
  activeId: string
  onSelect: (id: string) => void
  onCollapse: () => void
  onNewTask: () => void
  onSearch: () => void
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
  onSettings: () => void
  onFilter: () => void
  filterActive: boolean
}) {
  const groups = useMemo(() => {
    const out: { name: string; items: Conversation[] }[] = []
    for (const conversation of conversations) {
      const last = out[out.length - 1]
      if (last && last.name === conversation.group) last.items.push(conversation)
      else out.push({ name: conversation.group, items: [conversation] })
    }
    return out
  }, [conversations])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        height: '100%',
        backgroundColor: C.sidebar,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          height: TITLEBAR_HEIGHT,
          flexShrink: 0,
        }}
      >
        <div style={{ width: TRAFFIC_LIGHT_CLEARANCE, height: '100%', flexShrink: 0 }} />
        <IconButton
          icon="sidebar"
          size={16}
          testId="sidebar-collapse"
          onClick={onCollapse}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            marginLeft: 6,
          }}
        >
          <IconButton icon="arrowLeft" dimmed={!canGoBack} testId="history-back" onClick={onBack} />
          <IconButton
            icon="arrowRight"
            dimmed={!canGoForward}
            testId="history-forward"
            onClick={onForward}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: 10, paddingRight: 10 }}>
        <SidebarAction icon="compose" label="New Task" testId="new-task" onClick={onNewTask} />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          minHeight: 0,
          overflowY: 'scroll',
          paddingLeft: 10,
          paddingRight: 10,
        }}
      >
        <div style={{ paddingBottom: 6 }}>
          <SidebarAction icon="search" label="Search" testId="search" onClick={onSearch} />
        </div>
        {groups.map((group, groupIndex) => (
          <div
            key={group.name}
            style={{ display: 'flex', flexDirection: 'column', paddingBottom: 10 }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                height: 28,
                paddingLeft: 8,
                paddingRight: 8,
              }}
            >
              <text
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: C.secondary,
                  flexGrow: 1,
                  minWidth: 0,
                }}
              >
                {group.name}
              </text>
              {groupIndex === 0 && (
                <Button
                  testId="thread-filter"
                  aria-label="Filter by project"
                  onClick={onFilter}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    backgroundColor: filterActive ? C.overlayStrong : '#00000000',
                    hover: { backgroundColor: C.overlay },
                  }}
                >
                  <Icon name="listFilter" size={14} color={filterActive ? C.text : C.secondary} />
                </Button>
              )}
            </div>
            {group.items.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeId}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          height: 40,
          flexShrink: 0,
          paddingLeft: 10,
          paddingRight: 10,
        }}
      >
        <IconButton icon="settings" testId="settings" onClick={onSettings} />
      </div>
    </div>
  )
}

function UserTurn({ text }: { text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        width: '100%',
      }}
    >
      <div
        style={{
          maxWidth: 540,
          minWidth: 0,
          backgroundColor: C.raised,
          borderRadius: 12,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 12,
          paddingRight: 12,
        }}
      >
        <text style={{ fontSize: 14, lineHeight: 20, color: C.text, minWidth: 0, maxWidth: '100%' }}>{text}</text>
      </div>
    </div>
  )
}

function WorkedFor({ duration }: { duration: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <Button
        aria-expanded={open}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          height: 24,
          width: '100%',
          cursor: 'pointer',
        }}
        onClick={() => setOpen((value) => !value)}
      >
        <div style={{ height: 1, flexGrow: 1, backgroundColor: C.border }} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            flexShrink: 0,
          }}
        >
          <text style={{ fontSize: 13.5, lineHeight: 18, fontWeight: 500, color: C.tertiary }}>
            {duration}
          </text>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={11.5} color={C.tertiary} />
        </div>
        <div style={{ height: 1, flexGrow: 1, backgroundColor: C.border }} />
      </Button>
      {open && (
        <text style={{ fontSize: 13, lineHeight: 18, color: C.secondary }}>
          Demo reasoning. No model ran. The fold is here so the chrome has something to open.
        </text>
      )}
    </div>
  )
}

const ROW_INNER_STYLE = { width: CONTENT_MAX_WIDTH, maxWidth: '100%' } as const
const ROW_STYLE = {
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  width: '100%',
  paddingTop: 8,
  paddingBottom: 8,
  paddingLeft: 20,
  paddingRight: 20,
} as const
const ROW_STYLE_FIRST = { ...ROW_STYLE, paddingTop: 22 } as const
const ROW_STYLE_LAST = { ...ROW_STYLE, paddingBottom: 22 } as const
const ROW_STYLE_ONLY = { ...ROW_STYLE, paddingTop: 22, paddingBottom: 22 } as const

function TranscriptRow({
  children,
  first,
  last,
}: {
  children: React.ReactNode
  first?: boolean
  last?: boolean
}) {
  const style = first && last ? ROW_STYLE_ONLY : first ? ROW_STYLE_FIRST : last ? ROW_STYLE_LAST : ROW_STYLE
  return (
    <div style={style}>
      <div style={ROW_INNER_STYLE}>{children}</div>
    </div>
  )
}

const CODE_CARD_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  minWidth: 0,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: C.border,
  backgroundColor: '#FFFFFF09',
  overflow: 'hidden',
} as const
const CODE_HEADER_STYLE = {
  paddingLeft: 12,
  paddingRight: 12,
  paddingTop: 5,
  paddingBottom: 5,
  borderBottomWidth: 1,
  borderColor: C.border,
  backgroundColor: '#FFFFFF05',
} as const
const CODE_BODY_STYLE = {
  minWidth: 0,
  paddingLeft: 12,
  paddingRight: 12,
  paddingTop: 10,
  paddingBottom: 10,
} as const

/**
 * The card `<code>` used to paint for you. The native element is a bare
 * surface now, so the roundness, the fill and the language header live here,
 * in app code, where they can match the rest of the design.
 */
function CodeBlock({
  code,
  language,
  showLineNumbers,
}: {
  code: string
  language?: string
  showLineNumbers?: boolean
}) {
  return (
    <div style={CODE_CARD_STYLE}>
      {language && (
        <div style={CODE_HEADER_STYLE}>
          <text style={{ fontSize: 12, color: C.secondary }}>{language}</text>
        </div>
      )}
      <code
        code={code}
        language={language}
        showLineNumbers={showLineNumbers}
        theme={CHAT_THEME}
        style={CODE_BODY_STYLE}
      />
    </div>
  )
}

function expandTurns(count: number): Turn[] {
  if (count <= TURNS.length) return TURNS.slice(0, count)
  const out = new Array<Turn>(count)
  for (let i = 0; i < count; i++) {
    out[i] = TURNS[i % TURNS.length]!
  }
  return out
}

function seedTurnsFor(id: string, turnCount: number): Turn[] {
  if (id === 'c1') return expandTurns(turnCount)
  return CONVERSATIONS.find((conversation) => conversation.id === id)?.turns.slice() ?? []
}

function demoReply({
  text,
  modelLabel,
  mode,
}: {
  text: string
  modelLabel: string
  mode: 'build' | 'plan'
}): Turn[] {
  const quoted = text.length > 80 ? `${text.slice(0, 77)}...` : text
  const modeLine =
    mode === 'plan'
      ? 'Plan mode is on, so this is a sketch, not a patch.'
      : 'Build mode is on. This still stays in the demo.'
  return [
    { kind: 'fold', duration: 'Worked for 2 seconds' },
    {
      kind: 'markdown',
      source: `This is the GPUIX chat demo. No model ran. You wrote "${quoted}". ${modelLabel} would answer here. ${modeLine}`,
    },
  ]
}

function titleFromDraft(text: string) {
  const first = text.trim().split(/\s+/).slice(0, 6).join(' ')
  return first.length > 42 ? `${first.slice(0, 39)}...` : first
}

function Inspector({
  conversation,
  model,
  reasoning,
  access,
  mode,
  project,
}: {
  conversation: Conversation | undefined
  model: string
  reasoning: string
  access: string
  mode: 'build' | 'plan'
  project: string
}) {
  const modelLabel = MODELS.find((item) => item.id === model)?.label ?? model
  const reasoningLabel = REASONING.find((item) => item.id === reasoning)?.label ?? reasoning
  const accessLabel = ACCESS.find((item) => item.id === access)?.label ?? access
  const projectLabel = PROJECTS.find((item) => item.id === project)?.label ?? project
  const rows = [
    ['Thread', conversation?.title ?? 'New task'],
    ['Project', projectLabel],
    ['Model', modelLabel],
    ['Reasoning', reasoningLabel],
    ['Access', accessLabel],
    ['Mode', mode === 'plan' ? 'Plan' : 'Build'],
    ['Turns', String(conversation?.turns.length ?? 0)],
  ]
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 260,
        flexShrink: 0,
        height: '100%',
        backgroundColor: C.sidebar,
        borderLeftWidth: 1,
        borderColor: C.sidebarBorder,
        paddingTop: 14,
        paddingLeft: 14,
        paddingRight: 14,
        gap: 10,
      }}
    >
      <text style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Inspector</text>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <text style={{ fontSize: 11.5, color: C.ghost }}>{label}</text>
          <text style={{ fontSize: 13, color: C.secondary }}>{value}</text>
        </div>
      ))}
    </div>
  )
}

/** A modal card. Dialog owns Escape, the backdrop press, the Tab trap, and
 *  moving focus in on open and back out on close. */
function OverlayCard({
  title,
  open,
  onClose,
  children,
  height,
  initialFocus,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
  height?: number
  initialFocus?: React.RefObject<PublicInstance | null>
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogBackdrop style={{ backgroundColor: '#00000066' }} />
        <DialogPopup
          initialFocus={initialFocus}
          style={{
            width: 420,
            height,
            maxWidth: '90%',
            backgroundColor: C.raised,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.borderStrong,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
            <DialogTitle style={{ flexGrow: 1 }}>
              <text style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{title}</text>
            </DialogTitle>
            <DialogClose
              testId="overlay-close"
              style={{
                height: 24,
                paddingLeft: 8,
                paddingRight: 8,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                hover: { backgroundColor: C.overlay },
              }}
            >
              <text style={{ fontSize: 12, color: C.secondary }}>Close</text>
            </DialogClose>
          </div>
          {children}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  )
}

const Transcript = memo(function Transcript({
  turns,
  includeSafeMdx = false,
  listRef,
  onRetry,
}: {
  turns: Turn[]
  includeSafeMdx?: boolean
  listRef?: React.Ref<PublicInstance>
  onRetry?: () => void
}) {
  return (
    <virtual-list
      ref={listRef}
      overdraw={240}
      estimatedItemHeight={220}
      style={{ flexGrow: 1, minHeight: 0, width: '100%' }}
    >
      {includeSafeMdx && (
        <TranscriptRow key="safemdx" first>
          <UserTurn text="Can Markdown be composed as normal React elements instead?" />
          <SafeMdxContent source={SAFE_MDX_STRESS} />
        </TranscriptRow>
      )}
      {turns.map((turn, index) => (
        <TranscriptRow
          key={index}
          first={!includeSafeMdx && index === 0}
          last={index === turns.length - 1}
        >
          {turn.kind === 'user' && <UserTurn text={turn.text} />}
          {turn.kind === 'fold' && <WorkedFor duration={turn.duration} />}
          {turn.kind === 'markdown' && <SafeMdxContent source={turn.source} />}
          {turn.kind === 'code' && (
            <CodeBlock code={turn.source} language={turn.language} showLineNumbers />
          )}
          {turn.kind === 'diff' && <diff patch={turn.patch} wordDiff theme={CHAT_THEME} />}
          {index === turns.length - 1 && turn.kind !== 'user' && <ActionBar onRetry={onRetry} />}
        </TranscriptRow>
      ))}
    </virtual-list>
  )
})

function WindowControls() {
  const { renderer } = useGpuix()
  const isDarwin = typeof process !== 'undefined' && process.platform === 'darwin'
  if (isDarwin) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        height: '100%',
        flexShrink: 0,
        marginLeft: 6,
      }}
    >
      <Button
        testId="window-minimize"
        aria-label="Minimize"
        onClick={() => renderer?.minimizeWindow?.()}
        style={{
          width: 44,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          hover: { backgroundColor: C.overlay },
          active: { backgroundColor: C.overlayStrong },
        }}
      >
        <Icon name="windowMinimize" size={12} color={C.secondary} />
      </Button>
      <Button
        testId="window-maximize"
        aria-label="Maximize"
        onClick={() => renderer?.zoomWindow?.()}
        style={{
          width: 44,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          hover: { backgroundColor: C.overlay },
          active: { backgroundColor: C.overlayStrong },
        }}
      >
        <Icon name="windowMaximize" size={12} color={C.secondary} />
      </Button>
      <Button
        testId="window-close"
        aria-label="Close"
        onClick={() => {
          if (typeof process !== 'undefined' && process.exit) process.exit(0)
        }}
        style={{
          width: 44,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          hover: { backgroundColor: '#E81123' },
          active: { backgroundColor: '#BF0F1D' },
        }}
      >
        <Icon name="windowClose" size={12} color={C.secondary} />
      </Button>
    </div>
  )
}

function ToggleSwitch({
  checked,
  onChange,
  testId,
}: {
  checked: boolean
  onChange: (val: boolean) => void
  testId?: string
}) {
  return (
    <Button
      testId={testId}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.5,
        borderColor: checked ? '#FFFFFF' : '#FFFFFF40',
        backgroundColor: '#00000000',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 3,
        paddingRight: 3,
        justifyContent: checked ? 'flex-end' : 'flex-start',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 13,
          height: 13,
          borderRadius: 6.5,
          backgroundColor: '#FFFFFF',
          pointerEvents: 'none',
        }}
      />
    </Button>
  )
}

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', icon: 'settings' as const },
  { id: 'appearance', label: 'Appearance', icon: 'contrast' as const },
  { id: 'providers', label: 'Providers', icon: 'blocks' as const },
  { id: 'skills', label: 'Skills', icon: 'cube' as const },
  { id: 'usage', label: 'Usage', icon: 'activity' as const },
  { id: 'daemon', label: 'Daemon', icon: 'server' as const },
]

function SettingsDropdown({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (val: string) => void
}) {
  const currentLabel = options.find((o) => o.value === value)?.label ?? value
  return (
    <Button
      onClick={() => {
        const nextIdx = (options.findIndex((o) => o.value === value) + 1) % options.length
        onChange(options[nextIdx].value)
      }}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: 28,
        paddingLeft: 10,
        paddingRight: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: '#262626',
        cursor: 'pointer',
        hover: { backgroundColor: C.overlayStrong },
      }}
    >
      <text style={{ fontSize: 13, color: C.text }}>{currentLabel}</text>
      <Icon name="chevronDown" size={10} color={C.tertiary} />
    </Button>
  )
}

function SettingsView({ onBack }: { onBack: () => void }) {
  const [activeSection, setActiveSection] = useState('general')
  const [searchQuery, setSearchQuery] = useState('')

  // General state
  const [shareUsage, setShareUsage] = useState(true)
  const [renderMath, setRenderMath] = useState(true)
  const [autoUpdates, setAutoUpdates] = useState(true)

  // Appearance state
  const [themeValue, setThemeValue] = useState('system')
  const [langValue, setLangValue] = useState('system')
  const [uiFontSize, setUiFontSize] = useState('14px')
  const [codeFontSize, setCodeFontSize] = useState('13px')

  // Providers state
  const [cursorEnabled, setCursorEnabled] = useState(true)
  const [openCodeEnabled, setOpenCodeEnabled] = useState(true)
  const [grokEnabled, setGrokEnabled] = useState(true)

  // Skills state
  const [selectedSkill, setSelectedSkill] = useState('find-skills')
  const [findSkillsEnabled, setFindSkillsEnabled] = useState(true)

  // Usage state
  const [usagePeriod, setUsagePeriod] = useState<'daily' | 'monthly' | 'projects'>('daily')
  const [usageCostType, setUsageCostType] = useState<'cost' | 'tokens'>('cost')
  const [usageBreakdownTab, setUsageBreakdownTab] = useState<'model' | 'day'>('model')

  // Daemon state
  const [daemonExposed, setDaemonExposed] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        backgroundColor: C.canvas,
        fontFamily: FONT_SANS,
        color: C.text,
        userSelect: 'none',
      }}
    >
      {/* Left Sidebar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 252,
          flexShrink: 0,
          height: '100%',
          backgroundColor: C.sidebar,
          borderRightWidth: 1,
          borderColor: C.sidebarBorder,
          paddingTop: 12,
          paddingLeft: 12,
          paddingRight: 12,
        }}
      >
        {/* Back Button */}
        <Button
          testId="settings-back"
          onClick={onBack}
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 32,
            paddingLeft: 6,
            paddingRight: 10,
            borderRadius: 7,
            cursor: 'pointer',
            hover: { backgroundColor: C.overlay },
            marginBottom: 8,
          }}
        >
          <Icon name="arrowLeft" size={14} color={C.secondary} />
          <text style={{ fontSize: 13.5, fontWeight: 500, color: C.text }}>Back</text>
        </Button>

        {/* Search Settings */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 32,
            paddingLeft: 10,
            paddingRight: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: C.border,
            backgroundColor: '#1E1E1E',
            marginBottom: 14,
          }}
        >
          <Icon name="search" size={13} color={C.ghost} />
          <input
            value={searchQuery}
            placeholder="Search Settings"
            theme={CHAT_THEME}
            style={{
              fontSize: 13,
              color: C.text,
              backgroundColor: '#00000000',
              borderWidth: 0,
              flexGrow: 1,
              minWidth: 0,
              height: 28,
            }}
            onChange={(e) => setSearchQuery(e.value ?? '')}
          />
        </div>

        {/* Nav Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SETTINGS_SECTIONS.map((section) => {
            const active = activeSection === section.id
            return (
              <Button
                key={section.id}
                testId={`settings-section-${section.id}`}
                onClick={() => setActiveSection(section.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  height: 36,
                  paddingLeft: 10,
                  paddingRight: 10,
                  borderRadius: 7,
                  cursor: 'pointer',
                  backgroundColor: active ? '#262626' : '#00000000',
                  hover: { backgroundColor: active ? '#262626' : C.item },
                }}
              >
                <Icon
                  name={section.icon}
                  size={15}
                  color={active ? C.text : C.secondary}
                />
                <text
                  style={{
                    fontSize: 13.5,
                    fontWeight: active ? 500 : 400,
                    color: active ? C.text : C.secondary,
                  }}
                >
                  {section.label}
                </text>
              </Button>
            )
          })}
        </div>
      </div>

      {/* Right Content Area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          minWidth: 0,
          height: '100%',
        }}
      >
        {/* Custom Window Titlebar Header */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            height: 38,
            flexShrink: 0,
            paddingRight: 4,
          }}
        >
          <WindowControls />
        </div>

        {/* Content Body */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            minHeight: 0,
            overflowY: 'scroll',
            paddingTop: 8,
            paddingLeft: activeSection === 'skills' ? 0 : 44,
            paddingRight: activeSection === 'skills' ? 0 : 44,
            paddingBottom: 40,
          }}
        >
          {activeSection !== 'skills' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                maxWidth: 720,
                gap: 14,
              }}
            >
              {/* SECTION: GENERAL */}
              {activeSection === 'general' && (
                <>
                  <text
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      color: C.text,
                      marginBottom: 10,
                    }}
                  >
                    General
                  </text>

                  {/* Local by default */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      backgroundColor: '#202020',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#E6EAF20A',
                      padding: 18,
                    }}
                  >
                    <text style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                      Local by default
                    </text>
                    <text style={{ fontSize: 13, lineHeight: 18, color: C.secondary }}>
                      Projects, conversations, and settings are stored on this computer
                    </text>
                  </div>

                  {/* Share anonymous usage data */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      backgroundColor: '#202020',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#E6EAF20A',
                      padding: 18,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1 }}>
                      <text style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                        Share anonymous usage data
                      </text>
                      <text
                        style={{
                          fontSize: 13,
                          lineHeight: 18,
                          color: C.secondary,
                          maxWidth: 520,
                        }}
                      >
                        Help improve Hiroshi by sharing feature usage and reliability data. Prompts, responses, project names, file paths, and other personal data are never included
                      </text>
                    </div>
                    <ToggleSwitch
                      checked={shareUsage}
                      onChange={setShareUsage}
                      testId="toggle-share-usage"
                    />
                  </div>

                  {/* Render math expressions */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      backgroundColor: '#202020',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#E6EAF20A',
                      padding: 18,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1 }}>
                      <text style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                        Render math expressions
                      </text>
                      <text
                        style={{
                          fontSize: 13,
                          lineHeight: 18,
                          color: C.secondary,
                          maxWidth: 520,
                        }}
                      >
                        Show formatted math in Markdown. Turn off to show LaTeX source.
                      </text>
                    </div>
                    <ToggleSwitch
                      checked={renderMath}
                      onChange={setRenderMath}
                      testId="toggle-render-math"
                    />
                  </div>

                  {/* Automatic updates */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      backgroundColor: '#202020',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#E6EAF20A',
                      padding: 18,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1 }}>
                      <text style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                        Automatic updates
                      </text>
                      <text
                        style={{
                          fontSize: 13,
                          lineHeight: 18,
                          color: C.secondary,
                          maxWidth: 520,
                        }}
                      >
                        Check for new versions in the background and offer to install them
                      </text>
                    </div>
                    <ToggleSwitch
                      checked={autoUpdates}
                      onChange={setAutoUpdates}
                      testId="toggle-auto-updates"
                    />
                  </div>
                </>
              )}

              {/* SECTION: APPEARANCE */}
              {activeSection === 'appearance' && (
                <>
                  <text
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      color: C.text,
                      marginBottom: 10,
                    }}
                  >
                    Appearance
                  </text>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      backgroundColor: '#202020',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#E6EAF20A',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Theme */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 18,
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <text style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Theme</text>
                        <text style={{ fontSize: 13, color: C.secondary }}>
                          Choose between system, light, or dark themes
                        </text>
                      </div>
                      <SettingsDropdown
                        value={themeValue}
                        options={[
                          { value: 'system', label: 'System' },
                          { value: 'dark', label: 'Dark' },
                          { value: 'light', label: 'Light' },
                        ]}
                        onChange={setThemeValue}
                      />
                    </div>

                    <div style={{ height: 1, backgroundColor: '#E6EAF20A' }} />

                    {/* Language */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 18,
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <text style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Language</text>
                        <text style={{ fontSize: 13, color: C.secondary }}>
                          Choose the language used throughout Hiroshi
                        </text>
                      </div>
                      <SettingsDropdown
                        value={langValue}
                        options={[
                          { value: 'system', label: 'System' },
                          { value: 'en', label: 'English' },
                          { value: 'ja', label: 'Japanese' },
                        ]}
                        onChange={setLangValue}
                      />
                    </div>

                    <div style={{ height: 1, backgroundColor: '#E6EAF20A' }} />

                    {/* UI font size */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 18,
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <text style={{ fontSize: 14, fontWeight: 600, color: C.text }}>UI font size</text>
                        <text style={{ fontSize: 13, color: C.secondary }}>
                          Text size across the interface and messages
                        </text>
                      </div>
                      <SettingsDropdown
                        value={uiFontSize}
                        options={[
                          { value: '13px', label: '13 px' },
                          { value: '14px', label: '14 px' },
                          { value: '15px', label: '15 px' },
                          { value: '16px', label: '16 px' },
                        ]}
                        onChange={setUiFontSize}
                      />
                    </div>

                    <div style={{ height: 1, backgroundColor: '#E6EAF20A' }} />

                    {/* Code font size */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 18,
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <text style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Code font size</text>
                        <text style={{ fontSize: 13, color: C.secondary }}>
                          Text size in the file editor, diffs, code blocks, and tool output
                        </text>
                      </div>
                      <SettingsDropdown
                        value={codeFontSize}
                        options={[
                          { value: '12px', label: '12 px' },
                          { value: '13px', label: '13 px' },
                          { value: '14px', label: '14 px' },
                        ]}
                        onChange={setCodeFontSize}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* SECTION: PROVIDERS */}
              {activeSection === 'providers' && (
                <>
                  <text
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      color: C.text,
                      marginBottom: 10,
                    }}
                  >
                    Providers
                  </text>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      backgroundColor: '#202020',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#E6EAF20A',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Header */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        padding: 18,
                        borderBottomWidth: 1,
                        borderColor: '#E6EAF20A',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexGrow: 1 }}>
                        <text style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                          Coding agents
                        </text>
                        <text style={{ fontSize: 13, lineHeight: 18, color: C.secondary, maxWidth: 480 }}>
                          Hiroshi drives agent CLIs installed on this computer. Install or sign in with each agent's own CLI, then refresh
                        </text>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <Button
                          style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            height: 28,
                            paddingLeft: 10,
                            paddingRight: 10,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: C.border,
                            backgroundColor: '#262626',
                            cursor: 'pointer',
                            hover: { backgroundColor: C.overlayStrong },
                          }}
                        >
                          <Icon name="retry" size={12} color={C.secondary} />
                          <text style={{ fontSize: 12.5, color: C.text }}>Refresh</text>
                        </Button>
                        <text style={{ fontSize: 11.5, color: C.ghost }}>Checked 12m ago</text>
                      </div>
                    </div>

                    {/* Agent list */}
                    {[
                      {
                        name: 'Amp',
                        status: 'Not detected on PATH as amp',
                        installed: false,
                        icon: 'zap' as const,
                      },
                      {
                        name: 'Claude Code',
                        status: 'Not detected on PATH as claude',
                        installed: false,
                        icon: 'sparkle' as const,
                      },
                      {
                        name: 'Codex CLI',
                        status: 'Not detected on PATH as codex',
                        installed: false,
                        icon: 'sparkle' as const,
                      },
                      {
                        name: 'Cursor CLI',
                        status: '~/AppData\\Local\\cursor-agent\\cursor-agent.CMD · 233 models',
                        installed: true,
                        icon: 'arrowRight' as const,
                        toggle: cursorEnabled,
                        onToggle: setCursorEnabled,
                      },
                      {
                        name: 'DeepSeek Harness',
                        status: 'Not detected on PATH as dsh',
                        installed: false,
                        icon: 'sparkle' as const,
                      },
                      {
                        name: 'Fx',
                        status: 'Not detected on PATH as fx',
                        installed: false,
                        icon: 'wrench' as const,
                      },
                      {
                        name: 'OpenCode v1.18.35',
                        status: '~/.bun\\bin\\opencode.EXE · 115 models',
                        installed: true,
                        icon: 'laptop' as const,
                        toggle: openCodeEnabled,
                        onToggle: setOpenCodeEnabled,
                      },
                      {
                        name: 'Grok Build v1.0.34',
                        status: '~/.grok\\bin\\grok.EXE · 2 models',
                        installed: true,
                        icon: 'activity' as const,
                        toggle: grokEnabled,
                        onToggle: setGrokEnabled,
                      },
                    ].map((agent, index) => (
                      <div
                        key={agent.name}
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingLeft: 16,
                          paddingRight: 16,
                          height: 52,
                          borderTopWidth: index === 0 ? 0 : 1,
                          borderColor: '#E6EAF208',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              backgroundColor: '#262626',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Icon name={agent.icon} size={14} color={agent.installed ? C.accent : C.secondary} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <text style={{ fontSize: 13.5, fontWeight: 500, color: C.text }}>
                              {agent.name}
                            </text>
                            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <div
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 3,
                                  backgroundColor: agent.installed ? '#10B981' : '#6B7280',
                                }}
                              />
                              <text style={{ fontSize: 12, color: C.secondary }}>{agent.status}</text>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <Icon name="chevronRight" size={13} color={C.ghost} />
                          {agent.installed && agent.onToggle && (
                            <ToggleSwitch checked={agent.toggle!} onChange={agent.onToggle} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* SECTION: USAGE */}
              {activeSection === 'usage' && (
                <>
                  {/* Usage Top bar */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <text style={{ fontSize: 22, fontWeight: 600, color: C.text }}>Usage</text>
                      <text style={{ fontSize: 13, color: C.secondary }}>Sep 20 to Oct 19</text>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {/* Segmented Daily/Monthly/Projects */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          backgroundColor: '#262626',
                          borderRadius: 7,
                          padding: 2,
                        }}
                      >
                        {(['daily', 'monthly', 'projects'] as const).map((tab) => (
                          <Button
                            key={tab}
                            onClick={() => setUsagePeriod(tab)}
                            style={{
                              height: 24,
                              paddingLeft: 8,
                              paddingRight: 8,
                              borderRadius: 5,
                              backgroundColor: usagePeriod === tab ? '#333333' : '#00000000',
                              cursor: 'pointer',
                            }}
                          >
                            <text
                              style={{
                                fontSize: 12,
                                fontWeight: usagePeriod === tab ? 500 : 400,
                                color: usagePeriod === tab ? C.text : C.secondary,
                              }}
                            >
                              {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </text>
                          </Button>
                        ))}
                      </div>

                      <SettingsDropdown
                        value="30d"
                        options={[{ value: '30d', label: 'Last 30 days' }]}
                        onChange={() => {}}
                      />

                      <Button
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#262626',
                          cursor: 'pointer',
                        }}
                      >
                        <Icon name="retry" size={12} color={C.secondary} />
                      </Button>
                    </div>
                  </div>

                  {/* RAW TOKEN COST Card */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      backgroundColor: '#202020',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#E6EAF20A',
                      padding: 18,
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <text style={{ fontSize: 11.5, fontWeight: 600, color: C.ghost }}>
                        RAW TOKEN COST
                      </text>
                      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'row',
                            backgroundColor: '#262626',
                            borderRadius: 6,
                            padding: 2,
                          }}
                        >
                          {(['cost', 'tokens'] as const).map((t) => (
                            <Button
                              key={t}
                              onClick={() => setUsageCostType(t)}
                              style={{
                                height: 20,
                                paddingLeft: 6,
                                paddingRight: 6,
                                borderRadius: 4,
                                backgroundColor: usageCostType === t ? '#383838' : '#00000000',
                              }}
                            >
                              <text style={{ fontSize: 11, fontWeight: 500, color: usageCostType === t ? C.text : C.secondary }}>
                                {t.toUpperCase()}
                              </text>
                            </Button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#E2795B' }} />
                          <text style={{ fontSize: 12, color: C.secondary }}>Claude Code</text>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1 }}>
                        <text style={{ fontSize: 28, fontWeight: 700, color: C.text }}>$1.36*</text>
                        <text style={{ fontSize: 12, color: C.ghost }}>* if billed at full API rate</text>

                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
                          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
                            <text style={{ fontSize: 12.5, color: C.text }}>Claude Code</text>
                            <text style={{ fontSize: 12.5, color: C.text }}>$1.36</text>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, backgroundColor: '#333333', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: '100%', backgroundColor: '#E2795B' }} />
                          </div>
                          <text style={{ fontSize: 11.5, color: C.ghost }}>100.0% of cost · 3.21M tokens</text>
                        </div>
                      </div>

                      {/* Chart representation */}
                      <div style={{ display: 'flex', flexDirection: 'column', width: 280, height: 110, justifyContent: 'space-between', paddingLeft: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
                          <text style={{ fontSize: 11, color: C.ghost }}>$1.50</text>
                          <div style={{ width: 220, height: 1, backgroundColor: '#FFFFFF0A' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', position: 'relative' }}>
                          <text style={{ fontSize: 11, color: C.ghost }}>$1.00</text>
                          <div style={{ width: 220, height: 1, backgroundColor: '#FFFFFF0A' }} />
                          {/* Visual Spike */}
                          <div
                            style={{
                              position: 'absolute',
                              left: 30,
                              top: -20,
                              width: 3,
                              height: 60,
                              backgroundColor: '#E2795B',
                              borderRadius: 1.5,
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
                          <text style={{ fontSize: 11, color: C.ghost }}>$0.50</text>
                          <div style={{ width: 220, height: 1, backgroundColor: '#FFFFFF0A' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
                          <text style={{ fontSize: 11, color: C.ghost }}>0</text>
                          <div style={{ width: 220, height: 1, backgroundColor: '#FFFFFF12' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 20 }}>
                          <text style={{ fontSize: 11, color: C.ghost }}>Sep 20</text>
                          <text style={{ fontSize: 11, color: C.ghost }}>Oct 5</text>
                          <text style={{ fontSize: 11, color: C.ghost }}>Oct 19</text>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 5 Stats Cards Row */}
                  <div style={{ display: 'flex', flexDirection: 'row', gap: 10 }}>
                    {[
                      { title: 'Processed tokens', value: '3.21M', sub: '3.21M per active...' },
                      { title: 'Cached input', value: '3.05M', sub: '100.0% of obser...' },
                      { title: 'Uncached input', value: '86', sub: '145K cache writes' },
                      { title: 'Output', value: '14.2K', sub: 'includes 0 reaso...' },
                      { title: 'Cache savings', value: '$9.48', sub: '7.0x the raw toke...' },
                    ].map((stat) => (
                      <div
                        key={stat.title}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          flexGrow: 1,
                          backgroundColor: '#202020',
                          borderRadius: 10,
                          padding: 12,
                          borderWidth: 1,
                          borderColor: '#E6EAF20A',
                          gap: 4,
                        }}
                      >
                        <text style={{ fontSize: 11.5, color: C.secondary }}>{stat.title}</text>
                        <text style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{stat.value}</text>
                        <text style={{ fontSize: 11, color: C.ghost }}>{stat.sub}</text>
                      </div>
                    ))}
                  </div>

                  {/* Breakdown Table */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      backgroundColor: '#202020',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#E6EAF20A',
                      padding: 16,
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <text style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>Breakdown</text>
                      <div style={{ display: 'flex', flexDirection: 'row', backgroundColor: '#262626', borderRadius: 6, padding: 2 }}>
                        {(['model', 'day'] as const).map((tab) => (
                          <Button
                            key={tab}
                            onClick={() => setUsageBreakdownTab(tab)}
                            style={{
                              height: 20,
                              paddingLeft: 8,
                              paddingRight: 8,
                              borderRadius: 4,
                              backgroundColor: usageBreakdownTab === tab ? '#383838' : '#00000000',
                            }}
                          >
                            <text style={{ fontSize: 11, fontWeight: 500, color: usageBreakdownTab === tab ? C.text : C.secondary }}>
                              {tab.toUpperCase()}
                            </text>
                          </Button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'row', gap: 14 }}>
                        <text style={{ fontSize: 12, color: C.ghost }}>Provider reported 0.0%</text>
                        <text style={{ fontSize: 12, color: C.ghost }}>Model priced 100.0%</text>
                      </div>
                    </div>

                    <div style={{ height: 1, backgroundColor: '#E6EAF208' }} />

                    {/* Table headers */}
                    <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 6, paddingRight: 6 }}>
                      <text style={{ fontSize: 12, color: C.ghost, width: 200 }}>Model</text>
                      <text style={{ fontSize: 12, color: C.ghost, width: 80, textAlign: 'right' }}>Cost</text>
                      <text style={{ fontSize: 12, color: C.ghost, width: 80, textAlign: 'right' }}>Share</text>
                      <text style={{ fontSize: 12, color: C.ghost, width: 80, textAlign: 'right' }}>Tokens</text>
                    </div>

                    {/* Table rows */}
                    {[
                      { model: 'claude-opus-5-5', cost: '$0.89', share: '65.4%', tokens: '2.06M' },
                      { model: 'claude-sonnet-5', cost: '$0.47', share: '34.6%', tokens: '1.15M' },
                    ].map((row) => (
                      <div
                        key={row.model}
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          paddingLeft: 6,
                          paddingRight: 6,
                          paddingTop: 4,
                          paddingBottom: 4,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, width: 200 }}>
                          <Icon name="sparkle" size={13} color="#E2795B" />
                          <text style={{ fontSize: 13, color: C.text }}>{row.model}</text>
                        </div>
                        <text style={{ fontSize: 13, color: C.text, width: 80, textAlign: 'right' }}>{row.cost}</text>
                        <text style={{ fontSize: 13, color: C.secondary, width: 80, textAlign: 'right' }}>{row.share}</text>
                        <text style={{ fontSize: 13, color: C.secondary, width: 80, textAlign: 'right' }}>{row.tokens}</text>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* SECTION: DAEMON */}
              {activeSection === 'daemon' && (
                <>
                  <text
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      color: C.text,
                      marginBottom: 10,
                    }}
                  >
                    Daemon
                  </text>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      backgroundColor: '#202020',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#E6EAF20A',
                      padding: 18,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1 }}>
                      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <text style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                          Expose managed daemon
                        </text>
                        <div
                          style={{
                            paddingLeft: 6,
                            paddingRight: 6,
                            paddingTop: 2,
                            paddingBottom: 2,
                            borderRadius: 4,
                            backgroundColor: '#2B2B2B',
                          }}
                        >
                          <text style={{ fontSize: 11, color: C.secondary }}>Local only</text>
                        </div>
                      </div>
                      <text
                        style={{
                          fontSize: 13,
                          lineHeight: 18,
                          color: C.secondary,
                          maxWidth: 540,
                        }}
                      >
                        Listen beyond this machine so another Hiroshi client can connect. Changing this restarts only the daemon.
                      </text>
                    </div>
                    <ToggleSwitch
                      checked={daemonExposed}
                      onChange={setDaemonExposed}
                      testId="toggle-daemon"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* SECTION: SKILLS (2-column layout matching Screenshot 3) */}
          {activeSection === 'skills' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                width: '100%',
                height: '100%',
              }}
            >
              {/* Middle Skills List Column */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: 250,
                  flexShrink: 0,
                  borderRightWidth: 1,
                  borderColor: C.sidebarBorder,
                  padding: 12,
                  gap: 8,
                }}
              >
                {/* Search skills input */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    height: 30,
                    paddingLeft: 8,
                    paddingRight: 8,
                    borderRadius: 7,
                    borderWidth: 1,
                    borderColor: C.border,
                    backgroundColor: '#1E1E1E',
                  }}
                >
                  <Icon name="search" size={12} color={C.ghost} />
                  <input
                    placeholder="Search skills..."
                    theme={CHAT_THEME}
                    style={{
                      fontSize: 12.5,
                      color: C.text,
                      backgroundColor: '#00000000',
                      borderWidth: 0,
                      flexGrow: 1,
                      minWidth: 0,
                    }}
                  />
                </div>

                {/* Filter chip */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    height: 28,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: C.border,
                    backgroundColor: '#222222',
                  }}
                >
                  <Icon name="cube" size={13} color={C.secondary} />
                  <text style={{ fontSize: 12.5, color: C.text }}>All skills</text>
                  <Icon name="chevronDown" size={10} color={C.ghost} />
                </div>

                <div style={{ marginTop: 6, marginBottom: 2 }}>
                  <text style={{ fontSize: 11, fontWeight: 600, color: C.ghost }}>USER 3</text>
                </div>

                {/* Skill List items */}
                {[
                  { id: 'find-skills', name: 'find-skills', desc: 'Helps users discover and install a...', icon: 'cube' as const },
                  { id: 'native-sdk', name: 'native-sdk', desc: 'Discovery skill for the Native SDK...', icon: 'arrowRight' as const },
                  { id: 'opentui', name: 'opentui', desc: 'Build terminal UIs with OpenTUI...', icon: 'cube' as const },
                ].map((skill) => {
                  const isSel = selectedSkill === skill.id
                  return (
                    <Button
                      key={skill.id}
                      onClick={() => setSelectedSkill(skill.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        padding: 8,
                        borderRadius: 8,
                        cursor: 'pointer',
                        backgroundColor: isSel ? '#262626' : '#00000000',
                        hover: { backgroundColor: isSel ? '#262626' : C.item },
                      }}
                    >
                      <Icon name={skill.icon} size={14} color={isSel ? C.text : C.secondary} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1, minWidth: 0 }}>
                        <text style={{ fontSize: 13, fontWeight: isSel ? 600 : 500, color: C.text }}>
                          {skill.name}
                        </text>
                        <text
                          style={{
                            fontSize: 11.5,
                            color: C.secondary,
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {skill.desc}
                        </text>
                      </div>
                    </Button>
                  )
                })}

                <div style={{ flexGrow: 1 }} />
                <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 6 }}>
                  <text style={{ fontSize: 11.5, color: C.ghost }}>3 skills</text>
                </div>
              </div>

              {/* Right Skill Detail Pane */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flexGrow: 1,
                  padding: 24,
                  gap: 16,
                  overflowY: 'scroll',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        backgroundColor: '#262626',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name="cube" size={18} color={C.text} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <text style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
                        {selectedSkill}
                      </text>
                      <text style={{ fontSize: 12, color: C.tertiary }}>
                        Shared · available in every project
                      </text>
                    </div>
                  </div>

                  <ToggleSwitch
                    checked={findSkillsEnabled}
                    onChange={setFindSkillsEnabled}
                    testId="toggle-find-skills"
                  />
                </div>

                {/* Description */}
                <text style={{ fontSize: 13, lineHeight: 20, color: C.secondary }}>
                  Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.
                </text>

                {/* Metadata Table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Invoke', value: `/${selectedSkill}` },
                    { label: 'Location', value: `.../skills/${selectedSkill}` },
                    { label: 'Contents', value: '5.4 KB' },
                    { label: 'Updated', value: '90d ago' },
                  ].map((row) => (
                    <div key={row.label} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                      <text style={{ fontSize: 12.5, color: C.tertiary, width: 80 }}>{row.label}</text>
                      <text style={{ fontSize: 12.5, fontFamily: FONT_MONO, color: C.text }}>{row.value}</text>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
                  <Button
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      height: 28,
                      paddingLeft: 10,
                      paddingRight: 10,
                      borderRadius: 6,
                      backgroundColor: '#262626',
                      borderWidth: 1,
                      borderColor: C.border,
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name="pencil" size={12} color={C.secondary} />
                    <text style={{ fontSize: 12.5, color: C.text }}>Open SKILL.md</text>
                  </Button>
                  <Button
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      height: 28,
                      paddingLeft: 10,
                      paddingRight: 10,
                      borderRadius: 6,
                      backgroundColor: '#262626',
                      borderWidth: 1,
                      borderColor: C.border,
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name="folder" size={12} color={C.secondary} />
                    <text style={{ fontSize: 12.5, color: C.text }}>Show in File Manager</text>
                  </Button>
                  <Button
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      height: 28,
                      paddingLeft: 10,
                      paddingRight: 10,
                      borderRadius: 6,
                      backgroundColor: '#262626',
                      borderWidth: 1,
                      borderColor: C.border,
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name="copy" size={12} color={C.secondary} />
                    <text style={{ fontSize: 12.5, color: C.text }}>Copy Path</text>
                  </Button>
                  <Button
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      height: 28,
                      paddingLeft: 10,
                      paddingRight: 10,
                      borderRadius: 6,
                      backgroundColor: '#262626',
                      borderWidth: 1,
                      borderColor: C.border,
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name="trash" size={12} color={C.secondary} />
                    <text style={{ fontSize: 12.5, color: C.text }}>Delete</text>
                  </Button>
                </div>

                <div style={{ height: 1, backgroundColor: C.border, marginTop: 4, marginBottom: 4 }} />

                {/* SKILL.md preview */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <text style={{ fontSize: 12, fontWeight: 500, color: C.ghost }}>SKILL.md</text>
                  <text style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Find Skills</text>
                  <text style={{ fontSize: 13, lineHeight: 20, color: C.secondary }}>
                    This skill helps you discover and install skills from the open agent skills ecosystem.
                  </text>
                  <text style={{ fontSize: 15, fontWeight: 600, color: C.text, marginTop: 8 }}>
                    When to Use This Skill
                  </text>
                  <text style={{ fontSize: 13, lineHeight: 20, color: C.secondary }}>
                    Use this skill when the user:
                  </text>
                  <text style={{ fontSize: 13, lineHeight: 20, color: C.secondary, paddingLeft: 12 }}>
                    • Asks "how do I do X" where X might be a common task with an existing skill
                  </text>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Header({
  collapsed,
  onExpand,
  title,
  turnCount,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onToggleInspector,
}: {
  collapsed: boolean
  onExpand: () => void
  title: string
  turnCount: number
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
  onToggleInspector: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: TITLEBAR_HEIGHT,
        flexShrink: 0,
        paddingLeft: collapsed ? 0 : 14,
        paddingRight: 14,
        userSelect: 'none',
      }}
    >
      {collapsed && (
        <>
          <div style={{ width: TRAFFIC_LIGHT_CLEARANCE - 8, height: '100%', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IconButton icon="sidebar" testId="sidebar-expand" onClick={onExpand} />
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <IconButton icon="arrowLeft" dimmed={!canGoBack} onClick={onBack} />
              <IconButton icon="arrowRight" dimmed={!canGoForward} onClick={onForward} />
            </div>
          </div>
        </>
      )}
      <text
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: C.text,
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          minWidth: 0,
          flexShrink: 1,
        }}
      >
        {title}
      </text>
      {turnCount > TURNS.length && (
        <text
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: C.tertiary,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {turnCount.toLocaleString('en-US')} messages
        </text>
      )}
      <div style={{ flexGrow: 1 }} />
      <IconButton
        icon="panelRight"
        testId="inspector-toggle"
        onClick={onToggleInspector}
      />
      <WindowControls />
    </div>
  )
}

const MENU = {
  minWidth: 220,
  paddingTop: 4,
  paddingBottom: 4,
  paddingLeft: 4,
  paddingRight: 4,
  backgroundColor: C.raised,
  borderWidth: 1,
  borderColor: C.borderStrong,
  borderRadius: 12,
} satisfies StyleDesc

function menuItemStyle(state: { selected: boolean; highlighted: boolean }): StyleDesc {
  return {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderRadius: 7,
    backgroundColor: state.highlighted ? '#404040' : state.selected ? '#2C2C2C' : C.raised,
    hover: { backgroundColor: '#404040' },
    cursor: 'pointer',
  }
}

type MenuRowProps = Props & {
  label: string
  description?: string
  icon?: IconName
  selected: boolean
  hint?: string
}

const MenuRow = React.forwardRef<PublicInstance, MenuRowProps>(function MenuRow(
  { label, description, icon, selected, hint, style, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        paddingTop: description ? 6 : 5,
        paddingBottom: description ? 6 : 5,
        paddingLeft: 8,
        paddingRight: 8,
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={14} color={C.tertiary} />}
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
        <text
          style={{
            fontSize: 12.5,
            fontWeight: selected ? 600 : 500,
            color: C.text,
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </text>
        {description && (
          <text style={{ fontSize: 12.5, lineHeight: 14, color: C.tertiary, paddingTop: 2 }}>
            {description}
          </text>
        )}
      </div>
      {hint && <text style={{ fontSize: 11.5, color: C.ghost, flexShrink: 0 }}>{hint}</text>}
      {selected && <Icon name="check" size={11} color={C.tertiary} />}
    </div>
  )
})

function ChipSelect({
  value,
  onChange,
  items,
  icon,
  label,
  caret = true,
  accent,
  menuWidth,
  testId,
  children,
}: {
  value: string
  onChange: (next: string) => void
  items: { value: string; label: string }[]
  icon: IconName
  label: string
  caret?: boolean
  accent?: boolean
  menuWidth?: number
  testId?: string
  children: React.ReactNode
}) {
  return (
    <Select items={items} value={value} onValueChange={onChange} style={{ flexShrink: 0 }}>
      <div style={{ position: 'relative', display: 'flex' }}>
        <SelectTrigger
          testId={testId}
          style={(state: any) => ({
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            height: 26,
            paddingLeft: 7,
            paddingRight: 7,
            borderRadius: 6,
            cursor: 'pointer',
            backgroundColor: state.open ? C.overlay : '#00000000',
            hover: { backgroundColor: C.overlay },
          })}
        >
          <Icon name={icon} size={12} color={accent ? C.accent : C.tertiary} />
          <text
            style={{
              fontSize: 13,
              lineHeight: 16,
              color: accent ? C.accent : C.secondary,
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </text>
          {caret && <Icon name="chevronDown" size={10.5} color={C.ghost} />}
        </SelectTrigger>
        <SelectContent side="top" sideOffset={4} style={{ ...MENU, minWidth: menuWidth ?? 220 }}>
          {children}
        </SelectContent>
      </div>
    </Select>
  )
}

function ModelPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const selected = MODELS.find((model) => model.id === value) ?? MODELS[0]
  const groups = useMemo(() => {
    const out: { name: string; items: typeof MODELS }[] = []
    for (const model of MODELS) {
      const last = out[out.length - 1]
      if (last && last.name === model.group) last.items.push(model)
      else out.push({ name: model.group, items: [model] })
    }
    return out
  }, [])

  return (
    <ChipSelect
      value={value}
      onChange={onChange}
      items={MODELS.map((model) => ({ value: model.id, label: model.label }))}
      icon={selected.icon}
      label={selected.label}
      testId="model-picker"
    >
      {groups.map((group, index) => (
        <div key={group.name} style={{ display: 'flex', flexDirection: 'column' }}>
          {index > 0 && (
            <div style={{ height: 1, backgroundColor: C.border, marginTop: 4, marginBottom: 4 }} />
          )}
          <SelectLabel
            style={{
              height: 22,
              paddingLeft: 8,
              paddingRight: 8,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <text style={{ fontSize: 11.5, fontWeight: 500, color: C.ghost }}>{group.name}</text>
          </SelectLabel>
          {group.items.map((model) => (
            <SelectItem
              asChild
              key={model.id}
              value={model.id}
              testId={`model-${model.id}`}
              style={(state: any) => menuItemStyle(state)}
            >
              {(state: any) => (
                <MenuRow label={model.label} icon={model.icon} selected={state.selected} />
              )}
            </SelectItem>
          ))}
        </div>
      ))}
    </ChipSelect>
  )
}

function ReasoningPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const selected = REASONING.find((option) => option.id === value) ?? REASONING[0]
  return (
    <ChipSelect
      value={value}
      onChange={onChange}
      items={REASONING.map((option) => ({ value: option.id, label: option.label }))}
      icon={value === 'low' ? 'zap' : 'sparkle'}
      label={selected.label}
      caret={false}
    >
      <SelectLabel
        style={{
          height: 22,
          paddingLeft: 8,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <text style={{ fontSize: 11.5, fontWeight: 500, color: C.ghost }}>Reasoning</text>
      </SelectLabel>
      {REASONING.map((option) => (
        <SelectItem
          asChild
          key={option.id}
          value={option.id}
          testId={`reasoning-${option.id}`}
          style={(state: any) => menuItemStyle(state)}
        >
          {(state: any) => (
            <MenuRow label={option.label} hint={option.hint} selected={state.selected} />
          )}
        </SelectItem>
      ))}
    </ChipSelect>
  )
}

function AccessPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const selected = ACCESS.find((option) => option.id === value) ?? ACCESS[3]
  return (
    <ChipSelect
      value={value}
      onChange={onChange}
      items={ACCESS.map((option) => ({ value: option.id, label: option.label }))}
      icon={selected.icon}
      label={selected.label}
      caret={false}
      menuWidth={288}
    >
      {ACCESS.map((option) => (
        <SelectItem
          asChild
          key={option.id}
          value={option.id}
          testId={`access-${option.id}`}
          style={(state: any) => menuItemStyle(state)}
        >
          {(state: any) => (
            <MenuRow
              label={option.label}
              description={option.description}
              icon={option.icon}
              selected={state.selected}
            />
          )}
        </SelectItem>
      ))}
    </ChipSelect>
  )
}

function ProjectPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const selected = PROJECTS.find((option) => option.id === value) ?? PROJECTS[0]
  return (
    <ChipSelect
      value={value}
      onChange={onChange}
      items={PROJECTS.map((option) => ({ value: option.id, label: option.label }))}
      icon="folder"
      label={selected.label}
      caret={false}
    >
      {PROJECTS.map((option) => (
        <SelectItem
          asChild
          key={option.id}
          value={option.id}
          testId={`project-${option.id}`}
          style={(state: any) => menuItemStyle(state)}
        >
          {(state: any) => <MenuRow label={option.label} icon="folder" selected={state.selected} />}
        </SelectItem>
      ))}
    </ChipSelect>
  )
}

function WorkspacePicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const selected = WORKSPACES.find((option) => option.id === value) ?? WORKSPACES[0]
  return (
    <ChipSelect
      value={value}
      onChange={onChange}
      items={WORKSPACES.map((option) => ({ value: option.id, label: option.label }))}
      icon={selected.icon}
      label={selected.label}
      caret={false}
    >
      <SelectLabel
        style={{
          height: 22,
          paddingLeft: 8,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <text style={{ fontSize: 11.5, fontWeight: 500, color: C.ghost }}>Work in</text>
      </SelectLabel>
      {WORKSPACES.map((option) => (
        <SelectItem
          asChild
          key={option.id}
          value={option.id}
          testId={`workspace-${option.id}`}
          style={(state: any) => menuItemStyle(state)}
        >
          {(state: any) => (
            <MenuRow label={option.label} icon={option.icon} selected={state.selected} />
          )}
        </SelectItem>
      ))}
    </ChipSelect>
  )
}

function BranchPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const selected = BRANCHES.find((option) => option.id === value) ?? BRANCHES[0]
  return (
    <ChipSelect
      value={value}
      onChange={onChange}
      items={BRANCHES.map((option) => ({ value: option.id, label: option.label }))}
      icon="gitBranch"
      label={selected.label}
    >
      {BRANCHES.map((option) => (
        <SelectItem
          asChild
          key={option.id}
          value={option.id}
          testId={`branch-${option.id}`}
          style={(state: any) => menuItemStyle(state)}
        >
          {(state: any) => <MenuRow label={option.label} icon="gitBranch" selected={state.selected} />}
        </SelectItem>
      ))}
    </ChipSelect>
  )
}

function ModeToggle({
  value,
  onChange,
}: {
  value: 'build' | 'plan'
  onChange: (next: 'build' | 'plan') => void
}) {
  const plan = value === 'plan'
  return (
    <Button
      aria-label="Mode"
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 26,
        paddingLeft: 7,
        paddingRight: 7,
        borderRadius: 6,
        cursor: 'pointer',
        hover: { backgroundColor: C.overlay },
      }}
      onClick={() => onChange(plan ? 'build' : 'plan')}
    >
      <Icon name={plan ? 'list' : 'wrench'} size={12} color={plan ? C.accent : C.tertiary} />
      <text style={{ fontSize: 13, lineHeight: 16, color: plan ? C.accent : C.secondary }}>
        {plan ? 'Plan' : 'Build'}
      </text>
    </Button>
  )
}

function Composer({
  value,
  onChange,
  onSend,
  model,
  onModelChange,
  reasoning,
  onReasoningChange,
  access,
  onAccessChange,
  mode,
  onModeChange,
  focusTick,
}: {
  value: string
  onChange: (next: string) => void
  onSend: (text: string) => void
  model: string
  onModelChange: (next: string) => void
  reasoning: string
  onReasoningChange: (next: string) => void
  access: string
  onAccessChange: (next: string) => void
  mode: 'build' | 'plan'
  onModeChange: (next: 'build' | 'plan') => void
  focusTick: number
}) {
  const composerRef = useRef<PublicInstance | null>(null)
  const { renderer } = useGpuix()
  useEffect(() => {
    const id = composerRef.current?.id
    if (id == null) return
    renderer?.focusElement?.(id)
  }, [focusTick, renderer])
  const ready = value.trim().length > 0
  const send = (text: string) => {
    const next = text.trim()
    if (!next) return
    onSend(next)
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flexShrink: 0,
        paddingLeft: 20,
        paddingRight: 20,
        overflow: 'visible',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: CONTENT_MAX_WIDTH,
          overflow: 'visible',
          backgroundColor: C.composer,
          borderRadius: 13,
          borderWidth: 1,
          borderColor: C.border,
          paddingTop: 10,
          paddingBottom: 10,
        }}
      >
        <textarea
          ref={composerRef}
          testId="composer"
          value={value}
          placeholder="Do anything..."
          minRows={1}
          maxRows={3}
          autoFocus
          theme={CHAT_THEME}
          style={{
            width: '100%',
            minWidth: 0,
            fontSize: 14,
            lineHeight: 20,
            color: C.text,
            backgroundColor: '#00000000',
            borderWidth: 0,
            paddingLeft: 10,
            paddingRight: 10,
          }}
          onChange={(event) => onChange(event.value ?? '')}
          onSubmit={(event) => send(event.value ?? value)}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginTop: 8,
            paddingLeft: 10,
            paddingRight: 10,
          }}
        >
          <ModelPicker value={model} onChange={onModelChange} />
          <ReasoningPicker value={reasoning} onChange={onReasoningChange} />
          <AccessPicker value={access} onChange={onAccessChange} />
          <ModeToggle value={mode} onChange={onModeChange} />
          <div style={{ flexGrow: 1 }} />
          <div
            testId="send"
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: ready ? 'pointer' : undefined,
              backgroundColor: ready ? C.inverse : C.overlayStrong,
              hover: ready ? { opacity: 0.9 } : undefined,
            }}
            onClick={() => send(value)}
          >
            <Icon name="send" size={16} color={ready ? C.onInverse : C.ghost} />
          </div>
        </div>
      </div>
    </div>
  )
}

function WorkspaceFooter({
  project,
  onProjectChange,
  workspace,
  onWorkspaceChange,
  branch,
  onBranchChange,
}: {
  project: string
  onProjectChange: (next: string) => void
  workspace: string
  onWorkspaceChange: (next: string) => void
  branch: string
  onBranchChange: (next: string) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flexShrink: 0,
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 4,
        paddingBottom: 8,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          width: '100%',
          maxWidth: CONTENT_MAX_WIDTH,
          height: 28,
          paddingLeft: 10,
          paddingRight: 10,
        }}
      >
        <ProjectPicker value={project} onChange={onProjectChange} />
        <WorkspacePicker value={workspace} onChange={onWorkspaceChange} />
        {project !== 'none' && <BranchPicker value={branch} onChange={onBranchChange} />}
        <div style={{ flexGrow: 1 }} />
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#3B82F6',
            flexShrink: 0,
          }}
        />
      </div>
    </div>
  )
}

function GhostButton({
  icon,
  label,
  active,
  onClick,
  testId,
}: {
  icon: IconName
  label?: string
  active?: boolean
  onClick?: () => void
  testId?: string
}) {
  const color = active ? C.text : C.ghost
  return (
    <Button
      testId={testId}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 30,
        paddingLeft: label ? 9 : 0,
        paddingRight: label ? 11 : 0,
        width: label ? undefined : 30,
        justifyContent: 'center',
        borderRadius: 10,
        cursor: 'pointer',
        backgroundColor: active ? C.overlayStrong : '#00000000',
        hover: { backgroundColor: C.overlay },
      }}
      onClick={onClick}
    >
      <Icon name={icon} size={16} color={color} />
      {label && <text style={{ fontSize: 12.5, color }}>{label}</text>}
    </Button>
  )
}

function ActionBar({ onRetry }: { onRetry?: () => void }) {
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const [note, setNote] = useState<string | null>(null)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 4,
        paddingTop: 6,
        marginLeft: -7,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <GhostButton
          icon={copied ? 'check' : 'copy'}
          active={copied}
          onClick={() => {
            setCopied(true)
            setNote('Copied. Clipboard is a demo in this example.')
          }}
        />
        <GhostButton
          icon="thumbsUp"
          active={feedback === 'up'}
          onClick={() => {
            setFeedback((value) => (value === 'up' ? null : 'up'))
            setNote(null)
          }}
        />
        <GhostButton
          icon="thumbsDown"
          active={feedback === 'down'}
          onClick={() => {
            setFeedback((value) => (value === 'down' ? null : 'down'))
            setNote(null)
          }}
        />
        <GhostButton
          icon="retry"
          testId="retry"
          onClick={() => {
            onRetry?.()
            setNote('Ran the demo reply again.')
          }}
        />
        <GhostButton
          icon="share"
          onClick={() => setNote('Share is a demo. No link left this window.')}
        />
        <GhostButton
          icon="more"
          onClick={() => setNote('More actions are a demo.')}
        />
      </div>
      {note && <text style={{ fontSize: 12, color: C.tertiary, paddingLeft: 9 }}>{note}</text>}
    </div>
  )
}

type MdxChildren = { children?: React.ReactNode }

function flattenMdxTable(children: React.ReactNode): {
  cols: number
  cells: React.ReactElement[]
} {
  const rows: React.ReactElement[][] = []
  React.Children.forEach(children, (section) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(section)) return
    React.Children.forEach(section.props.children, (row) => {
      if (!React.isValidElement<{ children?: React.ReactNode }>(row)) return
      const cells: React.ReactElement[] = []
      React.Children.forEach(row.props.children, (cell) => {
        if (React.isValidElement(cell)) cells.push(cell)
      })
      if (cells.length > 0) rows.push(cells)
    })
  })
  const cols = rows.reduce((max, row) => Math.max(max, row.length), 0)
  const cells: React.ReactElement[] = []
  for (const [rowIndex, row] of rows.entries()) {
    for (let col = 0; col < cols; col++) {
      cells.push(
        col < row.length
          ? React.cloneElement(row[col]!, { key: `${rowIndex}-${col}` })
          : <div key={`pad-${rowIndex}-${col}`} />
      )
    }
  }
  return { cols, cells }
}

function MdxCell({ children, header }: MdxChildren & { header?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'nowrap',
        padding: 8,
        minWidth: 96,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        backgroundColor: C.canvas,
        fontSize: 15,
        lineHeight: 26,
        fontWeight: header ? 700 : 400,
        color: C.text,
      }}
    >
      {children}
    </div>
  )
}

function MdxBlock({ children }: MdxChildren) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', minWidth: 0 }}>
      {children}
    </div>
  )
}

const MD_TEXT = {
  fontSize: 15,
  lineHeight: 26,
  color: C.text,
  maxWidth: '100%',
  minWidth: 0,
} as const

function MdxInline({ children, style }: MdxChildren & { style?: StyleDesc }) {
  return <text style={{ ...MD_TEXT, ...style }}>{children}</text>
}

function mdxStringChild(children: React.ReactNode) {
  const items = React.Children.toArray(children)
  if (items.length === 1 && (typeof items[0] === 'string' || typeof items[0] === 'number')) {
    return items[0]
  }
  return null
}

function MdxParagraph({ children }: MdxChildren) {
  const only = mdxStringChild(children)
  if (only != null) {
    return <text style={{ ...MD_TEXT, width: '100%' }}>{only}</text>
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'start',
        width: '100%',
        minWidth: 0,
        fontSize: 15,
        lineHeight: 26,
        color: C.text,
      }}
    >
      {React.Children.map(children, (child) =>
        typeof child === 'string' || typeof child === 'number' ? (
          <text style={MD_TEXT}>{child}</text>
        ) : (
          child
        ),
      )}
    </div>
  )
}

const SAFE_MDX_COMPONENTS = {
  h1: ({ children }: MdxChildren) => (
    <text style={{ fontSize: 22, lineHeight: 30, fontWeight: 700, color: C.text, maxWidth: '100%', minWidth: 0 }}>
      {children}
    </text>
  ),
  h2: ({ children }: MdxChildren) => (
    <text style={{ fontSize: 18, lineHeight: 26, fontWeight: 700, color: C.text, maxWidth: '100%', minWidth: 0 }}>
      {children}
    </text>
  ),
  h3: ({ children }: MdxChildren) => (
    <text style={{ fontSize: 16, lineHeight: 24, fontWeight: 700, color: C.text, maxWidth: '100%', minWidth: 0 }}>
      {children}
    </text>
  ),
  h4: MdxInline,
  h5: MdxInline,
  h6: MdxInline,
  p: MdxParagraph,
  blockquote: ({ children }: MdxChildren) => (
    <div style={{ display: 'flex', flexDirection: 'row', gap: 12, width: '100%', minWidth: 0 }}>
      <div style={{ width: 3, flexShrink: 0, backgroundColor: C.accent }} />
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0, gap: 6, color: C.secondary }}>
        {children}
      </div>
    </div>
  ),
  hr: () => <div style={{ height: 1, width: '100%', backgroundColor: C.border }} />,
  ul: MdxBlock,
  ol: MdxBlock,
  li: ({
    children,
    'data-checked': checked,
  }: MdxChildren & { 'data-checked'?: boolean }) => {
    const only = mdxStringChild(children)
    return (
      <div style={{ display: 'flex', flexDirection: 'row', gap: 9, width: '100%', minWidth: 0 }}>
        <text style={{ fontSize: 15, lineHeight: 26, color: C.secondary, flexShrink: 0 }}>
          {checked === undefined ? '•' : checked ? '✓' : '○'}
        </text>
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
          {only != null ? <text style={{ ...MD_TEXT, width: '100%' }}>{only}</text> : children}
        </div>
      </div>
    )
  },
  strong: ({ children }: MdxChildren) => <MdxInline style={{ fontWeight: 700 }}>{children}</MdxInline>,
  em: ({ children }: MdxChildren) => <MdxInline style={{ color: C.secondary }}>{children}</MdxInline>,
  del: ({ children }: MdxChildren) => <MdxInline style={{ color: C.ghost }}>{children}</MdxInline>,
  code: ({ children }: MdxChildren) => (
    <MdxInline
      style={{
        fontFamily: FONT_MONO,
        fontSize: 13,
        backgroundColor: C.raised,
        borderRadius: 5,
        paddingLeft: 5,
        paddingRight: 5,
      }}
    >
      {children}
    </MdxInline>
  ),
  a: ({ children }: MdxChildren & { href?: string }) => (
    <MdxInline style={{ color: C.accent }}>{children}</MdxInline>
  ),
  table: ({ children }: MdxChildren) => {
    const { cols, cells } = flattenMdxTable(children)
    if (cols === 0) return null
    return (
      <div style={{ display: 'flex', width: '100%', minWidth: 0, overflowX: 'scroll' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: cols,
            gridColumnMin: 'max-content',
            flexShrink: 0,
            backgroundColor: C.border,
            rowGap: 1,
            columnGap: 1,
          }}
        >
          {cells}
        </div>
      </div>
    )
  },
  thead: MdxBlock,
  tbody: MdxBlock,
  tr: ({ children }: MdxChildren) => <>{children}</>,
  th: ({ children }: MdxChildren) => <MdxCell header>{children}</MdxCell>,
  td: ({ children }: MdxChildren) => <MdxCell>{children}</MdxCell>,
  Callout: ({ children, title }: MdxChildren & { title?: string }) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        width: '100%',
        padding: 12,
        backgroundColor: C.raised,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      <text style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{title}</text>
      {children}
    </div>
  ),
}

const mdxCache = new Map<string, Root>()

function parseMdx(source: string) {
  const cached = mdxCache.get(source)
  if (cached) return cached
  const tree = mdxParse(source)
  mdxCache.set(source, tree)
  return tree
}

export function SafeMdxContent({
  source,
  onLinkClick,
}: {
  source: string
  onLinkClick?: (href: string) => void
}) {
  const mdast = useMemo(() => parseMdx(source), [source])
  const components = useMemo(
    () =>
      onLinkClick
        ? {
            ...SAFE_MDX_COMPONENTS,
            a: ({ children, href }) => (
              <div
                style={{ display: 'flex', flexDirection: 'row', cursor: href ? 'pointer' : undefined }}
                onClick={() => href && onLinkClick(href)}
              >
                <MdxInline style={{ color: C.accent }}>{children}</MdxInline>
              </div>
            ),
          }
        : SAFE_MDX_COMPONENTS,
    [onLinkClick]
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', minWidth: 0 }}>
      <SafeMdxRenderer
        markdown={source}
        mdast={mdast}
        components={components}
        renderNode={(node) => {
          if (node.type !== 'code') return undefined
          return <CodeBlock code={node.value} language={node.lang ?? undefined} showLineNumbers />
        }}
      />
    </div>
  )
}

export function SafeMdxTranscript() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30, width: 748 }}>
      <UserTurn text="Can Markdown be composed as normal React elements instead?" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SafeMdxContent source={SAFE_MDX_STRESS} />
        <ActionBar />
      </div>
    </div>
  )
}

export function ChatApp({
  turnCount = TURNS.length,
  includeSafeMdx = false,
}: {
  turnCount?: number
  includeSafeMdx?: boolean
} = {}) {
  const [conversations, setConversations] = useState(() =>
    CONVERSATIONS.map((conversation) => ({
      ...conversation,
      turns: seedTurnsFor(conversation.id, turnCount),
    })),
  )
  const [activeId, setActiveId] = useState('c1')
  const [nav, setNav] = useState({ stack: ['c1'], index: 0 })
  const [collapsed, setCollapsed] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [currentView, setCurrentView] = useState<'chat' | 'settings'>('chat')
  const [overlay, setOverlay] = useState<'search' | null>(null)
  const searchInputRef = useRef<PublicInstance | null>(null)
  const [query, setQuery] = useState('')
  const [projectOnly, setProjectOnly] = useState(false)
  const [draft, setDraft] = useState('')
  const [model, setModel] = useState('deepseek-v4-flash')
  const [reasoning, setReasoning] = useState('high')
  const [access, setAccess] = useState('full')
  const [mode, setMode] = useState<'build' | 'plan'>('build')
  const [project, setProject] = useState('gpuix')
  const [workspace, setWorkspace] = useState('local')
  const [branch, setBranch] = useState('main')
  const [tailTick, setTailTick] = useState(0)
  const [focusTick, setFocusTick] = useState(0)

  const listRef = useRef<PublicInstance | null>(null)
  const nextTask = useRef(1)
  const { renderer } = useGpuix()
  const { ime } = useWindowInsets()
  const active = conversations.find((conversation) => conversation.id === activeId)
  const turns = active?.turns ?? []
  const showSafeMdx = includeSafeMdx && activeId === 'c1'
  const rowCount = turns.length + (showSafeMdx ? 1 : 0)
  const canGoBack = nav.index > 0
  const canGoForward = nav.index < nav.stack.length - 1
  const projectLabel = PROJECTS.find((item) => item.id === project)?.label ?? project
  const visibleConversations = projectOnly
    ? conversations.filter((conversation) => conversation.project === projectLabel)
    : conversations
  const searchHits = query.trim()
    ? conversations.filter((conversation) =>
        conversation.title.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : conversations

  const goTo = (id: string) => {
    setOverlay(null)
    if (id === activeId) {
      setFocusTick((value) => value + 1)
      return
    }
    setActiveId(id)
    setNav((current) => ({
      stack: current.stack.slice(0, current.index + 1).concat(id),
      index: current.index + 1,
    }))
    setFocusTick((value) => value + 1)
  }

  const goBack = () => {
    if (nav.index === 0) return
    const index = nav.index - 1
    setActiveId(nav.stack[index]!)
    setNav({ ...nav, index })
    setFocusTick((value) => value + 1)
  }

  const goForward = () => {
    if (nav.index >= nav.stack.length - 1) return
    const index = nav.index + 1
    setActiveId(nav.stack[index]!)
    setNav({ ...nav, index })
    setFocusTick((value) => value + 1)
  }

  const retryLastReply = () => {
    let cut = -1
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i]?.kind === 'user') {
        cut = i
        break
      }
    }
    const lastUser = cut >= 0 ? turns[cut] : undefined
    if (!lastUser || lastUser.kind !== 'user') return
    const modelLabel = MODELS.find((item) => item.id === model)?.label ?? model
    const reply = demoReply({ text: lastUser.text, modelLabel, mode })
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeId
          ? { ...conversation, turns: [...conversation.turns.slice(0, cut + 1), ...reply] }
          : conversation,
      ),
    )
    setTailTick((value) => value + 1)
  }
  // `Transcript` is memo: a fresh closure per render would re-render every row
  // on each keystroke in the composer. The ref keeps the callback identity
  // stable while it always runs the latest closure.
  const retryRef = useRef(retryLastReply)
  retryRef.current = retryLastReply
  const onRetry = useCallback(() => retryRef.current(), [])

  useEffect(() => {
    if (tailTick === 0) return
    const id = listRef.current?.id
    if (id == null || !renderer?.scrollToItem) return
    renderer.scrollToItem(id, Math.max(0, rowCount - 1))
  }, [renderer, rowCount, tailTick])

  if (currentView === 'settings') {
    return <SettingsView onBack={() => setCurrentView('chat')} />
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        backgroundColor: C.canvas,
        fontFamily: FONT_SANS,
        color: C.text,
        position: 'relative',
      }}
    >
      <motion.div
        initial={false}
        animate={{ width: collapsed ? 0 : SIDEBAR_WIDTH + 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{
          display: 'flex',
          flexDirection: 'row',
          height: '100%',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <Sidebar
          conversations={visibleConversations}
          activeId={activeId}
          onSelect={goTo}
          onCollapse={() => setCollapsed(true)}
          onNewTask={() => {
            const id = `task-${nextTask.current++}`
            const created: Conversation = {
              id,
              title: 'New task',
              group: 'Today',
              project: projectLabel,
              time: 'now',
              turns: [],
            }
            setConversations((current) => [created, ...current])
            setDraft('')
            goTo(id)
          }}
          onSearch={() => {
            setQuery('')
            setOverlay('search')
          }}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onBack={goBack}
          onForward={goForward}
          onSettings={() => setCurrentView('settings')}
          onFilter={() => setProjectOnly((value) => !value)}
          filterActive={projectOnly}
        />
        <div style={{ width: 1, height: '100%', flexShrink: 0, backgroundColor: C.sidebarBorder }} />
      </motion.div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          minWidth: 0,
          height: '100%',
          paddingBottom: ime.bottom,
          backgroundColor: C.canvas,
        }}
      >
        <Header
          collapsed={collapsed}
          onExpand={() => setCollapsed(false)}
          title={active?.title ?? 'New task'}
          turnCount={turns.length}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onBack={goBack}
          onForward={goForward}
          onToggleInspector={() => setInspectorOpen((value) => !value)}
        />
        <Transcript
          key={activeId}
          turns={turns}
          includeSafeMdx={showSafeMdx}
          listRef={listRef}
          onRetry={onRetry}
        />
        <Composer
          value={draft}
          onChange={setDraft}
          focusTick={focusTick}
          onSend={(text) => {
            const modelLabel = MODELS.find((item) => item.id === model)?.label ?? model
            const reply = demoReply({ text, modelLabel, mode })
            setConversations((current) =>
              current.map((conversation) =>
                conversation.id === activeId
                  ? {
                      ...conversation,
                      title:
                        conversation.turns.length === 0 ? titleFromDraft(text) : conversation.title,
                      turns: [...conversation.turns, { kind: 'user', text }, ...reply],
                    }
                  : conversation,
              ),
            )
            setDraft('')
            setTailTick((value) => value + 1)
          }}
          model={model}
          onModelChange={setModel}
          reasoning={reasoning}
          onReasoningChange={setReasoning}
          access={access}
          onAccessChange={setAccess}
          mode={mode}
          onModeChange={setMode}
        />
        <WorkspaceFooter
          project={project}
          onProjectChange={setProject}
          workspace={workspace}
          onWorkspaceChange={setWorkspace}
          branch={branch}
          onBranchChange={setBranch}
        />
      </div>
      {inspectorOpen && (
        <Inspector
          conversation={active}
          model={model}
          reasoning={reasoning}
          access={access}
          mode={mode}
          project={project}
        />
      )}
      <OverlayCard
        title="Search threads"
        height={420}
        open={overlay === 'search'}
        onClose={() => setOverlay(null)}
        initialFocus={searchInputRef}
      >
        <input
          ref={searchInputRef}
          testId="search-input"
          value={query}
          placeholder="Filter by title"
          theme={CHAT_THEME}
          style={{
            width: '100%',
            height: 32,
            flexShrink: 0,
            fontSize: 13,
            color: C.text,
            backgroundColor: C.composer,
            borderRadius: 8,
            paddingLeft: 10,
            paddingRight: 10,
          }}
          onChange={(event) => setQuery(event.value ?? '')}
        />
        <div style={{ flexGrow: 1, minHeight: 0, overflowY: 'scroll' }}>
          {searchHits.map((conversation) => (
            <Button
              key={conversation.id}
              testId={`search-${conversation.id}`}
              onClick={() => goTo(conversation.id)}
              style={{
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 8,
                paddingRight: 8,
                borderRadius: 8,
                cursor: 'pointer',
                hover: { backgroundColor: C.overlay },
              }}
            >
              <text style={{ fontSize: 13, color: C.text }}>{conversation.title}</text>
            </Button>
          ))}
        </div>
      </OverlayCard>
    </div>
  )
}

export const HiroshiApp = ChatApp
export default HiroshiApp

const isEntryPoint =
  typeof Bun !== 'undefined'
    ? Bun.isStandaloneExecutable || Bun.main === import.meta.path
    : typeof process !== 'undefined' &&
      (process.argv[1]?.endsWith('chat.tsx') || process.argv[1]?.endsWith('app.tsx'))

if (isEntryPoint) {
  applyMacCpuThrottleFromEnv()
  render(<ChatApp turnCount={1_000} includeSafeMdx />, {
    title: 'Hiroshi · Multi-Agent Orchestrator',
    width: 1180,
    height: 820,
    titlebarTransparent: true,
    windowBackground: 'blurred',
    trafficLightX: 16,
    trafficLightY: 17,
    debugFrameOverlay: 'hidden',
    // An agent launching this to check its own work must not take the keyboard
    // away from whoever is typing. Automation needs no focus.
    focus: process.env.GPUIX_BACKGROUND !== '1',
  })
}
