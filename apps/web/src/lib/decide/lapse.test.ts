/**
 * HOW LONG AN OFFER WAITS, ON THE CARD ("every proposal states a deadline"): an arrangement whose body holds a
 * real `lapses` day says, in one quiet line, the last day it waits; one without draws what it always drew. It promises
 * no taking back, because nothing takes an offer back by itself yet.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { QueueQuestion } from '@braindog/kernel';

import { cardOf, cardWords, realDay } from './card.ts';

/* Noon, so the reader's day is the same in any zone the suite runs in. */
const now = Date.parse('2026-10-14T12:00:00Z');

const BODY = { kind: 'arrange', why: ['Kiln is opened every day.'], rows: [{ register: 'pages', fields: { name: 'Kiln' } }] };

const offer = (over: Record<string, unknown> = {}): QueueQuestion =>
  ({
    id: 'SG21',
    who: 'slash',
    at: '2026-10-14T07:00:00Z',
    kind: 'arrange',
    body_kind: 'arrange',
    question: 'Give Kiln a page of its own?',
    why: 'Kiln is opened every day.',
    cost: 'call',
    options: [],
    does: 'Adds a page.',
    ...over,
  }) as QueueQuestion;

test('AN ARRANGEMENT WITH A DAY SAYS HOW LONG IT WAITS, its last day, in words', () => {
  const card = cardOf(offer({ arranged: { ...BODY, lapses: '2026-10-27' } }), { now });
  assert.equal(card.lapses, 'Offered until 27 Oct');
  assert.doesNotMatch(card.lapses ?? '', /\d{4}-\d{2}-\d{2}/u, 'no ISO day is drawn');
  assert.doesNotMatch(card.lapses ?? '', /—/u, 'no em dash');
  /* NOTHING TAKES AN OFFER BACK BY ITSELF YET, so the line promises nothing of the kind. */
  assert.doesNotMatch(card.lapses ?? '', /taken? back|takes/u);
  /* A HOST THAT HOLDS THE BODY hands it, and the question need not carry it. */
  assert.equal(cardOf(offer(), { now, body: { ...BODY, lapses: '2026-10-27' } }).lapses, 'Offered until 27 Oct');
  /* Another year says its year. */
  assert.equal(cardOf(offer({ arranged: { ...BODY, lapses: '2027-01-04' } }), { now }).lapses, 'Offered until 4 Jan 2027');
});

test('A QUESTION WITH NO DAY DRAWS EXACTLY WHAT IT DREW: no line, and the rest of the card unchanged', () => {
  const plain = cardOf(offer({ arranged: BODY }), { now });
  const dated = cardOf(offer({ arranged: { ...BODY, lapses: '2026-10-27' } }), { now });
  assert.equal(plain.lapses, null);
  assert.deepEqual({ ...dated, lapses: null }, plain, 'the day changes nothing else on the card');
  assert.equal(cardOf(offer(), { now }).lapses, null, 'an arrangement with no body says nothing');
  /* A QUESTION THAT IS NO ARRANGEMENT never says it, whatever it carries. */
  const choice = offer({ kind: 'options', body_kind: 'options', arranged: { lapses: '2026-10-27' }, options: [{ key: 'a', label: 'A', because: '', recommended: true }] });
  assert.equal(cardOf(choice, { now }).lapses, null);
});

test('THE LINE NAMES NOBODY, whoever asked: an agent, an app or a person', () => {
  for (const over of [{ who: 'agent:wren' }, { who: 'S42', app: 'Quillmate' }, { who: 'tess' }]) {
    const card = cardOf(offer({ ...over, arranged: { ...BODY, lapses: '2026-10-27' } }), { now });
    assert.equal(card.lapses, cardWords.lapses('27 Oct'), JSON.stringify(over));
    assert.doesNotMatch(card.lapses ?? '', /agent:|SG21|wren\b|Quillmate|tess/u, 'no token, id or name');
  }
});

test('A DAY ALREADY COME IS SAID AS TODAY, never as a day gone by', () => {
  assert.equal(cardOf(offer({ arranged: { ...BODY, lapses: '2026-10-13' } }), { now }).lapses, 'Offered until tonight');
  assert.equal(cardOf(offer({ arranged: { ...BODY, lapses: '2026-10-01' } }), { now }).lapses, 'Offered until tonight');
  assert.equal(cardOf(offer({ arranged: { ...BODY, lapses: '2026-10-14' } }), { now }).lapses, 'Offered until tonight');
  assert.equal(cardOf(offer({ arranged: { ...BODY, lapses: '2026-10-15' } }), { now }).lapses, 'Offered until 15 Oct');
});

test('A MALFORMED DAY DRAWS NOTHING', () => {
  for (const bad of ['2026-02-30', '2026-13-01', '28 Oct', '2026-10-27T00:00:00Z', '', 20261027, null, ['2026-10-27']]) {
    assert.equal(cardOf(offer({ arranged: { ...BODY, lapses: bad } }), { now }).lapses, null, String(bad));
  }
  assert.equal(realDay('2028-02-29'), '2028-02-29', 'a leap day is a day');
  assert.equal(realDay('2027-02-29'), null);
});

test('THE CARD DRAWS THE LINE UNDER WHY, quiet, at the body size, with its style in the component', () => {
  const svelte = readFileSync(new URL('./DecisionCard.svelte', import.meta.url), 'utf8');
  assert.match(svelte, /\{#if card\.lapses\}<p class="dc-lapses own-dir">\{card\.lapses\}<\/p>\{\/if\}/u);
  const rule = /\.dc-lapses \{([^}]*)\}/u.exec(svelte)?.[1] ?? '';
  assert.match(rule, /color: var\(--ink-3\)/u);
  assert.match(rule, /font-size: var\(--fs-body\)/u, '15px, the body size');
  assert.doesNotMatch(rule, /border|shadow|background/u, 'a line, not a new tile');
});
