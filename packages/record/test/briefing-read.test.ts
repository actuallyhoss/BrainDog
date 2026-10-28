/**
 * `briefing`, the read (`src/methods/briefing.ts`): what Today opens on, answered from what the record
 * already holds. A bill late since yesterday, two questions asked in the same words and a run that left a next step are
 * three cards in that order, each with what it opens and each said by the rules; a fresh record is answered no card;
 * and a caller a list is closed to is answered no card from it.
 *
 * Through the real record on a real kernel in memory. It is worked out at the read and kept in no table.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal, Result } from '@braindog/ports';
import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods as briefingMethods } from '../src/methods/briefing.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

/** Wednesday 14 October 2026, nine in the morning, on a record that keeps UTC. */
const NOW = Date.UTC(2026, 9, 14, 9);
const HOUR = 3_600_000;

const BILLS = {
  id: 'register.bills',
  kind: 'register' as const,
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'name',
    state: 'status',
    done: ['paid'],
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'due', type: 'day', deadline: true },
      { id: 'status', type: 'enum', values: ['open', 'paid'], default: 'open' },
    ],
  } as never,
};

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** Somebody invited to Notes and nothing else: the bills and the runs are not there for them. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['notes'] };
const agent = (session: CallContext['session']): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session,
});

type Card = { h: string; line: string; row: string; cause: string | null; by: 'slash' | 'rule' };
type Brief = { cards: Card[]; at: string; basis: string };
type Api = Awaited<ReturnType<typeof createRecordApi>>;

const refusal = (out: Result<unknown>) => (out as { refusal: Refusal }).refusal;
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/**
 * `briefing` as the record answers it. Until `methods/index.ts` holds its line the method is built here over the same
 * kernel, with guards that stand in for the record's own (a level reads, a caller held to some lists reads those and
 * no question), so the gathering is run for real either way; with the line in, this is the record's own method.
 */
const briefing = (r: { api: Api; sql: ReturnType<typeof openSqlite>; clock: ReturnType<typeof fixedClock> }, ctx: CallContext): Promise<Result<Brief>> => {
  const own = (r.api as unknown as { briefing?: (a: unknown, c: CallContext) => Promise<Result<Brief>> }).briefing;
  if (typeof own === 'function') return own({}, ctx);
  const closed = (c: CallContext, register: string): Refusal | null =>
    Array.isArray(c.registers) && !c.registers.includes(register) ? { code: 'FORBIDDEN', fix: 'That list is closed to this caller.' } : null;
  const levelled = (c: CallContext): Refusal | null =>
    (c.principal as { level?: unknown }).level ? null : { code: 'FORBIDDEN', fix: 'This caller reads nothing.' };
  const deps = {
    kernel: r.api.kernel,
    sql: r.sql,
    clock: r.clock,
    guard: levelled,
    scoped: levelled,
    readable: closed,
    sightOf: (c: CallContext, target: string) => (Array.isArray(c.registers) ? null : target),
    no: (code: string, fix: string) => ({ ok: false, refusal: { code, fix } }),
  } as unknown as RecordDeps;
  return briefingMethods(deps).briefing({}, ctx) as Promise<Result<Brief>>;
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 2 * HOUR);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([BILLS, NOTES] as never));
  const add = (register: string, fields: Record<string, unknown>) => value<Entry>(api.kernel.create(register, fields as never, { actor: 'p_1' }));
  return { api, sql, clock, add };
}

/** The same words asked twice, each with its own picks, so the record holds two questions about one thing. */
const ask = (ids: [string, string]) => ({
  question: 'Which account pays the studio rent?',
  body_kind: 'options' as const,
  body: { options: [{ id: ids[0], label: 'The main one', because: 'It always has.' }, { id: ids[1], label: 'The savings one', because: 'It holds more.' }] },
});

/** A morning: a bill late since yesterday (and one paid, one far off), the same question twice, and a run that left a step. */
async function morning() {
  const r = await record();
  const rent = r.add('bills', { name: 'Studio rent', due: '2026-10-13' });
  r.add('bills', { name: 'Water', due: '2026-10-10', status: 'paid' });
  r.add('bills', { name: 'Insurance', due: '2027-03-01' });
  r.add('notes', { name: 'Call the landlord' });
  const first = value<{ id: string }>(await r.api.propose(ask(['main', 'savings']) as never, owner));
  r.clock.advance(HOUR);
  const second = value<{ id: string }>(await r.api.propose(ask(['a', 'b']) as never, owner));
  assert.notEqual(second.id, first.id, 'the two asks were joined into one question, so the record holds no two of one cause');
  const run = value<Entry>(
    await r.api.create(
      { register: 'session', fields: { client_id: 'c-1', agent: 'claude', doing: 'Kerning pass', repo: 'studio-repo', state: 'handoff', next: 'Kern the lowercase pairs' } },
      agent({}),
    ),
  );
  r.clock.set(NOW);
  return { ...r, rent, first, second, run };
}

test('A LATE BILL, ONE QUESTION ASKED TWICE AND A RUN THAT LEFT A STEP ARE THREE CARDS IN THAT ORDER, each with what it opens, said by the rules', async () => {
  const r = await morning();
  const brief = value<Brief>(await briefing(r, owner));
  assert.equal(brief.cards.length, 3, JSON.stringify(brief.cards));
  const [late, asked, step] = brief.cards as [Card, Card, Card];
  assert.equal(late.row, r.api.kernel.nameOf(r.rent.id));
  assert.equal(late.row, `bills#${String(r.rent.seq)}`);
  /* The two questions are one card, which opens the one asked first. */
  assert.equal(asked.row, `suggestion:${r.first.id}`);
  assert.equal(typeof asked.cause, 'string');
  assert.equal(step.row, r.api.kernel.nameOf(r.run.id));
  assert.deepEqual(brief.cards.map((c) => c.by), ['rule', 'rule', 'rule']);
  /* Each line is a sentence in the person's own names, and never an id. */
  assert.match(late.line, /Studio rent/);
  assert.match(asked.line, /Which account pays the studio rent\?|studio rent/);
  assert.match(step.line, /Kern the lowercase pairs/);
  for (const c of brief.cards) {
    assert.ok(c.line.trim() !== '' && !c.line.includes('—'), c.line);
    assert.doesNotMatch(c.line, /bills#|suggestion:|\bSG?\d|rec_|tok_/u, c.line);
  }
  assert.equal(brief.at, new Date(NOW).toISOString());
  assert.ok(typeof brief.basis === 'string' && brief.basis !== '');
  r.sql.close();
});

test('IT IS WORKED OUT AT THE READ AND KEPT NOWHERE: two reads agree, nothing is written, and the basis moves when the bill is paid', async () => {
  const r = await morning();
  const tables = () => r.sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((t) => t.name);
  const events = () => r.sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  const before = [tables(), events()];
  const one = value<Brief>(await briefing(r, owner));
  const two = value<Brief>(await briefing(r, owner));
  assert.deepEqual(two, one);
  assert.deepEqual([tables(), events()], before);
  value(await r.api.update({ register: 'bills', seq: r.rent.seq!, patch: { status: 'paid' } }, owner));
  const paid = value<Brief>(await briefing(r, owner));
  assert.equal(paid.cards.length, 2, JSON.stringify(paid.cards));
  assert.ok(!paid.cards.some((c) => c.row.startsWith('bills#')));
  assert.notEqual(paid.basis, one.basis);
  r.sql.close();
});

test('WHAT FALLS DUE INSIDE SEVEN DAYS IS A CARD, after what is late; a bill months off and a paid one are not', async () => {
  const r = await record();
  r.clock.set(NOW);
  const soon = r.add('bills', { name: 'Phone', due: '2026-10-17' });
  const late = r.add('bills', { name: 'Studio rent', due: '2026-10-13' });
  r.add('bills', { name: 'Insurance', due: '2026-10-22' });
  r.add('bills', { name: 'Water', due: '2026-10-15', status: 'paid' });
  const brief = value<Brief>(await briefing(r, owner));
  assert.deepEqual(brief.cards.map((c) => c.row), [`bills#${String(late.seq)}`, `bills#${String(soon.seq)}`]);
  assert.match(brief.cards[1]!.line, /Phone/);
  r.sql.close();
});

test('A FRESH RECORD IS ANSWERED NO CARD, and never a made-up one', async () => {
  const r = await record();
  r.clock.set(NOW);
  const brief = value<Brief>(await briefing(r, owner));
  assert.deepEqual(brief.cards, []);
  assert.equal(brief.at, new Date(NOW).toISOString());
  /* Nor on a record that holds rows and nothing pressing. */
  r.add('notes', { name: 'Call the landlord' });
  r.add('bills', { name: 'Insurance', due: '2027-03-01' });
  assert.deepEqual(value<Brief>(await briefing(r, owner)).cards, []);
  r.sql.close();
});

test('A CALLER A LIST IS CLOSED TO IS ANSWERED NO CARD FROM IT: no bill, no run, and no question they are not shown', async () => {
  const r = await morning();
  const brief = value<Brief>(await briefing(r, shut));
  assert.deepEqual(brief.cards, [], JSON.stringify(brief.cards));
  /* And what they are answered does not say how much they were not shown. */
  assert.equal(brief.basis, value<Brief>(await briefing(await record().then((f) => (f.clock.set(NOW), f)), shut)).basis);
  r.sql.close();
});

test('SOMEBODY WHO READS NOTHING IS REFUSED, before anything is gathered', async () => {
  const r = await morning();
  const nobody = { principal: { kind: 'person', id: 'p_9', level: null } } as unknown as CallContext;
  const out = await briefing(r, nobody);
  assert.equal(out.ok, false);
  assert.equal(typeof refusal(out).code, 'string');
  r.sql.close();
});
