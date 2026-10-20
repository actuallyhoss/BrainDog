/**
 * A `calendar` over a list may name a third column, the row's amount, which the host says at the right of its line.
 *
 * ASKED AS `calendar-weeks.test.ts` ASKS THE KIND: its `validate`, then its `read` over a real record. Three columns are
 * allowed and four are not, and the amount rides on the rows the calendar reads (the host draws the cell from them).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';
import type { Schema } from '@braindog/where';

import { calendar } from '../src/kinds/calendar.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { predicateOf } from '../src/metrics.ts';
import type { BlockResult, PageBlock, PageDeps } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const OWNER = { actor: 'p_1' };

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'due', type: 'day', required: true, deadline: true },
      { id: 'amount', type: 'money' },
    ],
  } as never,
};

const THREE = { kind: 'calendar', source: 'register.bills', columns: [{ field: 'what' }, { field: 'due' }, { field: 'amount' }], back: 0, ahead: 1 } as PageBlock;

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([BILLS])).ok);
  const made = (fields: Record<string, unknown>): void => assert.ok(k.create('bills', fields, OWNER).ok);
  made({ what: 'Rent', due: '2026-09-20', amount: { amount: 187_500, currency: 'GBP' } });
  made({ what: 'Phone', due: '2026-10-02' });
  return k;
}

function depsOver(k: Kernel): PageDeps {
  const schemaOf = (register: string): Schema | null => {
    const decl = k.register(register);
    return decl ? ({ register, fields: Object.fromEntries(decl.fields.map((f) => [f.id, f])) } as Schema) : null;
  };
  return {
    pages: () => [],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: (q) => {
      const out = k.list({ register: q.register, ...(q.where ? { where: q.where } : {}), ...(q.limit ? { limit: q.limit } : {}), ...(q.order?.length ? { order: q.order } : {}) });
      return out.ok ? ok({ rows: out.value.rows, matched: out.value.matched }) : out;
    },
    schemaOf,
    titleOf: (register) => k.register(register)?.title ?? null,
    lists: () => [...k.registers().values()],
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf },
    kit: { predicateOf, today: () => new Date(NOW).toISOString().slice(0, 10) },
  } as PageDeps;
}

const asked = (block: PageBlock) => calendar.validate?.(block, { stage: 'read' }) ?? null;

test('A THIRD COLUMN, THE AMOUNT, IS ALLOWED, AND TWO STILL ARE', () => {
  assert.equal(asked(THREE), null);
  assert.equal(asked({ ...THREE, columns: THREE.columns!.slice(0, 2) } as PageBlock), null);
});

test('A FOURTH COLUMN IS REFUSED, AND ONE, in words that say the amount', () => {
  const four = asked({ ...THREE, columns: [...THREE.columns!, { field: 'what' }] } as PageBlock);
  assert.equal(four?.at, 'columns');
  assert.match(four!.fix, /two or three columns/u);
  assert.equal(asked({ ...THREE, columns: THREE.columns!.slice(0, 1) } as PageBlock)?.at, 'columns');
});

test('THE ROWS CARRY THE AMOUNT, so the host can say it beside the title', async () => {
  const k = await record();
  const out = calendar.read(depsOver(k), THREE, { ...THREE, rows: [], matched: 0, refusals: [] } as BlockResult);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(
    out.rows.map((r) => [r.fields.what, r.fields.amount ?? null]),
    [
      ['Rent', { amount: 187_500, currency: 'GBP' }],
      ['Phone', null],
    ],
  );
});
