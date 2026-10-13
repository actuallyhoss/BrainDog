/**
 * Money watch: the record reads the Ledger for a charge made twice and a payment that repeats, and asks once.
 *
 * BEFORE THIS ADD-ON, MEASURED: Money flagged an old balance, late money in and late bills, and nothing else looked at
 * the Ledger. Two charges of E£979.99 to Talabat on one day opened no question, and three monthly payments to Netflix
 * were never offered as a Repeating line.
 *
 * THE SHAPE, AND WHY. A script may end by asking one question, and an answer's changes are patches to rows that exist
 * (`askOf` in `packages/kernel/src/script-run.ts`): it cannot add a row, and the record tells no automation what a
 * script's question was answered with (`rules.ts`, "AN ANSWER STARTS NOTHING"). So each thing found is first a row of
 * the add-on's own list, `money_flags`. A new row there starts the script again to ask about it, the answer is a patch
 * on that row, and the patch starts the script a third time to act: add the Repeating line, and count the no's.
 * Nothing in `packages/` changed for it.
 *
 * 1.1.0, AND WHY (audit of batch 67). "One is a mistake" carried a change to the Ledger entry at the version read on
 * the day of the question, and `askOf` refuses a change with no version, so the void moved into the run the answer
 * starts, which reads the entry that day. Next on a new Repeating line is counted from the newest payment the Ledger
 * holds at the answer. And "Both real" is not a no, so the line that switches the flag off says what was said.
 *
 * RED FIRST, MEASURED: with no `twice.js` and no `money-watch.pack.json` this file failed at its first read, ENOENT,
 * before a single test ran.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkInScratch } from '../../apps/cli/src/scratch.ts';
import { readCatalogueFile, readPackFile } from '../../packages/declare/src/catalogue.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import type { CallContext } from '../../packages/record/src/index.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';
import { CASH_LEGS } from '../../packages/seed/src/modules/money/legs.ts';

const HERE = new URL('./', import.meta.url);
const TWICE = readFileSync(new URL('twice.js', HERE), 'utf8');
const REPEATS = readFileSync(new URL('repeats.js', HERE), 'utf8');
const TEXT = readFileSync(new URL('money-watch.pack.json', HERE), 'utf8');

type ScriptBody = { script: string; title: string; runs: Record<string, unknown>; egress: string[]; keys: string[]; reads: string[]; writes: string[]; source: string };
type RuleBody = { rule: string; on: { written: { register: string; op: string[]; fields?: string[] } }; steps: unknown[] };
const PACK = JSON.parse(TEXT) as {
  pack: string;
  requires: { packs: Record<string, string> };
  config: Record<string, { type: string; default: unknown; label: string; note: string }>;
  declarations: Record<string, unknown>[];
};
const scriptOf = (id: string) => PACK.declarations.find((d) => d.script === id) as unknown as ScriptBody;
const RULES = PACK.declarations.filter((d) => typeof d.rule === 'string') as unknown as RuleBody[];

/* 13 OCTOBER 2026, noon in Cairo's morning, so "the last 35 days" holds a payment of 12 October. */
const NOW = Date.UTC(2026, 9, 13, 9);
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAW';
const egp = (amount: number) => ({ amount, currency: 'EGP' });

/* ── The add-on as it ships ────────────────────────────────────────────────────────────────────── */

test('THE ADD-ON CARRIES twice.js AND repeats.js BYTE FOR BYTE, needs Money, calls nobody, and has one switch a flag', async () => {
  assert.equal(scriptOf('watch_twice').source, TWICE, 'money-watch.pack.json and twice.js disagree; copy twice.js into the source');
  assert.equal(scriptOf('watch_repeats').source, REPEATS, 'money-watch.pack.json and repeats.js disagree; copy repeats.js into the source');
  assert.deepEqual(Object.keys(PACK.requires.packs), ['money-core']);
  for (const id of ['watch_twice', 'watch_repeats']) {
    const s = scriptOf(id);
    /* A NEW CLEARED LEDGER ENTRY AND ONCE A NIGHT (REC-B21): a rule's step, and a clock of its own. */
    assert.deepEqual(s.runs, { rule: true, every: '1d' }, id);
    assert.deepEqual([s.egress, s.keys], [[], []], `${id} calls nobody`);
    assert.ok(s.reads.includes('transactions') && s.reads.includes('money_flags'), id);
  }
  /* VOIDING THE NEWER CHARGE IS A WRITE TO THE LEDGER, and adding a line is a write to Repeating. Neither script may
     write to the other's list. */
  assert.deepEqual([...scriptOf('watch_twice').writes].sort(), ['money_flags', 'transactions']);
  assert.deepEqual([...scriptOf('watch_repeats').writes].sort(), ['money_flags', 'recurring']);
  /* ONE SWITCH A FLAG, and the two that start on (REC-B21, "Needs him", the default). */
  assert.deepEqual(
    Object.entries(PACK.config).map(([key, c]) => [key, c.type, c.default, c.label]),
    [
      ['twice', 'bool', true, 'Charged twice'],
      ['repeats', 'bool', true, 'Looks like it repeats'],
    ],
  );
  /* EACH SCRIPT IS STARTED THREE WAYS: by a cleared entry, by its own new flag, and by an answer to it. */
  assert.deepEqual(
    RULES.map((r) => [r.on.written.register, r.on.written.op, r.on.written.fields ?? null, r.steps]),
    ['watch_twice', 'watch_repeats'].flatMap((id) => [
      ['transactions', ['create', 'update'], ['state'], [{ script: { id, as: 'watched' } }]],
      ['money_flags', ['create'], null, [{ script: { id, as: 'watched' } }]],
      ['money_flags', ['update'], ['said'], [{ script: { id, as: 'watched' } }]],
    ]),
  );
  const file = await readPackFile(TEXT);
  assert.ok(file.ok, fixOf(file));
  assert.equal(file.value.pack.manifest.pack, 'money-watch');
  /* NO EM DASH AND NO ID IN A WORD A PERSON READS. */
  assert.equal(/—/.test(TEXT), false, 'an em dash in the add-on');
});

/* ── A fresh record with the add-on ────────────────────────────────────────────────────────────── */

type Flag = { what: string; flag: string; payee?: string; said?: string; on?: string };
type Asked = { id: string; question: string; by: string; options: { id: string; label: string }[] };

/** A self-hosted record on 13 October 2026 with Money and the add-on installed exactly as it ships. */
async function fresh(settings?: Record<string, unknown>) {
  const { start } = await import('../../apps/selfhost/src/server.ts');
  const dir = mkdtempSync(join(tmpdir(), 'braindog-money-watch-'));
  const clock = { ms: NOW };
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    now: () => clock.ms,
    scriptClock: () => 0,
    actions: { openKey: async () => null, send: async () => new Response('{}'), resolve: async () => [] },
  });
  const person = running.directory.person$('ada@example.test', 'Ada');
  assert.ok(person.ok);
  const api = running.api;
  const owner: CallContext = { principal: { kind: 'person', id: person.value.id, level: 'owner' } };
  const said = <T>(r: unknown): T => {
    const x = r as { ok: boolean; value: T };
    assert.ok(x.ok, fixOf(x as never));
    return x.value;
  };
  assert.ok((await api.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'Africa/Cairo', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } })).ok);
  const put = async (doc: unknown) => {
    const planned = said<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner));
    said(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  };
  /* PEOPLE BEFORE MONEY, as every record has it: Money's lists point at people and organisations, and it is refused
     without them, so the organisation an entry names is always a list this add-on may read. */
  for (const id of ['portfolio', 'people', 'money-core']) await put(firstPartyDocument(id, { seeds: [] }));
  await put(PACK);
  if (settings) said(api.kernel.setPackConfig('money-watch', settings, { actor: person.value.id }));
  const settle = async () => {
    for (let i = 0; i < 4; i += 1) {
      await running.drain();
      await running.poll();
    }
  };
  const add = async (register: string, fields: Record<string, unknown>) => {
    const made = said<{ id: string; seq: number }>(await api.create({ register, fields }, owner));
    await settle();
    return made;
  };
  const rows = <T>(register: string): T[] =>
    running.sql.all<{ fields: string }>('SELECT fields FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq', register).map((r) => JSON.parse(r.fields) as T);
  /** The questions open on Decide, oldest first, each with the words it was asked in (its `suggest` event). */
  const open = (): Asked[] =>
    running.sql.all<{ id: string; opened_by: string; body: string }>("SELECT id, opened_by, body FROM suggestion WHERE status = 'open' AND body_kind = 'options' ORDER BY opened_at, id").map((s) => {
      const asked = running.sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'suggest' AND target = ?", `suggestion:${s.id}`);
      return { id: s.id, question: asked?.to_v ?? '', by: s.opened_by, options: (JSON.parse(s.body) as { options: { id: string; label: string }[] }).options };
    });
  const answer = async (id: string, option: string) => {
    said(api.kernel.decide(id, { decide: { option, reason: 'Checked against the statement.' } }, person.value.id));
    await settle();
  };
  const account = await add('accounts', { name: 'Credit Card', kind: 'card', balance: egp(-500_000), as_of: '2026-08-01', liquid: true });
  const charge = (what: string, on: string, amount: number, more: Record<string, unknown> = {}) =>
    add('transactions', { what, on, direction: 'out', amount: egp(amount), account: account.id, state: 'cleared', ...more });
  /** A day later, with whatever the night's clocks start run and settled. */
  const nextDay = async () => {
    /* A DAY AND AN HOUR, since a nightly clock is due some minutes past the day (its own spread). */
    clock.ms += 25 * 3_600_000;
    await settle();
  };
  const set = async (register: string, seq: number, patch: Record<string, unknown>) => {
    said(await api.update({ register, seq, patch }, owner));
    await settle();
  };
  const close = async () => {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { running, api, owner, said, add, set, nextDay, rows, open, answer, account, charge, close, flags: () => rows<Flag>('money_flags') };
}

/* ── Charged twice ─────────────────────────────────────────────────────────────────────────────── */

test('CHARGED TWICE: two like charges open ONE question, a third adds none, and "One is a mistake" voids the newer', async () => {
  const r = await fresh();
  try {
    const talabat = await r.add('organisations', { name: 'Talabat' });
    await r.charge('TALABAT CAIRO 4471 EG', '2026-10-07', 97_999, { party: talabat.id });
    assert.deepEqual(r.open(), [], 'one charge is not two');
    const second = await r.charge('TALABAT CAIRO 4472 EG', '2026-10-07', 97_999, { party: talabat.id });
    const asked = r.open();
    assert.deepEqual(asked.map((q) => q.question), ['Talabat E£979.99 twice on 7 Oct. Both real?']);
    assert.deepEqual(asked[0]!.options.map((o) => o.label), ['Both real', 'One is a mistake']);
    /* SIGNED BY THE RUN THAT ASKED, never by `system`, whose open questions the record reads as its own faults. */
    assert.notEqual(asked[0]!.by, 'system');
    assert.match(asked[0]!.by, /watch_twice/);

    /* A THIRD, A DAY LATER, BELONGS TO THE PAIR ALREADY ASKED ABOUT. A different amount to the same payee is no pair. */
    await r.charge('TALABAT CAIRO 4473 EG', '2026-10-08', 97_999, { party: talabat.id });
    await r.charge('TALABAT CAIRO 4474 EG', '2026-10-08', 41_500, { party: talabat.id });
    assert.equal(r.open().length, 1);
    assert.deepEqual(r.flags().map((f) => [f.what, f.flag, f.payee, f.on, f.said ?? null]), [['Talabat E£979.99 twice on 7 Oct', 'twice', 'Talabat', '2026-10-07', null]]);

    /* THE ANSWER WRITES WHAT SHE SAID, and the run it starts marks the newer of the two void. The older stands, and
       nothing else in the Ledger moved. */
    await r.answer(asked[0]!.id, 'mistake');
    assert.deepEqual(r.rows<{ state: string }>('transactions').map((t) => t.state), ['cleared', 'void', 'cleared', 'cleared']);
    assert.equal((r.api.kernel.get(second.id)?.fields as { state: string }).state, 'void');
    assert.deepEqual(r.flags().map((f) => f.said), ['mistake']);
    /* AND IT IS NOT ASKED AGAIN: the third charge now sits a day from the first, and the pair was answered. */
    assert.deepEqual(r.open(), []);
  } finally {
    await r.close();
  }
});

test('AN ENTRY EDITED AFTER THE QUESTION WAS ASKED IS STILL MARKED VOID, and one no longer cleared is left alone', async () => {
  /* RED FIRST, MEASURED on 1.0.0: "One is a mistake" carried the entry's version as read on the day of the question,
     so after one edit the answer was refused whole and the entry stayed cleared. */
  const r = await fresh();
  try {
    await r.charge('Talabat', '2026-10-07', 97_999);
    const second = await r.charge('Talabat', '2026-10-07', 97_999);
    await r.charge('Zooba', '2026-10-08', 15_000);
    const gone = await r.charge('Zooba', '2026-10-08', 15_000);
    const asked = r.open();
    assert.deepEqual(asked.map((q) => q.question), ['Talabat E£979.99 twice on 7 Oct. Both real?', 'Zooba E£150 twice on 8 Oct. Both real?']);
    /* DAYS LATER, BY HAND: one is filed, and the other she already marked void herself. */
    await r.set('transactions', second.seq, { what: 'Talabat, charged again' });
    await r.set('transactions', gone.seq, { state: 'void' });
    await r.answer(asked[0]!.id, 'mistake');
    await r.answer(asked[1]!.id, 'mistake');
    assert.deepEqual(r.rows<{ state: string }>('transactions').map((t) => t.state), ['cleared', 'void', 'cleared', 'void']);
    assert.deepEqual(r.flags().map((f) => f.said), ['mistake', 'mistake']);
    assert.deepEqual(r.open(), []);
  } finally {
    await r.close();
  }
});

test('CHARGED TWICE READS THE BANK\'S WORDS when an entry names no organisation, and never a move between own accounts', async () => {
  const r = await fresh();
  try {
    await r.charge('GEIDEA*CHILLOUT 0418 CAIRO EG', '2026-10-05', 12_000, { counterparty_text: 'GEIDEA*CHILLOUT 0418 CAIRO EG' });
    await r.charge('GEIDEA*CHILLOUT 0423 CAIRO EG', '2026-10-07', 12_000, { counterparty_text: 'GEIDEA*CHILLOUT 0423 CAIRO EG' });
    assert.deepEqual(r.open().map((q) => q.question), ['Chillout E£120 on 5 Oct and again on 7 Oct. Both real?']);
    await r.charge('To savings', '2026-10-09', 500_000, { transfer: true });
    await r.charge('To savings', '2026-10-09', 500_000, { transfer: true });
    /* THREE DAYS APART IS TWO CHARGES. */
    await r.charge('Metro card', '2026-10-01', 4_000);
    await r.charge('Metro card', '2026-10-04', 4_000);
    assert.equal(r.open().length, 1);
  } finally {
    await r.close();
  }
});

/* ── Looks like it repeats ─────────────────────────────────────────────────────────────────────── */

test('LOOKS LIKE IT REPEATS: three payments a month apart open one offer, and yes adds a Repeating line the walk carries', async () => {
  const r = await fresh();
  try {
    const subs = await r.add('categories', { name: 'Subscriptions', direction: 'out' });
    await r.charge('NETFLIX.COM', '2026-08-12', 19_900, { counterparty_text: 'NETFLIX.COM', category: subs.id });
    await r.charge('NETFLIX.COM', '2026-09-13', 21_900, { counterparty_text: 'NETFLIX.COM', category: subs.id });
    assert.deepEqual(r.open(), [], 'two payments are not three');
    await r.charge('NETFLIX.COM', '2026-10-12', 21_900, { counterparty_text: 'NETFLIX.COM', category: subs.id });
    const asked = r.open();
    assert.deepEqual(asked.map((q) => q.question), ['Add Netflix to Repeating, E£219 around the 12th?']);
    assert.deepEqual(asked[0]!.options.map((o) => o.label), ['Yes, add it', 'No']);
    assert.notEqual(asked[0]!.by, 'system');
    assert.deepEqual(r.rows('recurring'), [], 'a line was written before anybody said yes');

    await r.answer(asked[0]!.id, 'yes');
    type Line = { what: string; direction: string; amount: { amount: number; currency: string }; every: string; next_due: string; day_of_month: string; account: string; category: string; state: string };
    const lines = r.rows<Line>('recurring');
    assert.deepEqual(
      lines.map((l) => [l.what, l.direction, l.amount, l.every, l.next_due, l.day_of_month, l.account, l.category, l.state]),
      [['Netflix', 'out', egp(21_900), 'monthly', '2026-11-12', '12', r.account.id, subs.id, 'live']],
    );
    /* THE WALK CARRIES IT: Money's own legs over the next hundred days step on the 12th of each month. */
    const walk = r.api.kernel.runway(1_000_000, CASH_LEGS, 100);
    assert.ok(walk.ok, JSON.stringify(walk));
    assert.deepEqual(walk.value.steps.map((s) => s.day), ['2026-11-12', '2026-12-12', '2027-01-12']);

    /* ASKED ONCE A PAYEE: a fourth payment offers nothing, and no second line is ever written. */
    await r.charge('NETFLIX.COM', '2026-10-13', 21_900, { counterparty_text: 'NETFLIX.COM' });
    await r.nextDay();
    assert.deepEqual(r.open().map((q) => q.question), ['Netflix E£219 on 12 Oct and again on 13 Oct. Both real?']);
    assert.equal(r.rows('recurring').length, 1);
  } finally {
    await r.close();
  }
});

test('A YES GIVEN AFTER THE NEXT PAYMENT CAME writes Next one month after that payment, never the day it was paid', async () => {
  /* RED FIRST, MEASURED on 1.0.0: Next was 13 October, the day October's payment already sat in the Ledger, so the new
     line waited for a payment it had and was past its day within the week. */
  const r = await fresh();
  try {
    for (const on of ['2026-07-14', '2026-08-13', '2026-09-13']) await r.charge('NETFLIX.COM', on, 21_900, { counterparty_text: 'NETFLIX.COM' });
    const asked = r.open();
    assert.deepEqual(asked.map((q) => q.question), ['Add Netflix to Repeating, E£219 around the 13th?']);
    /* OCTOBER'S COMES WHILE THE QUESTION WAITS, a little dearer and with the bank's own reference on it. */
    await r.charge('NETFLIX.COM 8841', '2026-10-13', 22_900, { counterparty_text: 'NETFLIX.COM 8841' });
    await r.answer(asked[0]!.id, 'yes');
    assert.deepEqual(r.rows<{ what: string; next_due: string; day_of_month: string; amount: unknown }>('recurring').map((l) => [l.what, l.next_due, l.day_of_month, l.amount]), [['Netflix', '2026-11-13', '13', egp(21_900)]]);
  } finally {
    await r.close();
  }
});

test('NOT A MONTH APART, OR NOT WITHIN A TENTH, IS NO OFFER; and a payee with a live line is not offered', async () => {
  const r = await fresh();
  try {
    /* FORTNIGHTLY. */
    for (const on of ['2026-09-14', '2026-09-28', '2026-10-12']) await r.charge('Gym', on, 30_000);
    /* MONTHLY, AND THE AMOUNT MOVES BY A THIRD. */
    for (const [on, amount] of [['2026-08-10', 20_000], ['2026-09-10', 30_000], ['2026-10-10', 40_000]] as const) await r.charge('Electricity', on, amount);
    /* MONTHLY AND STEADY, AND ALREADY IN REPEATING. */
    await r.add('recurring', { what: 'Rent', direction: 'out', amount: egp(900_000), every: 'monthly', next_due: '2026-11-01', state: 'live' });
    for (const on of ['2026-08-01', '2026-09-01', '2026-10-01']) await r.charge('Rent', on, 900_000);
    await r.nextDay();
    assert.deepEqual(r.open(), []);
    assert.deepEqual(r.flags(), []);
  } finally {
    await r.close();
  }
});

/* ── Quiet ─────────────────────────────────────────────────────────────────────────────────────── */

test('QUIET: a flag declined three times in a row switches itself off with one line, and is switched on again in Money watch', async () => {
  const r = await fresh();
  try {
    const pair = async (what: string, on: string) => {
      await r.charge(what, on, 15_000);
      await r.charge(what, on, 15_000);
    };
    /* "BOTH REAL" IS NOT A NO, so the line says what she said (1.0.0 said "after three no's"). */
    const OFF = 'Charged twice was switched off after both charges were real three times in a row. Switch it on again in Money watch.';
    /* TWO NO'S, A MISTAKE, THEN TWO NO'S: never three in a row, so it is still on. */
    for (const [what, on, said] of [['Cilantro', '2026-10-01', 'real'], ['Costa', '2026-10-02', 'real'], ['Zooba', '2026-10-03', 'mistake'], ['Paul', '2026-10-04', 'real'], ['Eish', '2026-10-05', 'real']] as const) {
      await pair(what, on);
      const asked = r.open();
      assert.equal(asked.length, 1, what);
      await r.answer(asked[0]!.id, said);
    }
    assert.equal(r.flags().some((f) => f.said === 'off'), false, 'switched off before three in a row');

    /* THE THIRD IN A ROW. One line says so, once, and the next pair asks nothing. */
    await pair('Brown Nose', '2026-10-06');
    await r.answer(r.open()[0]!.id, 'real');
    assert.deepEqual(r.flags().filter((f) => f.said === 'off').map((f) => [f.what, f.flag]), [[OFF, 'twice']]);
    await pair('Dukes', '2026-10-07');
    await r.nextDay();
    assert.deepEqual(r.open(), []);
    assert.equal(r.flags().filter((f) => f.what === OFF).length, 1, 'said more than once');
    /* THE OTHER FLAG IS STILL ON: each has its own count. */
    for (const on of ['2026-08-14', '2026-09-14', '2026-10-14']) await r.charge('SPOTIFY', on, 9_900);
    assert.deepEqual(r.open().map((q) => q.question), ['Add Spotify to Repeating, E£99 around the 14th?']);
    await r.answer(r.open()[0]!.id, 'no');
    assert.deepEqual(r.rows('recurring'), []);

    /* SWITCHED ON AGAIN, in Money watch: the line is changed, and the pair it passed over last night is asked about. */
    const line = r.running.sql.one<{ seq: number }>("SELECT seq FROM entry WHERE register = 'money_flags' AND json_extract(fields, '$.said') = 'off'");
    assert.ok(line);
    await r.set('money_flags', line.seq, { said: 'on' });
    await r.nextDay();
    assert.deepEqual(r.open().map((q) => q.question), ['Dukes E£150 twice on 7 Oct. Both real?']);
    /* AND THE OLD NO'S ARE NOT COUNTED AGAIN: one more no does not switch it off. */
    await r.answer(r.open()[0]!.id, 'real');
    assert.equal(r.flags().filter((f) => f.said === 'off').length, 0);
  } finally {
    await r.close();
  }
});

/* ── The switches, and a record without People ─────────────────────────────────────────────────── */

test('A FLAG SWITCHED OFF IN THE SETTINGS LOOKS AT NOTHING, and switched on, the nightly look finds what it passed over', async () => {
  const r = await fresh({ twice: false, repeats: false });
  try {
    await r.charge('Talabat', '2026-10-07', 97_999);
    await r.charge('Talabat', '2026-10-07', 97_999);
    for (const on of ['2026-08-12', '2026-09-12', '2026-10-12']) await r.charge('Netflix', on, 21_900);
    await r.nextDay();
    assert.deepEqual([r.open(), r.flags()], [[], []]);
    r.said(r.api.kernel.setPackConfig('money-watch', { twice: true }, { actor: 'p_1' }));
    await r.nextDay();
    assert.deepEqual(r.open().map((q) => q.question), ['Talabat E£979.99 twice on 7 Oct. Both real?']);
  } finally {
    await r.close();
  }
});

test('IT CHECKS AS braindog pack check CHECKS IT: installed in a scratch record, its page drawn, and no warning', async () => {
  const read = await readCatalogueFile(TEXT);
  if (!read.ok) assert.fail('refusal' in read ? `${read.refusal.code}: ${read.refusal.fix}` : 'money-watch.pack.json did not read.');
  const checked = await checkInScratch(read.value, false, NOW);
  assert.ok(checked.ok, checked.lines.join('\n'));
  assert.deepEqual(checked.lines.filter((line) => line.includes('Warning')), []);
});
