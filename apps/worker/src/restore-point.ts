/**
 * A restore point before a deploy (LCH-C06): every record written in the last seven days takes a copy under one label,
 * through the same `copies.take` a record's own copies go through (`copies.ts`), or, in `check` mode, is opened once and
 * copies nothing.
 *
 * THE OPERATOR'S DOOR AND THE WORKFLOW ARE ITS CALLERS (`/account/ops/restore-point` in `index.ts`, the "Take a restore
 * point" step of `deploy.yml`). Before a deploy whose migrations changed it takes the copies, so a deploy that breaks the
 * stored format has a way back for every record somebody is using; after any deploy `check` opens each of them with the
 * new build, so a build that cannot open a lived-in record turns the run red instead of a person finding out.
 *
 * WRITTEN MEANS WRITTEN BY SOMEBODY. The night's own `export` events are the system's and would make every record look
 * used, so the record's half (`Record$.restorePoint`) counts events by anyone but `system`.
 *
 * COUNTS ONLY, NEVER A NAME. The answer is read in a deploy log, so it says how many records were asked, copied and
 * failed, and no record's id. Each failure is a line in the Worker's own log (`op`), with its id, as the night's are.
 *
 * PAGED, AS THE NIGHT'S WALK IS. A larger fleet runs one request out of time, so the walk stops after `budgetMs` at a
 * page's end and answers `cursor`; the caller asks again with it until there is none.
 *
 * NO RECORD ASKED IS NOT A PASS (audit 45-46, finding 1). A walk that asked nobody opened nothing, and "0 failed" of
 * nobody read as green in the deploy log. The Directory is the walk's only list, so the door cannot tell an empty host
 * from a list that came back empty; the caller can, and says so with `open: true` ("this host holds at least one open
 * record", which the workflow knows from its canary). Then a whole walk that asked nobody is `empty` and one `failed`,
 * and the door's own rule turns that into a 500.
 */

/** How far back a record counts as in use: seven days, the window a `before-deploy` copy is kept for. */
export const RESTORE_POINT_DAYS = 7;

/** How many records are asked at once. A copy is a dump and a put; six at a time keeps one request well inside its limits. */
export const RESTORE_POINT_AT_ONCE = 6;

/** How long one request walks before it answers with a cursor. */
export const RESTORE_POINT_BUDGET_MS = 20_000;

/** A page of record ids and the cursor to the next, absent at the end: the Directory's keyset shape. */
export type RecordPage = { ids: readonly string[]; cursor?: string | undefined };

/** What one record answers: not written in the window, or written, with the copy's name when one was taken. */
export type PointAnswer = { written: false } | { written: true; copied?: string | undefined };

/**
 * What the caller asks for: the commit the copies are labelled with, `check` or not, where a paged walk left off, and
 * `open` when the caller knows the host holds at least one open record.
 */
export type RestorePointAsk = { commit?: string | undefined; check: boolean; cursor?: string | undefined; open?: boolean | undefined };

/** The answer: counts only. `records` is how many were written in the window, which is how many a real run copies. */
export type RestorePointTally = {
  mode: 'check' | 'take';
  label: string;
  asked: number;
  records: number;
  opened: number;
  copied: number;
  failed: number;
  /** A whole walk that asked nobody on a host the caller said holds a record. Counted in `failed` too. */
  empty?: true;
  cursor?: string;
};

export type RestorePointDeps = {
  /** The Directory's open records, a page at a time. */
  records: (cursor?: string) => Promise<RecordPage>;
  /** One record asked: whether it was written since `since`, and in a real run its copy taken under `label`. */
  point: (record: string, ask: { since: string; label: string; check: boolean }) => Promise<PointAnswer>;
  /** A failed record, said in the Worker's log with its id and reason. */
  failed?: ((record: string, why: string) => void) | undefined;
  now: () => number;
  budgetMs?: number | undefined;
};

/** The label a commit's copies are taken under: `before-deploy-` and the commit's first seven characters, or the bare label. */
export function labelOf(commit: string | undefined): string {
  return commit === undefined || commit === '' ? 'before-deploy' : `before-deploy-${commit.slice(0, 7)}`;
}

/** The body a caller sent, read: `{ commit?, check?, cursor?, open? }`, or the sentence that says what is wrong with it. */
export function readAsk(body: unknown): { ok: true; value: RestorePointAsk } | { ok: false; fix: string; at: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return { ok: false, fix: '/account/ops/restore-point takes { commit?, check?, cursor?, open? } as JSON.', at: 'body' };
  const b = body as Record<string, unknown>;
  const commit = b['commit'];
  if (commit !== undefined && (typeof commit !== 'string' || !/^[0-9a-f]{7,40}$/u.test(commit.toLowerCase())))
    return { ok: false, fix: 'The commit is the deploy\'s commit hash: 7 to 40 letters a to f and digits.', at: 'commit' };
  const check = b['check'];
  if (check !== undefined && typeof check !== 'boolean') return { ok: false, fix: 'Check is true or false.', at: 'check' };
  const cursor = b['cursor'];
  if (cursor !== undefined && (typeof cursor !== 'string' || cursor === '' || cursor.length > 128))
    return { ok: false, fix: 'The cursor is the one the last answer gave, as it was given.', at: 'cursor' };
  const open = b['open'];
  if (open !== undefined && typeof open !== 'boolean') return { ok: false, fix: 'Open is true or false.', at: 'open' };
  return {
    ok: true,
    value: {
      check: check === true,
      ...(open === true ? { open: true } : {}),
      ...(typeof commit === 'string' ? { commit: commit.toLowerCase() } : {}),
      ...(typeof cursor === 'string' ? { cursor } : {}),
    },
  };
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The walk: each open record asked, a few at a time, until the Directory has no more or the budget is spent at a page's
 * end. A record that throws is one `failed` and the walk goes on, so one broken record never hides how the rest went.
 */
export async function restorePoint(deps: RestorePointDeps, ask: RestorePointAsk): Promise<RestorePointTally> {
  const began = deps.now();
  const budget = deps.budgetMs ?? RESTORE_POINT_BUDGET_MS;
  const since = new Date(began - RESTORE_POINT_DAYS * 86_400_000).toISOString();
  const label = labelOf(ask.commit);
  const tally: RestorePointTally = { mode: ask.check ? 'check' : 'take', label, asked: 0, records: 0, opened: 0, copied: 0, failed: 0 };
  /* A CURSOR THAT DID NOT MOVE IS THE END, as `nightly.ts`'s `each` reads it, so a Directory that answered the same page
     twice cannot keep one request walking it for ever. */
  const seen = new Set<string>();
  let cursor = ask.cursor;
  for (;;) {
    const page = await deps.records(cursor);
    for (let i = 0; i < page.ids.length; i += RESTORE_POINT_AT_ONCE) {
      const batch = page.ids.slice(i, i + RESTORE_POINT_AT_ONCE);
      const answers = await Promise.allSettled(batch.map((record) => deps.point(record, { since, label, check: ask.check })));
      answers.forEach((answer, n) => {
        tally.asked += 1;
        if (answer.status === 'rejected') {
          tally.failed += 1;
          deps.failed?.(batch[n] ?? '', why(answer.reason));
          return;
        }
        if (!answer.value.written) return;
        tally.records += 1;
        tally.opened += 1;
        if (!ask.check && answer.value.copied !== undefined) tally.copied += 1;
      });
    }
    const next = page.cursor !== undefined && page.cursor !== '' && !seen.has(page.cursor) ? page.cursor : undefined;
    if (next === undefined) return wholeOf(deps, ask, tally);
    seen.add(next);
    cursor = next;
    if (deps.now() - began >= budget) return { ...tally, cursor: next };
  }
}

/** Why a walk that asked nobody is not a pass, as the Worker's log and the deploy log say it. */
export const NOBODY_ASKED = 'No open record was listed, so nothing was opened. This host holds at least one, so the list of records is wrong.';

/**
 * The end of a whole walk: `empty` and one `failed` when it began at the start, asked nobody, and the caller said the
 * host holds a record. A walk picked up from a cursor is one page of a longer one, and its caller adds the pages up.
 */
function wholeOf(deps: RestorePointDeps, ask: RestorePointAsk, tally: RestorePointTally): RestorePointTally {
  if (ask.open !== true || ask.cursor !== undefined || tally.asked > 0) return tally;
  deps.failed?.('', NOBODY_ASKED);
  return { ...tally, failed: tally.failed + 1, empty: true };
}

/** Whether a tally is a pass: nothing failed, and somebody was asked or the walk goes on. The door answers 200 on `failed` alone. */
export const passed = (t: RestorePointTally): boolean => t.failed === 0 && t.empty !== true;

/** One line for the deploy log: the counts, said plainly. */
export function sayTally(t: RestorePointTally): string {
  if (t.empty === true) return NOBODY_ASKED;
  const more = t.cursor === undefined ? '' : ' More to walk.';
  const records = `${String(t.records)} ${t.records === 1 ? 'record' : 'records'} written in the last ${String(RESTORE_POINT_DAYS)} days`;
  if (t.mode === 'check') return `Checked: ${records}, ${String(t.opened)} opened, ${String(t.failed)} failed, nothing copied.${more}`;
  return `Restore point ${t.label}: ${records}, ${String(t.copied)} copied, ${String(t.failed)} failed.${more}`;
}
