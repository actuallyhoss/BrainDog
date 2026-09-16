/**
 * The printer and its inverse, held to the one promise the format makes: `dogText(parseDog(dogText(x)))`
 * reproduces `dogText(x)` byte for byte. That is the round trip a lossy printer can actually promise —
 * see `src/index.ts`'s header for why "recover `x` exactly" is not the promise this format makes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dogText, parseDog, type DogPage } from '../src/index.ts';

/** Every field the printer knows how to draw, once each, so a gap in the parser has somewhere to hide. */
const FULL: DogPage = {
  page: 'invoicing',
  title: 'Invoicing',
  for: { register: 'clients', where: 'state is active' },
  nav: { section: 'Money', order: 20 },
  requires: ['register.invoices', 'register.clients'],
  blocks: [
    {
      kind: 'stat',
      heading: 'This quarter',
      cells: [{ metric: 'invoiced-q' }, { metric: 'unpaid-90d' }],
    },
    {
      kind: 'table',
      heading: 'Open',
      span: 6,
      source: 'register.invoices',
      where: 'state is sent or part',
      columns: [{ field: 'seq' }, { field: 'client' }, { field: 'amount' }],
      order: [{ field: 'due', dir: 'asc' }, { field: 'seq', dir: 'desc' }],
      limit: 50,
      empty: 'Nothing outstanding.',
    },
    {
      kind: 'gauge',
      source: 'metric.runway',
      target: 90,
      empty: 'No runway figure yet.',
    },
    {
      kind: 'note',
      heading: 'Reminder',
      body: 'Line one.\nLine two, indented in the file but not in the note.\n\nA blank line survives too.',
    },
  ],
};

/** No `for:`, no `nav:`, no `requires`, and a block with nothing but the fields that must always be there. */
const MINIMAL: DogPage = {
  page: 'domains',
  title: 'Domains',
  blocks: [{ kind: 'table', source: 'register.domains', empty: 'Nothing registered yet.' }],
};

for (const [name, page] of [['full', FULL], ['minimal', MINIMAL]] as const) {
  test(`round trip: ${name}`, () => {
    const printed = dogText(page);
    const parsed = parseDog(printed);
    assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.fix);
    if (!parsed.ok) return;
    /* THE PROMISE IS TEXT-STABLE, NOT VALUE-IDENTICAL: `parsed.value` need not equal `page`, because
       `dogText` already dropped things `page` could have carried (a column's label, `where`'s tree
       form). What must hold is that printing what came back reproduces the same bytes. */
    assert.equal(dogText(parsed.value), printed);
  });
}

/**
 * THE COMMONEST PAGE THERE IS, and the printer used to write it in a form nothing could read back:
 * `requires: []` for a page that requires nothing, which the kernel refuses because a `requires` that
 * is written names at least one register. The line is now simply absent, and the file parses.
 */
test('a page that requires nothing prints no requires line, and reads back', () => {
  const printed = dogText(MINIMAL);
  assert.equal(printed.includes('requires:'), false);
  const parsed = parseDog(printed);
  assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.fix);
  if (!parsed.ok) return;
  /* UNDEFINED AND NOT `[]`: the value goes on to the kernel as the page's own document, and an empty
     list there is the refusal this test exists about. */
  assert.equal(parsed.value.requires, undefined);
  assert.equal(dogText(parsed.value), printed);
});

/** Every `.dog` file pulled before the line went away holds the empty form, and still opens. */
test('the empty requires line an older file holds is read as nothing required', () => {
  const parsed = parseDog('page: domains\ntitle: Domains\nrequires: []\nblocks:\n  - kind: note');
  assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.fix);
  if (!parsed.ok) return;
  assert.equal(parsed.value.requires, undefined);
  assert.equal(dogText(parsed.value).includes('requires:'), false);
});

test('a body with an internal blank line and trailing spaces round-trips exactly', () => {
  const page: DogPage = {
    page: 'notes',
    title: 'Notes',
    blocks: [{ kind: 'note', body: 'first\n\nthird' }],
  };
  const printed = dogText(page);
  const parsed = parseDog(printed);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.blocks[0]?.body, 'first\n\nthird');
});

test('a single trailing newline, as a text editor adds on save, is tolerated', () => {
  const printed = dogText(MINIMAL);
  const parsed = parseDog(`${printed}\n`);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(dogText(parsed.value), printed);
});

test('refuses a file with no page: line', () => {
  const out = parseDog('title: Nothing\nrequires: []\nblocks:\n');
  assert.equal(out.ok, false);
  if (!out.ok) assert.match(out.fix, /page: <id>/);
});

test('refuses a key the source view never prints', () => {
  const out = parseDog('page: x\ntitle: X\nrequires: []\nblocks:\n  - kind: note\n    tone: bad');
  assert.equal(out.ok, false);
  if (!out.ok) assert.match(out.fix, /does not print that key/);
});

test('refuses authored rows, because the count is all the source view kept', () => {
  const printed = [
    'page: x',
    'title: X',
    'requires: []',
    'blocks:',
    '  - kind: cards',
    '    authored: 3 rows',
  ].join('\n');
  const out = parseDog(printed);
  assert.equal(out.ok, false);
  if (!out.ok) assert.match(out.fix, /authored rows/);
});

test('refuses a span that is not a whole number', () => {
  const out = parseDog('page: x\ntitle: X\nrequires: []\nblocks:\n  - kind: note\n    span: six');
  assert.equal(out.ok, false);
  if (!out.ok) assert.match(out.fix, /whole number/);
});
