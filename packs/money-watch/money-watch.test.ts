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
 * STILL 1.1.0, NOT YET RELEASED (audit of batch 71, finding 7). "Both real" was remembered for good, which hid a real
 * double charge a year on, and three of them in a row about any three payees switched the watch off for everyone. It
 * is remembered for about ninety days, and the three in a row are one payee's and switch off that payee alone.
 *
 * 1.2.0, AND WHY (audit of batch 73, the payee cut, here for the two scripts' own reading). A bank line that leads
 * with the card and the terminal, `HSBC CARD 7731 POS 55 KFC`, was read up to the card's number, so every shop paid
 * with that card was the one payee "Hsbc Card". The lead is cut and each shop is its own payee. 1.1.0 is published,
 * so this is a version above it and that file is not touched.
 *
 * 1.3.0, AND WHY (audit of batch 75, claim 7). The name still stopped at the first word holding a digit, so
 * `Studio 54 Cafe` read "Studio" and two shops that start alike were one payee, and `CARD 1234 5678 NETFLIX` read
 * "5678 Netflix". A word ends the name only when it holds three digits or more, and every group of the card's number
 * goes with the card. 1.2.0 is published, so this is a version above it.
 *
 * STILL 1.3.0, NOT YET RELEASED (audit of batch 77, claim 3). A day the bank wrote after the payee, `SPOTIFY 12 OCT`,
 * stayed in the name as a short number does, so each month was a payee of its own and nothing ever repeated. A number
 * of one or two digits ends the name when a month or a day with a stroke follows it, and a day with a stroke ends it
 * itself. The live catalogue held no Money watch on 14 October 2026, so 1.3.0 is changed in place.
 *
 * STILL 1.3.0 (batch 81's left). A day joined to its month, `12OCT` and `12-OCT`, and a month before its day,
 * `OCT 12`, stayed in the name too, so those banks' charges were a new payee each month. Both end the name now.
 * Whether 1.3.0 is released by then is the integrator's to check on the live catalogue before it ships.
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
  /* ABOVE 1.1.0, which the catalogue holds and which is never changed in place. */
  assert.equal((PACK as { version?: string }).version, '1.3.1');
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

test('THE CARD AND THE TERMINAL ARE NOT THE PAYEE: KFC and Carrefour on one card are two payees, and each is asked about by its own name', async () => {
  /* RED FIRST, MEASURED on 1.1.0: `HSBC CARD 7731 POS 55 KFC` read "Hsbc Card", the name stopped at the card's
     number, so every shop paid with that card was one payee. KFC and Carrefour at E£120 on one day opened "Hsbc Card
     E£120 twice on 5 Oct. Both real?", and "Both real" about it silenced the card's every shop at that amount. */
  const r = await fresh();
  try {
    const paid = (words: string, on: string, amount: number) => r.charge(words, on, amount, { counterparty_text: words });
    await paid('HSBC CARD 7731 POS 55 KFC', '2026-10-05', 12_000);
    await paid('HSBC CARD 7731 POS 55 CARREFOUR', '2026-10-05', 12_000);
    assert.deepEqual(r.open(), [], 'two shops on one card are not one charge made twice');
    await paid('HSBC CARD 7731 POS 55 KFC', '2026-10-06', 12_000);
    assert.deepEqual(r.open().map((q) => q.question), ['Kfc E£120 on 5 Oct and again on 6 Oct. Both real?']);
    /* THE SAME SHOP IS ONE PAYEE HOWEVER THE BANK LED INTO IT: with the terminal and without, the card masked or not. */
    await paid('CARD XX7731 CARREFOUR', '2026-10-06', 12_000);
    assert.deepEqual(r.open().map((q) => q.question).sort(), ['Carrefour E£120 on 5 Oct and again on 6 Oct. Both real?', 'Kfc E£120 on 5 Oct and again on 6 Oct. Both real?']);
    assert.deepEqual(r.flags().map((f) => f.payee).sort(), ['Carrefour', 'Kfc']);
    /* A NUMBER THAT IS THE SHOP'S OWN NAME STAYS, and a card that was bought is not a card that paid. */
    await paid('POS 7 ELEVEN', '2026-10-08', 3_000);
    await paid('POS 7 ELEVEN', '2026-10-08', 3_000);
    await paid('GIFT CARD 1234 SHOP', '2026-10-09', 50_000);
    await paid('GIFT CARD 1234 SHOP', '2026-10-09', 50_000);
    assert.deepEqual(r.flags().map((f) => f.payee).sort(), ['7 Eleven', 'Carrefour', 'Gift Card', 'Kfc']);
  } finally {
    await r.close();
  }
});

test('"BOTH REAL" IS REMEMBERED: the same payee, account and amount is not asked about again weeks on, and a mistake silences nobody', async () => {
  /* RED FIRST, MEASURED on 1.1.0 before the change: an answer was remembered only within two days of its pair, so the
     pair of 6 Oct opened "Cilantro E£150 twice on 6 Oct. Both real?" three weeks after she had said both were real. */
  const r = await fresh();
  try {
    const pair = async (what: string, on: string, amount: number, more: Record<string, unknown> = {}) => {
      await r.charge(what, on, amount, more);
      await r.charge(what, on, amount, more);
    };
    /* TWO COFFEES A MORNING, and she says so once. */
    await pair('Cilantro', '2026-09-15', 15_000);
    assert.deepEqual(r.open().map((q) => q.question), ['Cilantro E£150 twice on 15 Sep. Both real?']);
    await r.answer(r.open()[0]!.id, 'real');
    /* THREE WEEKS ON, THE SAME THREE: nothing is asked and no line is written, that day or on the nightly look. */
    await pair('Cilantro', '2026-10-06', 15_000);
    await r.nextDay();
    assert.deepEqual(r.open(), []);
    assert.deepEqual(r.flags().map((f) => [f.what, f.said ?? null]), [['Cilantro E£150 twice on 15 Sep', 'real']]);

    /* A DIFFERENT AMOUNT TO THE SAME PAYEE IS ASKED, and so is the same amount from another account. */
    await pair('Cilantro', '2026-10-08', 22_500);
    assert.deepEqual(r.open().map((q) => q.question), ['Cilantro E£225 twice on 8 Oct. Both real?']);
    await r.answer(r.open()[0]!.id, 'mistake');
    const debit = await r.add('accounts', { name: 'Debit Card', kind: 'card', balance: egp(900_000), as_of: '2026-08-01', liquid: true });
    await pair('Cilantro', '2026-10-09', 15_000, { account: debit.id });
    assert.deepEqual(r.open().map((q) => q.question), ['Cilantro E£150 twice on 9 Oct. Both real?']);
    await r.answer(r.open()[0]!.id, 'mistake');

    /* "ONE IS A MISTAKE" SILENCES NOBODY: the next pair of that payee, account and amount is asked about. */
    await pair('Cilantro', '2026-10-12', 22_500);
    assert.deepEqual(r.open().map((q) => q.question), ['Cilantro E£225 twice on 12 Oct. Both real?']);
  } finally {
    await r.close();
  }
});

test('"BOTH REAL" IS REMEMBERED FOR ABOUT NINETY DAYS: a pair inside them is passed over, one after them is asked about again', async () => {
  /* RED FIRST, MEASURED before the change (audit of batch 71, finding 7): the answer was remembered for good, so the
     pair of 6 Oct opened nothing, fourteen weeks after she had said both were real, and a charge made twice by
     mistake a year on would never have been asked about. */
  const r = await fresh();
  try {
    const pair = async (on: string) => {
      await r.charge('Cilantro', on, 15_000);
      await r.charge('Cilantro', on, 15_000);
    };
    await pair('2026-07-01');
    assert.deepEqual(r.open().map((q) => q.question), ['Cilantro E£150 twice on 1 Jul. Both real?']);
    await r.answer(r.open()[0]!.id, 'real');
    /* EIGHTY-ONE DAYS ON: still remembered, nothing asked and no line written. */
    await pair('2026-09-20');
    assert.deepEqual([r.open(), r.flags().length], [[], 1]);
    /* NINETY-SEVEN DAYS ON: asked again, in the same words as the first time. */
    await pair('2026-10-06');
    assert.deepEqual(r.open().map((q) => q.question), ['Cilantro E£150 twice on 6 Oct. Both real?']);
    /* SAID AGAIN, REMEMBERED AGAIN, counted from the pair she answered about. */
    await r.answer(r.open()[0]!.id, 'real');
    await pair('2026-10-10');
    await r.nextDay();
    assert.deepEqual(r.open(), []);
    assert.deepEqual(r.flags().map((f) => [f.on, f.said ?? null]), [['2026-07-01', 'real'], ['2026-10-06', 'real']]);
  } finally {
    await r.close();
  }
});

test('THREE IN A ROW IS COUNTED A PAYEE: three payees said to be real switch nothing off, and a pair passed over is not an answer', async () => {
  /* RED FIRST, MEASURED before the change: the third "Both real" in a row switched the whole flag off whoever it was
     about, so Cilantro, Costa and Paul, once each, ended the watch on every payee. */
  const r = await fresh();
  try {
    const pair = async (what: string, on: string, amount = 15_000) => {
      await r.charge(what, on, amount);
      await r.charge(what, on, amount);
    };
    const OFF = 'Charged twice was switched off for Cilantro after both charges were real three times in a row. Switch it on again in Money watch.';
    for (const [what, on, amount] of [['Cilantro', '2026-09-15', 15_000], ['Costa', '2026-09-18', 15_000], ['Paul', '2026-09-20', 15_000], ['Cilantro', '2026-09-21', 22_500]] as const) {
      await pair(what, on, amount);
      await r.answer(r.open()[0]!.id, 'real');
    }
    /* FOUR IN A ROW OVER THREE PAYEES, two of them Cilantro's: still on for everyone. */
    assert.equal(r.flags().some((f) => f.said === 'off'), false, 'switched off by answers about other payees');
    /* THEN CILANTRO'S E£150 three times more: remembered, so no question and no answer, and still two for Cilantro. */
    for (const on of ['2026-09-22', '2026-09-29', '2026-10-06']) await pair('Cilantro', on);
    assert.deepEqual(r.open(), []);
    assert.equal(r.flags().length, 4);
    /* CILANTRO'S THIRD ANSWER switches it off for Cilantro, and the line names who. */
    await pair('Cilantro', '2026-10-08', 30_000);
    await r.answer(r.open()[0]!.id, 'real');
    assert.deepEqual(r.flags().filter((f) => f.said === 'off').map((f) => [f.what, f.flag, f.payee]), [[OFF, 'twice', 'Cilantro']]);
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
    /* AND MONEY'S OWN MONTHLY BUDGET OFFER, which the next day's run asks of September's Subscriptions
       (`packages/seed/src/modules/money/scripts/offer-budgets.js`): Money's question, not this add-on's. */
    assert.deepEqual(r.open().map((q) => q.question), ['Netflix E£219 on 12 Oct and again on 13 Oct. Both real?', 'Give Subscriptions a budget of EGP 250 a month?']);
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

test('LOOKS LIKE IT REPEATS READS THE SHOP TOO: three shops a month apart on one card are no offer, and Netflix paid by card is offered as Netflix', async () => {
  /* RED FIRST, MEASURED on 1.1.0: every shop on the card was one payee, and the night's look asked "Add Hsbc Card to
     Repeating, E£219 around the 12th?". */
  const r = await fresh();
  try {
    const paid = (words: string, on: string, amount: number) => r.charge(words, on, amount, { counterparty_text: words });
    await paid('HSBC CARD 7731 POS 55 KFC', '2026-08-10', 30_000);
    await paid('HSBC CARD 7731 POS 61 CARREFOUR', '2026-09-10', 30_000);
    await paid('HSBC CARD 7731 POS 70 ZARA', '2026-10-10', 30_000);
    for (const on of ['2026-08-12', '2026-09-12', '2026-10-12']) await paid('HSBC CARD 7731 POS 88 NETFLIX', on, 21_900);
    await r.nextDay();
    assert.deepEqual(r.open().map((q) => q.question), ['Add Netflix to Repeating, E£219 around the 12th?']);
  } finally {
    await r.close();
  }
});

test('A SHORT NUMBER IN A SHOP\'S NAME IS THE SHOP\'S: Studio 54 Cafe and Studio 54 Bar are two payees, and a card number in groups names no shop', async () => {
  /* RED FIRST, MEASURED on the published 1.2.0 (its `fromWords`, read out of the catalogue's file): `Studio 54 Cafe`
     and `Studio 54 Bar` both read { key: 'words:studio', name: 'Studio' }, so the two at E£120 on one day were one
     charge made twice, and `CARD 1234 5678 NETFLIX` read "5678 Netflix". */
  const r = await fresh();
  try {
    const paid = (words: string, on: string, amount: number) => r.charge(words, on, amount, { counterparty_text: words });
    await paid('Studio 54 Cafe', '2026-10-05', 12_000);
    await paid('Studio 54 Bar', '2026-10-05', 12_000);
    assert.deepEqual(r.open(), [], 'two shops that start alike are not one charge made twice');
    await paid('Studio 54 Cafe', '2026-10-06', 12_000);
    assert.deepEqual(r.open().map((q) => q.question), ['Studio 54 Cafe E£120 on 5 Oct and again on 6 Oct. Both real?']);
    /* EVERY GROUP OF THE CARD'S NUMBER GOES WITH THE CARD, masked or not, so one shop is one payee however it was led into. */
    await paid('CARD 1234 5678 NETFLIX', '2026-10-08', 21_900);
    await paid('CARD XXXX XXXX XXXX 7731 NETFLIX', '2026-10-08', 21_900);
    assert.deepEqual(r.flags().map((f) => f.payee).sort(), ['Netflix', 'Studio 54 Cafe']);
    /* A LONGER NUMBER STILL ENDS THE NAME: a branch and a day are not the shop. */
    await paid('GEIDEA*CHILLOUT 0418 CAIRO EG', '2026-10-10', 9_000);
    await paid('GEIDEA*CHILLOUT 12/10 CAIRO EG', '2026-10-10', 9_000);
    assert.deepEqual(r.flags().map((f) => f.payee).sort(), ['Chillout', 'Netflix', 'Studio 54 Cafe']);
  } finally {
    await r.close();
  }
});

test('A DAY THE BANK WROTE AFTER THE PAYEE IS NOT ITS NAME: SPOTIFY 12 OCT and SPOTIFY 12 NOV are one payee, and a short number with no month after it stays', async () => {
  /* RED FIRST, MEASURED on 1.3.0 as batch 77 left it: `SPOTIFY 12 OCT` read { key: 'words:spotify12oct', name:
     'Spotify 12 Oct' }, so the two charges below were two payees and no question opened. */
  const r = await fresh();
  try {
    const paid = (words: string, on: string, amount: number) => r.charge(words, on, amount, { counterparty_text: words });
    await paid('SPOTIFY 12 OCT', '2026-10-12', 9_900);
    await paid('SPOTIFY 12 OCT', '2026-10-12', 9_900);
    assert.deepEqual(r.open().map((q) => q.question), ['Spotify E£99 twice on 12 Oct. Both real?']);
    assert.deepEqual(r.flags().map((f) => f.payee), ['Spotify']);
    /* THE WHOLE MONTH, A YEAR AFTER IT, AND A DAY WITH A STROKE, however short, are the same payee. */
    await paid('NETFLIX 9 October 2026', '2026-10-09', 21_900);
    await paid('NETFLIX 9/10', '2026-10-09', 21_900);
    await paid('ANGHAMI 5/9', '2026-10-05', 4_900);
    await paid('ANGHAMI 5 9/26', '2026-10-05', 4_900);
    assert.deepEqual(r.flags().map((f) => f.payee).sort(), ['Anghami', 'Netflix', 'Spotify']);
    /* A SHORT NUMBER WITH NO MONTH AFTER IT IS STILL THE SHOP'S, as 1.3.0 read it: a branch is not told from a name,
       and a word that only starts like a month (Marina) is no month. */
    await paid('KFC 12 CAIRO', '2026-10-06', 12_000);
    await paid('KFC 14 CAIRO', '2026-10-06', 12_000);
    await paid('Studio 54 Cafe', '2026-10-07', 12_000);
    await paid('Studio 54 Bar', '2026-10-07', 12_000);
    await paid('Cafe 5 Marina', '2026-10-08', 12_000);
    await paid('Cafe 5 Maadi', '2026-10-08', 12_000);
    assert.deepEqual(r.flags().map((f) => f.payee).sort(), ['Anghami', 'Netflix', 'Spotify'], 'no two of these six are one payee');
    await paid('KFC 12 CAIRO', '2026-10-07', 12_000);
    assert.deepEqual(r.flags().map((f) => f.payee).sort(), ['Anghami', 'Kfc 12 Cairo', 'Netflix', 'Spotify']);
  } finally {
    await r.close();
  }
});

test('LOOKS LIKE IT REPEATS READS THE SAME PAYEE EVERY MONTH: three months of SPOTIFY with the day after it are one offer, by the name alone', async () => {
  /* RED FIRST, MEASURED as above: the three were "Spotify 12 Aug", "Spotify 12 Sep" and "Spotify 12 Oct", three
     payees paid once each, so nothing was offered. */
  const r = await fresh();
  try {
    const paid = (words: string, on: string, amount: number) => r.charge(words, on, amount, { counterparty_text: words });
    await paid('SPOTIFY 12 AUG', '2026-08-12', 9_900);
    await paid('SPOTIFY 12 SEP', '2026-09-12', 9_900);
    await paid('SPOTIFY 12 OCT', '2026-10-12', 9_900);
    await r.nextDay();
    assert.deepEqual(r.open().map((q) => q.question), ['Add Spotify to Repeating, E£99 around the 12th?']);
  } finally {
    await r.close();
  }
});

test('A DAY JOINED TO ITS MONTH, OR WRITTEN AFTER IT, IS NOT THE NAME EITHER: SPOTIFY 12OCT, SPOTIFY 12-OCT and SPOTIFY OCT 12 are one payee, and Marina and Mayfair are no month', async () => {
  /* RED FIRST, MEASURED on 1.3.0 as batch 81 left it (the files copied aside before the edit): `SPOTIFY 12OCT` read
     { key: 'words:spotify12oct', name: 'Spotify 12oct' }, `SPOTIFY 12-OCT` "Spotify 12-Oct" and `SPOTIFY OCT 12`
     { key: 'words:spotifyoct12', name: 'Spotify Oct 12' }, so a charge was a new payee each month. */
  const r = await fresh();
  try {
    const paid = (words: string, on: string, amount: number) => r.charge(words, on, amount, { counterparty_text: words });
    await paid('SPOTIFY 12OCT', '2026-10-12', 9_900);
    await paid('SPOTIFY 12-OCT', '2026-10-12', 9_900);
    assert.deepEqual(r.open().map((q) => q.question), ['Spotify E£99 twice on 12 Oct. Both real?']);
    assert.deepEqual(r.flags().map((f) => f.payee), ['Spotify']);
    /* THE MONTH FIRST, with a stop or a comma and a year after it, is the same payee as the day first. */
    await paid('NETFLIX OCT 9', '2026-10-09', 21_900);
    await paid('NETFLIX 9 OCT', '2026-10-09', 21_900);
    await paid('ANGHAMI October 5, 2026', '2026-10-05', 4_900);
    await paid('ANGHAMI 5-Oct.', '2026-10-05', 4_900);
    assert.deepEqual(r.flags().map((f) => f.payee).sort(), ['Anghami', 'Netflix', 'Spotify']);
    /* A SHORT NUMBER THAT IS THE SHOP'S STAYS, and a word that only starts like a month is no month: with a number
       after it (Marina 5, Mayfair 12) or joined to one (12Marina), each pair is two payees. */
    await paid('Studio 54 Cafe', '2026-10-07', 12_000);
    await paid('Studio 54 Bar', '2026-10-07', 12_000);
    await paid('Cafe Marina 5', '2026-10-08', 12_000);
    await paid('Cafe Marina 6', '2026-10-08', 12_000);
    await paid('Mayfair 12', '2026-10-08', 13_000);
    await paid('Mayfair 14', '2026-10-08', 13_000);
    await paid('Cafe 12Marina', '2026-10-08', 14_000);
    await paid('Cafe 14Marina', '2026-10-08', 14_000);
    assert.deepEqual(r.flags().map((f) => f.payee).sort(), ['Anghami', 'Netflix', 'Spotify'], 'no two of these eight are one payee');
    await paid('Studio 54 Cafe', '2026-10-08', 12_000);
    await paid('Mayfair 12', '2026-10-09', 13_000);
    assert.deepEqual(r.flags().map((f) => f.payee).sort(), ['Anghami', 'Mayfair 12', 'Netflix', 'Spotify', 'Studio 54 Cafe']);
  } finally {
    await r.close();
  }
});

test('LOOKS LIKE IT REPEATS READS THE SAME PAYEE HOWEVER THE DAY IS WRITTEN: SPOTIFY 12AUG, SPOTIFY 12-SEP and SPOTIFY OCT 12 are one offer', async () => {
  /* RED FIRST, MEASURED as above: the three were "Spotify 12aug", "Spotify 12-Sep" and "Spotify Oct 12", three
     payees paid once each, so nothing was offered. */
  const r = await fresh();
  try {
    const paid = (words: string, on: string, amount: number) => r.charge(words, on, amount, { counterparty_text: words });
    await paid('SPOTIFY 12AUG', '2026-08-12', 9_900);
    await paid('SPOTIFY 12-SEP', '2026-09-12', 9_900);
    await paid('SPOTIFY OCT 12', '2026-10-12', 9_900);
    await r.nextDay();
    assert.deepEqual(r.open().map((q) => q.question), ['Add Spotify to Repeating, E£99 around the 12th?']);
  } finally {
    await r.close();
  }
});

test('LOOKS LIKE IT REPEATS KEEPS THE SHORT NUMBER TOO: two shops that start alike are no offer, and the one that repeats is offered by its whole name', async () => {
  /* RED FIRST, MEASURED as above: on 1.2.0 the three shops below were the one payee "Studio". */
  const r = await fresh();
  try {
    const paid = (words: string, on: string, amount: number) => r.charge(words, on, amount, { counterparty_text: words });
    await paid('Studio 54 Bar', '2026-08-10', 30_000);
    await paid('Studio 21 Gym', '2026-09-10', 30_000);
    await paid('Studio 7 Dance', '2026-10-10', 30_000);
    for (const on of ['2026-08-12', '2026-09-12', '2026-10-12']) await paid('Studio 54 Cafe', on, 21_900);
    await r.nextDay();
    assert.deepEqual(r.open().map((q) => q.question), ['Add Studio 54 Cafe to Repeating, E£219 around the 12th?']);
  } finally {
    await r.close();
  }
});

/* ── Quiet ─────────────────────────────────────────────────────────────────────────────────────── */

test('QUIET: three of "Both real" in a row about one payee switch Charged twice off for that payee with one line, and it is switched on again in Money watch', async () => {
  const r = await fresh();
  try {
    const pair = async (what: string, on: string, amount: number) => {
      await r.charge(what, on, amount);
      await r.charge(what, on, amount);
    };
    /* "BOTH REAL" IS NOT A NO, so the line says what she said (1.0.0 said "after three no's"), and about whom. */
    const OFF = 'Charged twice was switched off for Cilantro after both charges were real three times in a row. Switch it on again in Money watch.';
    /* TWO REAL, A MISTAKE, THEN TWO REAL, each a different amount: never three in a row, so it is still on. */
    for (const [on, amount, said] of [['2026-10-01', 10_000, 'real'], ['2026-10-02', 11_000, 'real'], ['2026-10-03', 12_000, 'mistake'], ['2026-10-04', 13_000, 'real'], ['2026-10-05', 14_000, 'real']] as const) {
      await pair('Cilantro', on, amount);
      const asked = r.open();
      assert.equal(asked.length, 1, on);
      await r.answer(asked[0]!.id, said);
    }
    assert.equal(r.flags().some((f) => f.said === 'off'), false, 'switched off before three in a row');

    /* THE THIRD IN A ROW. One line says so, once, and the next pair of Cilantro's asks nothing. */
    await pair('Cilantro', '2026-10-06', 15_000);
    await r.answer(r.open()[0]!.id, 'real');
    assert.deepEqual(r.flags().filter((f) => f.said === 'off').map((f) => [f.what, f.flag, f.payee]), [[OFF, 'twice', 'Cilantro']]);
    await pair('Cilantro', '2026-10-07', 16_000);
    await r.nextDay();
    assert.deepEqual(r.open(), []);
    assert.equal(r.flags().filter((f) => f.what === OFF).length, 1, 'said more than once');
    /* EVERY OTHER PAYEE IS STILL WATCHED: a charge made twice by somebody else is asked about. */
    await pair('Dukes', '2026-10-07', 15_000);
    assert.deepEqual(r.open().map((q) => q.question), ['Dukes E£150 twice on 7 Oct. Both real?']);
    await r.answer(r.open()[0]!.id, 'mistake');
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
    assert.deepEqual(r.open().map((q) => q.question), ['Cilantro E£160 twice on 7 Oct. Both real?']);
    /* AND THE OLD ANSWERS ARE NOT COUNTED AGAIN: one more "Both real" does not switch it off. */
    await r.answer(r.open()[0]!.id, 'real');
    assert.equal(r.flags().filter((f) => f.said === 'off').length, 0);
  } finally {
    await r.close();
  }
});

test('A LINE THAT SWITCHED THE WHOLE FLAG OFF, written before the count was a payee\'s, still holds until it is switched on again', async () => {
  const r = await fresh();
  try {
    /* AS 1.0.0 AND THE FIRST 1.1.0 WROTE IT: no payee on the line, and it was told to her as the whole flag. */
    const old = await r.add('money_flags', { what: 'Charged twice was switched off after both charges were real three times in a row. Switch it on again in Money watch.', flag: 'twice', said: 'off', found: '2026-10-01' });
    await r.charge('Talabat', '2026-10-07', 97_999);
    await r.charge('Talabat', '2026-10-07', 97_999);
    await r.nextDay();
    assert.deepEqual(r.open(), []);
    await r.set('money_flags', old.seq, { said: 'on' });
    await r.nextDay();
    assert.deepEqual(r.open().map((q) => q.question), ['Talabat E£979.99 twice on 7 Oct. Both real?']);
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
