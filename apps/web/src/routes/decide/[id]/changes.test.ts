/**
 * What a `rowset` proposal draws on Decide: a diff for prose, a before and after for the rest, and
 * nothing for a row it would create.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diffRows } from 'braindog-render';

import { REGISTERS, display } from '../../../lib/record/api.ts';
import { ROWS } from '../../../lib/record/fixtures/sample.ts';
import { QUESTIONS, ROWSETS } from '../../../lib/record/fixtures/sample.ts';
import { LONG, isLong, updatesOf } from './changes.ts';

const registers = {
  notes: {
    title: 'name',
    fields: [
      { id: 'name', type: 'text' },
      { id: 'body', type: 'document', label: 'Body' },
      { id: 'lane', type: 'enum', label: 'Status' },
      { id: 'blurb', type: 'text' },
    ],
  },
};
const rows = { notes: [{ seq: 1, version: 3, fields: { name: 'Kiln', body: 'one\ntwo\nthree', lane: 'building', blurb: 'short' } }] };
const show = (_: string, __: string, v: unknown) => (v === undefined || v === null ? null : String(v));

test('a document field is drawn with the render package diff, and any other field before and after', () => {
  const [u] = updatesOf(
    { register: 'notes', rows: [{ at: 'notes#1', version: 3, patch: { body: 'one\n2\nthree', lane: 'earning' } }] },
    registers,
    rows,
    show,
  );
  assert.ok(u);
  assert.equal(u.title, 'Kiln');
  const [body, lane] = u.changes;
  assert.ok(body?.long);
  assert.deepEqual(body.block.rows.map((r) => r.cells[0]), diffRows('one\ntwo\nthree', 'one\n2\nthree'));
  assert.equal(body.block.kind, 'diff');
  assert.deepEqual(lane, { field: 'lane', label: 'Status', long: false, before: 'building', after: 'earning' });
});

test('a text is prose once it spans lines or runs long', () => {
  assert.equal(isLong('text', 'short', 'shorter'), false);
  assert.equal(isLong('text', 'a', 'a\nb'), true);
  assert.equal(isLong('text', 'x'.repeat(LONG + 1), 'y'), true);
  assert.equal(isLong('document', '', ''), true);
  assert.equal(isLong('enum', 'x'.repeat(500), 'y'), false);
});

test('a row it would create, a row the record does not hold and a field that would not move draw nothing', () => {
  const out = updatesOf(
    {
      register: 'notes',
      rows: [
        { name: 'A new one' },
        { at: 'notes#9', version: 1, patch: { lane: 'earning' } },
        { at: 'notes#1', version: 3, patch: { blurb: 'short' } },
      ],
    },
    registers,
    rows,
    show,
  );
  assert.deepEqual(out, []);
  assert.deepEqual(updatesOf(undefined, registers, rows, show), []);
});

test('THE SAMPLE PROPOSAL CHANGES A DOCUMENT AND A STATUS, on an open question the queue shows', () => {
  const q = QUESTIONS.find((x) => ROWSETS[x.id]);
  assert.ok(q, 'no open question carries rows');
  const updates = updatesOf(ROWSETS[q.id], REGISTERS, ROWS, (r, f, v) => display(r, f, v));
  const kinds = updates.flatMap((u) => u.changes.map((c) => c.long));
  assert.ok(kinds.includes(true), 'no field is drawn as a diff');
  assert.ok(kinds.includes(false), 'no field is drawn before and after');
  for (const u of updates) for (const c of u.changes) if (c.long) assert.ok(c.block.rows.some((r) => /^[-+] /u.test(r.cells[0] ?? '')), `${u.at} ${c.field} diffs to no change`);
});

test('an instant the formatter left alone reads as a day', async () => {
  const { dated } = await import('./changes.ts');
  assert.equal(dated('2026-09-16T15:23:18.843Z'), '16 Sep 2026');
  assert.equal(dated('people#2'), 'people#2');
  assert.equal(dated(null), null);
});

test('a typed token in a diffed field reads as what it draws, and one that does not parse stays', async () => {
  const { diffBlock, filled } = await import('./changes.ts');
  assert.equal(filled('Target {{money:1840000 GBP}} by May'), 'Target GBP 18,400.00 by May');
  assert.equal(filled('{{money:12 gbp}}'), '{{money:12 gbp}}');
  const lines = diffBlock('Raise {{money:1840000 GBP}}\nkeep', 'Raise {{money:2000000 GBP}}\nkeep').rows.map((r) => r.cells[0] ?? '');
  assert.ok(lines.every((l) => !l.includes('{{')), lines.join(' | '));
});

test('THE SAMPLE DIFFS DRAW NO RAW TOKEN', () => {
  for (const q of QUESTIONS) {
    for (const u of updatesOf(ROWSETS[q.id], REGISTERS, ROWS, (r, f, v) => display(r, f, v))) {
      for (const c of u.changes) if (c.long) for (const r of c.block.rows) assert.ok(!/\{\{/u.test(r.cells[0] ?? ''), `${q.id} ${u.at}: ${r.cells[0]}`);
    }
  }
});

/* WHAT A CHANGE TAKES IN. The lists are named for nothing the product has, so the reading is by field types alone: a
   list of refs on the changed row, and on the list it points at, the title and the first other text a row must have. */
const guides = {
  manuals: {
    title: 'name',
    fields: [
      { id: 'name', type: 'text' },
      { id: 'body', type: 'document', label: 'Text' },
      { id: 'rev', type: 'int', label: 'Version' },
      { id: 'drawn_from', type: 'list', of: 'ref', to: 'findings', label: 'Drawn from' },
    ],
  },
  findings: {
    title: 'said',
    fields: [
      { id: 'said', type: 'text', required: true },
      { id: 'note', type: 'text' },
      { id: 'taught_by', type: 'text', required: true },
    ],
  },
};
const OLD = '01HZX0000000000000000000A1';
const held = {
  manuals: [{ id: '01HZX0000000000000000000M3', seq: 3, version: 4, fields: { name: 'deploy', body: 'Ship it.\nWatch it.', rev: 3, drawn_from: [OLD] } }],
  findings: [
    { id: OLD, seq: 4, version: 1, fields: { said: 'Tail the logs after a deploy', taught_by: 'An error sat unseen for a day because nobody looked.' } },
    { id: '01HZX0000000000000000000A2', seq: 12, version: 1, fields: { said: 'Run the migration before the deploy', taught_by: 'The site answered 500 for ten minutes while the table was missing.' } },
    { id: '01HZX0000000000000000000A3', seq: 13, version: 1, fields: { said: 'Say the version in the commit', taught_by: '' } },
  ],
};
const next = (drawn_from: unknown, more: Record<string, unknown> = { body: 'Migrate first.\nShip it.\nWatch it.', rev: 4 }) =>
  updatesOf({ register: 'manuals', rows: [{ at: 'manuals#3', version: 4, patch: { ...more, drawn_from } }] }, guides, held, show);

test('a change to a long text that adds refs says what it takes in, by the rows’ own words and in the order added', () => {
  const [u] = next([OLD, 'FD13', 'findings#12']);
  assert.ok(u?.takes);
  assert.deepEqual(u.takes, {
    said: [
      { title: 'Say the version in the commit', why: null },
      { title: 'Run the migration before the deploy', why: 'The site answered 500 for ten minutes while the table was missing.' },
    ],
    closed: 0,
  });
  /* The diff and the version are still there, and the list of refs is not drawn a second time as handles. */
  assert.deepEqual(u.changes.map((c) => c.field), ['body', 'rev']);
});

test('a ref the reader cannot open is counted, never named', async () => {
  const { closedSaid } = await import('./changes.ts');
  const [u] = next([OLD, 'FD12', 'FD77', 'FD78']);
  assert.equal(u?.takes?.said.length, 1);
  assert.equal(u?.takes?.closed, 2);
  assert.equal(closedSaid(1, 1), 'One more you cannot open');
  assert.equal(closedSaid(2, 1), '2 more you cannot open');
  assert.equal(closedSaid(1, 0), 'One you cannot open');
  assert.equal(closedSaid(3, 0), '3 you cannot open');
});

test('no added ref answers no takes, and a ref taken away keeps its own line', () => {
  assert.equal(next([OLD])[0]?.takes, undefined);
  assert.equal(next(undefined)[0]?.takes, undefined);
  /* The same row said by its handle is not an addition. */
  assert.equal(next(['FD4'])[0]?.takes, undefined);
  const [swap] = next(['FD12']);
  assert.equal(swap?.takes?.said.length, 1);
  assert.ok(swap?.changes.some((c) => c.field === 'drawn_from'), 'a ref taken away is still said');
});

test('refs added with no long text beside them are a plain change, and so are refs to a list nobody handed', () => {
  const [plain] = next([OLD, 'FD12'], { rev: 4 });
  assert.equal(plain?.takes, undefined);
  assert.ok(plain?.changes.some((c) => c.field === 'drawn_from'));
  const [blind] = updatesOf(
    { register: 'manuals', rows: [{ at: 'manuals#3', version: 4, patch: { body: 'New.\nText.', drawn_from: [OLD, 'FD12'] } }] },
    { manuals: guides.manuals },
    { manuals: held.manuals },
    show,
  );
  assert.equal(blind?.takes, undefined);
  assert.ok(blind?.changes.some((c) => c.field === 'drawn_from'));
});

test('nothing in what a change takes in holds an id or a handle', () => {
  const [u] = next([OLD, 'FD13', 'findings#12', 'FD77', '01HZX0000000000000000000ZZ']);
  const said = JSON.stringify(u?.takes);
  assert.doesNotMatch(said, /[0-9A-HJKMNP-TV-Z]{26}/u);
  assert.doesNotMatch(said, /\b[A-Z]{1,4}\d+\b|#\d+|findings|manuals/u);
});

test('the words over what a change takes in are plain, with no dash a person would read as a pause', async () => {
  const { words } = await import('./changes.ts');
  assert.equal(words.takes, 'Why: what was learned');
  for (const w of Object.values(words)) assert.doesNotMatch(String(w), /—|–/u);
});

/* A scope question, as `proposeScopes` files one: each row moves to a project, and `why` says why, led by its title. */
const keys = {
  title: 'label',
  fields: [
    { id: 'label', type: 'text' },
    { id: 'project', type: 'ref', to: 'projects', label: 'Where it applies', scope: { inherit: false } },
  ],
};
const runs = { title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'project', type: 'ref', to: 'projects', label: 'Where it applies', scope: { inherit: false } }] };
const scoped = {
  keys: [
    { id: '01J0000000000000000000KEY4', seq: 4, version: 2, fields: { label: 'Deploy token', project: null } },
    { seq: 5, version: 1, fields: { label: 'Mail key', project: null } },
  ],
  runs: [{ seq: 2, version: 1, fields: { name: 'Nightly build', project: null } }],
};

test('EACH ROW OF A SCOPE QUESTION SAYS WHY IT MOVES: its own reason, with the title it was led by cut', async () => {
  /* ONE OF `fixtures/names.ts`'s invented projects, written here: a file under `src/` may not reach out of `apps/web`
     by a relative path (`graph`, 31 §3 layer 3). */
  const PROJECTS = ['Lanternfish'] as const;
  const out = updatesOf(
    {
      register: 'keys',
      rows: [
        { at: 'keys#4', version: 2, patch: { project: 'projects#1' } },
        { at: 'keys#5', version: 1, patch: { project: 'projects#2' } },
        { at: 'runs#2', version: 1, register: 'runs', patch: { project: 'projects#1' } },
      ],
      why: [
        { text: `Deploy token: used by 3 runs in ${PROJECTS[0]}.`, at: 'keys#4' },
        { text: `Nightly build: started from ${PROJECTS[0]} twice.`, at: 'runs#2' },
      ],
    },
    { keys, runs },
    scoped,
    () => null,
  );
  assert.deepEqual(
    out.map((u) => [u.at, u.title, u.why]),
    [
      ['keys#4', 'Deploy token', `used by 3 runs in ${PROJECTS[0]}.`],
      ['keys#5', 'Mail key', undefined],
      ['runs#2', 'Nightly build', `started from ${PROJECTS[0]} twice.`],
    ],
  );
  assert.equal(Object.hasOwn(out[1]!, 'why'), false, 'a row with no reason draws none');
});

test('a reason is matched to its row by the row’s internal id or its number, never across lists, and one not led by the title is kept whole', () => {
  const out = updatesOf(
    {
      register: 'keys',
      rows: [
        { at: '01J0000000000000000000KEY4', version: 2, patch: { project: 'projects#1' } },
        { at: 'keys#5', version: 1, patch: { project: 'projects#2' } },
      ],
      why: [
        { text: 'Deploy token: named in two notes.', at: '01J0000000000000000000KEY4' },
        { text: 'Seen in one project only.', at: 'keys#05' },
        { text: 'Mail key: a run of another list.', at: 'runs#5' },
      ],
    },
    { keys, runs },
    scoped,
    () => null,
  );
  assert.deepEqual(out.map((u) => u.why), ['named in two notes.', 'Seen in one project only.']);
});

test('the words for the reasons the queue’s card leaves out count them plainly', async () => {
  const { moreReasons } = await import('./changes.ts');
  assert.equal(moreReasons(1), 'and one more reason');
  assert.equal(moreReasons(51), 'and 51 more reasons');
});

test('a note is read as the note: the place it moves, under its heading, and the words it adds', async () => {
  const { noteChangeOf, notePartsOf, phraseSaid } = await import('./changes.ts');
  const before = '# Kiln\n\nEarning, licensed direct. {{money:1840000 GBP}} in the last twelve months.\n\n## Money\n\n```bar | By channel\nDirect | 11200\n```\n';
  const after = before.replace('licensed direct.', 'licensed direct and through two resellers.');
  assert.deepEqual(notePartsOf(before), ['# Kiln', 'Earning, licensed direct. {{money:1840000 GBP}} in the last twelve months.', '## Money', '```bar | By channel\nDirect | 11200\n```']);
  const note = noteChangeOf(before, after, 'Kiln', undefined, 'GBP');
  assert.equal(note.said, 'Adds “and through two resellers”');
  assert.equal(note.parts.length, 1);
  /* The heading is the row's own name, drawn over it already. */
  assert.equal(note.parts[0]!.under, null);
  assert.equal(note.parts[0]!.before.length, 1);
  assert.equal(note.parts[0]!.after.length, 1);
  assert.equal(noteChangeOf(before, after, 'Other').parts[0]!.under, 'Kiln');
  assert.equal(phraseSaid('Pay £5 now.', 'Pay now.'), 'Takes out “£5”');
  assert.equal(phraseSaid('Ship in May.', 'Ship in June.'), 'Changes “May” to “June”');
  /* No figure is said with its code where the record keeps pounds. */
  assert.equal(phraseSaid('Raised.', 'Raised {{money:1840000 GBP}}.', undefined, 'GBP'), 'Adds “£18,400”');
  assert.equal(noteChangeOf('# A\n\none\n\ntwo', '# A\n\nuno\n\ntwo\n\nthree').said, 'Changes 2 places');
});
