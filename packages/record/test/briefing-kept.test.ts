/**
 * `briefing`, the read, once a model's answer is kept (`src/methods/briefing.ts`, ENG-B12: "The read `briefing` answers
 * ... by", with the said fallback). The write (`src/brief-write.ts`) keeps what a model answered as one pref of the
 * model's own holder; this read asks no model. What is held here: the kept cards are answered in the model's order with
 * their holes filled from the record, only while their basis is the caller's own, and when the rules speak in a model's
 * place the read says why in a sentence.
 *
 * Through the real record on a real kernel in memory, as `briefing-read.test.ts` builds one. No model is asked: the
 * kept answer is written straight into the pref, as the write would leave it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SLASH } from '@braindog/kernel';
import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { BRIEF_KEPT, type KeptBrief } from '../src/brief-write.ts';
import { briefFactsFor } from '../src/methods/briefing.ts';
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

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** Somebody on the record who reads the bills and not the runs: one list less than the owner. */
const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' }, registers: ['bills'] };
const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' }, session: {} };

type Card = { h: string; line: string; row: string; cause: string | null; by: 'slash' | 'rule' };
type Brief = { cards: Card[]; at: string; basis: string; said: string | null };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** The same words asked twice, each with its own picks, so the record holds two questions of one cause. */
const ask = (ids: [string, string]) => ({
  question: 'Which account pays the studio rent?',
  body_kind: 'options' as const,
  body: { options: [{ id: ids[0], label: 'The main one', because: 'It always has.' }, { id: ids[1], label: 'The savings one', because: 'It holds more.' }] },
});

/** A morning: a bill late since yesterday, the same question twice, and a run that left a next step. */
async function morning() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 2 * HOUR);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([BILLS] as never));
  const rent = value<Entry>(api.kernel.create('bills', { name: 'Studio rent', due: '2026-10-13' } as never, { actor: 'p_1' }));
  value(await api.propose(ask(['main', 'savings']) as never, owner));
  clock.advance(HOUR);
  value(await api.propose(ask(['a', 'b']) as never, owner));
  value(
    await api.create(
      { register: 'session', fields: { client_id: 'c-1', agent: 'claude', doing: 'Kerning pass', repo: 'studio-repo', state: 'handoff', next: 'Kern the lowercase pairs' } },
      agent,
    ),
  );
  clock.set(NOW);
  const read = async (ctx: CallContext = owner) => value<Brief>(await api.briefing({}, ctx));
  /** What the write leaves: one pref of the model's holder, with the basis its cards were written from. */
  const keep = (kept: Pick<KeptBrief, 'basis' | 'cards' | 'said'>) =>
    api.kernel.setPref(SLASH, BRIEF_KEPT, { day: '2026-10-14', slot: SLOT, at: new Date(NOW - HOUR).toISOString(), ...kept } satisfies KeptBrief);
  return { api, sql, clock, rent, read, keep };
}

/** The slot the morning's write falls in: after 08:00 and before 17:00. */
const SLOT: KeptBrief['slot'] = 1;

/** The rules' three cards by what each is about, so a kept answer can name them by the handles the read handed out. */
const three = (brief: Brief) => {
  assert.equal(brief.cards.length, 3, JSON.stringify(brief.cards));
  const [late, asked, step] = brief.cards as [Card, Card, Card];
  assert.match(late.row, /^bills#/u);
  assert.match(asked.row, /^suggestion:/u);
  return { late, asked, step };
};

/** The model's order, the step first and the late bill last, in lines of its own that leave a hole for each number. */
const written = (c: { late: Card; asked: Card; step: Card }) => [
  { h: c.step.h, line: 'Kerning pass stopped partway, and what it left is {{next}}.' },
  { h: c.asked.h, line: 'Still waiting on you, asked {{count}} times over: Which account pays the studio rent?' },
  { h: c.late.h, line: 'Studio rent slipped {{days}} day past its date.' },
];

test('WITH NOTHING KEPT THE ANSWER IS AS IT WAS: three cards said by the rules, and nothing said about why', async () => {
  const r = await morning();
  const brief = await r.read();
  three(brief);
  assert.deepEqual(brief.cards.map((c) => c.by), ['rule', 'rule', 'rule']);
  assert.equal(brief.said, null);
  assert.equal(brief.at, new Date(NOW).toISOString());
  r.sql.close();
});

test("A KEPT ANSWER FOR THE OWNER'S OWN BASIS IS ANSWERED IN THE MODEL'S ORDER, by slash, its holes filled from the record", async () => {
  const r = await morning();
  const rules = await r.read();
  const c = three(rules);
  const events = () => r.sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  r.keep({ basis: rules.basis, cards: written(c), said: null });
  const before = [events(), JSON.stringify(r.api.kernel.prefsOf(SLASH))];
  const brief = await r.read();
  assert.deepEqual(brief.cards.map((x) => x.h), [c.step.h, c.asked.h, c.late.h]);
  assert.deepEqual(brief.cards.map((x) => x.by), ['slash', 'slash', 'slash']);
  /* Each card still opens what the record says it opens: the model named a handle and nothing else. */
  assert.deepEqual(brief.cards.map((x) => [x.row, x.cause]), [c.step, c.asked, c.late].map((x) => [x.row, x.cause]));
  assert.deepEqual(brief.cards.map((x) => x.line), [
    'Kerning pass stopped partway, and what it left is Kern the lowercase pairs.',
    'Still waiting on you, asked 2 times over: Which account pays the studio rent?',
    'Studio rent slipped 1 day past its date.',
  ]);
  assert.equal(brief.said, null);
  assert.equal(brief.basis, rules.basis);
  /* The read asked nothing and wrote nothing: a second one agrees, and the record holds what it held. */
  assert.deepEqual(await r.read(), brief);
  assert.deepEqual([events(), JSON.stringify(r.api.kernel.prefsOf(SLASH))], before);
  assert.equal(typeof briefFactsFor, 'function');
  r.sql.close();
});

test('A KEPT CARD NAMING SOMETHING THE CALLER WAS NOT HANDED IS LEFT OUT, and the rest stand', async () => {
  const r = await morning();
  const rules = await r.read();
  const c = three(rules);
  const [step, asked, late] = written(c) as [{ h: string; line: string }, { h: string; line: string }, { h: string; line: string }];
  r.keep({ basis: rules.basis, cards: [step, { h: 'late-009', line: 'The landlord is owed for the spring.' }, late, asked], said: null });
  const brief = await r.read();
  assert.deepEqual(brief.cards.map((x) => x.h), [c.step.h, c.late.h, c.asked.h]);
  assert.deepEqual(brief.cards.map((x) => x.by), ['slash', 'slash', 'slash']);
  assert.ok(!brief.cards.some((x) => /landlord/u.test(x.line)));
  r.sql.close();
});

test('WHEN THE BASIS MOVES THE RULES ANSWER AT ONCE: the bill is paid, and no stale card is said', async () => {
  const r = await morning();
  const rules = await r.read();
  r.keep({ basis: rules.basis, cards: written(three(rules)), said: null });
  assert.equal((await r.read()).cards[0]!.by, 'slash');
  value(await r.api.update({ register: 'bills', seq: r.rent.seq!, patch: { status: 'paid' } }, owner));
  const paid = await r.read();
  assert.notEqual(paid.basis, rules.basis);
  assert.equal(paid.cards.length, 2, JSON.stringify(paid.cards));
  assert.deepEqual(paid.cards.map((x) => x.by), ['rule', 'rule']);
  assert.ok(!paid.cards.some((x) => /slipped|stopped partway|Still waiting on you/u.test(x.line)), JSON.stringify(paid.cards));
  assert.ok(!paid.cards.some((x) => x.row.startsWith('bills#')));
  /* Nothing was kept for these facts, so nothing is said about why: the rules are simply what there is. */
  assert.equal(paid.said, null);
  r.sql.close();
});

test("SOMEBODY WHO READS ONE LIST LESS HAS A BASIS OF THEIR OWN and is answered the rules' cards, never the owner's lines", async () => {
  const r = await morning();
  const rules = await r.read();
  r.keep({ basis: rules.basis, cards: written(three(rules)), said: null });
  const theirs = await r.read(member);
  assert.notEqual(theirs.basis, rules.basis);
  assert.ok(theirs.cards.length > 0 && theirs.cards.length < 3, JSON.stringify(theirs.cards));
  assert.ok(theirs.cards.every((x) => x.by === 'rule'), JSON.stringify(theirs.cards));
  /* Neither a line written for the owner nor a word of the run they cannot read. */
  assert.ok(!theirs.cards.some((x) => /slipped|stopped partway|Still waiting on you|Kern/u.test(x.line)), JSON.stringify(theirs.cards));
  assert.equal(theirs.said, null);
  /* And the owner is still answered the model's. */
  assert.deepEqual((await r.read()).cards.map((x) => x.by), ['slash', 'slash', 'slash']);
  r.sql.close();
});

test("A KEPT ANSWER WITH NO CARD AND A SENTENCE ANSWERS THE RULES' CARDS WITH THAT SENTENCE", async () => {
  const r = await morning();
  const rules = await r.read();
  const said = "This month's thinking is spent, so the rules wrote this.";
  r.keep({ basis: rules.basis, cards: [], said });
  const brief = await r.read();
  assert.deepEqual(brief.cards, rules.cards);
  assert.deepEqual(brief.cards.map((x) => x.by), ['rule', 'rule', 'rule']);
  assert.equal(brief.said, said);
  /* The sentence is about these facts: once they move it is said no longer. */
  value(await r.api.update({ register: 'bills', seq: r.rent.seq!, patch: { status: 'paid' } }, owner));
  assert.equal((await r.read()).said, null);
  r.sql.close();
});

test('A PREF THAT IS NOT A KEPT ANSWER IS READ AS NOTHING KEPT, and the read still answers', async () => {
  const r = await morning();
  const rules = await r.read();
  for (const bent of ['x', 4, [], {}, { basis: rules.basis, cards: 'x', said: null }]) {
    r.api.kernel.setPref(SLASH, BRIEF_KEPT, bent);
    assert.deepEqual(await r.read(), rules, JSON.stringify(bent));
  }
  r.sql.close();
});
