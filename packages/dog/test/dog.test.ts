/**
 * `.dog` held to its one promise: `parseDog(dogText(b)).value` deep-equals `b`, for every page body this repository
 * ships, for bodies built here to break a careless printer, and with every file the first version wrote still read.
 *
 * THE CORPUS IS WHAT A PERSON WILL PULL. Every page declaration in `packages/seed` (the modules, the agents pack, the
 * first-party documents and the use cases) and in `packs/` is found by walking what they export and hold, so a page
 * added to either is under this test the day it lands, with no list here to keep. The launch desk's pages are named,
 * because they are the pages the first version could not carry: a rail, a lead sentence, `when:`s, card roles and tabs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

import * as seed from '../../seed/src/index.ts';
import { USE_CASES, useCaseDocument } from '../../seed/src/usecases/index.ts';
import { dogName, dogText, parseDog, storedOf, type PageBody } from '../src/index.ts';

/* ── the corpus ──────────────────────────────────────────────────────── */

type Found = { from: string; body: PageBody };

/**
 * Every object shaped as a page declaration's body under `root`, as the record would store it.
 *
 * THROUGH JSON, because the record stores the body as JSON: a key a module leaves `undefined` is not in the stored body,
 * so it is not in the file either.
 */
function pagesIn(root: unknown, from: string, into: Map<string, Found>, seen: WeakSet<object> = new WeakSet()): void {
  if (typeof root !== 'object' || root === null || seen.has(root)) return;
  seen.add(root);
  if (Array.isArray(root)) {
    for (const v of root) pagesIn(v, from, into, seen);
    return;
  }
  const o = root as Record<string, unknown>;
  if (typeof o.page === 'string' && Array.isArray(o.blocks)) {
    const text = JSON.stringify(o);
    if (!into.has(text)) into.set(text, { from, body: JSON.parse(text) as PageBody });
  }
  for (const v of Object.values(o)) pagesIn(v, from, into, seen);
}

function corpus(): Found[] {
  const into = new Map<string, Found>();
  pagesIn(Object.values(seed), 'seed', into);
  pagesIn(seed.pageDeclarations(), 'seed', into);
  pagesIn(seed.projectWithRunsOn(), 'seed', into);
  pagesIn(seed.agentsPackDocument(), 'seed', into);
  for (const id of seed.FIRST_PARTY) pagesIn(seed.firstPartyDocument(id), 'seed', into);
  for (const u of USE_CASES) {
    pagesIn(u, 'seed', into);
    pagesIn(useCaseDocument(u.usecase, '2026-09-25'), 'seed', into);
  }
  const packs = new URL('../../../packs/', import.meta.url);
  for (const dir of readdirSync(packs, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = new URL(`${dir.name}/${dir.name}.pack.json`, packs);
    if (existsSync(file)) pagesIn(JSON.parse(readFileSync(file, 'utf8')) as unknown, dir.name, into);
  }
  return [...into.values()];
}

const CORPUS = corpus();

test('the corpus holds the seed, the packs, and every page of the launch desk', () => {
  assert.ok(CORPUS.some((c) => c.from === 'seed'), 'no page was found in packages/seed');
  const desk = CORPUS.filter((c) => c.from === 'launch-desk').map((c) => c.body.page);
  for (const page of ['desk', 'part', 'numbers']) assert.ok(desk.includes(page), `the launch desk's ${page} page was not found`);
});

/** The round trip, and the bytes: what came back prints exactly as what went in. */
function roundTrip(body: PageBody): void {
  const text = dogText(body);
  const back = parseDog(text);
  if (!back.ok) assert.fail(`line ${String(back.line)}: ${back.fix}\n${text}`);
  assert.deepEqual(back.value, body);
  assert.equal(dogText(back.value), text);
}

for (const { from, body } of CORPUS) test(`round trip: ${from}, ${String(body.page)}`, () => roundTrip(body));

/* ── bodies built to break a careless printer ────────────────────────── */

/** A block with an own `__proto__` key, which only JSON can build: an object literal would set the prototype instead. */
const PROTO = JSON.parse('{"kind":"steps","__proto__":{"hidden":false},"short":{"where":"mark is next","label":"Now"},"odd key":[],"empty":"","row":"{{spoken}}"}') as PageBody;

const HARD: PageBody = {
  page: 'hard',
  title: '2024',
  icon: 'true',
  tone: 'null',
  for: { register: 'projects', where: 'state is open, doing' },
  nav: { section: 'Work: now', order: -10, tabs: true },
  layout: { rail: 4, sticky: true },
  requires: ['register.projects', 'register.a,b'],
  blocks: [
    { kind: 'note', lead: true, when: { metric: 'overdue', gt: 0 }, body: 'First line.\n\n  Indented third, with a trailing space \nlast\n' },
    {
      kind: 'table',
      heading: 'Open ',
      source: 'register.projects',
      where: { all: [{ field: 'state', in: ['open', 'doing'] }] },
      columns: [{ field: 'name' }, { field: 'due date' }, { field: 'amount', label: 'Amount', align: 'end' }, 'name', { field: '10' }],
      order: [{ field: 'due', dir: 'desc' }, { field: 'seq' }, { field: 'due date', dir: 'asc' }, { dir: 'asc', field: 'rank' }],
      limit: 50,
      empty: 'Nothing: "quoted", and a back\\slash.',
    },
    { kind: 'table', source: 'register.projects', columns: [{ field: 'due', tone_when: { before: 'today', tone: 'bad' } }], empty: 'None.' },
    { kind: 'cards', cells: [{ metric: 'a' }, { metric: 'b', label: 'B' }, 7], authored: [{ name: 'One', n: 1 }, { name: 'Two\nlines' }] },
    PROTO,
    { kind: 'note', body: 'tab\there\r\nand a carriage return' },
    { body: 'A block with no kind,\nso its first key is its text.' },
  ],
  origin: 'derived',
  derived_from: 'register.projects',
  zeta: [[1, 2], []],
  empty_set: {},
  notes: 'Two lines\nat the page level\n',
  'a.dotted key': 1.5e21,
};

test('round trip: text that reads as another type, commas and colons in lists, deep values and odd keys', () => roundTrip(HARD));

test('round trip: a page whose blocks are not a list of keys', () => {
  roundTrip({ page: 'empty', title: 'Empty', blocks: [] });
  roundTrip({ page: 'odd', title: 'Odd', blocks: [{}, { kind: 'note' }] });
});

test('the terse forms stay terse where they are exact', () => {
  const text = dogText(HARD);
  assert.match(text, /^ {4}columns: \[name, due date, \{ field: amount, label: Amount, align: end \}, "name", \{ field: "10" \}\]$/m);
  assert.match(text, /^ {4}order: \[due desc, seq, \{ field: due date, dir: asc \}, rank asc\]$/m);
  assert.match(text, /^ {4}cells: \[a, \{ metric: b, label: B \}, 7\]$/m);
  assert.match(text, /^title: "2024"$/m);
  assert.match(text, /^for: \{ register: projects, where: "state is open, doing" \}$/m);
  assert.ok(text.endsWith('\n'), 'the file ends with a line break');
});

test('a file saved with Windows line endings reads the same', () => {
  const back = parseDog(dogText(HARD).replace(/\n/g, '\r\n'));
  if (!back.ok) assert.fail(back.fix);
  assert.deepEqual(back.value, HARD);
});

test('a blank line an editor stripped the indent from is still inside the text', () => {
  const body: PageBody = { page: 'notes', title: 'Notes', blocks: [{ kind: 'note', body: 'first\n\nthird', heading: 'After' }] };
  const stripped = dogText(body).replace(/\n {6}\n/, '\n\n');
  assert.notEqual(stripped, dogText(body));
  const back = parseDog(stripped);
  if (!back.ok) assert.fail(back.fix);
  assert.deepEqual(back.value, body);
});

/* ── files the first version wrote ───────────────────────────────────── */

/** A file the first version printed, byte for byte, with every key it knew once each and no line break at the end. */
const FIRST_FULL = [
  'page: invoicing',
  'title: Invoicing',
  'for: { register: clients, where: state is active }',
  'nav: { section: Money, order: 20 }',
  'requires: [register.invoices, register.clients]',
  '',
  'blocks:',
  '  - kind: stat',
  '    heading: This quarter',
  '    cells: [invoiced-q, unpaid-90d]',
  '  - kind: table',
  '    heading: Open',
  '    span: 6',
  '    source: register.invoices',
  '    where: state is sent or part',
  '    columns: [seq, client, amount]',
  '    order: [due asc, seq desc]',
  '    limit: 50',
  '    empty: "Nothing outstanding."',
  '  - kind: gauge',
  '    source: metric.runway',
  '    target: 90',
  '    empty: "No runway figure yet."',
  '  - kind: note',
  '    heading: Reminder',
  '    body: |',
  '      Line one.',
  '      Line two, indented in the file but not in the note.',
  '      ',
  '      A blank line survives too.',
].join('\n');

test('a file the first version wrote reads as the page it was printed from', () => {
  const back = parseDog(FIRST_FULL);
  if (!back.ok) assert.fail(back.fix);
  assert.deepEqual(back.value, {
    page: 'invoicing',
    title: 'Invoicing',
    for: { register: 'clients', where: 'state is active' },
    nav: { section: 'Money', order: 20 },
    requires: ['register.invoices', 'register.clients'],
    blocks: [
      { kind: 'stat', heading: 'This quarter', cells: [{ metric: 'invoiced-q' }, { metric: 'unpaid-90d' }] },
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
      { kind: 'gauge', source: 'metric.runway', target: 90, empty: 'No runway figure yet.' },
      { kind: 'note', heading: 'Reminder', body: 'Line one.\nLine two, indented in the file but not in the note.\n\nA blank line survives too.' },
    ],
  });
});

test("the first version's odd forms are read as it meant them", () => {
  const back = parseDog(
    [
      'page: odd',
      'title: Odd',
      'for: { register: clients, where: name is Kiln, Ltd }',
      'nav: { section: Money, in and out, order: 5 }',
      'requires: []',
      '',
      'blocks:',
      '  - kind: table',
      '    heading: [Draft] clients',
      '    source: register.clients',
      '    order: [seq undefined]',
      '    empty: "Say "hello" first."',
    ].join('\n'),
  );
  if (!back.ok) assert.fail(back.fix);
  /* `requires: []` IS ABSENT AND NOT AN EMPTY LIST: the kernel refuses an empty `requires`, so the empty form meant
     that the page requires nothing. */
  assert.deepEqual(back.value, {
    page: 'odd',
    title: 'Odd',
    for: { register: 'clients', where: 'name is Kiln, Ltd' },
    nav: { section: 'Money, in and out', order: 5 },
    blocks: [{ kind: 'table', heading: '[Draft] clients', source: 'register.clients', order: [{ field: 'seq' }], empty: 'Say "hello" first.' }],
  });
});

test('refuses authored rows the first version only counted', () => {
  const out = parseDog(['page: x', 'title: X', 'requires: []', 'blocks:', '  - kind: cards', '    authored: 3 rows'].join('\n'));
  if (out.ok) assert.fail('a count of rows was read as rows');
  assert.match(out.fix, /authored rows/);
  assert.equal(out.line, 6);
});

/* ── refusals, each with its line ───────────────────────────────────── */

test('refuses a file with no page: line, at line 1', () => {
  const out = parseDog('title: Nothing\nblocks:\n');
  if (out.ok) assert.fail('a file with no page was read');
  assert.match(out.fix, /page: <id>/);
  assert.equal(out.line, 1);
});

test('refuses a list that does not close, naming its line', () => {
  const out = parseDog('page: x\ntitle: X\n\nblocks:\n  - kind: table\n    columns: [a, b\n    empty: None.\n');
  if (out.ok) assert.fail('an unclosed list was read');
  assert.match(out.fix, /columns/);
  assert.equal(out.line, 6);
});

test('refuses an order that is not a field and a direction', () => {
  const out = parseDog('page: x\ntitle: X\nblocks:\n  - kind: table\n    order: [due sideways]\n');
  if (out.ok) assert.fail('an order with no direction it knows was read');
  assert.match(out.fix, /asc or desc/);
  assert.equal(out.line, 5);
});

test('refuses a key written twice, and a block key with no block above it', () => {
  const twice = parseDog('page: x\ntitle: X\ntitle: Y\n');
  if (twice.ok) assert.fail('a key written twice was read');
  assert.equal(twice.line, 3);
  const orphan = parseDog('page: x\ntitle: X\nblocks:\n    heading: Lost\n');
  if (orphan.ok) assert.fail('a block key with no block was read');
  assert.equal(orphan.line, 4);
});

/* ── the name, and the record's answer ──────────────────────────────── */

test('the file is named after the page', () => {
  assert.equal(dogName('invoicing'), 'invoicing.dog');
});

test("the record's answer is read as the stored body, its version, and the template it came from", () => {
  const body: PageBody = { page: 'desk', title: 'Desk', blocks: [{ kind: 'note', body: 'Hello.' }] };
  assert.deepEqual(storedOf({ id: 'page.desk', version: 3, pack: null, body }, 'desk'), { body, version: 3, template: null });
  const project: PageBody = { page: 'project', title: '{{name}}', for: { register: 'things' }, blocks: [] };
  assert.deepEqual(storedOf({ id: 'page.project', version: 1, pack: 'portfolio', body: project }, 'kiln'), { body: project, version: 1, template: 'project' });
  const bad = storedOf({ id: 'page.desk', version: 3 }, 'desk');
  assert.ok('fix' in bad, 'an answer with no body was read as a source');
});
