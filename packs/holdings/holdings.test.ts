/**
 * What a person holds, as a pack file: the list that left Money at money-core 2.0.0, and what it cost together
 * (`loop/research-legacy-parity.md` brief B1, row 47; `loop/DIRECTION.md` sections 22, 24 and 27).
 *
 * THE DOCUMENT WAS A FUNCTION IN `packages/seed`. `holdingsPack` in `packages/seed/src/packs/holdings.ts` built it in
 * code, so the shell carried one person's kind of list as TypeScript, and the only thing that ever offered it was the
 * the old tool import. It is now `holdings.pack.json`, installed through the record's own `planPack` and `installPack`.
 * The builder stays until the import resolves the pack by id (brief B2), and while it does the first test holds the
 * list in this file to the list it builds, so the two cannot say different things about a row.
 *
 * WHY 1.1.0 AND WHY A SCRIPT. The survey's row 47 read "no value figure, no page". A figure is one aggregation over one
 * field (`AGGREGATIONS` in `packages/kernel/src/metrics.ts`), and `product` multiplies a field by a NAMED FACTOR TABLE,
 * never by another field, so no declared figure says "how many times what one cost". `portfolio-bands` met the same
 * wall and answered it with a script, which is the shell's own answer (section 22) to a sum nobody can declare. So the
 * list gains `cost`, a rule starts `cost.js` whenever `qty` or `unit_cost` is written, the script writes the product
 * into `cost`, and `Holdings value` is a plain sum over it. A field, a rule, a script, two figures and a page are added
 * and nothing is taken away, so the step is a minor one by `first-party.ts`'s rule.
 *
 * WHAT IT IS NOT, said here because the tile cannot say it at length: a valuation. What gold or a policy is worth today
 * is a rate away, and a rate is `fx`'s or a person's script's. This is what was paid.
 *
 * RED FIRST, MEASURED ON SEPTEMBER 25TH. With no file, seven of the eight failed ENOENT, and the eighth is the one that
 * holds a record with every first-party pack to having no `holdings` list, no `holdings-value` figure and no Holdings
 * page. With the file and a script that writes nothing, four failed: the costing, the figure, the page and the byte
 * comparison with `cost.js`, so the figure is the script's arithmetic and not a sum that happened to agree. The fixture
 * rows are invented; none is anybody's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { FIRST_PARTY, firstPartyDocument, holdingsPack } from '../../packages/seed/src/index.ts';

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

/** A fresh record holding every first-party pack, which is where a person stands when they add this one. */
async function money(): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of FIRST_PARTY) said(await put(api, firstPartyDocument(id)));
  return { api, close: () => sql.close() };
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

test('THE FILE DECLARES THE LIST THE BUILDER DOES, with `cost` added, and a version above the one the builder ships', () => {
  const doc = file();
  const built = holdingsPack() as Body & { version: string; declarations: Body[] };
  assert.equal(doc.pack, 'holdings');
  assert.equal(doc.version, '1.1.0');
  assert.equal(built.version, '1.0.0', 'the builder moved, so this file has to say what it now is beside it');
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

test('INSTALLED FROM THE FILE: one list, one rule, one script, two figures and a page, and nothing refused', async () => {
  const { api, close } = await money();
  const diff = await planOf(api, file());
  assert.deepEqual(diff.conflicts, []);
  assert.deepEqual(
    diff.adds.map((a) => a.id).sort(),
    ['metric.holdings-count', 'metric.holdings-value', 'page.holdings', 'register.holdings', 'rule.holdings_cost', 'script.holdings_cost'],
  );
  said(await put(api, file()));
  assert.equal(api.kernel.packs().find((p) => p.id === 'holdings')?.version, '1.1.0');
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
  assert.deepEqual([opened.pack.manifest.pack, opened.pack.manifest.version], ['holdings', '1.1.0']);
});
