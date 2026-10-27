/**
 * `today-brief.ts`: Today's greeting and the two or three sentences the rules write over the desk, and the Late tile's lines in the brief's order. Said from his record as the audit found it: a salary 13
 * days late, a contractor fee 14 days late, an instalment 9 days late, a refund email 7 days late, and questions waiting.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LiveBlock } from '../record/page-live.ts';
import type { HomeLine } from './home-rows.ts';
import { NAMED_MOST, briefOf, greetingOf, inBriefOrder, lateFigure, lateOf, onceEach, unasked } from './today-brief.ts';

const money = (key: string, title: string, when: string, href = `/r/${key.replace('#', '/')}`): HomeLine => ({
  key,
  title,
  when,
  amount: { text: '+$4,012', dir: 'in' },
  href,
  late: true,
});
const task = (key: string, title: string, when: string): HomeLine => ({ key, title, when, href: `/r/${key.replace('#', '/')}`, late: true });

const SALARY = money('obligations#2', 'Lanternfish salary', '13 days late');
const FEE = money('obligations#5', 'Copperleaf contractor fee', '14 days late');
const HARBOUR = money('obligations#9', 'Harbourview instalment, 2 of 40', '9 days late');
const REFUND = task('tasks#41', 'Send Jennifer the Crumb Pass refund email', '7 days late');
const TODAY: HomeLine = { key: 'obligations#12', title: 'Northwind premium', when: 'Due today', amount: { text: '−$287', dir: 'out' }, late: false };

test('THE GREETING IS BY HIS OWN CLOCK AND HIS FIRST NAME, and alone where the record knows no name', () => {
  const at = (hour: number) => new Date(2026, 9, 22, hour, 30).getTime();
  assert.equal(greetingOf(at(8), 'Sam'), 'Good morning, Sam');
  assert.equal(greetingOf(at(12), 'Sam Ridley'), 'Good afternoon, Sam');
  assert.equal(greetingOf(at(19), ' Sam '), 'Good evening, Sam');
  assert.equal(greetingOf(at(2), 'Sam'), 'Good evening, Sam');
  assert.equal(greetingOf(at(9), null), 'Good morning');
  assert.equal(greetingOf(at(9), ''), 'Good morning');
});

test('HOW LATE IS THE FIGURE BEFORE "LATE", and a line due today has none', () => {
  assert.equal(lateFigure('13 days late'), '13 days');
  assert.equal(lateFigure('2 months late'), '2 months');
  assert.equal(lateFigure('Due today'), null);
  assert.equal(lateFigure(undefined), null);
});

test('THREE PAYMENTS, A TASK AND QUESTIONS ARE THREE SENTENCES, each thing by name and its row one press away', () => {
  const brief = briefOf({ lines: [SALARY, FEE, HARBOUR, REFUND], needYou: 2, agents: ['Claude'], calm: 'Nothing needs you now.' });
  assert.equal(
    brief.text,
    '3 payments are late: Lanternfish salary by 13 days, Copperleaf contractor fee by 14 days and Harbourview instalment, 2 of 40 by 9 days. ' +
      'Send Jennifer the Crumb Pass refund email is 7 days late. Claude is working, and 2 questions wait for you.',
  );
  /* THE ONE RED PHRASE IS THE FIRST THING THAT NEEDS HIM, and the figures are figures. */
  assert.deepEqual(brief.parts[0], { text: '3 payments are late', needs: true });
  assert.equal(brief.parts.filter((p) => p.needs).length, 1);
  assert.deepEqual(brief.parts.filter((p) => p.fig).map((p) => p.text), ['13 days', '14 days', '9 days']);
  /* EACH NAME OPENS ITS ROW, and the questions open Needs you. */
  assert.deepEqual(brief.parts.filter((p) => p.href).map((p) => [p.text, p.href]), [
    ['Lanternfish salary', '/r/obligations/2'],
    ['Copperleaf contractor fee', '/r/obligations/5'],
    ['Harbourview instalment, 2 of 40', '/r/obligations/9'],
    ['Send Jennifer the Crumb Pass refund email', '/r/tasks/41'],
    ['2 questions', '/decide'],
  ]);
});

test('ONE PAYMENT IS ITS OWN SENTENCE, MORE THAN THREE ARE NAMED THREE AND COUNTED, and the rest past the list too', () => {
  assert.equal(briefOf({ lines: [SALARY], needYou: 0, agents: [], calm: 'Calm.' }).text, 'Lanternfish salary is 13 days late.');
  const five = [SALARY, FEE, HARBOUR, money('obligations#20', 'Studio rent', '3 days late'), money('obligations#21', 'Hosting', '2 days late')];
  const said = briefOf({ lines: five, more: 4, needYou: 1, agents: ['Claude', 'Codex'], calm: 'Calm.' }).text;
  assert.equal(NAMED_MOST, 3);
  assert.equal(
    said,
    '9 payments are late: Lanternfish salary by 13 days, Copperleaf contractor fee by 14 days, Harbourview instalment, 2 of 40 by 9 days and 6 more. ' +
      'Claude and Codex are working, and 1 question waits for you.',
  );
});

test('WITHOUT LATE MONEY THE LATE TASKS LEAD IN RED, and the questions after them are a plain door', () => {
  const brief = briefOf({ lines: [REFUND, task('tasks#7', 'Renew the domain', '2 days late')], needYou: 3, agents: [], calm: 'Calm.' });
  assert.equal(brief.text, '2 things are late: Send Jennifer the Crumb Pass refund email by 7 days and Renew the domain by 2 days. 3 questions wait for you.');
  assert.deepEqual(brief.parts[0], { text: '2 things are late', needs: true });
  assert.equal(brief.parts.find((p) => p.href === '/decide')?.needs, undefined);
});

test('WITH NOTHING LATE THE QUESTIONS NEED HIM, AND WITH NOTHING AT ALL IT IS THE CALM LINE, then who is working', () => {
  const asked = briefOf({ lines: [], needYou: 4, agents: ['Claude'], calm: 'Calm.' });
  assert.equal(asked.text, 'Claude is working, and 4 questions wait for you.');
  assert.equal(asked.parts.find((p) => p.href === '/decide')?.needs, true);
  assert.equal(briefOf({ lines: [], needYou: 0, agents: ['Claude'], calm: 'Nothing needs you now.' }).text, 'Nothing needs you now. Claude is working.');
  assert.equal(briefOf({ lines: [], needYou: 0, inbox: 2, agents: [], calm: 'Calm.' }).text, '2 things wait in your inbox.');
  assert.equal(briefOf({ lines: [TODAY], needYou: 0, agents: [], calm: 'Calm.' }).text, 'Northwind premium is due today.');
});

test('NO EM DASH AND NO ID IN ANYTHING IT SAYS', () => {
  const brief = briefOf({ lines: [SALARY, FEE, HARBOUR, REFUND, TODAY], needYou: 2, agents: ['Claude'], calm: 'Calm.' });
  assert.doesNotMatch(brief.text, /—|#|obligations|tasks/u);
});

test('THE LATE LIST IS READ OFF THE DRAWN LATE BLOCKS, with how many more and the first heading, and where each stands', () => {
  const block = (drawn: boolean, lines: HomeLine[], more?: { tasks: number; money: number }, heading = 'Late') =>
    ({ drawn, heading, homeRows: { kind: 'late', lines, ...(more ? { more } : {}) } }) as unknown as LiveBlock;
  const other = { drawn: true, heading: 'Cash ahead' } as unknown as LiveBlock;
  const found = lateOf([other, block(true, [SALARY, REFUND], { tasks: 1, money: 2 }, 'Late or due today'), block(false, [FEE]), block(true, [HARBOUR])]);
  assert.deepEqual(found, { lines: [SALARY, REFUND, HARBOUR], more: 3, heading: 'Late or due today', at: [1, 3] });
  assert.equal(lateOf([other, block(false, [FEE])]), null);
});

test('A LINE A QUESTION ALREADY ASKS ABOUT IS NOT ON THE LATE TILE, by the row it names or by its title opening it', () => {
  const lines = [SALARY, FEE, HARBOUR];
  assert.deepEqual(unasked(lines, []), lines);
  assert.deepEqual(unasked(lines, [{ about: 'obligations#2' }]), [FEE, HARBOUR]);
  assert.deepEqual(unasked(lines, [{ question: 'Copperleaf contractor fee was due 14 days ago. Chase it?' }]), [SALARY, HARBOUR]);
  assert.deepEqual(unasked(lines, [{ question: 'Lanternfish salaryman?' }]), lines, 'a title is a whole word');
});

test('THE LATE TILE IS IN THE BRIEF\'S ORDER: late money, then what else is late, then what is due today', () => {
  assert.deepEqual(inBriefOrder([REFUND, TODAY, SALARY, FEE]), [SALARY, FEE, REFUND, TODAY]);
  assert.deepEqual(inBriefOrder([]), []);
});

test('ONE THING IN TWO LISTS IS ONE LINE, by the row a press can finish, and things told apart stay apart', () => {
  const paid = { ...SALARY, key: 'obligations#2', day: '2026-10-09', money: { minor: 403800, currency: 'USD' } };
  const twin = { ...SALARY, key: 'income#7', day: '2026-10-09', money: { minor: 403800, currency: 'USD' } };
  const finishes = (line: HomeLine) => line.key.startsWith('obligations#');
  /* HIS RECORD ON 23 OCTOBER: the salary twice, the same name, amount and day. */
  assert.deepEqual(onceEach([FEE, twin, paid, HARBOUR], finishes), [FEE, paid, HARBOUR]);
  assert.deepEqual(onceEach([FEE, paid, twin, HARBOUR], finishes), [FEE, paid, HARBOUR]);
  assert.deepEqual(onceEach([twin, paid]), [twin], 'with no preference the first stands');
  /* ANOTHER DAY, ANOTHER AMOUNT OR ANOTHER KIND IS ANOTHER THING. */
  assert.equal(onceEach([paid, { ...twin, day: '2026-09-09' }]).length, 2);
  assert.equal(onceEach([paid, { ...twin, money: { minor: 100, currency: 'USD' } }]).length, 2);
  assert.equal(onceEach([paid, { key: 'tasks#3', title: 'Lanternfish salary', when: '13 days late', day: '2026-10-09', late: true }]).length, 2);
  /* AND THE BRIEF SAYS IT ONCE. */
  assert.equal(briefOf({ lines: onceEach([FEE, twin, paid, HARBOUR], finishes), needYou: 0, agents: [], calm: 'Calm.' }).parts[0]?.text, '3 payments are late');
});
