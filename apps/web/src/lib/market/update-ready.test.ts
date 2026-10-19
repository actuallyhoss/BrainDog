/**
 * "An update is ready": what the new version changes, read from the two files the store holds. The store is a function
 * standing in for the network; the add-on is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readyFor, readyWords } from './update-ready.ts';

const BOOKS = { register: 'library', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
const SHELF = { page: 'shelf', title: 'Shelf', requires: ['register.library'], blocks: [{ kind: 'table', source: 'register.library', span: 12 }] };
const LOANS = { register: 'loans', name: 'Loans', title: 'who', fields: [{ id: 'who', type: 'text', required: true }] };
const NUDGE = { rule: 'nudge', name: 'Nudge late loans', register: 'loans', on: 'create', then: [{ set: { field: 'who', to: 'someone' } }] };

const file = (version: string, declarations: unknown[]): string =>
  JSON.stringify({ pack: 'bookshelf', version, title: 'Bookshelf', summary: `Books, ${version}.`, author: 'Halden', license: 'MIT', declarations });

const store = (files: Record<string, string>) => async (url: string): Promise<Response> => {
  const name = /packs\/bookshelf\/([^/]+)\.pack\.json$/u.exec(url)?.[1];
  const text = name === undefined ? undefined : files[name];
  return text === undefined ? new Response('', { status: 404 }) : new Response(text);
};

test('an update says what it adds and takes away, with the author\'s own note above it', async () => {
  const fetcher = store({ '1.0.0': file('1.0.0', [BOOKS, SHELF]), '1.1.0': file('1.1.0', [BOOKS, LOANS, NUDGE]) });
  const ready = await readyFor(fetcher, 'bookshelf', '1.0.0', '1.1.0', ' Lends books out. ', (m) => m);
  assert.deepEqual([ready.from, ready.to, ready.note, ready.read], ['1.0.0', '1.1.0', 'Lends books out.', true]);
  assert.ok(ready.lines.includes('Adds the list Loans'), ready.lines.join(' | '));
  assert.ok(ready.lines.includes('Adds the automation Nudge late loans'), ready.lines.join(' | '));
  assert.ok(ready.lines.includes('Takes out the page Shelf'), ready.lines.join(' | '));
});

test('a version the store cannot give is said so and no change is guessed', async () => {
  const ready = await readyFor(store({ '1.0.0': file('1.0.0', [BOOKS]) }), 'bookshelf', '1.0.0', '1.1.0', null, (m) => m);
  assert.deepEqual([ready.read, ready.lines, ready.note], [false, [], null]);
  assert.match(readyWords.unread, /plan shows it in full/u);
});

test('an earlier version the store has lost reads as a first version, so everything in the new one is said', async () => {
  const ready = await readyFor(store({ '1.1.0': file('1.1.0', [BOOKS, SHELF]) }), 'bookshelf', '1.0.0', '1.1.0', null, (m) => m);
  assert.equal(ready.read, true);
  assert.ok(ready.lines.includes('Adds the list Books'));
});

test('the page keeps the sentences that tell a person their edits are kept and that updating asks', () => {
  assert.match(readyWords.kept, /you changed/u);
  assert.match(readyWords.asks, /nothing changes until you approve/u);
  for (const said of Object.values(readyWords).filter((v): v is string => typeof v === 'string')) assert.doesNotMatch(said, /—/u);
});
