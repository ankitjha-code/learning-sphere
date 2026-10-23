import { htmlToText, isHttpUrl, str, strArr, toDate, type FeedAdapter, type NormalizedJob } from './types';

/** Remotive: at most 4 fetches per day; credit and link Remotive; listings must not be behind signup. */
export const remotive: FeedAdapter = {
  id: 'remotive',
  label: 'Remotive',
  homepage: 'https://remotive.com',
  minIntervalMs: 6 * 3600_000,
  maxPerDay: 4,
  terms: 'At most 4 fetches per day. Listings are public on /jobs/feed (no signup), credited and linked to Remotive.',
  applyLabel: 'Apply on Remotive',
  endpoint: () => 'https://remotive.com/api/remote-jobs?category=software-dev&limit=50',
  parse(json) {
    const list = (json as { jobs?: unknown[] })?.jobs;
    if (!Array.isArray(list)) throw new Error('Unexpected Remotive response (no jobs array)');
    const out: NormalizedJob[] = [];
    for (const raw of list) {
      const j = raw as Record<string, unknown>;
      const url = str(j.url, 500);
      const externalId = str(j.id, 120);
      const title = str(j.title, 200);
      const company = str(j.company_name, 160);
      if (!externalId || !title || !company || !isHttpUrl(url)) continue;
      out.push({
        externalId,
        title,
        company,
        location: str(j.candidate_required_location, 160) || 'Remote',
        url,
        tags: [...strArr(j.tags, 6), ...strArr(j.category, 1), ...strArr(j.job_type, 1)],
        description: htmlToText(str(j.description, 100_000)),
        publishedAt: toDate(j.publication_date),
        expiresAt: null,
      });
    }
    return out;
  },
};
