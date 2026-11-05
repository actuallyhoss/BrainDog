/**
 * "MERGE WITH ANOTHER PERSON" FROM A PERSON'S OWN PAGE, and the menu it lives in. The person page's "..." opened nothing on
 * the live record (2026-10-20): it is drawn whether or not the row came from the local copy, and offers Merge among its
 * verbs, which asks the record's `sameOne` and so puts the question to Decide.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { askMerge, othersOf } from './merge-with.ts';
import type { RecordRow } from './remote.ts';

const row = (seq: number, fields: Record<string, unknown>): RecordRow => ({ id: `r${seq}`, seq, fields, version: 1, created_at: '2026-10-01T00:00:00Z' });
const rows = [
  row(1, { name: 'Teodor Brandt', email: 'teodor@kiln.example' }),
  row(2, { name: 'Teodor Brandt', email: 'teodor@larkspur.example' }),
  row(3, { name: 'Ada', email: 'ada@example.com' }),
  row(4, { name: 'Gone', merged_into: 'people#1' }),
  row(5, { name: '' }),
];

test('the sheet lists everybody but this person, by name, and never one already folded or with no name', () => {
  assert.deepEqual(othersOf(rows, 'name', 1, '', 'merged_into').map((o) => o.seq), [3, 2]);
  assert.deepEqual(othersOf(rows, 'name', 1, 'larkspur', 'merged_into').map((o) => o.seq), [2], 'a typed word narrows by name or address');
  assert.deepEqual(othersOf(rows, 'name', 1, 'zzz', 'merged_into'), []);
});

test('a press asks the record whether the two are one, and opens the question it files', async () => {
  const sent: unknown[] = [];
  const io = (async (_url: string, init?: { body?: string }) => {
    sent.push(JSON.parse(init?.body ?? '{}'));
    return new Response('{"ok":true,"value":{"question":"SG9","opened":true}}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as never;
  const out = await askMerge('http://record.test', 'people', 1, 2, io);
  assert.deepEqual(out, { ok: true, question: 'SG9' });
  assert.match(JSON.stringify(sent), /people#1/u);
  assert.match(JSON.stringify(sent), /people#2/u);
});

test('the row page draws the menu with Merge in it, and not only once the record has answered', () => {
  const page = readFileSync(new URL('../../routes/r/[register]/[seq]/+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /\{#if row\}\n\s+<Menu label=\{copy\.moreOn\(/u, 'the menu waits behind the live read again');
  assert.match(page, /\{:else if v === 'merge'\}<button type="button" class="mi" role="menuitem" data-merge /u, 'the menu has no Merge');
  /* THE MENU DRAWS WHAT `rowVerbs` SAYS, the one list a link to the row reads too, and it offers Merge on the same terms. */
  const verbs = readFileSync(new URL('../things/menu-of.ts', import.meta.url), 'utf8');
  assert.match(verbs, /f\.changes && !f\.archived && f\.decl\.meets !== undefined \? \(\['merge'\] as const\)/u, 'rowVerbs no longer offers Merge');
  assert.match(page, /const mergeable = \$derived\(changes && !archived && decl\?\.meets !== undefined\)/u);
});
