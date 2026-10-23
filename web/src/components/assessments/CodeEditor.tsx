import { editorTheme } from '@/components/ui/codeTheme';
import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { go } from '@codemirror/lang-go';
import { rust } from '@codemirror/lang-rust';
import { sql } from '@codemirror/lang-sql';

function extensionFor(language: string) {
  switch (language) {
    case 'python':
      return python();
    case 'javascript':
      return javascript();
    case 'typescript':
      return javascript({ typescript: true });
    case 'java':
      return java();
    case 'cpp':
    case 'c':
      return cpp();
    case 'go':
      return go();
    case 'rust':
      return rust();
    case 'sql':
      return sql();
    default:
      return [];
  }
}

/** Accessible code editor (CodeMirror 6). Tab inserts indentation; Escape then Tab moves focus out. */
export function CodeEditor({ value, onChange, language, label, minHeight = '220px', readOnly }: { value: string; onChange?: (v: string) => void; language: string; label: string; minHeight?: string; readOnly?: boolean }) {
  const extensions = useMemo(() => [extensionFor(language)].flat(), [language]);
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  return (
    <div className="overflow-hidden rounded-md border border-border text-[13px]">
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={editorTheme(!!dark)}
        minHeight={minHeight}
        readOnly={readOnly}
        aria-label={label}
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: !readOnly }}
      />
      <p className="border-t border-border bg-surface-2 px-2 py-1 text-[11.5px] text-subtle">Press Escape, then Tab, to move focus out of the editor.</p>
    </div>
  );
}
