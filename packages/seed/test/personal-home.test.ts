/**
 * A new Personal Home offers something to press (USE-A08, Personal 2.5.0).
 *
 * BEFORE: a fresh Personal record opened on a line of zeros, "Nothing falls due in the next two weeks" and nothing to
 * press, where Student leads with "Add homework" and the founder with "Bring your money in". Now Home declares three
 * first acts, each with a `when:` the kernel reads: the way money comes in while no account counts as cash, a line
 * naming a savings goal while none is kept, and a line naming a project while none is live. This file holds that a
 * fresh record draws all three and that each goes once the thing it starts exists, read as the kernel reads them
 * (`k.page`, which marks a block whose `when:` does not hold `drawn: false`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, homePageOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
const OWNER = { actor: 'p_1' };
const MONEY_IN = 'Bring your money in';
const SAVING = 'Name something you are saving for';
const MAKING = 'Name something you are making';

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

/** A Personal record made the way a first run makes one: its modules and its pack, and no example row in any list. */
async function personal(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const u = useCase('personal')!;
  for (const m of modulesFor(u, ['people'])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds }));
  }
  const carried = carriedDocument(u, TODAY, null);
  if (carried) await put(k, carried);
  return k;
}

type Block = { kind: string; heading?: string; register?: string; where?: string; when?: unknown; authored?: { cells: string[] }[] };
type Drawn = { kind: string; heading?: string; drawn?: boolean; why?: string; refusals?: { code: string }[]; fills?: Record<string, string> };

/** The blocks `home-personal` declares, read off the use case. */
const declared = (): Block[] => {
  const decls = (useCase('personal')!.pack?.declarations ?? []) as { page?: string; blocks?: Block[] }[];
  const home = decls.find((d) => d.page === 'home-personal');
  assert.ok(home, 'Personal declares its own Home');
  return home.blocks ?? [];
};

const drawnOn = (k: Kernel): Drawn[] => value<{ blocks: Drawn[] }>(k.page(homePageOf('personal'))).blocks;
const headed = <B extends { heading?: string }>(blocks: readonly B[], heading: string): B => {
  const b = blocks.find((x) => x.heading === heading);
  assert.ok(b, `no ${heading} among ${blocks.map((x) => x.heading).join(', ')}`);
  return b;
};

test('PERSONAL HOME DECLARES THREE FIRST ACTS, each with the condition it waits on', () => {
  const blocks = declared();
  const money = headed(blocks, MONEY_IN) as Block;
  assert.equal(money.kind, 'link');
  assert.deepEqual(money.when, { metric: 'cash-accounts', lt: 1 });
  assert.deepEqual(money.authored?.map((r) => r.cells[0]), ['Add an account', 'Forward a bank message', 'Find an add-on for your bank']);
  for (const r of money.authored ?? []) assert.match(r.cells[1] ?? '', /^\/[a-z]/u, `${r.cells[0]} leads to a page of this record`);

  const saving = headed(blocks, SAVING) as Block;
  assert.deepEqual([saving.kind, saving.register, saving.when], ['capture', 'savings_goals', { metric: 'savings-held', lt: 1 }]);
  const making = headed(blocks, MAKING) as Block;
  assert.deepEqual([making.kind, making.register, making.where, making.when], ['capture', 'things', 'lane is building', { metric: 'projects-live', lt: 1 }]);
  /* UNDER THE LINE AND WHAT NEEDS YOU, AHEAD OF WHAT IS COMING UP: on a new record they are the first things drawn. */
  const at = (h: string) => blocks.findIndex((b) => b.heading === h);
  assert.ok(at(MONEY_IN) < at(SAVING) && at(SAVING) < at(MAKING) && at(MAKING) < at('Coming up'));
  for (const b of blocks.filter((x) => [MONEY_IN, SAVING, MAKING].includes(x.heading ?? '')))
    for (const text of [b.heading ?? '', ...(b.authored ?? []).flatMap((r) => [r.cells[0] ?? '', r.cells[2] ?? ''])]) assert.doesNotMatch(text, /[–—]/u, `no dash in ${text}`);
});

test('A FRESH PERSONAL HOME DRAWS ALL THREE, and the line for a project files it as one on the go', async () => {
  const k = await personal();
  const home = drawnOn(k);
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
  for (const h of [MONEY_IN, SAVING, MAKING]) assert.notEqual(headed(home, h).drawn, false, `${h} is not drawn on a fresh record`);
  /* WHAT THE PRESS WRITES: a project in the Building lane, which is what My projects and `projects-live` count. */
  assert.deepEqual((headed(home, MAKING) as Drawn).fills, { lane: 'building' });
  assert.deepEqual((headed(home, SAVING) as Drawn).fills, {});
  /* NOTHING IS WRITTEN UNTIL THE PERSON PRESSES. */
  for (const r of ['accounts', 'savings_goals', 'things']) assert.equal(k.count(r), 0, `${r} holds a row nobody wrote`);
});

test('EACH FIRST ACT GOES ONCE ITS THING EXISTS: an account counted as cash, a savings goal, a live project', async () => {
  const k = await personal();
  value(k.create('accounts', { name: 'Current account', kind: 'bank', balance: { amount: 120_000, currency: 'GBP' }, as_of: TODAY, liquid: true }, OWNER));
  let home = drawnOn(k);
  assert.equal(headed(home, MONEY_IN).drawn, false, 'the way money comes in stays once an account counts as cash');
  assert.equal((headed(home, MONEY_IN) as Drawn).why, 'when');
  assert.notEqual(headed(home, SAVING).drawn, false);
  assert.notEqual(headed(home, MAKING).drawn, false);

  value(k.create('savings_goals', { name: 'A week by the sea', target: { amount: 80_000, currency: 'GBP' } }, OWNER));
  /* A PROJECT PARKED IS NOT ONE ON THE GO, so the line still asks for one. */
  value(k.create('things', { name: 'Garden bench', lane: 'parked' }, OWNER));
  home = drawnOn(k);
  assert.equal(headed(home, SAVING).drawn, false, 'a kept goal ends the line that names one');
  assert.notEqual(headed(home, MAKING).drawn, false, 'a parked project is not live');

  value(k.create('things', { name: 'Kitchen shelves', lane: 'building' }, OWNER));
  home = drawnOn(k);
  assert.equal(headed(home, MAKING).drawn, false, 'a live project ends the line that names one');
  for (const b of home) assert.deepEqual(b.refusals ?? [], [], `${b.heading} was refused`);
});
