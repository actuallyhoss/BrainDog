/**
 * WHO WORKED ON EACH PROJECT LAST, for its card's one live line (the audit of 22 October, U5, U-A5 and U-B3).
 *
 * Six of eight cards on a record held a name and a lane over 170px of white, while about 900 agent runs on that record
 * named the projects they were in. A run is the newest sign of life a project has, so each card says who worked on it
 * last and when ("Claude worked on it 2 hours ago"), read from the runs themselves: one read of the list whose rows are
 * runs (`seq_prefix`) heard from (`last_seen`), newest first, each project taking its newest run. Found by what the list
 * declares, as the project page finds its runs (`shape-read.ts`), never by a name.
 *
 * A RUN NAMES ITS PROJECT by a ref to the projects list, else by its `project`, which holds the project's spoken id
 * (`things#1`), its row id or its name; all three are read. A read that fails says nothing and the card says what it
 * would have said without it. Pure where it can be (`lastRunsOf`), so `card-life.test.ts` holds the rules.
 */

import { createClient } from '@braindog/client';

import { sinceWords } from 'braindog-render';

import { readBoot, recordNow } from '../record/boot-live.ts';
import { REGISTERS } from '../record/held.ts';
import { actor } from '../record/names.ts';
import { learn } from '../record/remote.ts';
import { cardsHeld } from './today-read.ts';

/** The most runs read at once, newest first: enough that every project worked on in weeks has its newest. */
const RUNS_READ = 200;

/** A project's last run as its card says it: who, the agent kind its face is drawn from, and how long ago in words. */
export type LastRun = { agent: string; name: string; at: string; said: string };

type RunRow = { fields?: Readonly<Record<string, unknown>> | undefined; updated_at?: string | undefined };

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The list whose rows are runs, and the field on it that names a run's project, or `null` where the record keeps none. */
export function runsListFor(projects: string): { list: string; field: string } | null {
  const list = Object.keys(REGISTERS).find((id) => (REGISTERS[id] as { seq_prefix?: unknown }).seq_prefix !== undefined && REGISTERS[id]!.fields.some((x) => x.id === 'last_seen'));
  if (!list) return null;
  const fields = REGISTERS[list]!.fields;
  const field = (fields.find((x) => x.type === 'ref' && (x as { to?: string }).to === projects) ?? fields.find((x) => x.id === 'project'))?.id;
  return field ? { list, field } : null;
}

/**
 * EACH CARD'S NEWEST RUN, by the card's number: the runs come newest first, and a project keeps the first that names it,
 * by its spoken id, its row id or its name. `now` is the record's clock, so a pinned record says its own "ago".
 */
export function lastRunsOf(
  runs: readonly RunRow[],
  field: string,
  projects: string,
  cards: readonly { seq: number; id?: string | null | undefined; name: string }[],
  now: number,
): Map<number, LastRun> {
  const bySeq = new Map(cards.map((c) => [c.seq, c] as const));
  const byId = new Map(cards.flatMap((c) => (c.id ? [[c.id, c.seq] as const] : [])));
  const byName = new Map(cards.map((c) => [c.name.toLowerCase(), c.seq] as const));
  const spoken = new RegExp(`^${projects}#(\\d+)$`, 'u');
  const out = new Map<number, LastRun>();
  for (const r of runs) {
    const named = text(r.fields?.[field]);
    if (named === '') continue;
    const m = spoken.exec(named);
    const seq = m ? Number(m[1]) : (byId.get(named) ?? byName.get(named.toLowerCase()));
    if (seq === undefined || !bySeq.has(seq) || out.has(seq)) continue;
    const at = text(r.fields?.last_seen) || text(r.updated_at);
    if (!Number.isFinite(Date.parse(at))) continue;
    const agent = text(r.fields?.agent) || 'other';
    out.set(seq, { agent, name: actor(agent).name, at, said: sinceWords(at, now) });
  }
  return out;
}

/**
 * THE DAY EACH PROJECT'S ROW LAST CHANGED, by its number, for a card a page draws from its block (whose rows carry no
 * such day): what a card with no other sign of life is quiet since. One read of the projects list.
 */
export async function readMoved(base: string, projects: string): Promise<Map<number, string>> {
  const got = await createClient({ base })
    .list({ register: projects, limit: RUNS_READ })
    .catch(() => null);
  const out = new Map<number, string>();
  if (!got?.ok) return out;
  for (const r of got.value.rows as { seq?: unknown; updated_at?: unknown }[]) {
    const at = text(r.updated_at);
    if (typeof r.seq === 'number' && /^\d{4}-\d{2}-\d{2}/u.test(at)) out.set(r.seq, at.slice(0, 10));
  }
  return out;
}

/** What this tab has asked, so a list's declaration is asked for once. */
const asked = new Map<string, Promise<void>>();

/**
 * The newest run on each card's project, read once for the whole grid; nothing where the record keeps no runs. A screen
 * of cards may not hold the runs list's declaration yet, so the kernel's own lists (`kernel` in `boot`, two of them) are
 * learnt first where they are not held, and no other.
 */
export async function readLastRuns(base: string, projects: string, cards: readonly { seq: number; id?: string | null | undefined; name: string }[]): Promise<Map<number, LastRun>> {
  if (cards.length === 0) return new Map();
  /* READ BY THE RECORD IN TODAY'S ONE READ, where it is held at this version (`today-read.ts`). */
  const held = (await cardsHeld(base, projects).catch(() => null))?.runs;
  if (held) return lastRunsOf(held.rows as RunRow[], held.field, projects, cards, recordNow());
  const client = createClient({ base });
  if (runsListFor(projects) === null) {
    const booted = await readBoot(base).catch(() => null);
    const own = booted?.from === 'live' ? booted.boot.registers.filter((r) => r.kernel === true && REGISTERS[r.id] === undefined) : [];
    await Promise.all(own.map((r) => learn(client.schema, r.id, asked).catch(() => undefined)));
  }
  const runs = runsListFor(projects);
  if (runs === null) return new Map();
  const where = { toJSON: () => `${runs.field} is set` };
  const got = await client.list({ register: runs.list, where: where as never, order: [{ field: 'last_seen', dir: 'desc' }], limit: RUNS_READ }).catch(() => null);
  if (!got?.ok) return new Map();
  return lastRunsOf(got.value.rows as RunRow[], runs.field, projects, cards, recordNow());
}
