import type * as Monaco from 'monaco-editor'
import { colors, syntax } from './tokens'

export const CURSOR_DARK = 'cursor-dark'

/**
 * Monaco theme "cursor-dark" — see tokens.ts for the derivation from DESIGN.md.
 * Rules are keyed by Monarch token scopes; the `colors` map keys are Monaco's
 * workbench color ids (same ids VS Code uses).
 */
export const cursorDarkTheme: Monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: false,
  rules: [
    { token: '', foreground: strip(colors.body), background: strip(colors.editor) },

    { token: 'comment', foreground: strip(syntax.comment), fontStyle: 'italic' },
    { token: 'comment.doc', foreground: strip(syntax.comment), fontStyle: 'italic' },

    { token: 'keyword', foreground: strip(syntax.keyword) },
    { token: 'keyword.operator', foreground: strip(syntax.operator) },
    { token: 'storage', foreground: strip(syntax.keyword) },
    { token: 'constant', foreground: strip(syntax.number) },
    { token: 'constant.language', foreground: strip(syntax.keyword) },

    { token: 'string', foreground: strip(syntax.string) },
    { token: 'string.escape', foreground: strip(syntax.number) },
    { token: 'regexp', foreground: strip(syntax.regexp) },

    { token: 'number', foreground: strip(syntax.number) },
    { token: 'number.hex', foreground: strip(syntax.number) },
    { token: 'number.float', foreground: strip(syntax.number) },

    { token: 'type', foreground: strip(syntax.type) },
    { token: 'type.identifier', foreground: strip(syntax.type) },
    { token: 'entity.name.type', foreground: strip(syntax.type) },
    { token: 'entity.name.class', foreground: strip(syntax.type) },
    { token: 'support.type', foreground: strip(syntax.type) },
    { token: 'support.class', foreground: strip(syntax.type) },

    { token: 'entity.name.function', foreground: strip(syntax.function) },
    { token: 'support.function', foreground: strip(syntax.function) },
    { token: 'identifier', foreground: strip(syntax.variable) },
    { token: 'variable', foreground: strip(syntax.variable) },
    { token: 'variable.predefined', foreground: strip(syntax.keyword) },
    { token: 'variable.parameter', foreground: strip(syntax.property) },

    { token: 'delimiter', foreground: strip(syntax.punctuation) },
    { token: 'delimiter.bracket', foreground: strip(syntax.punctuation) },
    { token: 'delimiter.parenthesis', foreground: strip(syntax.punctuation) },
    { token: 'delimiter.square', foreground: strip(syntax.punctuation) },
    { token: 'operator', foreground: strip(syntax.operator) },

    // HTML / JSX / XML
    { token: 'tag', foreground: strip(syntax.type) },
    { token: 'metatag', foreground: strip(syntax.keyword) },
    { token: 'attribute.name', foreground: strip(syntax.attribute) },
    { token: 'attribute.value', foreground: strip(syntax.string) },

    // CSS
    { token: 'attribute.name.css', foreground: strip(syntax.property) },
    { token: 'attribute.value.css', foreground: strip(syntax.string) },
    { token: 'attribute.value.number.css', foreground: strip(syntax.number) },
    { token: 'attribute.value.unit.css', foreground: strip(syntax.number) },
    { token: 'attribute.value.hex.css', foreground: strip(syntax.number) },

    // JSON / YAML keys
    { token: 'string.key.json', foreground: strip(syntax.property) },
    { token: 'string.value.json', foreground: strip(syntax.string) },
    { token: 'type.yaml', foreground: strip(syntax.property) },

    // Python decorators / annotations
    { token: 'tag.python', foreground: strip(syntax.function) },
    { token: 'annotation', foreground: strip(syntax.function) },

    { token: 'invalid', foreground: strip(syntax.invalid) },
  ],
  colors: {
    // Editor surface
    'editor.background': colors.editor,
    'editor.foreground': colors.body,
    'editorLineNumber.foreground': colors.mutedSoft,
    'editorLineNumber.activeForeground': colors.muted,
    'editorCursor.foreground': colors.primary,            // the one place orange lives in the editor
    'editor.lineHighlightBackground': colors.raised,
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#f7f7f426',            // cream at 15%
    'editor.inactiveSelectionBackground': '#f7f7f412',
    'editor.selectionHighlightBackground': '#f7f7f41a',
    'editor.wordHighlightBackground': '#f7f7f414',
    'editor.wordHighlightStrongBackground': '#f7f7f41f',
    'editor.findMatchBackground': '#e6c07b55',
    'editor.findMatchHighlightBackground': '#e6c07b2a',
    'editorIndentGuide.background1': colors.hairlineSoft,
    'editorIndentGuide.activeBackground1': colors.hairlineStrong,
    'editorWhitespace.foreground': colors.hairline,
    'editorRuler.foreground': colors.hairlineSoft,
    'editorBracketMatch.background': '#f7f7f41a',
    'editorBracketMatch.border': colors.hairlineStrong,
    'editorBracketHighlight.foreground1': syntax.punctuation,
    'editorBracketHighlight.foreground2': syntax.operator,
    'editorBracketHighlight.foreground3': colors.muted,
    'editorGutter.background': colors.editor,
    'editorStickyScroll.background': colors.editor,
    'editorStickyScrollHover.background': colors.raised,
    'editorStickyScroll.border': colors.hairlineSoft,
    'editorStickyScroll.shadow': '#00000000',
    'editorGutter.modifiedBackground': colors.warning,
    'editorGutter.addedBackground': colors.success,
    'editorGutter.deletedBackground': colors.error,
    'editorError.foreground': colors.error,
    'editorWarning.foreground': colors.warning,
    'editorInfo.foreground': syntax.type,
    'editorLink.activeForeground': syntax.type,
    'editorOverviewRuler.border': '#00000000',
    'editorOverviewRuler.background': colors.editor,

    // Widgets — suggest, hover, find. Hairline-only depth.
    'editorWidget.background': colors.canvas,
    'editorWidget.border': colors.hairlineStrong,
    'editorWidget.foreground': colors.body,
    'editorSuggestWidget.background': colors.canvas,
    'editorSuggestWidget.border': colors.hairlineStrong,
    'editorSuggestWidget.foreground': colors.body,
    'editorSuggestWidget.selectedBackground': colors.raised,
    'editorSuggestWidget.selectedForeground': colors.ink,
    'editorSuggestWidget.highlightForeground': colors.primary,
    'editorSuggestWidget.focusHighlightForeground': colors.primary,
    'editorHoverWidget.background': colors.canvas,
    'editorHoverWidget.border': colors.hairlineStrong,
    'editorHoverWidget.foreground': colors.body,
    'quickInput.background': colors.canvas,
    'quickInput.foreground': colors.body,
    'quickInputList.focusBackground': colors.raised,
    'input.background': colors.editor,
    'input.border': colors.hairlineStrong,
    'input.foreground': colors.ink,
    'input.placeholderForeground': colors.mutedSoft,
    'focusBorder': colors.hairlineStrong,
    'widget.shadow': '#00000000',                          // DESIGN.md: no drop shadows

    // Scrollbars & minimap
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#f7f7f414',
    'scrollbarSlider.hoverBackground': '#f7f7f424',
    'scrollbarSlider.activeBackground': '#f7f7f430',
    'minimap.background': colors.editor,
    'minimap.selectionHighlight': '#f7f7f426',
    'minimapSlider.background': '#f7f7f410',

    // Menus, lists, misc
    'menu.background': colors.canvas,
    'menu.foreground': colors.body,
    'menu.selectionBackground': colors.raised,
    'menu.selectionForeground': colors.ink,
    'menu.border': colors.hairlineStrong,
    'list.hoverBackground': colors.raised,
    'list.activeSelectionBackground': colors.raised,
    'list.activeSelectionForeground': colors.ink,
    'list.highlightForeground': colors.primary,
    'textLink.foreground': syntax.type,
    'diffEditor.insertedTextBackground': '#3fb08a22',
    'diffEditor.removedTextBackground': '#e0506f22',
  },
}

/** Monaco token rules want hex without the leading '#'. */
function strip(hex: string): string {
  return hex.replace(/^#/, '')
}
