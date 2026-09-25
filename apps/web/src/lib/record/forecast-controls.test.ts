/**
 * The forecast's controls, from the browser's walk through the rows `blocks.ts` writes to the model the renderer reads.
 *
 * THE RENDER LAYER WAS FINISHED FIRST AND HAD NOTHING TO READ. Its drift, plan and sell controls act on an `of` row under
 * a step and on `sell` rows (`packages/render/src/forecast.ts`, `stepsOf` and `sellsOf`), and until this file's pair of
 * changes the browser's walk never marked a step as converted or as part of a plan, and the row writer never wrote
 * either row. Every control drew, moved and changed nothing.
 *
 * WRONG MONEY IS THE WORST THING THIS PAGE CAN SHOW, so the first test holds the figure a person reads on a converted
 * step to the record's own, read back from the drawn rows the way the renderer reads them, not from the walk object the
 * rows were written from. A step that says `GBP to EGP` under a figure the record did not compute is the defect this
 * guards against.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { forecastModel, type ForecastModel } from 'braindog-render';
import { openRecord, ratesFrom, type Kernel } from '@braindog/kernel';
import { NOW, PAGES, installSeed } from '@braindog/seed';

import './fixtures/fill.ts';
import { type BlockResult } from './api.ts';
import { page } from './fixtures/readers.ts';
import { ROWS } from './fixtures/sample.ts';
import { toSegments } from './blocks.ts';
import { runway, type Leg } from './forecast.ts';
import { withFx } from './metrics.ts';

type Sql = Parameters<typeof openRecord>[0];

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return sql as unknown as Sql;
}

const TODAY = new Date(NOW).toISOString().slice(0, 10);
const QUOTE = { currency: 'GBP', base: 'EGP', rate: 64.2, as_of: TODAY };

/**
 * The seeded record and the demo both reading in Egyptian pounds with one sterling rate, for the length of `fn`.
 *
 * THE SEED IS STERLING, so a home currency of EGP converts every movement of Cash ahead, which is the case the pair on an
 * `of` row exists for. The demo's rates and clock are put back whatever `fn` does.
 */
async function inPounds(fn: (k: Kernel) => void): Promise<void> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await installSeed(k)).ok);
  k.rememberPack({ id: 'money-core', version: '1.0.0', source: 'local', ref: null, manifest: JSON.stringify({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }), checksum: 'not-a-real-checksum' });
  assert.ok(k.create('fx', QUOTE, { actor: 'p_1' }).ok);
  assert.ok(k.setPackConfig('money-core', { home_currency: 'EGP' }, { actor: 'p_1' }).ok);
  const rates = ROWS.fx ?? [];
  ROWS.fx = [{ ...ROWS.accounts![0]!, seq: 1, fields: QUOTE }];
  const put = withFx(() => ({ home: 'EGP', rates: ratesFrom((ROWS.fx ?? []).map((e) => e.fields)) }));
  try {
    fn(k);
  } finally {
    put();
    ROWS.fx = rates;
  }
}

/** The demo's Cash ahead block as `/p/money` reads it. */
function cashAhead(): BlockResult {
  const block = page('money')?.blocks.find((b) => b.heading === 'Cash ahead');
  assert.ok(block, 'the Cash ahead forecast is gone; this file is about it');
  assert.deepEqual(block.refusals, []);
  return block;
}

/** What the renderer reads off a block: its drawn rows, through the one conversion every surface uses, as a model. */
function modelOf(block: BlockResult): ForecastModel {
  const rows = toSegments(block).flatMap((seg) => ('rows' in seg ? seg.rows : []));
  const model = forecastModel(rows.map((r) => r.cells));
  assert.ok(model, `the drawn forecast has no opening row: ${JSON.stringify(rows.map((r) => r.cells))}`);
  return model;
}

/** Cash ahead's legs as the seed declares them, with the plan an instalment belongs to named on the instalments leg. */
function groupedLegs(): Leg[] {
  const blocks = (PAGES.money?.blocks ?? []) as readonly { heading?: string; from?: Leg[] }[];
  const legs = blocks.find((b) => b.heading === 'Cash ahead')?.from;
  assert.ok(legs?.length, 'the seed has no Cash ahead walk');
  return legs.map((leg) => (leg.register === 'installments' ? { ...leg, group: 'plan' } : leg));
}

test('A CONVERTED STEP IS SHOWN AT THE RECORD’S FIGURE, and says the pair it was converted through', async () => {
  await inPounds((k) => {
    const kernel = k.page('money');
    assert.ok(kernel.ok, JSON.stringify(kernel));
    const walk = kernel.value.blocks.find((b) => b.heading === 'Cash ahead')?.walk;
    assert.ok(walk, 'the record drew Cash ahead as something other than one walk, so this reads a different case');
    assert.equal(walk.currency, 'EGP');
    const converted = walk.steps.filter((s) => s.from === 'GBP');
    assert.ok(converted.length > 0, 'the record converted no step, so nothing below is about a converted one');

    const model = modelOf(cashAhead());
    assert.equal(model.steps.length, walk.steps.length, 'the drawn walk has a different number of steps from the record’s');
    for (const [i, s] of walk.steps.entries()) {
      const shown = model.steps[i]!;
      const at = `step ${i}, ${s.label}`;
      assert.equal(shown.day, s.day, at);
      /* IN MINOR UNITS, read back from the text a person sees: `EGP −120,375.00` is -12,037,500. */
      assert.equal(Math.round(shown.delta * 100), s.delta, `${at}: shown at a figure the record did not compute`);
      assert.equal(shown.pair, s.from ? `${s.from} to EGP` : undefined, `${at}: the pair it was converted through`);
    }
  });
});

test('EVERY PART OF A PLAN IS DRAWN UNDER ITS PLAN, and a step that is part of nothing names nothing', async () => {
  await inPounds(() => {
    const block = cashAhead();
    const walk = runway(block.walk!.from, groupedLegs(), 365);
    assert.deepEqual(walk.refusals, []);
    const planned = walk.steps.filter((s) => s.of === 'Proofing press');
    assert.ok(planned.length > 0, 'the walk names no plan, so nothing below is about one');
    const model = modelOf({ ...block, walk });
    assert.equal(model.steps.length, walk.steps.length, 'an `of` row was read as a step of its own, or cost one');
    assert.deepEqual(
      model.steps.map((s) => s.of ?? null),
      walk.steps.map((s) => s.of ?? null),
      'the plan each drawn step is part of',
    );
  });
});

test('WHAT THE SELL CONTROL MAY SELL IS WRITTEN IN THE WALK’S MONEY, and a label is written as a label', async () => {
  await inPounds(() => {
    const block = cashAhead();
    const sells = [
      { label: 'Gold', value: 9_000_000 },
      { label: 'Bonds | short', value: 125_050 },
    ];
    const model = modelOf({ ...block, sells } as BlockResult);
    assert.deepEqual(
      model.sells.map((s) => ({ label: s.label, value: Math.round(s.value * 100) })),
      sells,
      'the holdings the sell control offers',
    );
    assert.deepEqual(modelOf(block).sells, [], 'a block that holds nothing to sell offers nothing');
  });
});
