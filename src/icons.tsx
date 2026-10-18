import React from 'react'

import iconArrowLeft from '../assets/icons/arrow-left.svg' with { type: 'text' }
import iconArrowRight from '../assets/icons/arrow-right.svg' with { type: 'text' }
import iconArrowUp from '../assets/icons/arrow-up.svg' with { type: 'text' }
import iconCheck from '../assets/icons/check.svg' with { type: 'text' }
import iconChevronDown from '../assets/icons/chevron-down.svg' with { type: 'text' }
import iconChevronRight from '../assets/icons/chevron-right.svg' with { type: 'text' }
import iconCircleCheck from '../assets/icons/circle-check.svg' with { type: 'text' }
import iconCompose from '../assets/icons/compose.svg' with { type: 'text' }
import iconCopy from '../assets/icons/copy.svg' with { type: 'text' }
import iconEllipsis from '../assets/icons/ellipsis.svg' with { type: 'text' }
import iconFolder from '../assets/icons/folder.svg' with { type: 'text' }
import iconGitBranch from '../assets/icons/git-branch.svg' with { type: 'text' }
import iconInbox from '../assets/icons/inbox.svg' with { type: 'text' }
import iconLaptop from '../assets/icons/laptop.svg' with { type: 'text' }
import iconLibrary from '../assets/icons/library.svg' with { type: 'text' }
import iconListFilter from '../assets/icons/list-filter.svg' with { type: 'text' }
import iconList from '../assets/icons/list.svg' with { type: 'text' }
import iconLockOpen from '../assets/icons/lock-open.svg' with { type: 'text' }
import iconLock from '../assets/icons/lock.svg' with { type: 'text' }
import iconOpenaiMark from '../assets/icons/openai-mark.svg' with { type: 'text' }
import iconPanelLeft from '../assets/icons/panel-left.svg' with { type: 'text' }
import iconPanelRight from '../assets/icons/panel-right.svg' with { type: 'text' }
import iconPencil from '../assets/icons/pencil.svg' with { type: 'text' }
import iconPlus from '../assets/icons/plus.svg' with { type: 'text' }
import iconRotateCcw from '../assets/icons/rotate-ccw.svg' with { type: 'text' }
import iconSearch from '../assets/icons/search.svg' with { type: 'text' }
import iconSettings from '../assets/icons/settings.svg' with { type: 'text' }
import iconShare from '../assets/icons/share.svg' with { type: 'text' }
import iconSlidersHorizontal from '../assets/icons/sliders-horizontal.svg' with { type: 'text' }
import iconSparkle from '../assets/icons/sparkle.svg' with { type: 'text' }
import iconSquarePen from '../assets/icons/square-pen.svg' with { type: 'text' }
import iconStar from '../assets/icons/star.svg' with { type: 'text' }
import iconSun from '../assets/icons/sun.svg' with { type: 'text' }
import iconTrash from '../assets/icons/trash.svg' with { type: 'text' }
import iconWrench from '../assets/icons/wrench.svg' with { type: 'text' }
import iconZap from '../assets/icons/zap.svg' with { type: 'text' }

const CUSTOM_SVGS = {
  bot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`,
  play: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  pause: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
  terminal: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>`,
  shield: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
  cpu: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>`,
  network: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="6" height="6" x="16" y="16" rx="1"/><rect width="6" height="6" x="2" y="16" rx="1"/><rect width="6" height="6" x="9" y="2" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>`,
  code: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  diff: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  alertCircle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  layers: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
}

export const ICONS = {
  arrowLeft: iconArrowLeft,
  arrowRight: iconArrowRight,
  arrowUp: iconArrowUp,
  check: iconCheck,
  chevronDown: iconChevronDown,
  chevronRight: iconChevronRight,
  circleCheck: iconCircleCheck,
  compose: iconCompose,
  copy: iconCopy,
  ellipsis: iconEllipsis,
  folder: iconFolder,
  gitBranch: iconGitBranch,
  inbox: iconInbox,
  laptop: iconLaptop,
  library: iconLibrary,
  listFilter: iconListFilter,
  list: iconList,
  lockOpen: iconLockOpen,
  lock: iconLock,
  openaiMark: iconOpenaiMark,
  panelLeft: iconPanelLeft,
  panelRight: iconPanelRight,
  pencil: iconPencil,
  plus: iconPlus,
  rotateCcw: iconRotateCcw,
  search: iconSearch,
  settings: iconSettings,
  share: iconShare,
  slidersHorizontal: iconSlidersHorizontal,
  sparkle: iconSparkle,
  squarePen: iconSquarePen,
  star: iconStar,
  sun: iconSun,
  trash: iconTrash,
  wrench: iconWrench,
  zap: iconZap,
  ...CUSTOM_SVGS,
} as const

export type IconName = keyof typeof ICONS

export function Icon({
  name,
  size = 14,
  color = 'currentColor',
}: {
  name: IconName
  size?: number
  color?: string
}) {
  const source = ICONS[name]
  return (
    <svg
      source={source}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        color,
        pointerEvents: 'none',
      }}
    />
  )
}
