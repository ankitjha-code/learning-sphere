// Tables owned by the market feature (job-market insights). Add new tables here (do not edit other schema files).
import { pgTable, text, timestamp, jsonb, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cols } from './core';

const { id, createdAt } = cols;

type Counts = Record<string, number>;

/**
 * Daily aggregates of job postings, one row per (posted day, source).
 * Rows are additive: each snapshot run adds only postings it has not counted before
 * (deduplicated by `postingKeys`, short hashes of the source's own posting id), so
 * history survives after a feed drops old postings. No posting text or links are stored here.
 * source: jobicy | himalayas | remotive | platform | sample
 */
export const marketSnapshots = pgTable(
  'market_snapshots',
  {
    id: id(),
    day: text().notNull(), // YYYY-MM-DD (UTC) of the posting's publish date, or its first fetch when the source gives none
    source: text().notNull(),
    postingCount: integer().notNull().default(0),
    remoteCount: integer().notNull().default(0),
    skillCounts: jsonb().$type<Counts>().notNull().default({}), // skill slug -> postings mentioning it
    roleCounts: jsonb().$type<Counts>().notNull().default({}), // role bucket -> postings
    companyCounts: jsonb().$type<Counts>().notNull().default({}), // company name -> postings
    skillRoles: jsonb().$type<Record<string, Counts>>().notNull().default({}), // skill slug -> role bucket -> postings
    skillPairs: jsonb().$type<Record<string, Counts>>().notNull().default({}), // skill slug -> other skill slug -> postings mentioning both
    postingKeys: text().array().notNull().default(sql`'{}'::text[]`),
    postedFrom: timestamp({ withTimezone: true }),
    postedTo: timestamp({ withTimezone: true }),
    fetchedFrom: timestamp({ withTimezone: true }),
    fetchedTo: timestamp({ withTimezone: true }),
    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('market_snapshots_day_source_uq').on(t.day, t.source), index('market_snapshots_source_idx').on(t.source, t.day)],
);

/** One row per calendar day (UTC) on which the snapshot ran; re-runs on the same day update it (idempotent per day). */
export const marketSnapshotRuns = pgTable(
  'market_snapshot_runs',
  {
    id: id(),
    runDay: text().notNull(), // YYYY-MM-DD (UTC)
    trigger: text().notNull().default('schedule'), // schedule | admin | lazy | seed
    runs: integer().notNull().default(1),
    sources: text().array().notNull().default(sql`'{}'::text[]`),
    postingsScanned: integer().notNull().default(0),
    newPostings: integer().notNull().default(0),
    rowsWritten: integer().notNull().default(0),
    postedFrom: timestamp({ withTimezone: true }),
    postedTo: timestamp({ withTimezone: true }),
    fetchedFrom: timestamp({ withTimezone: true }),
    fetchedTo: timestamp({ withTimezone: true }),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex('market_snapshot_runs_day_uq').on(t.runDay)],
);

/**
 * Clearly labelled sample postings for demos and the walkthrough report. Never real vacancies,
 * never shown on the job board, and every row carries source 'sample'. Insights computed from
 * them are labelled "Sample data" and never mixed with real postings.
 */
export const marketSamplePostings = pgTable(
  'market_sample_postings',
  {
    id: id(),
    source: text().notNull().default('sample'),
    externalId: text().notNull(),
    title: text().notNull(),
    company: text().notNull(),
    location: text(),
    remote: boolean().notNull().default(true),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    description: text(),
    postedAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('market_sample_postings_uq').on(t.externalId)],
);
