/**
 * What a person holds, as a pack file: the list that left Money at money-core 2.0.0, and what it cost together
 * (`loop/research-legacy-parity.md` brief B1, row 47; `loop/DIRECTION.md` sections 22, 24 and 27).
 *
 * THE DOCUMENT WAS A FUNCTION IN `packages/seed`. `holdingsPack` in `packages/seed/src/packs/holdings.ts` built it in
 * code, so the shell carried one person's kind of list as TypeScript, and the only thing that ever offered it was the
 * the old tool import. It is now `holdings.pack.json`, installed through the record's own `planPack` and `installPack`.
 * The builder went on 25 September, once the import resolved the pack by id from the catalogue (brief B2). What it built
 * is kept beside this file as `holdings-1.0.0.json`, written from it that day, because 1.0.0 is what a record that took
 * money-core 2.0.0 was offered and is what the update below starts from. The first test holds the list in this file to
 * that one, so the two cannot say different things about a row.
 *
 * WHY 1.1.0 AND WHY A SCRIPT. The survey's row 47 read "no value figure, no page". A figure is one aggregation over one
 * field (`AGGREGATIONS` in `packages/kernel/src/metrics.ts`), and `product` multiplies a field by a NAMED FACTOR TABLE,
 * never by another field, so no declared figure says "how many times what one cost". `portfolio-bands` met the same
 * wall and answered it with a script, which is the shell's own answer (section 22) to a sum nobody can declare. So the
 * list gains `cost`, a rule starts `cost.js` whenever `qty` or `unit_cost` is written, the script writes the product
 * into `cost`, and `Holdings value` is a plain sum over it. A field, a rule, a script, three figures and a page are added
 * and nothing is taken away, so the step is a minor one by `first-party.ts`'s rule.
 *
 * AND WHY THE SCRIPT ALSO RUNS ONCE A DAY. The rule only hears a write to `qty` or `unit_cost`, and updating from 1.0.0
 * writes neither, so every row a record already held stayed uncosted until somebody edited it. Measured on September
 * 25th: 1.0.0, three rows, then this file, then the rule and the outbox drained. `cost` stayed undefined on all three,
 * and the figure read value 0 over rows 3 under the note "what was paid for 3 holding(s)", a wrong amount stated as a fact.
 * Every record the the old tool import set up before it resolved packs from the catalogue gets here that way, because
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
 * this figure when probed on September 25th: it resolves the register and the figure from the build's own seed tables,
 * and a pack's list is in neither.
 *
 * WHAT IT IS NOT, said here because the tile cannot say it at length: a valuation. What gold or a policy is worth today
 * is a rate away, and a rate is `fx`'s or a person's script's. This is what was paid.
 *
 * RED FIRST, MEASURED ON SEPTEMBER 25TH. With no file, seven of the eight failed ENOENT, and the eighth is the one that
 * holds a record with every first-party pack to having no `holdings` list, no `holdings-value` figure and no Holdings
 * page. With the file and a script that writes nothing, four failed: the costing, the figure, the page and the byte
 * comparison with `cost.js`, so the figure is the script's arithmetic and not a sum that happened to agree. The fixture
 * rows are invented; none is anybody's.
 *
 * RED AGAIN THE SAME DAY, for the upgrade: the three tests under "a record that had the list at 1.0.0" were written
 * against the rule-only file and all three failed, 11 of 14 passing: every cost undefined after the sweep's due time,
 * the tile at `rows: 3` rather than 0 with nothing costed, and 0 rows costed where fifty were expected.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
async function settle(api: Api, rounds = 3): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('the cost script fetches nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);
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
  /* 1.2.0 IS MOD-20's, and adds one key: `holdings-value` is `sellable`, so a forecast's sell control offers it. */
  assert.equal(doc.version, '1.2.0');
  assert.equal(doc.declarations.find((d) => d.metric === 'holdings-value')?.sellable, true);
  assert.equal(built.version, '1.0.0', 'the frozen 1.0.0 moved, so this file has to say what it now is beside it');
  assert.deepEqual(doc.requires, built.requires);
  const list = doc.declarations.find((d) => d.register === 'holdings')!;
  const fields = list.fields as Body[];
  /* BYTE FOR BYTE IN MEANING, BUT FOR THE ONE FIELD 1.1.0 ADDS. */
  assert.deepEqual({ ...list, fields: fields.filter((f) => f.id !== 'cost') }, built.declarations[0]);
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

test('INSTALLED FROM THE FILE: one list, one rule, one script, three figures and a page, and nothing refused', async () => {
  const { api, close } = await money();
  const diff = await planOf(api, file());
  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(
    diff.adds.map((a) => a.id).sort(),
    ['metric.holdings-costed', 'metric.holdings-count', 'metric.holdings-value', 'page.holdings', 'register.holdings', 'rule.holdings_cost', 'script.holdings_cost'],
  );
  said(await put(api, file()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'holdings')?.version, '1.2.0');
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
  const tile = page.blocks.find((b) => b.heading === 'What you hold')!;
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
  const page = said<{ blocks: { heading: string; values?: Body; readings?: Reading[] }[] }>(await api.page({ slug: 'holdings' }, owner));
  const block = page.blocks.find((b) => b.heading === 'What you hold')!;
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
  assert.equal(api.kernel.packs().find((p) => p.id === 'holdings')?.version, '1.2.0');
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
  assert.deepEqual([before.values['holdings-costed'], before.values['holdings-count']], [0, 3]);

  /* ONE ROW EDITED IS ONE ROW COSTED BY THE RULE, and the note counts it as one of three rather than the sum as all. */
  said(api.kernel.update('holdings', ids[0]!, { qty: 3 } as never, { actor: 'p_1' }));
  await settle(api);
  const one = await tile(api);
  assert.deepEqual([one.rows, one.parts], [1, [['EUR', 120_000]]]);
  assert.deepEqual([one.values['holdings-costed'], one.values['holdings-count']], [1, 3]);

  clock.advance(SPREAD_MS + 1);
  await settle(api);
  const all = await tile(api);
  assert.deepEqual([all.rows, all.parts], [3, [['EUR', 620_000], ['USD', 54_000]]]);
  assert.deepEqual([all.values['holdings-costed'], all.values['holdings-count']], [3, 3]);
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
  assert.deepEqual([opened.pack.manifest.pack, opened.pack.manifest.version], ['holdings', '1.2.0']);
});
