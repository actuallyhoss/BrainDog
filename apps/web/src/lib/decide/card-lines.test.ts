/**
 * THE LINES UNDER "WHAT IT CHANGES" (`card.ts` `cardOf`), on questions shaped as the record sends them (`changes`, one
 * entry a field with its label and what it holds before and after, and `does`, the kernel's sentence of the same):
 * a day is said as a day and never as it is held, a change past the third is counted and not dropped,
 * and a change the lines say whole is not said again as a sentence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { QueueQuestion } from '@braindog/kernel';

import { cardOf, cardWords, saysChanges } from './card.ts';

const now = Date.parse('2026-10-13T09:00:00Z');
const RAW_DAY = /\d{4}-\d{2}-\d{2}/u;

type Change = { field: string; label?: string; before: unknown; after: unknown };

/** An agent's change to one project, as Decide's queue hands it to the card. */
const ask = (changes: Change[], over: Record<string, unknown> = {}): QueueQuestion =>
  ({
    id: 'SG21',
    who: 'agent:claude',
    at: '2026-10-13T07:00:00Z',
    kind: 'rowset',
    body_kind: 'rowset',
    question: 'Change the stage and due on of Kiln?',
    why: 'The launch moved.',
    cost: 'call',
    does: 'Changes Stage from Building to Live, changes Due on from 20 October 2026 to 3 November 2026 in Projects.',
    options: [
      { key: 'accept', label: 'Accept', because: '', recommended: true },
      { key: 'reject', label: 'Reject', because: '', recommended: false },
    ],
    changes,
    ...over,
  }) as QueueQuestion;

const STAGE: Change = { field: 'stage', label: 'Stage', before: 'Building', after: 'Live' };
const DUE: Change = { field: 'due', label: 'Due on', before: '2026-10-20', after: '2026-11-03' };
/* A link holds the id of what it points at, which no card says. */
const LEAD: Change = { field: 'lead', label: 'Led by', before: '01JZ8QK3F7R2M9V4XN6TCB5HAD', after: '01JZ8QK3F7R2M9V4XN6TCB5HAE' };

test('A DAY IS SAID AS A DAY, as the sentence over it says it, year and all', () => {
  const card = cardOf(ask([STAGE, DUE]), { now });
  assert.deepEqual(card.lines[1], { what: 'Due on', before: '20 October 2026', after: '3 November 2026', said: null });
  assert.deepEqual(card.shifts[1], { what: 'Due on', before: '20 October 2026', after: '3 November 2026' });
  assert.doesNotMatch(JSON.stringify(card.lines), RAW_DAY);

  /* A day where there was none, and a day taken away, are the same words in a phrase. */
  const set = cardOf(ask([{ field: 'due', label: 'Due on', before: null, after: '2026-01-09' }]), { now });
  assert.equal(set.lines[0]?.said, 'Set to 9 January 2026');
  const gone = cardOf(ask([{ field: 'due', label: 'Due on', before: '2026-12-31', after: '' }]), { now });
  assert.equal(gone.lines[0]?.said, 'Removes 31 December 2026');

  /* Several days in one field are each said. */
  const many = cardOf(ask([{ field: 'days', label: 'Days', before: ['2026-10-20'], after: ['2026-10-20', '2026-10-27'] }]), { now });
  assert.equal(many.lines[0]?.after, '20 October 2026, 27 October 2026');
});

test('A DAY HELD WITH A TIME IS SAID AS ITS DAY, never as a timestamp', () => {
  /* On the wall, with no zone: the day as written. */
  const wall = cardOf(ask([{ field: 'starts', label: 'Starts', before: '2026-10-20T09:30', after: '2026-11-03 14:00:00' }]), { now });
  assert.deepEqual([wall.lines[0]?.before, wall.lines[0]?.after], ['20 October 2026', '3 November 2026']);

  /* An instant: the day the reader's own clock puts it in, which at midday in UTC is that day or the next. */
  const instant = cardOf(ask([{ field: 'sent', label: 'Sent', before: '2026-10-20T12:00:00Z', after: '2026-12-31T12:00:00.000+00:00' }]), { now });
  assert.match(instant.lines[0]?.before ?? '', /^(20|21) October 2026$/u);
  assert.match(instant.lines[0]?.after ?? '', /^(31 December 2026|1 January 2027)$/u);
  for (const card of [wall, instant]) assert.doesNotMatch(JSON.stringify(card.lines), /\d{4}-\d{2}|\d{2}:\d{2}/u);

  /* TWO TIMES ON ONE DAY read alike, so no line is drawn; the change is not lost, the record's sentence names it. */
  const does = 'Changes Starts in Projects.';
  const hours = cardOf(ask([{ field: 'starts', label: 'Starts', before: '2026-10-20T09:30', after: '2026-10-20T15:00' }], { does }), { now });
  assert.deepEqual(hours.lines, []);
  assert.equal(hours.does, does);

  /* A text that only looks like a day is left as its words. */
  const odd = cardOf(ask([{ field: 'ref', label: 'Reference', before: 'A', after: '2026-13-40' }]), { now });
  assert.equal(odd.lines[0]?.after, '2026-13-40');
});

test('PAST THE THIRD CHANGE THE CARD SAYS HOW MANY MORE THERE ARE, and where', () => {
  const five: Change[] = [
    STAGE,
    DUE,
    { field: 'cost', label: 'Cost', before: null, after: { amount: 125_000, currency: 'GBP' } },
    { field: 'city', label: 'City', before: 'Leeds', after: 'York' },
    { field: 'seats', label: 'Seats', before: 4, after: 6 },
  ];
  const card = cardOf(ask(five), { now });
  assert.deepEqual(
    card.lines.map((l) => l.what),
    ['Stage', 'Due on', 'Cost'],
  );
  assert.equal(card.more, 2);
  assert.equal(cardWords.more(card.more), 'and 2 more, on its page');
  assert.doesNotMatch(cardWords.more(1), /—/u);

  /* Three or fewer leave nothing to count. */
  assert.equal(cardOf(ask(five.slice(0, 3)), { now }).more, 0);
  assert.equal(cardOf(ask([]), { now }).more, 0);
  /* A change no line can say is not one of the more: the sentence names it. A value that did not change is neither. */
  const linked = cardOf(ask([STAGE, DUE, five[3]!, LEAD, { field: 'seats', label: 'Seats', before: 4, after: 4 }]), { now });
  assert.equal(linked.more, 0);
  assert.equal(linked.lines.length, 3);
});

test('THE CARD DRAWS THAT COUNT UNDER ITS LINES, in the same list', () => {
  const drawn = readFileSync(new URL('./DecisionCard.svelte', import.meta.url), 'utf8');
  const list = /<ul class="dc-moves">([\s\S]*?)<\/ul>/u.exec(drawn)?.[1] ?? '';
  assert.match(list, /\{#if card\.more > 0\}<li class="dc-more">\{cardWords\.more\(card\.more\)\}<\/li>\{\/if\}/u);
  assert.ok(list.indexOf('{/each}') < list.indexOf('dc-more'), 'the count is drawn before the lines it follows');
});

test('A CHANGE THE LINES SAY WHOLE IS NOT SAID AGAIN AS A SENTENCE, on the lead or below it', () => {
  for (const lead of [true, false]) {
    const card = cardOf(ask([STAGE, DUE]), { now, lead });
    assert.equal(card.does, '', 'the sentence and the lines say the same change twice');
    assert.equal(card.lines.length, 2);
    assert.equal(saysChanges(card), true, 'nothing sits under What it changes');
  }
});

test('A STROKE ALONE IS NO PATH: a value with one is said, and a text a path was cut from is still held back', () => {
  /* Audit 81, claim 3: the record's sentence says "Q3/Q4", and the card dropped every value that held a stroke. */
  const said = cardOf(ask([{ field: 'status', label: 'Status', before: 'N/A', after: 'Q3/Q4' }]), { now });
  assert.deepEqual(said.lines[0], { what: 'Status', before: 'N/A', after: 'Q3/Q4', said: null });
  for (const text of ['Paid 50/50', 'Open 24/7 from May', 'Either and/or both']) {
    const card = cardOf(ask([{ field: 'notes', label: 'Notes', before: 'Old', after: text }]), { now });
    assert.equal(card.lines[0]?.after, text, text);
  }
  /* What `spoken` changes is not the value: a file, a folder three deep, a home folder, a site's page. */
  for (const text of ['Read docs/plan.md first.', 'apps/web/src/login.ts', 'Moved to ~/Developer/old', 'See https://example.com/pricing']) {
    const card = cardOf(ask([STAGE, { field: 'notes', label: 'Notes', before: 'Old', after: text }]), { now });
    assert.deepEqual(card.lines.map((l) => l.what), ['Stage'], text);
  }
});

test('THE SENTENCE STAYS WHEREVER A CHANGE IS NOT ONE OF THE LINES', () => {
  const does = 'Changes Stage from Building to Live, changes Led by in Projects.';
  for (const lead of [true, false]) {
    /* A link: its holder is an id, so the sentence is the only place the field is named. */
    const linked = cardOf(ask([STAGE, LEAD], { does }), { now, lead });
    assert.equal(linked.does, does);
    assert.deepEqual(
      linked.lines.map((l) => l.what),
      ['Stage'],
    );
    /* A note that names a file is left to its page, and never drawn with the file cut out of it. */
    const note = cardOf(ask([STAGE, { field: 'notes', label: 'Notes', before: null, after: 'Read docs/plan.md first.' }], { does }), { now, lead });
    assert.equal(note.does, does);
    assert.doesNotMatch(JSON.stringify(note.lines), /Read/u);
    /* A fourth change is cut from the lines, so the sentence still names it. */
    const four = cardOf(ask([STAGE, DUE, { field: 'city', label: 'City', before: 'Leeds', after: 'York' }, { field: 'seats', label: 'Seats', before: 4, after: 6 }], { does }), { now, lead });
    assert.equal(four.does, does);
    assert.equal(four.more, 1);
    /* Entries added, with nothing from and to: the sentence is all there is. */
    const adds = cardOf(ask([], { does: 'Adds 3 to Tasks.', changes: undefined }), { now, lead });
    assert.equal(adds.does, 'Adds 3 to Tasks.');
  }

  /* TWO LONG TEXTS THAT PART AFTER THE CUT read alike as words: no line, and the sentence says the field changed. */
  const long = 'The kiln is booked for the last week of the month and the glaze order follows it';
  const cut = cardOf(ask([STAGE, { field: 'notes', label: 'Notes', before: `${long} on Monday.`, after: `${long} on Friday.` }], { does }), { now });
  assert.equal(cut.does, does);
  assert.equal(cut.lines.length, 1);
});

test('ANOTHER KIND OF QUESTION KEEPS ITS LINE ON THE LEAD: it may say what the lines do not', () => {
  const does = 'Changes the Home page.';
  const page = ask([{ field: 'title', label: 'Title', before: 'Home', after: 'Today' }], { kind: 'change', body_kind: 'change', does });
  assert.equal(cardOf(page, { now, lead: true }).does, does);
  assert.equal(cardOf(page, { now }).does, '');
});

test('THE LIST KEEPS ITS NAME ON THE CARD where the sentence that said it is left out (audit 81, claims 3 and 4)', () => {
  for (const lead of [true, false]) {
    const card = cardOf(ask([STAGE, DUE]), { now, lead });
    assert.equal(card.does, '');
    assert.equal(card.list, 'Projects', 'the lines say fields, and nothing else says which list they are of');
  }
  /* A value may hold the word, and a value with a stroke in it is a line now: the list is what the sentence ends on. */
  const inWords = ask([{ field: 'city', label: 'City', before: 'York', after: 'Live in Leeds' }], { does: 'Changes City from York to Live in Leeds in Places.' });
  assert.equal(cardOf(inWords, { now }).list, 'Places');
  const stroke = ask([{ field: 'status', label: 'Status', before: 'N/A', after: 'Q3/Q4' }], { does: 'Changes Status from N/A to Q3/Q4 in Projects.' });
  assert.deepEqual(cardOf(stroke, { now }).lines[0], { what: 'Status', before: 'N/A', after: 'Q3/Q4', said: null });
  assert.equal(cardOf(stroke, { now }).list, 'Projects');
  /* SAID ONCE: where the sentence is drawn it names the list itself, and the heading stays as it was. */
  const kept = cardOf(ask([STAGE, LEAD], { does: 'Changes Stage from Building to Live, changes Led by in Projects.' }), { now });
  assert.notEqual(kept.does, '');
  assert.equal(kept.list, '');
  /* NO NAME IS BETTER THAN A WRONG ONE: a sentence that ends another way, no list, an id where a name belongs. */
  for (const does of ['Changes Stage from Building to Live in Projects and adds 2.', 'Changes Stage from Building to Live in your things.', 'Changes Stage from Building to Live in tasks#8.', 'Changes Stage.', undefined]) {
    assert.equal(cardOf(ask([STAGE], { does }), { now }).list, '', String(does));
  }
  assert.equal(cardWords.changesIn('Projects'), 'What it changes in Projects');
  assert.doesNotMatch(cardWords.changesIn('Projects'), /—/u);
});

test('THE CARD SAYS THE LIST IN ITS HEADING, in the sentence’s place, and the plain heading everywhere else', () => {
  const drawn = readFileSync(new URL('./DecisionCard.svelte', import.meta.url), 'utf8');
  assert.match(drawn, /\{#if card\.list\}\{cardWords\.changesIn\(card\.list\)\}\{:else\}\{cardWords\.changes\}\{\/if\}<\/h4>/u);
});
