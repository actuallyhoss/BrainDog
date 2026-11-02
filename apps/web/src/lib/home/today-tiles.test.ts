/**
 * Today's sentences and pictures, read off the record's answers: every line this screen says, from the data it was
 * handed, and nothing said when there is nothing under it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { writeAmount } from 'braindog-render';

import {
  aboutSaid,
  ageSaid,
  cashReading,
  counted,
  datedOf,
  dayGroups,
  dayNamed,
  elapsedSaid,
  lanesOf,
  lanesReading,
  lateSaid,
  projectColour,
  lateBy,
  sentenceOf,
  shareReading,
  sinceIcon,
  sinceReading,
  sinceWhen,
  spanSaid,
  weekDays,
  weekReading,
  whoSaid,
} from './today-tiles.ts';
import type { DayRow, DueRow, SessionRow, TaskRow } from '../record/today-live.ts';

const TODAY = '2026-09-29';

test('THE SENTENCE (today F2, polish 7): short sentences, what needs you first and red, then what is late, then who is working; digits always', () => {
  const late = { owed: '£7,200', bills: null };
  assert.deepEqual(sentenceOf({ needYou: 8, late, agents: 2 }), { text: '8 need you. £7,200 owed to you is late. 2 agents are working.', needs: '8 need you' });
  assert.deepEqual(sentenceOf({ needYou: 8, late: { owed: '£7,200', bills: '£10,593' }, agents: 2 }), {
    text: '8 need you. £7,200 owed to you is late, and £10,593 you owe. 2 agents are working.',
    needs: '8 need you',
  });
  /* EITHER AMOUNT AT NOUGHT DROPS ITS CLAUSE. */
  assert.equal(sentenceOf({ needYou: 8, late: { owed: null, bills: '£10,593' }, agents: 0 }).text, '8 need you. £10,593 you owe is late.');
  /* WITH SOMETHING TO ASK AND NOTHING LATE, the line says so, where what is late was read at all. */
  assert.deepEqual(sentenceOf({ needYou: 1, agents: 1, lateRead: true }), { text: '1 needs you. Nothing is late. 1 agent is working.', needs: '1 needs you' });
  assert.deepEqual(sentenceOf({ needYou: 26, late: { owed: null, bills: null }, agents: 0 }), { text: '26 need you. Nothing is late.', needs: '26 need you' });
  assert.deepEqual(sentenceOf({ needYou: 26, agents: 0 }), { text: '26 need you.', needs: '26 need you' });
  /* LATE WITH NO MONEY ON IT is a count, said only where no late money is. */
  assert.deepEqual(sentenceOf({ needYou: 3, lateThings: 2, agents: 0 }), { text: '3 need you. 2 things are late.', needs: '3 need you' });
  assert.equal(sentenceOf({ needYou: 3, late, lateThings: 2, agents: 0 }).text, '3 need you. £7,200 owed to you is late.');
  /* NOTHING NEEDS YOU is its own sentence; what is late then carries the red. */
  assert.deepEqual(sentenceOf({ needYou: 0, agents: 0 }), { text: 'Nothing needs you.', needs: '' });
  assert.deepEqual(sentenceOf({ needYou: 0, agents: 2 }), { text: 'Nothing needs you. 2 agents are working.', needs: '' });
  assert.deepEqual(sentenceOf({ needYou: 0, late, agents: 2 }), { text: 'Nothing needs you. £7,200 owed to you is late. 2 agents are working.', needs: '£7,200 owed to you is late' });
  /* SOMETHING IN THE INBOX AND NO QUESTION: never "Nothing needs you". */
  assert.deepEqual(sentenceOf({ needYou: 0, agents: 0, inbox: 4 }), { text: '4 things wait in your inbox.', needs: '' });
  /* NO WORD BESIDE A FIGURE. */
  for (const n of [1, 7, 8, 12, 26]) assert.doesNotMatch(sentenceOf({ needYou: n, agents: n }).text, /\b(one|two|three|seven|eight|twelve)\b/iu);
});

test('HOW LATE, IN WORDS: a day, then days, weeks and months, counted in words to ten', () => {
  assert.equal(lateBy('2026-09-28', TODAY), 'a day');
  assert.equal(lateBy('2026-09-24', TODAY), 'five days');
  assert.equal(lateBy('2026-09-01', TODAY), 'four weeks');
  assert.equal(lateBy('2026-06-01', TODAY), 'four months');
});

test('LATE, WAITED AND RUNNING ARE SAID THE WAY A PERSON SAYS THEM', () => {
  assert.equal(lateSaid('2026-09-28', TODAY), '1 day late');
  /* IN DAYS ALWAYS (30 October), as a list's cards and tables say it on the same screen. */
  assert.equal(lateSaid('2026-09-01', TODAY), '28 days late');
  assert.equal(lateSaid('2026-06-01', TODAY), '120 days late');
  assert.equal(ageSaid(30_000), '1 min');
  assert.equal(ageSaid(3 * 3_600_000), '3 hours');
  assert.equal(ageSaid(2 * 86_400_000), '2 days');
  assert.equal(elapsedSaid(42 * 60_000), '42 min');
  assert.equal(elapsedSaid(68 * 60_000), '1 h 08');
  assert.equal(dayNamed('2026-09-27', TODAY), 'Sunday');
  assert.equal(dayNamed('2026-09-12', TODAY), '12 Sep');
  assert.equal(counted(3), 'three');
  assert.equal(counted(11), '11');
});

const task = (seq: number, due: string, hue: number | null = null): TaskRow => ({ seq, what: `Task ${seq}`, due, project: null, why: due < TODAY ? 'late' : 'today', agent: null, hue });
const day = (seq: number, d: string): DayRow => ({ seq, what: `Later ${seq}`, day: d, project: null, hue: 30, agent: null, state: 'open', priority: null });
const bill = (seq: number, d: string, out = true): DueRow => ({ seq, what: `Bill ${seq}`, amount: 'EGP 1,150.00', out, due: d, late: d < TODAY });

test('THE WEEK STRIP: fourteen days from two days ago, a dot a thing in its project`s colour, late ones red, and a reading line from the same days', () => {
  const dated = datedOf([task(1, '2026-09-27', 30), task(2, TODAY)], [day(3, '2026-09-30'), day(4, '2026-10-05')], [bill(5, '2026-10-03')], TODAY);
  const days = weekDays(dated, TODAY);
  assert.equal(days.length, 14);
  assert.equal(days[0]!.date, '2026-09-27');
  assert.deepEqual(days[0]!.items, [{ colour: 'var(--cat-pink-fill)', late: true, label: 'Task 1' }]);
  assert.equal(days[2]!.date, TODAY);
  assert.equal(days[2]!.items.length, 1);
  assert.equal(weekReading(dated, TODAY), 'One is late, from Sunday. One is due today. The next 11 days hold 3 more, one of them money.');
  assert.equal(weekReading([], TODAY), 'Nothing is dated in the next 11 days.');
  assert.equal(projectColour(null), null);
});

test('THE DAYS UNDER THE STRIP: tomorrow, the rest of this week to Sunday, next week, and after, each only when it holds something', () => {
  const groups = dayGroups([{ day: '2026-09-30' }, { day: '2026-10-03' }, { day: '2026-10-06' }, { day: '2026-10-13' }], TODAY);
  assert.deepEqual(
    groups.map((g) => [g.title, g.span, g.items.length]),
    [
      ['Tomorrow', 'Wed 30 Sep', 1],
      ['Later this week', 'Thu 1 to Sun 4 Oct', 1],
      ['Next week', 'Mon 5 to Sun 11 Oct', 1],
      ['After that', 'Mon 12 to Tue 13 Oct', 1],
    ],
  );
  assert.equal(spanSaid('2026-09-30', '2026-10-04'), 'Wed 30 Sep to Sun 4 Oct');
  assert.deepEqual(dayGroups([], TODAY), []);
});

test('THE AGENTS` DAY: a lane an agent, the busiest first, and a reading of how many ran and who has run longest', () => {
  const now = Date.parse('2026-09-29T09:40:00');
  const at = (h: number, m = 0) => Date.parse(`2026-09-29T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
  const runs: SessionRow[] = [
    { seq: 1, agent: 'claude', doing: 'Book', state: 'done', host: 'OMEN', opened: at(0, 20), from: at(0, 20), to: at(1, 40), working: false },
    { seq: 2, agent: 'codex', doing: 'Gateway', state: 'active', host: 'OMEN', opened: at(8, 32), from: at(8, 32), to: now, working: true },
    { seq: 3, agent: 'claude', doing: 'Book', state: 'active', host: 'OMEN', opened: at(8, 58), from: at(8, 58), to: now, working: true },
  ];
  const name = (a: string) => a;
  const lanes = lanesOf(runs, name);
  assert.deepEqual(lanes.map((l) => [l.label, l.spans.length]), [['claude', 2], ['codex', 1]]);
  assert.equal(lanesReading(runs, now, name), "Three runs since midnight; two are working now, and codex's has run longest, 1 h 08.");
  assert.equal(lanesReading(runs.slice(0, 1), now, name), 'One run since midnight; none is working now.');
});

test('SINCE YOU WERE HERE: when the oldest change was, who made them, and where most of them were', () => {
  const now = Date.parse('2026-09-29T09:40:00');
  assert.equal(sinceWhen(new Date('2026-09-29T07:12:00').toISOString(), now), 'since 07:12');
  assert.equal(sinceWhen(new Date('2026-09-28T21:40:00').toISOString(), now), 'since yesterday 21:40');
  assert.equal(sinceWhen(new Date('2026-09-26T21:40:00').toISOString(), now), 'since Sat 21:40');
  assert.equal(sinceWhen(null, now), null);
  assert.equal(whoSaid(22, 4), '22 by agents, 4 by you');
  assert.equal(whoSaid(0, 4), '4 by you');
  const rows = [
    { key: 'list:tasks', label: 'Tasks', count: 14, href: '' },
    { key: 'kind:Decisions made', label: 'Decisions made', count: 3, href: '' },
  ];
  assert.equal(sinceReading(rows, 26, 22, 4), 'Agents made 22 of the 26; most were in Tasks.');
  assert.equal(sinceReading(rows.slice(1), 3, 0, 3), 'You made all 3; all of them decisions made.');
  assert.equal(sinceReading([], 0, 0, 0), 'Nothing has changed since you were last here.');
  assert.equal(sinceIcon(rows[0]!, (l) => (l === 'tasks' ? 'task' : undefined)), 'task');
  assert.equal(sinceIcon(rows[1]!, () => undefined), 'decide');
});

test('CASH, ROUGHLY: about a figure keeps its three significant figures and is spelled by the one writer', () => {
  const writer = (minor: number, currency: string, home: string | null): string => `about ${writeAmount({ minor, currency }, home, 'read')!.text}`;
  /* A currency written by its code, home or not, the code held to its figure by a space that does not break. */
  assert.equal(aboutSaid(38_812_345, 'EGP', null), 'about EGP\u00a0388,000');
  assert.equal(aboutSaid(38_812_345, 'EGP', null), writer(38_800_000, 'EGP', null));
  assert.equal(aboutSaid(38_812_345, 'EGP', 'EGP'), writer(38_800_000, 'EGP', 'EGP'));
  /* Three minor places, never a hundredth: 1,234.567 dinars is 1,235 whole and about 1,240, and the writer spells it the same. */
  assert.equal(aboutSaid(1_234_567, 'KWD', 'KWD'), 'about KWD\u00a01,240');
  assert.equal(aboutSaid(1_234_567, 'KWD', null), writer(1_240_000, 'KWD', null));
  assert.equal(aboutSaid(-1_234_567, 'KWD', null), writer(-1_240_000, 'KWD', null));
  /* The home currency by its sign, another by its sign and code: the spelling every other figure on the page has. */
  assert.equal(aboutSaid(38_812_345, 'GBP', 'GBP'), 'about £388,000');
  assert.equal(aboutSaid(38_812_345, 'GBP', 'EGP'), writer(38_800_000, 'GBP', 'EGP'));
  assert.equal(aboutSaid(950, 'GBP', 'GBP'), 'about £10');
});

test('CASH: the low point in words, going under said as the one red phrase, and a share of the whole', () => {
  const low = cashReading({ currency: 'EGP', values: [41_240_000, 38_812_345], weeks: 13, low: { value: 38_812_345, day: '2026-11-23' }, crossed: null });
  assert.equal(low.needs, '');
  assert.match(low.text, /^Lowest in the next 13 weeks: about .*388,000 on 23 Nov\.$/u);
  const under = cashReading({ currency: 'EGP', values: [100, -5], weeks: 13, low: { value: -5, day: '2026-11-02' }, crossed: '2026-11-02' });
  assert.equal(under.needs, 'goes under on 2 Nov');
  const flat = cashReading({ currency: 'EGP', values: [100, 200], weeks: 13, low: { value: 100, day: null }, crossed: null });
  assert.equal(flat.text, "Nothing dated takes it below today's figure in the next 13 weeks.");
  assert.equal(shareReading([{ label: 'Personal', value: 71 }, { label: 'Studio', value: 29 }]), 'Personal holds 71% of it.');
  assert.equal(shareReading([]), null);
});
