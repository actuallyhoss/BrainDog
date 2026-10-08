/**
 * Settings sent with an install fill that install (REC-A06 step 2, first half).
 *
 * `plan(pack, installed, { settings })` takes the values in hand: each declaration reading a setting is written with the
 * value sent, the install keeps it as chosen, and the next plan reads it as `kept`. A value the setting will not take is a
 * warning and changes nothing. Planned again at the same version with a new value, the plan names as `changes` exactly
 * the declarations that read the setting, which is what a later change is approved as.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '../src/index.ts';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const DOC = {
  pack: 'sample-payments',
  version: '1.0.0',
  summary: 'A made-up payments add-on for tests.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  config: {
    book: { type: 'text', default: 'Main book', label: 'Book' },
    days: { type: 'enum', values: ['1', '7'], default: '7' },
  },
  declarations: [
    { register: 'payouts', name: 'Payouts to {{config:book}}', title: 'what', fields: [{ id: 'what', type: 'text' }] },
    { register: 'disputes', name: 'Disputes', title: 'what', fields: [{ id: 'what', type: 'text', label: 'Answer within {{config:days}} days' }] },
  ],
};

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, fields as never, { actor: 'p_seed', cascade: false }) as never,
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

async function pack(): Promise<Pack> {
  const read = await normalise(DOC, { kind: 'local' });
  assert.ok(read.ok);
  return read.value;
}

const nameOf = (k: Kernel, id: string): unknown => (JSON.parse(k.declarations().find((d) => d.id === id)!.body) as { name?: unknown }).name;

test('A SETTING SENT WITH THE INSTALL FILLS IT, and the record keeps it as chosen', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const p = await pack();
  const diff = await plan(p, stateOf(k), { settings: { book: 'Sales' } });
  assert.deepEqual(
    diff.config.map((c) => [c.key, c.value, c.from]),
    [
      ['book', 'Sales', 'given'],
      ['days', '7', 'default'],
    ],
  );
  const put = await install(p, diff, hostFor(k), diff.planHash);
  assert.ok(put.ok, JSON.stringify(put));
  assert.equal(nameOf(k, 'register.payouts'), 'Payouts to Sales');
  const config = k.packConfig('sample-payments');
  assert.ok(config.ok);
  assert.equal(config.value.values.book, 'Sales');

  /* THE NEXT PLAN READS IT AS CHOSEN, and plans nothing new. */
  const again = await plan(p, stateOf(k));
  assert.deepEqual(again.config.find((c) => c.key === 'book'), { key: 'book', type: 'text', value: 'Sales', from: 'kept' });
  assert.deepEqual(again.changes, []);
});

test('A VALUE THE SETTING WILL NOT TAKE IS A WARNING, BY ITS NAME, and the setting keeps its own', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const diff = await plan(await pack(), stateOf(k), { settings: { days: '30', colour: 'red', book: null } });
  assert.deepEqual(
    diff.config.map((c) => [c.key, c.value, c.from]),
    [
      ['book', 'Main book', 'default'],
      ['days', '7', 'default'],
    ],
  );
  const said = diff.warnings.filter((w) => w.at.startsWith('config.'));
  assert.deepEqual(
    said.map((w) => w.at),
    ['config.days', 'config.colour'],
  );
  for (const w of said) assert.doesNotMatch(w.say, /—/u);
});

test('A LATER CHANGE TO A SETTING A DECLARATION READS PLANS THE ADD-ON AGAIN, changing only what reads it', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const p = await pack();
  const first = await plan(p, stateOf(k), { settings: { book: 'Sales' } });
  assert.ok((await install(p, first, hostFor(k), first.planHash)).ok);

  const later = await plan(p, stateOf(k), { settings: { book: 'Refunds' } });
  assert.deepEqual(
    later.changes.map((c) => c.id),
    ['register.payouts'],
  );
  assert.notEqual(later.planHash, first.planHash);
  const put = await install(p, later, hostFor(k), later.planHash);
  assert.ok(put.ok, JSON.stringify(put));
  assert.equal(nameOf(k, 'register.payouts'), 'Payouts to Refunds');
  assert.equal(nameOf(k, 'register.disputes'), 'Disputes');
});

test('NULL SENT PUTS A CHOSEN SETTING BACK TO ITS DEFAULT, as setting it to null on the app does', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const p = await pack();
  const first = await plan(p, stateOf(k), { settings: { book: 'Sales' } });
  assert.ok((await install(p, first, hostFor(k), first.planHash)).ok);

  const back = await plan(p, stateOf(k), { settings: { book: null, toString: 'x' } });
  assert.deepEqual(back.config.find((c) => c.key === 'book'), { key: 'book', type: 'text', value: 'Main book', from: 'default' });
  assert.deepEqual(back.changes.map((c) => c.id), ['register.payouts']);
  assert.deepEqual(back.warnings.filter((w) => w.at.startsWith('config.')).map((w) => w.at), ['config.toString']);
});
