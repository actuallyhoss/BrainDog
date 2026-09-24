/**
 * Exchange rates, polled, as a pack file: one public address, and which number in its answer is which currency
 * (`loop/research-m3-dynamic.md` section 3, brief B7; `loop/DIRECTION.md` sections 22 and 24).
 *
 * THE DOCUMENT WAS A FUNCTION IN `packages/seed`. `ratesPollPack` in `packages/seed/src/packs/rates-poll.ts` built the
 * whole pack in code, so the shell carried one use case (a daily call to a rates address) as TypeScript nobody outside
 * the tree could read or change. The document is now `rates-poll.pack.json`, a legal pack as it stands (open.er-api's
 * dollar quotes for the Egyptian pound and sterling), with the five things a person supplies named under `fill`.
 * `fill.ts` is the one place that puts them in, and it keeps the builder's judgements because they are about the spec,
 * not the document: a poll that could never write a rate is refused before anybody is asked to approve its call out.
 *
 * NOTHING MOVED BUT THE FILE, AND THAT IS PROVED RATHER THAN CLAIMED. While the builder is still in the tree, every
 * spec below is filled from the file and built by the builder, and the two are held equal byte for byte, through
 * `readPackFile` as a person pasting the filled file would read it. The day the builder goes, those comparisons go
 * with it and the judgements and the run below are what hold the file.
 *
 * RED FIRST, MEASURED ON SEPTEMBER 24TH AGAINST `facafeed`: with no pack file and no `fill.ts` this file did not load,
 * ERR_MODULE_NOT_FOUND, and with both written the re-export test failed on `packages/seed/src/packs/index.ts` and
 * `packages/seed/src/usecases/index.ts`, the two other names the seed still gave `ratesPollPack`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { normalise } from '../../packages/declare/src/index.ts';
import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { convertMinor, validateDeclaration } from '../../packages/kernel/src/index.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';
import { ratesPollPack } from '../../packages/seed/src/packs/rates-poll.ts';

import { fillRates, RATES_CURRENCIES_MOST, type RatesSpec } from './fill.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./rates-poll.pack.json', import.meta.url);
const template = (): Record<string, unknown> => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Record<string, unknown>;

/** What the file itself says, filled: the address and the two currencies it ships with. */
const EXAMPLE: RatesSpec = {
  id: 'open-er-api-com',
  url: 'https://open.er-api.com/v6/latest/USD',
  every: '1d',
  base: 'USD',
  rates: [
    { currency: 'EGP', path: 'rates.EGP' },
    { currency: 'GBP', path: 'rates.GBP' },
  ],
};

/** The map of the one declaration a rates pack holds. */
const mapOf = (doc: Record<string, unknown>): Record<string, { value?: unknown; path?: unknown }>[] =>
  (doc.declarations as { map: Record<string, { value?: unknown; path?: unknown }>[] }[])[0]!.map;

/* CODES NOBODY MINTS, so that a test about how MANY currencies a poll fills is not also a list of what currencies
   there are. `ingest.test.ts`'s membership guard counts real codes quoted in a file, and it is right to. */
const many = (n: number): RatesSpec['rates'] =>
  Array.from({ length: n }, (_, i) => ({ currency: `XX${String.fromCharCode(65 + i)}`, path: `rates.XX${String.fromCharCode(65 + i)}` }));

/* ── where the pack lives ─────────────────────────────────────────────────────────────────────── */

test('the file reads clean as an add-on somebody opens from disk, and says what a person fills', async () => {
  const text = readFileSync(PACK_FILE, 'utf8');
  const file = said<{ pack: { manifest: { pack: string } }; doc: { fill?: Record<string, unknown> } }>(await readPackFile(text));
  assert.equal(file.pack.manifest.pack, 'rates-open-er-api-com');
  assert.deepEqual(Object.keys(file.doc.fill ?? {}), ['id', 'url', 'every', 'base', 'rates']);
});

test('THE SEED NO LONGER OFFERS THE BUILDER UNDER A SECOND NAME', () => {
  /* TWO RE-EXPORTS HELD IT UP. `packages/seed/src/packs/index.ts` was a barrel nothing imported, and
     `usecases/index.ts` handed `ratesPollPack` to `test/founder-poll.test.ts` as though a rates address were a use
     case. Either one keeps a caller reaching into `packages/seed` for a document that is now a file here. */
  const src = new URL('../../packages/seed/src/', import.meta.url);
  const offering: string[] = [];
  for (const rel of readdirSync(src, { recursive: true, encoding: 'utf8' })) {
    if (!rel.endsWith('.ts') || rel.replaceAll('\\', '/') === 'packs/rates-poll.ts') continue;
    const text = readFileSync(new URL(rel.replaceAll('\\', '/'), src), 'utf8');
    if (/export\s*\{[^}]*\b(?:ratesPollPack|RatesSpec|RATES_CURRENCIES_MOST)\b[^}]*\}\s*from/u.test(text)) offering.push(rel.replaceAll('\\', '/'));
  }
  assert.deepEqual(offering, []);
});

test(
  "B7's DIRECTORY: packages/seed/src/packs holds only what a record is built from",
  {
    todo: 'the builders stay until four files this run did not own stop importing them: apps/web/src/lib/record/rates-form.ts (and the ./packs/rates-poll export in packages/seed/package.json), packages/seed/test/rates.test.ts and packages/seed/test/money-core-major.test.ts',
  },
  () => {
    const here = readdirSync(new URL('../../packages/seed/src/packs/', import.meta.url)).sort();
    /* `bank-hsbc-eg` AND `holdings` ARE B8's, and leave in the wave after this one. */
    assert.deepEqual(here, ['agents.ts', 'bank-hsbc-eg.ts', 'first-party.ts', 'holdings.ts']);
  },
);

/* ── nothing moved but the file ───────────────────────────────────────────────────────────────── */

const SPECS: readonly [string, RatesSpec][] = [
  ['the file as it ships', EXAMPLE],
  ['a repeat and the base dropped, a code in lower case', { ...EXAMPLE, rates: [{ currency: 'USD', path: 'rates.USD' }, { currency: 'egp', path: ' rates.EGP ' }, { currency: 'EGP', path: 'rates.X' }] }],
  ['another address, another base, every day', { id: 'frankfurter', url: 'https://api.frankfurter.app/latest?from=EUR', every: '12h', base: ' eur ', rates: [{ currency: 'GBP', path: 'rates.GBP' }] }],
  ['an id past what an ingest name holds', { ...EXAMPLE, id: 'a-very-long-name-that-runs-well-past-thirty-two', rates: many(RATES_CURRENCIES_MOST) }],
  ['a url that is not one', { ...EXAMPLE, url: 'not an address' }],
];

for (const [name, spec] of SPECS)
  test(`FILLED, THE FILE IS THE BUILDER'S DOCUMENT BYTE FOR BYTE: ${name}`, async () => {
    const built = JSON.stringify(ratesPollPack(spec));
    const filled = fillRates(template(), spec);
    assert.equal(JSON.stringify(filled), built);
    /* AND READ AS SOMEBODY PASTING IT WOULD READ IT, which is the door a filled file goes through. `readPackFile`
       answers the document it read, so a key it dropped or reordered would show here and not in the line above. */
    if (spec.url.startsWith('https://')) assert.equal(JSON.stringify(said<{ doc: unknown }>(await readPackFile(JSON.stringify(filled))).doc), built);
  });

test('the file as it ships, with its marks taken off, is its own example filled', () => {
  const { fill: _marks, ...shipped } = template();
  assert.equal(JSON.stringify(shipped), JSON.stringify(fillRates(template(), EXAMPLE)));
});

/* ── what the fill refuses, moved from `packages/seed/test/rates.test.ts` ─────────────────────── */

test('ONE ROW A CURRENCY, quoted the way `fx` reads a rate: one of the base is worth this many of the other', () => {
  const doc = fillRates(template(), { ...EXAMPLE, rates: [{ currency: 'egp', path: 'rates.EGP' }, { currency: 'GBP', path: 'rates.GBP' }] });
  assert.deepEqual(
    mapOf(doc).map((m) => [m.currency?.value, m.base?.value, m.rate?.path]),
    [
      ['USD', 'EGP', 'rates.EGP'],
      ['USD', 'GBP', 'rates.GBP'],
    ],
  );
  assert.equal(doc.summary, 'Polls open.er-api.com every 1d for what one USD is worth in EGP, GBP.');
});

test('A CURRENCY ASKED FOR TWICE IS ONE ROW, and the base asked for against itself is none', () => {
  /* HELD HERE AND NOT ONLY BY THE BYTE COMPARISON ABOVE, because that comparison leaves with the builder. Measured by
     the checker on September 24th: with the repeat guard taken out of `fill.ts`, the only test that went red was the
     byte comparison, so deleting `packages/seed/test/rates.test.ts` as planned would have left `USD, EGP` written
     twice a day with nothing here to say so. */
  const doc = fillRates(template(), { ...EXAMPLE, rates: [{ currency: 'USD', path: 'rates.USD' }, { currency: 'EGP', path: 'rates.EGP' }, { currency: 'egp', path: 'rates.X' }] });
  assert.deepEqual(
    mapOf(doc).map((m) => [m.base?.value, m.rate?.path]),
    [['EGP', 'rates.EGP']],
  );
  assert.equal(doc.summary, 'Polls open.er-api.com every 1d for what one USD is worth in EGP.');
});

test('A POLL THAT COULD NEVER WRITE A RATE IS NOT FILLED, so nobody is asked to approve a call out that does nothing', () => {
  /* THE PLAN THE OWNER READS CANNOT SHOW HIM THIS. Its one line is `CALLS OUT <host> · every 1d · grant "none"` and
     it says nothing about the map, so an empty list, the base quoted against itself and a code that is not one
     were each measured to plan as the ordinary line, and the empty one to be refused only by `install`, after the
     owner had approved it. */
  for (const rates of [[], [{ currency: 'USD', path: 'rates.USD' }], [{ currency: 'nope', path: 'rates.nope' }]])
    assert.throws(() => fillRates(template(), { ...EXAMPLE, rates }), /currency/u, `filled a pack from ${JSON.stringify(rates)}`);
  for (const base of ['', 'us', 'DOLLAR']) assert.throws(() => fillRates(template(), { ...EXAMPLE, base }), /currency code/u, `filled a pack based on ${JSON.stringify(base)}`);
  assert.throws(() => fillRates(template(), { ...EXAMPLE, rates: many(RATES_CURRENCIES_MOST + 1) }), new RegExp(`fills ${RATES_CURRENCIES_MOST} currencies`, 'u'));
});

test('AND THE MOST IT FILLS IS THE RECORD’S NUMBER, asked of the record rather than copied from it', async () => {
  /* `RATES_CURRENCIES_MOST` IS A HAND COPY OF THE KERNEL'S `POLL_MAPS_MOST`, which the kernel's entry point does not
     export, so it is held against the record's own `validateDeclaration`: the fill's twenty maps pass, and the same
     twenty with one clone more are refused in the record's own sentence. */
  const declaredAt = async (maps: number): Promise<Parameters<typeof validateDeclaration>[0]> => {
    const doc = fillRates(template(), { ...EXAMPLE, rates: many(RATES_CURRENCIES_MOST) });
    const map = mapOf(doc);
    while (map.length < maps) map.push({ ...structuredClone(map[0]!), base: { value: `XY${map.length}` } });
    return said<{ declarations: Parameters<typeof validateDeclaration>[0][] }>(await normalise(doc, { kind: 'local' })).declarations[0]!;
  };
  assert.equal(validateDeclaration(await declaredAt(RATES_CURRENCIES_MOST)), null, 'the record refuses a map the fill will happily write');
  const past = validateDeclaration(await declaredAt(RATES_CURRENCIES_MOST + 1));
  assert.equal(past?.code, 'DECLARATION_INVALID', 'the record takes more maps than this file says it does');
  assert.match(past!.fix, new RegExp(`1 to ${RATES_CURRENCIES_MOST} maps`, 'u'), `the record's own sentence: ${past!.fix}`);
});

/* ── the run, moved from `packages/seed/test/founder-poll.test.ts` ────────────────────────────── */

test('EXCHANGE RATES ARE POLLED LIKE ANY ADDRESS: approved once, one row of fx a currency, and Cash now converts', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 24, 12)) });
  const install = async (doc: unknown, approve: boolean): Promise<Out> => {
    const diff = said<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
    return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: approve ? diff.approve : [] } as never, owner)) as Out;
  };
  /* NO EXAMPLE ROWS, because Money's sample ships an account of its own and the sum below is these three accounts. */
  for (const id of ['portfolio', 'people', 'money-core']) said(await install(firstPartyDocument(id, { seeds: [] }), true));

  const doc = fillRates(template(), EXAMPLE);
  const diff = said<{ diff: { approve: string[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  assert.deepEqual(diff.approve, ['CALLS OUT open.er-api.com · every 1d · grant "none"']);
  assert.equal((await install(doc, false)).ok, false, 'never without approval');
  said(await install(doc, true));

  const run = await api.kernel.runActions(async () => ({ status: 200, body: '{"base_code":"USD","rates":{"EGP":50,"GBP":0.74}}', bytes: 48, ms: 3, requests: 1 }));
  assert.equal(run.ran, 1);
  const rows = said<{ rows: { fields: Record<string, unknown> }[] }>(api.kernel.list({ register: 'fx', limit: 10 })).rows;
  assert.deepEqual(rows.map((r) => [r.fields.currency, r.fields.base, r.fields.rate, r.fields.as_of, r.fields.source]).sort(), [
    ['USD', 'EGP', 50, '2026-09-24', 'open.er-api.com'],
    ['USD', 'GBP', 0.74, '2026-09-24', 'open.er-api.com'],
  ]);

  /* AN ACCOUNT IN EACH CURRENCY, THE HOME ONE SET, AND EACH READ AT THE POLLED RATE. Before the home currency is
     chosen there is nothing to convert into, so the figure is refused rather than added up across currencies. The
     sterling is the one worth having: no rate is quoted between it and the Egyptian pound, so it is read through the dollar
     both rates are quoted against, which is the path `founder-poll.test.ts` held while this test lived there. */
  for (const a of [
    { name: 'Nile current', kind: 'bank', balance: { amount: 5_200_000, currency: 'EGP' }, as_of: '2026-09-24', liquid: true },
    { name: 'Dollar float', kind: 'bank', balance: { amount: 340_000, currency: 'USD' }, as_of: '2026-09-24', liquid: true },
    { name: 'Sterling reserve', kind: 'bank', balance: { amount: 74_000, currency: 'GBP' }, as_of: '2026-09-24', liquid: true },
  ])
    said(api.kernel.create('accounts', a, { actor: 'p_1' }));
  const before = said<{ value: number | null }>(await api.metric({ metric: 'cash-now' }, owner));
  assert.equal(before.value, null, 'three currencies were added up with no home currency to add them in');
  said(api.kernel.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }));
  const cash = said<{ value: number | null; unit: string | null; fx?: { asOf: string | null } }>(await api.metric({ metric: 'cash-now' }, owner));
  assert.deepEqual([cash.value, cash.unit, cash.fx?.asOf], [5_200_000 + 340_000 * 50 + convertMinor(74_000, 'GBP', 'EGP', 50 / 0.74), 'EGP', '2026-09-24']);
  sql.close();
});
