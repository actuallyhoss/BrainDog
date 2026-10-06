/**
 * Who the record's own person is, on a record made before sign-up marked them (`loop/research-understanding-judge.md`,
 * change 1): once People has the `self` part, the tick marks the person holding the owner's sign-in address, as one
 * decision Decide shows as done with Undo; with nobody holding it, one question "Which of these is you?" names at most
 * five people; and a name alone never marks anybody.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, markOwnRow, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 7, 3);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', index: true },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'self', type: 'bool' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(people: Record<string, unknown>[]) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'sam@example.com', name: 'Sam Kamal' } }).ok,
  );
  value(await api.kernel.install([PEOPLE]));
  const rows: Entry[] = [];
  for (const fields of people) rows.push(value<Entry>(api.kernel.create('people', fields as never, { actor: 'p_1' })));
  return { api, sql, rows };
}

const selfOf = (api: Awaited<ReturnType<typeof createRecordApi>>, id: string) => api.kernel.get(id)?.fields.self ?? null;
const steps = (api: Awaited<ReturnType<typeof createRecordApi>>) => (api.kernel.prefsOf('braindog:updates')['first-party'] as { steps: string[] }).steps;

test('THE PERSON HOLDING THE SIGN-IN ADDRESS IS MARKED AS YOU, as one decision with Undo', async () => {
  const { api, sql, rows } = await record([{ name: 'Ada Vine', email: 'ada@kiln.example' }, { name: 'Sam', keys: ['email:Sam@Example.com', 'github:samdev'] }]);
  await api.slashTick();
  assert.equal(selfOf(api, rows[1]!.id), true);
  assert.equal(selfOf(api, rows[0]!.id), null);
  assert.ok(steps(api).includes('Sam holds the address you sign in with, so they are marked as you. Undo is on Decide.'), steps(api).join(' / '));
  /* DONE ON DECIDE: the question is answered, by the record, and its decision puts the mark back. */
  const asked = sql.one<{ id: string; status: string }>("SELECT id, status FROM suggestion WHERE opened_by = 'system' AND body_kind = 'rowset'");
  assert.equal(asked?.status, 'resolved');
  assert.equal(api.kernel.question(asked!.id), 'Mark Sam as you?');
  const decision = sql.one<{ id: string }>("SELECT id FROM decision WHERE decided_by = 'system' ORDER BY rowid DESC LIMIT 1")!.id;
  const plan = value<{ hash: string }>(await api.undo({ decision, dry: true }, owner));
  value(await api.undo({ decision, hash: plan.hash }, owner));
  assert.notEqual(selfOf(api, rows[1]!.id), true);
  /* THE UNDO HOLDS: the next night neither marks them again nor asks anything new; the mark waits on Decide. */
  api.kernel.setPref('braindog:updates', 'first-party', null);
  await api.slashTick();
  assert.notEqual(selfOf(api, rows[1]!.id), true);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE opened_by = 'system'")?.n, 1);
  assert.equal(sql.one<{ status: string }>("SELECT status FROM suggestion WHERE opened_by = 'system'")?.status, 'open');
  sql.close();
});

test('NOBODY HOLDS THE ADDRESS: ONE QUESTION, AT MOST FIVE PEOPLE BY NAME, AND A NAME ALONE MARKS NOBODY', async () => {
  const names = ['Ada Vine', 'Sam Lee', 'Sam Kamal', 'Jo Park', 'Kim Ito', 'Lu Wen', 'Mo Sato'];
  const { api, sql, rows } = await record(names.map((name) => ({ name })));
  await api.slashTick();
  /* THE OWNER'S OWN NAME ON A ROW IS NOT PROOF: nobody is marked. */
  assert.ok(rows.every((r) => selfOf(api, r.id) !== true));
  const asked = sql.all<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE opened_by = 'system' AND body_kind = 'options' AND status = 'open'");
  assert.equal(asked.length, 1);
  assert.equal(api.kernel.question(asked[0]!.id), 'Which of these is you?');
  const options = (JSON.parse(asked[0]!.body) as { options: { id: string; label: string }[] }).options;
  /* FIVE PEOPLE, the one sharing a word with the owner's name first, and a way to say none. */
  assert.deepEqual(
    options.map((o) => o.label),
    ['Sam Kamal', 'Ada Vine', 'Sam Lee', 'Jo Park', 'Kim Ito', 'None of these'],
  );
  assert.doesNotMatch(JSON.stringify(options), /[0-9A-HJKMNP-TV-Z]{26}|#\d/u);
  /* ASKED ONCE: the next night asks nothing more. */
  api.kernel.setPref('braindog:updates', 'first-party', null);
  await api.slashTick();
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE opened_by = 'system' AND body_kind = 'options'")?.n, 1);
  /* THE OWNER'S PICK MARKS THAT PERSON. */
  value(await api.decide({ id: asked[0]!.id, decide: { option: 'p1', reason: 'That is me.' } }, owner));
  assert.equal(selfOf(api, rows[2]!.id), true);
  sql.close();
});

test('SOMEBODY OTHER THAN THE OWNER ANSWERING "Which of these is you?" MARKS NOBODY, and it is asked again', async () => {
  const { api, sql, rows } = await record(['Ada Vine', 'Sam Kamal'].map((name) => ({ name })));
  await api.slashTick();
  const asked = sql.one<{ id: string }>("SELECT id FROM suggestion WHERE opened_by = 'system' AND body_kind = 'options' AND status = 'open'")!;
  const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'decide' }, credentialed: true };
  value(await api.decide({ id: asked.id, decide: { option: 'p1', reason: 'That is me.' } }, member));
  assert.ok(rows.every((r) => selfOf(api, r.id) !== true));
  api.kernel.setPref('braindog:updates', 'first-party', null);
  await api.slashTick();
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE opened_by = 'system' AND body_kind = 'options' AND status = 'open'")?.n, 1);
  sql.close();
});

test('A RECORD WHOSE PERSON IS MARKED ALREADY IS LEFT AS IT IS', async () => {
  const { api, sql, rows } = await record([{ name: 'Sam', email: 'other@example.com', self: true }, { name: 'Sam Kamal', email: 'sam@example.com' }]);
  await api.slashTick();
  assert.equal(selfOf(api, rows[1]!.id), null);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE opened_by = 'system'")?.n, 0);
  sql.close();
});

test('"Mark X as you?" PUT BACK BY UNDO IS ANSWERED BY THE OWNER ALONE', async () => {
  const { api, sql, rows } = await record([{ name: 'Sam', email: 'sam@example.com' }]);
  await api.slashTick();
  const decision = sql.one<{ id: string }>("SELECT id FROM decision WHERE decided_by = 'system' ORDER BY rowid DESC LIMIT 1")!.id;
  const plan = value<{ hash: string }>(await api.undo({ decision, dry: true }, owner));
  value(await api.undo({ decision, hash: plan.hash }, owner));
  const asked = sql.one<{ id: string; status: string }>("SELECT id, status FROM suggestion WHERE opened_by = 'system' AND body_kind = 'rowset'")!;
  assert.equal(asked.status, 'open');
  /* ANOTHER ADMIN'S YES WOULD MAKE SOMEBODY ELSE THE OWNER'S OWN PERSON. */
  const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'owner' }, credentialed: true };
  const refused = (await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'That is him.' } }, member)) as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal?.code, 'FORBIDDEN');
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', asked.id)?.status, 'open');
  assert.notEqual(selfOf(api, rows[0]!.id), true);
  /* THE OWNER'S YES MARKS THEM, asked again on them as they are now since the mark and its Undo moved them. */
  value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'That is me.' } }, owner));
  assert.equal(selfOf(api, rows[0]!.id), true);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE opened_by = 'system' AND status = 'open'")?.n, 0);
  /* AND IT IS ONE DECISION WITH UNDO, as the first was. */
  const again = sql.one<{ id: string }>("SELECT id FROM decision WHERE decided_by = 'p_1' ORDER BY rowid DESC LIMIT 1")!.id;
  const back = value<{ hash: string }>(await api.undo({ decision: again, dry: true }, owner));
  value(await api.undo({ decision: again, hash: back.hash }, owner));
  assert.notEqual(selfOf(api, rows[0]!.id), true);
  sql.close();
});

test('markOwnRow MARKS THE ONE PERSON HOLDING THE SIGN-IN ADDRESS, for a host holding only a kernel', async () => {
  const { api, sql, rows } = await record([{ name: 'Ada Vine', email: 'ada@kiln.example' }, { name: 'Sam', keys: ['email:Sam@Example.com'] }]);
  const out = value<{ marked: boolean; said: string | null }>(await markOwnRow(api.kernel, 'sam@example.com'));
  assert.equal(out.marked, true);
  assert.equal(out.said, 'Sam holds the address you sign in with, so they are marked as you. Undo is on Decide.');
  assert.equal(selfOf(api, rows[1]!.id), true);
  /* ONCE: a second call does nothing, and nor does the night. */
  assert.deepEqual(value(await markOwnRow(api.kernel, 'sam@example.com')), { marked: false, said: null });
  await api.slashTick();
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE opened_by = 'system'")?.n, 1);
  /* A NAME ALONE NEVER MARKS: nobody holds this address. */
  const other = await record([{ name: 'Sam Kamal' }]);
  assert.deepEqual(value(await markOwnRow(other.api.kernel, 'sam@example.com')), { marked: false, said: null });
  assert.notEqual(selfOf(other.api, other.rows[0]!.id), true);
  other.sql.close();
  sql.close();
});

test('"Mark X as you?" PUT BACK BY UNDO IS NOT ACCEPTED ONTO A SECOND PERSON once somebody else is marked', async () => {
  const { api, sql, rows } = await record([{ name: 'Sam', email: 'sam@example.com' }, { name: 'Ada Vine', email: 'ada@kiln.example' }]);
  await api.slashTick();
  const decision = sql.one<{ id: string }>("SELECT id FROM decision WHERE decided_by = 'system' ORDER BY rowid DESC LIMIT 1")!.id;
  const plan = value<{ hash: string }>(await api.undo({ decision, dry: true }, owner));
  value(await api.undo({ decision, hash: plan.hash }, owner));
  /* THE OWNER MARKS SOMEBODY ELSE HIMSELF, then finds the old question. */
  const ada = api.kernel.get(rows[1]!.id)!;
  value(api.kernel.update('people', ada.id, { self: true }, { actor: 'p_1', version: ada.version }));
  const asked = sql.one<{ id: string }>("SELECT id FROM suggestion WHERE opened_by = 'system' AND body_kind = 'rowset' AND status = 'open'")!;
  const out = (await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'That is me.' } }, owner)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'ALREADY_KNOWN');
  assert.equal(out.refusal?.fix, 'Ada Vine is marked as you already. Take that off them first if this one is you instead.');
  assert.notEqual(selfOf(api, rows[0]!.id), true);
  sql.close();
});

test('THE ONE HOLDING THE ADDRESS WHO WAS MET ONLY IN MAIL OR ONLY IN COMMITS IS ASKED ABOUT, never marked on its own', async () => {
  for (const met of ['2026-10-01 · mail from sam@example.com', '2026-10-01 · commit in lantern']) {
    const { api, sql, rows } = await record([{ name: 'Elon Musk', email: 'sam@example.com', met: [met] }, { name: 'Sam Kamal' }]);
    await api.slashTick();
    assert.ok(rows.every((r) => selfOf(api, r.id) !== true), met);
    const asked = sql.one<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE opened_by = 'system' AND body_kind = 'options' AND status = 'open'")!;
    assert.equal(api.kernel.question(asked.id), 'Which of these is you?');
    /* THE HOLDER FIRST, since whether they are him is what is asked. */
    const body = JSON.parse(asked.body) as { about: string; options: { label: string }[] };
    assert.deepEqual(
      body.options.map((o) => o.label),
      ['Elon Musk', 'Sam Kamal', 'None of these'],
    );
    assert.equal(body.about, 'The one holding your address was met only in mail or commits.');
    assert.ok(
      steps(api).includes(
        'Which of these is you is asked on Decide, since the one person holding the address you sign in with was met only in mail or commits, where anybody could have written it.',
      ),
      steps(api).join(' / '),
    );
    /* NOR DOES THE HOST'S STEP MARK THEM. */
    assert.deepEqual(value(await markOwnRow(api.kernel, 'sam@example.com')), { marked: false, said: null });
    sql.close();
  }
});

test('ONE MET IN A NOTE OR A RUN AS WELL AS IN MAIL IS VOUCHED FOR, and marked', async () => {
  const { api, sql, rows } = await record([{ name: 'Sam', email: 'sam@example.com', met: ['2026-10-01 · mail from sam@example.com', '2026-10-02 · note on Lantern'] }]);
  await api.slashTick();
  assert.equal(selfOf(api, rows[0]!.id), true);
  sql.close();
});

test('A SHARED SIGN-IN ADDRESS NO PERSON CAN HOLD GOES STRAIGHT TO THE QUESTION, and the log says why', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'admin@example.com', name: 'Sam Kamal' } }).ok,
  );
  value(await api.kernel.install([PEOPLE]));
  /* EVEN ONE TYPED IN HOLDING IT is not him on that alone. */
  const rows = [value<Entry>(api.kernel.create('people', { name: 'Front desk', email: 'admin@example.com' } as never, { actor: 'p_1' })), value<Entry>(api.kernel.create('people', { name: 'Sam Kamal' } as never, { actor: 'p_1' }))];
  await api.slashTick();
  assert.ok(rows.every((r) => selfOf(api, r.id) !== true));
  const asked = sql.one<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE opened_by = 'system' AND body_kind = 'options' AND status = 'open'")!;
  assert.equal(api.kernel.question(asked.id), 'Which of these is you?');
  assert.equal((JSON.parse(asked.body) as { about: string }).about, 'You sign in with a shared address, which no one person holds.');
  assert.equal((JSON.parse(asked.body) as { options: { label: string }[] }).options[0]!.label, 'Sam Kamal');
  assert.ok(
    steps(api).includes('Which of these is you is asked on Decide, since you sign in with a shared address, such as an admin or info one, which no one person in People can hold.'),
    steps(api).join(' / '),
  );
  assert.deepEqual(value(await markOwnRow(api.kernel, 'admin@example.com')), { marked: false, said: null });
  sql.close();
});

test('UNDO OF THE "Which of these is you?" PICK TAKES THE MARK BACK, AND A SECOND ANSWER MARKS AGAIN', async () => {
  const { api, sql, rows } = await record(['Ada Vine', 'Sam Kamal'].map((name) => ({ name })));
  await api.slashTick();
  const asked = sql.one<{ id: string }>("SELECT id FROM suggestion WHERE opened_by = 'system' AND body_kind = 'options' AND status = 'open'")!;
  value(await api.decide({ id: asked.id, decide: { option: 'p1', reason: 'That is me.' } }, owner));
  assert.equal(selfOf(api, rows[1]!.id), true);
  /* ONE DECISION: its Undo puts the mark back with the answer, and the question waits on Decide again. */
  const decision = sql.one<{ id: string }>("SELECT id FROM decision WHERE decided_by = 'p_1' ORDER BY rowid DESC LIMIT 1")!.id;
  const plan = value<{ hash: string }>(await api.undo({ decision, dry: true }, owner));
  value(await api.undo({ decision, hash: plan.hash }, owner));
  assert.notEqual(selfOf(api, rows[1]!.id), true);
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', asked.id)?.status, 'open');
  /* THE NIGHT ASKS NOTHING NEW while it waits. */
  api.kernel.setPref('braindog:updates', 'first-party', null);
  await api.slashTick();
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE opened_by = 'system' AND body_kind = 'options'")?.n, 1);
  /* AND THE SECOND ANSWER MARKS, this time the other one. */
  value(await api.decide({ id: asked.id, decide: { option: 'p2', reason: 'That one, in fact.' } }, owner));
  assert.equal(selfOf(api, rows[0]!.id), true);
  assert.notEqual(selfOf(api, rows[1]!.id), true);
  sql.close();
});

test('THE ONE HOLDING THE ADDRESS, MET ONLY IN MAIL AND KNOWN BY IT ALONE, IS STILL OFFERED, by the part before the @', async () => {
  const { api, sql, rows } = await record([{ name: 'sam@example.com', email: 'sam@example.com', met: ['2026-10-01 · mail from sam@example.com'] }, { name: 'Ada Vine' }]);
  await api.slashTick();
  assert.ok(rows.every((r) => selfOf(api, r.id) !== true));
  const asked = sql.one<{ body: string }>("SELECT body FROM suggestion WHERE opened_by = 'system' AND body_kind = 'options' AND status = 'open'")!;
  assert.deepEqual(
    (JSON.parse(asked.body) as { options: { label: string }[] }).options.map((o) => o.label),
    ['sam', 'Ada Vine', 'None of these'],
  );
  sql.close();
});
