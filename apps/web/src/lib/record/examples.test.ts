import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clearExamples, offerOf, readExamples, type ExamplesClient } from './examples.ts';

test('A NEW RECORD IS OFFERED CLEARING QUIETLY, one with rows of its own beside the examples is told they are in the way, and none is offered with nothing to clear', () => {
  assert.equal(offerOf(null), null);
  assert.equal(offerOf({ untouched: 0, touched: 2, registers: {}, others: 40 }), null);
  const fresh = offerOf({ untouched: 7, touched: 0, registers: { things: 1 }, others: 0 })!;
  assert.equal(fresh.loud, false);
  assert.match(fresh.body, /^Setting up added 7 example rows/u);
  assert.equal(fresh.button, 'Clear the examples');
  assert.equal(fresh.confirm, 'Delete 7 example rows');
  const imported = offerOf({ untouched: 6, touched: 1, registers: { things: 1 }, others: 219 })!;
  assert.equal(imported.loud, true);
  assert.equal(imported.body, 'Your own rows are here now, beside 6 example rows setting up added. They show on Home, Money and the Dashboard until you clear them. One example you changed stays.');
  for (const o of [fresh, imported]) assert.doesNotMatch(o.body, /—/u, 'no em dash');
});

test('reading and clearing go to the record by name, and a refusal is its sentence', async () => {
  const sent: string[] = [];
  const client: ExamplesClient = {
    call: async <T>(name: string) => {
      sent.push(name);
      if (name === 'examples') return { ok: true, value: { untouched: 3, touched: 0, registers: {}, others: 0 } as T };
      return { ok: true, value: { cleared: 3, kept: 1 } as T };
    },
  };
  assert.equal((await readExamples(client))?.untouched, 3);
  assert.deepEqual(await clearExamples(client), { ok: true, said: 'Cleared 3 example rows. One you changed was kept.' });
  assert.deepEqual(sent, ['examples', 'clearExamples']);
  const refused: ExamplesClient = { call: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the owner can.' } }) };
  assert.equal(await readExamples(refused), null);
  assert.deepEqual(await clearExamples(refused), { ok: false, fix: 'Only the owner can.' });
});
