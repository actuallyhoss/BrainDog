/**
 * A lead note's `says:` (PGS-A13 item 3): a short list of sentences, each under a condition over its figures, read top
 * to bottom, and the record says the first that holds.
 *
 * WHAT WAS MEASURED BEFORE IT: a lead note had one fixed body, so a Today whose figures said 25 things waited opened on
 * "Nothing needs you" beside a badge of 25. The sentence is now chosen by the record from the same figures, so it reads
 * "3 things wait for you" while they wait and its calm line only when nothing does, the same for every reader.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { registersOfBlock, type PageBlock } from '../src/pages.ts';
import { SAYS_MOST, noteSaysFault, wrongKindKey } from '../src/block-keys.ts';
import { PROJECTS } from '../../../fixtures/names.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const OWNER = { actor: 'p_1' };

const ITEMS: Declaration = {
  id: 'register.items',
  kind: 'register',
  body: { id: 'items', name: 'Items', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'waits', type: 'bool', index: true }] },
} as never;
const WAITING: Declaration = {
  id: 'metric.waiting',
  kind: 'metric',
  body: { metric: 'waiting', name: 'Waiting', source: 'register.items', where: 'waits is true', value: { count: 'id' }, format: 'int', target: { lte: 0 }, window: '7d', compare: 'none' },
} as never;

async function record(waiting: number): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([ITEMS, WAITING]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (let i = 0; i < waiting; i += 1) assert.ok(k.create('items', { name: PROJECTS[i % PROJECTS.length]!, waits: true }, OWNER).ok);
  assert.ok(k.create('items', { name: 'Settled already', waits: false }, OWNER).ok);
  return k;
}

const LEAD = {
  kind: 'note',
  lead: true,
  says: [
    { when: { metric: 'waiting', gt: 1 }, body: '{{waiting}} things wait for you.', tone: 'bad' },
    { when: { metric: 'waiting', gt: 0 }, body: '{{waiting}} thing waits for you.', tone: 'warn' },
    { body: 'Nothing needs you.' },
  ],
} as unknown as PageBlock;

test('THE FIRST SENTENCE THAT HOLDS IS SAID, its holes filled and its tone carried', async () => {
  const many = (await record(3)).block(LEAD);
  assert.deepEqual(many.refusals, []);
  assert.equal(many.says_at, 0);
  assert.equal(many.body, '{{waiting}} things wait for you.');
  assert.equal(many.tone, 'bad');
  assert.deepEqual(many.values, { waiting: 3 });

  /* THE SECOND HOLDS TOO WHILE THREE WAIT, and is not said, because the first held above it. With one, it is. */
  const one = (await record(1)).block(LEAD);
  assert.equal(one.says_at, 1);
  assert.equal(one.body, '{{waiting}} thing waits for you.');
  assert.equal(one.tone, 'warn');
  assert.deepEqual(one.values, { waiting: 1 });
});

test('THE CALM LINE IS SAID ONLY WHEN NOTHING ELSE HOLDS, with no tone it does not carry', async () => {
  const calm = (await record(0)).block(LEAD);
  assert.deepEqual(calm.refusals, []);
  assert.equal(calm.says_at, 2);
  assert.equal(calm.body, 'Nothing needs you.');
  assert.equal(calm.tone, undefined);
  /* ONLY THE SAID SENTENCE'S HOLES ARE READ: the calm line has none. */
  assert.equal(calm.values, undefined);
});

test('A NOTE READ BACK WITH ITS SAID SENTENCE ON IT CHOOSES AGAIN, and is not refused for a body', async () => {
  const k = await record(1);
  const first = k.block(LEAD);
  assert.ok(k.create('items', { name: 'One more', waits: true }, OWNER).ok);
  assert.ok(k.create('items', { name: 'And another', waits: true }, OWNER).ok);
  const again = k.block(first);
  assert.deepEqual(again.refusals, []);
  assert.equal(again.says_at, 0);
  assert.deepEqual(again.values, { waiting: 3 });
});

test('A FIGURE A SENTENCE TESTS IS ONE THE PAGE READS, whichever sentence is said', () => {
  const block = { kind: 'note', says: [{ when: { metric: 'waiting', gt: 0 }, body: 'Some wait.' }, { body: 'None wait.' }] } as unknown as PageBlock;
  const metric = (id: string) => (id === 'waiting' ? ((WAITING.body as unknown) as never) : null);
  assert.deepEqual(registersOfBlock(block, metric), ['items']);
});

test('A NOTE WITH BOTH A BODY AND SAYS IS REFUSED, at the read and by the check the install asks', async () => {
  const both = { ...LEAD, body: 'Hello.' } as unknown as PageBlock;
  const read = (await record(0)).block(both);
  assert.equal(read.says_at, undefined);
  assert.equal(read.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(read.refusals[0]?.at, 'says');
  assert.match(read.refusals[0]!.fix, /both a body and says/);
  assert.match(noteSaysFault(both as never, 'page.today.blocks[0]')!.fix, /^page\.today\.blocks\[0\] has both a body and says/);
});

test('SAYS WHOSE LAST SENTENCE HAS A WHEN IS REFUSED, naming it, since on a calm day it would say nothing', async () => {
  const calmless = { kind: 'note', says: [{ when: { metric: 'waiting', gt: 0 }, body: 'Some wait.' }, { when: { metric: 'waiting', is: 0 }, body: 'None wait.' }] };
  const read = (await record(0)).block(calmless as unknown as PageBlock);
  assert.equal(read.refusals[0]?.at, 'says[1].when');
  assert.match(read.refusals[0]!.fix, /last sentence has a when/);
});

test('THE REST OF THE SHAPE IS REFUSED IN A SENTENCE: too many, no words, a stray tone, a sentence that hides the rest', () => {
  const fault = (says: unknown) => noteSaysFault({ kind: 'note', says }, 'This note');
  const line = { when: { metric: 'waiting', gt: 0 }, body: 'Some wait.' };
  assert.equal(fault([line, { body: 'None wait.' }]), null);
  assert.equal(fault([{ body: 'Always this.' }]), null);
  assert.match(fault(Array.from({ length: SAYS_MOST + 1 }, (_, i) => (i === SAYS_MOST ? { body: 'Calm.' } : line)))!.fix, /1 to 6 sentences/);
  assert.match(fault([])!.fix, /1 to 6 sentences/);
  assert.equal(fault([{ when: line.when }, { body: 'Calm.' }])!.at, 'says[0].body');
  assert.equal(fault([{ ...line, tone: 'red' }, { body: 'Calm.' }])!.at, 'says[0].tone');
  assert.equal(fault([{ ...line, shade: 1 }, { body: 'Calm.' }])!.at, 'says[0].shade');
  assert.match(fault([{ body: 'Always.' }, { body: 'Calm.' }])!.fix, /sentence 1 has no when, so it is said every time/);
  assert.match(fault([{ when: { any: [line.when] }, body: 'One.' }, { body: 'Calm.' }])!.fix, /sentence 1's when has an any of one leaf/);
});

test('SAYS ON ANYTHING BUT A NOTE IS REFUSED, with where the sentences go', async () => {
  const table = { kind: 'table', source: 'register.items', columns: [{ field: 'name' }], says: [{ body: 'Calm.' }] } as unknown as PageBlock;
  const read = (await record(0)).block(table);
  const refusal = read.refusals.find((r) => r.at === 'says');
  assert.ok(refusal, JSON.stringify(read.refusals));
  assert.equal(refusal.fix, wrongKindKey('says', 'table'));
  assert.match(refusal.fix, /^says: is read by note blocks, and a table block does nothing with it\. .*kind: note, lead: true, says:/);
});

test('A PAGE WHOSE LEAD SAYS THREE SENTENCES OPENS ON THE ONE THAT HOLDS, the same for every reader', async () => {
  const page: Declaration = {
    id: 'page.front',
    kind: 'page',
    body: { page: 'front', title: 'Front', requires: ['register.items'], blocks: [LEAD, { kind: 'table', source: 'register.items', columns: [{ field: 'name' }] }] } as never,
  };
  const k = await record(2);
  const installed = await k.install([page]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const read = k.page('front');
  assert.ok(read.ok, JSON.stringify(read));
  const lead = read.value.blocks[0]!;
  assert.equal(lead.drawn, undefined);
  assert.equal(lead.says_at, 0);
  assert.equal(lead.body, '{{waiting}} things wait for you.');
  assert.equal(lead.tone, 'bad');
  assert.deepEqual(lead.values, { waiting: 2 });
});
