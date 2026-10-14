/**
 * Outside text, as Settings > Agents says it (ENG-A13, "Untrusted text ... drops the run to Ask" D37.116, "for the
 * rest of it" D37.121): the line under an agent whose run read something from outside the record, and each import with
 * the owner's own answer to whether all of it is his.
 *
 * PURE, SO `node --test` CAN IMPORT IT. `TrustRows.svelte` and `ImportAsk.svelte` only draw what these answer, as
 * `record/trust.ts` is to the ladder's lines.
 *
 * THE RECORD SAYS WHERE A RUN READ FROM IN WORDS ("the inbox", "something another person wrote"), so the marked line is
 * that phrase in a sentence and nothing is looked up here. An import says its lists by the names the record sent.
 *
 * AN IMPORT IS ADOPTED BY HIS PRESS, never by itself: nothing here asks or files. A host built before `imports` reads as
 * `null`, and nothing new is drawn.
 */

export const words = {
  title: 'What you brought in',
  mine: 'It is mine',
  outside: 'Treat it as outside text',
  change: 'Change',
  yours: 'Yours, as you said.',
  treated: 'Treated as outside text: an agent that reads it asks first.',
} as const;

/** One import, as the record answered it: its run, when, each list it wrote into with how many, and his answer. */
export type ImportRow = { run: string; at: string; lists: { list: string; rows: number }[]; rows: number; adopted: boolean | null };

/** What a press came to: done, or the record's sentence for why not. */
export type AdoptOut = { ok: true } | { ok: false; fix: string };

/** The client's `call`, and nothing else of it, so a test hands in one function. */
export type ImportsClient = { call: (name: string, args: Record<string, unknown>) => Promise<unknown> };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `28 Sep`, and `30 Dec 2025` in another year than this one, on the reader's own clock. */
const dayOf = (instant: string, now: number): string => {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return instant;
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? day : `${day} ${d.getFullYear()}`;
};

const count = (n: number, one: string, many: string): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/**
 * The muted line under an agent while a run of its is marked, or `null` when nothing marked it. Read off the agent as
 * the record sent it, so a host a release behind, which sends no `asking`, draws no line.
 */
export function markedLine(agent: unknown): string | null {
  const asking = (agent as { asking?: unknown } | null)?.asking as { from?: unknown } | null | undefined;
  if (typeof asking !== 'object' || asking === null) return null;
  const from = typeof asking.from === 'string' ? asking.from.replace(/\s+/gu, ' ').trim().replace(/[.\s]+$/u, '') : '';
  return from === '' ? null : `Asking about everything in this run, because it read ${from}.`;
}

/** The names of the lists an import wrote into, joined as a person says them: "Ledger, Projects and Notes". */
export function importLists(row: ImportRow): string {
  const names = row.lists.map((l) => l.list);
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The sentence for one import: the question while he has not said, and what he chose once he has. */
export function importLine(row: ImportRow, now: number): string {
  if (row.adopted === true) return words.yours;
  if (row.adopted === false) return words.treated;
  /* "Entries", never "rows": the house's words never say a record's own (DIRECTION's plain-words rule). */
  return `You brought in ${count(row.rows, 'entry', 'entries')} into ${count(row.lists.length, 'list', 'lists')} on ${dayOf(row.at, now)}. Is all of it your own?`;
}

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const said = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** One import as it may be drawn, or `null` for one the host sent malformed. */
const importOf = (v: unknown): ImportRow | null => {
  const r = v as Partial<Record<keyof ImportRow, unknown>> | null;
  if (typeof r !== 'object' || r === null || !said(r.run) || !said(r.at) || !whole(r.rows) || !Array.isArray(r.lists)) return null;
  const lists: ImportRow['lists'] = [];
  for (const l of r.lists as unknown[]) {
    const one = l as { list?: unknown; rows?: unknown } | null;
    if (typeof one !== 'object' || one === null || !said(one.list) || !whole(one.rows)) return null;
    lists.push({ list: one.list.trim(), rows: one.rows });
  }
  /* A host that sends no answer yet has not been told one: that is undecided, not malformed. */
  const adopted = r.adopted === undefined ? null : r.adopted;
  if (adopted !== null && typeof adopted !== 'boolean') return null;
  return { run: r.run, at: r.at, lists, rows: r.rows, adopted };
};

/**
 * Every import the record holds, newest as the record ordered them, or `null` when there is nothing to draw: the host
 * has no such call (`ROUTE_UNKNOWN`, `NOT_IN_THIS_BUILD`), the caller is refused, or it answered something else.
 */
export async function readImports(client: ImportsClient): Promise<ImportRow[] | null> {
  let out: unknown;
  try {
    out = await client.call('imports', {});
  } catch {
    return null;
  }
  const answer = out as { ok?: unknown; value?: { imports?: unknown } } | null;
  if (typeof answer !== 'object' || answer === null || answer.ok !== true) return null;
  const list = answer.value?.imports;
  if (!Array.isArray(list)) return null;
  return list.map(importOf).filter((r): r is ImportRow => r !== null);
}

const NOT_DONE = 'That could not be done just now. Nothing was changed.';

/** His answer to one import: `yes` it is his own, or treat it as outside text. Done, or the record's sentence why not. */
export async function adoptImport(client: ImportsClient, run: string, yes: boolean): Promise<AdoptOut> {
  let out: unknown;
  try {
    out = await client.call('importAdopt', { run, yes });
  } catch {
    return { ok: false, fix: NOT_DONE };
  }
  const answer = out as { ok?: unknown; refusal?: { fix?: unknown } } | null;
  if (typeof answer === 'object' && answer !== null && answer.ok === true) return { ok: true };
  const fix = answer?.refusal?.fix;
  return { ok: false, fix: typeof fix === 'string' && fix.trim() !== '' ? fix : NOT_DONE };
}
