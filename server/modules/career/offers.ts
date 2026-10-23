/**
 * Opportunity comparison with transparent weighted scoring.
 * Each criterion scores 0..1 from offer details (salary, remote) or the user's own 1-5 rating.
 * Unrated criteria are excluded from both numerator and denominator and listed as "not rated".
 */
export const PRIORITY_KEYS = ['salary', 'growth', 'location', 'remote', 'learning', 'stability', 'team'] as const;
export type PriorityKey = (typeof PRIORITY_KEYS)[number];

export const PRIORITY_LABEL: Record<PriorityKey, string> = {
  salary: 'Salary',
  growth: 'Career growth',
  location: 'Location',
  remote: 'Remote flexibility',
  learning: 'Learning opportunity',
  stability: 'Stability',
  team: 'Team and manager',
};

export const DEFAULT_WEIGHTS: Record<PriorityKey, number> = { salary: 3, growth: 3, location: 2, remote: 2, learning: 3, stability: 2, team: 2 };

type Offer = { baseSalary?: number; currency?: string; remote?: string; location?: string } | null | undefined;

export type CompareInput = { id: string; company: string; role: string; status: string; offer: Offer; salaryText: string | null; location: string | null; ratings: Record<string, number> };

function remoteScore(v?: string | null): number | null {
  if (!v) return null;
  const t = v.toLowerCase();
  if (/fully remote|^remote|remote-first|remote$/.test(t)) return 1;
  if (/hybrid/.test(t)) return 0.6;
  if (/on-?site|office/.test(t)) return 0.2;
  return null;
}

export function compareOpportunities(items: CompareInput[], weights: Record<string, number>) {
  // Salary is only comparable within one currency; the highest base salary scores 1.
  const currencies = new Set(items.map((i) => i.offer?.currency?.toUpperCase()).filter(Boolean));
  const salaries = items.map((i) => i.offer?.baseSalary).filter((n): n is number => typeof n === 'number' && n > 0);
  const maxSalary = salaries.length ? Math.max(...salaries) : 0;
  const salaryComparable = currencies.size <= 1;
  return items.map((it) => {
    const breakdown = PRIORITY_KEYS.map((k) => {
      const weight = Math.max(0, Math.min(5, weights[k] ?? DEFAULT_WEIGHTS[k]));
      let value: number | null = null;
      let basis = '';
      const rating = it.ratings[k];
      if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
        value = (rating - 1) / 4;
        basis = `Your rating ${rating}/5`;
      } else if (k === 'salary' && it.offer?.baseSalary && maxSalary && salaryComparable) {
        value = it.offer.baseSalary / maxSalary;
        basis = `Base salary relative to the highest compared (${it.offer.baseSalary.toLocaleString('en')} ${it.offer.currency ?? ''})`.trim();
      } else if (k === 'salary' && it.offer?.baseSalary && !salaryComparable) {
        basis = 'Different currencies: rate salary yourself to compare';
      } else if (k === 'remote') {
        const r = remoteScore(it.offer?.remote);
        if (r !== null) {
          value = r;
          basis = `Offer says "${it.offer!.remote}"`;
        }
      }
      return { key: k, label: PRIORITY_LABEL[k], weight, value, basis: basis || 'Not rated', contribution: value === null ? null : Math.round(weight * value * 100) / 100 };
    });
    const rated = breakdown.filter((b) => b.value !== null && b.weight > 0);
    const den = rated.reduce((a, b) => a + b.weight, 0);
    const num = rated.reduce((a, b) => a + b.weight * (b.value as number), 0);
    return {
      id: it.id,
      company: it.company,
      role: it.role,
      status: it.status,
      salaryText: it.salaryText,
      location: it.location,
      offer: it.offer ?? null,
      score: den ? Math.round((num / den) * 100) : null,
      coverage: `${rated.length} of ${breakdown.filter((b) => b.weight > 0).length} weighted criteria rated`,
      breakdown,
    };
  });
}

export const COMPARE_FORMULA =
  'Score = sum(weight x value) / sum(weight) x 100 over the criteria that have a value. Value: your 1-5 rating mapped to 0..1, or salary relative to the highest compared offer (same currency), or remote policy (remote 1.0, hybrid 0.6, onsite 0.2). Unrated criteria are left out, not guessed.';

const JD_SIGNALS: Record<PriorityKey, { positive: RegExp[]; concern: RegExp[] }> = {
  salary: { positive: [/(salary|compensation|pay|ctc|lpa|\$|€|£|₹)\s*[:\-]?\s*[\d₹$€£]/i, /salary range/i], concern: [/unpaid/i, /commission only/i] },
  growth: { positive: [/career (growth|path|progression)/i, /promotion/i, /grow (into|with)/i, /mentorship/i], concern: [/no growth/i] },
  location: { positive: [/relocation (support|assistance)/i], concern: [/must relocate/i, /relocation required/i] },
  remote: { positive: [/\bremote\b/i, /work from (home|anywhere)/i, /distributed team/i, /flexible (hours|working)/i], concern: [/on-?site only/i, /in-?office (five|5) days/i, /no remote/i] },
  learning: { positive: [/learning (budget|stipend)/i, /training/i, /conference/i, /mentor/i, /pair programming/i, /learn(ing)? new/i], concern: [] },
  stability: { positive: [/established/i, /profitable/i, /long-term/i, /permanent/i], concern: [/contract(-| )to(-| )hire/i, /temporary/i, /\bseed\b/i] },
  team: { positive: [/collaborative/i, /supportive/i, /team of/i, /code review/i, /inclusive/i], concern: [/fast-paced/i, /wear many hats/i, /work under pressure/i] },
};

/** Looks for explicit statements in a JD that relate to each priority. Only quotes the JD; never infers facts. */
export function evaluateJdAgainstPriorities(description: string, weights: Record<string, number>) {
  const lines = description.split(/\n|(?<=\.)\s+/).map((l) => l.trim()).filter(Boolean);
  const findLine = (re: RegExp) => lines.find((l) => re.test(l));
  const rows = PRIORITY_KEYS.map((k) => {
    const sig = JD_SIGNALS[k];
    const pos = sig.positive.map(findLine).find(Boolean);
    const con = sig.concern.map(findLine).find(Boolean);
    const signal: 'positive' | 'concern' | 'mixed' | 'not_mentioned' = pos && con ? 'mixed' : pos ? 'positive' : con ? 'concern' : 'not_mentioned';
    return { key: k, label: PRIORITY_LABEL[k], weight: weights[k] ?? DEFAULT_WEIGHTS[k], signal, quotes: [pos, con].filter((x): x is string => !!x).map((q) => q.slice(0, 220)) };
  });
  const top = [...rows].sort((a, b) => b.weight - a.weight).slice(0, 3);
  return {
    rows,
    topPriorities: top.map((t) => t.key),
    addressed: top.filter((t) => t.signal === 'positive' || t.signal === 'mixed').length,
    note: 'Signals are phrases found in the job description. "Not mentioned" means the JD is silent, so ask about it in the interview.',
  };
}
