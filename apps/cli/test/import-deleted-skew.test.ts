/**
 * A ROW HE DELETED STAYS DELETED WHATEVER BUILD THE HOST IS AT, AND AN ANSWER THAT CANNOT HOLD THE BIN IS REFUSED
 * (`loop/research-batch-fifty-five-audit.md` section 1).
 *
 * `dc9ec9e4` moved the import's deleted read from a POST to `client.list(... includeDeleted: true)`, a GET, which only a
 * host at `dc9ec9e4` or later decodes. MEASURED BEFORE THIS FILE, the first test run with `BRAINDOG_HOST_TREE` naming a
 * checkout at `19d4c785` (the build `app.brain.dog` answered on 23 September): task 101 and ledger row T1 came back
 * after he deleted them, `Tasks: 1 added` and `Ledger: 1 added`, exit 0. Without the variable the record is this
 * tree's and `rewrite` does to a GET what that host's route table did, drops the argument it did not declare, and the
 * test failed on the same line. A rolled-back Worker, a self-host not yet updated and a CLI copy pulled before the
 * deploy each put the two at different commits, every night of the gap.
 *
 * THE SECOND HALF IS A HOST THAT LEAVES THE BIN OUT HOWEVER IT IS ASKED, which no build measured here does, and which
 * the import would read exactly as it read the old GET: a row with no deleted copy is a row to create. Nothing in one
 * answer tells an empty bin from a bin left out, so the import compares against what the run before saw there.
 *
 * EVERY VALUE IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KEY_PREFIX } from '../src/legacy.ts';
import { syntheticExport } from './legacy-export.ts';
import { gatedNights, live, OTHER_TREE, type Wire } from './import-gated.ts';

const DAY = 86_400_000;
const START = Date.UTC(2026, 8, 15, 3, 20);
const TASK = `${KEY_PREFIX}task:101`;
const TXN = `${KEY_PREFIX}txn:t1`;

/** The synthetic export with one ledger row on the main account, as `import-deleted-stays.test.ts` builds it. */
function fixture(takenAt: number): Record<string, unknown> {
  const exp = syntheticExport({ takenAt: new Date(takenAt - 3_600_000).toISOString() });
  (exp.money as Record<string, unknown>).ledger = [{ id: 'T1', description: 'Coffee beans for the studio', day: '2026-09-10', amount_minor: -12000, account_id: 'main' }];
  return exp;
}

/** What `19d4c785`'s route table did to a GET's `includeDeleted`: it was not declared, so the kernel never read `true`. */
const oldGet = (w: Wire): Wire => {
  if (w.method !== 'GET' || !w.url.startsWith('/api/list?')) return w;
  const url = new URL(`http://stub${w.url}`);
  url.searchParams.delete('includeDeleted');
  return { ...w, url: `${url.pathname}${url.search}` };
};

/** A host that leaves deleted rows out of every list, a GET's or a POST's. */
const noBin = (w: Wire): Wire => {
  const got = oldGet(w);
  if (got.method !== 'POST' || !got.url.startsWith('/api/list')) return got;
  const { includeDeleted: _, ...rest } = JSON.parse(got.body) as Record<string, unknown>;
  return { ...got, body: JSON.stringify(rest) };
};

test('A ROW HE DELETED IS NOT ADDED BACK BY A HOST AT 19d4c785, the build production answered when the GET shipped', async (t) => {
  const h = await gatedNights(t, START);
  if (!OTHER_TREE) h.rewrite(oldGet);
  const one = await h.night(fixture(START), START);
  assert.equal(one.code, 0, one.text);
  await h.deleteByKey('tasks', TASK);
  await h.deleteByKey('transactions', TXN);

  const two = await h.night(fixture(START + DAY), START + DAY);
  assert.equal(two.code, 0, two.text);
  assert.equal(live(h.sql, TASK), 0, `task 101 came back after he deleted it:\n${two.text}`);
  assert.equal(live(h.sql, TXN), 0, `ledger row T1 came back after he deleted it:\n${two.text}`);
  assert.match(two.text, /Deleted in this BrainDog, so not added again: .*#101/u);
});

test('A HOST WHOSE ANSWER LEAVES THE BIN OUT IS REFUSED, and nothing is written, when the run before saw rows there', async (t) => {
  const h = await gatedNights(t, START);
  assert.equal((await h.night(fixture(START), START)).code, 0);
  await h.deleteByKey('tasks', TASK);
  await h.deleteByKey('transactions', TXN);
  const two = await h.night(fixture(START + DAY), START + DAY);
  assert.equal(two.code, 0, two.text);
  assert.equal(live(h.sql, TASK), 0, two.text);

  h.rewrite(noBin);
  const events = h.sql.all<{ n: number }>('SELECT count(*) AS n FROM event')[0]!.n;
  const three = await h.night(fixture(START + 2 * DAY), START + 2 * DAY);
  assert.equal(three.code, 1, `the run carried on over an answer with no bin in it:\n${three.text}`);
  assert.equal(live(h.sql, TASK), 0, `task 101 came back:\n${three.text}`);
  assert.equal(live(h.sql, TXN), 0, `ledger row T1 came back:\n${three.text}`);
  assert.equal(h.sql.all<{ n: number }>('SELECT count(*) AS n FROM event')[0]!.n, events, 'something was written');
  assert.match(three.text, /nothing in the bin/u);
  assert.match(three.text, /nothing was written/u);

  /* THE SAME READ AS A DRY RUN IS REFUSED TOO, because a dry run that said "1 added" would be the same lie told early. */
  const dry = await h.night(fixture(START + 2 * DAY), START + 2 * DAY, ['--dry-run']);
  assert.equal(dry.code, 1, dry.text);
});

test('A BIN THAT EMPTIED ITSELF THE ORDINARY WAYS IS NOT REFUSED: a row put back, and a row the thirty-day sweep took', async (t) => {
  const h = await gatedNights(t, START);
  assert.equal((await h.night(fixture(START), START)).code, 0);
  await h.deleteByKey('tasks', TASK);
  assert.equal((await h.night(fixture(START + DAY), START + DAY)).code, 0);

  /* PUT BACK: the row is live again, so the answer holds it, and the next night updates it as his. */
  const [row] = h.sql.all<{ id: string }>("SELECT e.id FROM entry e, json_each(e.fields, '$.tags') t WHERE e.register = 'tasks' AND t.value = ?", TASK);
  assert.ok(row);
  await h.restore('tasks', row.id);
  const back = await h.night(fixture(START + 2 * DAY), START + 2 * DAY);
  assert.equal(back.code, 0, back.text);
  assert.equal(live(h.sql, TASK), 1, back.text);

  /* SWEPT: deleted again, seen in the bin by one night, and gone from it thirty days on by the record's own purge. */
  await h.deleteByKey('tasks', TASK);
  assert.equal((await h.night(fixture(START + 3 * DAY), START + 3 * DAY)).code, 0);
  const later = START + 34 * DAY;
  h.clock.set(later);
  (h.api.kernel as unknown as { purge: () => unknown }).purge();
  assert.equal(h.sql.all<{ n: number }>('SELECT count(*) AS n FROM entry WHERE id = ?', row.id)[0]!.n, 0, 'the sweep did not take the row');
  const swept = await h.night(fixture(later), later);
  assert.equal(swept.code, 0, `a bin the sweep emptied was refused:\n${swept.text}`);
});

test('A BIN EMPTIED ANOTHER WAY IS REFUSED ONCE, and --bin-emptied is how he says so and carries on', async (t) => {
  const h = await gatedNights(t, START);
  assert.equal((await h.night(fixture(START), START)).code, 0);
  await h.deleteByKey('tasks', TASK);
  assert.equal((await h.night(fixture(START + DAY), START + DAY)).code, 0);

  /* THE ROW IS GONE FROM THE RECORD WITH NO SWEEP AND NO PUT BACK, which a copy put back over the record does. */
  h.sql.exec("DELETE FROM entry WHERE deleted_at IS NOT NULL AND register = 'tasks'");
  const refused = await h.night(fixture(START + 2 * DAY), START + 2 * DAY);
  assert.equal(refused.code, 1, refused.text);
  assert.match(refused.text, /--bin-emptied/u);

  const told = await h.night(fixture(START + 2 * DAY), START + 2 * DAY, ['--bin-emptied']);
  assert.equal(told.code, 0, told.text);
  /* AND THE NIGHT AFTER NEEDS NO FLAG, because the run it told through saw the bin as it now is. */
  const after = await h.night(fixture(START + 3 * DAY), START + 3 * DAY);
  assert.equal(after.code, 0, after.text);
});
