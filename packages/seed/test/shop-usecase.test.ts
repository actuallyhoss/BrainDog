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
async function made(ids: readonly string[], examples: boolean): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
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
  return { k, sql };
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
  const shown = blocks.filter((b) => b.drawn !== false && b.heading !== undefined);
  assert.deepEqual(shown.map((b) => b.heading), [], 'a tile was drawn over nothing');
  assert.deepEqual(blocks.flatMap((b) => b.rows ?? []), []);
  /* THE PAGE'S ONE LINE SAYS NOTHING: every clause's figure is nought, and a clause at nought is left out. */
  const line = blocks.find((b) => b.kind === 'note') as (Drawn & { values?: Record<string, number> }) | undefined;
  assert.deepEqual(line?.values, { 'orders-due-7d': 0, 'orders-owed': 0 });

  /* ONE ORDER NOBODY HAS PAID FOR, due in two days: it is due this week and owed. */
  value(k.create('orders', { what: '3 vanilla jars', how_many: 3, due: dayOf(Date.parse(`${TODAY}T00:00:00Z`) + 2 * 86_400_000) }, { actor: 'p_owner' }));
  const after = value<{ blocks: Drawn[] }>(k.page('orders')).blocks;
  for (const b of after) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  const drawn = after.filter((b) => b.drawn !== false && b.heading !== undefined);
  assert.deepEqual(drawn.map((b) => b.heading), ['Due this week', 'Owed to you']);
  for (const b of drawn) assert.deepEqual(b.rows?.map((r) => r.fields.what), ['3 vanilla jars'], b.heading);
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
  assert.deepEqual(steps.filter((s) => s.pack === 'usecase-business').map((s) => [s.from, s.to]), [['1.6.0', '1.7.0']], JSON.stringify(steps));
  assert.ok(!steps.some((s) => s.pack === 'usecase-shop'), JSON.stringify(steps));
  assert.deepEqual(asked, []);
  assert.ok(!k.packs().some((p) => p.id === 'usecase-shop'));
  assert.ok(!held(k).includes('orders') && !held(k).includes('products'), held(k).join(', '));
  sql.close();
});
