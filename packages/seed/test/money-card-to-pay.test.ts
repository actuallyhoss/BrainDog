/**
 * WHAT IS TO PAY ON A CARD SHOWS ON MONEY (B8 of the 24 October scope).
 *
 * A card text says what is left of the limit, never what is to pay. With the limit typed on the card, `card_owed`
 * writes "To pay on it" as the limit less the newest available, with that text's day, and Money's first line says
 * "On the card: EGP X to pay, as of <day>". Read here on a fresh record: a text writes it, a limit typed later writes
 * it from the newest text, an older text changes nothing, and a card with no limit says why and writes nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { cycleAfter, openRecord, type CycleLine, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { COMPANIES } from '../../../fixtures/names.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { firstPartyDocument, gbp } from '../src/index.ts';
import { METRICS } from '../src/index.ts';
import { MONEY_AUTOMATIONS } from '../src/modules/money/rules.ts';
import { CARD_OWED_SCRIPT, cardOwed } from '../src/modules/money/scripts/card-owed.js';

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
  const open = (): Question[] => value<Question[]>(k.governance('suggestion', { status: 'open' }));
  return { k, sql, made, paid, turn, open, log, cycled };
}

const fieldsOf = (k: Kernel, id: string) => k.get(id)!.fields;
const said = (log: string[]) => log.join(' | ');
const egp = (amount: number) => ({ amount, currency: 'EGP' });

test('the script and both rules are in Money', () => {
  assert.ok(MONEY_AUTOMATIONS.includes(CARD_OWED_SCRIPT));
  const rules = MONEY_AUTOMATIONS.filter((a) => a.rule === 'card-text-owes' || a.rule === 'card-limit-owes');
  assert.equal(rules.length, 2);
});

test('a card text with what is available writes what is to pay, and the figure and its day read it', async () => {
  const m = await money();
  const card = m.made('accounts', { name: 'Credit Card', kind: 'card', balance: egp(-7_361_527), as_of: '2026-09-28', liquid: false, limit: egp(10_000_000) });
  m.made('transactions', { what: 'BTRUCK1', on: '2026-10-02', direction: 'out', amount: egp(138_900), available: egp(2_467_091), account: card.id, state: 'cleared' });
  await m.turn();
  const f = fieldsOf(m.k, card.id);
  assert.deepEqual([f.to_pay, f.to_pay_on], [egp(7_532_909), '2026-10-02'], said(m.log));
  const owed = m.k.metric(METRICS['card-to-pay'] as never) as { ok: boolean; value: { value: number } };
  assert.equal(owed.value.value, 7_532_909);
  /* AN OLDER TEXT, logged late, changes nothing. */
  m.made('transactions', { what: 'EARLIER', on: '2026-09-30', direction: 'out', amount: egp(10_000), available: egp(9_000_000), account: card.id, state: 'cleared' });
  await m.turn();
  assert.deepEqual(fieldsOf(m.k, card.id).to_pay, egp(7_532_909), said(m.log));
});

test('a limit typed later works it out from the newest text, and a card with no limit writes nothing', async () => {
  const m = await money();
  const card = m.made('accounts', { name: 'Credit Card', kind: 'card', balance: egp(-100), as_of: '2026-09-28', liquid: false });
  m.made('transactions', { what: 'ONE', on: '2026-10-01', direction: 'out', amount: egp(100), available: egp(900_000), account: card.id, state: 'cleared' });
  m.made('transactions', { what: 'TWO', on: '2026-10-02', direction: 'out', amount: egp(100), available: egp(800_000), account: card.id, state: 'cleared' });
  await m.turn();
  assert.equal(fieldsOf(m.k, card.id).to_pay ?? null, null);
  assert.ok(m.log.some((l) => l.includes('has no credit limit')), said(m.log));
  value(m.k.update('accounts', card.id, { limit: egp(1_000_000) }, OWNER));
  await m.turn();
  const f = fieldsOf(m.k, card.id);
  assert.deepEqual([f.to_pay, f.to_pay_on], [egp(200_000), '2026-10-02'], said(m.log));
});

test('the decision: a card, a limit and a text in one currency, or nothing', () => {
  const row = (list: string, fields: Fields) => ({ list, id: `${list}#1`, spoken: `${list}#1`, version: 1, fields });
  const card = row('accounts', { name: 'Card', kind: 'card', limit: egp(1_000) });
  const text = row('transactions', { on: '2026-10-01', available: egp(400) });
  const out = cardOwed(card, text);
  assert.ok('writes' in out && JSON.stringify(out.writes[0]!.fields) === JSON.stringify({ to_pay: egp(600), to_pay_on: '2026-10-01' }));
  assert.ok('nothing' in cardOwed(row('accounts', { name: 'Bank', kind: 'bank', limit: egp(1_000) }), text));
  assert.ok('nothing' in cardOwed(card, row('transactions', { on: '2026-10-01', available: { amount: 400, currency: 'USD' } })));
  assert.ok('nothing' in cardOwed(card, null));
});
