import type { DemoContext } from './context';

/**
 * AI demo data: intentionally none.
 * The product must never show fabricated AI output, so no sample conversations or
 * answers are seeded. Providers come from environment variables (GEMINI_API_KEY,
 * GROQ_API_KEY, ...) or Admin → AI providers; without one, AI panels explain that
 * AI is not configured and everything else keeps working.
 */
export async function seed(_ctx: DemoContext) {}
