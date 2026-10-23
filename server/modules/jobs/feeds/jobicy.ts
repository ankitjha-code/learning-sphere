import { htmlToText, isHttpUrl, str, strArr, toDate, type FeedAdapter, type NormalizedJob } from './types';

/** Jobicy: commercial use and caching allowed; credit Jobicy and link Apply to Jobicy; at most hourly. */
export const jobicy: FeedAdapter = {
  id: 'jobicy',
  label: 'Jobicy',
  homepage: 'https://jobicy.com',
  minIntervalMs: 3600_000,
  maxPerDay: 24,
  terms: 'Synced at most hourly. Credit Jobicy; Apply links go to Jobicy.',
  applyLabel: 'Apply on Jobicy',
  endpoint: () => 'https://jobicy.com/api/jobs?count=50&tag=developer',
  parse(json) {
    const list = (json as { jobs?: unknown[] })?.jobs;
    if (!Array.isArray(list)) throw new Error('Unexpected Jobicy response (no jobs array)');
    const out: NormalizedJob[] = [];
    for (const raw of list) {
      const j = raw as Record<string, unknown>;
      const url = str(j.url, 500);
      const externalId = str(j.id ?? j.jobSlug, 120);
      const title = str(j.jobTitle ?? j.title, 200);
      const company = str(j.companyName ?? j.company, 160);
      if (!externalId || !title || !company || !isHttpUrl(url)) continue;
      out.push({
        externalId,
        title,
        company,
        location: str(j.jobGeo, 160) || null,
        url,
        tags: [...strArr(j.jobIndustry, 4), ...strArr(j.jobType, 3), ...strArr(j.jobLevel, 2)],
        description: htmlToText(str(j.jobDescription, 100_000) || str(j.jobExcerpt, 5000)),
        publishedAt: toDate(j.pubDate),
        expiresAt: null,
      });
    }
    return out;
  },
};
