/**
 * ResQ-Flow Design Tokens — Slate Refined · Ocean Blue
 *
 * Hue 210° accent: unambiguously blue, no violet.
 * Dark mode: deep navy surfaces, ocean blue glow.
 * Light mode: blue-tinted white, deep ocean accent.
 *
 * These values must stay in sync with the CSS variables in index.css.
 * When changing a color, update BOTH this file AND index.css.
 */

export const themeTokens = {
  dark: {
    surfacePrimary: '#020617',
    surfaceRaised: '#06101f',
    surfaceOverlay: '#0a1e38',
    surfaceInset: '#000d1a',
    accentPrimary: '#42a5f5',
    accentPrimaryHover: '#64b5f6',
    accentPrimaryMuted: 'rgba(66, 165, 245, 0.15)',
    borderDefault: 'rgba(30, 58, 95, 0.7)',
    borderSubtle: 'rgba(30, 58, 95, 0.4)',
    borderAccent: 'rgba(66, 165, 245, 0.4)',
    textPrimary: '#f1f5f9',
    textSecondary: '#4d7fa8',
    textMuted: '#2d5986',
    statusSuccess: '#34d399',
    statusWarning: '#fbbf24',
    statusError: '#f87171',
    statusActive: '#42a5f5',
    statusIdle: '#4d7fa8',
    glowActive: 'oklch(67% 0.18 210)',
    glowSuccess: 'oklch(72% 0.19 160)',
    glowError: 'oklch(65% 0.22 25)',
    glowWarning: 'oklch(75% 0.18 70)',
    glowIdle: 'oklch(22% 0.05 210 / 0.5)',
    canvasBg: '#141414',
    canvasDot: 'rgba(30, 58, 95, 0.6)',
    edgeDefault: '#3f3f46',
    edgeDimmed: '#27272a',
    marker: '#3f3f46',
    nodeQueue:    { border: 'rgba(255,168,0,0.40)',    bg: '#150c00',  text: '#fde68a', accent: '#FFA800' },
    nodeWorker:   { border: 'rgba(56,182,255,0.40)',   bg: '#000d18',  text: '#bfdbfe', accent: '#38B6FF' },
    nodeCron:     { border: 'rgba(148,163,184,0.35)',  bg: '#0b1320',  text: '#cbd5e1', accent: '#94A3B8' },
    nodeProcess:  { border: 'rgba(96,165,250,0.28)',   bg: '#011120',  text: '#bfdbfe', accent: '#60A5FA' },
    nodeDecision: { border: 'rgba(160,100,255,0.40)',  bg: '#0d0018',  text: '#d8b4fe', accent: '#A064FF' },
    nodeResource: { border: 'rgba(0,180,180,0.35)',    bg: '#001414',  text: '#67e8f9', accent: '#00B4B4' },
    nodeTrigger:  { border: 'rgba(34,197,94,0.40)',    bg: '#04150b',  text: '#bbf7d0', accent: '#22C55E' },
    nodeDetail:   { border: 'rgba(148,163,184,0.14)',  bg: '#070d16',  text: '#64748b', accent: '#475569' },
    nodeGroup:    { border: 'rgba(255,255,255,0.12)',  bg: 'transparent', text: '#64748b', accent: '#64748b' },
  },
  light: {
    surfacePrimary: '#f8fafc',
    surfaceRaised: '#ffffff',
    surfaceOverlay: '#f8fafc',
    surfaceInset: '#e3f2fd',
    accentPrimary: '#1565c0',
    accentPrimaryHover: '#1976d2',
    accentPrimaryMuted: 'rgba(21, 101, 192, 0.08)',
    borderDefault: '#90caf9',
    borderSubtle: '#bbdefb',
    borderAccent: 'rgba(21, 101, 192, 0.28)',
    textPrimary: '#0a1929',
    textSecondary: '#1e3a5f',
    textMuted: '#4d7fa8',
    statusSuccess: '#2e7d32',
    statusWarning: '#f57c00',
    statusError: '#c62828',
    statusActive: '#1565c0',
    statusIdle: '#90caf9',
    glowActive: 'oklch(42% 0.18 210)',
    glowSuccess: 'oklch(38% 0.2 160)',
    glowError: 'oklch(40% 0.24 18)',
    glowWarning: 'oklch(55% 0.18 70)',
    glowIdle: 'oklch(75% 0.04 210 / 0.4)',
    canvasBg: '#ffffff',
    canvasDot: 'rgba(21, 101, 192, 0.07)',
    edgeDefault: '#D1D5DB',
    edgeDimmed: '#E5E7EB',
    marker: '#D1D5DB',
    nodeQueue:    { border: 'rgba(220,130,0,0.45)',   bg: '#ffffff', text: '#92400e', accent: '#DC8200' },
    nodeWorker:   { border: 'rgba(0,140,240,0.45)',   bg: '#ffffff', text: '#1e3a5f', accent: '#008CF0' },
    nodeCron:     { border: 'rgba(100,116,139,0.35)', bg: '#ffffff', text: '#475569', accent: '#64748B' },
    nodeProcess:  { border: 'rgba(59,130,246,0.24)',  bg: '#ffffff', text: '#1e3a8a', accent: '#60A5FA' },
    nodeDecision: { border: 'rgba(130,70,220,0.45)',  bg: '#ffffff', text: '#4c1d95', accent: '#8246DC' },
    nodeResource: { border: 'rgba(0,150,150,0.40)',   bg: '#ffffff', text: '#155e75', accent: '#009696' },
    nodeTrigger:  { border: 'rgba(22,163,74,0.35)',   bg: '#ffffff', text: '#166534', accent: '#16A34A' },
    nodeDetail:   { border: 'rgba(148,163,184,0.22)', bg: '#ffffff', text: '#64748b', accent: '#94A3B8' },
    nodeGroup:    { border: 'rgba(0,0,0,0.12)',        bg: 'transparent', text: '#64748b', accent: '#94a3b8' },
  },
  typography: {
    fontSans: "'Inter', 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
    fontMono: "'IBM Plex Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace",
  },
  spacing: {
    panelPadding: 16,
    panelGap: 12,
    cardPadding: 12,
  },
} as const

export type ThemeMode = keyof Pick<typeof themeTokens, 'dark' | 'light'>
export type ThemeTokenScale = keyof typeof themeTokens
