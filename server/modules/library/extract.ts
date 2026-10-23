import type { FileKind } from '../files/service';

export const MAX_KNOWLEDGE_CHARS = 200_000;

/**
 * Extracts plain text from an uploaded knowledge document. Text and markdown
 * are read as UTF-8; PDFs go through unpdf (pure JS, pdf.js based). Scanned PDFs
 * have no text layer and return an empty string (OCR is not available).
 */
export async function extractText(kind: FileKind, data: Buffer): Promise<{ text: string; truncated: boolean; pages?: number }> {
  let text = '';
  let pages: number | undefined;
  if (kind === 'txt' || kind === 'md') {
    text = data.toString('utf8');
  } else if (kind === 'pdf') {
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const out = await pdfText(pdf, { mergePages: true });
    pages = out.totalPages;
    text = Array.isArray(out.text) ? out.text.join('\n\n') : out.text;
  } else {
    throw new Error(`Text extraction is not supported for ${kind}`);
  }
  text = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  const truncated = text.length > MAX_KNOWLEDGE_CHARS;
  return { text: truncated ? text.slice(0, MAX_KNOWLEDGE_CHARS) : text, truncated, pages };
}
