export const C = {
  canvas: '#121215',
  surface: '#18181C',
  surfaceElevated: '#1F1F24',
  surfaceHighlight: '#26262D',
  sidebar: '#141417',
  header: '#161619',
  composer: '#1B1B20',
  codeBg: '#131317',

  border: '#E6EAF212',
  borderMedium: '#E6EAF222',
  borderStrong: '#E6EAF236',
  sidebarBorder: '#232328',

  overlay: '#E6EAF20D',
  overlayMedium: '#E6EAF214',
  overlayStrong: '#E6EAF220',

  text: '#EDEDF0',
  secondary: '#9E9EA9',
  tertiary: '#6E6E7A',
  ghost: '#4A4A54',

  accent: '#E2795B',
  accentSubtle: '#E2795B20',
  accentHover: '#EA876B',
  onAccent: '#141417',

  // Agent role & status semantics
  supervisor: '#F59E0B',
  supervisorBg: '#F59E0B18',
  architect: '#A78BFA',
  architectBg: '#A78BFA18',
  researcher: '#38BDF8',
  researcherBg: '#38BDF818',
  coder: '#34D399',
  coderBg: '#34D39918',
  verifier: '#F472B6',
  verifierBg: '#F472B618',
  security: '#FB7185',
  securityBg: '#FB718518',

  success: '#34D399',
  successBg: '#34D39915',
  warning: '#FBBF24',
  warningBg: '#FBBF2418',
  error: '#F87171',
  errorBg: '#F8717118',
  info: '#60A5FA',
  infoBg: '#60A5FA18',
} as const

export const FONT = {
  sans: typeof window === 'undefined' ? 'Helvetica' : 'IBM Plex Sans',
  mono: typeof window === 'undefined' ? 'Menlo' : 'Lilex',
}

export const TITLEBAR_CLEARANCE =
  typeof process !== 'undefined' && process.platform === 'darwin' ? 86 : 14

export const SIDEBAR_WIDTH = 250
