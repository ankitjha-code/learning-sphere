import { EditorView } from '@uiw/react-codemirror';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * Editor theme built on the app's tokens. Every syntax colour meets WCAG AA (4.5:1)
 * against the editor background in its theme (checked against surface and surface-2).
 */
const light = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword], color: '#7c3aed' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#147a3a' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#a14a07' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#64676f', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#1d4ed8' },
  { tag: [t.typeName, t.className, t.namespace], color: '#8a5a00' },
  { tag: [t.operator, t.punctuation, t.bracket], color: '#3f434b' },
  { tag: [t.variableName, t.propertyName, t.name], color: '#16181d' },
]);

const dark = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword], color: '#d6a8ff' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#a6e3a1' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#ffc28a' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#9aa1ad', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#8cc8ff' },
  { tag: [t.typeName, t.className, t.namespace], color: '#f2d48a' },
  { tag: [t.operator, t.punctuation, t.bracket], color: '#c8ccd4' },
  { tag: [t.variableName, t.propertyName, t.name], color: '#e9ebee' },
]);

function base(isDark: boolean) {
  return EditorView.theme(
    {
      '&': { backgroundColor: 'var(--surface)', color: 'var(--text)' },
      '.cm-content': { caretColor: 'var(--accent)' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
      '.cm-gutters': { backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)', borderRight: '1px solid var(--border)' },
      '.cm-activeLine': { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,118,110,0.05)' },
      '.cm-activeLineGutter': { backgroundColor: 'var(--surface-3)', color: 'var(--text)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: isDark ? '#264b5a' : '#cdeee9' },
      '.cm-matchingBracket': { backgroundColor: isDark ? '#2f4a3f' : '#d7f0e3', outline: '1px solid var(--accent)' },
    },
    { dark: isDark },
  );
}

export function editorTheme(isDark: boolean) {
  return [base(isDark), syntaxHighlighting(isDark ? dark : light)];
}
