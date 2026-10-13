/**
 * WHO MAY CARRY `of:`, held at the table (`block-keys.ts`) and at the install that refuses from it (`declare.ts`).
 *
 * `of:` names the whole a block is set against. A ring read one from the start; since PGS-B05 a heat over a list reads
 * one too, each day's wash being the share of that day's whole its `where` admits. The table said `of: ['ring']` until
 * then, so a heat written with the sentence was refused at install with "of: is read by ring blocks".
 *
 * A BAR IS NOT AMONG THEM, AND THIS FILE HOLDS THAT. A bar adds up every row its `where` admits (`wholeRead`) and has no
 * second whole to be a share of: nothing in `pages.ts` reads an `of:` off a bar, and the read refuses one ("a bar has
 * none"). Listing it here would install a sentence the block then drew without, which is the quiet failure the table
 * exists to stop.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANSWER_KEYS, BLOCK_INSTALLS, BLOCK_READS, KEY_KINDS, keysFor, kindsReading, wrongKindKey } from '../src/block-keys.ts';
import { validateDeclaration, type Declaration } from '../src/index.ts';

/** A page holding one block, which is all the install's key check looks at. */
const page = (block: Record<string, unknown>): Declaration => ({
  id: 'page.paid',
  kind: 'page',
  body: { page: 'paid', title: 'Paid', nav: { section: 'Money', order: 20 }, requires: ['register.obligations'], blocks: [block] } as Declaration['body'],
});

const OVER = { source: 'register.obligations', of: 'state is paid' };
const HEAT = { kind: 'heat', heading: 'Paid on the day', columns: [{ field: 'due' }], ...OVER };
const RING = { kind: 'ring', heading: 'Paid', where: 'state is paid', ...OVER };
const BAR = { kind: 'bar', heading: 'Where it went', columns: [{ field: 'what' }, { field: 'amount' }], ...OVER };
const TABLE = { kind: 'table', heading: 'Open', columns: [{ field: 'what' }], ...OVER };

test('of: IS READ BY A RING AND A HEAT, and by no other kind', () => {
  assert.deepEqual(KEY_KINDS.of, ['ring', 'heat']);
  assert.deepEqual(kindsReading('of'), ['ring', 'heat'], 'no registered kind takes the key either');
  assert.ok(BLOCK_INSTALLS.has('of'));
  for (const kind of ['ring', 'heat']) assert.ok(keysFor(kind).includes('of'), `a ${kind} is not offered of:`);
  for (const kind of ['bar', 'table', 'split', 'chips', 'gauge', 'progress', 'cards'])
    assert.ok(!keysFor(kind).includes('of'), `a ${kind} is offered of:, which it does not read`);
});

test('A HEAT AND A RING CARRYING of: INSTALL', () => {
  assert.equal(validateDeclaration(page(HEAT)), null);
  assert.equal(validateDeclaration(page(RING)), null);
});

test('A TABLE AND A BAR CARRYING of: ARE REFUSED AT THE KEY, in a sentence that names who reads it', () => {
  for (const block of [TABLE, BAR]) {
    const refusal = validateDeclaration(page(block));
    assert.equal(refusal?.code, 'DECLARATION_INVALID', `a ${block.kind} carrying of: installed`);
    assert.equal(refusal?.at, 'blocks[0].of');
    assert.ok(refusal?.fix.includes(wrongKindKey('of', block.kind)), refusal?.fix);
    assert.ok(!(refusal?.allowed ?? []).includes('of'));
    /* The same block without the sentence installs, so it is the key that was refused and nothing beside it. */
    const { of: _of, ...without } = block;
    assert.equal(validateDeclaration(page(without)), null);
  }
  assert.equal(wrongKindKey('of', 'table'), 'of: is read by ring and heat blocks, and a table block does nothing with it. Take it off.');
});

test('wholeRead IS AN ANSWER, read back on a block and never declared on one', () => {
  assert.ok(ANSWER_KEYS.includes('wholeRead'));
  assert.ok(BLOCK_READS.has('wholeRead'));
  assert.ok(!BLOCK_INSTALLS.has('wholeRead'));
  assert.equal(validateDeclaration(page({ kind: 'bar', heading: 'Where it went', source: 'register.obligations', columns: [{ field: 'what' }], wholeRead: { rows: [], total: 0 } }))?.at, 'blocks[0].wholeRead');
});
