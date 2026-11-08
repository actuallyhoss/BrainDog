/**
 * Filing rules that learn: a new or changed rule files back what it matches, and a category set
 * by hand asks once whether the payee always goes there. No category is better than a wrong one.
 *
 * MEASURED ON A RECORD, as `money-match-rule.test.ts` measures `match_payment`: Money installed from its pack document,
 * its rules started by the write, and each queued script's declared `source` run as a host's sandbox runs it, with the
 * kernel's own payee fold handed as `ctx.fold` and a list read one page of fifty at a time, as a host reads it.
 *
 * RED FIRST: with `rule-files-back` and `category-teaches` out of `MONEY_AUTOMATIONS`, a new rule files nothing already
 * in the Ledger, and a category set by hand asks nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel, type ScriptAnswer, type Scripted, type UndoPlan } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, day, firstPartyDocument } from '../src/index.ts';
import { MONEY_AUTOMATIONS } from '../src/modules/money/rules.ts';
import { FILE_BACK_SCRIPT } from '../src/modules/money/scripts/file-back.js';
import { LEARN_CATEGORY_SCRIPT } from '../src/modules/money/scripts/learn-category.js';
import { payeeKey } from '../src/modules/money/scripts/match-payment.js';

type Fields = Record<string, unknown>;
const OWNER = { actor: 'p_1' };
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

type Asked = { id: string; cause: string | null; opened_by: string; body: string; status: string };

/** A fresh record holding Money, one category for money out, one account, and a sandbox that runs a script's source. */
async function money() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const made = (list: string, fields: Fields) => value<Entry>(k.create(list, fields, OWNER));
  const outing = made('categories', { name: 'Outing', direction: 'out', state: 'live' });
  const account = made('accounts', { name: 'Current', kind: 'bank', balance: { amount: 1_000_000, currency: 'GBP' }, as_of: day(-1) }).id;
  /** One cleared Ledger entry for money out, with no category, `ago` days back. */
  const paid = (bank: string, ago: number, more: Fields = {}) =>
    made('transactions', { what: `Card payment ${ago}`, on: day(-ago), direction: 'out', amount: { amount: 1_250, currency: 'GBP' }, account, state: 'cleared', counterparty_text: bank, ...more });

  const log: string[] = [];
  const shaped = (e: Entry) => ({ id: e.id, register: e.register, seq: e.seq!, version: e.version, fields: e.fields, deleted_at: e.deleted_at });
  const sandbox = async (s: Scripted): Promise<ScriptAnswer> => {
    const writes: unknown[] = [];
    const ctx = {
      input: s.scripted.input,
      today: () => day(0),
      now: () => new Date(NOW).toISOString(),
      fold: async (text: string) => payeeKey(text),
      record: {
        get: async (said: string) => {
          const e = k.get(said);
          return e ? shaped(e) : null;
        },
        list: async (register: string, where: unknown) => value<{ rows: Entry[] }>(k.list({ register, where: where as never })).rows.map(shaped),
      },
      write: (register: string, fields: unknown) => void writes.push({ op: 'create', register, fields }),
      update: (spoken: string, patch: unknown, version: number) => void writes.push({ op: 'update', spoken, patch, version }),
      log: (...words: string[]) => void log.push(words.join(' ')),
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(s.scripted.decl.source)}`)) as { default: (c: typeof ctx) => Promise<{ ask?: unknown } | null> };
    const out = await mod.default(ctx);
    return { writes: writes as never, log: log.join('\n'), usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 }, ...(out && out.ask ? { ask: out.ask } : {}) } as never;
  };
  const execute = (async () => {
    throw new Error('no call is taken here');
  }) as never;
  /** The schedule and then the outbox, enough rounds for a rule made by one script to start the next. */
  const turn = async (rounds = 4) => {
    for (let i = 0; i < rounds; i++) {
      await k.drain();
      await k.runActions(execute, { script: sandbox, limit: 50 });
    }
  };
  const scripts = (): string[] => sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'script.run' ORDER BY rowid").map((r) => (JSON.parse(r.payload) as { script: string }).script);
  const asked = (): Asked[] => sql.all<Asked>('SELECT id, cause, opened_by, body, status FROM suggestion ORDER BY rowid');
  /** What was asked, in its words: the `suggest` event's `to_v`, the only copy (`govern.ts` `propose`). */
  const said = (id: string): string => sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'suggest' AND target = ?", `suggestion:${id}`)!.to_v;
  const rules = (): Entry[] => value<{ rows: Entry[] }>(k.list({ register: 'filing_rules' })).rows;
  return { k, sql, made, paid, outing, account, turn, scripts, asked, said, rules, log };
}

const automation = (rule: string) => MONEY_AUTOMATIONS.find((a) => a.rule === rule) as { on: Fields; when?: string; steps: { script: { id: string; input: Fields } }[] } | undefined;
const talabat = (m: Awaited<ReturnType<typeof money>>, fields: Fields = {}) =>
  m.made('filing_rules', { match: 'TALABAT', match_by: 'exact', reads: 'payee', direction: 'out', category: m.outing.id, ...fields });

test('the three rules and the two scripts are Money\'s own, started by a write or an answer and never by the clock', () => {
  assert.ok(MONEY_AUTOMATIONS.includes(FILE_BACK_SCRIPT) && MONEY_AUTOMATIONS.includes(LEARN_CATEGORY_SCRIPT), 'a script is in no pack document');
  for (const s of [FILE_BACK_SCRIPT, LEARN_CATEGORY_SCRIPT]) assert.deepEqual([s.runs, s.egress, s.keys], [{ rule: true }, [], []]);
  assert.deepEqual(automation('rule-files-back')?.on, {
    written: { register: 'filing_rules', op: ['create', 'update'], fields: ['match', 'match_by', 'reads', 'direction', 'category', 'account', 'state'] },
  });
  assert.equal(automation('rule-files-back')?.when, 'state is on');
  assert.deepEqual(automation('category-teaches')?.on, { written: { register: 'transactions', op: ['update'], fields: ['category'] } });
  assert.match(automation('category-teaches')!.when!, /filed_by is empty/u);
  assert.deepEqual(automation('category-taught')?.on, { decided: { about: 'script.learn_category', option: 'Yes' } });
});

test('A NEW RULE FILES THREE OLD ENTRIES IN ONE BATCH, and one Undo empties them all', async () => {
  const m = await money();
  const old = [m.paid('TALABAT', 3), m.paid('TALABAT', 40), m.paid('TALABAT', 200)];
  const other = m.paid('UBER', 5);
  /* MORE THAN 400 DAYS BACK IS LEFT AS IT IS. */
  const ancient = m.paid('TALABAT', 420);
  await m.turn();
  assert.deepEqual(m.asked(), []);
  const rule = talabat(m);
  await m.turn();
  for (const e of old) assert.deepEqual([m.k.get(e.id)!.fields.category, m.k.get(e.id)!.fields.filed_by], [m.outing.id, rule.id], m.log.join(' | '));
  assert.equal(m.k.get(other.id)!.fields.category ?? null, null);
  assert.equal(m.k.get(ancient.id)!.fields.category ?? null, null);
  assert.ok(m.log.some((l) => l === 'TALABAT filed 3 entries of the last 400 days under Outing, as one change you can undo.'), m.log.join(' | '));
  /* ONE BATCH, AND NOTHING ASKED: a script's own write of a category starts no question. */
  const batches = m.sql.all<{ batch: string }>(
    "SELECT DISTINCT batch FROM event WHERE actor LIKE 'script:file_back%' AND target IN (SELECT value FROM json_each(?))",
    JSON.stringify(old.map((e) => `entry:${e.id}`)),
  );
  assert.equal(batches.length, 1, JSON.stringify(batches));
  assert.deepEqual(m.asked(), []);
  assert.ok(!m.scripts().includes('learn_category'), 'a script\'s write started the learning rule');
  const undo = value<UndoPlan>(m.k.undoPlan({ batch: batches[0]!.batch }));
  value(m.k.undoApply({ batch: batches[0]!.batch }, undo.hash, OWNER.actor));
  for (const e of old) assert.deepEqual([m.k.get(e.id)!.fields.category ?? null, m.k.get(e.id)!.fields.filed_by ?? null], [null, null]);
});

test('a rule turned off files nothing, and turned on again files back', async () => {
  const m = await money();
  const e = m.paid('TALABAT', 3);
  const rule = talabat(m, { state: 'off' });
  await m.turn();
  assert.equal(m.k.get(e.id)!.fields.category ?? null, null);
  value(m.k.update('filing_rules', rule.id, { match_by: 'starts' }, OWNER));
  await m.turn();
  assert.equal(m.k.get(e.id)!.fields.category ?? null, null);
  assert.ok(!m.scripts().includes('file_back'), 'a rule that is off started the script');
  value(m.k.update('filing_rules', rule.id, { state: 'on' }, OWNER));
  await m.turn();
  assert.equal(m.k.get(e.id)!.fields.filed_by, rule.id, m.log.join(' | '));
});

test('file-back reads the ladder: another rule that fits better keeps its entry, two that tie file nothing, and the payee key files a bank spelling', async () => {
  const m = await money();
  const food = m.made('categories', { name: 'Food', direction: 'out', state: 'live' });
  const longer = m.paid('TALABAT MART', 3);
  const tied = m.paid('UBER EATS', 4);
  const spelt = m.paid('GEIDEA*TALABAT 0423 CAIRO EG', 5);
  m.made('filing_rules', { match: 'TALABAT MART', match_by: 'starts', reads: 'payee', direction: 'out', category: food.id, state: 'off' });
  m.made('filing_rules', { match: 'UBER', match_by: 'starts', reads: 'payee', direction: 'either', category: food.id, state: 'off' });
  await m.turn();
  value(m.k.update('filing_rules', m.rules().find((r) => r.fields.match === 'TALABAT MART')!.id, { match_by: 'contains' }, OWNER));
  m.made('filing_rules', { match: 'UBER', match_by: 'starts', reads: 'payee', direction: 'out', category: m.outing.id, state: 'off' });
  const wide = m.made('filing_rules', { match: 'TALABAT', match_by: 'starts', reads: 'payee', direction: 'out', category: m.outing.id });
  await m.turn();
  /* THE OFF RULE FOR TALABAT MART TAKES NOTHING, so the wider rule files it. */
  assert.equal(m.k.get(longer.id)!.fields.filed_by, wide.id, m.log.join(' | '));
  /* TWO UBER RULES ON ONE RUNG OF ONE LENGTH ARE A TIE once both are on, and the tie files nothing. */
  for (const r of m.rules().filter((r) => r.fields.match === 'UBER')) value(m.k.update('filing_rules', r.id, { state: 'on' }, OWNER));
  await m.turn();
  assert.equal(m.k.get(tied.id)!.fields.category ?? null, null, m.log.join(' | '));
  /* THE WHOLE TEXT BY ITS PAYEE KEY, where nothing else fits it. */
  assert.equal(m.k.get(spelt.id)!.fields.category ?? null, null);
  const whole = talabat(m, { match: 'Talabat' });
  await m.turn();
  assert.equal(m.k.get(spelt.id)!.fields.filed_by, whole.id, m.log.join(' | '));
  assert.equal(m.k.get(longer.id)!.fields.filed_by, wide.id);
});

/** Fifteen Talabat entries with no category, and the one a person files by hand. */
async function fifteen() {
  const m = await money();
  const all = Array.from({ length: 15 }, (_, i) => m.paid('TALABAT', 2 + i * 7, { payee: 'Talabat' }));
  await m.turn();
  value(m.k.update('transactions', all[0]!.id, { category: m.outing.id }, OWNER));
  await m.turn();
  return { ...m, all };
}

test('A PERSON\'S CATEGORY ON A TALABAT ENTRY ASKS ONCE, WITH THE COUNT, signed by the script and never by system', async () => {
  const m = await fifteen();
  const open = m.asked().filter((q) => q.status === 'open');
  assert.equal(open.length, 1, m.log.join(' | '));
  assert.match(open[0]!.opened_by, /^script:learn_category@v\d+$/u);
  assert.equal(open[0]!.cause, 'money.learn.talabat');
  assert.match(m.said(open[0]!.id), /File every Talabat under Outing from now on\? 14 more like it have no category\./u);
  const body = JSON.parse(open[0]!.body) as { about?: string; options: { id: string; label: string }[] };
  assert.deepEqual(body.options.map((o) => o.label), ['Yes', 'Only this one']);
  assert.equal(body.about, `transactions#${m.all[0]!.seq}`);
  /* NOTHING IS WRITTEN UNTIL YES. */
  assert.deepEqual(m.rules(), []);
  for (const e of m.all.slice(1)) assert.equal(m.k.get(e.id)!.fields.category ?? null, null);
  /* A SECOND CHANGE WHILE IT WAITS JOINS IT. */
  value(m.k.update('transactions', m.all[1]!.id, { category: m.outing.id }, OWNER));
  await m.turn();
  assert.equal(m.asked().length, 1);
  assert.ok(m.asked().every((q) => q.opened_by !== 'system'));
});

test('YES MAKES THE RULE AND FILES THE REST, each naming the rule that filed it', async () => {
  const m = await fifteen();
  const q = m.asked()[0]!;
  value(m.k.decide(q.id, { decide: { option: 'yes', reason: 'Always.' } } as never, 'p_1'));
  await m.turn(6);
  const made = m.rules();
  assert.equal(made.length, 1, m.log.join(' | '));
  assert.deepEqual(
    [made[0]!.fields.match, made[0]!.fields.match_by, made[0]!.fields.reads, made[0]!.fields.direction, made[0]!.fields.category, made[0]!.fields.state],
    ['TALABAT', 'exact', 'payee', 'out', m.outing.id, 'on'],
  );
  for (const e of m.all.slice(1)) assert.deepEqual([m.k.get(e.id)!.fields.category, m.k.get(e.id)!.fields.filed_by], [m.outing.id, made[0]!.id], m.log.join(' | '));
  /* HIS OWN ENTRY KEEPS HIS HAND: no rule is written into it. */
  assert.equal(m.k.get(m.all[0]!.id)!.fields.filed_by ?? null, null);
  /* THE 14 ARE ONE CHANGE. */
  const batches = m.sql.all<{ batch: string }>(
    "SELECT DISTINCT batch FROM event WHERE field = 'category' AND target IN (SELECT value FROM json_each(?))",
    JSON.stringify(m.all.slice(1).map((e) => `entry:${e.id}`)),
  );
  assert.equal(batches.length, 1);
  /* AND A SEVENTEENTH ARRIVAL IS FILED BY THE RULE, WITH NO QUESTION. */
  const next = m.paid('TALABAT', 1, { payee: 'Talabat' });
  await m.turn();
  assert.equal(m.k.get(next.id)!.fields.filed_by, made[0]!.id);
  assert.equal(m.asked().filter((s) => s.status === 'open').length, 0);
});

test('"ONLY THIS ONE" WRITES NOTHING, and a second change asks nothing: the cause is the memory', async () => {
  const m = await fifteen();
  const q = m.asked()[0]!;
  value(m.k.decide(q.id, { decide: { option: 'only-this-one', reason: 'Just this.' } } as never, 'p_1'));
  await m.turn();
  assert.deepEqual(m.rules(), []);
  for (const e of m.all.slice(1)) assert.equal(m.k.get(e.id)!.fields.category ?? null, null);
  value(m.k.update('transactions', m.all[2]!.id, { category: m.outing.id }, OWNER));
  await m.turn();
  assert.equal(m.asked().length, 1, 'a payee already answered was asked again');
  assert.equal(m.asked().filter((s) => s.status === 'open').length, 0);
});

test('an entry with no other like it asks without a count; a bank\'s new entry with a category asks nothing', async () => {
  const m = await money();
  const one = m.paid('KOSHARY ABOU TAREK', 2, { payee: 'Koshary Abou Tarek' });
  m.paid('ZOOBA', 3, { category: m.outing.id });
  await m.turn();
  assert.deepEqual(m.asked(), []);
  value(m.k.update('transactions', one.id, { category: m.outing.id }, OWNER));
  await m.turn();
  const open = m.asked();
  assert.equal(open.length, 1);
  assert.equal(m.said(open[0]!.id).includes('File every Koshary Abou Tarek under Outing from now on?'), true, m.said(open[0]!.id));
  assert.equal(m.said(open[0]!.id).includes('more like it'), false);
});

test('A PAYEE HE FILED THE SAME WAY THREE TIMES, AND NEVER ANOTHER, GETS ITS RULE WITHOUT A QUESTION, and Undo takes it back', async () => {
  const m = await money();
  for (let i = 0; i < 2; i++) m.paid('ZOOBA', 2 + i * 7, { payee: 'Zooba', category: m.outing.id });
  const mine = m.paid('ZOOBA', 20, { payee: 'Zooba' });
  const later = m.paid('ZOOBA', 30, { payee: 'Zooba' });
  await m.turn();
  value(m.k.update('transactions', mine.id, { category: m.outing.id }, OWNER));
  await m.turn(6);
  assert.deepEqual(m.asked(), [], 'a payee already filed the same way three times is not asked about');
  const made = m.rules();
  assert.equal(made.length, 1, m.log.join(' | '));
  assert.deepEqual([made[0]!.fields.match, made[0]!.fields.category], ['ZOOBA', m.outing.id]);
  assert.equal(m.k.get(later.id)!.fields.filed_by, made[0]!.id, 'and the rest are filed by it');
  assert.ok(m.log.some((l) => l.includes('3 times and never anywhere else')), m.log.join(' | '));
});

test('a Ledger read a page of fifty at a time still files every one of 130 entries', async () => {
  const m = await money();
  const many = Array.from({ length: 130 }, (_, i) => m.paid('TALABAT', 1 + Math.floor(i / 3)));
  /* MORE ROUNDS SINCE money-core 3.31.0: each payment also starts the match and the posted-line check, two scripts
     each, so four rounds of fifty no longer reach the filing behind them. */
  await m.turn(12);
  const rule = talabat(m);
  await m.turn(12);
  assert.equal(many.filter((e) => m.k.get(e.id)!.fields.filed_by === rule.id).length, 130, m.log.join(' | '));
  assert.ok(m.log.some((l) => l.startsWith('TALABAT filed 130 entries')), m.log.join(' | '));
});
