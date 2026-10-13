/**
 * What a person holds, as a pack file: the list that left Money at money-core 2.0.0, and what it cost together.
 *
 * THE DOCUMENT WAS A FUNCTION IN `packages/seed`. `holdingsPack` in `packages/seed/src/packs/holdings.ts` built it in
 * code, so the shell carried one person's kind of list as TypeScript, and the only thing that ever offered it was an
 * import. It is now `holdings.pack.json`, installed through the record's own `planPack` and `installPack`.
 * The builder went once the import resolved the pack by id from the catalogue. What it built
 * is kept beside this file as `holdings-1.0.0.json`, written from it on its last day, because 1.0.0 is what a record that took
 * money-core 2.0.0 was offered and is what the update below starts from. The first test holds the list in this file to
 * that one, so the two cannot say different things about a row.
 *
 * WHY 1.1.0 AND WHY A SCRIPT. 1.0.0 had no value figure and no page. A figure is one aggregation over one
 * field (`AGGREGATIONS` in `packages/kernel/src/metrics.ts`), and `product` multiplies a field by a NAMED FACTOR TABLE,
 * never by another field, so no declared figure says "how many times what one cost". `portfolio-bands` met the same
 * wall and answered it with a script, which is the shell's own answer to a sum nobody can declare. So the
 * list gains `cost`, a rule starts `cost.js` whenever `qty` or `unit_cost` is written, the script writes the product
 * into `cost`, and `Holdings value` is a plain sum over it. A field, a rule, a script, three figures and a page are added
 * and nothing is taken away, so the step is a minor one by `first-party.ts`'s rule.
 *
 * AND WHY THE SCRIPT ALSO RUNS ONCE A DAY. The rule only hears a write to `qty` or `unit_cost`, and updating from 1.0.0
 * writes neither, so every row a record already held stayed uncosted until somebody edited it. Measured:
 * 1.0.0, three rows, then this file, then the rule and the outbox drained. `cost` stayed undefined on all three,
 * and the figure read value 0 over rows 3 under the note "what was paid for 3 holding(s)", a wrong amount stated as a fact.
 * Every record an import set up before it resolved packs from the catalogue gets here that way, because
 * that import installed 1.0.0. The pack grammar has no trigger for "installed", so the script also runs on
 * `every: 1d`, whose first run the kernel spreads inside fifteen minutes of the install, and with no row to work on it
 * costs every row whose `cost` is empty. A script reads one page of fifty (`bands.js` says the same), so a record
 * with more uncosted rows than that is costed fifty a day. Daily rather than hourly because every sweep filters on an
 * unindexed field, and the Mercury ledger measured what an hourly scan does to the index analyser: about 720
 * observations a month against its threshold of 200.
 *
 * AND THE FIGURE ADDS UP ONLY ROWS THAT HAVE A COST (`cost is set`), so an uncosted row is left out rather than added as
 * nothing, and the note says how many of how many holdings the sum covers, through a third figure, `holdings-costed`.
 * With none costed yet the reading is `rows: 0` over three held, and the tile reads "0 of 3". That note is what carries
 * it on a screen today. The web's `unsaidFigure`, which turns exactly this reading into a sentence, answered `false` for
 * this figure when probed: it resolves the register and the figure from the build's own seed tables,
 * and a pack's list is in neither.
 *
 * WHAT IT WAS NOT UNTIL 1.4.0, AND IS NOW ONLY AS FAR AS SOMEBODY SAYS: a valuation. A holding has a `price`, "Worth
 * each now", and the day it was priced, typed by a person or written by an agent, a feed or a script they add. None
 * ships here. The script writes `value`, the count times the price, or what the holding cost when it has no price, and
 * the figure adds up `value` and says how many of the holdings stand at what they cost.
 *
 * RED FIRST, MEASURED. With no file, seven of the eight failed ENOENT, and the eighth is the one that
 * holds a record with every first-party pack to having no `holdings` list, no `holdings-value` figure and no Holdings
 * page. With the file and a script that writes nothing, four failed: the costing, the figure, the page and the byte
 * comparison with `cost.js`, so the figure is the script's arithmetic and not a sum that happened to agree. The fixture
 * rows are invented; none is anybody's.
 *
 * RED AGAIN THE SAME DAY, for the upgrade: the three tests under "a record that had the list at 1.0.0" were written
 * against the rule-only file and all three failed, 11 of 14 passing: every cost undefined after the sweep's due time,
 * the tile at `rows: 3` rather than 0 with nothing costed, and 0 rows costed where fifty were expected.
 *
 * AND THE SAME THING TYPED TWICE, before 1.4.0 shipped. An account that counts as cash and a holding with one name may
 * be counted twice, so `twin.js` runs once a day and asks once about each such pair: stop counting the account as cash,
 * or keep counting it. It writes nothing itself. The question is the run's, never `system`'s, and the pair is its cause,
 * so the record asks it once. RED FIRST: seven of the eight tests at the foot failed with no `twin.js`, and the eighth
 * holds that a record with nothing alike is asked nothing, which no script also satisfies.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../packages/seed/src/index.ts';

const NOW = Date.UTC(2026, 8, 25, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[]; conflicts: unknown[]; adds: { id: string }[] };
type Body = Record<string, unknown>;
type Money = { amount: number; currency: string };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./holdings.pack.json', import.meta.url);
const file = (): Body & { version: string; declarations: Body[] } => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as never;
const SOURCE = readFileSync(new URL('./cost.js', import.meta.url), 'utf8');

/** 1.0.0 as the builder in `packages/seed` shipped it, the one list and nothing else. Not a pack file the catalogue reads. */
const v100 = (): Body & { version: string; requires: unknown; declarations: Body[] } =>
  JSON.parse(readFileSync(new URL('./holdings-1.0.0.json', import.meta.url), 'utf8')) as never;

/** A fresh record holding every first-party pack, which is where a person stands when they add this one. */
async function money(): Promise<{ api: Api; clock: ReturnType<typeof fixedClock>; close: () => void }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  for (const id of FIRST_PARTY) said(await put(api, firstPartyDocument(id)));
  return { api, clock, close: () => sql.close() };
}

const planOf = async (api: Api, doc: unknown): Promise<Diff> =>
  said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<Out> {
  const diff = await planOf(api, doc);
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

/**
 * The rule's runs, taken to the end the way a host takes them: the schedule drained, then the outbox, with the script
 * run in QuickJS by the same runner the self-host builds (`apps/selfhost/src/script.ts`). The cost script fetches
 * nothing, so the socket, the pin and the key opener are doubles that refuse.
 */
async function settle(api: Api, rounds = 3, now: () => number = () => NOW): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('the cost script fetches nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now } as never);
  for (let i = 0; i < rounds; i++) {
    await api.kernel.drain();
    await api.kernel.runActions(refuse as never, { script: run, limit: 50 });
  }
}

const hold = (api: Api, fields: Body): string => said<{ id: string }>(api.kernel.create('holdings', fields as never, { actor: 'p_1' })).id;

/** Three invented holdings in two currencies: a lot of a commodity with a fraction in its count, a certificate, a policy. */
const HELD: readonly Body[] = [
  { label: 'Silver bar', kind: 'commodity', qty: 2.5, unit_cost: { amount: 40_000, currency: 'EUR' }, acquired_on: '2026-03-02' },
  { label: 'Term deposit', kind: 'certificate', qty: 1, unit_cost: { amount: 500_000, currency: 'EUR' }, acquired_on: '2026-01-15', matures_on: '2029-01-15' },
  { label: 'Life cover', kind: 'policy', qty: 12, unit_cost: { amount: 4_500, currency: 'USD' }, acquired_on: '2025-11-01', matures_on: '2055-11-01' },
];

test('THE FILE DECLARES THE LIST 1.0.0 DID, with `cost` added, and a version above it', () => {
  const doc = file();
  const built = v100();
  assert.equal(doc.pack, 'holdings');
  /* 1.2.0 adds one key: `holdings-value` is `sellable`, so a forecast's sell control offers it. 1.3.0
     adds a title, a `changes` line and a comment at the top of the script, and nothing a record reads differently. 1.4.0
     adds a price, the day it was priced and what the holding is worth, two counts, and takes the currency out of the format;
     before it shipped it gained the oldest day a price was said and a count of the prices over thirty days old. */
  assert.equal(doc.version, '1.4.0');
  assert.equal(doc.declarations.find((d) => d.metric === 'holdings-value')?.sellable, true);
  assert.equal(built.version, '1.0.0', 'the frozen 1.0.0 moved, so this file has to say what it now is beside it');
  assert.deepEqual(doc.requires, built.requires);
  const list = doc.declarations.find((d) => d.register === 'holdings')!;
  const fields = list.fields as Body[];
  /* BYTE FOR BYTE IN MEANING, BUT FOR THE ONE FIELD 1.1.0 ADDS AND THE THREE 1.4.0 ADDS. */
  const ADDED = ['cost', 'price', 'priced_on', 'value'];
  assert.deepEqual({ ...list, fields: fields.filter((f) => !ADDED.includes(f.id as string)) }, built.declarations[0]);
  assert.deepEqual(fields.filter((f) => ADDED.includes(f.id as string)).slice(1), [
    { id: 'price', label: 'Worth each now', type: 'money' },
    { id: 'priced_on', label: 'Priced on', type: 'day' },
    { id: 'value', label: 'Worth now', type: 'money' },
  ]);
  assert.deepEqual(fields.find((f) => f.id === 'cost'), { id: 'cost', label: 'What it cost', type: 'money' });
  assert.doesNotMatch(JSON.stringify(doc), /gold/iu, 'the pack ships the word it left Money to stop shipping');
});

test('BEFORE THE PACK: a record with every first-party pack has no holdings, no Holdings value and no Holdings page', async () => {
  const { api, close } = await money();
  assert.equal(api.kernel.register('holdings'), undefined);
  const ids = api.kernel.declarations().map((d) => d.id);
  for (const id of ['register.holdings', 'metric.holdings-value', 'page.holdings', 'script.holdings_cost']) assert.ok(!ids.includes(id), `${id} is already on the record`);
  close();
});

test('THE SCRIPT IN THE FILE IS cost.js, byte for byte, and it can reach nothing but holdings', () => {
  const script = file().declarations.find((d) => d.script === 'holdings_cost')!;
  assert.equal(script.source, SOURCE, 'holdings.pack.json and cost.js disagree; copy cost.js into the source');
  assert.deepEqual([script.egress, script.keys, script.reads, script.writes], [[], [], ['holdings'], ['holdings']]);
});

test('INSTALLED FROM THE FILE: one list, one rule, two scripts, seven figures and a page, and nothing refused', async () => {
  const { api, close } = await money();
  const diff = await planOf(api, file());
  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(
    diff.adds.map((a) => a.id).sort(),
    ['metric.holdings-at-cost', 'metric.holdings-costed', 'metric.holdings-count', 'metric.holdings-priced-on', 'metric.holdings-stale', 'metric.holdings-unpriced', 'metric.holdings-value', 'page.holdings', 'register.holdings', 'rule.holdings_cost', 'script.holdings_cost', 'script.holdings_twin'],
  );
  said(await put(api, file()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'holdings')?.version, '1.4.0');
  close();
});

test('A HOLDING IS COSTED BY ITS OWN SCRIPT, how many times what one cost, and costed again when either moves', async () => {
  const { api, close } = await money();
  said(await put(api, file()));
  const ids = HELD.map((row) => hold(api, row));
  await settle(api);
  const cost = (id: string): Money | undefined => api.kernel.get(id)!.fields.cost as Money | undefined;
  /* HALF A BAR IS A HOLDING, SO THE PRODUCT IS NOT A WHOLE NUMBER OF UNITS: 2.5 times EUR 400.00 is EUR 1,000.00. */
  assert.deepEqual(ids.map(cost), [
    { amount: 100_000, currency: 'EUR' },
    { amount: 500_000, currency: 'EUR' },
    { amount: 54_000, currency: 'USD' },
  ]);

  const bar = api.kernel.get(ids[0]!)!;
  said(api.kernel.update('holdings', bar.id, { qty: 3 } as never, { actor: 'p_1' }));
  await settle(api);
  assert.deepEqual(cost(ids[0]!), { amount: 120_000, currency: 'EUR' });

  /* AND A COSTED ROW IS LEFT ALONE: the host coming round again writes nothing. Two things hold that, and each would on
     its own: the rule listens to `qty` and `unit_cost` while the script writes `cost` only, and the script returns
     without a write when `cost` already says the product. */
  const runs = (): number => (api.kernel as unknown as { history(id: string): unknown[] }).history(ids[0]!).length;
  const before = runs();
  await settle(api);
  assert.equal(runs(), before, 'the script wrote the row again with nothing moved');
  close();
});

test('HOLDINGS VALUE IS ONE AMOUNT PER CURRENCY, never two currencies added as they are', async () => {
  const { api, close } = await money();
  said(await put(api, file()));
  for (const row of HELD) hold(api, row);
  await settle(api);
  const metric = file().declarations.find((d) => d.metric === 'holdings-value')!;
  const read = said<{ value: number | null; parts?: { amount: number; currency: string }[] }>(api.kernel.metric(metric as never));
  assert.equal(read.value, null, 'two currencies came back as one number');
  assert.deepEqual((read.parts ?? []).map((p) => [p.currency, p.amount]).sort(), [['EUR', 600_000], ['USD', 54_000]]);
  close();
});

test('THE HOLDINGS PAGE DRAWS THE FIGURE AND EVERY ROW, with nothing refused', async () => {
  const { api, close } = await money();
  said(await put(api, file()));
  for (const row of HELD) hold(api, row);
  await settle(api);
  assert.ok(said<{ slug: string }[]>(await api.pages(owner)).some((p) => p.slug === 'holdings'));
  type Reading = { metric: string; reading: { rows: number; parts?: { currency: string; amount: number }[] } };
  const page = said<{ title: string; blocks: { heading: string; rows?: { fields: Body }[]; refusals: unknown[]; values?: Body; readings?: Reading[] }[] }>(
    await api.page({ slug: 'holdings' }, owner),
  );
  assert.equal(page.title, 'Holdings');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading} was refused`);
  /* THE PAGE DECLARES THE TILE TWICE, once with the note and once without, and draws the one whose `when` holds. */
  const tile = page.blocks.find((b) => b.heading === 'What you hold' && (b as { why?: string }).why !== 'when')!;
  assert.equal(tile.values?.['holdings-count'], 3);
  const value = tile.readings?.find((r) => r.metric === 'holdings-value')?.reading;
  assert.equal(value?.rows, 3);
  assert.deepEqual((value?.parts ?? []).map((p) => [p.currency, p.amount]).sort(), [['EUR', 600_000], ['USD', 54_000]]);
  const table = page.blocks.find((b) => b.heading === 'Everything you hold')!;
  assert.deepEqual((table.rows ?? []).map((r) => r.fields.label), ['Silver bar', 'Term deposit', 'Life cover']);
  close();
});

/* ── a record that had the list at 1.0.0 ─────────────────────────────────────────────────────────────────────────── */

/** The tile's reading of `holdings-value` and the counts its note names, read the way the page reads them. */
async function tile(api: Api): Promise<{ rows: number; held: number | undefined; parts: [string, number][]; values: Body }> {
  type Reading = { metric: string; reading: { rows: number; held?: number; value: number | null; unit?: string | null; parts?: Money[] } };
  const page = said<{ blocks: { heading: string; why?: string; values?: Body; readings?: Reading[] }[] }>(await api.page({ slug: 'holdings' }, owner));
  /* THE ONE OF THE TWO TILES WHOSE `when` HOLDS. With nothing worked out yet it is still marked not drawn, as `unsaid`,
     and it keeps its reading, which is what the first test below reads. */
  const block = page.blocks.find((b) => b.heading === 'What you hold' && b.why !== 'when')!;
  const r = block.readings!.find((x) => x.metric === 'holdings-value')!.reading;
  const parts = r.parts ?? (r.value !== null && r.unit ? [{ currency: r.unit, amount: r.value }] : []);
  return { rows: r.rows, held: r.held, parts: parts.map((p) => [p.currency, p.amount] as [string, number]).sort(), values: block.values ?? {} };
}

/** A record where 1.0.0 went in first and the rows were written under it, then the file on top. */
async function upgraded(rows: readonly Body[] = HELD): Promise<{ api: Api; clock: ReturnType<typeof fixedClock>; ids: string[]; close: () => void }> {
  const { api, clock, close } = await money();
  said(await put(api, v100()));
  const ids = rows.map((row) => hold(api, row));
  said(await put(api, file()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'holdings')?.version, '1.4.0');
  return { api, clock, ids, close };
}

/* FIFTEEN MINUTES IS THE WIDEST A FIRST RUN IS SPREAD: `jitterMs` in `packages/kernel/src/pull.ts` caps the window there
   for any interval of two and a half hours or more, so a daily script is first due inside a quarter of an hour. */
const SPREAD_MS = 15 * 60_000;

test('A RECORD ON 1.0.0 UPDATES TO THIS FILE AND EVERY HOLDING IT HELD IS COSTED, with nobody writing a row again', async () => {
  const { api, clock, ids, close } = await upgraded();
  const cost = (id: string): Money | undefined => api.kernel.get(id)!.fields.cost as Money | undefined;
  /* THE RULE IS NO HELP HERE. It listens for a write to `qty` or `unit_cost`, and the update writes neither, so every
     row 1.0.0 held stays uncosted until somebody edits it, which for a certificate bought once may be never. */
  clock.advance(SPREAD_MS + 1);
  await settle(api);
  assert.deepEqual(ids.map(cost), [
    { amount: 100_000, currency: 'EUR' },
    { amount: 500_000, currency: 'EUR' },
    { amount: 54_000, currency: 'USD' },
  ]);
  assert.deepEqual((await tile(api)).parts, [['EUR', 600_000], ['USD', 54_000]]);
  close();
});

test('UNTIL A HOLDING IS COSTED THE FIGURE LEAVES IT OUT AND SAYS SO, and never reads its missing cost as zero', async () => {
  const { api, clock, ids, close } = await upgraded();
  /* BEFORE THE SWEEP HAS RUN, NOT ONE ROW HAS A COST. The reading the web's `unsaidFigure` keys on is exactly this:
     no row counted over rows that exist, on a figure whose `where` asks for the field it adds up. It was `rows: 3` and
     a value of 0, under a note that said the 0 was what 3 holdings cost. */
  const before = await tile(api);
  assert.deepEqual([before.rows, before.held, before.parts], [0, 3, []]);
  /* THE NOTE COUNTS ONLY HOLDINGS THE SUM COVERS, so with none worked out yet it says none of the three, not all of them. */
  assert.deepEqual([before.values['holdings-at-cost'], before.values['holdings-count']], [0, 3]);

  /* ONE ROW EDITED IS ONE ROW COSTED BY THE RULE, and the note counts it as one of three rather than the sum as all. */
  said(api.kernel.update('holdings', ids[0]!, { qty: 3 } as never, { actor: 'p_1' }));
  await settle(api);
  const one = await tile(api);
  assert.deepEqual([one.rows, one.parts], [1, [['EUR', 120_000]]]);
  assert.deepEqual([one.values['holdings-at-cost'], one.values['holdings-count']], [1, 3]);

  clock.advance(SPREAD_MS + 1);
  await settle(api);
  const all = await tile(api);
  assert.deepEqual([all.rows, all.parts], [3, [['EUR', 620_000], ['USD', 54_000]]]);
  assert.deepEqual([all.values['holdings-at-cost'], all.values['holdings-count']], [3, 3]);
  close();
});

test('THE SWEEP TAKES FIFTY A RUN, the one page a script can read, and the rest the next day', async () => {
  const lots = Array.from({ length: 60 }, (_, i): Body => ({ label: `Lot ${i + 1}`, kind: 'commodity', qty: 2, unit_cost: { amount: 1_000 + i, currency: 'EUR' } }));
  const { api, clock, ids, close } = await upgraded(lots);
  const costed = (): number => ids.filter((id) => api.kernel.get(id)!.fields.cost !== undefined).length;
  clock.advance(SPREAD_MS + 1);
  await settle(api);
  assert.equal(costed(), 50);
  /* AND THE SAME RUN AGAIN BEFORE THE DAY IS OUT IS NOT DUE, so the ten wait for tomorrow's. */
  await settle(api);
  assert.equal(costed(), 50);
  /* A DAY FROM THE RUN BEFORE, PLUS ITS SPREAD AGAIN: `fireScript` arms the next one at the run's own time plus a day plus the same jitter. */
  clock.advance(24 * 60 * 60_000 + SPREAD_MS);
  await settle(api);
  assert.equal(costed(), 60);
  for (const [i, id] of ids.entries()) assert.deepEqual(api.kernel.get(id)!.fields.cost, { amount: 2 * (1_000 + i), currency: 'EUR' });
  close();
});

/* ── the list itself, moved here from `packages/seed/test/holdings.test.ts` and asked of the file ─────────────────── */

test('A POLICY IS FOUND BY BEING A POLICY, and a maturity is a day the record can be asked about', async () => {
  const { api, close } = await money();
  said(await put(api, file()));
  const ids = HELD.map((row) => hold(api, row));
  /* `search: true` ON AN ENUM, which the list's own comment argues for: a policy's label is often an insurer and a
     number, so the word `policy` reaches it only through the kind. "Life cover" does not say it. */
  assert.deepEqual(
    api.kernel.search('policy', { registers: ['holdings'], limit: 20 }).map((h) => h.id),
    [ids[2]],
  );
  const where = (sentence: string): unknown[] => said<{ rows: { fields: Body }[] }>(api.kernel.list({ register: 'holdings', where: sentence, limit: 50 })).rows.map((r) => r.fields.label);
  assert.deepEqual(where('matures_on before 2030-01-01'), ['Term deposit']);
  assert.deepEqual(where('matures_on is empty'), ['Silver bar'], 'a lot with no end day is what `is empty` asks for');
  close();
});

test('WHAT A PERSON HOLDS MOVES CASH NOW BY NOTHING, which is the whole reason this is not an account', async () => {
  const { api, close } = await money();
  said(await put(api, file()));
  const cashNow = (firstPartyDocument('money-core') as { declarations: Body[] }).declarations.find((d) => d.metric === 'cash-now')!;
  const read = (): unknown => said<{ value: unknown; parts?: unknown }>(api.kernel.metric(cashNow as never));
  const before = read();
  for (const row of HELD) hold(api, row);
  await settle(api);
  /* `cash-now` sums `accounts.balance` where `liquid is true`, and a holding has neither, so filed here a policy or a
     certificate cannot be read as money somebody could spend, which is what filing it as an account did. */
  assert.deepEqual(read(), before, 'what is held leaked into what can be spent');
  close();
});

test('HALF A UNIT IS A HOLDING AND A NEGATIVE COUNT IS NOT, and the card keeps the count beside the cost each', async () => {
  const { api, close } = await money();
  said(await put(api, file()));
  const half = api.kernel.get(hold(api, { label: 'Silver coin', kind: 'commodity', qty: 0.5, unit_cost: { amount: 3_000, currency: 'EUR' } }))!;
  assert.equal(half.fields.qty, 0.5, 'a half unit was rounded away');
  const owed = api.kernel.create('holdings', { label: 'Silver coin', kind: 'commodity', qty: -3, unit_cost: { amount: 3_000, currency: 'EUR' } } as never, { actor: 'p_1' }) as Out;
  assert.equal(owed.ok, false, 'the list took a negative number of units');
  assert.match(owed.refusal?.fix ?? '', /at least 0/u);
  /* A COST EACH WITH NO COUNT BESIDE IT IS A WRONG NUMBER RATHER THAN AN INCOMPLETE ONE, so the phone card is the label,
     the count and the cost each, in that order. */
  assert.deepEqual(file().declarations.find((d) => d.register === 'holdings')!.mobile, ['label', 'qty', 'unit_cost']);
  close();
});

test('THE SAME FILE PASSES AS AN ADD-ON SOMEBODY OPENS FROM DISK', async () => {
  const opened = said<{ pack: { manifest: { pack: string; version: string } } }>(await readPackFile(readFileSync(PACK_FILE, 'utf8')));
  assert.deepEqual([opened.pack.manifest.pack, opened.pack.manifest.version], ['holdings', '1.4.0']);
});

/* ── 1.4.0: what a holding is worth now, and a format that names nobody's currency (REC-B17 steps 1 and 2) ─────────── */

/**
 * RED FIRST, MEASURED AGAINST 1.3.0. The five tests below were written before the file moved and all five failed: the
 * format said `money.GBP`, a holding had no `value` so the tile's sum was over `cost`, a `price` was refused as a field
 * the list does not have, and no figure counted the holdings still standing at what they cost.
 */

/**
 * The tile that is drawn, of the two the page declares: its amounts, and its note with the figures it names filled in.
 *
 * TWO TILES BECAUSE A NOTE CANNOT BE CONDITIONAL AND A BLOCK CAN. The one with "at what they cost" is drawn while any
 * holding has no price (`holdings-unpriced` above nothing), and the one with no note once every holding has one. The
 * test is on `price is empty` and not on the note's own count, because that count asks for `value is set`, which no row
 * has said until the script has run, and a `when` over a figure nobody has said holds for neither tile.
 */
async function worth(api: Api): Promise<{ parts: [string, number][]; note: string; tiles: number }> {
  type Cell = { metric: string; note?: string; reading: { value: number | null; unit?: string | null; parts?: Money[] } };
  const page = said<{ blocks: { heading: string; why?: string; values?: Body; readings?: Cell[] }[] }>(await api.page({ slug: 'holdings' }, owner));
  const tiles = page.blocks.filter((b) => b.heading === 'What you hold' && b.why !== 'when');
  const block = tiles[0]!;
  const cell = block.readings!.find((x) => x.metric === 'holdings-value')!;
  const r = cell.reading;
  const parts = r.parts ?? (r.value !== null && r.unit ? [{ currency: r.unit, amount: r.value }] : []);
  const note = (cell.note ?? '').replace(/\{\{([a-z-]+)\}\}/gu, (_, id: string) => String((block.values ?? {})[id]));
  return { parts: parts.map((p) => [p.currency, p.amount] as [string, number]).sort(), note, tiles: tiles.length };
}

/** A record whose home currency is the Egyptian pound, with this file on it. */
async function inPounds(): Promise<{ api: Api; clock: ReturnType<typeof fixedClock>; close: () => void }> {
  const made = await money();
  said(made.api.kernel.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }));
  said(await put(made.api, file()));
  return made;
}

const egp = (amount: number): Money => ({ amount, currency: 'EGP' });

test('NO FILE OF THIS ADD-ON NAMES A CURRENCY IN A FORMAT, so the value reads in the money somebody chose', () => {
  const dir = new URL('./', import.meta.url);
  for (const name of readdirSync(dir)) {
    if (!/\.(?:json|js)$/u.test(name)) continue;
    assert.doesNotMatch(readFileSync(new URL(name, dir), 'utf8'), /money\.[A-Z]{3}/u, `${name} names a currency in a format`);
  }
  assert.equal(file().declarations.find((d) => d.metric === 'holdings-value')?.format, 'money');
});

test('TEN BOUGHT AT 3,000 EACH READ 30,000 AT WHAT THEY COST, and a price of 4,100 makes it 41,000 and the note goes', async () => {
  const { api, close } = await inPounds();
  const id = hold(api, { label: 'Silver, ten grams', kind: 'commodity', qty: 10, unit_cost: egp(300_000), acquired_on: '2026-02-01' });
  await settle(api);
  const bought = await worth(api);
  assert.deepEqual(bought.parts, [['EGP', 3_000_000]]);
  assert.equal(bought.note, '1 of 1 at what they cost');
  assert.equal(bought.tiles, 1, 'the tile was drawn twice');

  said(api.kernel.update('holdings', id, { price: egp(410_000), priced_on: '2026-09-24' } as never, { actor: 'p_1' }));
  await settle(api);
  const priced = await worth(api);
  assert.deepEqual(priced.parts, [['EGP', 4_100_000]]);
  assert.equal(priced.note, '', 'a holding with a price was still said to stand at what it cost');
  assert.equal(priced.tiles, 1, 'the tile was drawn twice');
  /* WHAT WAS PAID IS KEPT BESIDE WHAT IT IS WORTH: a price writes `value` and leaves `cost` as it was. */
  const row = api.kernel.get(id)!.fields;
  assert.deepEqual([row.cost, row.value], [egp(3_000_000), egp(4_100_000)]);
  close();
});

test('THE FIGURE SAYS HOW MANY STAND AT WHAT THEY COST: 3 of 5, with two of them priced', async () => {
  const { api, close } = await inPounds();
  const ids = [1, 2, 3, 4, 5].map((n) => hold(api, { label: `Lot ${n}`, kind: 'commodity', qty: n, unit_cost: egp(100_000) }));
  await settle(api);
  assert.equal((await worth(api)).note, '5 of 5 at what they cost');
  for (const id of ids.slice(0, 2)) said(api.kernel.update('holdings', id, { price: egp(150_000), priced_on: '2026-09-20' } as never, { actor: 'p_1' }));
  await settle(api);
  const read = await worth(api);
  assert.equal(read.note, '3 of 5 at what they cost');
  /* ONE AND TWO AT 1,500 EACH, THREE, FOUR AND FIVE AT THE 1,000 EACH THEY COST: 4,500 and 12,000. */
  assert.deepEqual(read.parts, [['EGP', 450_000 + 1_200_000]]);
  close();
});

test('A PRICE TAKEN AWAY PUTS THE HOLDING BACK AT WHAT IT COST, and a count that moves moves the worth with it', async () => {
  const { api, close } = await inPounds();
  const id = hold(api, { label: 'Silver, ten grams', kind: 'commodity', qty: 10, unit_cost: egp(300_000), price: egp(410_000), priced_on: '2026-09-24' });
  await settle(api);
  const value = (): unknown => api.kernel.get(id)!.fields.value;
  assert.deepEqual(value(), egp(4_100_000), 'a holding written with its price was valued at what it cost');
  said(api.kernel.update('holdings', id, { qty: 4 } as never, { actor: 'p_1' }));
  await settle(api);
  assert.deepEqual([api.kernel.get(id)!.fields.cost, value()], [egp(1_200_000), egp(1_640_000)]);
  said(api.kernel.update('holdings', id, { price: null } as never, { actor: 'p_1' }));
  await settle(api);
  assert.deepEqual(value(), egp(1_200_000));
  assert.equal((await worth(api)).note, '1 of 1 at what they cost');
  close();
});

test('A RECORD ON 1.3.0 UPDATES TO THIS FILE AND EVERY COSTED HOLDING GAINS ITS WORTH, with nobody writing a row again', async () => {
  const released = JSON.parse(readFileSync(new URL('../../packages/seed/test/fixtures/released/holdings-1.3.0.json', import.meta.url), 'utf8')) as Body;
  assert.equal(released.version, '1.3.0');
  const { api, clock, close } = await money();
  said(await put(api, released));
  const ids = HELD.map((row) => hold(api, row));
  await settle(api);
  assert.deepEqual(ids.map((id) => api.kernel.get(id)!.fields.value), [undefined, undefined, undefined]);
  said(await put(api, file()));
  /* THE SWEEP ASKS FOR ROWS WITH NO `value`, not rows with no `cost`: every row 1.3.0 costed has a cost and no worth. */
  clock.advance(SPREAD_MS + 1);
  await settle(api);
  assert.deepEqual(ids.map((id) => api.kernel.get(id)!.fields.value), [
    { amount: 100_000, currency: 'EUR' },
    { amount: 500_000, currency: 'EUR' },
    { amount: 54_000, currency: 'USD' },
  ]);
  const read = await worth(api);
  assert.deepEqual(read.parts, [['EUR', 600_000], ['USD', 54_000]]);
  assert.equal(read.note, '3 of 3 at what they cost');
  close();
});

/* ── 1.4.0, before it shipped: the day a price was said, and a price gone old (REC-B17 Risk) ──────────────────────── */

/**
 * RED FIRST, MEASURED. The three tests below were written against the file as batch 64 left it and all three failed: a
 * price written with no day kept no day, so nothing could say how old it was, and the page had no figure over
 * `priced_on` and no block that read one.
 *
 * THE GRAMMAR ALREADY HOLDS IT, which is why nothing here waits on the kernel: the earliest day in a day field is
 * `{ min: 'priced_on' }` under `format: 'day'`, as money-core's `cash-as-of` is, and `priced_on before -30d` counts the
 * prices more than thirty days old. The day is the record's own (`ctx.today()`), the 25th of September in every test.
 */
const TODAY = '2026-09-25';
const epochDay = (d: string): number => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

/** The two blocks that say how old the prices are, as the page answers them: the plain tile and the warning. */
async function pricedOn(api: Api): Promise<{ tile: boolean; warning: boolean; day: unknown; tone: unknown; body: string }> {
  type Cell = { metric: string; reading: { value: number | null } };
  type Block = { kind: string; heading?: string; tone?: string; body?: string; drawn?: boolean; why?: string; refusals: unknown[]; values?: Body; cells?: { metric: string }[]; readings?: Cell[] };
  const page = said<{ blocks: Block[] }>(await api.page({ slug: 'holdings' }, owner));
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  /* A BLOCK ITS `when` LEFT OUT KEEPS WHAT IT WAS DECLARED WITH AND IS NOT READ, so the tile is found by its cells. */
  const reads = (b: Block): boolean => JSON.stringify([b.body ?? '', b.cells?.map((c) => c.metric) ?? []]).includes('holdings-priced-on');
  const on = (b: Block): boolean => b.drawn !== false && b.why === undefined;
  const tile = page.blocks.find((b) => b.kind === 'stat' && reads(b));
  const warning = page.blocks.find((b) => b.kind === 'note' && reads(b));
  assert.ok(tile && warning, 'the page has no tile and no warning over the day its prices were said');
  const drawn = on(warning) ? warning : tile;
  const day = on(warning) ? warning.values?.['holdings-priced-on'] : tile.readings?.find((r) => r.metric === 'holdings-priced-on')?.reading.value;
  return { tile: on(tile), warning: on(warning), day, tone: drawn.tone, body: warning.body ?? '' };
}

test('A PRICE WRITTEN WITH NO DAY IS STAMPED WITH TODAY, a day somebody typed is kept, and a row that says it all is left alone', async () => {
  const { api, close } = await inPounds();
  const bare = hold(api, { label: 'Silver, ten grams', kind: 'commodity', qty: 10, unit_cost: egp(300_000), price: egp(410_000) });
  const typed = hold(api, { label: 'Silver, five grams', kind: 'commodity', qty: 5, unit_cost: egp(300_000), price: egp(410_000), priced_on: '2026-09-01' });
  const unpriced = hold(api, { label: 'Term deposit', kind: 'certificate', qty: 1, unit_cost: egp(5_000_000) });
  await settle(api);
  const day = (id: string): unknown => api.kernel.get(id)!.fields.priced_on;
  assert.equal(day(bare), TODAY, 'a price with no day was taken as it is, so nothing can say how old it is');
  assert.equal(day(typed), '2026-09-01', 'the day somebody typed was written over');
  assert.equal(day(unpriced), undefined, 'a holding nobody priced was given a day');

  /* AND A PRICE SAID LATER, ON A ROW THAT HAD NONE, IS STAMPED THEN: the rule hears `price`, and the script the empty day. */
  said(api.kernel.update('holdings', unpriced, { price: egp(5_200_000) } as never, { actor: 'p_1' }));
  await settle(api);
  assert.equal(day(unpriced), TODAY);
  assert.deepEqual(api.kernel.get(unpriced)!.fields.value, egp(5_200_000));

  /* NOTHING MOVED, NOTHING WRITTEN: the host coming round again leaves all three as they stand. */
  const writes = (id: string): number => (api.kernel as unknown as { history(id: string): unknown[] }).history(id).length;
  const before = [bare, typed, unpriced].map(writes);
  await settle(api);
  assert.deepEqual([bare, typed, unpriced].map(writes), before, 'the script wrote a row again with nothing moved');
  close();
});

test('THE PAGE SAYS THE OLDEST DAY A PRICE WAS SAID, and says nothing about a day while nothing is priced', async () => {
  const { api, close } = await inPounds();
  const ids = [1, 2, 3].map((n) => hold(api, { label: `Lot ${n}`, kind: 'commodity', qty: n, unit_cost: egp(100_000) }));
  await settle(api);
  const none = await pricedOn(api);
  assert.deepEqual([none.tile, none.warning], [false, false], 'a day was drawn over holdings nobody has priced');

  said(api.kernel.update('holdings', ids[0]!, { price: egp(150_000), priced_on: '2026-09-20' } as never, { actor: 'p_1' }));
  said(api.kernel.update('holdings', ids[1]!, { price: egp(150_000) } as never, { actor: 'p_1' }));
  await settle(api);
  const fresh = await pricedOn(api);
  assert.deepEqual([fresh.tile, fresh.warning], [true, false]);
  /* THE OLDEST OF THE TWO, the 20th and not the day the second was stamped, as whole days since 1970 under `format: day`. */
  assert.equal(fresh.day, epochDay('2026-09-20'));
  assert.equal(file().declarations.find((d) => d.metric === 'holdings-priced-on')?.format, 'day');
  close();
});

test('A PRICE OVER THIRTY DAYS OLD TURNS THE DAY INTO A WARNING, and thirty days exactly does not', async () => {
  const { api, close } = await inPounds();
  const ids = [1, 2].map((n) => hold(api, { label: `Lot ${n}`, kind: 'commodity', qty: n, unit_cost: egp(100_000), price: egp(150_000), priced_on: '2026-09-20' }));
  /* THIRTY DAYS BEFORE THE 25TH OF SEPTEMBER IS THE 26TH OF AUGUST. */
  said(api.kernel.update('holdings', ids[0]!, { priced_on: '2026-08-26' } as never, { actor: 'p_1' }));
  await settle(api);
  const edge = await pricedOn(api);
  assert.deepEqual([edge.tile, edge.warning, edge.day], [true, false, epochDay('2026-08-26')]);

  said(api.kernel.update('holdings', ids[0]!, { priced_on: '2026-08-25' } as never, { actor: 'p_1' }));
  await settle(api);
  const old = await pricedOn(api);
  /* ONE OR THE OTHER, NEVER BOTH: the warning takes the tile's place, so the day is said once. */
  assert.deepEqual([old.tile, old.warning], [false, true]);
  assert.equal(old.tone, 'warn');
  assert.match(old.body, /^Priced on \{\{holdings-priced-on\}\}/u);
  /* LATE IS NEVER COLOUR ALONE: the words say it, and the deeper red only repeats them. */
  assert.match(old.body, /\{\{bad:over 30 days ago\}\}/u);
  assert.doesNotMatch(old.body, /—/u);

  /* A PRICE TAKEN AWAY TAKES ITS DAY OUT OF THE READING, so an old day beside no price warns about nothing. */
  said(api.kernel.update('holdings', ids[0]!, { price: null } as never, { actor: 'p_1' }));
  await settle(api);
  const gone = await pricedOn(api);
  assert.deepEqual([gone.tile, gone.warning, gone.day], [true, false, epochDay('2026-09-20')]);
  close();
});

/* ── a price said again ──────────────────────────────────────────────────────────────────────────────────────────────
   A price typed again on a holding that already had a day kept the old day, so the warning stayed over a price said
   that morning. The script is handed the row and never what moved, and reads no history, so it cannot tell a new
   price from an old one by itself: the rule hands it `changed`, the fields the write moved, from `{{trigger.changed}}`.
   The first test holds it end to end on a record, and the script's own half is held below with the input the path
   hands it. */

const SIXTY_AGO = '2026-07-27';
const priced = (api: Api): string =>
  hold(api, { label: 'Silver, ten grams', kind: 'commodity', qty: 10, unit_cost: egp(300_000), price: egp(410_000), priced_on: SIXTY_AGO });
const dayOf = (api: Api, id: string): unknown => api.kernel.get(id)!.fields.priced_on;

test('A PRICE CHANGED ON A HOLDING PRICED SIXTY DAYS AGO IS DATED TODAY, and the warning goes', async () => {
  const { api, close } = await inPounds();
  const id = priced(api);
  await settle(api);
  assert.equal(dayOf(api, id), SIXTY_AGO);
  assert.equal((await pricedOn(api)).warning, true);
  said(api.kernel.update('holdings', id, { price: egp(455_000) } as never, { actor: 'p_1' }));
  await settle(api);
  assert.equal(dayOf(api, id), TODAY, 'a price said today kept the day of the price it replaced');
  assert.equal((await pricedOn(api)).warning, false);
  close();
});

test('A COUNT THAT MOVES LEAVES THE DAY THE PRICE WAS SAID, since nobody priced anything', async () => {
  const { api, close } = await inPounds();
  const id = priced(api);
  await settle(api);
  said(api.kernel.update('holdings', id, { qty: 4 } as never, { actor: 'p_1' }));
  await settle(api);
  assert.equal(dayOf(api, id), SIXTY_AGO, 'a change to the count dated the price today');
  assert.deepEqual(api.kernel.get(id)!.fields.value, egp(1_640_000));
  close();
});

test('A PRICE TAKEN AWAY TAKES ITS DAY WITH IT, so no day stands beside no price', async () => {
  const { api, close } = await inPounds();
  const id = priced(api);
  await settle(api);
  said(api.kernel.update('holdings', id, { price: null } as never, { actor: 'p_1' }));
  await settle(api);
  assert.equal(dayOf(api, id) ?? null, null, 'the day stayed on a holding with no price');
  assert.deepEqual(api.kernel.get(id)!.fields.value, egp(3_000_000));
  close();
});

test('A DAY WRITTEN WITH THE PRICE IN ONE GO IS NEVER WRITTEN OVER, on a holding that had a day and on one that had none', async () => {
  const { api, close } = await inPounds();
  const had = priced(api);
  const none = hold(api, { label: 'Term deposit', kind: 'certificate', qty: 1, unit_cost: egp(5_000_000) });
  await settle(api);
  said(api.kernel.update('holdings', had, { price: egp(455_000), priced_on: '2026-09-18' } as never, { actor: 'p_1' }));
  said(api.kernel.update('holdings', none, { price: egp(5_200_000), priced_on: '2026-09-18' } as never, { actor: 'p_1' }));
  await settle(api);
  assert.deepEqual([dayOf(api, had), dayOf(api, none)], ['2026-09-18', '2026-09-18'], 'the day somebody wrote with the price was written over');
  close();
});

/**
 * The script by itself, handed what a rule whose `{{trigger.changed}}` is filled would hand it. No record: one row in,
 * and what the script asks to be written out. The first test above holds the same end to end.
 */
async function handed(changed: string | undefined, fields: Body): Promise<Body | null> {
  const run = ((await import(new URL('./cost.js', import.meta.url).href)) as { default: (ctx: unknown) => Promise<void> }).default;
  let wrote: Body | null = null;
  await run({
    input: { id: 'x', ...(changed === undefined ? {} : { changed }) },
    today: () => TODAY,
    record: { get: async () => ({ seq: 1, version: 1, fields: { qty: 10, unit_cost: egp(300_000), cost: egp(3_000_000), ...fields } }) },
    update: (_at: string, next: Body) => void (wrote = next),
  });
  return wrote;
}

test('THE SCRIPT, TOLD THE PRICE MOVED, DATES IT TODAY, and told the day moved with it, or told nothing, keeps the day', async () => {
  const old = { price: egp(455_000), value: egp(4_550_000), priced_on: SIXTY_AGO };
  assert.deepEqual(await handed('price', old), { priced_on: TODAY });
  assert.equal(await handed('price,priced_on', old), null, 'a day written with the price was written over');
  assert.equal(await handed('priced_on,price', old), null);
  assert.equal(await handed('qty', old), null, 'a count that moved dated the price');
  /* NOT TOLD: no `changed` (the clock's run), and the dash a record that does not fill the path hands on. */
  assert.equal(await handed(undefined, old), null);
  assert.equal(await handed('—', old), null);
  /* A PRICE SAID TWICE IN A DAY writes nothing the second time, and a price with no day is dated whatever moved. */
  assert.equal(await handed('price', { ...old, priced_on: TODAY }), null);
  assert.deepEqual(await handed('qty', { price: egp(455_000), value: egp(4_550_000) }), { priced_on: TODAY });
  /* TAKEN AWAY: the worth goes back to the cost and the day goes with the price. */
  assert.deepEqual(await handed('price', { value: egp(4_550_000), priced_on: SIXTY_AGO }), { value: egp(3_000_000), priced_on: null });
});

/* ── An account and a holding that share a name ────────────────────────────────────────────────── */

/**
 * `twin.js` by itself, with the record as two lists: what it would ask, or null. The same double `handed` uses, so the
 * matching is held with no clock and no gate in the way.
 */
type TwinAsk = { cause: string; question: string; about: string; options: { id: string; label: string; because: string; patches?: Body[] }[] };
const TWIN_FILE = new URL('./twin.js', import.meta.url);
async function twin(accounts: readonly Body[], holdings: readonly Body[], today = TODAY): Promise<TwinAsk | null> {
  const run = ((await import(TWIN_FILE.href)) as { default: (ctx: unknown) => Promise<{ ask: TwinAsk } | null> }).default;
  const rows = (list: readonly Body[]) => list.map((fields, i) => ({ seq: i + 1, version: 3, fields }));
  const out = await run({
    input: null,
    today: () => today,
    log: () => undefined,
    record: { list: async (register: string) => (register === 'accounts' ? rows(accounts) : register === 'holdings' ? rows(holdings) : []) },
  });
  return out === null || out === undefined ? null : out.ask;
}
const QUESTION = 'Silver Bar is an account and a holding. It may be counted twice. Stop counting the account as cash?';
const ACCOUNT: Body = { name: 'Silver Bar', kind: 'cash', balance: egp(3_000_000), as_of: TODAY, liquid: true };
const HOLDING: Body = { label: 'silver  bar', kind: 'commodity', qty: 10, unit_cost: egp(300_000) };

test('AN ACCOUNT AND A HOLDING WITH ONE NAME GIVE ONE ASK, in those words, with two answers, whatever the case and the spaces', async () => {
  const ask = await twin([ACCOUNT], [HOLDING]);
  assert.equal(ask?.question, QUESTION);
  assert.deepEqual(ask?.options.map((o) => o.label), ['Stop counting it', 'Keep counting it']);
  /* THE ONE CHANGE AN ANSWER CARRIES: the account stops counting as cash, at the version this run read. */
  assert.deepEqual(ask?.options.map((o) => o.patches ?? []), [[{ id: 'accounts#1', version: 3, fields: { liquid: false } }], []]);
  assert.equal(ask?.about, 'Silver Bar');
  /* THE PAIR IS THE CAUSE, by the two lines' own numbers, so the gate holds one question to a pair. */
  assert.equal(ask?.cause, 'holdings.twin:1:1');
  for (const [a, h] of [[' SILVER BAR ', 'Silver Bar'], ['SilverBar', 'silver bar'], ['Silver\tBar', 'S i l v e r b a r']])
    assert.ok(await twin([{ ...ACCOUNT, name: a }], [{ ...HOLDING, label: h }]), `${JSON.stringify(a)} and ${JSON.stringify(h)} were read as two names`);
  /* NO EM DASH AND NO NUMBER OF A LINE IN WHAT A PERSON READS. */
  const read = [ask!.question, ...ask!.options.flatMap((o) => [o.label, o.because])].join(' ');
  assert.doesNotMatch(read, /—|#\d|\baccounts\b|\bliquid\b/u);
});

test('DIFFERENT NAMES ASK NOTHING, and so does an account that does not count as cash, a closed one, or a name that is blank', async () => {
  assert.equal(await twin([ACCOUNT], [{ ...HOLDING, label: 'Silver coin' }]), null);
  assert.equal(await twin([{ ...ACCOUNT, name: 'Silver Bars' }], [HOLDING]), null, 'a name inside another name is not the same name');
  assert.equal(await twin([{ ...ACCOUNT, liquid: false }], [HOLDING]), null, 'an account already left out of cash was asked about');
  assert.equal(await twin([{ ...ACCOUNT, state: 'closed' }], [HOLDING]), null);
  assert.equal(await twin([{ ...ACCOUNT, name: '  ' }], [{ ...HOLDING, label: ' ' }]), null, 'two blank names were read as one name');
});

test('A RECORD WITH NO HOLDINGS OR NO ACCOUNTS ASKS NOTHING', async () => {
  assert.equal(await twin([], []), null);
  assert.equal(await twin([ACCOUNT], []), null);
  assert.equal(await twin([], [HOLDING]), null);
});

test('TWO PAIRS ARE EACH ASKED ABOUT, a night apart, since one run asks one question and an answered pair must not hide the next', async () => {
  const accounts = [ACCOUNT, { ...ACCOUNT, name: 'Term deposit' }];
  const holdings = [HOLDING, { ...HOLDING, label: 'TERM DEPOSIT' }];
  const causes = new Set<string>();
  for (const day of ['2026-09-25', '2026-09-26']) causes.add((await twin(accounts, holdings, day))!.cause);
  assert.deepEqual([...causes].sort(), ['holdings.twin:1:1', 'holdings.twin:2:2']);
});

type Question = { id: string; status: string; by: string; cause: string | null; question: string; labels: string[] };

/** A record with Money and this add-on, and every question a script of it ever asked, open or answered, oldest first. */
async function asking(): Promise<{ api: Api; night: () => Promise<void>; asked: () => Question[]; answer: (id: string, option: string) => Promise<void>; close: () => void }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  for (const id of FIRST_PARTY) said(await put(api, firstPartyDocument(id)));
  said(await put(api, file()));
  const asked = (): Question[] =>
    sql.all<{ id: string; status: string; opened_by: string; cause: string | null; body: string }>("SELECT id, status, opened_by, cause, body FROM suggestion WHERE opened_by LIKE 'script:holdings%' ORDER BY opened_at, id").map((s) => ({
      id: s.id,
      status: s.status,
      by: s.opened_by,
      cause: s.cause,
      question: sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'suggest' AND target = ?", `suggestion:${s.id}`)?.to_v ?? '',
      labels: (JSON.parse(s.body) as { options: { label: string }[] }).options.map((o) => o.label),
    }));
  /* A DAY AND AN HOUR, since a nightly clock is due some minutes past the day (its own spread). THE SCRIPT IS HANDED
     THE SAME CLOCK, so its `ctx.today()` turns with the night, as it does on a host, and the pair it picks turns too. */
  const night = async (): Promise<void> => {
    clock.advance(25 * 3_600_000);
    await settle(api, 4, clock.now);
  };
  const answer = async (id: string, option: string): Promise<void> => {
    said(api.kernel.decide(id, { decide: { option, reason: 'Looked at both.' } } as never, 'p_1'));
    await settle(api);
  };
  return { api, night, asked, answer, close: () => sql.close() };
}
const bank = (api: Api, fields: Body): string => said<{ id: string }>(api.kernel.create('accounts', fields as never, { actor: 'p_1' })).id;

test('ON A RECORD: the pair is asked about ONCE, on Decide, by the script and never by `system`, and "Keep counting it" is the last of it', async () => {
  const { api, night, asked, answer, close } = await asking();
  const account = bank(api, ACCOUNT);
  hold(api, HOLDING);
  bank(api, { ...ACCOUNT, name: 'Everyday' });
  hold(api, { ...HOLDING, label: 'Life cover' });
  await night();
  const first = asked();
  assert.deepEqual(first.map((q) => [q.status, q.question, q.labels]), [['open', QUESTION, ['Stop counting it', 'Keep counting it']]]);
  assert.notEqual(first[0]!.by, 'system');
  assert.match(first[0]!.by, /holdings_twin/);
  /* A SECOND NIGHT WITH NOBODY ANSWERING finds the question waiting and adds none. */
  await night();
  assert.equal(asked().length, 1);
  await answer(first[0]!.id, 'keep');
  assert.equal(api.kernel.get(account)!.fields.liquid, true, 'keeping it changed the account');
  /* ANSWERED, AND NEVER ASKED AGAIN FOR THAT PAIR, however many nights pass. */
  for (let i = 0; i < 3; i += 1) await night();
  assert.deepEqual(asked().map((q) => q.status === 'open'), [false]);
  close();
});

test('ON A RECORD: "Stop counting it" takes the account out of cash, as the person, and the pair is not asked about again', async () => {
  const { api, night, asked, answer, close } = await asking();
  const account = bank(api, ACCOUNT);
  hold(api, HOLDING);
  await night();
  const [q] = asked();
  assert.equal(q?.question, QUESTION);
  await answer(q!.id, 'stop');
  const now = api.kernel.get(account)!;
  assert.equal(now.fields.liquid, false);
  assert.deepEqual(now.fields.balance, egp(3_000_000), 'the account lost its balance; only whether it counts as cash moves');
  for (let i = 0; i < 2; i += 1) await night();
  assert.equal(asked().length, 1);
  close();
});

test('ON A RECORD: different names, no holdings, or no accounts leave Decide empty night after night', async () => {
  const { api, night, asked, close } = await asking();
  await night();
  assert.deepEqual(asked(), [], 'a record with neither was asked something');
  bank(api, ACCOUNT);
  await night();
  assert.deepEqual(asked(), [], 'an account with no holdings was asked about');
  hold(api, { ...HOLDING, label: 'Silver coin' });
  await night();
  assert.deepEqual(asked(), []);
  close();
});

test('THE SCRIPT IN THE FILE IS twin.js, byte for byte: it reads holdings and accounts, writes only accounts, and runs once a day', () => {
  const script = file().declarations.find((d) => d.script === 'holdings_twin')!;
  assert.ok(script, 'holdings.pack.json declares no holdings_twin');
  assert.equal(script.source, readFileSync(TWIN_FILE, 'utf8'), 'holdings.pack.json and twin.js disagree; copy twin.js into the source');
  assert.deepEqual([script.egress, script.keys, script.reads, script.writes, script.runs], [[], [], ['holdings', 'accounts'], ['accounts'], { every: '1d' }]);
  /* NO RULE STARTS IT: a question a write opened would come the moment a name was typed, mid-edit. */
  assert.deepEqual(file().declarations.filter((d) => d.rule !== undefined).map((d) => d.rule), ['holdings_cost']);
});

/* ── What the script is not told (audit 71, finding 6) ─────────────────────────────────────────── */

/**
 * WHY THESE TWO ARE `todo`. A script is handed lists and nothing about questions: `ctx.record` reads the lists it
 * declared, and whether a cause waits or was answered is said to the host after the run, never to the script. So
 * `twin.js` cannot skip a pair somebody answered, and it cannot ask again about one whose account moved. And an answer's
 * change must say the version it read, so it cannot leave that out either. Both are the record's to fix, not this
 * file's. The tests beside them hold what is true today, so the two faults have a size.
 */
const WAITS = 'the record tells a script nothing about a question it asked, and an answer\'s change must carry a version';

/**
 * One pair asked about and answered "Keep counting it", then a second pair written down: how many nights until the
 * second is asked about. `idle` nights pass first, so the two calls stand on days of either parity and one of them
 * lands the day's pick on the answered pair.
 */
async function nightsToSecond(idle: number): Promise<number> {
  const { api, night, asked, answer, close } = await asking();
  try {
    for (let i = 0; i < idle; i += 1) await night();
    bank(api, ACCOUNT);
    hold(api, HOLDING);
    await night();
    await answer(asked()[0]!.id, 'keep');
    bank(api, { ...ACCOUNT, name: 'Term deposit' });
    hold(api, { ...HOLDING, label: 'TERM DEPOSIT' });
    for (let n = 1; n <= 4; n += 1) {
      await night();
      if (asked().length === 2) return n;
    }
    return Infinity;
  } finally {
    close();
  }
}
let secondAsked: Promise<number[]> | undefined;
const bothParities = (): Promise<number[]> => (secondAsked ??= Promise.all([nightsToSecond(0), nightsToSecond(1)]));

test('ON A RECORD: a pair written down after another was answered IS asked about, within two nights on any day', async () => {
  const nights = await bothParities();
  assert.ok(nights.every((n) => n <= 2), `the second pair waited ${nights.join(' and ')} nights; an answered pair hid it`);
});

test('ON A RECORD: the night the pick lands on an answered pair, the run asks about the other one', { todo: WAITS }, async () => {
  assert.deepEqual(await bothParities(), [1, 1], 'on one of two days the run picked the answered pair and asked nothing');
});

/** A record with the pair asked about, and then the account's balance moved, as a balance does. */
async function movedSinceAsked(): Promise<Awaited<ReturnType<typeof asking>> & { account: string; question: string }> {
  const record = await asking();
  const account = bank(record.api, ACCOUNT);
  hold(record.api, HOLDING);
  await record.night();
  said(record.api.kernel.update('accounts', account, { balance: egp(3_100_000) } as never, { actor: 'p_1' }));
  return { ...record, account, question: record.asked()[0]!.id };
}
const stop = (api: Api, id: string): Out => api.kernel.decide(id, { decide: { option: 'stop', reason: 'Looked at both.' } } as never, 'p_1') as Out;

test('ON A RECORD: an account that moved since the question REFUSES "Stop counting it" and writes nothing, and the question waits', async () => {
  const { api, night, asked, account, question, close } = await movedSinceAsked();
  try {
    const out = stop(api, question);
    assert.equal(out.ok, false);
    assert.equal(out.refusal?.code, 'VERSION_STALE');
    /* THE REFUSAL NAMES THE ACCOUNT, never its number. */
    assert.match(out.refusal!.fix, /"Silver Bar" changed after this was asked/u);
    assert.equal(api.kernel.get(account)!.fields.liquid, true, 'a refused answer changed the account');
    /* ONE QUESTION STILL, AND STILL OPEN: nights add none, since the pair's cause is waiting. */
    for (let i = 0; i < 2; i += 1) await night();
    assert.deepEqual(asked().map((q) => q.status), ['open']);
    /* "Keep counting it" changes nothing, so it is never stale and still ends it. */
    said(api.kernel.decide(question, { decide: { option: 'keep', reason: 'Looked at both.' } } as never, 'p_1'));
    assert.deepEqual(asked().map((q) => q.status === 'open'), [false]);
  } finally {
    close();
  }
});

test('ON A RECORD: an account that moved since the question can still be taken out of cash, the night after at the latest', { todo: WAITS }, async () => {
  const { api, night, asked, account, close } = await movedSinceAsked();
  try {
    await night();
    const open = asked().filter((q) => q.status === 'open');
    assert.equal(open.length, 1);
    const out = stop(api, open[0]!.id);
    assert.ok(out.ok, `${out.refusal?.code}: ${out.refusal?.fix}`);
    assert.equal(api.kernel.get(account)!.fields.liquid, false);
  } finally {
    close();
  }
});
