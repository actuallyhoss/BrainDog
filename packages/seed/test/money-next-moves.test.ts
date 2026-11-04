/**
 * A REPEATING LINE'S "NEXT" MOVES WHEN IT IS PAID (money-next-moves-100).
 *
 * `script.settle_matched_line` is back in Money's pack: `payment-matches` starts it as its second step, and "It went
 * through" starts it on the line (`recurring-went-through`). The day "Next" moves to is the walk's own step, handed by
 * the host as `ctx.cycle(day, line)` over the kernel's `cycleAfter`; here a double hands exactly that call. Read on a
 * fresh record: a monthly line on the 1st paid on 3 October reads "Next" 1 November, last paid 3 October; a payment 10%
 * off is left off the line, its note says why, and no question opens; "It went through" moves the line on; and a host
 * with no `ctx.cycle` writes nothing and says so.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { cycleAfter, openRecord, type CycleLine, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { COMPANIES } from '../../../fixtures/names.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { firstPartyDocument, gbp } from '../src/index.ts';
import { MONEY_AUTOMATIONS, SETTLE_LINE_SCRIPT } from '../src/modules/money/rules.ts';

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

test('the line script is in the pack: the payment rule starts it second, and "It went through" starts it on the line', () => {
  const rule = MONEY_AUTOMATIONS.find((a) => a.rule === 'payment-matches') as { steps: { script: { id: string } }[] };
  assert.deepEqual(rule.steps.map((s) => s.script.id), ['match_payment', 'settle_matched_line']);
  assert.ok(MONEY_AUTOMATIONS.includes(SETTLE_LINE_SCRIPT), 'the line script is in no pack document');
  const went = MONEY_AUTOMATIONS.find((a) => a.rule === 'recurring-went-through') as { on: Fields; steps: { script: { id: string } }[] };
  assert.deepEqual(went.on, { decided: { about: 'rule.recurring-missed', option: 'It went through' } });
  assert.deepEqual(went.steps.map((s) => s.script.id), ['settle_matched_line']);
  /* ITS DAY IS THE HOST'S STEP, AND IT NEVER HANDS `settle` THE ONE WORD THAT KEEPS A PAYMENT ON A LINE IT DOES NOT MOVE. */
  const run = SETTLE_LINE_SCRIPT.source.slice(SETTLE_LINE_SCRIPT.source.lastIndexOf('export default'));
  assert.ok(run.includes('ctx.cycle'));
  assert.ok(!/next:\s*null/.test(run));
});

test('October\'s rent files and the line reads Next 1 November, last paid 3 October, in one write', async () => {
  const m = await money();
  const line = m.made('recurring', LINE);
  const before = m.open().length;
  const pay = m.paid('2026-10-03');
  await m.turn();
  const f = fieldsOf(m.k, line.id);
  assert.deepEqual([f.next_due, f.last_paid, f.last_amount], ['2026-11-01', '2026-10-03', gbp(400_000)], said(m.log));
  assert.ok(m.log.includes(`${LANDLORD} is paid for 1 October, and Next is 1 November.`), said(m.log));
  /* FROM THE DAY THE LINE NAMED, NOT THE DAY THE MONEY MOVED. */
  assert.deepEqual(m.cycled, ['2026-10-01']);
  /* THE ONE QUESTION THE LINE PAST ITS DAY HAD ASKED CLOSES ITSELF, SINCE 3 November (be7728aa4), and no other opens. */
  assert.equal(before, 1, 'the line past its day asked nothing');
  assert.equal(m.open().length, 0, 'a question opened, or the one about the line stayed');
  assert.equal(fieldsOf(m.k, pay.id).note ?? null, null);
  /* AND HANDED AGAIN, THE SAME PAYMENT MOVES NOTHING A SECOND TIME. */
  value(m.k.update('transactions', pay.id, { state: 'pending' }, OWNER));
  value(m.k.update('transactions', pay.id, { state: 'cleared' }, OWNER));
  await m.turn();
  assert.equal(fieldsOf(m.k, line.id).next_due, '2026-11-01');
  assert.ok(!m.log.some((l) => /[0-9A-HJKMNP-TV-Z]{26}|recurring#|transactions#/.test(l)), said(m.log));
});

test('a payment 10% off is left off the line, its note says so in one line, and no question opens', async () => {
  const m = await money();
  const line = m.made('recurring', LINE);
  const before = m.open().length;
  const pay = m.paid('2026-10-03', 440_000);
  await m.turn();
  const f = fieldsOf(m.k, line.id);
  assert.deepEqual([f.next_due, f.last_paid ?? null, f.last_amount ?? null, f.amount], ['2026-10-01', null, null, gbp(400_000)], said(m.log));
  const note = String(fieldsOf(m.k, pay.id).note ?? '');
  assert.equal(note, `GBP 4,400 is not the GBP 4,000 ${LANDLORD} repeats at, so this payment was not counted on it.`);
  assert.ok(!note.includes('\n') && !note.includes('—'));
  assert.equal(m.open().length, before, 'a question opened');
  assert.equal(fieldsOf(m.k, pay.id).settles ?? null, null);
});

test('a payment 10% off a line in its last month is still left off it and said, though the line has no later day', async () => {
  const m = await money();
  const line = m.made('recurring', { ...LINE, ends: '2026-10-15' });
  const pay = m.paid('2026-10-03', 440_000);
  await m.turn();
  assert.deepEqual([fieldsOf(m.k, line.id).next_due, fieldsOf(m.k, line.id).last_paid ?? null], ['2026-10-01', null], said(m.log));
  assert.ok(String(fieldsOf(m.k, pay.id).note ?? '').endsWith('so this payment was not counted on it.'), said(m.log));
});

test('a note somebody wrote on the payment is kept', async () => {
  const m = await money();
  m.made('recurring', LINE);
  const pay = m.paid('2026-10-03', 440_000, { note: 'Paid with the late fee.' });
  await m.turn();
  assert.equal(fieldsOf(m.k, pay.id).note, 'Paid with the late fee.');
  assert.ok(m.log.some((l) => l.endsWith('so this payment was not counted on it.')), said(m.log));
});

test('"It went through" moves Next one cycle on and writes nothing else', async () => {
  const m = await money();
  const line = m.made('recurring', LINE);
  await m.turn();
  const q = m.open().find((x) => x.body?.about === `recurring#${line.seq}`);
  assert.ok(q, `no question about the line: ${JSON.stringify(m.open().map((x) => x.body?.about))}`);
  const went = q.body!.options!.find((o) => o.label === 'It went through')!;
  value(m.k.decide(q.id, { decide: { option: went.id, reason: 'It went out by hand.' } }, 'p_1'));
  await m.turn();
  const f = fieldsOf(m.k, line.id);
  assert.deepEqual([f.next_due, f.last_paid ?? null, f.last_amount ?? null, f.state], ['2026-11-01', null, null, 'live'], said(m.log));
  assert.ok(m.log.includes(`${LANDLORD} went through for 1 October, and Next is 1 November.`), said(m.log));
});

test('"It went through" marks the open bill for the same money paid, and moves the line on', async () => {
  const m = await money();
  const line = m.made('recurring', LINE);
  const bill = m.made('obligations', { what: LANDLORD, direction: 'owed_by_me', amount: gbp(400_000), due: '2026-10-01', state: 'open' });
  const other = m.made('obligations', { what: 'Somebody else', direction: 'owed_by_me', amount: gbp(400_000), due: '2026-10-01', state: 'open' });
  await m.turn();
  const q = m.open().find((x) => x.body?.about === `recurring#${line.seq}`)!;
  value(m.k.decide(q.id, { decide: { option: q.body!.options!.find((o) => o.label === 'It went through')!.id, reason: 'It went.' } }, 'p_1'));
  await m.turn();
  assert.equal(fieldsOf(m.k, line.id).next_due, '2026-11-01', said(m.log));
  assert.deepEqual([fieldsOf(m.k, bill.id).state, fieldsOf(m.k, bill.id).settled], ['paid', '2026-10-03'], said(m.log));
  assert.equal(fieldsOf(m.k, other.id).state, 'open');
  assert.ok(m.log.includes(`${LANDLORD} is marked paid, since you said it went through.`), said(m.log));
  /* AND THE BILL BEING PAID ASKS NOTHING MORE: its line has moved on already. */
  assert.ok(!m.open().some((x) => x.body?.options?.some((o) => o.label === 'Move it on')), said(m.log));
});

/* THE QUESTION CLOSES ITSELF ONCE THE LINE HAS MOVED, SINCE 3 November (be7728aa4), so a late press is refused and cannot
   skip a cycle; and the script read handed such a press still moves nothing (`scripts/settle-matched-line.js`). */
test('"It went through" pressed after the payment moved the line skips no cycle', async () => {
  const m = await money();
  const line = m.made('recurring', LINE);
  await m.turn();
  const q = m.open().find((x) => x.body?.about === `recurring#${line.seq}`)!;
  m.paid('2026-10-03');
  await m.turn();
  assert.equal(fieldsOf(m.k, line.id).next_due, '2026-11-01', said(m.log));
  const late = m.k.decide(q.id, { decide: { option: q.body!.options!.find((o) => o.label === 'It went through')!.id, reason: 'It went.' } }, 'p_1') as { ok: boolean; refusal?: { code: string } };
  assert.deepEqual([late.ok, late.refusal?.code], [false, 'TRANSITION_ILLEGAL']);
  await m.turn();
  assert.equal(fieldsOf(m.k, line.id).next_due, '2026-11-01', said(m.log));
});

test('without ctx.cycle the script writes nothing and says so, for a payment and for "It went through"', async () => {
  const m = await money(false);
  const line = m.made('recurring', LINE);
  m.paid('2026-10-03');
  await m.turn();
  const f = fieldsOf(m.k, line.id);
  assert.deepEqual([f.next_due, f.last_paid ?? null, f.last_amount ?? null], ['2026-10-01', null, null], said(m.log));
  assert.ok(m.log.includes('This repeating line was handed no day to move to, so nothing on it changed.'), said(m.log));
  const q = m.open().find((x) => x.body?.about === `recurring#${line.seq}`)!;
  m.log.length = 0;
  value(m.k.decide(q.id, { decide: { option: q.body!.options!.find((o) => o.label === 'It went through')!.id, reason: 'It went.' } }, 'p_1'));
  await m.turn();
  assert.equal(fieldsOf(m.k, line.id).next_due, '2026-10-01');
  assert.ok(m.log.includes('This repeating line was handed no day to move to, so nothing on it changed.'), said(m.log));
});

test('a bill is still marked by its link alone, and the line script says nothing for it', async () => {
  const m = await money();
  const bill = m.made('obligations', { what: LANDLORD, direction: 'owed_by_me', amount: gbp(400_000), due: '2026-10-01', state: 'open' });
  const pay = m.paid('2026-10-03');
  await m.turn();
  assert.deepEqual([fieldsOf(m.k, pay.id).settles, fieldsOf(m.k, bill.id).state], [bill.id, 'paid'], said(m.log));
  assert.deepEqual(m.cycled, []);
  assert.ok(!m.log.some((l) => l.includes('repeating line')), said(m.log));
});
