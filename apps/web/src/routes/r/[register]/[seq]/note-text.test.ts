/**
 * A long note reads as a note: a person's memo printed its `**`, `##` and table pipes as
 * one 2,600 px block. Its headings, bold and table draw, and it opens folded with "Show all".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { folds, isMemo, partsOf, spansOf } from './note-text.ts';

const MEMO = [
  '## Wren Hollis',
  '**Role:** runs the shop floor at Tidewell.',
  'Met at the Larkspur fair.',
  '',
  '| Year | Orders |',
  '|---|---:|',
  '| 2025 | 14 |',
  '| 2026 | 22 |',
  '',
  '- Calls on Fridays',
  '- Prefers `email` to calls',
].join('\n');

test('A MEMO DRAWS ITS HEADING, ITS BOLD, ITS TABLE AND ITS LIST, and no mark it was written in', () => {
  const parts = partsOf(MEMO);
  assert.deepEqual(parts.map((p) => p.t), ['h', 'p', 'table', 'ul']);
  const h = parts[0]!;
  assert.equal(h.t === 'h' ? h.spans.map((s) => s.text).join('') : '', 'Wren Hollis');
  const p = parts[1]!;
  assert.equal(p.t, 'p');
  if (p.t === 'p') {
    assert.equal(p.lines.length, 2, 'a line break inside a paragraph is kept, as the memo was written');
    assert.deepEqual(p.lines[0]![0], { t: 'b', text: 'Role:' });
  }
  const table = parts[2]!;
  assert.equal(table.t, 'table');
  if (table.t === 'table') {
    assert.deepEqual(table.head.map((c) => c.map((s) => s.text).join('')), ['Year', 'Orders']);
    assert.deepEqual(table.rows.map((r) => r.map((c) => c.map((s) => s.text).join(''))), [['2025', '14'], ['2026', '22']]);
  }
  const ul = parts[3]!;
  assert.equal(ul.t === 'ul' ? ul.items.length : 0, 2);
  const said = JSON.stringify(parts);
  assert.doesNotMatch(said, /\*\*|##|\|-|---/u, 'a mark the memo was written in is drawn');
});

test('BOLD AND CODE ARE SPANS, and an unclosed mark is the text it is', () => {
  assert.deepEqual(spansOf('a **b** c `d`'), [
    { t: 'text', text: 'a ' },
    { t: 'b', text: 'b' },
    { t: 'text', text: ' c ' },
    { t: 'code', text: 'd' },
  ]);
  assert.deepEqual(spansOf('2 ** 3'), [{ t: 'text', text: '2 ** 3' }]);
});

test('A NOTE IS A MEMO WHEN IT IS WRITTEN AS ONE OR RUNS LONG, and a short line stays a fact', () => {
  assert.equal(isMemo(MEMO), true);
  assert.equal(isMemo('Year end is 31 March'), false);
  assert.equal(isMemo('x '.repeat(400)), true, 'a long plain note is drawn as a note, so it folds');
});

test('A NOTE PAST EIGHT LINES OPENS FOLDED, and a short one does not', () => {
  assert.equal(folds(MEMO), true);
  assert.equal(folds('## A heading\nOne line.'), false);
  assert.equal(folds('word '.repeat(200)), true, 'one long paragraph wraps past eight lines on a phone');
});

test('THE ROW PAGE DRAWS A TEXT FACT THAT IS A MEMO AS A NOTE, folded with Show all', () => {
  const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /isMemo\(value\)/u);
  assert.match(page, /<NoteText /u);
  const note = readFileSync(new URL('./NoteText.svelte', import.meta.url), 'utf8');
  assert.match(note, /noteWords\.more/u);
  assert.doesNotMatch(note, /\{@html/u, 'a note is never drawn from a string of HTML');
});
