import { editorTheme } from '@/components/ui/codeTheme';
import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { EditorView, keymap, Prec, type Extension } from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { go } from '@codemirror/lang-go';
import { rust } from '@codemirror/lang-rust';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import type { Language } from './api';

function languageExtension(lang: Language): Extension {
  switch (lang) {
    case 'python':
      return python();
    case 'javascript':
      return javascript();
    case 'typescript':
      return javascript({ typescript: true });
    case 'java':
      return java();
    case 'c':
    case 'cpp':
      return cpp();
    case 'go':
      return go();
    case 'rust':
      return rust();
    case 'sql':
      return sql({ dialect: PostgreSQL });
  }
}

/** Editor chrome drawn from the design tokens so it follows light and dark themes. */
const tokenTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--surface)', color: 'var(--text)', height: '100%', fontSize: '13.5px' },
  '.cm-scroller': { fontFamily: "'Geist Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: '1.55' },
  '.cm-content': { caretColor: 'var(--accent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '.cm-gutters': { backgroundColor: 'var(--surface-2)', color: 'var(--text-subtle)', border: 'none', borderRight: '1px solid var(--border)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--surface-3)', color: 'var(--text)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--surface-2) 70%, transparent)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--accent-soft)' },
});

/** Tracks the app theme (html[data-theme]) so the syntax colours match. */
function useIsDark() {
  const read = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function CodeEditor({
  value,
  onChange,
  language,
  onRun,
  onSubmit,
  readOnly,
  label,
  minHeight,
}: {
  value: string;
  onChange?: (v: string) => void;
  language: Language;
  onRun?: () => void;
  onSubmit?: () => void;
  readOnly?: boolean;
  label: string;
  minHeight?: string;
}) {
  const dark = useIsDark();
  // Keep the latest callbacks without rebuilding the editor extensions on every render.
  const handlers = useRef({ onRun, onSubmit });
  handlers.current = { onRun, onSubmit };
  const extensions = useMemo(
    () => [
      languageExtension(language),
      tokenTheme,
      // An explicit tab stop on the content keeps the scrolling area keyboard reachable,
      // including read-only editors (which are not contenteditable).
      EditorView.contentAttributes.of({ 'aria-label': label, tabindex: '0' }),
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Shift-Enter',
            run: () => {
              handlers.current.onSubmit?.();
              return !!handlers.current.onSubmit;
            },
          },
          {
            key: 'Mod-Enter',
            run: () => {
              handlers.current.onRun?.();
              return !!handlers.current.onRun;
            },
          },
        ]),
      ),
    ],
    [language, label],
  );
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={editorTheme(!!dark)}
      readOnly={readOnly}
      editable={!readOnly}
      height="100%"
      minHeight={minHeight}
      className="h-full"
      basicSetup={{ foldGutter: false, highlightActiveLine: !readOnly, tabSize: language === 'go' ? 8 : 4 }}
    />
  );
}
