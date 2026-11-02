/**
 * Every row of a list, walked once for the tab and kept while nothing it holds can have moved.
 *
 * A REF ARRIVES AS THE TARGET ROW'S ULID, so a screen that draws one walks the whole target list to name it. Each reader
 * kept its own walk, and the readers are made per screen: Today, a project page and a list each walked Projects again,
 * and on his record that is 497 KB, fetched 14 times over nine screens. Here one walk serves
 * every reader in the tab, and a walk out is shared by whoever asks while it is out.
 *
 * KEPT BY WHAT THE LOG SAYS OF THE LIST (`keptToken`): where the local copy has caught up with the record, the walk
 * stays true until a catch-up touches that list or drops everything; where it cannot vouch, until the record's version
 * moves, as before. A write this tab sends that may change a row (`wrote`) asks again, so a rename is named at once,
 * and `forgetRows` drops every walk on a record switch and a sign-out. Never kept: a refusal, a walk older than
 * `ROWS_KEPT_MS`.
 *
 * ONLY FOR THE BROWSER'S OWN FETCH. A reader handed a fetch of its own (a test, a tile that aborts on leave) walks for
 * itself, so a stub never answers another's question.
 */

import { wrote, type Client } from '@braindog/client';

import type { RecordRow } from '../record/remote.ts';
import { keptToken, versionKept } from './local-tab.ts';
import { heldNow, listsSettled, readsList } from '../record/lists-held.ts';
import { forgetRowsWith } from './rows-forget.ts';

/** How long a walk is drawn from without asking again, whatever the log says. */
export const ROWS_KEPT_MS = 300_000;

/** A walk's answer: every row, or the refusal of the page the record would not answer. */
export type Walked = { ok: true; rows: RecordRow[] } | { ok: false; refusal: { code: string; fix: string } };

type Kept = { token: string; at: number; walked: Promise<Walked> };
/* BY THE FETCH THE CLIENT SENDS THROUGH, as the client keeps its schemas, so a fetch swapped out (a test's) shares nothing. */
let byFetch = new WeakMap<object, Map<string, Kept>>();
const walksNow = (): Map<string, Kept> => {
  const f = globalThis.fetch as object;
  let m = byFetch.get(f);
  if (m === undefined) byFetch.set(f, (m = new Map()));
  return m;
};

/**
 * Every row of `register`, a page of 500 at a time to the end of its cursor, or the refusal of one.
 *
 * EACH LONG TEXT CUT TO ITS FIRST LINE (`short`): a walk names rows, adds up their money and marks the finished ones, and
 * never draws a note, and on his record the projects' notes were 457 KB of a 466 KB walk. A row's own screen reads it whole.
 */
export async function walkSaid(client: Pick<Client, 'list'>, register: string, base?: string): Promise<Walked> {
  /* A LIST THE READER'S `boot` LEFT OUT IS NOT ASKED (`lists-held.ts`): the record would refuse it, and the ref it names
     is drawn unnamed either way. */
  if (!listsSettled()) await heldNow(base);
  if (!readsList(register, base)) return { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This list is not shared with you.' } };
  const rows: RecordRow[] = [];
  let cursor: string | null = null;
  do {
    const out = await client.list({ register, limit: 500, short: true, ...(cursor === null ? {} : { cursor }) });
    if (!out.ok)
      return { ok: false, refusal: 'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: 'The row changed while it was being read.' } };
    rows.push(...(out.value.rows as RecordRow[]));
    cursor = out.value.cursor;
  } while (cursor !== null);
  return { ok: true, rows };
}

/** `walkSaid`, as rows or `null`. */
export async function walkRows(client: Pick<Client, 'list'>, register: string): Promise<RecordRow[] | null> {
  const out = await walkSaid(client, register);
  return out.ok ? out.rows : null;
}

/**
 * The rows of `register` on the record at `base`, from the tab's walk where it is still true, else walked now.
 * The rows are shared between readers: read them, never change them.
 */
export async function rowsSaid(client: Pick<Client, 'list'>, base: string, register: string): Promise<Walked> {
  const at = `${base} ${register}`;
  const walks = walksNow();
  const kept = walks.get(at);
  const young = kept !== undefined && Date.now() >= kept.at && Date.now() - kept.at < ROWS_KEPT_MS;
  /* A WALK KEPT BY THE VERSION is still true while the poll hears that version, and waits for nothing to say so. */
  const byVersion = `${versionKept()} w${wrote()}`;
  /* AND A WALK SENT BEFORE ANY VERSION WAS HEARD stands at the first one heard, as the client's schemas do: a cold open
     walked a list, heard the version and walked it again (the perf gate's twice-asked, scope 2026-10-24 A11). */
  if (young && kept.token === `v null w${wrote()}`) kept.token = byVersion;
  if (young && kept.token === byVersion) return kept.walked;
  /* A WALK THE COPY VOUCHED FOR IS ASKED OF IT AGAIN once its catch-up has landed, as before. WITH NONE TO VOUCH FOR, the
     walk goes now and is kept by the version (`keptToken`'s own fallback): Today's first open waited for the copy's
     first catch-up before it walked the lists its page names, a round trip in front of the page. */
  const vouched = young && kept.token.startsWith('log ');
  const said = vouched ? await keptToken([register]) : await Promise.race([keptToken([register]), new Promise<null>((done) => setTimeout(() => done(null), 0))]);
  const token = `${said ?? versionKept()} w${wrote()}`;
  const now = Date.now();
  const was = walks.get(at);
  if (was !== undefined && was.token === token && now >= was.at && now - was.at < ROWS_KEPT_MS) return was.walked;
  const walked = walkSaid(client, register, base);
  const entry: Kept = { token, at: now, walked };
  walks.set(at, entry);
  const drop = () => {
    if (walks.get(at) === entry) walks.delete(at);
  };
  void walked.then((got) => {
    if (!got.ok) drop();
  }, drop);
  return walked;
}

/** `rowsSaid`, as rows or `null`. */
export async function rowsOf(client: Pick<Client, 'list'>, base: string, register: string): Promise<RecordRow[] | null> {
  const out = await rowsSaid(client, base, register);
  return out.ok ? out.rows : null;
}

/** Drop every walk: a record switch, a sign-out, a forget. */
export function forgetRows(): void {
  byFetch = new WeakMap();
}
/* A FORGET FROM `boot-live.ts` REACHES THIS THROUGH `rows-forget.ts`, which never loads this file. */
forgetRowsWith(forgetRows);
