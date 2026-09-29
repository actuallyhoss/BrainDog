/**
 * A founder's Home says what is due this week and what is lapsing.
 *
 * A FOUNDER'S HOME HAD NEITHER LIST. A live record draws `home-<use case>` when it
 * declares one and Money's `home` only when it does not, so the "Due this week" table Money declares was drawn on no
 * founder record at all, and no Home anywhere had a lapsing list, although Estate has been one of a founder's modules
 * since 1.4.0 and `services` carries a `lapsing` state. A probe printed the three headings the page had:
 * `{{config:voice_right_now}}`, `Latest numbers`, `Organisations`. This file is that probe kept as a test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { DUE_THIS_WEEK } from '../src/modules/money.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);

/** A day as the record writes one, `n` days from the fixed today. */
const day = (n: number): string => dayOf(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000);

type Block = { kind: string; heading?: string; source?: string; where?: string; columns?: unknown; order?: unknown; limit?: number; empty?: string };

/** The blocks `home-founder` declares, read off the use case the way the probe read them. */
const declared = (): Block[] => {
  const decls = (useCase('founder')!.pack?.declarations ?? []) as { page?: string; blocks?: Block[] }[];
  const home = decls.find((d) => d.page === 'home-founder');
  assert.ok(home, 'the founder use case declares its own Home');
  return home.blocks ?? [];
};

test("A FOUNDER'S HOME DECLARES WHAT IS DUE THIS WEEK AND WHAT IS LAPSING, beside the numbers it already drew", () => {
  const headings = declared().map((b) => b.heading);
  assert.ok(headings.includes('Due this week'), `home-founder's headings are ${headings.join(' ; ')}`);
  assert.ok(headings.includes('Lapsing'), `home-founder's headings are ${headings.join(' ; ')}`);
});

/**
 * THE SAME TABLE AS MONEY'S, NOT ONE LIKE IT. Money exports its "Due this week" by name (`DUE_THIS_WEEK`) since
 * money-core 3.0.0 retired its own Home, and two tables under one heading that disagree about the window or the columns
 * would be a question about which one is right. Held equal here so the pair moves together.
 */
test("ITS DUE THIS WEEK IS MONEY'S OWN: the same list, window, columns, order and limit", () => {
  const ours = declared().find((b) => b.heading === 'Due this week');
  const money = DUE_THIS_WEEK as Block;
  assert.ok(ours && money);
  const { kind, source, where, columns, order, limit, empty } = money;
  assert.deepEqual({ kind: ours.kind, source: ours.source, where: ours.where, columns: ours.columns, order: ours.order, limit: ours.limit, empty: ours.empty }, { kind, source, where, columns, order, limit, empty });
});

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

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

/** A founder record made the way onboarding makes one, as `founder-estate.test.ts` makes it. */
async function founder(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people'])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: true }));
  }
  await put(k, carriedDocument(u, TODAY, null, { examples: true }));
  return k;
}

type Drawn = { kind: string; heading?: string; rows?: { fields: Record<string, unknown> }[]; refusals?: { code: string }[] };
const OWNER = { actor: 'p_1' };

/**
 * AND BOTH `where:`s COMPILE AGAINST A FOUNDER RECORD AND PICK THE RIGHT ROWS. A block whose predicate names a field the
 * record does not hold is drawn with a refusal and no rows, which a heading check alone would pass. The example bill is
 * due in nine days, one past the week, so it is the row that proves the window has an end.
 *
 * THREE LAPSING DOMAINS, WRITTEN SO THAT NO OTHER ORDER GIVES THE SOONEST-FIRST ONE: not by name either way and not by
 * when they were written either way. With one lapsing row, flipping `order` to `desc` passed this test, and with two,
 * deleting `order` passed it, because the default happened to agree; both were measured, which left "soonest first"
 * unheld until this.
 */
test("ON A FOUNDER'S RECORD, THE WEEK HOLDS WHAT IS DUE INSIDE IT AND LAPSING HOLDS ONLY WHAT IS LAPSING", async () => {
  const k = await founder();
  value(k.create('obligations', { what: 'Domain transfer fee', direction: 'owed_by_me', amount: { amount: 1_200, currency: 'GBP' }, due: day(3), state: 'open' }, OWNER));
  value(k.create('obligations', { what: 'Paid last week', direction: 'owed_by_me', amount: { amount: 900, currency: 'GBP' }, due: day(2), state: 'paid' }, OWNER));
  value(k.create('services', { name: 'northwind.dev', provider: 'Cove Domains', kind: 'domain', renews: day(20), cost: { amount: 1_400, currency: 'GBP' }, cycle: 'yearly', state: 'lapsing' }, OWNER));
  value(k.create('services', { name: 'northwind.example', provider: 'Cove Domains', kind: 'domain', renews: day(5), cost: { amount: 1_400, currency: 'GBP' }, cycle: 'yearly', state: 'lapsing' }, OWNER));
  value(k.create('services', { name: 'northwind.io', provider: 'Cove Domains', kind: 'domain', renews: day(12), cost: { amount: 1_400, currency: 'GBP' }, cycle: 'yearly', state: 'lapsing' }, OWNER));
  value(k.create('services', { name: 'northwind.app', provider: 'Cove Domains', kind: 'domain', renews: day(40), cost: { amount: 1_400, currency: 'GBP' }, cycle: 'yearly', state: 'live' }, OWNER));

  const blocks = value<{ blocks: Drawn[] }>(k.page('home-founder')).blocks;
  const refused = blocks.filter((b) => (b.refusals ?? []).length > 0).map((b) => `${b.heading}: ${b.refusals!.map((r) => r.code).join(', ')}`);
  assert.deepEqual(refused, [], 'home-founder refused a block');

  const week = blocks.find((b) => b.heading === 'Due this week');
  assert.ok(week, `no Due this week among ${blocks.map((b) => b.heading).join(', ')}`);
  assert.deepEqual(week.rows?.map((r) => r.fields.what), ['Domain transfer fee'], 'the open bill in three days, and not the paid one or the example due in nine');

  const lapsing = blocks.find((b) => b.heading === 'Lapsing');
  assert.ok(lapsing, `no Lapsing among ${blocks.map((b) => b.heading).join(', ')}`);
  assert.deepEqual(lapsing.rows?.map((r) => r.fields.name), ['northwind.example', 'northwind.io', 'northwind.dev'], 'the three lapsing domains, soonest renewal first, and not the live one');
});
