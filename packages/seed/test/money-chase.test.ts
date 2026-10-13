/**
 * What "Chase it" leaves on a late invoice (REC-B22 step 1): the day, a note, and a message ready to send.
 *
 * TODAY IT LEAVES THE DAY AND THE NOTE AND NOTHING TO SEND. `invoice-chased` in `MONEY_AUTOMATIONS` sets "Chasing
 * since" and writes one note, so a person who chose to chase still has the whole message to write. The draft is to be
 * the invoice's own amount and due day in one plain sentence, kept in `chase_draft` ("Draft to send"), written once
 * and never over words somebody changed.
 *
 * THE FOUR TESTS OF THE DRAFT ARE `todo`, AND THE THIRD TEST HERE SAYS WHY. A rule's `set` fills a template, and a
 * template writes money as `EGP 12,000.00` (the kernel's `moneyText`: code first, every decimal) and a day as
 * `2026-10-30` or `11 days ago` (`rowValue` in `packages/kernel/src/rules.ts`). Neither is what goes in a message to a
 * client, which is `E£12,000` and `30 Oct`. So the field and the step wait on a form a template can ask for, and the
 * `todo`s turn over the day it has one. They fail now, on a list with no `chase_draft`, without turning the suite red.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { fillTemplate, openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { firstPartyDocument } from '../src/index.ts';
import { MONEY_AUTOMATIONS } from '../src/modules/money/rules.ts';

type Fields = Record<string, unknown>;
type Question = { id: string; opened_by?: string; body?: { about?: string; options?: { id: string; label: string }[] } };
const OWNER = { actor: 'p_1' };
/** Eleven days after the invoice's due day, so `invoice-late` (more than a week) asks the moment the row is written. */
const NOW = Date.UTC(2026, 10, 10, 12);
const DUE = '2026-10-30';
const egp = (minor: number) => ({ amount: minor, currency: 'EGP' });
const DRAFT = 'The invoice for E£12,000 was due on 30 Oct. Could you tell me when it will be paid?';
const TEMPLATE_WAITS = 'a rule template writes EGP 12,000.00 and 2026-10-30, and the draft needs E£12,000 and 30 Oct';

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

/** A record holding Money as its pack document says it, with one way to write an invoice and one to answer about it. */
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
  const invoice = (more: Fields = {}) => made('obligations', { what: 'Brand film, second half', direction: 'owed_to_me', amount: egp(1_200_000), due: DUE, state: 'open', ...more });
  const now = (row: Entry): Entry => k.get(row.id)!;
  /** The open "Chase it?" about this invoice, by the handle the question carries. */
  const asked = (row: Entry): Question => {
    const open = value<Question[]>(k.governance('suggestion', { status: 'open' })).filter((q) => q.body?.about === `obligations#${row.seq}`);
    assert.equal(open.length, 1, `${open.length} open questions about ${String(row.fields.what)}, and one was expected`);
    return open[0]!;
  };
  /** Pick "Chase it" and let the run it starts reach its steps. */
  const chase = async (row: Entry) => {
    const q = asked(row);
    const picked = q.body!.options!.find((o) => o.label === 'Chase it');
    assert.ok(picked, `"Chase it" is not an answer of ${JSON.stringify(q.body?.options?.map((o) => o.label))}`);
    value(k.decide(q.id, { decide: { option: picked.id, reason: 'It is late.' } }, 'p_1'));
    await k.drain();
    return now(row);
  };
  return { k, sql, made, invoice, now, asked, chase };
}

/** The notes a rule left on a row, oldest first. */
const notes = (m: Awaited<ReturnType<typeof money>>, row: Entry): string[] =>
  m.sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = 'rule:invoice-chased' AND target = ? ORDER BY rowid", `entry:${row.id}`).map((r) => r.note);

test('a late invoice is asked about, and "Chase it" writes the day it was chosen and says why', async () => {
  const m = await money();
  const late = m.invoice();
  const chased = await m.chase(late);
  assert.equal(chased.fields.chased, '2026-11-10', 'the day somebody chose to chase is not on the invoice');
  assert.deepEqual(notes(m, late), ['You chose to chase this in Decide.']);
  m.sql.close();
});

test('the rule that answers "Chase it" is the one Money ships, and it names the question by its words', () => {
  const rule = MONEY_AUTOMATIONS.find((r) => r.rule === 'invoice-chased');
  assert.ok(rule, 'Money ships no invoice-chased');
  assert.deepEqual(rule.on, { decided: { about: 'rule.invoice-late', option: 'Chase it' } });
});

test('WHY THE DRAFT WAITS: a template writes the amount and the day in the record\'s forms, not a message\'s', async () => {
  const m = await money();
  const late = m.invoice();
  /* EVERY FORM A TEMPLATE HAS FOR THESE TWO FIELDS. The day this stops holding, a template can write the draft. */
  assert.equal(fillTemplate('{{amount}}', late, NOW), 'EGP 12,000.00');
  assert.equal(fillTemplate('{{money:amount}}', late, NOW), 'EGP 12,000.00');
  assert.equal(fillTemplate('{{due}}', late, NOW), DUE);
  assert.equal(fillTemplate('{{ago:due}}', late, NOW), '11 days ago');
  /* AND A FORM IT DOES NOT KNOW IS THE BARE VALUE, so `{{day:due}}` is no way round it. */
  assert.equal(fillTemplate('{{day:due}}', late, NOW), DUE);
  m.sql.close();
});

test('after "Chase it" the invoice holds a draft made from its own amount and due day', { todo: TEMPLATE_WAITS }, async () => {
  const m = await money();
  const chased = await m.chase(m.invoice());
  assert.equal(chased.fields.chase_draft, DRAFT);
  m.sql.close();
});

test('an invoice with nobody named on it still gets a draft that reads whole', { todo: TEMPLATE_WAITS }, async () => {
  const m = await money();
  const person = m.made('people', { name: 'Layla Hassan' });
  for (const row of [m.invoice(), m.invoice({ what: 'Poster run', party: person.id })]) {
    const draft = (await m.chase(row)).fields.chase_draft;
    assert.equal(typeof draft, 'string', `${String(row.fields.what)} has no draft`);
    /* NO HOLE, NO BRACE LEFT AS TYPED, NO ID: the dash is what a template writes for a field that holds nothing. */
    assert.doesNotMatch(draft as string, /—|\{\{|\}\}|[0-9A-HJKMNP-TV-Z]{26}|obligations#|people#/u);
    assert.match(draft as string, /E£12,000/u);
    assert.match(draft as string, /30 Oct/u);
  }
  m.sql.close();
});

test('the draft is never blank, whatever the invoice leaves empty', { todo: TEMPLATE_WAITS }, async () => {
  const m = await money();
  /* The least an invoice can hold: its four required fields and its status. No note, no project, no person. */
  const draft = (await m.chase(m.invoice({ what: 'x' }))).fields.chase_draft;
  assert.equal(typeof draft, 'string');
  assert.ok((draft as string).trim().length > 40, `the draft is "${String(draft)}"`);
  m.sql.close();
});

test('chasing again leaves a draft somebody changed as they left it', { todo: TEMPLATE_WAITS }, async () => {
  const m = await money();
  const late = m.invoice();
  await m.chase(late);
  const mine = 'Hello Layla, the second half is still open. Could you send it this week?';
  value(m.k.update('obligations', late.id, { chase_draft: mine }, OWNER));
  /* A NEW DUE DAY, STILL MORE THAN A WEEK GONE, is asked about again (`once_per: [entry, due]`). */
  value(m.k.update('obligations', late.id, { due: '2026-10-31' }, OWNER));
  const again = await m.chase(late);
  assert.equal(again.fields.chase_draft, mine, 'the second chase wrote over the words somebody chose');
  m.sql.close();
});
