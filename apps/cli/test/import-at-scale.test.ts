/**
 * The import's two claims about re-running, measured at the size his record actually reaches.
 *
 * WHY THIS FILE IS NOT IN `import.test.ts`. Those 499 lines drive `memoryRecord`, whose `list`
 * ignores `limit` and `cursor` and answers every row in one page, and whose `governance` ignores
 * `limit` and answers every suggestion ever opened. Both of the failures below are failures of
 * PAGING, so the fake cannot hold either of them: it is green against an importer that reads one
 * page and calls it the whole list. The door here is the kernel this product ships, opened over an
 * in-memory SQLite, so the page sizes, the cursors and the two hundred row governance ceiling are
 * the record's own numbers and not this file's.
 *
 * AND IT IS NOT IN `tools/gates/import.mjs` EITHER, which rehearses the whole switch against a real
 * self-host over HTTP and re-runs it. That gate is the right place for the end to end claim and it
 * runs at the fixture's size: five suggestions on Decide and forty-two rows. Neither failure below
 * appears under a hundred of anything. Writing seven hundred rows and two hundred and fifty
 * questions into the gate would put about a second on every full run to measure something that
 * needs no HTTP hop to be true.
 *
 * `openRecord` AND NOT `createRecordApi`, because `apps/cli` declares `@braindog/kernel` and not
 * `@braindog/record`. The ceiling filter the record wraps this read in only ever REMOVES rows from
 * a page, so a caller that must see every row is held to the same paging either way.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '@braindog/kernel';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { applyPlan, type Door } from '../src/import.ts';
import type { Plan, PlannedAsk, PlannedRow } from '../src/legacy.ts';

const NOW = Date.UTC(2026, 8, 17, 9);

/** Whoever the import writes as. One person, because none of this is about the ladder. */
const ACTOR = 'p_1';

/** Projects, with the `tags` field every key the import files a row under lives in. */
const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'tags', type: 'list', of: 'text' },
    ],
  } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${String(x.refusal?.code)}: ${String(x.refusal?.fix)}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const kernel = await openRecord(sql, clock);
  assert.ok((await kernel.install([THINGS])).ok, 'the Projects list would not install');
  return { sql, clock, kernel };
}

/**
 * The importer's door, onto the kernel, with one fault it can be asked to inject.
 *
 * `refuseListAfter` IS WHAT A SELF-HOST REALLY ANSWERS when the bearer stops being known part way
 * through a run: `apps/selfhost/src/server.ts` `UNKNOWN`, verbatim. An import is hundreds of
 * requests and the command's own advice for a run that stopped part way is to run it again, so a
 * credential that is rotated, revoked or restarted underneath one is the ordinary case, not an
 * exotic one. Everything else on this door is the record answering for itself.
 */
function doorOf(kernel: Kernel, o: { refuseListAfter?: number } = {}): { door: Door; lists: () => number } {
  let lists = 0;
  const door: Door = {
    schema: async (register) =>
      kernel.registers().has(register)
        ? { ok: true, value: { register } }
        : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.` } },
    list: async ({ register, limit, cursor }) => {
      lists++;
      if (o.refuseListAfter !== undefined && lists > o.refuseListAfter)
        return { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'This record does not know that credential.', at: 'authorization' } };
      return kernel.list({ register, ...(limit === undefined ? {} : { limit }), ...(cursor === undefined || cursor === null ? {} : { cursor }) });
    },
    create: async ({ register, fields, note }) => kernel.create(register, fields, { actor: ACTOR, ...(note === undefined ? {} : { note }) }),
    update: async ({ register, seq, patch, version, note }) =>
      kernel.update(register, `${register}#${String(seq)}`, patch, {
        actor: ACTOR,
        ...(version === undefined ? {} : { version }),
        ...(note === undefined ? {} : { note }),
      }),
    governance: async ({ register, status, limit, cursor }) =>
      kernel.governance((register ?? 'suggestion') as never, {
        ...(status === undefined ? {} : { status }),
        ...(limit === undefined ? {} : { limit }),
        ...(cursor === undefined ? {} : { cursor }),
      }),
    propose: async (p) => kernel.propose(p as never, ACTOR),
  };
  return { door, lists: () => lists };
}

const plan = (rows: PlannedRow[], asks: PlannedAsk[] = []): Plan => ({ taken: '2026-09-15', rev: 1, rows, asks, polls: [], skipped: [], changed: [] });

const project = (n: number): PlannedRow => ({
  register: 'things',
  key: `legacy:project:p${String(n)}`,
  label: `Project ${String(n)}`,
  fields: { name: `Project ${String(n)}` },
});

/** The one question this import brings, shaped as `legacy.ts` shapes an open question. */
const ASK: PlannedAsk = {
  key: 'legacy:suggestion:SG7',
  label: 'SG7',
  question: 'Which store should Tidepool launch on first?',
  body: {
    options: [
      { id: 'A', label: 'The desktop store', because: 'Where the beta players already are.', recommended: true },
      { id: 'B', label: 'The console store', because: 'A bigger audience later.' },
    ],
    from: 'legacy:suggestion:SG7',
  },
};

/** Somebody else's question, the kind Spark and the packs file all year. */
const other = (n: number) => ({
  question: `Question ${String(n)}?`,
  body_kind: 'options' as const,
  body: { options: [{ id: 'yes', label: 'Yes', because: 'It is.' }, { id: 'no', label: 'No', because: 'It is not.' }] },
});

/** Every suggestion this record holds, the record's own count rather than one read off a page. */
const onDecide = (kernel: Kernel) => value<Record<string, unknown>[]>(kernel.governance('suggestion', { status: 'all', every: true }));

test('A QUESTION ALREADY ANSWERED IS NOT ASKED AGAIN once Decide holds more rows than one read answers with', async () => {
  const { sql, clock, kernel } = await record();
  const { door } = doorOf(kernel);
  const rows = [project(1), project(2)];

  const first = await applyPlan(plan(rows, [ASK]), door, { dryRun: false });
  assert.deepEqual(first.refused, []);
  assert.equal(first.asked, 1);
  assert.equal(onDecide(kernel).length, 1);

  /* THE LIFETIME OF A SUGGESTION TABLE, which is what the ceiling is counted against: every draft
     Spark filed, every pack offered and every question answered is still a row. Half share an
     instant, so the order past the time is the order they were written in, which is the tie-break
     the cursor has to carry. */
  for (let i = 0; i < 250; i++) {
    if (i % 2) clock.advance(1000);
    assert.ok(kernel.propose(other(i), ACTOR).ok, 'a question would not open');
  }
  assert.equal(onDecide(kernel).length, 251);

  /* AND THE IMPORT AGAIN. Its question is the OLDEST row of the two hundred and fifty-one, so a read
     that takes the newest two hundred and stops does not see it and asks it a second time. */
  const again = await applyPlan(plan(rows, [ASK]), door, { dryRun: false });
  assert.deepEqual(again.refused, []);
  assert.equal(again.alreadyAsked, 1, 'the question was found on Decide');
  assert.equal(again.asked, 0);
  assert.equal(onDecide(kernel).length, 251, 'a second copy of a question he has already answered');
  sql.close();
});

test('A LIST THE IMPORT COULD NOT READ TO THE END IS A REFUSAL, and nothing is written twice on the strength of it', async () => {
  const { sql, kernel } = await record();
  const rows = Array.from({ length: 620 }, (_, i) => project(i));

  const first = await applyPlan(plan(rows), doorOf(kernel).door, { dryRun: false });
  assert.deepEqual(first.refused, []);
  assert.equal(first.tally.things?.added, 620);
  assert.equal(kernel.count('things'), 620);

  /* THE SECOND RUN, WITH THE CREDENTIAL GOING STALE AFTER THE FIRST PAGE. The record pages a list at
     five hundred rows, so page one carries five hundred of the six hundred and twenty and page two
     is refused. Read as an empty answer, the hundred and twenty rows nobody saw look absent and are
     written again. */
  const { door, lists } = doorOf(kernel, { refuseListAfter: 1 });
  await assert.rejects(
    () => applyPlan(plan(rows), door, { dryRun: false }),
    /This record does not know that credential/u,
    'a page the import never read came back as no rows at all',
  );
  assert.equal(lists(), 2, 'the read stopped at the page that was refused');
  assert.equal(kernel.count('things'), 620, 'rows the import could not see were added a second time');
  sql.close();
});
