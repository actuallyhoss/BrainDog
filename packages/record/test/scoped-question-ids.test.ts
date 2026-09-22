/**
 * Somebody invited to named lists is handed no `SG` or `D` number; they may type one.
 *
 * `loop/research-hidden-questions.md` §1 and §2. Every `SG<n>` and `D<n>` is drawn from one counter over the whole
 * record, so a member invited to Obligations read `SG1` then `SG6` and `D1` then `D4` with four Diary questions (two of
 * them decided) between, and an `append` member's own `propose` answered `SG7`, six hidden questions before hers, from
 * one call. The counts on `boot` were already filtered; the names were not.
 *
 * SO SHE IS HANDED THE ID OF A LINE SHE CAN ALREADY READ. `q.<ULID>` is the id of a question's first `suggest` event and
 * `d.<ULID>` the id of a decision's `decide` event: its first ten characters are the millisecond she was shown as
 * `opened_at`, and the tail is redrawn on every mint, so two of them cannot be subtracted. She may hand back either a
 * handle or a number, and a hidden question answers exactly as a missing one does either way.
 *
 * THE OWNER KEEPS THE NUMBERS. `brain.dog/D41` is a sentence one person can say to another, and the owner reads the whole
 * record, so the gap between two of his ids counts nothing he may not read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type HistoryPage } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

const DIARY = {
  id: 'register.diary',
  kind: 'register' as const,
  body: { id: 'diary', name: 'Diary', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_1', level: 'owner' } };

/** A spoken number anywhere in an answer. */
const SPOKEN = /\b(?:SG|D)[1-9][0-9]*\b/u;
const QUESTION = /^q\.[0-9A-Z]{26}$/u;
const DECISION = /^d\.[0-9A-Z]{26}$/u;

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
type Row = { id: string; suggestion?: string | null; decision?: string | null };

const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

const rows = (register: string) => (register === 'diary' ? [{ body: 'Dinner with the auditor' }] : [{ what: 'Invoice 41', state: 'open' }]);

async function ask(api: Awaited<ReturnType<typeof createRecordApi>>, register: string, question: string, ctx: CallContext = agent): Promise<string> {
  return value<{ id: string }>(await api.propose({ question, body_kind: 'rowset', body: { register, rows: rows(register) } } as never, ctx)).id;
}

async function settle(api: Awaited<ReturnType<typeof createRecordApi>>, id: string): Promise<string> {
  return value<{ decision: string }>(await api.decide({ id, decide: { option: 'accept', reason: 'Because it is right' } }, owner)).decision;
}

/**
 * The shape the survey measured: one Obligations question decided, four Diary questions with two decided, a second
 * Obligations question decided and a third left open. The owner's numbers come out `SG1`, `SG2` to `SG5`, `SG6`, `SG7`
 * and `D1`, `D2`, `D3`, `D4`, so Wren's own read `SG1 SG6 SG7` and `D1 D4` if the names reach her.
 */
async function busy() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 5, 12)) });
  assert.ok((await api.kernel.install([OBLIGATIONS, DIARY])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  const first = await ask(api, 'obligations', 'File the first invoice?');
  const firstDecision = await settle(api, first);
  const diary: string[] = [];
  for (let i = 0; i < 4; i++) diary.push(await ask(api, 'diary', `File diary entry ${'abcd'[i]}?`));
  const diaryDecisions = [await settle(api, diary[0]!), await settle(api, diary[1]!)];
  const second = await ask(api, 'obligations', 'File the second invoice?');
  const secondDecision = await settle(api, second);
  const open = await ask(api, 'obligations', 'File the third invoice?');
  assert.deepEqual([first, ...diary, second, open], ['SG1', 'SG2', 'SG3', 'SG4', 'SG5', 'SG6', 'SG7'], 'the owner numbers every question');
  assert.deepEqual([firstDecision, ...diaryDecisions, secondDecision], ['D1', 'D2', 'D3', 'D4']);

  let n = 0;
  /* BUILT THE WAY THE HOST BUILDS A MEMBER, from `kernel.access`, so the grant shape is the one a real sign-in carries. */
  const member = async (grant: Record<string, unknown>): Promise<CallContext> => {
    const person = `p_${10 + n++}`;
    value(await api.invite({ person, name: `Member ${n}`, ...grant } as never, owner));
    const held = api.kernel.access(person)!;
    return { principal: { kind: 'person', id: person, level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  };
  return { sql, api, member, diary };
}

/** Every answer the survey's `fields.ts` found a number in, as one string. */
async function everything(api: Awaited<ReturnType<typeof createRecordApi>>, ctx: CallContext): Promise<string> {
  return JSON.stringify([
    value(await api.governance({ status: 'all' }, ctx)),
    value(await api.governance({ register: 'decision' }, ctx)),
    value(await api.recentHistory({ limit: 200 } as never, ctx)),
    value(await api.boot(ctx)),
    value(await api.context({} as never, ctx)),
  ]);
}

test('(1) A MEMBER INVITED TO ONE LIST AT READ OR WRITE IS HANDED NO QUESTION OR DECISION NUMBER, anywhere she reads one', async () => {
  const { sql, api, member } = await busy();
  for (const level of ['read', 'write']) {
    const wren = await member({ registers: { obligations: level } });
    const said = await everything(api, wren);
    assert.doesNotMatch(said, SPOKEN, `at ${level} she read ${said.match(new RegExp(SPOKEN.source, 'gu'))?.join(' ')}`);
    /* AND SHE STILL READS HER OWN: a handle in place of every number, not an empty answer. */
    const asked = value<Row[]>(await api.governance({ status: 'all' }, wren));
    assert.equal(asked.length, 3, 'her three Obligations questions');
    for (const row of asked) assert.match(row.id, QUESTION);
  }
  sql.close();
});

test('(1) A READER WITH ONE LIST HELD TO APPEND IS HANDED NO NUMBER EITHER, since the gap would count that list', async () => {
  /* NOT `wholeRecord`, WHICH ASKS ONLY ABOUT THE CEILING. Iris reads the record with Diary held to `append`, so she has
     no ceiling and `wholeRecord` calls her whole, while `holds` hides every Diary question from her because `append`
     does not read. Handed numbers, she read `SG1 SG6 SG7` and `D1 D4`, the same four hidden questions and two hidden
     decisions as Wren, which is batch nineteen's finding 3 again for these two counters. */
  const { sql, api, member } = await busy();
  const iris = await member({ level: 'read', registers: { diary: 'append' } });
  const said = await everything(api, iris);
  assert.doesNotMatch(said, SPOKEN, `she read ${said.match(new RegExp(SPOKEN.source, 'gu'))?.join(' ')}`);
  /* AND THE COUNT BESIDE THEM IS OF WHAT SHE READS. `boot` asked `wholeRecord` here too and told her `decided: 4` beside
     the two decisions her list showed her. */
  assert.equal(value<{ counts: { decided: number } }>(await api.boot(iris)).counts.decided, 2);
  assert.equal(value<Row[]>(await api.governance({ register: 'decision' }, iris)).length, 2);
  sql.close();
});

test('(2) AN APPEND MEMBER IS ANSWERED A HANDLE BY HER OWN PROPOSE, not how many questions the record has had', async () => {
  const { sql, api, member } = await busy();
  const ada = await member({ registers: { obligations: 'append' } });
  const id = await ask(api, 'obligations', 'File the fourth invoice?', ada);
  assert.match(id, QUESTION, `her propose answered ${id}`);
  /* THE OWNER READS IT UNDER ITS NUMBER, which is the eighth. */
  assert.ok(value<Row[]>(await api.governance({}, owner)).some((r) => r.id === 'SG8'));
  sql.close();
});

test('(3) EVERY HANDLE SHE IS GIVEN OPENS ITS ROW, pages on, and names the question her decide line settled', async () => {
  const { sql, api, member } = await busy();
  const wren = await member({ registers: { obligations: 'write' } });

  const questions = value<Row[]>(await api.governance({ status: 'all' }, wren));
  const decisions = value<Row[]>(await api.governance({ register: 'decision' }, wren));
  assert.equal(decisions.length, 2);
  for (const q of questions) {
    const opened = value<Row | null>(await api.governance({ id: q.id }, wren));
    assert.equal(opened?.id, q.id, `${q.id} did not open`);
  }
  for (const d of decisions) {
    assert.match(d.id, DECISION);
    assert.match(String(d.suggestion), QUESTION, 'a decision names its question by handle');
    assert.equal(value<Row | null>(await api.governance({ register: 'decision', id: d.id }, wren))?.id, d.id);
    /* AND THE QUESTION IT NAMES IS ONE SHE HOLDS, under the same handle, so the two screens link. */
    assert.ok(questions.some((q) => q.id === d.suggestion && q.decision === d.id), `${d.suggestion} is not one of her questions`);
  }

  /* A LIST'S LAST ID IS THE NEXT PAGE'S CURSOR, as it was when it was a number. */
  const walked: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = value<Row[]>(await api.governance({ status: 'all', limit: 1, ...(cursor === undefined ? {} : { cursor }) }, wren));
    if (page.length === 0) break;
    walked.push(page[0]!.id);
    cursor = page[0]!.id;
  }
  assert.deepEqual(walked, questions.map((q) => q.id), 'paging one at a time by handle walked a different list');
  const firstDecision = value<Row[]>(await api.governance({ register: 'decision', limit: 1 }, wren))[0]!;
  const nextDecision = value<Row[]>(await api.governance({ register: 'decision', limit: 1, cursor: firstDecision.id }, wren));
  assert.deepEqual(nextDecision.map((d) => d.id), [decisions[1]!.id]);

  /* THE `settles` ON HER `decide` LINE is the handle of a question in her list, which is how Home pairs the two lines. */
  const lines = value<HistoryPage>(await api.recentHistory({ limit: 200 } as never, wren)).events;
  const decided = lines.filter((e) => e.kind === 'decide');
  assert.equal(decided.length, 2);
  for (const line of decided) {
    assert.match(String(line.settles), QUESTION);
    assert.ok(questions.some((q) => q.id === line.settles));
  }

  /* SHE MAY STILL TYPE A NUMBER. `SG6` is hers, and answers the row; `SG2` is Diary's and `SG999` is nobody's, and both
     answer the same `null`, which is what they answered before handles. */
  assert.match(String(value<Row | null>(await api.governance({ id: 'SG6' }, wren))?.id), QUESTION);
  assert.equal(value(await api.governance({ id: 'SG2' }, wren)), null);
  assert.equal(value(await api.governance({ id: 'SG999' }, wren)), null);

  /* AND `decide` TAKES A HANDLE, so a link she forwards to whoever may answer it names the question they answer. */
  const open = questions.find((q) => q.decision === null)!;
  const done = value<{ suggestion: string; decision: string }>(await api.decide({ id: open.id, decide: { option: 'accept', reason: 'Wren asked' } }, owner));
  assert.deepEqual([done.suggestion, done.decision], ['SG7', 'D5']);
  sql.close();
});

test('(4) THE OWNER AND THE OWNER\'S TOKEN ARE HANDED THE NUMBERS UNCHANGED', async () => {
  const { sql, api } = await busy();
  for (const ctx of [owner, agent]) {
    assert.deepEqual(value<Row[]>(await api.governance({ status: 'all' }, ctx)).map((r) => r.id).sort(), ['SG1', 'SG2', 'SG3', 'SG4', 'SG5', 'SG6', 'SG7']);
    const decisions = value<Row[]>(await api.governance({ register: 'decision' }, ctx));
    assert.deepEqual(decisions.map((r) => r.id).sort(), ['D1', 'D2', 'D3', 'D4']);
    assert.ok(decisions.every((d) => typeof d.suggestion === 'string' && /^SG\d+$/u.test(d.suggestion)));
    const settles = value<HistoryPage>(await api.recentHistory({ limit: 200 } as never, ctx)).events.filter((e) => e.kind === 'decide').map((e) => e.settles);
    assert.deepEqual(settles.sort(), ['SG1', 'SG2', 'SG3', 'SG6']);
  }
  sql.close();
});

test('(6) A MEMBER WHO MAY DECIDE IS ANSWERED BY HANDLE TOO, when her decision lands and when it is refused', async () => {
  /* THE SIXTH EXIT, WHICH THE FIRST FIVE MISSED. Dee is invited at `decide` with Diary held to `append`, so she answers
     questions and does not read every list. Measured before this test: her `decide` on SG7 answered
     `{ decision: 'D5', suggestion: 'SG7' }`, the three Diary decisions counted by subtraction from the two she is shown,
     and a second `decide` on the handle she was given was refused "SG7 is resolved", her own question's number. */
  const { sql, api, member } = await busy();
  const dee = await member({ level: 'decide', registers: { diary: 'append' } });
  const open = value<Row[]>(await api.governance({}, dee));
  assert.equal(open.length, 1, 'the third invoice is the one open question she reads');
  const handle = open[0]!.id;
  const done = value<{ suggestion: string; decision: string }>(await api.decide({ id: handle, decide: { option: 'accept', reason: 'Dee checked it' } }, dee));
  assert.equal(done.suggestion, handle, 'her decide answered the question by a name she was not given');
  assert.match(done.decision, DECISION);
  assert.equal(value<Row | null>(await api.governance({ register: 'decision', id: done.decision }, dee))?.suggestion, handle);
  const again = (await api.decide({ id: handle, decide: { option: 'accept', reason: 'Twice' } }, dee)) as Out;
  assert.equal(again.ok, false);
  assert.doesNotMatch(String(again.refusal?.fix), SPOKEN, `refused as ${again.refusal?.fix}`);
  /* THE OWNER STILL READS THE NUMBERS, in the answer and in the sentence. */
  const owners = (await api.decide({ id: 'SG7', decide: { option: 'accept', reason: 'Twice' } }, owner)) as Out;
  assert.match(String(owners.refusal?.fix), /\bSG7\b/u);
  sql.close();
});

test('(5) A HANDLE TO A HIDDEN QUESTION ANSWERS AS ONE TO NO EVENT, by id and as a cursor, so it is no oracle either', async () => {
  const { sql, api, member, diary } = await busy();
  const wren = await member({ registers: { obligations: 'read' } });
  const hidden = sql.one<{ id: string }>("SELECT id FROM event WHERE kind = 'suggest' AND target = ? ORDER BY rowid LIMIT 1", `suggestion:${diary[0]}`)!.id;
  const hiddenDecision = sql.one<{ id: string }>("SELECT id FROM event WHERE kind = 'decide' AND target = 'decision:D2'")!.id;
  const nobody = '01JZ8QK3F7R2M9V4XN6TCB5HAD';

  assert.equal(value(await api.governance({ id: `q.${hidden}` }, wren)), null, 'a Diary question opened by its handle');
  assert.equal(value(await api.governance({ id: `q.${nobody}` }, wren)), null);
  assert.equal(value(await api.governance({ register: 'decision', id: `d.${hiddenDecision}` }, wren)), null, 'a Diary decision opened by its handle');

  const refused = async (cursor: string): Promise<Out['refusal']> => {
    const out = (await api.governance({ status: 'all', cursor }, wren)) as Out;
    assert.equal(out.ok, false, `${cursor} paged`);
    return out.refusal;
  };
  const missing = await refused('SG999');
  assert.deepEqual(await refused(`q.${hidden}`), missing, 'a hidden handle is refused in other words than a missing number');
  assert.deepEqual(await refused(`q.${nobody}`), missing);
  assert.deepEqual(await refused('SG2'), missing);
  sql.close();
});
