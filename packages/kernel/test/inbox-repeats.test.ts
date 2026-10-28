/**
 * The inbox says which skipped texts are repeats by the record's own mark (the kernel half).
 *
 * MEASURED BEFORE: the Inbox found repeats by one page of skipped texts whose reason started "Looks like a repeat". A
 * page full of texts a rule set aside pushed a real second charge off it, and a repeat written before batch 35 never
 * read as one. Ingest already marks a repeat on its `match` line (`field: 'repeats'`); the listing now carries that
 * mark, and pages through repeats alone when asked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARD, record, text, used } from './ingest-tail-kit.ts';

const DECLINED = { when: { field: 'body', contains: 'declined' }, reason: 'A declined charge moved no money.' };

async function inbox() {
  const r = await record(CARD({ dedupe: ['amount', 'account'], skip: [DECLINED] }));
  assert.ok(r.k.write('accounts', r.card, { last4: '1234' } as never, { actor: 'p_1' }).ok);
  const first = text(r.k, used('1234', 'Corner Shop', '120.00', '07/10/2026'));
  const again = text(r.k, used('1234', 'Corner Shop', '120.00', '08/10/2026'));
  assert.equal(again.state, 'skipped');
  /* A PAGE'S WORTH OF RULE SKIPS AFTER IT, the case that hid the repeat. */
  const ruled = [1, 2, 3, 4].map((n) => text(r.k, `${used('1234', 'Corner Shop', `${n}.00`, '09/10/2026')} It was declined.`));
  for (const s of ruled) assert.equal(s.state, 'skipped');
  return { ...r, first: first.wrote[0]!, again: again.raw, ruled: ruled.map((s) => s.raw) };
}

test('A SKIPPED REPEAT CARRIES THE ROW IT REPEATS, and a text a rule set aside carries nothing', async () => {
  const r = await inbox();
  const page = r.k.inboxBefore(null, 50, ['skipped']);
  assert.equal(page.find((a) => a.id === r.again)?.repeats, r.first);
  for (const id of r.ruled) assert.equal(page.find((a) => a.id === id)?.repeats, undefined, 'a rule skip read as a repeat');
  assert.ok(!page.some((a) => a.id !== r.again && 'repeats' in a));
  r.sql.close();
});

test('REPEATS ALONE PAGE PAST THE RULE SKIPS: a page of two still finds the second charge', async () => {
  const r = await inbox();
  assert.ok(!r.k.inboxBefore(null, 2, ['skipped']).some((a) => a.id === r.again), 'the case is not the one that hid it');
  const only = r.k.inboxBefore(null, 2, ['skipped'], { repeats: true });
  assert.deepEqual(
    only.map((a) => [a.id, a.repeats]),
    [[r.again, r.first]],
  );
  /* AND ITS CURSOR STILL WORKS: nothing older than the repeat is one. */
  assert.deepEqual(r.k.inboxBefore(only[0]!.rowid, 2, ['skipped'], { repeats: true }), []);
  r.sql.close();
});

test('ONE QUERY FOR THE PAGE: the mark is read inside it, never once per arrival', async () => {
  const r = await inbox();
  let asked = 0;
  const all = r.sql.all.bind(r.sql);
  const one = r.sql.one.bind(r.sql);
  const spy = (q: string): void => void (/'repeats'/.test(q) && (asked += 1));
  r.sql.all = ((q: string, ...p: never[]) => (spy(q), all(q, ...p))) as typeof r.sql.all;
  r.sql.one = ((q: string, ...p: never[]) => (spy(q), one(q, ...p))) as typeof r.sql.one;
  assert.equal(r.k.inboxBefore(null, 50, ['skipped']).length, 5);
  assert.equal(asked, 1);
  r.sql.all = all;
  r.sql.one = one;
  r.sql.close();
});

test('FILED AS A SECOND ONE, it leaves the repeats: it is no longer skipped', async () => {
  const r = await inbox();
  assert.ok(r.k.fileAsSecond(r.again).ok);
  assert.deepEqual(r.k.inboxBefore(null, 50, ['skipped'], { repeats: true }), []);
  const filed = r.k.inboxBefore(null, 50, ['matched']).find((a) => a.id === r.again);
  assert.equal(filed?.repeats, undefined);
  r.sql.close();
});
