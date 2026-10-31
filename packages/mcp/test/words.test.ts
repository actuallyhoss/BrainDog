/**
 * The words a brief answer is written in (`src/words.ts`), and the two that live beside the answers (`src/brief.ts`).
 *
 * THE CURRENCY TABLE IS A COPY, held here to the one the app draws with (`packages/render/src/format.ts`), because this
 * package depends on the record and the ports and nothing else. A code the two disagree on is an amount an agent
 * quotes a hundredfold off what the person sees on their phone, so every code the runtime knows is compared, not only
 * the ones either table lists.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EXPONENT as DRAWN, exponentOf, money as drawn } from '../../render/src/format.ts';
import { actorWords, bare, clip, closest, cursorIn, cursorOut, dayInWords, deviceOf, EXPONENT, gist, money, moneyInText, PERSON_ID, runnerOf, ULID } from '../src/words.ts';
import { durationSaid, prose, rowLine, type Decl, type Look } from '../src/brief.ts';

const ROW = '01M345FTM0D4F495AW6K6NDAHH';

test('THE EXPONENT TABLE IS THE APP\'S, code for code, over every currency the runtime knows', () => {
  const codes = new Set([...Intl.supportedValuesOf('currency'), ...Object.keys(EXPONENT), ...Object.keys(DRAWN)]);
  const differ = [...codes].filter((code) => (EXPONENT[code] ?? 2) !== exponentOf(code));
  assert.deepEqual(differ, [], 'the brief answers and the app give these currencies different decimals');
});

test('MONEY READS AS CONTEXT SAYS IT, by its sign where it has one, its own decimals only when not nought, and a plain minus', () => {
  assert.equal(money(145_000, 'EGP'), 'EGP 1,450');
  assert.equal(money(145_050, 'EGP'), 'EGP 1,450.50');
  assert.equal(money(3_900, 'GBP'), '£39');
  assert.equal(money(3_950, 'GBP'), '£39.50');
  assert.equal(money(1_299, 'JPY'), '¥1,299');
  assert.equal(money(1_500, 'KWD'), 'KWD 1.500');
  assert.equal(money(-4_800, 'GBP'), '-£48');
  assert.equal(money(5, 'USD'), '$0.05');
  /* ON THE DIGITS, SO THE LARGEST AMOUNT THE RECORD HOLDS IS NOT ROUNDED on its way to a sentence. */
  assert.equal(money(Number.MAX_SAFE_INTEGER, 'USD'), '$90,071,992,547,409.91');
  /* THE APP'S DIGITS, WHATEVER THE FORM: the amount drawn and the amount said are one number. */
  const digitsOf = (s: string): string => s.replace(/[^\d.]/gu, '').replace(/\.0+$/u, '');
  for (const currency of ['EGP', 'GBP', 'JPY', 'KWD', 'CLF', 'USD'])
    for (const minor of [0, 1, 99, 100, 145_000, -4_800, 123_456_789])
      assert.equal(digitsOf(money(minor, currency)), digitsOf(drawn(minor, currency)), `${String(minor)} ${currency}`);
  /* A PART OF A PENNY, WHICH AN AVERAGE OF MONEY READS IN, IS NEVER A HUNDRED POUNDS: `101.5` was said `GBP 101.5`. */
  assert.equal(money(101.5, 'GBP'), 'about £1.02');
  assert.equal(money(-101.4, 'GBP'), 'about -£1.01');
  assert.equal(money(1_299.6, 'JPY'), 'about ¥1,300');
  assert.equal(money(Number.NaN, 'GBP'), 'GBP, an amount that could not be read');
});

test('A LINE IS CUT AT A WORD, with three dots, and a word with no space in its first half is cut where it stands', () => {
  assert.equal(clip('Short enough.', 40), 'Short enough.');
  assert.equal(clip('Sign off instances four to six once the mastering pass lands', 30), 'Sign off instances four to...');
  assert.equal(clip('Supercalifragilisticexpialidocious and more', 12), 'Supercali...');
  assert.equal(clip('Two\nlines​\tand a tab', 40), 'Two lines and a tab');
  for (const max of [10, 20, 40]) assert.ok([...clip('a sentence that runs on for a good while longer than it needs', max)].length <= max, String(max));
});

test('WHO SIGNED A LINE IS SAID IN WORDS, and never as an id', () => {
  const names = new Map([['p_ada', 'Ada'], ['sam', 'Sam']]);
  const runs = new Map([['S6', 'Claude Code']]);
  const cases: [string, string][] = [
    ['S6', 'Claude Code (S6)'],
    ['S9', 'An agent (S9)'],
    ['p_ada', 'Ada'],
    ['p_seed', 'BrainDog'],
    ['system', 'BrainDog'],
    ['p_zed', 'Someone you share with'],
    ['person:sam', 'Sam'],
    ['person:p_zed', 'Someone you share with'],
    ['slash', 'Slash'],
    ['agent:claude', 'Claude Code'],
    [`agent:${ROW}`, 'An agent'],
    ['rule:recurring-missed', 'The rule “Recurring missed”'],
    ['rule:handled', 'BrainDog'],
    ['rule:ladder', 'The trust rule'],
    ['ingest:bank-card-used-sms', 'The bank card used sms door'],
    [`rule:${ROW}`, 'An automation'],
    ['t_9f2a', 'An agent key'],
    [ROW, 'Someone you share with'],
  ];
  for (const [by, words] of cases) {
    const said = actorWords(by, names, runs);
    assert.equal(said, words, by);
    assert.doesNotMatch(said, ULID, by);
    assert.doesNotMatch(said, PERSON_ID, by);
  }
});

test('A RUN IS THE APP AND THE MACHINE A PERSON WOULD NAME, never the host name', () => {
  assert.equal(deviceOf('Maras-MacBook-Pro.local'), 'MacBook');
  assert.equal(deviceOf('DESKTOP-4KQ2M1'), 'Windows PC');
  assert.equal(deviceOf('studio'), null);
  assert.equal(runnerOf({ agent: 'claude', cwd: '/Users/studio/Code/kiln', host: 'Studio-MacBook-Air.local' }), 'Claude Code on MacBook');
  assert.equal(runnerOf({ agent: 'claude' }), 'Claude');
  assert.equal(runnerOf({ agent: 'claude', client: 'codex-cli', host: 'DESKTOP-1' }), 'Codex on Windows PC');
  assert.equal(runnerOf({}), 'An agent');
  /* AND THE PROFILE IT RUNS UNDER, BY NAME, where it is not the default one (migration 44). */
  assert.equal(runnerOf({ agent: 'claude', cwd: '/Users/studio/Code/kiln', host: 'Studio-MacBook-Air.local', seat: 'harbour' }), 'Claude Code as harbour on MacBook');
  assert.equal(runnerOf({ agent: 'claude', cwd: '/Users/studio/Code/kiln', host: 'Studio-MacBook-Air.local', seat: 'default' }), 'Claude Code on MacBook');
});

test('THE CLOSEST NAME IS ONE IN ANOTHER CASE OR NUMBER, THE START OF ONE, OR A TYPO AWAY, and nothing else', () => {
  const lists = [{ id: 'things', name: 'Projects' }, { id: 'tasks', name: 'Tasks' }, { id: 'obligations', name: 'Bills and invoices' }, { id: 'transactions', name: 'Ledger' }];
  assert.equal(closest('projects', lists), 'things');
  assert.equal(closest('Project', lists), 'things');
  assert.equal(closest('task', lists), 'tasks');
  assert.equal(closest('oblgations', lists), 'obligations');
  assert.equal(closest('ledg', lists), 'transactions');
  assert.equal(closest('t', lists), null);
  assert.equal(closest('weather', lists), null);
});

test('A CURSOR CARRIES NO ROW ID and comes back as the record wrote it', () => {
  const record = `2026-09-03T00:05:00.000Z|${ROW}`;
  const out = cursorOut(record)!;
  assert.match(out, /^c_[A-Za-z0-9_-]+$/u);
  assert.doesNotMatch(out, ULID);
  assert.equal(cursorIn(out), record);
  assert.equal(cursorIn(cursorOut(42)), 42);
  assert.equal(cursorOut('SG40'), 'SG40');
  assert.equal(cursorOut(null), undefined);
  assert.equal(cursorIn('c_%%%'), 'c_%%%');
});

test('TWO QUESTIONS THAT DIFFER BY THEIR IDS AND CASE ARE ONE, and two that differ by a word are two', () => {
  const a = 'bank-card-used-sms could not read account out of SG71. Accept it into transactions#4?';
  const b = 'Bank-IPN-out-SMS could not read account out of SG73. Accept it into transactions#9?';
  assert.equal(gist(a), gist(b));
  assert.notEqual(gist(a), gist('bank-card-used-sms could not read amount out of SG71. Accept it into transactions#4?'));
});

test('A DURATION IS SAID IN ITS FIELD\'S UNIT, from the whole seconds the record keeps', () => {
  assert.equal(durationSaid(17_280, 'd'), '0.2 days');
  assert.equal(durationSaid(86_400, 'd'), '1 day');
  assert.equal(durationSaid(2_700, 'm'), '45 minutes');
  assert.equal(durationSaid(5_400, undefined), '1.5 hours');
  assert.equal(durationSaid(30, undefined), '30 seconds');
});

test('A PAGE\'S NOTE IS SAID AS PROSE: no fenced block, money as money, no heading marks', () => {
  const note = '```chips\n● | 3 | cuts\n```\n\n# Kiln\n\nEarning. {{money:1840000 GBP}} in a year, {{pct:61}} direct.\n\n```bar | Revenue\nDirect | 1\n```\n\nIt carries it.';
  assert.equal(prose(note), 'Kiln. Earning. £18,400 in a year, 61% direct. It carries it.');
});

test('A NOTE SAYS NONE OF ITS OWN MARKUP: a link is its words, a mark in braces is in brackets, a heading has no number', () => {
  const note = '## 2 · The licensing question\n\nIt waits on you in [Needs you](/decide).\n\n- The share {estimate}; renewal is {unknown}.';
  assert.equal(prose(note), 'The licensing question. It waits on you in Needs you. - The share (estimate); renewal is (unknown).');
});

test('THE WHOLE ANSWER DROPS EVERY NULL KEY, and the empty lists that say nothing, and keeps a page that is empty', () => {
  assert.deepEqual(bare({ a: null, b: { c: null, d: 1 }, series: [1, null, 3], refusals: [], fx: { missing: [] }, rows: [], queue: [] }), {
    b: { d: 1 },
    series: [1, null, 3],
    fx: {},
    rows: [],
    queue: [],
  });
});

test('TWO AMOUNTS ON ONE LINE SAY WHICH IS WHICH, and one amount alone is the row\'s amount', () => {
  /* A PROJECT'S LINE READ "GBP 18,400.00 · GBP 14,120.00", a year's earnings and the year before's, with nothing to
     tell an agent which one to quote. */
  const decl = {
    id: 'things',
    name: 'Projects',
    title: 'name',
    mobile: ['name', 'revenue'],
    fields: [
      { id: 'name', type: 'text' },
      { id: 'revenue', type: 'money', label: 'Earned in a year' },
      { id: 'revenue_before', type: 'money', label: 'Earned the year before' },
    ],
  } as Decl;
  const look: Look = { now: Date.UTC(2026, 8, 22), decl: () => decl, title: () => undefined, actor: (by) => by, decider: 'Ada' };
  const both = { spoken: 'things#1', fields: { name: 'Kiln', revenue: { amount: 1_840_000, currency: 'GBP' }, revenue_before: { amount: 1_412_000, currency: 'GBP' } } };
  assert.equal(rowLine(both, 'things', look), 'Kiln (things#1) · earned in a year £18,400 · earned the year before £14,120');
  const one = { spoken: 'things#2', fields: { name: 'Marlow', revenue: { amount: 420_000, currency: 'GBP' } } };
  assert.equal(rowLine(one, 'things', look), 'Marlow (things#2) · £4,200');
});

test('A DAY IN WORDS IS THE RECORD\'S DAY: its zone, "friday" on a Friday is today, and 03/04 by its locale (RL8)', () => {
  /* 00:30 on Saturday 31 October in Cairo is 22:30 on Friday 30 October in Greenwich. */
  const late = Date.UTC(2026, 9, 30, 22, 30);
  assert.equal(dayInWords('today', late, { zone: 'Africa/Cairo' }), '2026-10-31');
  assert.equal(dayInWords('tomorrow', late, { zone: 'Africa/Cairo' }), '2026-11-01');
  assert.equal(dayInWords('today', late), '2026-10-30');
  const friday = Date.UTC(2026, 9, 30, 9);
  assert.equal(dayInWords('friday', friday), '2026-10-30');
  assert.equal(dayInWords('next friday', friday), '2026-11-06');
  assert.equal(dayInWords('03/04/2026', friday, { locale: 'en-US' }), '2026-03-04');
  assert.equal(dayInWords('03/04/2026', friday, { locale: 'en-GB' }), '2026-04-03');
  assert.equal(dayInWords('03/04/2026', friday, { locale: 'en' }), null);
  assert.equal(dayInWords('29/10/2026', friday, { locale: 'en' }), '2026-10-29');
  assert.equal(dayInWords('10/29/2026', friday, { locale: 'en' }), '2026-10-29');
});

test('MONEY IN A SENTENCE IS WRITTEN TO ITS CURRENCY\'S PLACES, as every answer writes it (RL11)', () => {
  assert.equal(moneyInText('Refund EUR 1.5 to Lina'), 'Refund €1.50 to Lina');
  assert.equal(moneyInText('Pay GBP 12.3 today'), 'Pay £12.30 today');
  assert.equal(moneyInText('Pay GBP 39.00?'), 'Pay £39?');
  assert.equal(moneyInText('JPY 100.5 is odd'), 'JPY 100.5 is odd');
});
