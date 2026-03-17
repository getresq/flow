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
    canvasBg: '#020617',
    canvasDot: 'rgba(30, 58, 95, 0.6)',
    edgeDefault: '#1e3a5f',
    edgeDimmed: '#0f2340',
    edgeDashed: '#fbbf24',
    marker: '#2d5986',
    markerDashed: '#4d7fa8',
  },
  light: {
    surfacePrimary: '#f0f7ff',
    surfaceRaised: '#dbeafe',
    surfaceOverlay: '#bfdbfe',
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
    canvasBg: '#f0f7ff',
    canvasDot: '#bbdefb',
    edgeDefault: '#90caf9',
    edgeDimmed: '#bbdefb',
    edgeDashed: '#f57c00',
    marker: '#4d7fa8',
    markerDashed: '#1565c0',
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
