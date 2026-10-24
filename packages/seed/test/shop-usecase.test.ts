/**
 * Shop, use case 6 of the vision (`loop/progress/planner-45.md`, "The onboarding target"): a fresh record made for a
 * shop holds Orders and Products and nothing in them, its Orders page draws nothing until an order is in, and nothing
 * is written as an example, whether the first run asks for the use case's examples or not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { updateFirstParty, type QuietPort } from '../src/packs/quiet.ts';
import { alongside, arrange, modulesFor, useCase } from '../src/usecases/index.ts';
import { SHOP } from '../src/usecases/shop.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
const MARIAM = "I'm Mariam. I run a small candle shop in Alexandria and freelance as a designer. I lose track of orders and who owes me.";

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

/** A record made the way onboarding makes one: People for the person, each module in order, then each use case's pack. */
async function made(ids: readonly string[], examples: boolean): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const cases = ids.map((id) => useCase(id)!);
  const modules = [...new Set(cases.flatMap((u) => modulesFor(u, ['people'])))];
  for (const m of modules) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(cases[0]!, m, { today: TODAY, holds, examples }));
  }
  for (const u of cases) {
    const carried = carriedDocument(u, TODAY, MARIAM, { examples });
    if (carried) await put(k, carried);
  }
  return { k, sql, clock };
}

type Row = { fields: Record<string, unknown> };
type Drawn = { heading?: string; kind: string; drawn?: boolean; text?: string; body?: string; rows?: Row[]; refusals?: unknown[] };
const everyRow = (k: Kernel): Row[] => held(k).flatMap((r) => value<{ rows: Row[] }>(k.list({ register: r, limit: 100 })).rows);

test('A FRESH SHOP HOLDS ORDERS AND PRODUCTS, both empty, and no entry is tagged example', async () => {
  for (const examples of [false, true]) {
    const { k, sql } = await made(['shop'], examples);
    assert.ok(held(k).includes('orders') && held(k).includes('products'), held(k).join(', '));
    assert.equal(k.count('orders'), 0, 'a new shop has no order it did not write');
    assert.equal(k.count('products'), 0, 'a new shop has no product it did not write');
    const tagged = everyRow(k).filter((r) => Array.isArray(r.fields.tags) && (r.fields.tags as unknown[]).includes('example'));
    assert.deepEqual(tagged, [], `examples ${examples}: an entry was written as an example`);
    sql.close();
  }
});

test('THE ORDERS PAGE DRAWS NOTHING ON A NEW SHOP, and each tile once an order is in it', async () => {
  const { k, sql } = await made(['shop'], false);
  const blocks = value<{ blocks: Drawn[] }>(k.page('orders')).blocks;
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  /* ONE BOX TO ADD THE FIRST ORDER, SINCE 1.4.0 (audit C, X7): the page said "Nothing here yet" and nothing to press. */
  const adds = blocks.filter((b) => b.kind === 'capture' && b.drawn !== false);
  assert.deepEqual(adds.map((b) => b.heading), ['Add an order']);
  const shown = blocks.filter((b) => b.drawn !== false && b.heading !== undefined && b.kind !== 'capture');
  assert.deepEqual(shown.map((b) => b.heading), [], 'a tile was drawn over nothing');
  assert.deepEqual(blocks.flatMap((b) => b.rows ?? []), []);
  /* THE PAGE'S ONE LINE SAYS NOTHING: every clause's figure is nought, and a clause at nought is left out. */
  const line = blocks.find((b) => b.kind === 'note') as (Drawn & { values?: Record<string, number> }) | undefined;
  assert.deepEqual(line?.values, { 'orders-30d': 0, 'orders-due-7d': 0, 'orders-late': 0, 'orders-owed-other': 0 });

  /* ONE ORDER NOBODY HAS PAID FOR, with a total, due in two days: it is due this week and owed. */
  value(k.create('orders', { what: '3 vanilla jars', how_many: 3, due: dayOf(Date.parse(`${TODAY}T00:00:00Z`) + 2 * 86_400_000), total: { amount: 135_000, currency: 'EGP' } }, { actor: 'p_owner' }));
  const after = value<{ blocks: Drawn[] }>(k.page('orders')).blocks;
  for (const b of after) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  const drawn = after.filter((b) => b.drawn !== false && b.heading !== undefined && b.kind !== 'capture');
  assert.deepEqual(drawn.map((b) => b.heading), ['Due this week', 'Still to come in']);
  /* THE TILE IS HEADED AS TODAY'S MONEY TILE OPENS IT (audit 69 finding 4): `OWED_TO_YOU` in
     `apps/web/src/lib/home/default-home.ts` is the same words, held equal by hand since the seed cannot read the web. */
  const orders = (SHOP.pack.declarations as readonly { page?: string; blocks?: { kind: string; heading?: string }[] }[]).find((d) => d.page === 'orders');
  assert.ok(orders?.blocks?.some((b) => b.kind === 'table' && b.heading === 'Still to come in'), 'page.orders holds no table headed Still to come in');
  for (const b of drawn) assert.deepEqual(b.rows?.map((r) => r.fields.what), ['3 vanilla jars'], b.heading);
  sql.close();
});

/* ── step 7: the Orders page, in the Orders section, and its one line ──── */

type Line = Drawn & { values?: Record<string, unknown>; unnamed?: string[] };
const DAY = 86_400_000;
const lineOf = (k: Kernel): Line => value<{ blocks: Line[] }>(k.page('orders')).blocks.find((b) => b.kind === 'note')!;
const daysOn = (n: number): string => dayOf(Date.parse(`${TODAY}T00:00:00Z`) + n * DAY);

test('THE ORDERS PAGE SITS IN THE ORDERS SECTION, the word in her bar, second on the rail since 1.3.0', () => {
  const page = (SHOP.pack.declarations as { page?: string; nav?: { section?: string } }[]).find((d) => d.page === 'orders');
  assert.deepEqual(page?.nav, { section: 'Orders', order: 10, place: 20 });
});

test('THE LEAD SAYS THE MONTH, THE WEEK AND WHO STILL OWES, and the owed clause has nothing to say once she is paid', async () => {
  const { k, sql, clock } = await made(['shop'], false);
  const body = (SHOP.pack.declarations as { page?: string; blocks?: { kind: string; body?: string }[] }[]).find((d) => d.page === 'orders')!.blocks!.find((b) => b.kind === 'note')!.body;
  assert.equal(
    body,
    '{{orders-30d}} order(s) this month, {{orders-due-7d}} to ship this week, {{orders-late}} late, {{orders-owed-other}} not paid in full, and {{orders-owed-named.first_who}} still owes {{orders-owed-named.first_total}}, with {{orders-owed-named.more}} more order(s) not paid at all',
  );
  /* EVERY HOLE NAMES SOMETHING: a typo would be printed as the author's words, never dropped as a nought. */
  assert.deepEqual(lineOf(k).unnamed ?? [], []);

  const salma = value<{ id: string }>(k.create('people', { name: 'Salma' }, { actor: 'p_owner' }));
  const jars = value<{ id: string }>(
    k.create('orders', { what: '3 vanilla jars', who: salma.id, how_many: 3, due: daysOn(2), total: { amount: 135_000, currency: 'EGP' } }, { actor: 'p_owner' }),
  );
  value(k.create('orders', { what: 'A gift box', due: daysOn(20), total: { amount: 40_000, currency: 'EGP' }, paid: { amount: 40_000, currency: 'EGP' }, state: 'paid' }, { actor: 'p_owner' }));
  const owed = lineOf(k);
  assert.deepEqual(owed.refusals ?? [], []);
  /* TWO ORDERS THIS MONTH, ONE TO SHIP, AND SALMA'S TOTAL: the amount in its own currency, never a bare number. */
  assert.equal(owed.values?.['orders-30d'], 2);
  assert.equal(owed.values?.['orders-due-7d'], 1);
  assert.deepEqual(owed.values?.['orders-owed-named.first_total'], { amount: 135_000, currency: 'EGP' });

  /* PAID, NOTHING IS OWED: the owed clause reads nothing and goes, and the month still counts both orders. */
  value(k.update('orders', jars.id, { state: 'paid', paid: { amount: 135_000, currency: 'EGP' } }, { actor: 'p_owner' }));
  const paid = lineOf(k);
  assert.ok(!Object.hasOwn(paid.values ?? {}, 'orders-owed-named.first_total'), JSON.stringify(paid.values));
  assert.ok(!Object.hasOwn(paid.values ?? {}, 'orders-owed-named.first_who'), JSON.stringify(paid.values));
  assert.equal(paid.values?.['orders-30d'], 2);
  assert.equal(paid.values?.['orders-due-7d'], 0);

  /* FIFTEEN DAYS ON THEY ARE STILL THIS MONTH'S; A MONTH ON, NOT. */
  clock.advance(15 * DAY);
  assert.equal(lineOf(k).values?.['orders-30d'], 2);
  clock.advance(16 * DAY);
  assert.equal(lineOf(k).values?.['orders-30d'], 0);
  sql.close();
});

/* THE OWED CLAUSE NAMES THE PERSON: `who` points at People, and `first_<field>` says a ref by the name of the entry it
   points at (pages.ts `rowsValue`). */
test('THE OWED CLAUSE SAYS WHO OWES BY NAME', async () => {
  const { k, sql } = await made(['shop'], false);
  const salma = value<{ id: string }>(k.create('people', { name: 'Salma' }, { actor: 'p_owner' }));
  value(k.create('orders', { what: '3 vanilla jars', who: salma.id, due: daysOn(2), total: { amount: 135_000, currency: 'EGP' } }, { actor: 'p_owner' }));
  assert.equal(lineOf(k).values?.['orders-owed-named.first_who'], 'Salma');
  sql.close();
});

/* ── shop-sentence-52: this week starts today, late is its own, and nobody unpaid is left out of the line ──── */

const EGP = (amount: number) => ({ amount, currency: 'EGP' });
const tile = (k: Kernel, heading: string): unknown[] | undefined => {
  const b = value<{ blocks: Drawn[] }>(k.page('orders')).blocks.find((x) => x.heading === heading && x.drawn !== false);
  return b?.rows?.map((r) => r.fields.what);
};

test('THIS WEEK IS TODAY AND THE SEVEN DAYS AFTER, and an order past its day is late in a clause and a tile of its own', async () => {
  const { k, sql } = await made(['shop'], false);
  for (const [what, on] of [['Yesterday', -1], ['Today', 0], ['In a week', 7], ['In eight days', 8]] as const)
    value(k.create('orders', { what, due: daysOn(on) }, { actor: 'p_owner' }));
  /* SENT IS NOT LATE: it left, whatever its day. */
  value(k.create('orders', { what: 'Sent last week', due: daysOn(-6), state: 'sent' }, { actor: 'p_owner' }));
  const line = lineOf(k);
  assert.deepEqual(line.refusals ?? [], []);
  assert.equal(line.values?.['orders-due-7d'], 2);
  assert.equal(line.values?.['orders-late'], 1);
  assert.deepEqual(tile(k, 'Late'), ['Yesterday']);
  assert.deepEqual(tile(k, 'Due this week'), ['Today', 'In a week']);

  /* NOTHING LATE, NO LATE TILE and a clause at nought, which the lead leaves out. */
  const { k: calm, sql: other } = await made(['shop'], false);
  value(calm.create('orders', { what: 'Today', due: daysOn(0) }, { actor: 'p_owner' }));
  assert.equal(lineOf(calm).values?.['orders-late'], 0);
  assert.equal(tile(calm, 'Late'), undefined);
  sql.close();
  other.close();
});

test('THE OWED CLAUSE NAMES THE OLDEST DUE, not the newest made, as the tile under it opens', async () => {
  const { k, sql } = await made(['shop'], false);
  const [salma, omar] = ['Salma', 'Omar'].map((name) => value<{ id: string }>(k.create('people', { name }, { actor: 'p_owner' })).id);
  value(k.create('orders', { what: '6 amber jars', who: salma, due: daysOn(2), total: EGP(135_000) }, { actor: 'p_owner' }));
  value(k.create('orders', { what: '4 amber jars', who: omar, due: daysOn(9), total: EGP(90_000) }, { actor: 'p_owner' }));
  const line = lineOf(k);
  assert.equal(line.values?.['orders-owed-named.first_who'], 'Salma');
  assert.deepEqual(line.values?.['orders-owed-named.first_total'], EGP(135_000));
  assert.equal(line.values?.['orders-owed-other'], 0);
  assert.deepEqual(tile(k, 'Still to come in'), ['6 amber jars', '4 amber jars']);
  sql.close();
});

test('A DEPOSIT DOES NOT SETTLE AN ORDER: it stays owed and is counted, and its whole total is never said as owed', async () => {
  const { k, sql } = await made(['shop'], false);
  const salma = value<{ id: string }>(k.create('people', { name: 'Salma' }, { actor: 'p_owner' })).id;
  value(k.create('orders', { what: '6 amber jars', who: salma, due: daysOn(2), total: EGP(135_000), paid: EGP(50_000) }, { actor: 'p_owner' }));
  const line = lineOf(k);
  assert.deepEqual(line.refusals ?? [], []);
  assert.equal(line.values?.['orders-owed-other'], 1);
  assert.ok(!Object.hasOwn(line.values ?? {}, 'orders-owed-named.first_total'), JSON.stringify(line.values));
  assert.deepEqual(tile(k, 'Still to come in'), ['6 amber jars']);
  sql.close();
});

test('AN UNPAID ORDER WITH NOBODY ON IT, OR NO DAY, IS COUNTED and never drops the line or takes the name from one that has both', async () => {
  const { k, sql } = await made(['shop'], false);
  /* NOBODY'S, AND THE OLDEST DUE: the clause that names has nothing to name, and the count says one. */
  value(k.create('orders', { what: 'A gift box', due: daysOn(1), total: EGP(40_000) }, { actor: 'p_owner' }));
  const alone = lineOf(k);
  assert.equal(alone.values?.['orders-owed-other'], 1);
  assert.ok(!Object.hasOwn(alone.values ?? {}, 'orders-owed-named.first_who'), JSON.stringify(alone.values));

  /* SALMA'S IS DUE LATER AND IS STILL THE ONE NAMED; an order with her name and no day is counted beside the box. */
  const salma = value<{ id: string }>(k.create('people', { name: 'Salma' }, { actor: 'p_owner' })).id;
  value(k.create('orders', { what: '6 amber jars', who: salma, due: daysOn(5), total: EGP(135_000) }, { actor: 'p_owner' }));
  value(k.create('orders', { what: 'Tea lights', who: salma, total: EGP(20_000) }, { actor: 'p_owner' }));
  const both = lineOf(k);
  assert.equal(both.values?.['orders-owed-named.first_who'], 'Salma');
  assert.deepEqual(both.values?.['orders-owed-named.first_total'], EGP(135_000));
  assert.equal(both.values?.['orders-owed-other'], 2);
  /* EVERY ONE OF THE THREE IS IN THE TILE, whichever clause said it. */
  assert.equal(tile(k, 'Still to come in')?.length, 3);
  sql.close();
});

test('TWO PEOPLE OWE ON THREE ORDERS, and the line names the oldest and counts the other two', async () => {
  const { k, sql } = await made(['shop'], false);
  const salma = value<{ id: string }>(k.create('people', { name: 'Salma' }, { actor: 'p_owner' })).id;
  const dalia = value<{ id: string }>(k.create('people', { name: 'Dalia' }, { actor: 'p_owner' })).id;
  value(k.create('orders', { what: '6 amber jars', who: salma, due: daysOn(2), total: EGP(135_000) }, { actor: 'p_owner' }));
  assert.equal(lineOf(k).values?.['orders-owed-named.more'], 0, 'one order owed, and the line counted another');

  value(k.create('orders', { what: '4 amber jars', who: salma, due: daysOn(9), total: EGP(60_000) }, { actor: 'p_owner' }));
  value(k.create('orders', { what: 'Tea lights', who: dalia, due: daysOn(4), total: EGP(40_000) }, { actor: 'p_owner' }));
  /* PART PAID: counted as not paid in full, never as not paid at all. */
  value(k.create('orders', { what: 'A gift box', who: dalia, due: daysOn(5), total: EGP(40_000), paid: EGP(10_000) }, { actor: 'p_owner' }));
  const line = lineOf(k);
  assert.equal(line.values?.['orders-owed-named.first_who'], 'Salma');
  assert.deepEqual(line.values?.['orders-owed-named.first_total'], EGP(135_000));
  assert.equal(line.values?.['orders-owed-named.more'], 2);
  assert.equal(line.values?.['orders-owed-other'], 1);
  assert.deepEqual(line.unnamed ?? [], []);
  assert.deepEqual(line.refusals ?? [], []);
  /* EVERY ORDER OWED IS SAID ONCE: the one named, the others not paid at all, and the one part paid. */
  assert.equal(1 + 2 + 1, tile(k, 'Still to come in')?.length);
  sql.close();
});

test("MARIAM'S RECORD TAKES SHOP WITH SMALL BUSINESS BESIDE IT, and the two install together", async () => {
  const a = arrange(MARIAM);
  const ids = [a.pick!.usecase, ...alongside(a, a.pick).map((u) => u.usecase)];
  assert.deepEqual(ids, ['shop', 'business']);
  const { k, sql } = await made(ids, false);
  assert.equal(k.count('orders'), 0);
  for (const page of ['orders', 'home-business']) for (const b of value<{ blocks: Drawn[] }>(k.page(page)).blocks) assert.deepEqual(b.refusals ?? [], [], `${page}: ${b.heading} was refused`);
  sql.close();
});

test('A NEW SHOP\'S PROJECTS HAS NO LINE AND ONE BOX TO ADD A PROJECT, and a project in play brings one line back', async () => {
  /* Audit C of 25 October: "No project is in play. Add one, or set a parked one building." in headline type with nothing
     to press, and "Nothing needs a push." under it outside any card. */
  const { k, sql } = await made(['shop', 'business'], false);
  /* PROJECTS AS SIGN-UP ADDS IT BESIDE A SHOP, with no project in it. */
  const holds = new Set([...held(k), ...firstPartyManifest('portfolio').provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
  await put(k, moduleDocument(useCase('shop')!, 'portfolio', { today: TODAY, holds, examples: false }));
  assert.equal(k.count('things'), 0);
  const blocks = value<{ blocks: Drawn[] }>(k.page('portfolio')).blocks;
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  const drawn = blocks.filter((b) => b.drawn !== false);
  assert.deepEqual(
    drawn.map((b) => b.body ?? `${b.kind} ${b.heading ?? ''}`),
    ['No project yet. Add the first one below.', 'capture Add a project'],
  );
  /* ONE PARKED: the line says how to start and the box is still there. */
  value(k.create('things', { name: 'Glaze trials', lane: 'parked' }, { actor: 'p_owner' }));
  const parked = value<{ blocks: (Drawn & { lead?: boolean })[] }>(k.page('portfolio')).blocks.filter((b) => b.drawn !== false && b.kind !== 'cards');
  assert.deepEqual(
    parked.map((b) => b.body ?? b.heading),
    ['No project is in play. Add one, or set a parked one building.', 'Add a project'],
  );
  /* ONE IN PLAY: one line, and no box. */
  value(k.create('things', { name: 'Kiln room', lane: 'building' }, { actor: 'p_owner' }));
  const live = value<{ blocks: (Drawn & { lead?: boolean })[] }>(k.page('portfolio')).blocks.filter((b) => b.drawn !== false);
  assert.equal(live.filter((b) => b.kind === 'note' && b.lead === true).length, 1);
  assert.ok(!live.some((b) => b.kind === 'capture'), 'the Add box stays once a project is in play');
  sql.close();
});

/* NO SHOP WORD, NO SHOP: these are other use cases' sentences, and Shop is neither proposed nor put beside them. */
const NOT_A_SHOP = [
  'I run a few companies and the agents on them',
  'my budget, my running and my uni coursework',
  'I freelance and send invoices to clients',
  'a small business with domains and hosting',
  'a student who freelances for clients on the side',
  'I want to start a podcast and have no idea where to begin',
  'my agency builds websites for customers and I pay VAT',
];

test('A SENTENCE WITH NO SHOP WORD NEVER TAKES SHOP, proposed or beside', () => {
  for (const said of NOT_A_SHOP) {
    const a = arrange(said);
    const ids = [a.pick?.usecase, ...alongside(a, a.pick).map((u) => u.usecase)];
    assert.ok(!ids.includes('shop'), `${said}: ${ids.join(', ')}`);
  }
});

/**
 * A SMALL BUSINESS MADE BEFORE SHOP IS UPDATED TO 1.7.0 AND OFFERED NOTHING ELSE: the nightly update keeps current only
 * the packs a record holds, so Shop's lists never arrive on a business that did not ask for them.
 */
test('A SMALL BUSINESS ON 1.6.0 IS UPDATED AND NEVER OFFERED SHOP', async () => {
  const { k, sql } = await made(['business'], false);
  const asked: unknown[] = [];
  const port: QuietPort = {
    /* THE RECORD AS IT STOOD BEFORE 1.7.0, which differs from it only in the version it remembers. */
    held: () => k.packs().map((p) => ({ id: p.id, version: p.id === 'usecase-business' ? '1.6.0' : p.version, on: true })),
    document: (id) => moduleDocument(useCase('business')!, id, { today: TODAY, holds: new Set(held(k)), examples: false }),
    plan: async (doc) => {
      const pack = await normalise(doc, { kind: 'local' });
      return pack.ok ? { ok: true, value: await plan(pack.value, stateOf(k)) } : (pack as never);
    },
    install: async (doc, planHash) => {
      const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
      return install(pack, await plan(pack, stateOf(k)), hostFor(k), planHash) as never;
    },
    asking: () => false,
    propose: (q) => {
      asked.push(q);
      return { ok: true, value: { id: 'q' } };
    },
  };
  const steps = await updateFirstParty(port);
  assert.deepEqual(steps.filter((s) => s.pack === 'usecase-business').map((s) => [s.from, s.to]), [['1.6.0', useCase('business')!.version]], JSON.stringify(steps));
  assert.ok(!steps.some((s) => s.pack === 'usecase-shop'), JSON.stringify(steps));
  assert.deepEqual(asked, []);
  assert.ok(!k.packs().some((p) => p.id === 'usecase-shop'));
  assert.ok(!held(k).includes('orders') && !held(k).includes('products'), held(k).join(', '));
  sql.close();
});
