/**
 * An automation written as a sentence is read by plain patterns into the body the record installs, and read back in the
 * person's words. The world is made up here (no list is known by an id the code spells), and a sentence the patterns cannot
 * read says why instead of guessing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSentence, type SentenceWorld } from '../src/sentence.ts';

const world: SentenceWorld = {
  lists: [
    {
      id: 'dues',
      name: 'Dues',
      one: 'bill',
      title: 'what',
      state: 'state',
      fields: [
        { id: 'what', type: 'text' },
        { id: 'due', type: 'day' },
        { id: 'state', type: 'enum', values: ['open', 'paid'] },
        { id: 'sort', type: 'enum', label: 'Category', values: ['home', 'personal'] },
      ],
    },
    {
      id: 'jobs',
      name: 'Jobs',
      title: 'name',
      fields: [
        { id: 'name', type: 'text' },
        { id: 'lane', type: 'enum', values: ['todo', 'doing', 'done'] },
      ],
    },
  ],
  doors: [{ id: 'cardtexts', name: 'Card texts', register: 'dues' }],
};

const ok = (text: string) => {
  const got = parseSentence(text, world, 'x');
  assert.equal(got.ok, true, got.ok ? '' : got.why);
  return got as Extract<typeof got, { ok: true }>;
};

test('a date coming up reads as an inline rule that fires once per row and date', () => {
  const got = ok('When a bill is due in 3 days, tell me');
  assert.equal(got.body.register, 'dues');
  assert.equal(got.body.when, 'due after yesterday, due before +4d');
  assert.deepEqual(got.body.once_per, ['entry', 'due']);
  assert.equal(got.said, 'When a bill is due in 3 days, tell me.');
  assert.deepEqual(got.replay, { kind: 'time', register: 'dues', field: 'due', within: 3, where: '' });
});

test('weeks count as seven days and overdue looks backwards', () => {
  assert.equal(ok('when a bill is due within 2 weeks, tell me').body.when, 'due after yesterday, due before +15d');
  assert.equal(ok('When a bill is overdue, tell me').body.when, 'due before today');
});

test('a new row is a written trigger on create only', () => {
  const got = ok('When a new job is added to Jobs where lane is todo, tag it urgent');
  assert.deepEqual(got.body.on, { written: { register: 'jobs', op: ['create'] } });
  assert.equal(got.body.when, 'lane is todo');
  assert.deepEqual(got.body.steps, [{ tag: 'urgent' }]);
  assert.deepEqual(got.replay, { kind: 'written', register: 'jobs', op: 'create', where: 'lane is todo' });
});

test('a change reads once for each row and says so', () => {
  const got = ok('When a job is changed, tell me');
  assert.deepEqual(got.body.on, { written: { register: 'jobs', op: ['update'] } });
  assert.ok(got.notes.some((n) => n.includes('once for each')));
});

test('an arrival from a sender matches the sender anywhere and files under a value the door list holds', () => {
  const got = ok('When a card text from HSBC arrives, file it under Personal');
  assert.deepEqual(got.body.on, { arrival: { ingest: 'cardtexts' } });
  assert.equal(got.body.when, 'from contains HSBC, or subject contains HSBC, or body contains HSBC');
  assert.deepEqual(got.body.steps, [{ set: { field: 'sort', to: 'personal' } }]);
  assert.equal(got.said, 'When a card text from HSBC arrives at Card texts, file it under Personal.');
});

test('two actions are split where another verb follows', () => {
  const got = ok('When a job is added, tag it new and tell me');
  assert.deepEqual(got.body.steps, [{ tag: 'new' }, { notify: { say: 'New job {{name}}.' } }]);
});

test('a sentence the patterns cannot read says what they can', () => {
  const nothing = parseSentence('Make my life easier', world);
  assert.equal(nothing.ok, false);
  const unknown = parseSentence('When a spaceship is added, tell me', world);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.ok(unknown.why.includes('spaceship'));
  const nowhere = parseSentence('When a job is added', world);
  assert.equal(nowhere.ok, false);
});

test('a condition naming no field is refused rather than matching everything', () => {
  const got = parseSentence('When a job is added where colour is red, tell me', world);
  assert.equal(got.ok, false);
});

test('a noun finds a list by any one word of its name, so the box example reads on Bills and invoices', () => {
  const named: SentenceWorld = {
    lists: [
      { id: 'obligations', name: 'Bills and invoices', one: 'item', title: 'what', fields: [{ id: 'what', type: 'text' }, { id: 'due', type: 'day' }] },
      { id: 'transactions', name: 'Ledger', one: 'entry', title: 'what', fields: [{ id: 'what', type: 'text' }, { id: 'on', type: 'day' }] },
    ],
    doors: [],
  };
  const got = parseSentence('When a bill is due in 3 days, tell me', named, 'x');
  assert.equal(got.ok, true, got.ok ? '' : got.why);
  assert.equal(got.ok && got.body.register, 'obligations');
  /* AND IT IS SAID BACK AS IT WAS WRITTEN: "a bill", never the list's "a item". */
  assert.equal(got.ok && got.said, 'When a bill is due in 3 days, tell me.');
  const refused = parseSentence('When a widget is due in 3 days, tell me', named, 'x');
  assert.equal(refused.ok, false);
  assert.equal(!refused.ok && refused.why, 'I could not tell which list "widget" is. Use its name, such as Bills and invoices.');
});
