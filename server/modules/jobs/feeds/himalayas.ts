import { htmlToText, isHttpUrl, str, strArr, toDate, type FeedAdapter, type NormalizedJob } from './types';

/** Himalayas: visible link to Himalayas; never alter the apply link; remove expired jobs; backend only. */
export const himalayas: FeedAdapter = {
  id: 'himalayas',
  label: 'Himalayas',
  homepage: 'https://himalayas.app/jobs',
  minIntervalMs: 3600_000,
  maxPerDay: 24,
  terms: 'Fetched by our server only. Apply links are shown unaltered; expired jobs are removed.',
  applyLabel: 'Apply via Himalayas listing',
  endpoint: () => 'https://himalayas.app/jobs/api?limit=20',
  parse(json) {
    const list = (json as { jobs?: unknown[] })?.jobs;
    if (!Array.isArray(list)) throw new Error('Unexpected Himalayas response (no jobs array)');
    const out: NormalizedJob[] = [];
    for (const raw of list) {
      const j = raw as Record<string, unknown>;
      const apply = str(j.applicationLink, 500);
      const guid = str(j.guid, 500);
      const url = isHttpUrl(apply) ? apply : guid;
      const title = str(j.title, 200);
      const company = str(j.companyName, 160);
      const externalId = guid || str(j.id, 120) || apply;
      if (!externalId || !title || !company || !isHttpUrl(url)) continue;
      const locations = strArr(j.locationRestrictions, 6);
      out.push({
        externalId: externalId.slice(0, 300),
        title,
        company,
        location: locations.length ? locations.join(', ') : 'Remote',
        url,
        tags: [...strArr(j.categories, 5), ...strArr(j.seniority, 2), ...strArr(j.employmentType, 1)],
        description: htmlToText(str(j.description, 100_000) || str(j.excerpt, 5000)),
        publishedAt: toDate(j.pubDate),
        expiresAt: toDate(j.expiryDate),
      });
    }
    return out;
  },
};
