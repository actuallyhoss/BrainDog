/**
 * `learned`: what the record will not ask again because of an answer (`src/methods/learned.ts`), each in one plain
 * sentence. A read: it writes nothing and asks nothing.
 *
 * Through the real record, so every answer read back is one the record kept the way it keeps them: a merge question
 * answered no, a fold the strong rules made and the owner put back, a page dismissed from the pen, and a question
 * turned down on Decide. The clock moves between them, so the log says which is newest.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { LEARNED_MOST, type Learned } from '../src/methods/learned.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);
const HOUR = 3_600_000;

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', handles: 'handles', keys: 'keys', met: 'met', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text', label: 'Handles' },
      { id: 'keys', type: 'list', of: 'text', label: 'Keys' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** A member who reads Projects and nothing else: the people are not there for her. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['things'] };

type Met = { undo?: string; question?: string };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([THINGS, PEOPLE] as never));
  const meet = async (said: Record<string, unknown>) => value<Met>(await api.meet(said as never, owner));
  const learned = (args: unknown, ctx: CallContext) =>
    (api as unknown as { learned: (a: unknown, c: CallContext) => Promise<Result<Learned>> }).learned(args, ctx);
  return { api, sql, clock, meet, learned };
}

/** Every answer of the four kinds, an hour apart, in this order: a pair declined, a fold undone, a page dismissed, a question turned down. */
async function taught() {
  const r = await record();
  await r.meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'commit 1 in lanternfish' });
  const asked = await r.meet({ name: 'Teodor Vance', email: 'teodor.v@pellucid.example', source: 'note from Tuesday' });
  assert.ok(asked.question, 'a commit and a note under another address are asked about');
  value(r.api.kernel.decide(asked.question!, { decide: { option: 'reject', reason: 'two different Teodors' } }, 'p_1'));

  r.clock.advance(HOUR);
  await r.meet({ name: 'Alba Marlowe', email: 'albamarlowe@one.example', source: 'commit 10 in lanternfish' });
  const folded = await r.meet({ name: 'Alba Marlowe', email: 'albamarlowe@two.example', source: 'commit 11 in lanternfish' });
  assert.ok(folded.undo, 'two commits under one handle fold on the strong rules');
  r.clock.advance(HOUR);
  value(r.api.kernel.undoMerge(folded.undo!, { actor: 'p_1' }));

  r.clock.advance(HOUR);
  value(await r.api.setPref({ key: 'pen.dismissed', value: ['page:gone', 'page:things'] } as never, owner));

  r.clock.advance(HOUR);
  const filed = value<{ id: string }>(r.api.kernel.propose({ question: 'Add the Lantern project?', body_kind: 'rowset', body: { register: 'things', rows: [{ name: 'Lantern' }] } } as never, 'slash'));
  value(r.api.kernel.decide(filed.id, { resolved_as: 'wont-fix', reason: 'not now' } as never, 'p_1'));
  return r;
}

test('EACH ANSWER IS READ BACK ONCE, IN WORDS, NEWEST FIRST', async () => {
  const { sql, learned } = await taught();
  const out = value<Learned>(await learned(undefined, owner));
  assert.deepEqual(
    out.rows.map((r) => [r.kind, r.line]),
    [
      ['declined', 'Answered no: Add the Lantern project?'],
      ['not-offered', 'No page for Projects.'],
      ['apart', 'The two called Alba Marlowe are two people.'],
      ['apart', 'The two called Teodor Vance are two people.'],
    ],
  );
  assert.equal(out.more, 0);
  /* WHEN EACH WAS ANSWERED: the fold by when it was put back, and a dismissal by when the pen's dismissals changed. */
  assert.deepEqual(
    out.rows.map((r) => r.at),
    [NOW + 4 * HOUR, NOW + 3 * HOUR, NOW + 2 * HOUR, NOW].map((ms) => new Date(ms).toISOString()),
  );
  /* NAMES, NEVER AN ID, AN ADDRESS OR A DASH: a dismissal of a list the record does not hold is not said at all. */
  assert.doesNotMatch(JSON.stringify(out), /@|example|[0-9A-HJKMNP-TV-Z]{26}|SG\d|people#|gone|merged_into|—/u);
  sql.close();
});

test('A MEMBER HELD TO ONE LIST HEARS NOTHING OF ANOTHER: no pair of people, only the question on her own list', async () => {
  const { sql, learned } = await taught();
  const out = value<Learned>(await learned(undefined, shut));
  assert.deepEqual(out.rows.map((r) => r.line), ['Answered no: Add the Lantern project?']);
  assert.doesNotMatch(JSON.stringify(out), /Teodor|Alba|Projects\./u);
  sql.close();
});

test('IT WRITES NOTHING AND ASKS NOTHING: the log, the questions and the preferences are as they were', async () => {
  const { sql, learned } = await taught();
  const count = (table: string) => sql.one<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)!.n;
  const before = ['event', 'suggestion', 'pref', 'entry'].map(count);
  for (let i = 0; i < 3; i++) value<Learned>(await learned(undefined, owner));
  assert.deepEqual(['event', 'suggestion', 'pref', 'entry'].map(count), before);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open'")!.n, 0);
  sql.close();
});

test('AN ANSWER TAKEN BACK IS NO LONGER TAUGHT: a question reopened is not read as declined', async () => {
  const { api, sql, learned } = await taught();
  const id = sql.one<{ id: string }>("SELECT id FROM suggestion WHERE resolved_as = 'wont-fix'")!.id;
  sql.exec("UPDATE suggestion SET status = 'open', resolved_as = NULL WHERE id = ?", id);
  const out = value<Learned>(await learned(undefined, owner));
  assert.ok(!out.rows.some((r) => r.kind === 'declined'));
  assert.equal(api.kernel.question(id), 'Add the Lantern project?');
  sql.close();
});

test('FIFTY AT MOST, AND MORE COUNTS WHAT WAS HELD BACK; a limit that is not a whole number from 1 to 50 is refused', async () => {
  assert.equal(LEARNED_MOST, 50);
  const { sql, learned } = await taught();
  const two = value<Learned>(await learned({ limit: 2 }, owner));
  assert.deepEqual(two.rows.map((r) => r.kind), ['declined', 'not-offered']);
  assert.equal(two.more, 2);
  for (const limit of [0, -1, 1.5, '2', 51]) {
    const out = await learned({ limit }, owner);
    assert.equal(out.ok, false, JSON.stringify(limit));
    assert.equal((out as { refusal: { at?: string } }).refusal.at, 'limit');
  }
  sql.close();
});

test('A RECORD WITH NO ANSWERS ANSWERS NOTHING TAUGHT', async () => {
  const { sql, learned } = await record();
  assert.deepEqual(value<Learned>(await learned(undefined, owner)), { rows: [], more: 0 });
  sql.close();
});

test('A GRANT NARROWED TO SOME OF THE PEOPLE HEARS ONLY THE PAIRS IT ADMITS BOTH OF', async () => {
  const { sql, learned } = await taught();
  const narrowed = (name: string) => ({ principal: { kind: 'person', id: 'p_4', level: 'read' }, wheres: { people: { field: 'name', is: name } } }) as unknown as CallContext;
  const apart = async (name: string) => value<Learned>(await learned(undefined, narrowed(name))).rows.filter((r) => r.kind === 'apart').map((r) => r.line);
  assert.deepEqual(await apart('Alba Marlowe'), ['The two called Alba Marlowe are two people.']);
  assert.deepEqual(await apart('Somebody Else'), []);
  sql.close();
});

test('A PAGE OF THE WEEK DISMISSED IS SAID BY ITS LIST, newest dismissal first and the older with no day', async () => {
  const { api, sql, learned } = await record();
  value(await api.setPref({ key: 'pen.dismissed', value: ['week:things', 'page:people'] } as never, owner));
  const out = value<Learned>(await learned(undefined, owner));
  assert.deepEqual(out.rows, [
    { kind: 'not-offered', line: 'No page for People.', at: new Date(NOW).toISOString() },
    { kind: 'not-offered', line: 'No page of the week for Projects.', at: null },
  ]);
  /* HERS ALONE: another member's dismissals are not hers. */
  assert.deepEqual(value<Learned>(await learned(undefined, shut)).rows, []);
  sql.close();
});
