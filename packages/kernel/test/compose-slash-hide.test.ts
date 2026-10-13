/**
 * WHAT A LOOK SLASH WROTE MAY NOT HIDE (`applyLook`): the questions while any are waiting, and the page's opening line.
 *
 * A look Slash stored overnight is laid over the page as it reads later. A queue it saw empty may by then hold a
 * question for the reader, and hidden, nobody is asked. So the engine's hide never reaches a queue that drew anything,
 * nor the heading over it. The person's own look is his, and an empty queue goes as the rules hide it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyedBlocks } from '../src/block-keys.ts';
import { applyLook, composeLook, type LookBody } from '../src/compose.ts';
import type { BlockResult, PageRow } from '../src/pages.ts';

const row = (register: string, seq: number, fields: Record<string, unknown>): PageRow => ({
  id: `01K${register.toUpperCase()}${seq}`,
  register,
  seq,
  fields: fields as PageRow['fields'],
  state: 'open',
  version: 1,
  created_at: '2026-10-01T09:00:00.000Z',
  updated_at: '2026-10-01T09:00:00.000Z',
  deleted_at: null,
});
const block = (b: Partial<BlockResult> & { kind: string; body?: string }): BlockResult => ({ rows: [], matched: 0, refusals: [], ...b }) as BlockResult;
const keysOf = (blocks: readonly BlockResult[]): string[] => blocks.map((b) => b.key!);
const look = (by: LookBody['by'], rest: Partial<LookBody>): LookBody => ({ look: 'money', basis: 'x', by, ...rest });

const bills = block({ kind: 'table', source: 'register.bills', heading: 'Bills', rows: [row('bills', 1, { what: 'Rent' })], matched: 1 });
const asked = block({ kind: 'queue', source: 'governance.open', heading: 'Waiting on you', matched: 1, queue: [{ id: 'SG7', question: 'Pay the kiln invoice?', options: [] } as never] });
const quiet = block({ kind: 'queue', source: 'governance.open', heading: 'Waiting on you' });

test('A LOOK SLASH WROTE NEVER HIDES A QUESTION THAT IS WAITING, on a page about something else or on Today', () => {
  for (const page of ['money', 'home', 'decide']) {
    const blocks = keyedBlocks([block({ kind: 'note', lead: true, body: 'Line' }), bills, asked]);
    const [, , ask] = keysOf(blocks);
    const out = applyLook(blocks, look('slash', { look: page, hide: [ask!], next: { row: 'SG7', text: 'Answer' } }));
    assert.equal(out.blocks.find((b) => b.key === ask)!.drawn, undefined, `${page}: the question is still drawn`);
    assert.equal(out.look.hide, undefined, `${page}: and the look as it applied hides nothing`);
    assert.deepEqual(out.look.next, { row: 'SG7', text: 'Answer' }, `${page}: so the step about it stands`);
  }
});

test('THE SAME HOLDS FOR A QUEUE KIND WITH NO SOURCE NAMED, and for the rules: only a queue known to be empty goes', () => {
  const bare = keyedBlocks([bills, block({ kind: 'queue', heading: 'Asks', queue: [{ id: 'SG2', question: 'Ship it?', options: [] } as never] })]);
  assert.equal(applyLook(bare, look('slash', { hide: [keysOf(bare)[1]!] })).look.hide, undefined);
  const blocks = keyedBlocks([bills, asked]);
  assert.equal(applyLook(blocks, look('rule', { hide: [keysOf(blocks)[1]!] })).look.hide, undefined);
});

test('THE HEADING OVER A WAITING QUESTION STAYS, and what else stood under it with the question does too', () => {
  const blocks = keyedBlocks([bills, block({ kind: 'section', heading: 'Decisions' }), asked, block({ kind: 'table', source: 'register.notes', heading: 'Notes', rows: [row('notes', 1, { what: 'x' })], matched: 1 })]);
  const [, head, ask, notes] = keysOf(blocks);
  const out = applyLook(blocks, look('slash', { hide: [head!] }));
  assert.deepEqual(out.blocks.map((b) => b.drawn), [undefined, undefined, undefined, undefined]);
  assert.equal(out.look.hide, undefined);
  /* Named one by one, the list beside the question goes and the question and its heading stay. */
  const each = applyLook(blocks, look('slash', { hide: [head!, ask!, notes!] }));
  assert.deepEqual(each.look.hide, [notes]);
  assert.deepEqual(each.blocks.map((b) => b.drawn), [undefined, undefined, undefined, false]);
});

test('A LOOK SLASH WROTE NEVER HIDES THE OPENING LINE, nor the block it leads with', () => {
  const blocks = keyedBlocks([block({ kind: 'note', lead: true, body: 'Rent is late.' }), block({ kind: 'table', source: 'register.notes', heading: 'Notes', rows: [row('notes', 1, { what: 'x' })], matched: 1 }), bills]);
  const [line, notes, bill] = keysOf(blocks);
  const out = applyLook(blocks, look('slash', { lead: bill!, hide: [line!, bill!, notes!] }));
  assert.deepEqual(out.look.hide, [notes], 'only the plain list went');
  assert.equal(out.look.lead, bill);
  assert.ok(out.blocks.filter((b) => b.key !== notes).every((b) => b.drawn === undefined));
});

test('AN EMPTY QUEUE MAY GO, as the rules hide it, and comes back the night a question lands in it', () => {
  const empty = keyedBlocks([bills, quiet]);
  const key = keysOf(empty)[1]!;
  assert.deepEqual(composeLook({ page: 'money', blocks: empty, today: '2026-10-06', seen: null }).hide, [key], 'the rules hide it');
  const stored = look('slash', { hide: [key] });
  assert.deepEqual(applyLook(empty, stored).look.hide, [key]);
  /* The same stored look, over the page read after a question arrived: the key is the same, and the block is drawn. */
  const later = keyedBlocks([bills, { ...asked }]);
  assert.equal(keysOf(later)[1], key);
  const out = applyLook(later, stored);
  assert.equal(out.blocks[1]!.drawn, undefined);
  assert.equal(out.look.hide, undefined);
});

test("THE PERSON'S OWN LOOK IS HIS: he hides the questions if he wants, and a queue already shut holds no heading up", () => {
  const blocks = keyedBlocks([bills, asked]);
  const ask = keysOf(blocks)[1]!;
  const his = applyLook(blocks, look('owner', { hide: [ask] }));
  assert.deepEqual(his.look.hide, [ask]);
  assert.equal(his.blocks[1]!.drawn, false);
  /* A queue a `when:` already shut is not waiting on anybody, so it holds no heading up. */
  const shut = keyedBlocks([bills, block({ kind: 'section', heading: 'Decisions' }), { ...asked, drawn: false }]);
  const head = keysOf(shut)[1]!;
  assert.deepEqual(applyLook(shut, look('slash', { hide: [head] })).look.hide?.includes(head), true);
});
