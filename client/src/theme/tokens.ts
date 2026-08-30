/**
 * ColCode design tokens — dark derivation of DESIGN.md (Cursor).
 *
 * DESIGN.md documents Cursor's light marketing brand: warm cream canvas (#f7f7f4),
 * warm near-black ink (#26251e), a single scarce accent (Cursor Orange #f54e00),
 * hairline-only depth, 8px/12px radii, JetBrains Mono on every code surface.
 *
 * The product spec calls for a dark editor, so we invert the two poles of that
 * system and keep everything else intact:
 *   - the warm ink becomes the editor floor (and darker/lighter steps stay warm — no blue-grey)
 *   - the cream becomes primary text
 *   - Cursor Orange remains the ONLY action color, used scarcely (caret, active tab, Run)
 *   - depth is still hairlines only — no shadows anywhere
 *   - timeline pastels are reserved for in-product collaborator presence (milestone 3)
 *
 * These are the same values exposed to Tailwind (index.css @theme) and to Monaco (cursorDark.ts).
 */
export const colors = {
  // Surfaces — warm dark steps. Each is the previous mixed slightly toward cream.
  canvas: '#1c1b16',        // app floor: top bar, sidebar, status bar
  editor: '#26251e',        // DESIGN.md ink — the editor surface
  panel: '#211f1a',         // output/terminal panel
  raised: '#2e2d25',        // hover rows, current-line highlight, active tab
  strong: '#3a3830',        // selected rows, badges

  // Hairlines — the only depth mechanism
  hairline: '#33322b',
  hairlineSoft: '#2c2b24',
  hairlineStrong: '#48463d',

  // Text — cream ink inverted; the muted steps are DESIGN.md's own greys
  ink: '#f7f7f4',           // DESIGN.md canvas → primary text
  body: '#c9c7bd',
  muted: '#807d72',         // DESIGN.md muted (works on both poles)
  mutedSoft: '#5a5852',     // DESIGN.md body → disabled/placeholder on dark

  // Brand — used scarcely
  primary: '#f54e00',
  primaryActive: '#d04200',
  onPrimary: '#ffffff',

  // Semantic
  error: '#e0506f',         // DESIGN.md error, lifted for dark contrast
  success: '#3fb08a',       // DESIGN.md success, lifted for dark contrast
  warning: '#e6c07b',

  // Presence (milestone 3) — DESIGN.md timeline pastels, in-product only
  presence: ['#dfa88f', '#9fc9a2', '#9fbbe0', '#c0a8dd', '#c08532'] as const,
} as const

/**
 * Syntax palette. Warm, low-saturation hues chosen to sit next to the presence
 * pastels without clashing, and to keep the cream-on-ink editorial calm.
 */
export const syntax = {
  comment: '#7d7a6f',
  keyword: '#e0b08a',      // warm peach-tan  — control flow, storage
  string: '#a8d4a0',       // soft green
  number: '#e6c07b',       // warm gold
  type: '#8fc1e8',         // soft blue      — classes, types, tags
  function: '#f0dcb4',     // cream-yellow   — call sites, decls
  variable: '#f7f7f4',     // ink
  property: '#d6d3c8',
  operator: '#c9c7bd',
  punctuation: '#a09c92',
  regexp: '#a8d4a0',
  attribute: '#8fc1e8',
  invalid: '#e0506f',
} as const

export const fonts = {
  ui: "'Inter Variable', 'CursorGothic', system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  code: "'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
} as const

export const radius = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, pill: 9999 } as const
