/**
 * WHERE A RECORD KEEPS ITS KEY NUMBERS, AND THE ROWS OF ONE PROJECT (the KPI plan of 21 October, 2.8): what the block on
 * a project's page and on Today reads before it opens the sheet, offers a number's menu, or lists what was suggested.
 *
 * THE LIST IS FOUND BY ITS SHAPE, NEVER BY ITS ID, as the kernel's page source finds it (`sources/kpis.ts`): the list
 * with a link to the projects and a `measure`, a `figure`, a `today` and a `headline`. The web names no first-party
 * list (`tools/gates/web-lists.mjs`), and a record whose pack called its numbers something else is read the same.
 * Only the lists this tab has not been told about are asked for, once a tab.
 *
 * A NUMBER'S ROW IS READ AS IT IS STORED, its project a row id, so a row is matched to the block's answer by its id and to
 * its project by the project's id. A write names only the fields it changes, so `thing` is never sent back.
 *
 * THE PURE HALF IS TESTED IN `kpi-rows.test.ts`; the reads take the client's two calls, so a test hands its own.
 */

import { REGISTERS } from '../record/held.ts';
import { entryOf, learn, type RecordRow, type SchemaCall } from '../record/remote.ts';
import type { Entry, Fields, RegisterDecl } from '../record/schema.ts';
import { readingListIn } from './stale-fix.ts';

/** The fields only a list of key numbers declares together, beside its link to the projects. */
const SHAPE: readonly string[] = ['measure', 'figure', 'today', 'headline'];

/**
 * The list of key numbers among `registers`: the one with every field of the shape and a link to `projects` (to any list,
 * when no projects list is named). `null` when the record keeps none.
 */
export function kpiListIn(registers: Readonly<Record<string, Pick<RegisterDecl, 'fields'>>>, projects?: string | null): string | null {
  for (const [id, decl] of Object.entries(registers)) {
    const fields = Array.isArray(decl?.fields) ? decl.fields : [];
    const ids = new Set(fields.map((f) => f.id));
    if (!SHAPE.every((k) => ids.has(k))) continue;
    const thing = fields.find((f) => f.id === 'thing') as { type?: string; to?: string } | undefined;
    if (thing?.type !== 'ref') continue;
    if (projects && thing.to !== projects) continue;
    return id;
  }
  return null;
}

/** A row that is still a number of the project: not deleted, not stopped. */
const live = (fields: Fields): boolean => (fields.deleted_at ?? null) === null && fields.state !== 'retired';

/** The project a row is on, as its row holds it. */
const thingOf = (fields: Fields): string | null => (typeof fields.thing === 'string' || typeof fields.thing === 'number' ? String(fields.thing) : null);

/** The numbers kept on one project, by the project's row id: what a number's menu reads the project's other leaders from. */
export const keptOf = (rows: readonly Entry[], project: string): Entry[] => rows.filter((r) => live(r.fields) && r.fields.draft !== true && thingOf(r.fields) === project);

/** What was suggested for one project and not kept yet, oldest first, as the project's page lists them. */
export const draftsOf = (rows: readonly Entry[], project: string): Entry[] =>
  rows.filter((r) => live(r.fields) && r.fields.draft === true && thingOf(r.fields) === project).sort((a, b) => a.seq - b.seq);

/** The row a block's answer names by its id (`kpi`), or `null` when this tab has not read it. */
export const rowOf = (rows: readonly Entry[], id: string | undefined): Entry | null => (id ? (rows.find((r) => r.id === id) ?? null) : null);

/* ── the reads ─────────────────────────────────────────────────────────────────────────────────────────────── */

/** The client's two calls these reads need, as `@braindog/client` answers them. */
export type Reads = {
  schema: SchemaCall;
  list(args: { register: string; limit?: number; cursor?: string | null }): Promise<{ ok: true; value: { rows: unknown[]; cursor: string | null } } | { ok: false }>;
};

/* ONCE A TAB: each list asked about once, and the answer kept. */
const asked = new Map<string, Promise<void>>();

/**
 * The list of key numbers on this record: found among the lists this tab knows, else among `ids` once each has been
 * asked about. `null` when the record keeps none.
 */
export async function findKpiList(reads: Pick<Reads, 'schema'>, ids: readonly string[], projects?: string | null): Promise<string | null> {
  const known = kpiListIn(REGISTERS, projects);
  if (known) return known;
  await Promise.all(ids.filter((id) => !REGISTERS[id]).map((id) => learn(reads.schema, id, asked)));
  return kpiListIn(REGISTERS, projects);
}

/** The projects list the key numbers' `thing` links to, as this tab knows the list, or `null`. */
export const projectsOf = (list: string): string | null => {
  const thing = REGISTERS[list]?.fields.find((f) => f.id === 'thing') as { to?: unknown } | undefined;
  return typeof thing?.to === 'string' ? thing.to : null;
};

/**
 * The readings list (Numbers) a stale number's reading is added to, found by its shape (`stale-fix.ts` `readingListIn`)
 * among the lists this tab knows, else among `ids` once each has been asked about. `null` when the record keeps none.
 */
export async function findReadingList(reads: Pick<Reads, 'schema'>, ids: readonly string[], projects: string | null): Promise<string | null> {
  const known = readingListIn(REGISTERS, projects);
  if (known) return known;
  await Promise.all(ids.filter((id) => !REGISTERS[id]).map((id) => learn(reads.schema, id, asked)));
  return readingListIn(REGISTERS, projects);
}

/** Every row of the list, as stored. `null` when the record would not answer. */
export async function readKpis(reads: Pick<Reads, 'list'>, list: string): Promise<Entry[] | null> {
  const out: Entry[] = [];
  let cursor: string | null = null;
  do {
    const got = await reads.list({ register: list, limit: 500, ...(cursor === null ? {} : { cursor }) });
    if (!got.ok) return null;
    for (const row of got.value.rows as RecordRow[]) out.push(entryOf(list, row, new Map()));
    cursor = got.value.cursor;
  } while (cursor !== null);
  return out;
}
