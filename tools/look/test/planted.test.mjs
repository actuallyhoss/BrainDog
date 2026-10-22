/**
 * The planted record (`sources/planted.mjs`) is the seed with one fault of each kind the quick checks look for, so a
 * check that went blind is seen to. It must put each fault in, leave the seed's own answers alone, and plant words the
 * words check reads as the kinds the source says it plants.
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { rawIn } from '../words.mjs';
import { FAULTS, LATER_DAYS, LEFT_OUT, MARKER, open, plant } from '../sources/planted.mjs';
import { open as openSeed } from '../sources/seed.mjs';

const DAY = 86_400_000;

test('THE FAULTS ARE PUT INTO WHAT THE RECORD ANSWERS, and the answer it was handed is not changed', () => {
  const boot = { ok: true, value: { now: '2026-09-03T12:00:00.000Z', waits: { questions: 8, late: 0 }, pages: [{ slug: 'kiln' }, { slug: LEFT_OUT }] } };
  const got = plant('/api/boot', boot);
  assert.equal(got.value.waits.questions, 3);
  assert.equal(got.value.waits.late, 0, 'only what is planted changes');
  assert.equal(Date.parse(got.value.now) - Date.parse(boot.value.now), LATER_DAYS * DAY);
  assert.deepEqual(got.value.pages, [{ slug: 'kiln' }]);
  assert.equal(boot.value.waits.questions, 8);
  assert.equal(boot.value.pages.length, 2);
  assert.deepEqual(plant('/api/list', { ok: true, value: { rows: [{ fields: { next: MARKER } }] } }).value.rows[0].fields.next, FAULTS, 'the next step is changed in any answer that holds it');
  assert.deepEqual(plant('/api/list', { ok: true, value: { waits: { questions: 8 } } }), { ok: true, value: { waits: { questions: 8 } } }, 'only boot is moved');
});

test('THE WORDS IT PLANTS ARE THE KINDS THE WORDS CHECK READS', () => {
  assert.deepEqual(Object.keys(rawIn(FAULTS, { all: true })), ['placeholders', 'paths', 'dates', 'hashes', 'handles', 'refs', 'codes', 'zeros', 'ticks', 'machine']);
});

test('THE SOURCE ANSWERS AS THE SEED DOES, with the faults in what it says', async () => {
  const [planted, seed] = [await open(), await openSeed()];
  const serve = (source) => createServer((req, res) => source.handle(req, res, new URL(req.url ?? '/', 'http://x')));
  const [a, b] = [serve(planted), serve(seed)];
  try {
    await Promise.all([a, b].map((s) => new Promise((done) => s.listen(0, '127.0.0.1', done))));
    const boot = async (s) => (await (await fetch(`http://127.0.0.1:${s.address().port}/api/boot`)).json()).value;
    const [there, here] = [await boot(a), await boot(b)];
    assert.equal(there.waits.questions, 3);
    assert.equal(here.waits.questions, 8, 'the seed it is made from says what it always said');
    assert.equal(Date.parse(there.now) - Date.parse(here.now), LATER_DAYS * DAY);
    assert.ok(here.pages.some((p) => p.slug === LEFT_OUT) && !there.pages.some((p) => p.slug === LEFT_OUT));
    assert.equal(planted.name, 'planted');
    assert.equal(planted.seen, false, 'a planted record never counts as seen');
  } finally {
    await Promise.all([a, b].map((s) => new Promise((done) => s.close(done))));
    await Promise.all([planted.close(), seed.close()]);
  }
});
