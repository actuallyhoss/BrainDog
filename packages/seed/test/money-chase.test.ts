/**
 * What "Chase it" leaves on a late invoice (REC-B22 step 1): the day, a note, and a message ready to send.
 *
 * IT LEFT THE DAY AND THE NOTE AND NOTHING TO SEND, so a person who chose to chase still had the whole message to
 * write. The draft is the invoice's own amount and due day in one plain sentence, kept in `chase_draft` ("Draft to
 * send"), written once and never over words somebody changed. A template can write it since batch 74:
 * `{{short:amount}}` is `EGP 12,000` and `{{on:due}}` is `30 Oct` (`packages/kernel/test/rules-fill-forms.test.ts`).
 * The currency is its code, never a sign: the kernel holds no sign for a currency an add-on has not declared.
 *
 * MONEY SHIPS BOTH SINCE 3.17.0: Bills and invoices declares `chase_draft` (`lists/obligations.ts`) and `rules.ts`
 * adds the step only while the list holds the field, since a step that writes a field its list does not hold stops
 * the add-on from installing. `withDraft` below would lay the two on a document without them, both as `rules.ts`
 * exports them, and changes nothing now that Money ships them. THE LAST TEST reads the document as shipped.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { fillTemplate, openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { firstPartyDocument } from '../src/index.ts';
import { CHASE_DRAFT, CHASE_DRAFT_FIELD, CHASE_DRAFT_LEFT, CHASE_DRAFT_STEPS, MONEY_AUTOMATIONS } from '../src/modules/money/rules.ts';

type Fields = Record<string, unknown>;
type Question = { id: string; opened_by?: string; body?: { about?: string; options?: { id: string; label: string }[] } };
const OWNER = { actor: 'p_1' };
/** Eleven days after the invoice's due day, so `invoice-late` (more than a week) asks the moment the row is written. */
const NOW = Date.UTC(2026, 10, 10, 12);
const DUE = '2026-10-30';
const egp = (minor: number) => ({ amount: minor, currency: 'EGP' });
const DRAFT = 'The invoice for EGP 12,000 was due on 30 Oct. Could you tell me when it will be paid?';
/** What a part-paid invoice is chased with: EGP 4,500 of the 12,000 is in, so the draft names the 7,500 left. */
const DRAFT_LEFT = 'The invoice for EGP 12,000 was due on 30 Oct, and EGP 7,500 of it is still to pay. Could you tell me when the rest will be paid?';
const PART = { state: 'part', paid_so_far: egp(450_000) };

type Decl = { register?: string; rule?: string; fields?: { id: string }[]; steps?: unknown[] };
const declared = (doc: unknown): Decl[] => (doc as { declarations: Decl[] }).declarations;
const invoices = (doc: unknown): Decl => declared(doc).find((d) => d.register === 'obligations')!;
const chasing = (doc: unknown): Decl => declared(doc).find((d) => d.rule === 'invoice-chased')!;
const holdsDraft = (doc: unknown): boolean => invoices(doc).fields!.some((f) => f.id === CHASE_DRAFT_FIELD.id);

/** Money's document with "Draft to send" and the steps that write it, laid on only where Money does not ship them. */
const withDraft = (doc: unknown): unknown => {
  if (holdsDraft(doc)) return doc;
  const copy = structuredClone(doc);
  const fields = invoices(copy).fields!;
  fields.splice(fields.findIndex((f) => f.id === 'chased') + 1, 0, { ...CHASE_DRAFT_FIELD });
  chasing(copy).steps!.push(...structuredClone(CHASE_DRAFT_STEPS));
  return copy;
};

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
    const pack = value<Pack>(await normalise(id === 'money-core' ? withDraft(firstPartyDocument(id, { seeds: [] })) : firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
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

test('a template writes the amount and the day in a message\'s forms, and the older forms still write the record\'s', async () => {
  const m = await money();
  const late = m.invoice();
  assert.equal(fillTemplate('{{short:amount}}', late, NOW), 'EGP 12,000');
  assert.equal(fillTemplate('{{on:due}}', late, NOW), '30 Oct');
  assert.equal(fillTemplate(CHASE_DRAFT, late, NOW), DRAFT);
  /* WHAT THE DRAFT WAITED ON: every older form of these two fields, unchanged for the pages and notes that use them. */
  assert.equal(fillTemplate('{{amount}}', late, NOW), 'EGP 12,000.00');
  assert.equal(fillTemplate('{{money:amount}}', late, NOW), 'EGP 12,000.00');
  assert.equal(fillTemplate('{{due}}', late, NOW), DUE);
  assert.equal(fillTemplate('{{ago:due}}', late, NOW), '11 days ago');
  m.sql.close();
});

test('after "Chase it" the invoice holds a draft made from its own amount and due day', async () => {
  const m = await money();
  const chased = await m.chase(m.invoice());
  assert.equal(chased.fields.chase_draft, DRAFT);
  m.sql.close();
});

test('an invoice with nobody named on it still gets a draft that reads whole', async () => {
  const m = await money();
  const person = m.made('people', { name: 'Layla Hassan' });
  for (const row of [m.invoice(), m.invoice({ what: 'Poster run', party: person.id })]) {
    const draft = (await m.chase(row)).fields.chase_draft;
    assert.equal(typeof draft, 'string', `${String(row.fields.what)} has no draft`);
    /* NO HOLE, NO BRACE LEFT AS TYPED, NO ID: the dash is what a template writes for a field that holds nothing. */
    assert.doesNotMatch(draft as string, /—|\{\{|\}\}|[0-9A-HJKMNP-TV-Z]{26}|obligations#|people#/u);
    assert.match(draft as string, /EGP 12,000/u);
    assert.match(draft as string, /30 Oct/u);
  }
  m.sql.close();
});

test('the draft is never blank, whatever the invoice leaves empty', async () => {
  const m = await money();
  /* The least an invoice can hold: its four required fields and its status. No note, no project, no person. */
  const draft = (await m.chase(m.invoice({ what: 'x' }))).fields.chase_draft;
  assert.equal(typeof draft, 'string');
  assert.ok((draft as string).trim().length > 40, `the draft is "${String(draft)}"`);
  m.sql.close();
});

test('chasing again leaves a draft somebody changed as they left it', async () => {
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

test('a second chase with the draft cleared writes it again from the new due day', async () => {
  const m = await money();
  const late = m.invoice();
  await m.chase(late);
  value(m.k.update('obligations', late.id, { chase_draft: null, due: '2026-10-31' }, OWNER));
  const again = await m.chase(late);
  assert.equal(again.fields.chase_draft, DRAFT.replace('30 Oct', '31 Oct'));
  m.sql.close();
});

test('a part-paid invoice is chased for what is left of it, in the same breath as the whole', async () => {
  const m = await money();
  const part = m.invoice(PART);
  assert.equal(fillTemplate(CHASE_DRAFT_LEFT, part, NOW), DRAFT_LEFT);
  const chased = await m.chase(part);
  assert.equal(chased.fields.chase_draft, DRAFT_LEFT);
  assert.equal(chased.fields.chased, '2026-11-10');
  m.sql.close();
});

test('an invoice nothing is paid on keeps the draft it has always had, beside a part-paid one', async () => {
  const m = await money();
  const open = m.invoice();
  await m.chase(m.invoice({ what: 'Poster run', ...PART }));
  assert.equal((await m.chase(open)).fields.chase_draft, DRAFT);
  m.sql.close();
});

test('a part-paid invoice that does not say what was paid is chased for the whole, never for a hole', async () => {
  const m = await money();
  const draft = (await m.chase(m.invoice({ state: 'part' }))).fields.chase_draft;
  assert.equal(draft, DRAFT);
  m.sql.close();
});

test('a draft somebody changed on a part-paid invoice is kept, and a cleared one is written from what is left now', async () => {
  const m = await money();
  const part = m.invoice(PART);
  await m.chase(part);
  const mine = 'Hello Layla, thank you for the first payment. Could you send the rest this week?';
  value(m.k.update('obligations', part.id, { chase_draft: mine, due: '2026-10-31' }, OWNER));
  assert.equal((await m.chase(part)).fields.chase_draft, mine, 'the second chase wrote over the words somebody chose');
  /* MORE CAME IN AND THE DRAFT WAS CLEARED: the next chase counts from what is paid by then. */
  value(m.k.update('obligations', part.id, { chase_draft: null, due: '2026-11-01', paid_so_far: egp(900_000) }, OWNER));
  assert.equal((await m.chase(part)).fields.chase_draft, DRAFT_LEFT.replace('30 Oct', '1 Nov').replace('EGP 7,500', 'EGP 3,000'));
  m.sql.close();
});

test('Money as it ships declares "Draft to send" and its rule writes it', () => {
  const doc = firstPartyDocument('money-core', { seeds: [] });
  assert.ok(holdsDraft(doc), 'Bills and invoices has no chase_draft');
  assert.deepEqual(chasing(doc).steps!.slice(-CHASE_DRAFT_STEPS.length), CHASE_DRAFT_STEPS);
  assert.equal(withDraft(doc), doc, 'the test still lays the draft on a document that ships it');
});
