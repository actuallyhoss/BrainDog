/**
 * `namedTwice` and `askNamedSame` (`src/methods/named-twice.ts`): the organisations and projects the kernel finds of one
 * name, each with its sentence, and his press that puts one pair to Decide as one question.
 *
 * On a real record with the People add-on and Portfolio installed as a person installs them, invented names from
 * `fixtures/names.ts`. The question is accepted through the record's own `decide` and put back through its own `undo`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal, type Result } from '@braindog/ports';
import { noteMention } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, type NamedAsked, type NamedTwice } from '../src/methods/named-twice.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { COMPANIES, DOMAINS, PROJECTS } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const AT = new Date(NOW).toISOString();

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** A member who reads the people and nothing else: the organisations are not there for them. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['people'] };
const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' } } as CallContext;

const ROW_ID = /[0-9A-HJKMNP-TV-Z]{26}/u;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (out: Result<unknown>): Refusal => {
  assert.ok(!out.ok, `expected a refusal, got ${JSON.stringify(out)}`);
  return (out as { refusal: Refusal }).refusal;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;

/** The methods on the record's own kernel, with the guard a list closed to the caller is refused by. */
function door(api: Api, sql: ReturnType<typeof openSqlite>) {
  const closed = (ctx: CallContext, register?: string): Refusal | null =>
    register !== undefined && ctx.registers !== undefined && !ctx.registers.includes(register)
      ? { code: 'REGISTER_UNKNOWN', fix: `There is no list called ${register}.`, at: 'register' }
      : null;
  const deps = {
    kernel: api.kernel,
    sql,
    guard: (ctx: CallContext, _need: string, asked?: string) => closed(ctx, asked),
    scoped: () => null,
    readable: closed,
    no,
    tail: async <T>(o: T) => o,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  return methods(deps);
}

async function record() {
  const { firstPartyDocument } = await import('../../seed/src/index.ts');
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  for (const id of ['portfolio', 'people'] as const) {
    const doc = firstPartyDocument(id, { seeds: [] });
    const planned = value<{ diff: { planHash: string; approve: unknown } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
    value(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.planHash, approve: planned.approve } as never, owner));
  }
  const add = (register: string, fields: Record<string, unknown>) => value<{ id: string; seq: number }>(api.kernel.create(register, fields as never, { actor: 'p_1' }));
  const live = (register: string) =>
    sql.all<{ id: string; fields: string }>('SELECT id, fields FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq', register).map((r) => ({
      id: r.id,
      fields: JSON.parse(r.fields) as Record<string, unknown>,
    }));
  return { api, sql, add, live, ...door(api, sql) };
}

const [ORCHARD, BRIGHT] = [COMPANIES[3], COMPANIES[0]];

test('A NAME AND THE SAME NAME WITH ITS COMPANY FORM ARE ONE PAIR: near, pressable, with its sentence, and never an id', async () => {
  const { sql, add, namedTwice } = await record();
  add('organisations', { name: `${ORCHARD} Ltd` });
  add('organisations', { name: ORCHARD });
  const out = value<NamedTwice>(await namedTwice(undefined, owner));
  assert.equal(out.pairs.length, 1, JSON.stringify(out));
  const one = out.pairs[0]!;
  assert.deepEqual([one.kind, one.how, one.can], ['org', 'near', true]);
  assert.deepEqual(one.a, { name: `${ORCHARD} Ltd`, register: 'organisations', seq: 1 });
  assert.deepEqual(one.b, { name: ORCHARD, register: 'organisations', seq: 2 });
  assert.equal(one.evidence, `${ORCHARD} Ltd and ${ORCHARD} read as one name, and nothing kept about either says they are two.`);
  assert.match(one.pair, /^[0-9a-f]{8}$/u);
  assert.doesNotMatch(JSON.stringify(out), ROW_ID);
  assert.doesNotMatch(JSON.stringify(out), /—/u);
  /* A LIMIT OUTSIDE ONE TO TWENTY IS REFUSED AT limit. */
  assert.equal(refusal(await namedTwice({ limit: 21 }, owner)).at, 'limit');
  sql.close();
});

test('TWO OF ONE NAME THAT EACH LIST A DIFFERENT SITE ARE TWO THINGS, and are not a pair', async () => {
  const { sql, add, namedTwice } = await record();
  add('organisations', { name: BRIGHT, domain: DOMAINS[2] });
  add('organisations', { name: `${BRIGHT} Ltd`, domain: DOMAINS[1] });
  assert.deepEqual(value<NamedTwice>(await namedTwice(undefined, owner)).pairs, []);
  sql.close();
});

test('A MEMBER THE ORGANISATIONS ARE CLOSED TO HEARS NOTHING of a pair in them, not even that there is one', async () => {
  const { sql, add, namedTwice, askNamedSame } = await record();
  add('organisations', { name: `${ORCHARD} Ltd` });
  add('organisations', { name: ORCHARD });
  const pair = value<NamedTwice>(await namedTwice(undefined, owner)).pairs[0]!.pair;
  assert.deepEqual(value<NamedTwice>(await namedTwice(undefined, shut)), { pairs: [] });
  assert.equal(refusal(await askNamedSame({ pair }, shut)).code, 'REGISTER_UNKNOWN');
  sql.close();
});

test("A TOKEN'S PRESS IS REFUSED: folding is a person's own, signed in, and nothing is filed", async () => {
  const { sql, add, namedTwice, askNamedSame } = await record();
  add('organisations', { name: `${ORCHARD} Ltd` });
  add('organisations', { name: ORCHARD });
  const pair = value<NamedTwice>(await namedTwice(undefined, owner)).pairs[0]!.pair;
  const out = refusal(await askNamedSame({ pair }, agent));
  assert.equal(out.code, 'NEEDS_BROWSER_SESSION');
  assert.match(out.fix, /only a person decides that, signed in/u);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE body_kind = 'rowset'")!.n, 0);
  sql.close();
});

test('HIS PRESS FILES ONE QUESTION SIGNED BY HIM; accepted, the pair is gone and one row points at the other', async () => {
  const { api, sql, add, live, namedTwice, askNamedSame } = await record();
  const kept = add('organisations', { name: `${ORCHARD} Ltd` });
  const other = add('organisations', { name: ORCHARD });
  const pair = value<NamedTwice>(await namedTwice(undefined, owner)).pairs[0]!.pair;

  const asked = value<NamedAsked>(await askNamedSame({ pair }, owner));
  const open = sql.all<{ id: string; opened_by: string; body: string; cause: string }>("SELECT id, opened_by, body, cause FROM suggestion WHERE status = 'open'");
  assert.equal(open.length, 1);
  assert.deepEqual([open[0]!.id, open[0]!.opened_by, open[0]!.cause], [asked.question, 'p_1', `named-twice#${pair}`]);
  assert.equal(api.kernel.question(asked.question), `Are ${ORCHARD} Ltd and ${ORCHARD} one organisation?`);
  const body = JSON.parse(open[0]!.body) as { register: string; pair: string; rows: { patch: Record<string, unknown> }[] };
  assert.deepEqual([body.register, body.pair, body.rows.length], ['organisations', pair, 1]);

  /* PRESSED AGAIN, the same question is answered and nothing is filed twice. The pair is asked, so it is not offered. */
  assert.deepEqual(value<NamedAsked>(await askNamedSame({ pair }, owner)), asked);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open'")!.n, 1);
  assert.deepEqual(value<NamedTwice>(await namedTwice(undefined, owner)).pairs, []);

  /* ACCEPTED THROUGH THE RECORD'S OWN DECIDE: the second points at the first, which is kept. */
  value(await api.decide({ id: asked.question, decide: { option: 'accept', reason: 'One company.' } } as never, owner));
  assert.equal(api.kernel.get(other.id)?.fields.merged_into, kept.id);
  assert.equal(api.kernel.get(kept.id)?.fields.merged_into ?? null, null);
  assert.deepEqual(value<NamedTwice>(await namedTwice(undefined, owner)).pairs, []);

  sql.close();
});

test('A NAME ONLY SEEN BESIDE ONE ROW IS SHOWN AND CANNOT BE PRESSED: there is no row to fold', async () => {
  const { sql, add, namedTwice, askNamedSame } = await record();
  add('organisations', { name: COMPANIES[2] });
  noteMention(sql, { name: COMPANIES[2].replace(/ Ltd$/u, ''), kind: 'organisation', project: null, source: 'a note from Tuesday', at: AT });
  const out = value<NamedTwice>(await namedTwice(undefined, owner));
  assert.equal(out.pairs.length, 1, JSON.stringify(out));
  const one = out.pairs[0]!;
  assert.deepEqual([one.how, one.can, one.b.seq], ['seen', false, null]);
  const no = refusal(await askNamedSame({ pair: one.pair }, owner));
  assert.equal(no.code, 'VALUE_MALFORMED');
  assert.match(no.fix, /nothing to fold/u);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE body_kind = 'rowset'")!.n, 0);
  sql.close();
});

test('TWO PROJECTS OF ONE NAME ARE SHOWN, and pressable only when the projects say what one is folded into', async () => {
  const { api, sql, add, namedTwice, askNamedSame } = await record();
  add('things', { name: PROJECTS[0], lane: 'building' });
  add('things', { name: PROJECTS[0].toLowerCase(), lane: 'building' });
  const out = value<NamedTwice>(await namedTwice(undefined, owner));
  assert.equal(out.pairs.length, 1, JSON.stringify(out));
  const one = out.pairs[0]!;
  const folds = (api.kernel.register('things')?.fields ?? []).some((f) => f.id === 'merged_into');
  assert.deepEqual([one.kind, one.how, one.can], ['project', 'name', folds]);
  if (!folds) assert.match(refusal(await askNamedSame({ pair: one.pair }, owner)).fix, /cannot be folded yet/u);
  /* A HANDLE THAT IS NO PAIR, OR ONE NO LONGER OFFERED, IS SAID SO. */
  assert.equal(refusal(await askNamedSame({ pair: 'not a pair' }, owner)).at, 'pair');
  assert.equal(refusal(await askNamedSame({ pair: '0000ffff' }, owner)).fix, 'That pair is no longer offered. Read the list again.');
  sql.close();
});

/**
 * THE UNDO OF HIS ANSWER. The kernel's undo of the decision that set `merged_into` writes it back through the decided
 * door, so the merge door lets it come apart and the two are two again.
 */
test('ONE UNDO OF HIS ANSWER GIVES TWO AGAIN, and the pair he answered is never offered again', async () => {
  const { api, sql, add, live, namedTwice, askNamedSame } = await record();
  const kept = add('organisations', { name: `${ORCHARD} Ltd` });
  const other = add('organisations', { name: ORCHARD });
  const pair = value<NamedTwice>(await namedTwice(undefined, owner)).pairs[0]!.pair;
  const asked = value<NamedAsked>(await askNamedSame({ pair }, owner));
  value(await api.decide({ id: asked.question, decide: { option: 'accept', reason: 'One company.' } } as never, owner));
  const decision = sql.one<{ id: string }>('SELECT id FROM decision ORDER BY rowid DESC LIMIT 1')!.id;
  const plan = value<{ hash: string }>(await api.undo({ decision, dry: true }, owner));
  const undone = value<{ skipped: unknown[] }>(await api.undo({ decision, hash: plan.hash }, owner));
  assert.deepEqual(undone.skipped, []);
  const back = live('organisations').filter((r) => (r.fields.merged_into ?? '') === '');
  assert.deepEqual(back.map((r) => r.id).sort(), [kept.id, other.id].sort());
  assert.deepEqual(value<NamedTwice>(await namedTwice(undefined, owner)).pairs, []);
  sql.close();
});
