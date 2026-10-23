/**
 * SM-2 style spaced repetition adapted for topics.
 * quality: 0..5 derived from a quiz/revision score (score * 5, rounded).
 * Failing (quality < 3) resets the interval and marks the topic `needs_revision`.
 */
export type SrsState = { reviewCount: number; easeFactor: number; intervalDays: number };

export function nextReview(state: SrsState, score: number, now = new Date()) {
  const q = Math.max(0, Math.min(5, Math.round(score * 5)));
  let { reviewCount, easeFactor, intervalDays } = state;
  let failed = false;
  if (q < 3) {
    reviewCount = 0;
    intervalDays = 1;
    failed = true;
  } else {
    reviewCount += 1;
    intervalDays = reviewCount === 1 ? 2 : reviewCount === 2 ? 6 : Math.round(Math.max(intervalDays, 1) * easeFactor);
  }
  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  intervalDays = Math.min(intervalDays, 180);
  const nextReviewAt = new Date(now.getTime() + intervalDays * 86400_000);
  return { reviewCount, easeFactor: Math.round(easeFactor * 100) / 100, intervalDays, nextReviewAt, failed, quality: q };
}
