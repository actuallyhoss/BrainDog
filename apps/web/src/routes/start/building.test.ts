/**
 * What the first run says while it builds, held to the proposal it reads (`building.ts`): the parts and why each is on,
 * the progress order, the sentence under the title, the words marked, and the currencies offered with their reasons.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { propose } from '../../lib/start/propose.ts';
import {
  added,
  cityOf,
  currencyChoices,
  iconOfBecame,
  joinTurns,
  marksIn,
  missingIn,
  numberWord,
  partIcon,
  partsOf,
  statusOf,
  stepsOf,
  type CurrencyEnv,
} from './building.ts';

const ctx = { zone: 'Africa/Cairo', locale: 'en-US' };
const OFFERED = ['portfolio', 'people', 'money-core', 'estate', 'work', 'agents'];

test('A PART IS ON FOR THE PHRASE THAT ASKED FOR IT, and holds the entries the sentence filled', () => {
  const p = propose("I'm Sam, I run Kiln and we bill Fenwick £2,000 a month on the 1st", ctx);
  const parts = partsOf({ offered: OFFERED, modules: p.modules, heard: p.heard, rows: p.rows, heldBy: () => null, byHand: new Set(), waiting: null });
  const money = parts.find((x) => x.id === 'money-core');
  assert.ok(money?.on);
  assert.equal(money?.state, 'heard');
  assert.ok(money?.why.includes('bill'), 'Money says the word that turned it on');
  const invoice = money?.entries.find((e) => e.kind === 'owed');
  assert.equal(invoice?.title, 'Monthly invoice to Fenwick');
  assert.deepEqual(invoice?.amount, { minor: 200000, currency: 'GBP' });
  assert.match(invoice?.due ?? '', /^\d{4}-\d{2}-01$/u);
  const portfolio = parts.find((x) => x.id === 'portfolio');
  assert.deepEqual(portfolio?.entries.map((e) => e.title), ['Kiln']);
  const people = parts.find((x) => x.id === 'people');
  assert.equal(people?.entries[0]?.detail, 'Client');
  assert.equal(parts.find((x) => x.id === 'agents')?.on, false, 'a part nothing asked for stays off');
  assert.ok((money?.lists.length ?? 0) > 3, 'a part says what its lists are called, read off the module');
});

test('EACH PART WEARS THE GLYPH ITS OWN PAGE DECLARES, never one the screen names for it', () => {
  for (const id of OFFERED) assert.notEqual(partIcon(id), 'doc', `${id} declares a page with a glyph, and the screen drew the fallback`);
  assert.equal(partIcon('money-core'), 'money');
  assert.equal(partIcon('somebody-elses-pack'), 'doc');
  assert.equal(iconOfBecame('People and Money'), partIcon('people'));
  assert.equal(iconOfBecame('Small business'), 'home');
});

test('WHY A PART IS ON: a use case, the person, or the answer it waits on', () => {
  const parts = partsOf({
    offered: OFFERED,
    modules: ['portfolio', 'people', 'money-core', 'work'],
    heard: [],
    rows: [],
    heldBy: (id) => (id === 'portfolio' ? 'Solo founder' : null),
    byHand: new Set(['work']),
    waiting: 'money-core',
  });
  assert.equal(parts.find((x) => x.id === 'portfolio')?.state, 'held');
  assert.equal(parts.find((x) => x.id === 'portfolio')?.held, 'Solo founder');
  assert.equal(parts.find((x) => x.id === 'work')?.state, 'hand');
  assert.equal(parts.find((x) => x.id === 'money-core')?.state, 'waiting');
  assert.equal(parts.find((x) => x.id === 'estate')?.state, 'off');
});

test('THE PROGRESS BAR DRAWS MADE, THEN WAITING, THEN OFF, so its cells sit together', () => {
  const parts = partsOf({ offered: OFFERED, modules: ['portfolio', 'money-core', 'agents'], heard: [], rows: [], heldBy: () => null, byHand: new Set(), waiting: 'money-core' });
  const s = stepsOf(parts);
  assert.deepEqual(
    s.order.map((p) => p.id),
    ['portfolio', 'agents', 'money-core', 'people', 'estate', 'work'],
  );
  assert.equal(s.done, 2);
  assert.equal(s.current, true);
  assert.equal(stepsOf(partsOf({ offered: OFFERED, modules: ['portfolio'], heard: [], rows: [], heldBy: () => null, byHand: new Set(), waiting: null })).current, false);
});

test('THE SENTENCE UNDER THE TITLE: the count in words, and only the open question in red', () => {
  assert.deepEqual(statusOf(4, 6, 'which of pounds and dollars is home'), {
    before: 'Four of six parts are on. ',
    needs: 'One question left',
    after: ': which of pounds and dollars is home.',
  });
  const done = statusOf(1, 6, null);
  assert.equal(done.needs, '', 'nothing waits, so nothing is red');
  assert.match(done.before, /^One of six parts is on\. Nothing left to ask/u);
  assert.match(statusOf(0, 6, null).before, /^Nothing is on yet\./u);
  assert.equal(numberWord(12), '12');
  assert.equal(numberWord(3, true), 'Three');
});

test('WHAT WAS SAID IS MARKED PHRASE BY PHRASE, in order, and a phrase not found is skipped rather than guessed', () => {
  const said = "I'm Sam, I run Kiln and we bill Fenwick";
  const p = propose(said, ctx);
  const runs = marksIn(said, p.heard, p.name);
  assert.equal(runs.map((r) => r.text).join(''), said, 'the runs put the sentence back together exactly');
  assert.ok(runs.some((r) => r.text === 'Kiln' && r.became === 'Portfolio'));
  assert.ok(runs.some((r) => r.text === 'Sam' && r.became !== null), 'the name is marked too');
  const lost = marksIn('abc', [{ phrase: 'zzz', became: 'Money' }], null);
  assert.deepEqual(lost, [{ text: 'abc', became: null }]);
});

test('A LATER TURN IS ITS OWN SENTENCE, and what it added is what was not heard before', () => {
  assert.equal(joinTurns('I run Kiln', 'we bill Fenwick'), 'I run Kiln. we bill Fenwick');
  assert.equal(joinTurns('I run Kiln.', 'We bill Fenwick'), 'I run Kiln. We bill Fenwick');
  assert.equal(joinTurns('', 'Hello'), 'Hello');
  const one = propose('I run Kiln', ctx);
  const two = propose(joinTurns('I run Kiln', 'I invoice clients £500 a month'), ctx);
  const more = added(one.heard, two.heard);
  assert.ok(more.length > 0);
  assert.ok(!more.some((h) => h.phrase === 'Kiln'), 'what was already heard is not said again');
});

test('AN ENTRY BEGUN AND LEFT SHORT SAYS WHICH FACT IT NEEDS', () => {
  const short = missingIn('We invoice Fenwick every month', '2026-09-29');
  assert.equal(short.length, 1);
  assert.deepEqual(short[0]?.missing.sort(), ['amount', 'due']);
  assert.deepEqual(missingIn('We invoice Fenwick £2,000 a month on the 1st', '2026-09-29'), []);
});

/* ── the currency ─────────────────────────────────────────────────────── */

const NAMES: Record<string, string> = {
  EGP: 'Egyptian Pound',
  GBP: 'British Pound',
  GIP: 'Gibraltar Pound',
  USD: 'US Dollar',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar',
  EUR: 'Euro',
  BRL: 'Brazilian Real',
  KRW: 'South Korean Won',
  CHF: 'Swiss Franc',
};
const ZONES: Record<string, string[]> = {
  EG: ['Africa/Cairo'],
  GB: ['Europe/London'],
  US: ['America/New_York', 'America/Chicago'],
  CA: ['America/Toronto'],
  CH: ['Europe/Zurich'],
  DE: ['Europe/Berlin'],
};

const env = (over: Partial<CurrencyEnv>): CurrencyEnv => ({
  codes: Object.keys(NAMES),
  nameOf: (c) => NAMES[c] ?? c,
  englishOf: (c) => NAMES[c] ?? c,
  regions: ['US'],
  zone: 'Africa/Cairo',
  zonesOf: (r) => ZONES[r] ?? null,
  regionName: (r) => ({ US: 'United States', GB: 'United Kingdom' })[r] ?? r,
  ...over,
});

test('POUNDS AND DOLLARS, IN CAIRO ON AN AMERICAN BROWSER: the Egyptian pound, then the US dollar, and each says why', () => {
  const ask = currencyChoices('Money is pounds and dollars', env({}));
  assert.deepEqual(
    ask.choices.map((c) => c.code),
    ['EGP', 'USD'],
    'only the currencies a fact points at; a British pound is one search away, not a guess',
  );
  assert.equal(ask.suggested, 'EGP');
  assert.equal(ask.choices[0]?.why, 'you said pounds and this device keeps Cairo time');
  assert.equal(ask.choices[1]?.why, 'you said dollars and this device is set to United States');
  assert.deepEqual(ask.said, ['pounds', 'dollars']);
});

test('NOTHING SAID: the device suggests, zone before language', () => {
  const ask = currencyChoices('I run a bakery and invoice clients', env({}));
  assert.deepEqual(ask.choices.map((c) => c.code), ['EGP', 'USD']);
  assert.equal(ask.suggested, 'EGP');
  const london = currencyChoices('I freelance', env({ regions: ['GB'], zone: 'Europe/London' }));
  assert.deepEqual(london.choices.map((c) => c.code), ['GBP']);
  assert.equal(london.choices[0]?.why, 'this device keeps London time', 'one fact is said once');
});

test('WHAT WAS SAID OUTRANKS THE DEVICE, and a word that fits several is searched for rather than guessed', () => {
  const euros = currencyChoices('We are paid in euros', env({ zone: 'America/New_York' }));
  assert.equal(euros.suggested, 'EUR');
  assert.equal(euros.choices[0]?.code, 'EUR');
  const dollars = currencyChoices('I get paid in dollars', env({ regions: ['GB'], zone: 'Europe/London' }));
  assert.equal(dollars.suggested, null, 'they said dollars, so the pound is not suggested to them');
  assert.equal(dollars.find, 'dollar');
});

test('A EUROPEAN ZONE WITH NO CURRENCY OF ITS OWN IS THE EURO, and everyday words are never currencies', () => {
  const berlin = currencyChoices('I sell prints', env({ regions: ['DE'], zone: 'Europe/Berlin' }));
  assert.equal(berlin.suggested, 'EUR');
  const real = currencyChoices('We won a real contract', env({}));
  assert.deepEqual(real.said, [], '"real" and "won" are words here, not the Brazilian real or the Korean won');
});

test('A BROWSER WITH NO ZONES STILL ANSWERS FROM ITS LANGUAGE', () => {
  const ask = currencyChoices('', env({ zonesOf: () => null }));
  assert.deepEqual(ask.choices.map((c) => c.code), ['USD']);
  assert.equal(cityOf('America/New_York'), 'New York');
});
