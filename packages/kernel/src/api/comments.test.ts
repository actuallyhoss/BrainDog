/**
 * Comments, the kernel's half (`api/comments.ts`, `loop/finish/contracts.md` §2.5, `docs/20-COLLABORATION.md` §5).
 *
 * THE EXTENSION IS CALLED ON ITS OWN, over the parts it reads, and not through `makeKernel`: what is proved here is how a
 * comment is written and read back, and that holds whether or not `api/index.ts` has spread it onto the kernel yet. Who
 * may see a thing, and so its comments, is the record's question (`sightOf` in `packages/record`), and is not asked here:
 * a search is handed that question as a function, as the record hands it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';
import { guarded } from '@braindog/ports';

import { openRecord, type Declaration } from '../index.ts';
import { ulids } from '../ids.ts';
import type { KernelParts } from '../parts.ts';
import { fixedClock, openSqlite } from '../../test/sqlite.ts';
import { COMMENT_MOST, extension } from './comments.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const PERSON = { actor: 'p_1' };

const REGISTER: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return (r as { ok: true; value: T }).value;
};

const refusal = (r: Result<unknown>): { code: string; at?: string; allowed?: unknown } => {
  assert.ok(!r.ok && 'refusal' in r, JSON.stringify(r));
  return (r as { ok: false; refusal: { code: string; at?: string; allowed?: unknown } }).refusal;
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([REGISTER])).ok);
  const row = value(k.create('notes', { what: 'Kiln' }, PERSON));
  const other = value(k.create('notes', { what: 'Glaze' }, PERSON));
  /* ONLY WHAT THE EXTENSION READS: the storage, the clock, the minter and a transaction that runs its function. */
  const parts = { sql, clock, mint: ulids(clock.now), transaction: <T>(fn: () => T): T => fn() } as unknown as KernelParts;
  const events = () => Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')?.n ?? 0);
  return { k, sql, clock, c: extension(parts), on: `entry:${row.id}`, elsewhere: `entry:${other.id}`, events };
}

test('A COMMENT AND ITS REPLY ARE NOTES ON THE ROW, read back oldest first, and neither carries a to_v', async () => {
  const { sql, clock, c, on } = await record();
  const first = value(c.writeComment({ target: on, body: '  Kiln is late  ', actor: 'p_1' }));
  clock.advance(1000);
  const reply = value(c.writeComment({ target: on, body: 'It went in today.', reply_to: first.id, actor: 'p_2' }));

  const thread = c.commentsOn(on);
  assert.deepEqual(
    thread.map((l) => [l.id, l.by, l.body, l.reply_to, l.resolved]),
    [
      [first.id, 'p_1', 'Kiln is late', null, null],
      [reply.id, 'p_2', 'It went in today.', first.id, null],
    ],
  );
  const held = sql.all<{ kind: string; target_kind: string; field: string; to_v: string | null }>(
    'SELECT kind, target_kind, field, to_v FROM event WHERE id IN (?, ?) ORDER BY rowid',
    first.id,
    reply.id,
  );
  /* `to_v` STAYS NULL: `govern.ts` reads a decision's note that carries one as what was applied. */
  assert.deepEqual(held.map((e) => [e.kind, e.target_kind, e.field, e.to_v]), [
    ['note', 'entry', 'comment', null],
    ['note', 'entry', `reply:${first.id}`, null],
  ]);
});

test('A ROW NOTE THAT IS NOT A COMMENT STAYS OUT OF THE THREAD', async () => {
  const { k, c, on } = await record();
  value(k.log('notes', 1, PERSON, 'Fired twice.'));
  value(c.writeComment({ target: on, body: 'Kiln is late', actor: 'p_1' }));
  assert.deepEqual(c.commentsOn(on).map((l) => l.body), ['Kiln is late']);
});

test('ONE LEVEL OF REPLIES: a reply to a reply, or to a comment on something else, is refused and writes nothing', async () => {
  const { c, on, elsewhere, events } = await record();
  const first = value(c.writeComment({ target: on, body: 'Kiln is late', actor: 'p_1' }));
  const reply = value(c.writeComment({ target: on, body: 'Today.', reply_to: first.id, actor: 'p_2' }));
  const before = events();

  const deeper = refusal(c.writeComment({ target: on, body: 'Are you sure?', reply_to: reply.id, actor: 'p_1' }));
  assert.equal(deeper.code, 'VALUE_MALFORMED');
  assert.equal(deeper.at, 'reply_to');

  const astray = refusal(c.writeComment({ target: elsewhere, body: 'Wrong row.', reply_to: first.id, actor: 'p_1' }));
  assert.equal(astray.code, 'REF_UNKNOWN');
  assert.equal(events(), before);
});

test('A COMMENT IS ONE TO 280 CHARACTERS, counted as a person counts them', async () => {
  const { c, on } = await record();
  assert.equal(refusal(c.writeComment({ target: on, body: '   ', actor: 'p_1' })).code, 'REQUIRED_MISSING');
  assert.equal(refusal(c.writeComment({ target: on, body: 7, actor: 'p_1' })).code, 'VALUE_MALFORMED');
  assert.equal(refusal(c.writeComment({ target: on, body: 'x'.repeat(COMMENT_MOST + 1), actor: 'p_1' })).code, 'VALUE_MALFORMED');
  /* A CHARACTER OUTSIDE THE BASIC PLANE IS TWO UTF-16 UNITS AND ONE CHARACTER, so the most still fits. */
  value(c.writeComment({ target: on, body: '\u{1F525}'.repeat(COMMENT_MOST), actor: 'p_1' }));
});

test('A RESOLUTION IS THE NEWEST ONE, THE SAME ONE AGAIN WRITES NOTHING, and a reply is resolved with its thread', async () => {
  const { c, on, events } = await record();
  const first = value(c.writeComment({ target: on, body: 'Kiln is late', actor: 'p_1' }));
  const reply = value(c.writeComment({ target: on, body: 'Today.', reply_to: first.id, actor: 'p_2' }));

  const done = value(c.writeResolution({ id: first.id, as: 'addressed', why: 'It went in today.', actor: 'p_2' }));
  assert.deepEqual([done.id, done.resolved.as, done.resolved.why, done.resolved.by], [first.id, 'addressed', 'It went in today.', 'p_2']);

  const before = events();
  value(c.writeResolution({ id: first.id, as: 'addressed', why: 'It went in today.', actor: 'p_2' }));
  assert.equal(events(), before, 'the same resolution was written twice');

  value(c.writeResolution({ id: first.id, as: 'incorrect', why: 'It was never late.', actor: 'p_1' }));
  const [top, under] = c.commentsOn(on);
  assert.equal(top?.resolved?.as, 'incorrect');
  assert.equal(top?.resolved?.by, 'p_1');
  assert.equal(under?.resolved, null);

  assert.equal(refusal(c.writeResolution({ id: reply.id, as: 'addressed', why: 'Done.', actor: 'p_1' })).code, 'VALUE_MALFORMED');
  const wrong = refusal(c.writeResolution({ id: first.id, as: 'done', why: 'Done.', actor: 'p_1' }));
  assert.equal(wrong.at, 'as');
  assert.deepEqual(wrong.allowed, ['addressed', 'wont-fix', 'incorrect']);
  assert.equal(refusal(c.writeResolution({ id: first.id, as: 'addressed', why: '', actor: 'p_1' })).code, 'REQUIRED_MISSING');
  assert.equal(refusal(c.writeResolution({ id: 'nothing', as: 'addressed', why: 'Done.', actor: 'p_1' })).code, 'REF_UNKNOWN');
});

test('A SEARCH FINDS ONLY THE COMMENTS ON WHAT THE CALLER IS SAID TO SEE, and reads a percent sign as itself', async () => {
  const { c, on, elsewhere } = await record();
  value(c.writeComment({ target: on, body: 'Kiln is 50% late', actor: 'p_1' }));
  value(c.writeComment({ target: elsewhere, body: 'Glaze is 50% late', actor: 'p_1' }));
  value(c.writeComment({ target: on, body: 'Kiln is 50 late', actor: 'p_1' }));

  const sees = (target: string) => (target === on ? 'notes#1' : null);
  assert.deepEqual(
    c.commentsMatching('50%', sees).map((f) => [f.on, f.body]),
    [['notes#1', 'Kiln is 50% late']],
  );
  assert.deepEqual(c.commentsMatching('  ', sees), []);
});

test('A SEARCH AS LONG AS A SENTENCE IS ANSWERED THROUGH THE GUARD EVERY HOST PUTS OVER THE RECORD, and folds A to Z', async () => {
  const { sql, clock, on } = await record();
  /* THE GUARD, as both hosts wrap the record's storage in it: it refuses a `LIKE` pattern past its byte ceiling. */
  const c = extension({ sql: guarded(sql), clock, mint: ulids(clock.now), transaction: <T>(fn: () => T): T => fn() } as unknown as KernelParts);
  const words = 'The kiln was late again because the glaze order never arrived on Tuesday';
  value(c.writeComment({ target: on, body: words, actor: 'p_1' }));
  const sees = (target: string) => (target === on ? 'notes#1' : null);
  assert.deepEqual(c.commentsMatching(words.toUpperCase(), sees).map((f) => f.body), [words]);
});

test('A COMMENT TRAVELS IN AN EXPORT, as every event but an export does', async () => {
  const { k, c, on } = await record();
  value(c.writeComment({ target: on, body: 'Kiln is late', actor: 'p_1' }));
  const lines = value<string[]>(await k.export());
  assert.ok(lines.some((l) => l.includes('Kiln is late') && l.includes('"comment"')), 'the comment is not in the file');
});
