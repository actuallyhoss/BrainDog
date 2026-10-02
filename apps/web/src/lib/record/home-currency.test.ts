/**
 * The record's home currency where nobody chose one: what its `boot` said, else what its settings hold, else the one
 * currency its money is in, and never a guess between two.
 *
 * MEASURED ON THE SAMPLE RECORD, every amount sterling and no `home_currency` set: `boot` said `currency: null`, so
 * `homeCurrency()` was null and every figure kept its code, "£39.00 GBP" in a question, "−£9,190.00 GBP" on Today.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';

import { homeCurrency, homeOf, learnHome } from './api.ts';
import { forget, layoutOf, readBoot, readImplied, refusedShell, type Fetch } from './boot-live.ts';
import { createClient } from '@braindog/client';

const BASE = 'http://record.test';
const NOW = '2026-09-15T12:00:00.000Z';

const json = (body: unknown): Response => new Response(JSON.stringify({ ok: true, value: body }), { status: 200, headers: { 'content-type': 'application/json' } });

/**
 * A record over HTTP that answers what `readImplied` asks: each list's fields, and its rows sorted by a money field the
 * way the kernel sorts one, by currency first.
 */
function host(opts: {
  record: Record<string, unknown>;
  lists: Record<string, { fields: { id: string; type: string }[]; money: Record<string, (string | null)[]> }>;
  packs?: { id: string; disabled_at: string | null; config: Record<string, unknown>; values: Record<string, unknown> }[];
}): { io: Fetch; sent: string[] } {
  const sent: string[] = [];
  const io = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const name = url.pathname.split('/').pop();
    sent.push(name ?? '');
    const register = url.searchParams.get('register') ?? '';
    if (name === 'boot')
      return json({ registers: Object.keys(opts.lists).map((id) => ({ id, name: id, count: 2 })), now: NOW, record: opts.record });
    if (name === 'schema') return json({ id: register, fields: opts.lists[register]?.fields ?? [] });
    if (name === 'list') {
      const [{ field, dir }] = JSON.parse(url.searchParams.get('order') ?? '[]') as [{ field: string; dir: 'asc' | 'desc' }];
      const held = (opts.lists[register]?.money[field] ?? []).filter((c): c is string => c !== null).sort();
      const first = dir === 'asc' ? held[0] : held.at(-1);
      return json({ rows: first ? [{ fields: { [field]: { amount: 100, currency: first } } }] : [], matched: held.length, cursor: null });
    }
    if (name === 'packs') return json((opts.packs ?? []).map(({ id, disabled_at }) => ({ id, version: '1.0.0', disabled_at, registers: [] })));
    if (name === 'packConfig') {
      const p = (opts.packs ?? []).find((x) => x.id === url.searchParams.get('id'));
      return json({ config: p?.config ?? {}, values: p?.values ?? {} });
    }
    return new Response('{}', { status: 404 });
  }) as Fetch;
  return { io, sent };
}

const RECORD = { slug: 'kiln', name: 'Kiln', locale: 'en' };
const MONEY = { id: 'amount', type: 'money' };
const read = (io: Fetch, b: Parameters<typeof readImplied>[1]) => readImplied(createClient({ base: BASE, fetch: io }), b);
const boot = (registers: string[], record: Record<string, unknown>) => ({ registers: registers.map((id) => ({ id, name: id, count: 2 })), now: NOW, record } as Parameters<typeof readImplied>[1]);

test('THE CURRENCY THE RECORD NAMED WINS, then the setting, then the one currency its money is in', () => {
  assert.equal(homeOf('EUR', 'GBP', ['USD']), 'EUR');
  assert.equal(homeOf(null, ' gbp ', ['USD']), 'GBP', 'a setting is read as the kernel reads it, trimmed and in capitals');
  assert.equal(homeOf(null, null, ['GBP', 'GBP']), 'GBP');
  assert.equal(homeOf('gbp', null, ['USD']), 'USD', 'what is not a code is no currency the record named');
});

test('TWO CURRENCIES ARE NEVER GUESSED BETWEEN, and no money is no currency', () => {
  assert.equal(homeOf(null, null, ['GBP', 'USD']), null);
  assert.equal(homeOf(null, null, []), null);
  assert.equal(homeOf(null, 'pounds', ['GBP', 'EUR']), null, 'a setting that is not a code is no setting');
  assert.equal(homeOf(null, null, ['GBP', 'no unit']), 'GBP', 'the mark for a bare figure is not a currency');
});

test("THE SHELL IS DRAWN IN THE RECORD'S ONE CURRENCY where nobody chose, and its choice wins where somebody did", () => {
  try {
    assert.equal(layoutOf({ registers: [], now: NOW, record: { ...RECORD, currency: null } }, { setting: null, held: ['GBP'] }).index.currency, 'GBP');
    assert.equal(homeCurrency(), 'GBP');
    assert.equal(layoutOf({ registers: [], now: NOW, record: { ...RECORD, currency: null } }, { setting: null, held: ['GBP', 'USD'] }).index.currency, null);
    assert.equal(homeCurrency(), null, 'a record in two currencies was drawn in one of them');
    assert.equal(layoutOf({ registers: [], now: NOW, record: { ...RECORD, currency: 'EUR' } }, { setting: null, held: ['GBP'] }).index.currency, 'EUR');
    assert.equal(layoutOf({ registers: [], now: NOW, record: { ...RECORD, currency: null } }, { setting: 'JPY', held: ['GBP'] }).index.currency, 'JPY');
    assert.equal(refusedShell({ code: 'FORBIDDEN', fix: 'Ask the owner.' }).index.currency, null, 'a refusal forgot the last record');
  } finally {
    learnHome(null);
  }
});

test('THE MONEY IS READ BY ITS TWO ENDS: a field in one currency answers it, a field in two answers both', async () => {
  const one = host({ record: { ...RECORD, currency: null }, lists: { bills: { fields: [{ id: 'what', type: 'text' }, MONEY], money: { amount: ['GBP', 'GBP', null] } } } });
  assert.deepEqual(await read(one.io, boot(['bills'], { ...RECORD, currency: null })), { setting: null, held: ['GBP'] });
  assert.equal(one.sent.filter((n) => n === 'packs').length, 0, 'a host that said null was asked the setting it had already read');

  const two = host({
    record: { ...RECORD, currency: null },
    lists: { bills: { fields: [MONEY], money: { amount: ['GBP'] } }, invoices: { fields: [MONEY], money: { amount: ['GBP', 'USD', 'EUR'] } } },
  });
  assert.deepEqual(await read(two.io, boot(['bills', 'invoices'], { ...RECORD, currency: null })), { setting: null, held: ['EUR', 'GBP', 'USD'] });
});

test('A LIST WITH NO MONEY IS NOT READ FOR ROWS, and an empty list is not read at all', async () => {
  const { io, sent } = host({ record: { ...RECORD, currency: null }, lists: { tasks: { fields: [{ id: 'title', type: 'text' }], money: {} } } });
  const b = { registers: [{ id: 'tasks', name: 'Tasks', count: 4 }, { id: 'bills', name: 'Bills', count: 0 }], now: NOW, record: { ...RECORD, currency: null } };
  assert.deepEqual(await read(io, b), { setting: null, held: [] });
  assert.deepEqual(sent, ['schema']);
});

test("AN OLDER HOST THAT SENDS NO CURRENCY KEY IS ASKED THE SETTING, the first enabled pack's by id", async () => {
  const { io } = host({
    record: RECORD,
    lists: { bills: { fields: [MONEY], money: { amount: ['GBP', 'USD'] } } },
    packs: [
      { id: 'zz-money', disabled_at: null, config: { home_currency: {} }, values: { home_currency: 'EUR' } },
      { id: 'money', disabled_at: null, config: { home_currency: {} }, values: { home_currency: 'gbp' } },
      { id: 'aa-off', disabled_at: '2026-01-01', config: { home_currency: {} }, values: { home_currency: 'JPY' } },
    ],
  });
  assert.deepEqual(await read(io, boot(['bills'], RECORD)), { setting: 'GBP', held: [] });
});

test('readBoot ASKS ONLY WHERE THE RECORD NAMED NO CURRENCY, and the shell over it is drawn in what it found', async () => {
  try {
    forget();
    const named = host({ record: { ...RECORD, currency: 'GBP' }, lists: { bills: { fields: [MONEY], money: { amount: ['GBP'] } } } });
    await readBoot(`${BASE}/app/kiln`, named.io);
    assert.deepEqual(named.sent, ['boot'], 'a record that named its currency cost more than its boot');

    forget();
    const unnamed = host({ record: { ...RECORD, currency: null }, lists: { bills: { fields: [MONEY], money: { amount: ['GBP', 'GBP'] } } } });
    const got = await readBoot(`${BASE}/app/kiln`, unnamed.io);
    assert.equal(got.from, 'live');
    if (got.from === 'live') assert.equal(layoutOf(got.boot).index.currency, 'GBP');
    assert.equal(homeCurrency(), 'GBP');

    /* A HOST THAT SENT `money` READ IT ITSELF: its `null` is no currency or two, and asking again would find the same. */
    forget();
    const told = host({ record: { ...RECORD, currency: null, money: ['GBP', 'USD'] }, lists: { bills: { fields: [MONEY], money: { amount: ['GBP', 'USD'] } } } });
    await readBoot(`${BASE}/app/kiln`, told.io);
    assert.deepEqual(told.sent, ['boot'], 'a host that read its own money was asked it again');
  } finally {
    forget();
    learnHome(null);
  }
});

test('A RECORD NOBODY NAMED STILL DRAWS ITS SHELL IN ITS HOME CURRENCY, which its boot says beside `record: null`', () => {
  /* THE GATES' RECORD, AND ANY SELF-HOST BEFORE ITS FIRST RUN: `record` is `null` there, and the shell read that as no
     currency, so every sentence on Money, Decide and Today said "£39 GBP". */
  try {
    assert.equal(layoutOf({ registers: [], now: NOW, record: null, currency: 'GBP', money: ['GBP'] }).index.currency, 'GBP');
    assert.equal(homeCurrency(), 'GBP');
    assert.equal(layoutOf({ registers: [], now: NOW, record: null, currency: null, money: ['GBP', 'USD'] }).index.currency, null);
    /* A HOST OLDER THAN THE FIELD SAYS NOTHING, and nothing is guessed for it. */
    assert.equal(layoutOf({ registers: [], now: NOW, record: null }, { setting: null, held: ['GBP'] }).index.currency, null);
  } finally {
    learnHome(null);
  }
});

/**
 * THE TWO ENDS ARE THE KERNEL'S OWN ORDER, held against a record rather than against the fake above: a money field
 * sorts by currency first and an empty value last either way, so the first row each way is the lowest and the highest
 * currency the field holds.
 */
test("A REAL RECORD'S MONEY IS READ BY ITS TWO ENDS, one currency or two, with a row holding none", async () => {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : db.prepare(text).run(...(params as never[]))),
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  } as unknown as Parameters<typeof openRecord>[0];
  const k = await openRecord(sql, { now: () => Date.parse(NOW) });
  const fields = [{ id: 'what', type: 'text', required: true }, MONEY];
  assert.ok((await k.install([{ id: 'register.bills', kind: 'register', body: { id: 'bills', name: 'Bills', title: 'what', fields } as never }])).ok);
  const add = (what: string, amount?: { amount: number; currency: string }) =>
    assert.ok(k.create('bills', { what, ...(amount ? { amount } : {}) }, { actor: 'p_1' }).ok);
  add('Rent', { amount: 120_000, currency: 'GBP' });
  add('Nothing yet');
  add('Phone', { amount: 3_900, currency: 'GBP' });

  const io = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const name = url.pathname.split('/').pop();
    if (name === 'schema') return json({ id: 'bills', fields });
    if (name === 'list') {
      const out = k.list({ register: 'bills', order: JSON.parse(url.searchParams.get('order') ?? '[]'), limit: Number(url.searchParams.get('limit')) } as never);
      return json(out.ok ? out.value : { rows: [], matched: 0, cursor: null });
    }
    return new Response('{}', { status: 404 });
  }) as Fetch;
  const b = boot(['bills'], { ...RECORD, currency: null });
  assert.deepEqual(await read(io, b), { setting: null, held: ['GBP'] });

  add('Hosting', { amount: 1_200, currency: 'USD' });
  assert.deepEqual(await read(io, b), { setting: null, held: ['GBP', 'USD'] }, 'a second currency was missed');
  db.close();
});
