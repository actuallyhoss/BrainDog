/**
 * What `ratesPollPack` may turn into a daily call, and what it refuses to (`src/packs/rates-poll.ts`).
 *
 * THE PACK IS APPROVED BEFORE IT IS RUN, WHICH IS EXACTLY WHY THE BUILDER HAS TO CHECK THE SPEC. A poll pack goes in
 * front of the owner on Decide as one line, `CALLS OUT open.er-api.example · every 1d · grant "none"`, and that line
 * says nothing about which currencies the map fills. Three degenerate specs were measured against a real record
 * before this file was written, and none of them was caught by the plan the owner reads:
 *
 * - The base quoted against itself installed and wrote `USD, USD, 1` into `fx` every day. `packages/kernel/src/fx.ts`
 *   drops a row whose two codes are the same, so the row is not a rate and never becomes one; it is a line in the
 *   owner's Exchange rates list that means nothing.
 * - The same currency twice installed and wrote `USD, EGP, 50` twice a day, so the list grows two identical rows a
 *   day for as long as the poll is approved.
 * - An empty list of currencies built a pack whose summary read "for what one USD is worth in ." and whose plan line
 *   was the ordinary CALLS OUT one. It was refused, but only by `install`, and only after the owner had approved it.
 *
 * The run's other half, that an approved pack polls an address and fills `fx`, is `founder-poll.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise } from '@braindog/declare';
import { validateDeclaration } from '@braindog/kernel';

import { ratesPollPack, RATES_CURRENCIES_MOST, type RatesSpec } from '../src/packs/rates-poll.ts';

const SPEC: RatesSpec = {
  id: 'open-er',
  url: 'https://open.er-api.example/v6/latest/USD',
  every: '1d',
  base: 'USD',
  rates: [{ currency: 'EGP', path: 'rates.EGP' }],
};

/** The map of the one declaration a rates pack holds. */
const mapOf = (doc: Record<string, unknown>): Record<string, { value?: unknown; path?: unknown }>[] =>
  ((doc.declarations as { map: Record<string, { value?: unknown; path?: unknown }>[] }[])[0]!).map;

/* CODES NOBODY MINTS, so that a test about how MANY currencies a poll fills is not also a list of what currencies
   there are. `ingest.test.ts`'s membership guard counts real codes quoted in a file, and it is right to. */
const many = (n: number): RatesSpec['rates'] => Array.from({ length: n }, (_, i) => ({ currency: `XX${String.fromCharCode(65 + i)}`, path: `rates.XX${String.fromCharCode(65 + i)}` }));

test('ONE ROW A CURRENCY, quoted the way `fx` reads a rate: one of the base is worth this many of the other', () => {
  const doc = ratesPollPack({ ...SPEC, rates: [{ currency: 'egp', path: 'rates.EGP' }, { currency: 'GBP', path: 'rates.GBP' }] });
  assert.deepEqual(
    mapOf(doc).map((m) => [m.currency?.value, m.base?.value, m.rate?.path]),
    [
      ['USD', 'EGP', 'rates.EGP'],
      ['USD', 'GBP', 'rates.GBP'],
    ],
  );
  assert.equal(doc.summary, 'Polls open.er-api.example every 1d for what one USD is worth in EGP, GBP.');
});

test('A CURRENCY ASKED FOR TWICE IS ONE ROW, and the base asked for against itself is none', () => {
  const doc = ratesPollPack({ ...SPEC, rates: [{ currency: 'USD', path: 'rates.USD' }, { currency: 'EGP', path: 'rates.EGP' }, { currency: 'egp', path: 'rates.EGP' }] });
  assert.deepEqual(
    mapOf(doc).map((m) => m.base?.value),
    ['EGP'],
  );
  assert.equal(doc.summary, 'Polls open.er-api.example every 1d for what one USD is worth in EGP.');
});

test('A POLL THAT COULD NEVER WRITE A RATE IS NOT BUILT, so nobody is asked to approve a call out that does nothing', () => {
  for (const rates of [[], [{ currency: 'USD', path: 'rates.USD' }], [{ currency: 'nope', path: 'rates.nope' }]])
    assert.throws(() => ratesPollPack({ ...SPEC, rates }), /currency/u, `built a pack from ${JSON.stringify(rates)}`);
  /* AND THE CURRENCY THE WHOLE ANSWER IS QUOTED AGAINST IS CHECKED THE SAME WAY, which nothing here held until the
     base's own guard was deleted and this file run: the other three tests stayed green, and
     `ratesPollPack({ ...SPEC, base: 'us' })` built a poll summarised "for what one US is worth in EGP" whose every
     `fx` row would have carried `US` as its currency, which is a code no rate is ever quoted in. */
  for (const base of ['', 'us', 'DOLLAR']) assert.throws(() => ratesPollPack({ ...SPEC, base }), /currency code/u, `built a pack based on ${JSON.stringify(base)}`);
});

/**
 * The one declaration a rates pack holds, as `install` would hold it, with its map padded past what the builder
 * will build. The padding is a clone of a real map with another currency on it, so a refusal is about how MANY maps
 * there are and never about a map this test wrote badly: at twenty nothing is padded and the builder's own twenty
 * are what the record reads, and at twenty-one those same twenty carry one clone of the first.
 */
const declaredAt = async (maps: number): Promise<Parameters<typeof validateDeclaration>[0]> => {
  const doc = ratesPollPack({ ...SPEC, rates: many(Math.min(maps, RATES_CURRENCIES_MOST)) });
  const map = mapOf(doc);
  while (map.length < maps) map.push({ ...structuredClone(map[0]!), base: { value: `XY${map.length}` } });
  const out = await normalise(doc, { kind: 'local' });
  assert.ok(out.ok, `a pack of ${maps} maps would not normalise, so nothing here reached the record's own check`);
  return out.value.declarations[0] as Parameters<typeof validateDeclaration>[0];
};

test('AND ONE PAST WHAT THE RECORD TAKES IS REFUSED HERE, not by `install` after the owner has approved it', async () => {
  const doc = ratesPollPack({ ...SPEC, rates: many(RATES_CURRENCIES_MOST) });
  assert.equal(mapOf(doc).length, RATES_CURRENCIES_MOST);
  assert.equal((await normalise(doc, { kind: 'local' })).ok, true);
  assert.throws(() => ratesPollPack({ ...SPEC, rates: many(RATES_CURRENCIES_MOST + 1) }), new RegExp(`fills ${RATES_CURRENCIES_MOST} currencies`, 'u'));
});

test('AND THE NUMBER IS THE RECORD’S NUMBER, asked of the record rather than copied from it', async () => {
  /* `RATES_CURRENCIES_MOST` IS A HAND COPY OF THE KERNEL'S `POLL_MAPS_MOST`, and it has to be: the kernel's only
     entry point is `packages/kernel/src/index.ts` and it does not export that constant, so `seed` cannot import
     the number even though it depends on the package. What it can import is the check, `validateDeclaration`,
     which is the same `validate` `install` runs, so the copy is held against the record's own answer instead of
     against a second literal.
     WHAT THIS FILE HELD BEFORE WAS NOTHING, which is worth saying because it looked like a guard.
     `assert.equal((await normalise(doc)).ok, true)` on twenty maps was measured to stay green at twenty-five:
     `normalise` is `@braindog/declare`'s pack reader and the map ceiling is the kernel's, so no number of maps
     was ever checked here, in either direction. */
  assert.equal(validateDeclaration(await declaredAt(RATES_CURRENCIES_MOST)), null, 'the record refuses a map the builder will happily build');
  const past = validateDeclaration(await declaredAt(RATES_CURRENCIES_MOST + 1));
  assert.equal(past?.code, 'DECLARATION_INVALID', 'the record takes more maps than this file says it does');
  assert.match(past!.fix, new RegExp(`1 to ${RATES_CURRENCIES_MOST} maps`, 'u'), `the record's own sentence: ${past!.fix}`);
});
