/**
 * `inboxHints`: what each arrival waiting in the Inbox is and who it is from (`src/methods/inbox-hints.ts`), worked out
 * by rules when the Inbox is read and stored nowhere.
 *
 * On a real record: a list of people and a list of organisations, each holding keys, and arrivals stored as `arrive`
 * stores them. A bank's text with an amount reads as a payment with the amount in its own currency, a mail from
 * somebody the record keeps reads as them writing under the record's name for them, a text the rules cannot read
 * says nothing, and a caller the Inbox is closed to is answered nothing at all. Nothing is written by any of it.
 *
 * The method is called through `methods(deps)` so the file is green before `methods/index.ts` lists it; the last test
 * calls it through the record and skips until it does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal, type Result } from '@braindog/ports';
import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, INBOX_HINTS_MOST, type InboxHints } from '../src/methods/inbox-hints.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { BANKS, CARD_TAILS, COMPANIES, DOMAINS, PEOPLE } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 14, 12);

const register = (body: Record<string, unknown>) => ({ id: `register.${body.id as string}`, kind: 'register' as const, body: body as never });

const CONTACTS = register({
  id: 'contacts',
  name: 'Contacts',
  title: 'name',
  meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'email', type: 'email', unique: true, index: true },
    { id: 'met', type: 'list', of: 'text' },
    { id: 'merged_into', type: 'ref', to: 'contacts' },
  ],
});

const COMPANY_LIST = register({
  id: 'companies',
  name: 'Companies',
  title: 'name',
  org: { name: 'name', keys: 'keys', merged_into: 'merged_into' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'keys', type: 'list', of: 'text' },
    { id: 'merged_into', type: 'ref', to: 'companies' },
  ],
});

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** A member who reads every list, and to whom the Inbox is still closed: it is the owner's. */
const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' } };
/** An owner's token with no `inbox` reach, and one with it. */
const token: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' } as never };
const reaching: CallContext = { principal: { kind: 'token', id: 'tok_2', scope: 'read', person: 'p_1', level: 'owner', reach: ['inbox'] } as never };
/** An owner held to one list, who does not read the whole record. */
const narrowed: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, registers: ['companies'] };

const TEO = PEOPLE[2]!;
const BANK = BANKS[0];
const SHOP = COMPANIES[3];
const SHOP_SITE = DOMAINS[3];

/** The arrivals, by the id each is stored under. */
const RAW = {
  bank: '01JZ8QK3F7R2M9V4XN6TCBRAW1',
  site: '01JZ8QK3F7R2M9V4XN6TCBRAW2',
  teo: '01JZ8QK3F7R2M9V4XN6TCBRAW3',
  stranger: '01JZ8QK3F7R2M9V4XN6TCBRAW4',
  plain: '01JZ8QK3F7R2M9V4XN6TCBRAW5',
  erased: '01JZ8QK3F7R2M9V4XN6TCBRAW6',
} as const;

const value = <T>(out: Result<T>): T => {
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};
const refusal = (out: Result<unknown>) => (out as { refusal: Refusal }).refusal;

/** The ladder as the record holds it, for the two needs this method asks: `read` is any level that reads, `owner` an owner. */
const guard = (ctx: CallContext, need: string): Refusal | null => {
  const p = ctx.principal as { kind: string; level?: string | null };
  if (p.kind === 'system') return null;
  if (need === 'owner') return p.kind === 'person' && p.level === 'owner' ? null : { code: 'FORBIDDEN', fix: 'This needs owner.' };
  return p.level === null || p.level === undefined ? { code: 'FORBIDDEN', fix: 'This needs read.' } : null;
};

async function harness() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([CONTACTS, COMPANY_LIST] as never));
  const add = (list: string, fields: Record<string, unknown>) => value<Entry>(api.kernel.create(list, fields as never, { actor: 'p_1' }));
  add('contacts', { name: TEO.name, email: TEO.email });
  add('companies', { name: SHOP, keys: [`domain:${SHOP_SITE}`] });

  const arrive = (id: string, channel: string, headers: Record<string, string>, body: string, state = 'untriaged') =>
    sql.exec(
      'INSERT INTO inbox_raw (id, ts, channel, headers, body, sha256, state) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id,
      new Date(NOW - 60_000).toISOString(),
      channel,
      JSON.stringify(headers),
      body,
      `sha-${id}`,
      state,
    );
  arrive(RAW.bank, 'webhook', { from: BANK }, `Your card ending ${CARD_TAILS[0]} was charged EGP 450.00 on 14/10. Available balance EGP 12,300.50.`);
  arrive(RAW.site, 'webhook', {}, `Card ${CARD_TAILS[1]}: USD 12.00 paid to ${SHOP_SITE} today.`, 'review');
  arrive(RAW.teo, 'email', { from: `"T. Vance" <${TEO.email}>`, subject: 'The proofs' }, 'They look right to me.');
  arrive(RAW.stranger, 'email', { from: 'hello@pellucid.example', subject: 'A quick hello' }, 'Are you free on Friday?');
  arrive(RAW.plain, 'api', {}, 'see you at the gate');
  arrive(RAW.erased, 'api', {}, 'gone', 'erased');

  /* WHO WAS MARKED AS HAVING READ WORDS ANYBODY COULD HAVE WRITTEN, and where (`RecordDeps.untrusted`). */
  const marks: [string, string][] = [];
  const deps = {
    untrusted: (ctx: CallContext, where: string) => void marks.push([ctx.principal.id, where]),
    kernel: api.kernel,
    sql,
    guard,
    scoped: (ctx: CallContext) => guard(ctx, 'read'),
    readable: (ctx: CallContext, list: string) => (ctx.registers === undefined || ctx.registers === '*' || ctx.registers.includes(list) ? null : { code: 'FORBIDDEN', fix: 'Not yours.' }),
    no,
    tail: async <T>(o: T) => o,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  const inboxHints = (args: unknown, ctx: CallContext = owner) => methods(deps).inboxHints(args as never, ctx);
  return { sql, api, inboxHints, marks };
}

const one = (out: InboxHints, id: string) => out.hints.find((h) => h.id === id);

test('A BANK TEXT WITH AN AMOUNT IS A PAYMENT, with the first amount in the currency it was written in and never two added', async () => {
  const { inboxHints } = await harness();
  const out = value(await inboxHints({ ids: [RAW.bank] }));
  assert.deepEqual(out.hints, [{ id: RAW.bank, what: 'payment', who: BANK, amount: 'EGP 450.00' }]);
});

test('A PAYMENT WHOSE SENDER NAMES NOBODY IS FROM THE COMPANY ITS OWN WORDS HOLD A KEY OF, by the record’s name for it', async () => {
  const { inboxHints } = await harness();
  const out = value(await inboxHints({ ids: [RAW.site] }));
  assert.deepEqual(out.hints, [{ id: RAW.site, what: 'payment', who: SHOP, amount: 'USD 12.00' }]);
});

test('A MAIL FROM SOMEBODY THE RECORD KEEPS IS THEM WRITING, under the record’s name and not the one the mail gave', async () => {
  const { inboxHints } = await harness();
  const out = value(await inboxHints({ ids: [RAW.teo] }));
  assert.deepEqual(out.hints, [{ id: RAW.teo, what: 'someone writing', who: TEO.name, amount: null }]);
});

test('A MAIL FROM AN ADDRESS NOBODY HOLDS IS SOMEONE WRITING, and the address is never shown as a name', async () => {
  const { inboxHints } = await harness();
  const out = value(await inboxHints({ ids: [RAW.stranger] }));
  assert.deepEqual(out.hints, [{ id: RAW.stranger, what: 'someone writing', who: null, amount: null }]);
});

test('A TEXT THE RULES CANNOT READ SAYS NOTHING, rather than a guess', async () => {
  const { inboxHints } = await harness();
  const out = value(await inboxHints({ ids: [RAW.plain] }));
  assert.deepEqual(out.hints, [{ id: RAW.plain, what: null, who: null, amount: null }]);
});

test('IN THE ORDER ASKED, ONCE EACH, and an id that is no arrival, or an erased one, is left out in silence', async () => {
  const { inboxHints } = await harness();
  const out = value(await inboxHints({ ids: [RAW.plain, 'nothing-by-this', RAW.teo, RAW.erased, RAW.plain, RAW.bank] }));
  assert.deepEqual(out.hints.map((h) => h.id), [RAW.plain, RAW.teo, RAW.bank]);
  assert.deepEqual(value(await inboxHints({ ids: [] })), { hints: [] });
});

test('A CALLER THE INBOX IS CLOSED TO HEARS NOTHING: a member, an owner’s token without the reach, an owner held to one list', async () => {
  const { inboxHints } = await harness();
  const all = Object.values(RAW);
  for (const ctx of [member, token, narrowed]) assert.deepEqual(value(await inboxHints({ ids: all }, ctx)), { hints: [] }, ctx.principal.id);
  /* THE REACH IS THE ONE WAY PAST owner, as it is for the Inbox itself. */
  assert.equal(value(await inboxHints({ ids: all }, reaching)).hints.length, 5);
});

test('A SENDER\'S OWN NAME IS WORDS ANYBODY COULD HAVE WRITTEN: a hint that says one marks its reader as the Inbox does, and the record\'s own name marks nobody', async () => {
  const { inboxHints, marks } = await harness();
  value(await inboxHints({ ids: [RAW.teo, RAW.stranger, RAW.plain] }, reaching));
  assert.deepEqual(marks, [], 'a hint in the record\'s own words marked its reader');
  value(await inboxHints({ ids: [RAW.bank] }, reaching));
  assert.deepEqual(marks, [['tok_2', 'the inbox']]);
  /* A CALLER WHO WAS TOLD NOTHING READ NOTHING. */
  value(await inboxHints({ ids: [RAW.bank] }, token));
  assert.equal(marks.length, 1);
});

test('IDS IS A LIST OF TEXT, FIFTY AT MOST, and nothing else is taken', async () => {
  const { inboxHints } = await harness();
  assert.equal(refusal(await inboxHints({ ids: RAW.bank })).at, 'ids');
  assert.equal(refusal(await inboxHints({ ids: [1] })).code, 'VALUE_MALFORMED');
  assert.equal(refusal(await inboxHints(undefined)).at, 'ids');
  const many = Array.from({ length: INBOX_HINTS_MOST + 1 }, (_, i) => `id-${i}`);
  assert.equal(refusal(await inboxHints({ ids: many })).code, 'VALUE_MALFORMED');
  assert.equal(value(await inboxHints({ ids: many.slice(0, INBOX_HINTS_MOST) })).hints.length, 0);
  assert.equal(refusal(await inboxHints({ ids: [], state: 'review' })).at, 'state');
});

test('IT WRITES NOTHING: no line in the log, no arrival moved, no row made', async () => {
  const { sql, inboxHints } = await harness();
  const snapshot = () => ({
    events: sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')?.n,
    entries: sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM entry')?.n,
    inbox: sql.all('SELECT id, state, reason FROM inbox_raw ORDER BY id'),
  });
  const before = snapshot();
  for (const ctx of [owner, reaching, member]) await inboxHints({ ids: Object.values(RAW) }, ctx);
  assert.deepEqual(snapshot(), before);
});

test('THROUGH THE RECORD ITSELF, once methods/index.ts lists inboxHints', async (t) => {
  const { api } = await harness();
  const method = (api as unknown as { inboxHints?: (a: unknown, c: CallContext) => Promise<Result<InboxHints>> }).inboxHints;
  if (typeof method !== 'function') return t.skip('inboxHints is not registered in methods/index.ts yet (blocked to the integrator)');
  const out = value(await method({ ids: [RAW.bank, RAW.teo] }, owner));
  assert.deepEqual(out.hints.map((h) => [h.what, h.who]), [['payment', BANK], ['someone writing', TEO.name]]);
  assert.deepEqual(value(await method({ ids: [RAW.bank] }, member)), { hints: [] });
});
