import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

const FONT_STACK =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, ' +
  '"Cascadia Code", "Roboto Mono", "Courier New", monospace';

const lightPalette = {
  background: '#ffffff',
  foreground: '#1f1f23',
  muted: '#71717a',
  gutterBg: 'transparent',
  gutterFg: '#a1a1aa',
  // Active line number — brand-tinted so the eye snaps to the
  // current line at a glance.
  gutterActiveFg: '#7c3aed',
  gutterActiveBg: 'rgba(124, 58, 237, 0.06)',
  activeLine: 'rgba(15, 15, 17, 0.05)',
  selection: 'rgba(96, 165, 250, 0.20)',
  selectionMatch: 'rgba(96, 165, 250, 0.14)',
  cursor: '#7c3aed',
  brand: '#7c3aed',
  keyword: '#7c3aed',
  type: '#0e7490',
  string: '#15803d',
  number: '#a16207',
  comment: '#737373',
  variable: '#1f1f23',
  property: '#1d4ed8',
  invalid: '#dc2626',
};

const darkPalette = {
  background: '#0c0c0d',
  foreground: '#e4e4e7',
  muted: '#a1a1aa',
  gutterBg: 'transparent',
  gutterFg: '#52525b',
  gutterActiveFg: '#a78bfa',
  gutterActiveBg: 'rgba(167, 139, 250, 0.08)',
  activeLine: 'rgba(244, 244, 245, 0.06)',
  selection: 'rgba(96, 165, 250, 0.22)',
  selectionMatch: 'rgba(96, 165, 250, 0.16)',
  cursor: '#a78bfa',
  brand: '#a78bfa',
  keyword: '#c4b5fd',
  type: '#67e8f9',
  string: '#86efac',
  number: '#fcd34d',
  comment: '#71717a',
  variable: '#e4e4e7',
  property: '#93c5fd',
  invalid: '#fca5a5',
};

type Palette = typeof lightPalette;

function buildEditorTheme(p: Palette, dark: boolean) {
  return EditorView.theme(
    {
      '&': {
        color: p.foreground,
        backgroundColor: p.background,
        fontFamily: FONT_STACK,
        fontSize: '13px',
        height: '100%',
      },
      '.cm-scroller': {
        fontFamily: FONT_STACK,
        lineHeight: '1.55',
      },
      '.cm-content': {
        caretColor: p.cursor,
        padding: '8px 0',
      },
      // Brand-tinted beam cursor — slightly wider than the CodeMirror
      // default (1px) so it reads against syntax-highlighted text
      // without looking obtrusive. !important wins against
      // EditorView.theme's default cursor specificity.
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: p.cursor,
        borderLeftWidth: '1.5px',
      },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ::selection':
        {
          backgroundColor: p.selection,
        },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: p.selection,
      },
      '.cm-selectionMatch': {
        backgroundColor: p.selectionMatch,
      },
      '.cm-activeLine': {
        backgroundColor: p.activeLine,
      },
      '.cm-activeLineGutter': {
        backgroundColor: p.gutterActiveBg,
        color: p.gutterActiveFg,
        fontWeight: '500',
      },
      '.cm-gutters': {
        backgroundColor: p.gutterBg,
        color: p.gutterFg,
        border: 'none',
        paddingRight: '6px',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        color: 'inherit',
        padding: '0 6px 0 8px',
        fontVariantNumeric: 'tabular-nums',
      },
      '.cm-foldGutter .cm-gutterElement': {
        color: p.muted,
      },
      '.cm-tooltip': {
        backgroundColor: p.background,
        color: p.foreground,
        border: `1px solid ${p.muted}33`,
        borderRadius: '6px',
      },
      '.cm-panels': {
        backgroundColor: p.background,
        color: p.foreground,
      },
      '.cm-searchMatch': {
        backgroundColor: 'rgba(250, 204, 21, 0.35)',
      },
    },
    { dark },
  );
}

function buildHighlightStyle(p: Palette) {
  return HighlightStyle.define([
    { tag: t.keyword, color: p.keyword, fontWeight: '500' },
    {
      tag: [t.controlKeyword, t.moduleKeyword, t.operatorKeyword],
      color: p.keyword,
      fontWeight: '500',
    },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: p.variable },
    { tag: [t.propertyName], color: p.property },
    {
      tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)],
      color: p.string,
    },
    {
      tag: [t.function(t.variableName), t.labelName],
      color: p.property,
    },
    {
      tag: [t.color, t.constant(t.name), t.standard(t.name)],
      color: p.number,
    },
    { tag: [t.definition(t.name), t.separator], color: p.variable },
    {
      tag: [
        t.typeName,
        t.className,
        t.number,
        t.changed,
        t.annotation,
        t.modifier,
        t.self,
        t.namespace,
      ],
      color: p.type,
    },
    { tag: [t.number], color: p.number },
    {
      tag: [
        t.operator,
        t.special(t.variableName),
        t.escape,
        t.regexp,
        t.link,
      ],
      color: p.keyword,
    },
    {
      tag: [t.meta, t.comment, t.lineComment, t.blockComment],
      color: p.comment,
      fontStyle: 'italic',
    },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    {
      tag: t.link,
      color: p.brand,
      textDecoration: 'underline',
    },
    { tag: t.heading, color: p.brand, fontWeight: 'bold' },
    {
      tag: [t.atom, t.bool, t.special(t.variableName)],
      color: p.number,
    },
    { tag: t.invalid, color: p.invalid },
  ]);
}

export const mozartLightTheme = [
  buildEditorTheme(lightPalette, false),
  syntaxHighlighting(buildHighlightStyle(lightPalette)),
];

export const mozartDarkTheme = [
  buildEditorTheme(darkPalette, true),
  syntaxHighlighting(buildHighlightStyle(darkPalette)),
];

export function mozartThemeFor(mode: 'light' | 'dark') {
  return mode === 'dark' ? mozartDarkTheme : mozartLightTheme;
}
