/**
 * A HEADLINE SAYS A NUMBER AS A HOLE, NEVER AS A DIGIT (decision 3 check 3), and a page is owed a new look
 * minutes after its basis moves.
 *
 * The model is handed each figure with its id and writes `{{id}}` where the number goes. The record fills the hole from
 * what it handed, so a line cannot say a number the page does not show, nor a right number in a wrong sentence it typed
 * itself. A digit, a number in words, or a hole naming a figure the page was not handed drops the line to the rules'.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  filledHeadline,
  HEADLINE_ASKS_DAY,
  HEADLINE_MOST,
  HEADLINE_OWED_MS,
  HEADLINE_PAGES_MOST,
  handedHoles,
  headlineFault,
  holedRules,
  HOME_PAGE,
  owedOn,
  owedPages,
  owedSince,
  storedHeadline,
  type HeadlinePage,
  type OwedBasis,
} from '../src/headlines.ts';

const MONEY: HeadlinePage = {
  page: 'money',
  title: 'Money',
  rules: 'Cash is GBP 33,850.00 across 2 accounts.',
  figures: [
    { id: 'cash-now', value: 'GBP 33,850.00', change: '+8%' },
    { id: 'accounts.count', value: '2' },
  ],
  items: [{ title: 'Renew the 2027 domains', when: 'late' }],
};

test('EVERY FIGURE IS HANDED WITH ITS ID, and how far it moved is a hole of its own', () => {
  assert.deepEqual([...handedHoles(MONEY).keys()].sort(), ['accounts.count', 'cash-now', 'cash-now.change']);
  assert.equal(handedHoles(MONEY).get('cash-now.change'), '+8%');
});

test('A LINE HOLDING THE HOLE OF A HANDED FIGURE IS KEPT, and it is filled from what was handed', () => {
  const line = 'Cash stands at {{cash-now}}, {{ cash-now.change }} on a month ago.';
  assert.equal(headlineFault(line, MONEY), null);
  assert.equal(filledHeadline(line, MONEY), 'Cash stands at GBP 33,850.00, +8% on a month ago.');
  /* A LINE WITH NO NUMBER IN IT IS A LINE AS IT ALWAYS WAS. */
  assert.equal(headlineFault('Cash is steady and nothing is late.', MONEY), null);
  assert.equal(filledHeadline('Cash is steady and nothing is late.', MONEY), 'Cash is steady and nothing is late.');
  /* AND A THING OF THEIR OWN IS NAMED BY ITS TITLE, digits and all: the title is theirs, not a figure. */
  assert.equal(headlineFault('Renew the 2027 domains is late.', MONEY), null);
});

test('ANY TYPED DIGIT IS A FAULT THAT NAMES IT, even one the page shows, and so is a number in words', () => {
  assert.match(headlineFault('Cash is GBP 33,850.00 across 2 accounts.', MONEY) ?? '', /typed 33,850\.00/u);
  assert.match(headlineFault('{{cash-now}} across 2 accounts.', MONEY) ?? '', /typed 2\b/u);
  assert.match(headlineFault('Up 9% on a month ago.', MONEY) ?? '', /typed 9/u);
  assert.match(headlineFault('{{cash-now}} across two accounts.', MONEY) ?? '', /typed two/u);
  /* EVERY SUCH FAULT SAYS WHOSE LINE IT WAS, in the page's own name. */
  assert.match(headlineFault('Up 9% on a month ago.', MONEY) ?? '', /^The line for Money /u);
});

test('"ONE" AFTER "THE" IS A THING AND NOT A COUNT, and a count in words is still a typed number', () => {
  assert.equal(headlineFault('Renew the 2027 domains is the late one.', MONEY), null);
  assert.equal(headlineFault('Cash is steady, and the one to watch is the renewal.', MONEY), null);
  assert.match(headlineFault('One account is short.', MONEY) ?? '', /typed one/u);
  /* ONLY INSIDE ONE CLAUSE: a count after a comma is a count, and so is one said after another number. */
  assert.match(headlineFault('Renew the 2027 domains, one is late.', MONEY) ?? '', /typed one/u);
  assert.match(headlineFault('Cash is steady across the two accounts.', MONEY) ?? '', /typed two/u);
});

test('A HOLE STANDS AS A WORD OF ITS OWN, so no two figures are joined into a number neither holds', () => {
  for (const line of ['{{accounts.count}}{{accounts.count}} accounts.', 'Up {{accounts.count}}.{{accounts.count}} on a month ago.', '{{accounts.count}}k in hand.', 'Plan v{{accounts.count}} is live.'])
    assert.match(headlineFault(line, MONEY) ?? '', /joined a figure to what is beside it/u, line);
  assert.equal(headlineFault('({{cash-now}}) across {{accounts.count}}, {{cash-now.change}} up.', MONEY), null);
});

test('A DIGIT OF ANY SCRIPT IS A TYPED NUMBER, and so is a count the model worked out in words', () => {
  for (const line of ['Cash across \uFF12 accounts.', 'Cash across \u0663 accounts.', 'Cash is up \u00B2.']) assert.match(headlineFault(line, MONEY) ?? '', / typed /u, line);
  assert.match(headlineFault('Both accounts are steady.', MONEY) ?? '', /typed both/u);
  assert.match(headlineFault('Zero accounts are short.', MONEY) ?? '', /typed zero/u);
  /* "NO ONE" IS NOBODY, not a count. */
  assert.equal(headlineFault('No one is waiting on a reply.', MONEY), null);
});

test('WHAT FILLS A HOLE IS NEVER READ AGAIN AS A LINE: a value is put in once, as it was handed', () => {
  const page: HeadlinePage = { ...MONEY, figures: [{ id: 'a', value: '{{b}} $& 3' }, { id: 'b', value: '9' }] };
  assert.equal(filledHeadline('Now {{a}}.', page), 'Now {{b}} $& 3.');
  /* THE SAME HOLE TWICE IS THE SAME FIGURE TWICE. */
  assert.equal(filledHeadline('{{b}} and {{b}}.', page), '9 and 9.');
});

test('A LINE IS KEPT FILLED: a pref with a hole still in it is no line a page may draw', () => {
  const kept = { text: 'Cash stands at GBP 33,850.00.', day: '2026-10-14', basis: 'b1' };
  assert.deepEqual(storedHeadline(kept), kept);
  assert.equal(storedHeadline({ ...kept, text: 'Cash stands at {{cash-now}}.' }), null);
});

test('THE RULES LINE WITH ITS NUMBERS AS HOLES IS A LINE THAT IS KEPT, and it fills back to itself', () => {
  assert.equal(holedRules(MONEY), 'Cash is {{cash-now}} across {{accounts.count}} accounts.');
  assert.equal(headlineFault(holedRules(MONEY), MONEY), null);
  assert.equal(filledHeadline(holedRules(MONEY), MONEY), MONEY.rules);
  /* A SHORT FIGURE IS NEVER TAKEN OUT OF A LONGER NUMBER, and a figure whose id holds a digit is not written into twice. */
  const page: HeadlinePage = {
    page: 'bake',
    title: 'Bake',
    rules: 'GBP 2,400.00 owed across 2 orders, 12 this month.',
    figures: [
      { id: 'q2-orders', value: '2' },
      { id: 'owed', value: 'GBP 2,400.00' },
      { id: 'month', value: '12' },
    ],
  };
  assert.equal(holedRules(page), '{{owed}} owed across {{q2-orders}} orders, {{month}} this month.');
  assert.equal(filledHeadline(holedRules(page), page), page.rules);
  /* NOR OUT OF A WORD: a name that holds the same digit keeps it. */
  assert.equal(holedRules({ ...page, rules: 'Plan v2 has 2 orders.' }), 'Plan v2 has {{q2-orders}} orders.');
  /* A LINE WITH NO NUMBER IS ITSELF. */
  assert.equal(holedRules({ ...MONEY, rules: 'Nothing is late.' }), 'Nothing is late.');
});

test('A HOLE NAMING A FIGURE THE PAGE WAS NOT HANDED IS A FAULT, and nothing fills it', () => {
  assert.match(headlineFault('Owed {{owed-to-you}} this month.', MONEY) ?? '', /owed-to-you, which is not one of its figures/u);
  assert.equal(filledHeadline('Owed {{owed-to-you}} this month.', MONEY), null);
  /* A FIGURE HANDED WITH NO CHANGE HAS NO CHANGE TO SAY. */
  assert.match(headlineFault('{{accounts.count.change}} accounts.', MONEY) ?? '', /accounts\.count\.change/u);
});

test('WHAT WAS A FAULT STILL IS: a brace left over, markup, the system’s words, and a line too long once filled', () => {
  assert.match(headlineFault('Cash is {cash-now}.', MONEY) ?? '', /not one plain sentence/u);
  assert.match(headlineFault('**{{cash-now}}** in hand.', MONEY) ?? '', /not one plain sentence/u);
  assert.match(headlineFault('{{cash-now}} in the rows of your list.', MONEY) ?? '', /system's words/u);
  assert.match(headlineFault('', MONEY) ?? '', /wrote no line/u);
  const long = `${'x'.repeat(HEADLINE_MOST - 13)} {{cash-now}}`;
  assert.ok(long.length <= HEADLINE_MOST);
  assert.match(headlineFault(long, MONEY) ?? '', /longer than 140/u);
});

test('HOME’S LINE IS HELD TO WHAT WAITS AFTER ITS HOLES ARE FILLED', () => {
  const home: HeadlinePage = {
    page: HOME_PAGE,
    title: 'Today',
    rules: '25 things need you, and 10 are late.',
    figures: [
      { id: 'needs-you', value: '25' },
      { id: 'late', value: '10' },
      { id: 'working', value: '1' },
    ],
  };
  assert.equal(headlineFault('{{needs-you}} things need you, and {{working}} agent is working.', home), null);
  assert.match(headlineFault('{{needs-you}} agents are working.', home) ?? '', /which is not what waits/u);
  assert.match(headlineFault('Nothing needs you today.', home) ?? '', /which is not what waits/u);
});

test('THE DAY’S CAP IS EIGHT ASKS, where it was two', () => {
  assert.equal(HEADLINE_ASKS_DAY, 8);
});

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 14, 9, 0);

test('A PAGE IS OWED A LOOK WHEN ITS BASIS MOVED, and the ask waits fifteen minutes from the first', () => {
  assert.equal(HEADLINE_OWED_MS, 15 * MIN);
  const bases: OwedBasis[] = [
    { page: 'money', basis: 'b2', at: 'b1', since: T0 },
    { page: 'desk', basis: 'd1', at: 'd1', since: T0 },
    { page: 'bake', basis: 'k1', since: T0 + 10 * MIN },
  ];
  /* NOTHING UNTIL FIFTEEN MINUTES AFTER THE FIRST WAS OWED, so a burst of writes is one ask and not one a write. */
  assert.deepEqual(owedPages(bases, T0), []);
  assert.deepEqual(owedPages(bases, T0 + 15 * MIN - 1), []);
  /* THEN EVERY OWED PAGE GOES IN THE ONE ASK, the longest owed first, the later one with it. A still page is not owed. */
  assert.deepEqual(owedPages(bases, T0 + 15 * MIN), ['money', 'bake']);
  /* A PAGE NEVER WRITTEN FOR (no `at`) IS OWED, and a record where nothing moved owes nothing however long it waits. */
  assert.deepEqual(owedPages([{ page: 'desk', basis: 'd1', at: 'd1', since: T0 }], T0 + 24 * 60 * MIN), []);
  assert.deepEqual(owedPages([], T0), []);
});

test('AT MOST TWENTY-FOUR PAGES GO IN ONE ASK, the longest owed first', () => {
  const many: OwedBasis[] = Array.from({ length: 30 }, (_, i) => ({ page: `p${String(i).padStart(2, '0')}`, basis: 'new', at: 'old', since: T0 + (29 - i) * 1000 }));
  const out = owedPages(many, T0 + 16 * MIN);
  assert.equal(out.length, HEADLINE_PAGES_MOST);
  assert.equal(out.length, 24);
  assert.equal(out[0], 'p29');
  assert.ok(!out.includes('p00'));
});

test('WHEN EACH PAGE WAS FIRST OWED IS KEPT ACROSS TICKS: a second write does not start the wait again', () => {
  const first = owedSince({}, [{ page: 'money', basis: 'b2', at: 'b1' }, { page: 'desk', basis: 'd1', at: 'd1' }], T0);
  assert.deepEqual(first, [{ page: 'money', basis: 'b2', at: 'b1', since: T0 }]);
  const kept = owedOn(Object.fromEntries(first.map((o) => [o.page, o.since])));
  /* THE BASIS MOVES AGAIN TEN MINUTES ON: still owed since the first time, so the ask is five minutes off, not fifteen. */
  const second = owedSince(kept, [{ page: 'money', basis: 'b3', at: 'b1' }, { page: 'bake', basis: 'k1' }], T0 + 10 * MIN);
  assert.deepEqual(second.map((o) => [o.page, o.since]), [['money', T0], ['bake', T0 + 10 * MIN]]);
  assert.deepEqual(owedPages(second, T0 + 15 * MIN), ['money', 'bake']);
  /* ONCE ITS LINE IS WRITTEN AT THE BASIS IT HAS, IT IS OWED NOTHING AND ITS WAIT IS FORGOTTEN. */
  assert.deepEqual(owedSince(kept, [{ page: 'money', basis: 'b3', at: 'b3' }], T0 + 20 * MIN), []);
  /* A PREF THAT IS NOT ONE IS NO WAITS AT ALL. */
  assert.deepEqual(owedOn('nonsense'), {});
  assert.deepEqual(owedOn({ money: 'soon', desk: T0 }), { desk: T0 });
});
