/**
 * The four kinds' writers, each handed the record's answer as the kernel writes one and asked what fence it draws.
 *
 * THE MODULES ARE CALLED DIRECTLY, not through `index.ts`'s table, so this holds what each one writes whether or not
 * its line in the table has landed; `kinds.test.ts` holds the table and the path every page takes to it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Block } from 'braindog-render';

import type { Refusal } from '../../record/blocks.ts';
import { calendar } from './calendar.ts';
import { embed } from './embed.ts';
import { gallery } from './gallery.ts';
import type { DrawOptions, Drawn } from './index.ts';
import { link } from './link.ts';

const NOTHING: Refusal = { kind: 'no-results', title: 'Nothing matched.' };
const OPTS: DrawOptions = { home: 'GBP', now: Date.UTC(2026, 8, 12, 12), nothing: () => NOTHING };

/** A row as the kernel answers one. */
const entry = (register: string, seq: number, fields: Record<string, unknown>) => ({
  id: `01J${String(seq).padStart(23, '0')}`,
  register,
  seq,
  fields,
  state: null,
  version: 1,
  created_at: '2026-09-01T09:00:00.000Z',
  updated_at: '2026-09-01T09:00:00.000Z',
  deleted_at: null,
});

/** A block as the record's `page` answers one: the declaration, with what the kernel read on it. */
const answer = (kind: string, more: Record<string, unknown>) => ({ kind, rows: [], matched: 0, refusals: [], ...more }) as never;

/** The one block a writer drew, its cells as the renderer parsed them. */
function cellsOf(drawn: Drawn): string[][] {
  assert.equal(drawn.refusal, null);
  assert.equal(drawn.segments.length, 1);
  const [segment] = drawn.segments;
  assert.equal(segment?.type, 'block', segment?.type === 'degraded' ? segment.fix : '');
  return (segment as Block).rows.map((r) => r.cells);
}

test('A CALENDAR OVER A LIST WRITES EACH ROW\'S TITLE AS A DOOR TO IT AND ITS DAY, and leaves out a row with no day', () => {
  const drawn = calendar.draw(
    answer('calendar', {
      source: 'register.events',
      columns: [{ field: 'what' }, { field: 'on' }],
      rows: [entry('events', 1, { what: 'Kiln launch', on: '2026-09-12' }), entry('events', 2, { what: 'Call', on: '2026-09-13T10:00:00Z' }), entry('events', 3, { what: 'Someday' })],
    }),
    OPTS,
  );
  assert.deepEqual(cellsOf(drawn), [
    ['[Kiln launch](/r/events/1)', '2026-09-12'],
    ['[Call](/r/events/2)', '2026-09-13'],
  ]);
});

test('an authored calendar keeps its rows and their tone, and one with nothing in it says the empty state', () => {
  const drawn = calendar.draw(answer('calendar', { authored: [{ cells: ['Launch', '2026-09-12'], tone: 'warn' }, { cells: ['Review', '2026-09-20'], tone: 'constructor' }] }), OPTS);
  const [segment] = drawn.segments;
  assert.equal(segment?.type, 'block');
  assert.deepEqual((segment as Block).rows.map((r) => [r.cells, r.tone ?? null]), [
    [['Launch', '2026-09-12'], 'warn'],
    [['Review', '2026-09-20'], null],
  ]);
  assert.deepEqual(calendar.draw(answer('calendar', { source: 'register.events', columns: [{ field: 'what' }, { field: 'on' }] }), OPTS), { segments: [], refusal: NOTHING });
});

test('A LINK OVER A LIST WRITES THE ADDRESS AS THE RECORD HOLDS IT, and an address that is not a link degrades the block', () => {
  const columns = [{ field: 'name' }, { field: 'url' }, { field: 'note' }];
  const drawn = link.draw(answer('link', { source: 'register.links', columns, rows: [entry('links', 1, { name: 'The spec', url: 'https://example.com/spec', note: 'read first' }), entry('links', 2, { name: 'Pipe | name', url: '/p/plan' })] }), OPTS);
  assert.deepEqual(cellsOf(drawn), [
    ['The spec', 'https://example.com/spec', 'read first'],
    ['Pipe | name', '/p/plan', ''],
  ]);
  const wrong = link.draw(answer('link', { source: 'register.links', columns, rows: [entry('links', 1, { name: 'Old', url: 'http://example.com' })] }), OPTS);
  assert.equal(wrong.segments[0]?.type, 'degraded');
  assert.match(wrong.segments[0]?.type === 'degraded' ? wrong.segments[0].fix : '', /A link is an https address, a mailto or a path of this BrainDog\./u);
});

test('AN AUTHORED LINK ROW\'S FOURTH CELL IS ITS GLYPH, handed to the renderer as its own cell, never in the note', () => {
  const drawn = link.draw(
    answer('link', {
      authored: [
        { cells: ['Appearance', '/settings/appearance', 'Colour, text size and density', 'sun'] },
        { cells: ['Identity', '/settings/identity', '', 'user-check'] },
        { cells: ['Plain', '/settings/plain', 'Three cells'] },
        { cells: ['Long', '/settings/long', 'A line', 'sun', 'extra'] },
      ],
    }),
    OPTS,
  );
  assert.deepEqual(cellsOf(drawn), [
    ['Appearance', '/settings/appearance', 'Colour, text size and density', 'sun'],
    ['Identity', '/settings/identity', '', 'user-check'],
    ['Plain', '/settings/plain', 'Three cells'],
    ['Long', '/settings/long', 'A line', 'sun'],
  ]);
});

test('A GALLERY WRITES A PICTURE BY REFERENCE AND ANY OTHER FILE BY ITS NAME, and captions a tile with no caption by its name', () => {
  const file = (mime: string, name: string) => ({ sha256: 'a'.repeat(64), mime, bytes: 10, name });
  const drawn = gallery.draw(
    answer('gallery', {
      source: 'register.parts',
      columns: [{ field: 'what' }, { field: 'photo' }],
      rows: [
        entry('parts', 2, { what: 'The glaze', photo: file('image/png', 'glaze.png') }),
        entry('parts', 3, { photo: file('application/pdf', 'quote.pdf') }),
        entry('parts', 4, { what: 'Not yet' }),
      ],
    }),
    OPTS,
  );
  assert.deepEqual(cellsOf(drawn), [
    ['The glaze', 'file:parts#2/photo'],
    ['quote.pdf', 'quote.pdf'],
    ['Not yet', ''],
  ]);
});

test('AN EMBED IS ITS ONE AUTHORED ROW, and a block with none says the empty state rather than framing anything', () => {
  const drawn = embed.draw(answer('embed', { authored: [{ cells: ['https://youtu.be/dQw4w9WgXcQ', 'The launch film', '16:9'] }] }), OPTS);
  assert.deepEqual(cellsOf(drawn), [['https://youtu.be/dQw4w9WgXcQ', 'The launch film', '16:9']]);
  assert.deepEqual(embed.draw(answer('embed', { source: 'register.films' }), OPTS), { segments: [], refusal: NOTHING });
});
