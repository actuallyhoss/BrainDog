/**
 * A length the reader picked on a forecast's horizon knob reaches the kernel through `page` (`walk`), so a page offering
 * five years walks two at most until somebody asks for five (`walkReach` in `packages/kernel/src/pages.ts`). A length
 * arrives from a query string as text, so `"1825"` is 1,825 days; anything that is not whole days or `last` is refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const ACCOUNTS: Declaration = {
  id: 'register.accounts',
  kind: 'register',
  body: {
    id: 'accounts',
    name: 'Accounts',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'balance', type: 'money', required: true },
    ],
  } as never,
};

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'due', type: 'day', required: true },
    ],
  } as never,
};

const CASH: Declaration = {
  id: 'metric.cash-now',
  kind: 'metric',
  body: { metric: 'cash-now', name: 'Cash now', source: 'register.accounts', value: { sum: 'balance' }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

const AHEAD: Declaration = {
  id: 'page.ahead',
  kind: 'page',
  body: {
    page: 'ahead',
    title: 'Ahead',
    blocks: [
      {
        kind: 'forecast',
        heading: 'Cash ahead',
        source: 'forecast.runway',
        opening: { metric: 'cash-now' },
        from: [{ register: 'bills', on: 'due', amount: 'amount' }],
        horizon: 90,
        horizons: [90, 1825, 'last'],
      },
    ],
  } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([ACCOUNTS, BILLS, CASH, AHEAD]));
  value(await api.create({ register: 'accounts', fields: { name: 'Current', balance: { amount: 412_345, currency: 'GBP' } } }, owner));
  /* A PLAN RUNNING THREE YEARS, so the end is past what a walk reaches unasked. */
  value(await api.create({ register: 'bills', fields: { what: 'Rent', amount: { amount: 60_000, currency: 'GBP' }, due: '2026-10-01' } }, owner));
  value(await api.create({ register: 'bills', fields: { what: 'Last instalment', amount: { amount: 25_000, currency: 'GBP' }, due: '2029-09-01' } }, owner));
  return { api, sql };
}

const reachOf = async (api: Awaited<ReturnType<typeof record>>['api'], walk?: unknown) => {
  const page = value<{ blocks: { kind: string; walk?: { horizon: number; reach?: number } }[] }>(
    await api.page({ slug: 'ahead', ...(walk === undefined ? {} : { walk }) }, owner),
  );
  const w = page.blocks.find((b) => b.kind === 'forecast')?.walk;
  assert.ok(w, 'the forecast drew no walk');
  return w.reach ?? null;
};

test('UNASKED, A WALK REACHES TWO YEARS AND A DAY; ASKED, THE LENGTH THE READER PICKED', async () => {
  const { api, sql } = await record();
  assert.equal(await reachOf(api), 731);
  assert.equal(await reachOf(api, 1825), 1825);
  /* AS A QUERY STRING SAYS IT. */
  assert.equal(await reachOf(api, '1825'), 1825);
  assert.ok(((await reachOf(api, 'last')) ?? 0) > 1_000, 'To the end stopped at two years when asked for');
  sql.close();
});

test('A WALK THAT IS NOT WHOLE DAYS OR last IS REFUSED, naming walk', async () => {
  const { api, sql } = await record();
  for (const walk of [0, -5, 1.5, 'soon', '12 days', true, { days: 30 }]) {
    const out = (await api.page({ slug: 'ahead', walk } as never, owner)) as { ok: boolean; refusal?: { code: string; at?: string } };
    assert.equal(out.ok, false, `${JSON.stringify(walk)} was walked`);
    assert.equal(`${out.refusal?.code} at ${out.refusal?.at}`, 'VALUE_MALFORMED at walk');
  }
  sql.close();
});
