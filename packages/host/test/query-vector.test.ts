/**
 * A search's words as a vector (ENG-B18): `queryVector`, the record's one guarded path, over a hand-built meter and a
 * fake embed. Each step that says no sends nothing: a folded query that is empty or too long, his switch off or not
 * readable, a month with no room past its kept half. A query asked again within the day is answered from memory with no
 * call, and the log never holds his words. And the pass, whose embed room is now `embedRoom`, leases as it did.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok, type Result } from '@braindog/ports';
import { createRecordApi } from '@braindog/record';

import { embedRoom, queryVector, QUERY_CHARS_MOST, QUERY_KEPT_MOST, QUERY_KEPT_MS, serveModelJobs, type ModelJobEmbeddings, type ModelJobMeter } from '../src/model-jobs.ts';
import { enqueue } from '../../kernel/src/outbox.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 14, 9, 0);
const DIMS = 4;
const meterOf = (cap: number, spent: number): ModelJobMeter => ({ cap, spent: () => spent });

/** A fake embed that answers one vector per text and keeps what it was sent, or answers `answer` when given. */
function fake(answer?: () => Promise<Result<ModelJobEmbeddings>>) {
  const sent: string[][] = [];
  const embed = async (texts: readonly string[]): Promise<Result<ModelJobEmbeddings>> => {
    sent.push([...texts]);
    if (answer) return answer();
    return ok({ model: 'fake-embed', dims: DIMS, vectors: texts.map(() => Int8Array.from([1, -2, 3, -4])) });
  };
  return { embed, sent };
}

function search(o: { embed?: ReturnType<typeof fake>['embed']; meter?: ModelJobMeter; reads?: () => boolean; now?: () => number } = {}) {
  const lines: string[] = [];
  const ask = queryVector({
    embed: o.embed,
    meter: o.meter ?? meterOf(30, 0),
    now: o.now ?? (() => T0),
    ...(o.reads ? { reads: o.reads } : {}),
    log: (line) => lines.push(line),
  });
  return { ask, lines };
}

test('NO EMBED IS NO PATH: the host cannot embed, and the search is by words', () => {
  assert.equal(search().ask, undefined);
});

test('HIS SWITCH OFF IS `off` AND NOTHING IS SENT, and a switch that cannot be read is off too', async () => {
  const f = fake();
  const { ask, lines } = search({ embed: f.embed, reads: () => false });
  assert.deepEqual(await ask!('vehicle cover'), { ok: false, why: 'off' });
  assert.deepEqual(f.sent, []);
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0]!, /vehicle cover/u);

  const g = fake();
  const unread = search({
    embed: g.embed,
    reads: () => {
      throw new Error('the prefs could not be read');
    },
  });
  assert.deepEqual(await unread.ask!('vehicle cover'), { ok: false, why: 'off' });
  assert.deepEqual(g.sent, []);
});

test('ON WITH ROOM IS ONE CALL OF THE ONE QUERY, and the same words within the day are not asked again', async () => {
  const f = fake();
  let now = T0;
  const { ask } = search({ embed: f.embed, reads: () => true, now: () => now });
  const got = await ask!('vehicle cover');
  assert.equal(got.ok, true);
  if (got.ok) assert.deepEqual([got.vector.model, got.vector.dims, [...got.vector.vec]], ['fake-embed', DIMS, [1, -2, 3, -4]]);
  assert.deepEqual(f.sent, [['vehicle cover']]);

  /* OTHER CASE AND SPACING ARE THE SAME QUERY, kept a day. */
  now = T0 + QUERY_KEPT_MS;
  assert.equal((await ask!('  Vehicle   COVER ')).ok, true);
  assert.equal(f.sent.length, 1);

  /* PAST THE DAY IT IS ASKED AGAIN. */
  now = T0 + QUERY_KEPT_MS + 1;
  assert.equal((await ask!('vehicle cover')).ok, true);
  assert.deepEqual(f.sent, [['vehicle cover'], ['vehicle cover']]);
});

test('A QUERY KEPT WHILE HIS SWITCH WAS ON IS `off` ONCE IT IS OFF: the kept vector is not handed out', async () => {
  const f = fake();
  let on = true;
  const { ask } = search({ embed: f.embed, reads: () => on });
  assert.equal((await ask!('vehicle cover')).ok, true);
  on = false;
  assert.deepEqual(await ask!('vehicle cover'), { ok: false, why: 'off' });
  on = true;
  assert.equal((await ask!('vehicle cover')).ok, true);
  assert.equal(f.sent.length, 1, 'kept again once it is back on, and not asked twice');
});

test('THE OLDEST KEPT QUERY GOES PAST THE LIMIT, and is asked again', async () => {
  const f = fake();
  const { ask } = search({ embed: f.embed });
  for (let i = 0; i <= QUERY_KEPT_MOST; i++) await ask!(`query ${i}`);
  assert.equal(f.sent.length, QUERY_KEPT_MOST + 1);
  await ask!(`query ${QUERY_KEPT_MOST}`);
  assert.equal(f.sent.length, QUERY_KEPT_MOST + 1, 'the newest is kept');
  await ask!('query 0');
  assert.equal(f.sent.length, QUERY_KEPT_MOST + 2, 'the oldest went');
});

test('A MONTH WITH AT MOST HALF LEFT IS `spent`, AND NOT ASKED: the half the prose and the drafts keep holds', async () => {
  const f = fake();
  assert.equal(embedRoom(meterOf(30, 15), T0), 0);
  assert.deepEqual(await search({ embed: f.embed, meter: meterOf(30, 15) }).ask!('vehicle cover'), { ok: false, why: 'spent' });
  assert.deepEqual(await search({ embed: f.embed, meter: meterOf(30, 29) }).ask!('vehicle cover'), { ok: false, why: 'spent' });
  assert.deepEqual(f.sent, []);
  assert.equal(embedRoom(meterOf(30, 14), T0), 1);
  assert.equal((await search({ embed: f.embed, meter: meterOf(30, 14) }).ask!('vehicle cover')).ok, true);
});

test('A REFUSAL OR A THROW IS `failed`, AND THE LINE LOGGED NEVER HOLDS THE QUERY', async () => {
  const refused = fake(async () => no('UNREACHABLE', 'The model did not answer: the provider did not answer.'));
  const r = search({ embed: refused.embed });
  assert.deepEqual(await r.ask!('Renew the car insurance'), { ok: false, why: 'failed' });
  assert.equal(refused.sent.length, 1);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0]!, /did not answer/u);
  assert.doesNotMatch(r.lines[0]!, /renew|insurance/iu);

  /* A MESSAGE THAT ECHOES THE WORDS IS REPLACED. */
  const echoed = fake(async () => {
    throw new Error('bad input: renew the car insurance');
  });
  const e = search({ embed: echoed.embed });
  assert.deepEqual(await e.ask!('Renew the car insurance'), { ok: false, why: 'failed' });
  assert.doesNotMatch(e.lines.join('\n'), /renew|insurance/iu);

  /* A VECTOR OF ANOTHER WIDTH THAN IT STATES IS NO VECTOR, and nothing is kept. */
  const narrow = fake(async () => ok({ model: 'fake-embed', dims: DIMS, vectors: [Int8Array.from([1, 2])] }));
  const n = search({ embed: narrow.embed });
  assert.deepEqual(await n.ask!('vehicle cover'), { ok: false, why: 'failed' });
  assert.deepEqual(await n.ask!('vehicle cover'), { ok: false, why: 'failed' });
  assert.equal(narrow.sent.length, 2);
});

test('AN EMPTY QUERY OR ONE PAST THE LIMIT IS `failed`, AND NOT ASKED', async () => {
  const f = fake();
  const { ask } = search({ embed: f.embed });
  assert.deepEqual(await ask!('   '), { ok: false, why: 'failed' });
  assert.deepEqual(await ask!('a'.repeat(QUERY_CHARS_MOST + 1)), { ok: false, why: 'failed' });
  assert.deepEqual(f.sent, []);
  assert.equal((await ask!('a'.repeat(QUERY_CHARS_MOST))).ok, true);
});

/* ── the pass, on `embedRoom` ─────────────────────────────────────────────────────────────────── */

/** A record with one embedding job waiting, and the pass over a fake embed and `meter`. */
async function waiting(meter: ModelJobMeter) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => T0 } });
  const id = enqueue(sql, () => 'J1', T0, 'infer.embed', { at: new Date(T0).toISOString(), ids: ['R0', 'R1'], texts: ['first', 'second'] });
  const f = fake();
  await serveModelJobs(api, {
    inference: { draft: async () => assert.fail('no draft is queued'), prose: async () => assert.fail('no prose is queued'), embed: f.embed },
    meter,
    now: () => T0,
    log: () => {},
  });
  const state = sql.one<{ state: string }>('SELECT state FROM outbox WHERE id = ?', id)?.state;
  sql.close();
  return { sent: f.sent, state };
}

test('THE PASS STILL LEASES `infer.embed` AS IT DID: with room past the kept half, and not without it', async () => {
  const roomy = await waiting(meterOf(30, 0));
  assert.deepEqual(roomy.sent, [['first', 'second']]);
  assert.notEqual(roomy.state, 'pending');

  const half = await waiting(meterOf(30, 15));
  assert.deepEqual(half.sent, []);
  assert.equal(half.state, 'pending');
});
