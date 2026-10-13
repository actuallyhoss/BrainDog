/**
 * What the first run says while it builds, held to the proposal it reads (`building.ts`): the parts and why each is on,
 * which parts are drawn (only those on), the sentence under the title (never a count), the places the build shows, the words marked, and the currencies offered with their reasons.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { useCase } from '@braindog/seed/usecases';

import { propose } from '../../lib/start/propose.ts';
import {
  added,
  casePart,
  cityOf,
  currencyChoices,
  entryOf,
  iconOfBecame,
  joinTurns,
  marksIn,
  missingIn,
  numberWord,
  partIcon,
  partsOf,
  placeIcon,
  placesFrom,
  statusOf,
  stepsOf,
  words,
  zoneCurrency,
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
  const invoice = money?.entries.find((e) => e.kind === 'money');
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

test('ONLY THE PARTS THAT ARE ON ARE DRAWN, in the order they were heard, and nothing is a step behind', () => {
  const heard = [
    { phrase: 'we bill Fenwick', became: 'Money' },
    { phrase: 'my shops', became: 'Projects' },
  ];
  const parts = partsOf({ offered: OFFERED, modules: ['portfolio', 'money-core', 'agents'], heard, rows: [], heldBy: () => null, byHand: new Set(['agents']), waiting: 'money-core' });
  const steps = stepsOf(parts);
  assert.ok(Array.isArray(steps), 'the build answers something besides its parts, which is where a count lived');
  assert.deepEqual(
    steps.map((p) => p.id),
    ['money-core', 'portfolio', 'agents'],
    'Money was heard first, then Projects; Agents was turned on by hand and comes after',
  );
  assert.ok(steps.every((p) => p.on), 'a part left off is drawn, and reads as a step not yet taken');
  assert.equal(steps.length, 3, 'the parts that are off are not in the build');
  /* NOTHING ABOUT THE BUILD IS A NUMBER: no parts done, no total, no step it is on. */
  for (const key of ['done', 'current', 'total', 'order']) assert.equal((steps as unknown as Record<string, unknown>)[key], undefined, `the build says ${key}`);
  assert.deepEqual(stepsOf(partsOf({ offered: OFFERED, modules: [], heard: [], rows: [], heldBy: () => null, byHand: new Set(), waiting: null })), []);
});

test('THE SENTENCE UNDER THE TITLE SAYS WHAT WAITS, never a count, and only the open question in red', () => {
  assert.deepEqual(statusOf('which of pounds and dollars is home'), {
    before: '',
    needs: 'One question left',
    after: ': which of pounds and dollars is home.',
  });
  const done = statusOf(null);
  assert.equal(done.needs, '', 'nothing waits, so nothing is red');
  assert.match(done.before, /^Nothing left to ask/u);
  assert.match(statusOf(null, true).before, /^Nothing is on yet\./u);
  assert.equal(statusOf.length, 1, 'the sentence takes a number of parts again');
  for (const s of [statusOf('which currency'), done, statusOf(null, true)])
    assert.doesNotMatch(`${s.before}${s.needs}${s.after}`, /\b(of (two|three|four|five|six|seven|\d+))\b|\d+ of \d+/iu, 'the sentence counts parts');
  assert.equal(numberWord(12), '12');
  assert.equal(numberWord(3, true), 'Three');
});

test('WHAT WAS SAID IS MARKED PHRASE BY PHRASE, in order, and a phrase not found is skipped rather than guessed', () => {
  const said = "I'm Sam, I run Kiln and we bill Fenwick";
  const p = propose(said, ctx);
  const runs = marksIn(said, p.heard, p.name);
  assert.equal(runs.map((r) => r.text).join(''), said, 'the runs put the sentence back together exactly');
  assert.ok(runs.some((r) => r.text === 'Kiln' && r.became === 'Projects'));
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

/* ── the build beside the words (use case 6, step 2) ───────────────────── */

const MARIAM = "I'm Mariam. I run a small candle shop in Alexandria and freelance as a designer. I lose track of orders and who owes me.";

test('THE BUILD IS HEADED BY HER TITLE, AND TODAY IS THE FIRST PLACE, each with its own glyph', () => {
  const p = propose(MARIAM, ctx);
  assert.equal(p.title, "Mariam's Candles", 'the build is headed by what the record will be called');
  const places = placesFrom(p.places, []);
  assert.equal(places[0]?.kind, 'today', 'Today is not first');
  assert.equal(placeIcon(places[0]!), 'today');
  const names = places.map((x) => x.name);
  for (const want of ['Orders', 'Products']) assert.ok(names.includes(want), `${want} is not among her places: ${names.join(', ')}`);
  assert.equal(placeIcon({ kind: 'list', id: 'orders' }), 'task', 'Orders wears the glyph its use case declares');
  assert.equal(placeIcon({ kind: 'module', id: 'money-core' }), partIcon('money-core'));
  assert.equal(placeIcon({ kind: 'list', id: 'nobody-declares-this' }), 'doc');
});

test('WITH NO PLACES READ, THE BUILD IS TODAY AND EACH PART THAT IS ON, and never a part left off', () => {
  const parts = partsOf({ offered: OFFERED, modules: ['people', 'money-core'], heard: [], rows: [], heldBy: () => null, byHand: new Set(), waiting: null });
  const places = placesFrom(undefined, parts);
  assert.deepEqual(
    places.map((x) => x.id),
    ['today', 'people', 'money-core'],
  );
  assert.deepEqual(placesFrom([], parts).map((x) => x.id), ['today', 'people', 'money-core']);
});

test('THE BUILD SAYS NO COUNT, AND NAMES NO SAMPLE AS HERS', () => {
  const said = [words.yours, words.asYouType, words.startsEmpty, words.onReading(['People', 'Money'], 'Money'), words.onReading([], 'Money')];
  for (const line of said) {
    assert.doesNotMatch(line, /\d+ of \d+|\bof (two|three|four|five|six)\b/iu, `a count: ${line}`);
    assert.doesNotMatch(line, /\brows?\b|—/u, `a word a person should not read: ${line}`);
  }
  assert.equal(words.startsEmpty, 'Each place starts empty and fills with what you tell it. No sample entries.');
  for (const gone of ['parts', 'lightsUp', 'progress']) assert.equal((words as Record<string, unknown>)[gone], undefined, `the words of a counted build are back: ${gone}`);
});

test('THE ZONE\'S ONE CURRENCY: EGP in Cairo, the euro in Berlin, and none where the zone keeps no region or two', () => {
  const zones = { codes: Object.keys(NAMES), zonesOf: (r: string) => ZONES[r] ?? null };
  assert.equal(zoneCurrency('Africa/Cairo', zones), 'EGP');
  assert.equal(zoneCurrency('Europe/Berlin', zones), 'EUR');
  assert.equal(zoneCurrency('UTC', zones), null, 'no region keeps UTC');
  assert.equal(zoneCurrency(null, zones), null);
  assert.equal(zoneCurrency('  ', zones), null);
  const two = { codes: ['CUP', 'CUC'], zonesOf: (r: string) => (r === 'CU' ? ['America/Havana'] : null) };
  assert.equal(zoneCurrency('America/Havana', two), null, 'a region with two currencies gives neither');
  /* THE BROWSER'S OWN ANSWERS, as the sign-up asks them: her device in Alexandria keeps Cairo time. */
  assert.equal(zoneCurrency('Africa/Cairo'), 'EGP');
});

test('HER WORDS AS THE BUILD SAYS THEM: the shop by its lists, Clients for People, Money in her currency', () => {
  const p = propose(MARIAM, { ...ctx, currency: zoneCurrency('Africa/Cairo') });
  const shop = useCase('shop');
  assert.ok(shop);
  assert.deepEqual(casePart(shop, p.heard, false).why, ['a small candle shop', 'orders'], 'the shop is not lit by the lines that name its lists');
  const parts = partsOf({ offered: OFFERED, modules: p.modules, heard: p.heard, rows: p.rows, heldBy: () => null, byHand: new Set(), waiting: null, names: p.names });
  assert.deepEqual(parts.find((x) => x.id === 'people')?.why, ['freelance as a designer'], 'Clients is People in her word');
  assert.deepEqual(parts.find((x) => x.id === 'money-core')?.why, ['who owes me']);
  assert.equal(iconOfBecame('Clients and Invoices', p.names), partIcon('people'));
  assert.equal(iconOfBecame('Money, in EGP'), partIcon('money-core'));
  assert.equal(iconOfBecame('Orders and Products'), placeIcon({ kind: 'list', id: 'orders' }));
});

test('A PHRASE FOLDED INTO A LINE AND SAID APART LIGHTS TOO, and only where the line itself sits in this sentence', () => {
  const said = 'who owes me, a studio, and taxes';
  const line = { phrase: 'who owes me', became: 'Money', at: [0, 11] as [number, number], more: [[27, 32] as [number, number]] };
  assert.deepEqual(marksIn(said, [line], null), [
    { text: 'who owes me', became: 'Money' },
    { text: ', a studio, and ', became: null },
    { text: 'taxes', became: 'Money' },
  ]);
  /* A later turn drawn on its own: the line's place is in another sentence, so its other span is not trusted. */
  assert.deepEqual(marksIn('and who owes me, since March', [line], null), [
    { text: 'and ', became: null },
    { text: 'who owes me', became: 'Money' },
    { text: ', since March', became: null },
  ]);
});

test('A BILL SAYS WHICH WAY THE MONEY GOES, in the words its own list uses, and never who owes whom', () => {
  const bill = (direction: string) =>
    entryOf({ register: 'obligations', fields: { what: 'Studio rent', direction, amount: { amount: 40000, currency: 'GBP' }, due: '2026-12-01', state: 'open' } } as Parameters<typeof entryOf>[0]);
  assert.equal(bill('owed_to_me').detail, 'Money in');
  assert.equal(bill('owed_by_me').detail, 'Money out');
  assert.equal(bill('owed_to_me').kind, 'money');
  assert.deepEqual(bill('owed_by_me').amount, { minor: 40000, currency: 'GBP' });
  /* The stored value `owed_to_me` is one word to this search, so only something a person could read is caught. */
  const source = readFileSync(new URL('./building.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bowe[sd]?\b/iu, 'the first run frames money around who owes whom');
});
