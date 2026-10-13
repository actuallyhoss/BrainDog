/**
 * `look.<page>`, the eleventh kind of declaration (contract 17), and a block's declared `key:`, checked where they are
 * installed.
 *
 * THE INSTALL CHECKS A LOOK ON ITS OWN AND AGAINST ITS PAGE'S DECLARATION; `lookFault` checks it against the page as
 * read, adds and all, for a writer holding that page. Both say what to change in a sentence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defaultBlockKey } from '../src/block-keys.ts';
import { lookFault, validate, type Declaration, type Known } from '../src/declare.ts';
import type { Json } from '../src/coerce.ts';

const page = (blocks: Record<string, unknown>[]): Declaration => ({ id: 'page.desk', kind: 'page', body: { page: 'desk', title: 'Desk', blocks } as never });
const look = (body: Record<string, unknown>, pack?: string): Declaration => ({ id: 'look.desk', kind: 'look', body: { look: 'desk', basis: 'b1', by: 'slash', ...body } as never, pack });

const DESK = [
  { kind: 'note', lead: true, body: 'Your desk.' },
  { kind: 'table', source: 'register.tasks', heading: 'Now', key: 'now' },
  { kind: 'table', source: 'register.notes', heading: 'Notes' },
];
const KNOWN: Known = new Map<string, Record<string, Json>>([['page.desk', { page: 'desk', title: 'Desk', blocks: DESK as Json }]]);
const NOTES = defaultBlockKey(DESK[2]);

test('A LOOK THAT SAYS WHAT CONTRACT 17 SAYS INSTALLS', () => {
  assert.equal(validate(look({ lead: 'now', order: ['now', NOTES], hide: [NOTES], headline: 'Two things are late', next: { row: 'tasks#4', text: 'Pay HSBC' } }), KNOWN), null);
  assert.equal(validate(look({ by: 'owner', pinned: [NOTES] }), KNOWN), null, 'the owner pins');
  assert.equal(validate(look({ by: 'rule' })), null, 'a look with nothing in it yet says nothing, and needs no record to say it');
});

test('EACH WAY A LOOK IS WRONG IS SAID, BY NAME', () => {
  const at = (d: Declaration, known?: Known) => {
    const r = validate(d, known);
    return r && [r.code, r.at];
  };
  assert.deepEqual(at(look({ blocks: [] })), ['DECLARATION_INVALID', 'blocks'], 'a look adds no block');
  assert.deepEqual(at(look({ by: 'robot' })), ['DECLARATION_INVALID', 'by']);
  assert.deepEqual(at(look({ by: 'owner' }, 'money-core')), ['DECLARATION_INVALID', 'by'], 'a pack never speaks for the owner');
  assert.deepEqual(at(look({ basis: '' })), ['DECLARATION_INVALID', 'basis']);
  assert.deepEqual(at(look({ lead: 'Not a key' })), ['DECLARATION_INVALID', 'lead']);
  assert.deepEqual(at(look({ order: ['now', 'now'] })), ['DECLARATION_INVALID', 'order[1]']);
  assert.deepEqual(at(look({ hide: 'now' })), ['DECLARATION_INVALID', 'hide']);
  assert.deepEqual(at(look({ by: 'owner', pinned: ['now'], hide: ['now'] })), ['DECLARATION_INVALID', 'hide[0]'], 'a pinned block is never hidden');
  assert.deepEqual(at(look({ lead: 'now', hide: ['now'] })), ['DECLARATION_INVALID', 'hide[0]'], 'the lead is never hidden');
  assert.deepEqual(at(look({ headline: 'x'.repeat(201) })), ['OUT_OF_BOUNDS', 'headline']);
  assert.deepEqual(at(look({ next: { row: 'tasks#4' } })), ['DECLARATION_INVALID', 'next.text']);
  assert.deepEqual(at(look({ next: { row: 'tasks#4', text: 'Pay', why: 'x' } })), ['DECLARATION_INVALID', 'next']);
  assert.deepEqual(at(look({}), new Map()), ['PAGE_UNKNOWN', 'look'], 'a look over a page the record does not have');
  assert.deepEqual(at({ id: 'look.money', kind: 'look', body: { look: 'desk', basis: 'b', by: 'rule' } }), ['DECLARATION_INVALID', 'id']);
});

test('A WRITER HOLDING THE PAGE AS READ IS TOLD WHEN ITS LOOK DOES NOT FIT IT', () => {
  const read = [
    { key: 'klead', kind: 'note', lead: true, refusals: [], rows: [] },
    { key: 'now', kind: 'table', refusals: [], rows: [{ id: '01KX', register: 'tasks', seq: 4, fields: {} }] },
    { key: 'broken', kind: 'table', refusals: [{ code: 'REGISTER_UNKNOWN', fix: 'x' }], rows: [] },
    { key: 'ask', kind: 'queue', refusals: [], rows: [], queue: [{ id: 'SG9' }] },
  ];
  assert.equal(lookFault({ order: ['ask', 'now'], next: { row: 'tasks#4' } }, read), null);
  assert.equal(lookFault({ next: { row: 'SG9' } }, read), null);
  assert.equal(lookFault({ order: ['now', 'kghost'] }, read)?.at, 'order[1]', 'order only reorders keys the page has');
  assert.equal(lookFault({ hide: ['broken'] }, read)?.at, 'hide[0]', 'a refused block stays');
  assert.equal(lookFault({ hide: ['klead'] }, read)?.at, 'hide[0]', 'the opening line stays');
  assert.equal(lookFault({ next: { row: 'tasks#5' } }, read)?.at, 'next.row', 'next names a row the page handed');
  assert.equal(lookFault({ by: 'slash', hide: ['ask'] }, read)?.at, 'hide[0]', 'questions that wait stay');
  assert.equal(lookFault({ by: 'owner', hide: ['ask'] }, read), null, 'his own look is his');
});

test("A BLOCK'S DECLARED KEY HAS ONE SHAPE, AND NO TWO BLOCKS OF A PAGE SHARE ONE", () => {
  assert.equal(validate(page([{ kind: 'note', body: 'x', key: 'intro' }])), null);
  assert.equal(validate(page([{ kind: 'note', body: 'x', key: 'Intro!' }]))?.at, 'blocks[0].key');
  assert.equal(validate(page([{ kind: 'note', body: 'x', key: 7 }]))?.at, 'blocks[0].key');
  const twice = validate(page([{ kind: 'note', body: 'x', key: 'intro' }, { kind: 'note', body: 'y', key: 'intro' }]));
  assert.deepEqual([twice?.code, twice?.at], ['DECLARATION_INVALID', 'blocks[1].key']);
});
