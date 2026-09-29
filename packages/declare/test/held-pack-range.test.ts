/**
 * An update that would make a held pack's `requires` false is refused, naming the held pack and what it needs.
 *
 * ONLY THE INSTALLING PACK'S OWN `requires` WAS ASKED (`needs` in `plan`), so the pack being updated was never checked
 * against what the packs already on the record ask of it. Measured on a record at money-core 1.8.0
 * holding `bank-hsbc-eg` 1.0.0, which asks for money-core `^1.8.0`: money-core 2.0.0 planned with no conflict and no
 * unmet requirement, installed, and left the record holding a pack whose requirement was false of the money-core it
 * then had. Nothing in the plan named `bank-hsbc-eg`, and nothing offered 1.0.1, the version that takes 2.0.0.
 *
 * REFUSED RATHER THAN PLANNED BESIDE IT. `plan` is handed the record and one pack, and no catalogue, so it cannot know a
 * 1.0.1 exists; it can know the held pack's range. The refusal names the held pack, its range and the money-core that
 * satisfies it, and the way out it names (update the held pack first) was driven here and installs.
 *
 * THE RANGES ARE READ FROM THE `pack` ROWS' MANIFESTS, because `Installed.packs` carried only an id and a version. This
 * file builds its `Installed` the way the record does now that `kernel.packs()` answers each pack's `requires.packs`,
 * and its blind case strips them to show what a plan with no ranges to read still says.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, satisfies, type Diff, type Host, type Installed, type Pack } from '../src/index.ts';
import type { Kernel } from '@braindog/kernel';
import type { NodeSql } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../seed/src/index.ts';
import { bankHsbcEgFile13 as bankHsbcEgPack } from '../../seed/test/pack-files.ts';
const BANK_HSBC_EG_VERSION = bankHsbcEgPack().version;
import { asMoneyCore180, asMoneyCore200, record } from '../../seed/test/money-core-earlier.ts';

type Out = { ok: boolean; refusal?: { code: string; fix: string; at?: string } };

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

/** The record as a plan reads it, with each `pack` row's `requires.packs` read off the manifest the row stores. */
const stateOf = (k: Kernel, sql: NodeSql): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: sql.all<{ id: string; version: string; manifest: string }>('SELECT id, version, manifest FROM pack ORDER BY id').map((p) => ({
    id: p.id,
    version: p.version,
    requires: (JSON.parse(p.manifest) as { requires?: { packs?: Record<string, string> } }).requires?.packs ?? {},
  })),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
});

async function attempt(k: Kernel, sql: NodeSql, doc: unknown): Promise<{ diff: Diff; out: Out }> {
  const read = await normalise(doc, { kind: 'local' });
  assert.ok(read.ok, JSON.stringify(read));
  const pack: Pack = read.value;
  const diff = await plan(pack, stateOf(k, sql));
  return { diff, out: (await install(pack, diff, hostFor(k), diff.planHash, diff.approve)) as Out };
}

async function put(k: Kernel, sql: NodeSql, doc: unknown): Promise<Diff> {
  const { diff, out } = await attempt(k, sql, doc);
  assert.ok(out.ok, out.ok ? '' : `${out.refusal?.code} at ${out.refusal?.at}: ${out.refusal?.fix}`);
  return diff;
}

/** bank-hsbc-eg as 1.0.0 shipped it: the same twelve doors, on `^1.8.0`, which no money-core 2.x satisfies. */
const bank100 = () => ({ ...bankHsbcEgPack(), version: '1.0.0', requires: { format: 1, primitives: 1, packs: { 'money-core': '^1.8.0' } } });

/** Every first-party pack with money-core at 1.8.0, and bank-hsbc-eg 1.0.0 installed beside it. */
async function holding() {
  const { k, sql } = await record();
  for (const id of FIRST_PARTY) await put(k, sql, id === 'money-core' ? asMoneyCore180(firstPartyDocument(id)) : firstPartyDocument(id));
  await put(k, sql, bank100());
  return { k, sql };
}

const version = (k: Kernel, id: string) => k.packs().find((p) => p.id === id)?.version ?? null;

test('money-core 2.0.0 UNDER bank-hsbc-eg 1.0.0 IS REFUSED, naming the held pack, its range and the money-core that satisfies it', async () => {
  const { k, sql } = await holding();
  const { diff, out } = await attempt(k, sql, asMoneyCore200(firstPartyDocument('money-core')));
  assert.deepEqual(diff.dependents, [{ id: 'bank-hsbc-eg', version: '1.0.0', range: '^1.8.0', ok: false, was: true }]);
  assert.equal(out.refusal?.code, 'PACK_REQUIRED');
  assert.equal(
    out.refusal?.fix,
    'bank-hsbc-eg 1.0.0 needs money-core ^1.8.0, which money-core 2.0.0 is not, and the money-core 1.8.0 this record holds is. Update bank-hsbc-eg to a version that takes money-core 2.0.0 first, then install money-core 2.0.0.',
  );
  assert.equal(out.refusal?.at, 'dependents.bank-hsbc-eg');
  assert.equal(version(k, 'money-core'), '1.8.0', 'the refused update still moved money-core');
  assert.equal(satisfies(version(k, 'money-core'), '^1.8.0'), true);
  sql.close();
});

/* THE SEED'S CURRENT VERSION AND NOT A LITERAL. This read `1.0.1` and went red the day the pack moved to 1.1.0 for a
   reason that has nothing to do with money-core: the step being proved is "the bank pack's update first", whichever
   version that update is. */
test('THE WAY OUT THE REFUSAL NAMES INSTALLS: the bank-hsbc-eg update first, then money-core 2.0.0, with every range true after', async () => {
  const { k, sql } = await holding();
  await put(k, sql, bankHsbcEgPack());
  assert.equal(version(k, 'bank-hsbc-eg'), BANK_HSBC_EG_VERSION);
  const diff = await put(k, sql, asMoneyCore200(firstPartyDocument('money-core')));
  assert.deepEqual(diff.dependents, [{ id: 'bank-hsbc-eg', version: BANK_HSBC_EG_VERSION, range: '>=1.8.0 <4.0.0', ok: true, was: true }]);
  assert.equal(version(k, 'money-core'), '2.0.0');
  for (const p of stateOf(k, sql).packs) for (const [on, range] of Object.entries(p.requires ?? {})) assert.ok(satisfies(version(k, on), range), `${p.id} needs ${on} ${range}`);
  sql.close();
});

/**
 * A HELD PACK THAT WAS ALREADY STRANDED DOES NOT BLOCK THE NEXT STEP. A record that took money-core 2.0.0 before this
 * check existed holds bank-hsbc-eg 1.0.0 beside it, and refusing every later money-core for a requirement no version of
 * it can meet would leave the owner nothing to update but the bank pack. The plan still names it, with `was` false.
 */
test('A REQUIREMENT FALSE BEFORE THE UPDATE IS NAMED IN THE PLAN AND DOES NOT REFUSE IT', async () => {
  const { k, sql } = await holding();
  const two = asMoneyCore200(firstPartyDocument('money-core'));
  const at = await attempt(k, sql, two);
  assert.equal(at.out.ok, false);
  /* STRANDED THE WAY A RECORD WAS BEFORE THIS CHECK: the update installed with the ranges hidden from the plan. */
  const read = await normalise(two, { kind: 'local' });
  assert.ok(read.ok);
  const blind = { ...stateOf(k, sql), packs: k.packs().map(({ id, version }) => ({ id, version })) };
  const through = await plan(read.value, blind);
  assert.deepEqual(through.dependents, [], 'a plan with no ranges to read names no dependent');
  assert.equal(((await install(read.value, through, hostFor(k), through.planHash, through.approve)) as Out).ok, true);
  assert.equal(version(k, 'money-core'), '2.0.0');

  const next = { ...two, version: '2.0.1' };
  const { diff, out } = await attempt(k, sql, next);
  assert.deepEqual(diff.dependents, [{ id: 'bank-hsbc-eg', version: '1.0.0', range: '^1.8.0', ok: false, was: false }]);
  assert.equal(out.ok, true, `${out.refusal?.code}: ${out.refusal?.fix}`);
  sql.close();
});
