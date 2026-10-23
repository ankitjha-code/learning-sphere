import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import clsx from 'clsx';

marked.setOptions({ gfm: true, breaks: false });

// Open external links safely.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')?.match(/^https?:/)) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Renders untrusted markdown safely (sanitized; no scripts, no inline handlers). */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(source ?? '', { async: false }) as string).replace(/<(\/?)h1(\b[^>]*)>/g, '<$1h2$2>'),
    [source],
  );
  return <div className={clsx('prose-ls', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
