/**
 * A list handed to a pack the record already has.
 *
 * FOUNDER 2.0.0 HANDS `register.organisations` TO PEOPLE, AND EVERY FOUNDER RECORD HOLDS PEOPLE. `plan` handed a list
 * only to a pack the record did not hold yet, so on a Founder 1.x record the list was retired instead, and the use case's
 * own pages lost it (`REGISTER_UNRESOLVED`); People 3.0.0 planned first was `PROVIDES_CONFLICT`, the list being
 * Founder's (`seed/test/founder-estate.test.ts`). The guard was right about what it guarded: handed to an installed pack
 * whose file did not declare it, the list sat under that pack and every later update of it was `WOULD_ORPHAN`
 * (`handover.test.ts`).
 *
 * SO THE RECEIVER'S PLAN READS WHAT WAS HANDED TO IT (`Installed.handed`, from the installed manifests' `hands`), and
 * leaves such a list where it is. With that known the giver may hand to an installed pack. Without it, as from a caller
 * that cannot say, the plan is the retire it always was.
 *
 * DRIVEN ON THE KERNEL, with `Installed` built here as the record builds it plus `handed` read off the `pack` rows, so
 * the test holds `declare` whatever the record passes today.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handedOf, install, normalise, plan, plannedState, type Diff, type Host, type Installed, type Pack } from '../src/index.ts';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../seed/src/index.ts';
import { asMoneyCore180 } from '../../seed/test/money-core-earlier.ts';

type Body = Record<string, unknown>;
type Doc = { pack: string; version: string; declarations: Body[]; hands?: Record<string, string>; [k: string]: unknown };
type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
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

/** The record as `plan` reads it, with `handed` when `says` (the record can tell) and without it when not. */
const stateOf = (k: Kernel, sql: NodeSql, says: boolean): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  ...(says ? { handed: handedOf(sql.all<{ manifest: string }>('SELECT manifest FROM pack').map((r) => r.manifest)) } : {}),
});

async function attempt(k: Kernel, sql: NodeSql, doc: unknown, says = true): Promise<{ diff: Diff; out: Out }> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k, sql, says));
  return { diff, out: (await install(pack, diff, hostFor(k), diff.planHash, diff.approve)) as Out };
}

/** money-core as it ships, handing `register.holdings` to `to`. */
const moneyCore = (to: string): Doc => {
  const d = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  assert.ok(!d.declarations.some((x) => x.register === 'holdings'), 'money-core declares holdings again, so nothing here is a handover');
  d.hands = { ...(d.hands ?? {}), 'register.holdings': to };
  return d;
};

/** Every first-party pack, money-core as 1.8.0 (the last that declares holdings), and one holding written. */
async function record(): Promise<{ k: Kernel; sql: NodeSql; row: string }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(Date.UTC(2026, 9, 6, 12)));
  for (const id of FIRST_PARTY) value((await attempt(k, sql, id === 'money-core' ? asMoneyCore180(firstPartyDocument(id)) : firstPartyDocument(id))).out);
  const row = value<{ id: string }>(k.create('holdings', { label: 'Gold 24c', kind: 'gold', qty: 10, unit_cost: { amount: 4120000, currency: 'EGP' } }, { actor: 'p_1' })).id;
  return { k, sql, row };
}

const live = (k: Kernel, id: string) => k.declarations().find((d) => d.id === id);

test('A LIST HANDED TO AN INSTALLED PACK GOES TO IT WITH ITS ROWS, when the record can say what was handed', async () => {
  const { k, sql, row } = await record();
  const was = JSON.stringify(k.get(row));
  const step = await attempt(k, sql, moneyCore('work'));
  value(step.out);
  assert.deepEqual(step.diff.retires.map(({ id, rows, to }) => ({ id, rows, to })), [{ id: 'register.holdings', rows: 1, to: 'work' }]);
  assert.equal(step.diff.orphans, 0);
  assert.equal(live(k, 'register.holdings')?.pack_id, 'work');
  assert.equal(JSON.stringify(k.get(row)), was, 'the row moved');
  sql.close();
});

test('AND THAT PACK STILL UPDATES: its plan leaves the list it was handed where it is', async () => {
  const { k, sql } = await record();
  value((await attempt(k, sql, moneyCore('work'))).out);
  const again = await attempt(k, sql, firstPartyDocument('work'));
  value(again.out);
  assert.deepEqual(again.diff.retires, [], 'work retired what it was handed');
  assert.deepEqual(again.diff.conflicts, []);
  assert.equal(live(k, 'register.holdings')?.pack_id, 'work');
  assert.equal(k.count('holdings'), 1);
  sql.close();
});

test('AND A VERSION OF IT THAT DECLARES THE LIST TAKES IT AS ITS OWN, rows and all', async () => {
  const { k, sql } = await record();
  const handed = JSON.parse(live(k, 'register.holdings')!.body) as Body;
  value((await attempt(k, sql, moneyCore('work'))).out);
  const work = structuredClone(firstPartyDocument('work')) as unknown as Doc;
  work.version = '99.0.0';
  const { register: _register, ...rest } = handed;
  work.declarations = [...work.declarations, { register: 'holdings', ...rest, pack: 'work' }];
  const take = await attempt(k, sql, work);
  value(take.out);
  assert.deepEqual(take.diff.conflicts, []);
  assert.deepEqual(take.diff.retires, []);
  assert.equal(live(k, 'register.holdings')?.pack_id, 'work');
  assert.equal(k.count('holdings'), 1);
  sql.close();
});

test('A CALLER THAT CANNOT SAY WHAT WAS HANDED gets the retire it always got, and the receiver is not locked', async () => {
  const { k, sql } = await record();
  const step = await attempt(k, sql, moneyCore('work'), false);
  assert.deepEqual(step.diff.retires.map(({ id, to }) => ({ id, to })), [{ id: 'register.holdings', to: undefined }]);
  assert.equal(step.out.refusal?.code, 'WOULD_ORPHAN');
  assert.equal(live(k, 'register.holdings')?.pack_id, 'money-core');
  sql.close();
});

test('THE NEXT PACK OF AN ARRANGEMENT IS PLANNED AGAINST WHAT THIS ONE HANDS', async () => {
  const { k, sql } = await record();
  const giver = value<Pack>(await normalise(moneyCore('work'), { kind: 'local' }));
  const state = stateOf(k, sql, true);
  const after = plannedState(state, giver, await plan(giver, state));
  assert.equal(after.handed?.['register.holdings'], 'work');
  const receiver = await plan(value<Pack>(await normalise(firstPartyDocument('work'), { kind: 'local' })), after);
  assert.deepEqual(receiver.retires, []);
  sql.close();
});

test('handedOf READS EACH MANIFEST\'S hands, and passes over one that does not parse or hands nothing', () => {
  assert.deepEqual(
    handedOf([
      JSON.stringify({ pack: 'usecase-founder', hands: { 'register.organisations': 'people' } }),
      '{not json',
      JSON.stringify({ pack: 'work' }),
      JSON.stringify({ pack: 'odd', hands: ['register.x'] }),
      JSON.stringify({ pack: 'later', hands: { 'register.organisations': 'other', 'register.y': 7 } }),
    ]),
    { 'register.organisations': 'people' },
  );
});

/* THE OTHER ORDER: THE RECEIVER FIRST, TOLD WHAT THE GIVER'S COMING VERSION HANDS IT. A use case plans its modules before
   its own pack, so People 3.0.0 met `register.organisations` still under Founder 1.x and was `PROVIDES_CONFLICT`, while
   Founder 2.0.0 could not go first (`seed/test/founder-estate.test.ts`). Told the hand, the receiver takes the list over. */
const workWithHoldings = (k: Kernel, drop?: string): Doc => {
  const { register: _register, ...rest } = JSON.parse(live(k, 'register.holdings')!.body) as Body;
  const fields = (rest.fields as Body[]).filter((f) => f.id !== drop);
  const work = structuredClone(firstPartyDocument('work')) as unknown as Doc;
  work.version = '99.0.0';
  work.declarations = [...work.declarations, { register: 'holdings', ...rest, fields, name: 'Holdings at work', pack: 'work' }];
  return work;
};

const planOver = async (k: Kernel, sql: NodeSql, doc: Doc, hands: Record<string, string> | null) => {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const state = stateOf(k, sql, true);
  const diff = await plan(pack, hands === null ? state : { ...state, handed: { ...state.handed, ...hands } });
  return { diff, out: (await install(pack, diff, hostFor(k), diff.planHash, diff.approve)) as Out };
};

test('A PACK TOLD THE HOLDER HANDS IT A LIST TAKES IT OVER as a change, and the holder then hands nothing twice', async () => {
  const { k, sql, row } = await record();
  const was = JSON.stringify(k.get(row));
  const take = await planOver(k, sql, workWithHoldings(k), { 'register.holdings': 'work' });
  value(take.out);
  assert.deepEqual(take.diff.conflicts, []);
  assert.deepEqual(
    take.diff.changes.filter((c) => c.id === 'register.holdings').map(({ id, from }) => ({ id, from })),
    [{ id: 'register.holdings', from: 'money-core' }],
  );
  assert.equal(live(k, 'register.holdings')?.pack_id, 'work');
  assert.equal(JSON.stringify(k.get(row)), was, 'the row moved');
  /* AND THE HOLDER'S NEXT VERSION, WHICH HANDS IT, MEETS A LIST THAT IS NOT ITS OWN ANY MORE, and leaves it. */
  const giver = await attempt(k, sql, moneyCore('work'));
  value(giver.out);
  assert.deepEqual(giver.diff.retires.filter((r) => r.id === 'register.holdings'), []);
  assert.equal(live(k, 'register.holdings')?.pack_id, 'work');
  assert.equal(k.count('holdings'), 1);
  sql.close();
});

test('WHAT THE LIST HOLDS AND THE TAKER LACKS STAYS, so a row written under it still reads', async () => {
  const { k, sql, row } = await record();
  const take = await planOver(k, sql, workWithHoldings(k, 'unit_cost'), { 'register.holdings': 'work' });
  value(take.out);
  assert.deepEqual(take.diff.kept.find((x) => x.id === 'register.holdings')?.adds, ['unit_cost']);
  assert.deepEqual((k.get(row) as { fields: Body }).fields.unit_cost, { amount: 4120000, currency: 'EGP' });
  sql.close();
});

test('UNTOLD, OR TOLD IT GOES ELSEWHERE, ANOTHER PACK\'S LIST IS STILL A CONFLICT', async () => {
  for (const hands of [null, { 'register.holdings': 'notes-pack' }]) {
    const { k, sql } = await record();
    const take = await planOver(k, sql, workWithHoldings(k), hands);
    assert.deepEqual(take.diff.conflicts.map(({ id, pack }) => ({ id, pack })), [{ id: 'register.holdings', pack: 'money-core' }]);
    assert.equal(take.out.refusal?.code, 'PROVIDES_CONFLICT');
    assert.equal(live(k, 'register.holdings')?.pack_id, 'money-core');
    sql.close();
  }
});
