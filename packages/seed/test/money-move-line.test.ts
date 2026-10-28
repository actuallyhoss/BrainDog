/**
 * A PAID BILL ASKS ONCE TO MOVE ITS REPEATING LINE ON (B6 of the 24 October scope).
 *
 * "Studio salary" was a bill due 9 October and a repeating line whose Next was 9 October. The bill was marked paid on
 * 23 October and the line kept its day, so Today read the salary two weeks late. Read here on a fresh record: a bill
 * marked paid by hand, or by a payment, with a line of the same name, way and currency whose Next is within ten days of
 * its due day, files one question whose first answer moves Next one cycle on; a line of another name asks nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { cycleAfter, openRecord, type CycleLine, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { COMPANIES } from '../../../fixtures/names.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { firstPartyDocument, gbp } from '../src/index.ts';
import { MONEY_AUTOMATIONS } from '../src/modules/money/rules.ts';
import { MOVE_LINE_SCRIPT, moveLine, twinLine } from '../src/modules/money/scripts/move-line.js';

type Fields = Record<string, unknown>;
type Question = { id: string; body?: { about?: string; options?: { id: string; label: string }[] } };
const OWNER = { actor: 'p_1' };
const LANDLORD = COMPANIES[3];
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, sayOf(r as never));
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

/** 3 October 2026, the day the rent went: two days past the line's day. */
const THIRD = Date.UTC(2026, 9, 3, 12);
const LINE = { what: LANDLORD, direction: 'out', amount: gbp(400_000), every: 'monthly', next_due: '2026-10-01', state: 'live' };
const BILL = { what: LANDLORD, direction: 'owed_by_me', amount: gbp(400_000), due: '2026-10-01', state: 'open' };

/**
 * A record holding Money as its pack document says it. `cycle` is what the host hands a script as `ctx.cycle`: the
 * kernel's `cycleAfter`, answering `null` for anything it cannot step, as the host's does; `false` is a host with none.
 */
async function money(cycle = true) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(THIRD));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const made = (list: string, fields: Fields) => value<Entry>(k.create(list, fields, OWNER));
  const book = made('books', { name: 'Personal' }).id;
  const account = made('accounts', { name: 'Current', kind: 'bank', liquid: true, balance: gbp(1_000_000), as_of: '2026-10-01', book }).id;
  const paid = (on: string, amount = 400_000, more: Fields = {}) =>
    made('transactions', { what: LANDLORD.toUpperCase(), on, direction: 'out', amount: gbp(amount), account, book, state: 'cleared', ...more });

  const log: string[] = [];
  const cycled: string[] = [];
  const shaped = (e: Entry) => ({ id: e.id, register: e.register, seq: e.seq!, version: e.version, fields: e.fields });
  /** A script's text run as a plain module over the record, its writes handed back for the record to make. */
  const ran = async (source: string, input: unknown) => {
    const writes: { op: 'update'; spoken: string; patch: Fields; version: number }[] = [];
    const ctx = {
      input,
      record: {
        get: async (said: string) => {
          const e = k.get(said);
          return e ? shaped(e) : null;
        },
        list: async (register: string, where: unknown) => value<{ rows: Entry[] }>(k.list({ register, where: where as never })).rows.map(shaped),
      },
      update: (spoken: string, patch: Fields, version: number) => void writes.push({ op: 'update', spoken, patch, version }),
      log: (...words: string[]) => void log.push(words.join(' ')),
      today: () => '2026-10-03',
      ...(cycle
        ? {
            cycle: async (day: string, line: CycleLine) => {
              cycled.push(day);
              try {
                return cycleAfter(day, line);
              } catch {
                return null;
              }
            },
          }
        : {}),
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(source)}`)) as { default: (c: unknown) => Promise<{ ask?: unknown } | null> };
    return { out: await mod.default(ctx), writes };
  };
  /** The rules' own runs: the schedule and then the outbox, every script run as a host runs it. */
  const turn = async (rounds = 4) => {
    for (let i = 0; i < rounds; i++) {
      await k.drain();
      await k.runActions((async () => {
        throw new Error('no call is taken here');
      }) as never, {
        script: (async (s: { scripted: { input: unknown; decl: { source: string } } }) => {
          const { out, writes } = await ran(s.scripted.decl.source, s.scripted.input);
          return { writes, log: log.join('\n'), usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 }, ...(out && out.ask ? { ask: out.ask } : {}) };
        }) as never,
        limit: 50,
      });
    }
  };
  const open = (): Question[] => value<Question[]>(k.governance('suggestion', { status: 'open', apart: 'with' }));
  return { k, sql, made, paid, turn, open, log, cycled };
}

const fieldsOf = (k: Kernel, id: string) => k.get(id)!.fields;
const said = (log: string[]) => log.join(' | ');

test('the script and its rule are in Money: a bill moved to paid starts it', () => {
  const rule = MONEY_AUTOMATIONS.find((a) => a.rule === 'bill-moves-line') as { on: Fields; when: string; steps: { script: { id: string } }[] };
  assert.ok(MONEY_AUTOMATIONS.includes(MOVE_LINE_SCRIPT));
  assert.deepEqual(rule.on, { written: { register: 'obligations', op: ['update'], fields: ['state'] } });
  assert.equal(rule.when, 'state is paid');
  assert.equal(rule.steps[0]!.script.id, 'move_line');
});

test('a bill marked paid by hand asks once to move its line on, and the answer moves Next one cycle', async () => {
  const m = await money();
  const line = m.made('recurring', LINE);
  const bill = m.made('obligations', BILL);
  value(m.k.update('obligations', bill.id, { state: 'paid', settled: '2026-10-03' }, OWNER));
  await m.turn();
  const q = m.open().find((x) => x.body?.about === `recurring#${line.seq}` && x.body?.options?.some((o) => o.label === 'Move it on'));
  assert.ok(q, `no question about the line: ${JSON.stringify(m.open().map((x) => x.body))} ${said(m.log)}`);
  assert.equal(fieldsOf(m.k, line.id).next_due, '2026-10-01');
  value(m.k.decide(q.id, { decide: { option: q.body!.options!.find((o) => o.label === 'Move it on')!.id, reason: 'Paid.' } }, 'p_1'));
  await m.turn();
  assert.equal(fieldsOf(m.k, line.id).next_due, '2026-11-01', said(m.log));
});

test('a payment that fits a bill and its line links the bill, and the bill being paid asks to move the line', async () => {
  const m = await money();
  const line = m.made('recurring', LINE);
  const bill = m.made('obligations', BILL);
  const pay = m.paid('2026-10-03');
  await m.turn();
  assert.deepEqual([fieldsOf(m.k, pay.id).settles, fieldsOf(m.k, bill.id).state], [bill.id, 'paid'], said(m.log));
  const q = m.open().find((x) => x.body?.about === `recurring#${line.seq}` && x.body?.options?.some((o) => o.label === 'Move it on'));
  assert.ok(q, said(m.log));
});

test('a line of another name, or two lines of the one name, asks nothing', async () => {
  const m = await money();
  const other = m.made('recurring', { ...LINE, what: 'Somebody else' });
  const bill = m.made('obligations', BILL);
  value(m.k.update('obligations', bill.id, { state: 'paid', settled: '2026-10-03' }, OWNER));
  await m.turn();
  assert.equal(m.open().filter((x) => x.body?.options?.some((o) => o.label === 'Move it on')).length, 0, said(m.log));
  assert.equal(fieldsOf(m.k, other.id).next_due, '2026-10-01');
  const row = (list: string, spoken: string, fields: Fields) => ({ list, id: spoken, spoken, version: 1, fields });
  const paidBill = row('obligations', 'obligations#1', { ...BILL, state: 'paid' });
  const twin = row('recurring', 'recurring#1', LINE);
  assert.ok('nothing' in twinLine(paidBill, [twin, row('recurring', 'recurring#2', LINE)]));
  assert.ok('line' in twinLine(paidBill, [twin]));
  assert.ok('nothing' in twinLine({ ...paidBill, fields: { ...paidBill.fields, state: 'open' } }, [twin]));
  const asked = moveLine(paidBill, twin, '2026-11-01');
  assert.ok('ask' in asked && asked.ask.question === `${LANDLORD} is paid for 1 October. Move its repeating line on to 1 November?`);
  assert.ok('nothing' in moveLine(paidBill, twin, '2026-09-01'));
});
