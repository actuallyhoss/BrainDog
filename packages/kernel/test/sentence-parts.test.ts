/**
 * A sentence read back in pieces a person can press, reminders on Today, and the record's one door. The world is made up
 * here: no list is known by an id the code spells.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSentence, type SentenceParts, type SentenceWorld } from '../src/sentence.ts';

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

const ok = (text: string, at: SentenceWorld = world) => {
  const got = parseSentence(text, at, 'x');
  assert.equal(got.ok, true, got.ok ? '' : got.why);
  return got as Extract<typeof got, { ok: true }>;
};

const rebuilt = (parts: SentenceParts): string => `When ${parts.trigger.map((p) => p.text).join('')}, ${parts.actions.join(' and ')}.`;

test('the pieces join back into the sentence that was read', () => {
  for (const text of [
    'When a bill is due in 3 days, tell me',
    'When a new bill is added to Dues where state is open, tag it urgent',
    'When a card text from HSBC arrives at Card texts, file it under personal',
    'When a bill is overdue where state is open, mark it paid and tell me',
  ]) {
    const got = ok(text);
    assert.equal(rebuilt(got.parts), got.said, text);
  }
});

test('every alternative a piece offers reads back as a sentence', () => {
  const got = ok('When a new bill is added to Dues where state is open, tell me');
  assert.ok(got.parts.trigger.filter((p) => p.options !== undefined).length >= 3);
  for (const part of got.parts.trigger) {
    for (const option of part.options ?? []) {
      const next = got.parts.trigger.map((p, at) => (at in option.set ? option.set[at]! : p.text)).join('');
      const again = parseSentence(`When ${next}, tell me`, world, 'x');
      assert.equal(again.ok, true, `${option.label} -> ${next}`);
    }
  }
});

test('changing the days of a date keeps the list and moves the window', () => {
  const got = ok('When a bill is due in 3 days, tell me');
  const at = got.parts.trigger.findIndex((p) => p.kind === 'timing');
  const week = got.parts.trigger[at]!.options!.find((o) => o.label === 'is due in 7 days')!;
  const next = parseSentence(`When a bill ${week.set[at]}, tell me`, world, 'x');
  assert.equal(next.ok && next.body.when, 'due after yesterday, due before +8d');
});

test('swapping the event word also fixes the article', () => {
  const got = ok('When a new bill is added to Dues, tell me');
  const timing = got.parts.trigger.find((p) => p.kind === 'timing')!;
  assert.equal(timing.options!.find((o) => o.label === 'changed in')!.set[0], 'a ');
  assert.equal(timing.options!.find((o) => o.label === 'added to')!.set[0], 'a new ');
});

test('a lone condition can be taken away and its join goes with it', () => {
  const got = ok('When a new bill is added to Dues where state is open, tell me');
  const cond = got.parts.trigger.find((p) => p.kind === 'condition')!;
  const gone = cond.options!.find((o) => o.label === 'No condition')!;
  assert.equal(Object.keys(gone.set).length, 2);
  assert.ok(Object.values(gone.set).every((t) => t === ''));
});

test('a closed word offers its values and the actions come from the list', () => {
  const got = ok('When a new bill is added to Dues where state is open, tell me');
  const cond = got.parts.trigger.find((p) => p.kind === 'condition')!;
  assert.ok(cond.options!.some((o) => o.label === 'state is paid'));
  const texts = got.parts.options.map((o) => o.text);
  for (const text of ['mark it paid', 'set Category to personal', 'tell me on Today']) assert.ok(texts.includes(text), text);
});

test('every action alternative reads back as an action', () => {
  const got = ok('When a bill is due in 3 days, tell me');
  for (const option of got.parts.options) assert.equal(parseSentence(`When a bill is due in 3 days, ${option.text}`, world, 'x').ok, true, option.text);
});

test('several actions keep their order in the pieces', () => {
  assert.deepEqual(ok('When a bill is due in 3 days, tell me and tag it urgent').parts.actions, ['tell me', 'tag it urgent']);
});

test('remind me on Today puts a reminder tone on the notice and says so', () => {
  const got = ok('When a bill is due in 3 days, remind me on Today');
  assert.deepEqual(got.body.once_per, ['entry', 'due']);
  const step = (got.body.then as unknown as { notify: { tone?: string } }[])[0]!;
  assert.equal(step.notify.tone, 'today');
  assert.equal(got.said, 'When a bill is due in 3 days, tell me on Today.');
  assert.deepEqual(got.notes, []);
});

test('any other place is still only the notices, and says it cannot yet', () => {
  assert.match(ok('When a bill is due in 3 days, remind me on the fridge').notes[0]!, /cannot put a reminder on the fridge/u);
});

test('filing an arrival without naming the door uses the record\'s one door', () => {
  const got = ok('When a card text arrives, file it under personal');
  assert.deepEqual(got.body.on, { arrival: { ingest: 'cardtexts' } });
  assert.match(got.said, /arrives at Card texts/u);
});

test('with two doors a filing arrival must still name one', () => {
  const two: SentenceWorld = { ...world, doors: [...world.doors, { id: 'mails', name: 'Mails', register: 'dues' }] };
  assert.equal(parseSentence('When a message arrives, file it under personal', two, 'x').ok, false);
});

test('an arrival that only tells stays open to every door', () => {
  assert.deepEqual(ok('When a message arrives, tell me').body.on, { arrival: {} });
});
