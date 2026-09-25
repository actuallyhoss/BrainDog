/**
 * The the old tool import offers the `holdings` pack on Decide when his export holds anything he owns.
 *
 * WHY THIS FILE EXISTS. Since money-core 2.0.0 the list his fourteen assets go into is not Money's but a pack of its own
 * (`packages/seed/src/packs/holdings.ts`), which no starter use case installs. So a record set up after the move has no
 * list for them until somebody installs the pack, and the import is the one moment that knows he needs it. It knows it
 * from his data, as it knows about his bank (`import-bank-pack.test.ts`): an export with assets in it.
 *
 * AND IT IS HELD BACK ON A MONEY TOO OLD TO LET GO OF THE LIST. Up to 1.8.0 money-core declares `holdings` itself, and
 * the pack beside it is refused `PROVIDES_CONFLICT`; filed anyway, it would sit on Decide as a proposal that refuses the
 * moment he presses it. So the version is read first and the report names the update, as it does for the bank pack.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { holdingsPack } from '@braindog/seed';

import { type Plan } from '../src/legacy.ts';
import { applyPlan, holdingsOf, said, type Door } from '../src/import.ts';

const QUESTION = 'Keep what you hold in a Holdings list?';

const EMPTY: Plan = { taken: null, rev: null, rows: [], asks: [], polls: [], skipped: [], changed: [] };

const ASSET = { kind: 'gold', label: 'Gold 24c', qty: 5, unit_cost_minor: 500_000, currency: 'EGP', acquired_on: '2025-02-10', matures_on: null, meta_json: null };
const exportWith = (assets: unknown[]): Record<string, unknown> => ({ db: { entities: [] }, money: { asOf: '2026-09-22', assets } });

/** A record whose Decide is held in memory, holding the packs given at their versions. */
function record(packs: { id: string; version: string }[]) {
  const filed: { question: string; body: Record<string, unknown> }[] = [];
  const door: Door = {
    schema: async (register) => ({ ok: true, value: { register } }),
    list: async () => ({ ok: true, value: { rows: [], cursor: null } }),
    create: async () => {
      throw new Error('nothing was planned, so nothing should be written');
    },
    update: async () => {
      throw new Error('nothing was planned, so nothing should be changed');
    },
    governance: async () => ({ ok: true, value: filed.map((s, i) => ({ id: `SG${String(i + 1)}`, status: 'open', body: s.body })) }),
    propose: async ({ question, body }) => {
      filed.push({ question, body });
      return { ok: true, value: { id: `SG${String(filed.length)}` } };
    },
    packs: async () => ({ ok: true, value: packs }),
  };
  return { door, filed };
}

test('an export holding assets is offered the holdings pack, with its document whole; one holding none is offered nothing', () => {
  const offered = holdingsOf(exportWith([ASSET]));
  assert.deepEqual(offered.map((p) => [p.install, p.question]), [['holdings', QUESTION]]);
  assert.deepEqual(offered[0]!.doc, holdingsPack());
  assert.deepEqual(holdingsOf(exportWith([])), []);
  assert.deepEqual(holdingsOf({ db: { entities: [] } }), []);
});

test('on money-core 2.0.0 the pack is filed once, under Packs and not under Banks, and a second run files nothing', async () => {
  const { door, filed } = record([{ id: 'money-core', version: '2.0.0' }]);
  const packs = holdingsOf(exportWith([ASSET]));
  const first = await applyPlan(EMPTY, door, { dryRun: false, packs });
  assert.deepEqual(first.packs, { filed: 1, before: 0, waiting: [] });
  assert.equal(first.banks, undefined);
  assert.deepEqual(filed, [{ question: QUESTION, body: { install: 'holdings', doc: holdingsPack() } }]);
  const lines = said(first, { dryRun: false, file: 'export.json' });
  assert.ok(lines.includes('Packs: 1 filed on Decide for you to approve, 0 filed before.'), lines.join('\n'));
  assert.ok(!lines.some((l) => l.startsWith('Banks:')));

  const again = await applyPlan(EMPTY, door, { dryRun: false, packs });
  assert.deepEqual(again.packs, { filed: 0, before: 1, waiting: [] });
  assert.equal(filed.length, 1, 'the pack was offered a second time');
});

test('on money-core 1.8.0 nothing is filed, and the report names the Money update that has to come first', async () => {
  const { door, filed } = record([{ id: 'money-core', version: '1.8.0' }]);
  const report = await applyPlan(EMPTY, door, { dryRun: false, packs: holdingsOf(exportWith([ASSET])) });
  assert.equal(filed.length, 0, 'a proposal the record will refuse was filed anyway');
  assert.deepEqual(report.packs?.waiting, [
    'A list for what you hold (the holdings pack) was not filed on Decide: it needs Money 2.0.0 or later, and this BrainDog has Money 1.8.0. Take the Money update, then run the import again.',
  ]);
});

test('a record that already holds the pack is not offered it again', async () => {
  const { door, filed } = record([
    { id: 'money-core', version: '2.0.0' },
    { id: 'holdings', version: '1.0.0' },
  ]);
  const report = await applyPlan(EMPTY, door, { dryRun: false, packs: holdingsOf(exportWith([ASSET])) });
  assert.equal(filed.length, 0);
  assert.deepEqual(report.packs, { filed: 0, before: 1, waiting: [] });
});
