import type { ITheme } from '@xterm/xterm'
import { colors, syntax } from './tokens'

/** xterm.js palette on the same warm tokens as the editor. */
export const xtermTheme: ITheme = {
  background: colors.panel,
  foreground: colors.body,
  cursor: colors.primary,
  cursorAccent: colors.panel,
  selectionBackground: '#f7f7f426',
  black: colors.canvas,
  brightBlack: colors.muted,
  red: colors.error,
  brightRed: colors.error,
  green: syntax.string,
  brightGreen: syntax.string,
  yellow: syntax.number,
  brightYellow: syntax.function,
  blue: syntax.type,
  brightBlue: syntax.type,
  magenta: '#c0a8dd',
  brightMagenta: '#c0a8dd',
  cyan: '#9fbbe0',
  brightCyan: '#9fbbe0',
  white: colors.body,
  brightWhite: colors.ink,
}
