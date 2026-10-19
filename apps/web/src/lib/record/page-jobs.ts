/**
 * A page composed on the owner's own machine: the kinds of job that take one page, the line Slash draws while one runs,
 * and the press that starts one.
 *
 * ANY ADD-ON THAT SHIPS SUCH A KIND IS OFFERED THE SAME WAY. A kind is offered here when its one argument has the id
 * `page`, and by nothing else: no add-on and no kind is named in this file, so a second add-on with a kind of the same
 * shape is drawn beside the first with no change here.
 *
 * THE KINDS ARE THE APPROVED ONES, READ TWO WAYS. A kind accepted as a change in Decide is what `kindsIn` reads from the
 * decided proposals. A kind an add-on carries is approved by the install that took it (`installPack` checks the plan's
 * hash, which is the owner's press), and no proposal is filed for it, so it is read from the add-on's own document in
 * the catalogue, for the version this record holds, and handed to `kindsIn` as the change its install approved. The
 * document is read only to offer the press: what a run does is the body the record installed, and `createJob` refuses a
 * kind it does not hold in its own sentence, which is the sentence the press says.
 *
 * NOTHING STARTS BY ITSELF. `startPageJob` is called from a button and from nowhere else; the job waits for a machine the
 * owner enrolled, and that machine asks him once at its terminal before it runs a kind the first time.
 *
 * PURE, apart from the two reads and the one call at the foot, so `node --test` reads it whole.
 */

import { createClient } from '@braindog/client';

import { KENNEL_AT } from '../market/counts.ts';
import { isLive, kindsIn, readKinds, retiredIn, type Answer, type Fetch, type JobKind, type JobRow } from './jobs.ts';

/** The one argument a kind takes for it to compose a page: the page's address on this record. */
export const PAGE_ARG = 'page';

export const pageWords = {
  /** The press, for one page by its title. */
  press: (page: string): string => `Compose ${page} on my machine`,
  /** While a machine runs it: the machine as its runner named it, and the page by its title. */
  working: (machine: string, page: string): string => `Working on ${machine}: composing ${page}`,
  /** While it waits for a machine to take it. */
  waiting: (page: string): string => `Waiting for your machine: composing ${page}`,
  pick: 'Page',
  started: 'Started. It waits for your machine, and what it would change comes to Needs you.',
  unreached: 'The record could not be reached. Try again in a moment.',
  conflict: 'The record changed while this was asked. Try again.',
} as const;

const isRow = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every kind that takes one page and nothing else, in the order it was handed. */
export function pageKinds(kinds: readonly JobKind[]): JobKind[] {
  return kinds.filter((k) => k.args.length === 1 && k.args[0]?.id === PAGE_ARG);
}

/**
 * The `job` declarations an add-on's document carries, as the accepted change `kindsIn` reads.
 *
 * A PACK FILE WRITES A DECLARATION KIND-FIRST (`{ job: 'name', ... }`), and a change carries it as `{ id, kind, body }`,
 * which is what the record installs it as: `job.<name>`, its body the whole object.
 */
export function installedRows(docs: readonly unknown[]): Record<string, unknown>[] {
  const declarations = docs.flatMap((doc) =>
    isRow(doc) && Array.isArray(doc.declarations)
      ? doc.declarations.filter(isRow).flatMap((d) => (typeof d.job === 'string' && d.job !== '' ? [{ id: `job.${d.job}`, kind: 'job', body: d }] : []))
      : [],
  );
  return declarations.length === 0 ? [] : [{ body_kind: 'change', resolved_as: 'addressed', body: { to: { declarations } } }];
}

/**
 * The line Slash draws for one kind: its newest run still live, and where it stands, or `null` with none.
 *
 * NEWEST FIRST IS THE RECORD'S ORDER (`listJobs`), so the first live run of the kind is the newest. A run claimed by a
 * machine that stopped answering (`lost`) is waiting again, and is said as waiting. `names` maps a page's address to its
 * title; a page the map does not hold is said as it was typed.
 */
export function pageJobLine(jobs: readonly JobRow[], kindId: string, names: ReadonlyMap<string, string>): { id: string; text: string } | null {
  const run = jobs.find((j) => j.kind === kindId && isLive(j.status));
  if (!run) return null;
  const typed = run.args[PAGE_ARG] ?? '';
  const title = names.get(typed) ?? typed;
  const machine = run.status === 'claimed' && !run.lost && run.runner ? run.runner : null;
  return { id: run.id, text: machine === null ? pageWords.waiting(title) : pageWords.working(machine, title) };
}

/* ── the two reads and the one call ─────────────────────────────────────── */

/** The client methods the reads and the press call, apart from the client so a test hands in its own. */
export type PageJobsClient = {
  createJob(args: { kind: string; args?: Record<string, unknown> }): Promise<Answer<{ id: string }>>;
};

/**
 * Start one run of a kind for one page: its id, or the record's own sentence when it refuses.
 *
 * THE OWNER'S PRESS, AND ONLY THAT. The record refuses every caller but an owner in a browser (`createJob` is admin), so a
 * press by anybody else is answered in the record's sentence too.
 */
export async function startPageJob(client: PageJobsClient, kindId: string, page: string): Promise<{ ok: true; id: string } | { ok: false; fix: string }> {
  try {
    const got = await client.createJob({ kind: kindId, args: { [PAGE_ARG]: page } });
    if (got.ok) return { ok: true, id: got.value.id };
    return { ok: false, fix: 'refusal' in got ? got.refusal.fix : pageWords.conflict };
  } catch {
    return { ok: false, fix: pageWords.unreached };
  }
}

type PackState = { id: string; version: string | null; disabled_at: string | null };

/** One add-on's document, for the version this record holds, from the catalogue; `null` when the catalogue has none. */
async function documentOf(io: Fetch, id: string, version: string): Promise<unknown> {
  try {
    const res = await io(`${KENNEL_AT}packs/${encodeURIComponent(id)}/${encodeURIComponent(version)}.pack.json`, { credentials: 'same-origin' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Every approved kind that takes one page (`readHeldKinds` below, cut to the ones that take a page). */
export async function readPageKinds(base: string, runs: readonly JobRow[], io: Fetch = fetch): Promise<Answer<JobKind[]>> {
  const all = await readHeldKinds(base, runs, io);
  return all.ok ? { ok: true, value: pageKinds(all.value) } : all;
}

/**
 * Every approved kind: those accepted in Decide, and those an add-on this record holds on carries. The jobs screen's
 * Run a job sheet offers these, so a kind an add-on installed is offered there too.
 *
 * ONLY THE ADD-ONS THE CATALOGUE LISTS ARE FETCHED, from one read of its index: a module the seed ships is in none, and a
 * record with ten of them asks for ten files that are not there otherwise. An add-on turned off offers nothing.
 */
export async function readHeldKinds(base: string, runs: readonly JobRow[], io: Fetch = fetch): Promise<Answer<JobKind[]>> {
  const client = createClient({ base, fetch: io });
  const [decided, packs] = await Promise.all([readKinds(base, runs, io), client.packs()]);
  if (!decided.ok) return decided;
  const on = packs.ok ? (packs.value as PackState[]).filter((p) => p.disabled_at === null && p.version !== null) : [];
  let listed = new Set<string>();
  if (on.length > 0)
    try {
      const res = await io(`${KENNEL_AT}index.json`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
      const index: unknown = res.ok ? await res.json() : null;
      const entries = isRow(index) && Array.isArray(index.entries) ? index.entries.filter(isRow) : [];
      listed = new Set(entries.flatMap((e) => (e.kind === 'pack' && typeof e.id === 'string' ? [e.id] : [])));
    } catch {
      /* NO CATALOGUE, NO ADD-ON KINDS: the kinds accepted in Decide are still offered. */
    }
  const docs = await Promise.all(on.filter((p) => listed.has(p.id)).map((p) => documentOf(io, p.id, p.version ?? '')));
  const carried = kindsIn(installedRows(docs), retiredIn(runs));
  const seen = new Set(decided.value.map((k) => k.id));
  return { ok: true, value: [...decided.value, ...carried.filter((k) => !seen.has(k.id))] };
}
