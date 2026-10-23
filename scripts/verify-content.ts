/**
 * Verifies the built-in learning library:
 *  - unique slugs, valid skill/track/problem references, well-formed quizzes
 *  - every coding problem's reference solutions pass ALL its tests (python3 + node, run locally)
 *  - every SQL problem's schema, seed and solution run on a fresh PGlite database
 * Usage: pnpm tsx scripts/verify-content.ts [--only=slug,slug]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { SKILLS } from '../server/db/seed/content/skills';
import { TRACK_CATEGORIES, type SeedTrack, type SeedProblem, type SeedProjectTemplate } from '../server/db/seed/content/types';
import { pathToFileURL } from 'node:url';

// Discover every content file so authors never need to touch the index files to verify.
async function collect<T>(dir: string, guard: (v: unknown) => boolean): Promise<{ items: T[]; files: Record<string, string[]> }> {
  const items: T[] = [];
  const files: Record<string, string[]> = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts')) {
    const mod = await import(pathToFileURL(path.join(dir, f)).href);
    for (const [name, v] of Object.entries(mod)) {
      const arr = Array.isArray(v) ? v : [v];
      if (arr.length && arr.every(guard)) {
        items.push(...(arr as T[]));
        (files[f] ??= []).push(name);
      }
    }
  }
  return { items, files };
}
const contentDir = path.resolve('server/db/seed/content');
const tracksFound = await collect<SeedTrack>(path.join(contentDir, 'tracks'), (v) => !!v && typeof v === 'object' && 'topics' in (v as object) && 'contentStatus' in (v as object));
const problemsFound = await collect<SeedProblem>(path.join(contentDir, 'problems'), (v) => !!v && typeof v === 'object' && 'hints' in (v as object) && 'type' in (v as object));
const templatesFound = await collect<SeedProjectTemplate>(contentDir, (v) => !!v && typeof v === 'object' && 'milestones' in (v as object) && 'requirements' in (v as object));
const ALL_TRACKS = tracksFound.items;
const ALL_PROBLEMS = problemsFound.items;
const PROJECT_TEMPLATES = templatesFound.items;

// The index files must list everything that exists, or it won't be seeded.
const { ALL_TRACKS: INDEXED_TRACKS } = await import('../server/db/seed/content/tracks');
const { ALL_PROBLEMS: INDEXED_PROBLEMS } = await import('../server/db/seed/content/problems');
const { PROJECT_TEMPLATES: INDEXED_TEMPLATES } = await import('../server/db/seed/content/projects');
const indexWarnings: string[] = [];
if (INDEXED_TRACKS.length !== ALL_TRACKS.length) indexWarnings.push(`tracks/index.ts lists ${INDEXED_TRACKS.length} of ${ALL_TRACKS.length} tracks`);
if (INDEXED_PROBLEMS.length !== ALL_PROBLEMS.length) indexWarnings.push(`problems/index.ts lists ${INDEXED_PROBLEMS.length} of ${ALL_PROBLEMS.length} problems`);
if (INDEXED_TEMPLATES.length !== PROJECT_TEMPLATES.length) indexWarnings.push(`projects.ts lists ${INDEXED_TEMPLATES.length} of ${PROJECT_TEMPLATES.length} templates`);

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const errors: string[] = [];
const err = (m: string) => errors.push(m);
const skillSlugs = new Set(SKILLS.map((s) => s.slug));
const problemSlugs = new Set(ALL_PROBLEMS.map((p) => p.slug));
const trackSlugs = new Set(ALL_TRACKS.map((t) => t.slug));

function dupes(list: string[], what: string) {
  const seen = new Set<string>();
  for (const s of list) {
    if (seen.has(s)) err(`Duplicate ${what} slug: ${s}`);
    seen.add(s);
  }
}

dupes(SKILLS.map((s) => s.slug), 'skill');
for (const s of SKILLS) for (const p of s.prereqs ?? []) if (!skillSlugs.has(p)) err(`Skill ${s.slug}: unknown prereq ${p}`);
dupes(ALL_TRACKS.map((t) => t.slug), 'track');
dupes(ALL_PROBLEMS.map((p) => p.slug), 'problem');
dupes(PROJECT_TEMPLATES.map((p) => p.slug), 'project template');

for (const t of ALL_TRACKS) {
  if (!(TRACK_CATEGORIES as readonly string[]).includes(t.category)) err(`Track ${t.slug}: bad category ${t.category}`);
  for (const p of t.prerequisites ?? []) if (!trackSlugs.has(p)) err(`Track ${t.slug}: unknown prerequisite track ${p}`);
  dupes(t.topics.map((x) => x.slug), `topic in ${t.slug}`);
  if (!t.topics.some((x) => x.milestone)) err(`Track ${t.slug}: needs at least one milestone topic`);
  for (const topic of t.topics) {
    const where = `${t.slug}/${topic.slug}`;
    if (!skillSlugs.has(topic.skill)) err(`${where}: unknown skill ${topic.skill}`);
    if (!topic.objectives.length) err(`${where}: no objectives`);
    if (topic.body.trim().length < (t.contentStatus === 'complete' ? 800 : 250)) err(`${where}: body too short for a ${t.contentStatus} track`);
    if (!topic.resources.length) err(`${where}: no resources`);
    for (const r of topic.resources) if (!/^https:\/\//.test(r.url)) err(`${where}: resource URL must be https: ${r.url}`);
    for (const pr of topic.practice) if ((pr.kind === 'problem' || pr.kind === 'sql') && pr.ref && !problemSlugs.has(pr.ref)) err(`${where}: practice ref ${pr.ref} is not a known problem`);
    if (t.contentStatus === 'complete' && (topic.quiz?.length ?? 0) < 3) err(`${where}: complete tracks need 3+ quiz questions`);
    for (const q of topic.quiz ?? []) {
      const qw = `${where}#${q.key}`;
      if (['single', 'multi', 'true_false'].includes(q.type)) {
        const ids = new Set((q.options ?? []).map((o) => o.id));
        if (!q.correct?.length) err(`${qw}: missing correct`);
        for (const c of q.correct ?? []) if (!ids.has(c)) err(`${qw}: correct id ${c} not in options`);
        if (q.type === 'single' || q.type === 'true_false') if ((q.correct?.length ?? 0) !== 1) err(`${qw}: single-answer needs exactly one correct`);
      }
      if (q.type === 'fill_blank' && !q.accepted?.length) err(`${qw}: fill_blank needs accepted answers`);
      if (q.type === 'matching' && (!q.pairs || !q.matches)) err(`${qw}: matching needs pairs and matches`);
      if (!q.explanation) err(`${qw}: missing explanation`);
    }
  }
}

for (const tpl of PROJECT_TEMPLATES) {
  for (const s of tpl.skillSlugs) if (!skillSlugs.has(s)) err(`Project ${tpl.slug}: unknown skill ${s}`);
  for (const s of tpl.trackSlugs) if (!trackSlugs.has(s)) err(`Project ${tpl.slug}: unknown track ${s}`);
}

const norm = (s: string) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trim();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-verify-'));

function run(lang: 'python' | 'javascript', code: string, input: string) {
  const file = path.join(tmp, lang === 'python' ? 'main.py' : 'main.js');
  fs.writeFileSync(file, code);
  const r = spawnSync(lang === 'python' ? 'python3' : 'node', [file], { input, encoding: 'utf8', timeout: 10000 });
  return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
}

async function verifySql(p: (typeof ALL_PROBLEMS)[number]) {
  const db = new PGlite();
  try {
    await db.exec(p.schemaSql ?? '');
    await db.exec(p.seedSql ?? '');
    const r = await db.query(p.solutionSql ?? '');
    if (!r.rows.length) err(`SQL ${p.slug}: solution returns no rows (make the seed data produce a non-empty result)`);
  } catch (e) {
    err(`SQL ${p.slug}: ${(e as Error).message}`);
  } finally {
    await db.close();
  }
}

for (const p of ALL_PROBLEMS) {
  if (only && !only.includes(p.slug)) continue;
  for (const s of p.skills) if (!skillSlugs.has(s)) err(`Problem ${p.slug}: unknown skill ${s}`);
  if (p.hints.length < 2) err(`Problem ${p.slug}: needs 2+ progressive hints`);
  if (p.type === 'sql') {
    if (!p.schemaSql || !p.seedSql || !p.solutionSql) err(`SQL ${p.slug}: schemaSql, seedSql and solutionSql are required`);
    else await verifySql(p);
    continue;
  }
  const tests = [...(p.visibleTests ?? []), ...(p.hiddenTests ?? [])];
  if ((p.visibleTests?.length ?? 0) < 1 || (p.hiddenTests?.length ?? 0) < 2) err(`Problem ${p.slug}: needs 1+ visible and 2+ hidden tests`);
  if (!p.solutions?.python || !p.solutions?.javascript) err(`Problem ${p.slug}: needs python and javascript reference solutions`);
  for (const lang of ['python', 'javascript'] as const) {
    const code = p.solutions?.[lang];
    if (!code) continue;
    for (const t of tests) {
      const r = run(lang, code, t.input);
      if (r.code !== 0) err(`Problem ${p.slug} [${lang}] test "${t.name}" crashed: ${r.err.trim().split('\n').pop()}`);
      else if (norm(r.out) !== norm(t.expected)) err(`Problem ${p.slug} [${lang}] test "${t.name}": expected ${JSON.stringify(norm(t.expected))}, got ${JSON.stringify(norm(r.out))}`);
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
const topicCount = ALL_TRACKS.reduce((n, t) => n + t.topics.length, 0);
console.log(`Checked ${SKILLS.length} skills, ${ALL_TRACKS.length} tracks (${topicCount} topics), ${ALL_PROBLEMS.length} problems, ${PROJECT_TEMPLATES.length} project templates.`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n- ` + errors.join('\n- '));
  process.exit(1);
}
if (indexWarnings.length) console.warn('Index files out of date (content will not be seeded until listed):\n- ' + indexWarnings.join('\n- '));
console.log('All content checks passed.');
