/**
 * Today's sentences and pictures, read off the record's answers: every line this screen says, from the data it was
 * handed, and nothing said when there is nothing under it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
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

test('THE SENTENCE: the count of what needs him, how late the oldest late thing is, and who is working when nothing does', () => {
  assert.deepEqual(sentenceOf(4, ['2026-09-27'], 3, TODAY), { text: 'Four things need you, and one is 2 days late.', needs: '2 days late' });
  assert.deepEqual(sentenceOf(1, ['2026-09-28'], 0, TODAY), { text: 'One thing needs you, and it is 1 day late.', needs: '1 day late' });
  assert.deepEqual(sentenceOf(5, ['2026-09-20', '2026-09-27'], 0, TODAY), { text: 'Five things need you, and two are late, the oldest 9 days late.', needs: 'two are late' });
  assert.deepEqual(sentenceOf(2, ['2026-09-20', '2026-09-27'], 0, TODAY).needs, 'both are late');
  assert.deepEqual(sentenceOf(4, [], 3, TODAY), { text: 'Four things need you, and three agents are working.', needs: 'Four things need you' });
  assert.deepEqual(sentenceOf(4, [], 0, TODAY), { text: 'Four things need you.', needs: 'Four things need you' });
  assert.deepEqual(sentenceOf(0, [], 0, TODAY), { text: 'Nothing needs you, and no agent is working.', needs: '' });
  assert.deepEqual(sentenceOf(0, [], 1, TODAY), { text: 'Nothing needs you, and one agent is working.', needs: '' });
  assert.equal(sentenceOf(12, [], 0, TODAY).text, '12 things need you.');
});

test('LATE, WAITED AND RUNNING ARE SAID THE WAY A PERSON SAYS THEM', () => {
  assert.equal(lateSaid('2026-09-28', TODAY), '1 day late');
  assert.equal(lateSaid('2026-09-01', TODAY), '4 weeks late');
  assert.equal(lateSaid('2026-06-01', TODAY), '4 months late');
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
  assert.deepEqual(days[0]!.items, [{ colour: 'oklch(var(--mark-l) var(--mark-c) 30)', late: true, label: 'Task 1' }]);
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

test('CASH: the low point in words, going under said as the one red phrase, and a share of the whole', () => {
  const low = cashReading({ currency: 'EGP', values: [41_230_000, 38_812_345], weeks: 13, low: { value: 38_812_345, day: '2026-11-23' }, crossed: null });
  assert.equal(low.needs, '');
  assert.match(low.text, /^Lowest in the next 13 weeks: about .*388,000 on 23 Nov\.$/u);
  const under = cashReading({ currency: 'EGP', values: [100, -5], weeks: 13, low: { value: -5, day: '2026-11-02' }, crossed: '2026-11-02' });
  assert.equal(under.needs, 'goes under on 2 Nov');
  const flat = cashReading({ currency: 'EGP', values: [100, 200], weeks: 13, low: { value: 100, day: null }, crossed: null });
  assert.equal(flat.text, "Nothing dated takes it below today's figure in the next 13 weeks.");
  assert.equal(shareReading([{ label: 'Personal', value: 71 }, { label: 'Quartz', value: 29 }]), 'Personal holds 71% of it.');
  assert.equal(shareReading([]), null);
});
