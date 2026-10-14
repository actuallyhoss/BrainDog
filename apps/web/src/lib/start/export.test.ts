/**
 * "Point at an export": a file from another app read in the browser, mapped into one list by the model first and by
 * rules after, and turned into the entries the one press writes. Nothing here writes.
 *
 * THE MODEL IS A FAKE, and what is under test is what the first run does with a file and with an answer about it: a
 * bank's CSV, a Todoist CSV and a Trello board each land where a person would put them, a mapping that would leave an
 * entry without what its list requires is not used, and a list of the file's own is one the record would take.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateDeclaration } from '@braindog/kernel';

import type { AskMapping, MappingAsked, MappingReply } from './ask.ts';
import {
  byRules,
  csvCells,
  dayReader,
  entriesOf,
  exportLists,
  fileOfEntry,
  fromReply,
  inCurrency,
  jsonExports,
  leftSaid,
  mapExport,
  nameOfFile,
  newListDeclarations,
  numberOf,
  ownList,
  readExport,
  readExports,
  type Export,
} from './export.ts';

const BANK = '﻿Date,Description,Amount,Balance\r\n01/03/2026,TESCO STORES,-12.30,"1,000.00"\r\n02/03/2026,"SALARY, ACME",2500.00,3487.70\r\n15/03/2026,Netflix,-9.99,3477.71\r\n';
const TODOIST = 'TYPE,CONTENT,DESCRIPTION,PRIORITY,DATE\ntask,Buy flour,,1,2026-10-05\ntask,Call the bank,,4,\n';
const TRELLO = JSON.stringify({ name: 'Launch', cards: [{ name: 'Write the post', desc: 'x', due: '2026-10-09T10:00:00.000Z', labels: [{ name: 'urgent' }] }, { name: 'Ship it', due: null }], lists: [{ name: 'Todo' }] });

const read = (file: string, text: string): Export => {
  const e = readExport(file, text);
  assert.ok(!('why' in e), `${file} was not read`);
  return e;
};

test('A CSV IS READ AS A SPREADSHEET WRITES IT: quotes, commas inside them, CRLF, a byte-order mark, and its delimiter', () => {
  const bank = read('hsbc.csv', BANK);
  assert.deepEqual(bank.columns, ['Date', 'Description', 'Amount', 'Balance']);
  assert.equal(bank.entries.length, 3);
  assert.equal(bank.entries[1]?.Description, 'SALARY, ACME');
  assert.equal(bank.entries[0]?.Balance, '1,000.00');
  assert.deepEqual(csvCells('a;b\n"x;1";"say ""hi"""\n'), [
    ['a', 'b'],
    ['x;1', 'say "hi"'],
  ]);
  assert.deepEqual(csvCells('a\tb\n1\t2'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
  assert.deepEqual(readExport('empty.csv', 'just a heading\n'), { why: 'noEntries' });
  assert.deepEqual(readExport('broken.json', '{ nope'), { why: 'notJson' });
});

test('A JSON EXPORT IS READ WHERE ITS APP KEEPS ITS ENTRIES, and a nested thing by its name', () => {
  const board = read('trello.json', TRELLO);
  assert.equal(board.entries.length, 2, 'the cards, the largest list of things in the board');
  assert.equal(board.entries[0]?.labels, 'urgent');
  assert.equal(read('items.json', JSON.stringify([{ a: 1 }, { a: 2, b: true }])).columns.join(), 'a,b');
});

test('AN AMOUNT AND A DAY ARE READ AS THE FILE WROTE THEM', () => {
  assert.deepEqual(
    ['1.234,56', '(12.30)', '£1,200', '12.30-', 'EUR 5', '-9.99', '1,234', 'abc', ''].map(numberOf),
    [1234.56, -12.3, 1200, -12.3, 5, -9.99, 1234, null, null],
  );
  const dmy = dayReader(['01/03/2026', '15/03/2026'], 'en-US');
  assert.equal(dmy('01/03/2026'), '2026-03-01', 'a day over twelve in front says the whole column is day first');
  const mdy = dayReader(['03/15/2026'], 'en-GB');
  assert.equal(mdy('03/01/2026'), '2026-03-01');
  const unsaid = dayReader(['01/03/2026'], 'en-US');
  assert.equal(unsaid('01/03/2026'), '2026-01-03', "a column that never says is read the person's own way");
  assert.equal(dayReader([], 'en-GB')('9 Oct 2026'), '2026-10-09');
  assert.equal(dayReader([], 'en-GB')('Oct 9, 2026'), '2026-10-09');
  assert.equal(dayReader([], 'en-GB')('2026-02-30'), null, 'a day the calendar has not got');
});

test('AN AMOUNT IN ANOTHER CURRENCY IS NEVER STORED AS OURS: its entry is held back, not relabelled', () => {
  assert.equal(numberOf('-£12.30'), -12.3, 'a symbol after the sign');
  assert.equal(inCurrency('£12.30', 'GBP'), true);
  assert.equal(inCurrency('12.30', 'GBP'), true, 'a cell that names no currency is in the one chosen');
  assert.equal(inCurrency('12.30 USD', 'GBP'), false);
  assert.equal(inCurrency('$3.50', 'GBP'), false);
  assert.equal(inCurrency('$3.50', 'CAD'), true);
  assert.equal(inCurrency('€5', 'GBP'), false);
  const mixed = read('mixed.csv', 'Date,Description,Amount\n01/11/2026,Rent,-1200.00\n02/11/2026,Coffee,$3.50\n03/11/2026,Hotel,90.00 EUR\n');
  const mapping = byRules(mixed, exportLists(), 'en-GB');
  const own = ownList(mixed, mapping.name, 'GBP', 'en-GB');
  const out = entriesOf(mixed, mapping, 'GBP', 'en-GB', own);
  assert.equal(out.fields.length, 1);
  assert.deepEqual(out.fields[0]?.amount, { amount: -120000, currency: 'GBP' });
  assert.equal(out.skipped, 2, 'the dollars and the euros wait, said as held');
});

test('WITHOUT A MODEL, A FILE GOES WHERE ITS COLUMNS SAY: a to-do app into Tasks, a board into Tasks', () => {
  const lists = exportLists();
  assert.ok(!lists.some((l) => l.module === 'agents'), "the agents' lists take no file");
  assert.ok(!lists.some((l) => l.id === 'transactions'), 'a list that needs a link to another is not offered');

  const todo = byRules(read('todoist.csv', TODOIST), lists, 'en-GB');
  assert.equal(todo.list, 'tasks');
  assert.equal(todo.module, 'work');
  assert.deepEqual(todo.fields, [
    { column: 'CONTENT', field: 'what' },
    { column: 'DATE', field: 'by' },
  ]);
  const entries = entriesOf(read('todoist.csv', TODOIST), todo, null, 'en-GB');
  assert.deepEqual(entries, { register: 'tasks', fields: [{ what: 'Buy flour', by: '2026-10-05' }, { what: 'Call the bank' }], skipped: 0 });

  assert.equal(byRules(read('trello.json', TRELLO), lists, 'en-GB').list, 'tasks', 'a card with a due day is a task, not a person');
});

test('A FILE NO LIST HOLDS IS A LIST OF ITS OWN, one the record would take, with a page to read it on', () => {
  const bank = read('hsbc.csv', BANK);
  const m = byRules(bank, exportLists(), 'en-GB');
  assert.equal(m.list, null);
  const own = ownList(bank, 'HSBC', 'GBP', 'en-GB');
  assert.equal(own.id, 'hsbc');
  assert.deepEqual(
    own.fields.map((f) => `${f.id}:${f.type}`),
    ['date:day', 'description:text', 'amount:money', 'balance:money'],
  );
  assert.equal(own.title, 'description');
  for (const d of newListDeclarations(own, 'Your HSBC payments')) assert.equal(validateDeclaration(d as never), null, `${d.id} would be refused`);

  /* MONEY IS IN THE CURRENCY CHOSEN, AND WITH NONE AN AMOUNT IS A PLAIN NUMBER, never money without its currency. */
  assert.equal(ownList(bank, 'HSBC', null, 'en-GB').fields.find((f) => f.id === 'amount')?.type, 'decimal');
  const out = entriesOf(bank, m, 'GBP', 'en-GB', own);
  assert.equal(out.register, 'hsbc');
  assert.deepEqual(out.fields[0], { date: '2026-03-01', description: 'TESCO STORES', amount: { amount: -1230, currency: 'GBP' }, balance: { amount: 100000, currency: 'GBP' } });

  /* AN ID ALREADY TAKEN IS NOT TAKEN TWICE. */
  assert.equal(ownList(bank, 'Tasks', null, 'en-GB').id, 'tasks_2');
});

test('THE MODEL MAPS FIRST, held to the file and the list; a mapping that leaves out what a list requires is not used', async () => {
  const bank = read('bills.csv', 'Due,Bill,Amount\n2026-11-01,Rent,400.00\n2026-11-03,Water,35.10\n');
  const lists = exportLists();
  const good: MappingReply = {
    list: 'obligations',
    fields: [
      { column: 'Bill', field: 'what' },
      { column: 'Amount', field: 'amount' },
      { column: 'Due', field: 'due' },
      { column: 'Nope', field: 'note' },
    ],
    fixed: [
      { field: 'direction', value: 'owed_by_me' },
      { field: 'state', value: 'open' },
    ],
    summary: 'Your bills for November.',
    name: null,
    by: 'glm-5.3-flash',
  };
  const m = fromReply(good, bank, lists, 'en-GB');
  assert.equal(m.list, 'obligations');
  assert.equal(m.module, 'money-core');
  assert.equal(m.fields.length, 3, 'a column the file has not got is dropped');
  assert.equal(m.summary, 'Your bills for November.');
  const out = entriesOf(bank, m, 'GBP', 'en-GB');
  assert.deepEqual(out.fields[1], { what: 'Water', direction: 'owed_by_me', amount: { amount: 3510, currency: 'GBP' }, due: '2026-11-03', state: 'open' });
  assert.equal(entriesOf(bank, m, null, 'en-GB').skipped, 2, 'with no currency chosen an amount is not kept, and a bill needs one');

  /* WITHOUT THE DIRECTION A BILL REQUIRES, THE MAPPING IS NOT USED, and the rules map the file instead. */
  const thin = fromReply({ ...good, fixed: [] }, bank, lists, 'en-GB');
  assert.notEqual(thin.list, 'obligations');
  assert.equal(thin.by, 'rules');

  /* A LIST OF ITS OWN IS NAMED IN THEIR WORDS. */
  const own = fromReply({ ...good, list: null, name: 'Household bills' }, bank, lists, 'en-GB');
  assert.deepEqual([own.list, own.name, own.by], [null, 'Household bills', 'glm-5.3-flash']);
});

test('THE MODEL IS SHOWN THE FIRST ENTRIES AND NOTHING MORE, and its silence is the rules', async () => {
  const many = read('tasks.csv', `Task,Due\n${Array.from({ length: 30 }, (_, i) => `Thing ${i},2026-10-${String((i % 28) + 1).padStart(2, '0')}`).join('\n')}\n`);
  const asked: MappingAsked[] = [];
  const ask: AskMapping = async (a) => {
    asked.push(a);
    return { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'no model' } };
  };
  const m = await mapExport(many, ask, 'en-GB');
  assert.equal(asked[0]?.sample.length, 8);
  assert.ok(asked[0]?.lists.some((l) => l.id === 'tasks' && l.fields.some((f) => f.id === 'state' && f.values?.includes('open'))));
  assert.equal(m.by, 'rules');
  assert.equal(m.list, 'tasks');
  assert.equal((await mapExport(many, null, 'en-GB')).list, 'tasks');
});

test('A BIG EXPORT IS NEVER REFUSED AT THE DOOR: each value goes cut to what the engine reads, and a wide file sends fewer entries', async () => {
  const { cellSent } = await import('./export.ts');
  const notes = 'Ring the landlord about the boiler. '.repeat(40);
  const long = read('notes.csv', `Task,Notes\n${Array.from({ length: 12 }, (_, i) => `Thing ${i},"${notes}\n  ${'é'.repeat(200)}"`).join('\n')}\n`);
  const asked: MappingAsked[] = [];
  await mapExport(long, async (a) => (asked.push(a), { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'no model' } }), 'en-GB');
  const sent = asked[0];
  assert.ok(sent);
  assert.equal(sent.sample.length, 8);
  assert.ok(sent.sample.every((e) => new TextEncoder().encode(e.Notes ?? '').length <= 160 && !/\n|\s{2}/u.test(e.Notes ?? '')));
  assert.equal(sent.sample[0]?.Task, 'Thing 0');
  assert.ok(JSON.stringify(sent).length <= 32_000);
  /* NEVER CUT INSIDE A CHARACTER: é is two bytes, so 160 bytes of them is 80. */
  assert.equal(cellSent('é'.repeat(100)), 'é'.repeat(80));

  /* FORTY COLUMNS OF LONG TEXT ARE FAR PAST THE DOOR AT EIGHT ENTRIES, and go as fewer. */
  const heads = Array.from({ length: 40 }, (_, i) => `Column ${i}`);
  const wide = read('wide.csv', `${heads.join(',')}\n${Array.from({ length: 8 }, () => heads.map(() => 'x'.repeat(300)).join(',')).join('\n')}\n`);
  asked.length = 0;
  await mapExport(wide, async (a) => (asked.push(a), { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'no model' } }), 'en-GB');
  assert.ok(asked[0] && asked[0].sample.length >= 1 && asked[0].sample.length < 8);
  assert.ok(JSON.stringify(asked[0]).length <= 32_000);
});

test('THE PAGES ARE DRAWN OVER THE FILE ITSELF, and a list of its own is asked for beside them', async () => {
  const { drawnWith } = await import('./export.ts');
  const asked = [
    { to: { declarations: [{ id: 'register.tasks' }, { id: 'page.work' }] }, rows: { tasks: [{ what: 'An example' }], tracks: [{ name: 'x' }] } },
    { to: { declarations: [{ id: 'register.people' }] }, rows: {} },
  ];
  const mine = [{ what: 'Buy flour' }];
  const out = drawnWith(asked, 'tasks', mine, null);
  assert.deepEqual(out[0]?.rows, { tasks: mine, tracks: [{ name: 'x' }] }, 'the examples of that list give way to the file');
  assert.deepEqual(out[1], asked[1]);
  const own = drawnWith(asked, 'hsbc', mine, { declarations: [{ id: 'register.hsbc', kind: 'register', body: {} }] });
  assert.equal(own.length, 3);
  assert.deepEqual(own[2]?.rows, { hsbc: mine });
});

/* ── many lists from one file, and a zip of tables ─────────────────────── */

const NESTED = JSON.stringify([
  { id: 'r1', list: 'tasks', tag: { id: 't1', name: 'urgent', color: 'red' }, fields: { id: 'f1', title: 'Fix the gate', status: 'open', due: '2026-10-20', owner: { name: 'Lina Corvo' }, blank: '' } },
  { id: 'r2', list: 'tasks', tag: null, fields: { id: 'f2', title: 'Paint the shed', status: 'done', due: null, owner: null, blank: null } },
  { id: 'r3', list: 'tasks', fields: { id: 'f3', title: 'Order seeds', status: 'open', due: '2026-11-02' } },
]);
const FOUR = JSON.stringify({
  exported: '2026-09-25',
  projects: [{ name: 'Orchard' }, { name: 'Kiln' }],
  accounts: [{ name: 'Savings', currency: 'EUR' }, { name: 'Daily', currency: 'EUR' }, { name: 'Travel', currency: 'GBP' }],
  tasks: Array.from({ length: 5 }, (_, i) => ({ title: `Task ${i + 1}`, due: `2026-10-0${i + 1}` })),
  people: { known: [{ name: 'Tomas Brell', email: 'tomas@example.test' }] },
});
const MIXED = JSON.stringify([
  ...['Orchard', 'Kiln'].map((name) => ({ kind: 'project', name })),
  ...['Prune the trees', 'Fire the pots', 'Sweep the yard'].map((name) => ({ kind: 'task', name, due: '2026-10-10' })),
]);

test('A MAP OF AN ENTRY’S OWN FIELDS OPENS INTO COLUMNS; a small named thing stays one cell, and an empty column is not offered', () => {
  const tasks = read('tasks.json', NESTED);
  assert.deepEqual(tasks.columns, ['id', 'list', 'tag', 'fields id', 'title', 'status', 'due', 'owner']);
  assert.deepEqual(tasks.entries[0], { id: 'r1', list: 'tasks', tag: 'urgent', 'fields id': 'f1', title: 'Fix the gate', status: 'open', due: '2026-10-20', owner: 'Lina Corvo' });
  assert.equal(tasks.entries[2]?.owner, '', 'a key one entry leaves out is an empty cell');
  const mapped = byRules(tasks, exportLists(), 'en-GB');
  assert.equal(mapped.list, 'tasks');
  assert.ok(mapped.fields.some((m) => m.column === 'title' && m.field === 'what'), 'the opened title fills what a task is');
  assert.deepEqual(jsonExports(JSON.parse(NESTED), 'tasks.json').exports, [tasks], 'one list reads as readExport reads it');
});

test('ONE OBJECT HOLDING FOUR ARRAYS IS FOUR LISTS, each named from its key, the largest first', () => {
  const got = jsonExports(JSON.parse(FOUR), 'everything.json');
  assert.deepEqual(got.exports.map((e) => [e.file, e.entries.length]), [['tasks', 5], ['accounts', 3], ['projects', 2], ['known', 1]]);
  assert.equal(got.arrays, 0);
  assert.equal(nameOfFile(got.exports[1]!.file), 'Accounts');
  assert.equal(read('everything.json', FOUR).entries.length, 5, 'readExport still answers the largest one alone');
  const wide = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`list${i}`, Array.from({ length: i + 1 }, (_, j) => ({ name: `Entry ${j}` }))]));
  const most = jsonExports(wide);
  assert.equal(most.exports.length, 8);
  assert.equal(most.arrays, 3, 'the three smallest are left out, and counted');
  assert.equal(most.exports[0]?.file, 'list10');
});

test('ONE ARRAY OF MIXED KINDS IS ONE LIST A KIND, and a key every entry fills differently is not a kind', () => {
  const got = jsonExports(JSON.parse(MIXED), 'mine.json');
  assert.deepEqual(got.exports.map((e) => [e.file, e.columns, e.entries.length]), [['task', ['name', 'due'], 3], ['project', ['name'], 2]]);
  const unique = jsonExports([{ type: 'a', n: 1 }, { type: 'b', n: 2 }, { type: 'c', n: 3 }], 'odd.json');
  assert.deepEqual(unique.exports.map((e) => [e.file, e.entries.length]), [['odd.json', 3]]);
});

/** A zip with every file stored as it is, written here by hand (`zip.test.ts` writes deflated ones too). */
function storedZip(files: Record<string, string>): Uint8Array {
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let at = 0;
  for (const [path, body] of Object.entries(files)) {
    const name = new TextEncoder().encode(path);
    const data = new TextEncoder().encode(body);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint32(18, data.byteLength, true);
    local.setUint32(22, data.byteLength, true);
    local.setUint16(26, name.byteLength, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint32(20, data.byteLength, true);
    central.setUint32(24, data.byteLength, true);
    central.setUint16(28, name.byteLength, true);
    central.setUint32(42, at, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    directory.push(new Uint8Array(central.buffer), name);
    at += 30 + name.byteLength + data.byteLength;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, directory.length / 2, true);
  end.setUint16(10, directory.length / 2, true);
  end.setUint32(12, directory.reduce((n, d) => n + d.byteLength, 0), true);
  end.setUint32(16, at, true);
  const all = [...parts, ...directory, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, a) => n + a.byteLength, 0));
  all.reduce((p, a) => (out.set(a, p), p + a.byteLength), 0);
  return out;
}

const ID = '0123456789abcdef0123456789abcdef';

test('A WORKSPACE ZIP IS ONE LIST A TABLE, each named without its id, and its pages are counted and said, never written', async () => {
  const zip = storedZip({
    'Workspace/': '',
    [`Workspace/Tasks ${ID}.csv`]: 'Name,Status,Due\nFix the gate,Open,2026-10-20\nPaint the shed,Done,\nOrder seeds,Open,2026-11-02\n',
    [`Workspace/Contacts ${ID}.csv`]: 'Name,Email\nLina Corvo,lina@example.test\n',
    [`Workspace/Garden plans ${ID}.md`]: '# Garden plans\n\nBeans by the fence.\n',
    [`Workspace/Garden plans/Kiln notes ${ID}.md`]: '# Kiln notes\n',
    'Workspace/Read me.html': '<p>Hello</p>',
    'Workspace/cover.png': 'not a picture',
    '__MACOSX/Workspace/._Tasks.csv': 'x',
  });
  const got = await readExports('Export-workspace.zip', zip);
  assert.ok('exports' in got, 'the zip was read');
  assert.deepEqual(got.exports.map((e) => [e.file, e.entries.length]), [['Tasks.csv', 3], ['Contacts.csv', 1]]);
  assert.deepEqual(got.exports[0]?.columns, ['Name', 'Status', 'Due']);
  assert.deepEqual(got.left, { pages: 3, tables: 0, arrays: 0 });
  assert.equal(leftSaid(got.left), '3 pages of notes were left out.');
  assert.equal(nameOfFile(got.exports[0]!.file), 'Tasks');
  assert.equal(fileOfEntry(`A/B/Plans ${ID}.json`), 'Plans.json');
  assert.equal(fileOfEntry('Plans 2026.csv'), 'Plans 2026.csv', 'only an id is cut, never a name');
});

test('A ZIP OF ONLY PAGES, MORE THAN EIGHT TABLES, AND ONE PLAIN FILE each say what they brought', async () => {
  const pages = await readExports('notes.zip', storedZip({ 'A.md': '# A', 'B.md': '# B' }));
  assert.deepEqual(pages, { why: 'That zip holds 2 pages of notes and no table; export the database as CSV and bring that.' });
  const tables = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`T${i}.csv`, `Name\n${Array.from({ length: i + 1 }, (_, j) => `Entry ${j}`).join('\n')}\n`]));
  const many = await readExports('tables.zip', storedZip({ ...tables, 'Empty.csv': 'Name\n', 'many.json': FOUR }));
  assert.ok('exports' in many);
  assert.equal(many.exports.length, 8);
  assert.equal(many.exports[0]?.file, 'T9.csv');
  assert.ok(many.exports.some((e) => e.file === 'tasks'), 'the largest list in the JSON file is among the eight');
  assert.deepEqual(many.left, { pages: 0, tables: 4, arrays: 3 }, 'three tables past eight and the empty one; three smaller lists of the JSON file');
  assert.equal(leftSaid(many.left), '4 more tables were left out and 3 more lists in a file were left out.');
  const bank = await readExports('hsbc.csv', new TextEncoder().encode(BANK));
  assert.deepEqual(bank, { exports: [read('hsbc.csv', BANK)], left: { pages: 0, tables: 0, arrays: 0 } }, 'one plain file reads as readExport reads it');
  assert.deepEqual(await readExports('broken.json', new TextEncoder().encode('{ nope')), { why: 'notJson' });
  const four = await readExports('everything.json', new TextEncoder().encode(FOUR));
  assert.ok('exports' in four && four.exports.length === 4, 'a JSON file of several lists gives each');
  assert.equal(leftSaid({ pages: 0, tables: 0, arrays: 0 }), null);
});
