/**
 * An agent acting on the owner's word (the owner's decision of 27 October): a question he told it to answer, and a
 * change the ladder would have asked about, each with his words in `said` (`wordOf`, `wordFault` and `onWordWrite` in
 * `index.ts`, `wordAnswer` in `methods/instructions.ts`).
 *
 * WHAT IS HELD: his words are needed and kept, with the run that carried them, and Undo takes the answer back; his
 * switch "Agents may answer when you tell them" is on until he turns it off, and off it refuses by name; a key, an
 * amount set on what is there, erasing, deleting the record and the keychain stay his in BrainDog, whatever was said;
 * and a write the ladder would have filed lands, counted towards no rung.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { ON_WORD_PREF, createRecordApi, type Asked, type CallContext } from '../src/index.ts';
import { openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 27, 12);

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    state: 'state',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
      { id: 'cost', type: 'money' },
    ],
  } as never,
};

/** A list of keys: every change to it is the `keys` floor. */
const LOGINS = {
  id: 'register.logins',
  kind: 'register' as const,
  body: {
    id: 'logins',
    name: 'Logins',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'password', type: 'secret' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

/** His agent, on a write grant the record holds, as a host hands it over. */
const agent = (client = 'c1'): CallContext => ({
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: client, client: 'claude-code', host: 'mac', repo: 'braindog', agent: 'claude' },
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown): { code: string; fix: string; at?: string; try?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string; try?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => NOW } as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([TASKS, LOGINS]));
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_1', 'teo@vance-studio.example', 'Teodor')");
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  return { api, sql };
}

type Api = Awaited<ReturnType<typeof record>>['api'];
type Mine = { run: string; answered?: { question: string; option: string; decision: string | null; said: string } };

const statusOf = (api: Api, id: string): string | undefined => api.kernel.governanceRow('suggestion', id)?.status as string | undefined;
const tasks = (sql: NodeSql, name: string) => sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'tasks' AND deleted_at IS NULL AND json_extract(fields, '$.name') = ?", name)?.n;
const openCount = (sql: NodeSql) => sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open'")?.n;

/** A set of rows an agent would add, filed by Slash's rules, so an answer writes something and Undo has something to put back. */
const rowsAsked = (api: Api, name: string): string =>
  value<{ id: string }>(api.kernel.propose({ question: `Add ${name}?`, body_kind: 'rowset', body: { register: 'tasks', rows: [{ name }] } }, 'slash', 'rules')).id;

/** A choice of two, filed by Slash's rules: a question the agent asked itself is never its own to answer (`own` below). */
const choice = async (api: Api): Promise<string> =>
  value<{ id: string }>(
    api.kernel.propose(
      { question: 'Ship Friday or wait?', body_kind: 'options', body: { options: [{ id: 'ship', label: 'Ship Friday', because: 'Ready.' }, { id: 'wait', label: 'Wait', because: 'Safer.' }] } } as never,
      'slash',
      'rules',
    ),
  ).id;

/** A choice of two, filed by the agent's own key. */
const ownChoice = async (api: Api): Promise<string> =>
  value<{ id: string }>(
    await api.propose(
      { question: 'Ship Friday or wait?', body_kind: 'options', body: { options: [{ id: 'ship', label: 'Ship Friday', because: 'Ready.' }, { id: 'wait', label: 'Wait', because: 'Safer.' }] } } as never,
      agent('c-filer'),
    ),
  ).id;

/* ── a question answered on his word ───────────────────────────────────── */

test('A QUESTION THE AGENT ASKED IS NOT ANSWERED BY IT, on any word: the person answers it, or the agent takes it back', async () => {
  const { api, sql } = await record();
  const own = await ownChoice(api);
  const out = refusal(await api.instructionsMine({ answer: own, option: 'ship', said: 'Ship it Friday.' } as never, agent()));
  assert.equal(out.code, 'FORBIDDEN');
  assert.equal(out.at, 'answer');
  assert.match(out.fix, /^You asked SG\d+ yourself, so the person answers it in BrainDog\./u);
  assert.equal(out.try, `propose {"withdraw":"${own}"}`);
  assert.equal(statusOf(api, own), 'open');
  sql.close();
});

test('A QUESTION A MEMBER\'S AGENT ASKED IS ANSWERED IN BRAINDOG, though its run signed it; his own other agent\'s is his (audit 31k, RK1)', async () => {
  const { api, sql } = await record();
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_2', 'bob@vance-studio.example', 'Bob')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_2', '*', 'write')");
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_bob', 'p_2', 'hb', 'write', 'Bob Claude', '2026-10-01T00:00:00.000Z')");
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_codex', 'p_1', 'hc', 'write', 'Codex', '2026-10-01T00:00:00.000Z')");
  const as = (token: string, person: string, level: string, client: string): CallContext =>
    ({ principal: { kind: 'token', id: token, scope: 'write', person, level }, session: { client_id: client, client: 'claude-code', host: 'mac', repo: 'braindog', agent: 'claude' } }) as never;
  const ask = async (ctx: CallContext, question = 'Ship Friday or wait?'): Promise<string> =>
    value<{ id: string }>(
      await api.propose(
        { question, body_kind: 'options', body: { options: [{ id: 'ship', label: 'Ship Friday', because: 'Ready.' }, { id: 'wait', label: 'Wait', because: 'Safer.' }] } } as never,
        ctx,
      ),
    ).id;

  const bobs = await ask(as('t_bob', 'p_2', 'write', 'c-bob'));
  assert.match(String(api.kernel.governanceRow('suggestion', bobs)?.opened_by), /^S\d+$/u, 'the question is signed by Bob\'s run');
  const out = refusal(await api.instructionsMine({ answer: bobs, option: 'ship', said: "Yes, do what Bob's agent asked." } as never, agent()));
  assert.equal(out.code, 'FORBIDDEN');
  assert.match(out.fix, /was asked by somebody else/u);
  assert.equal(statusOf(api, bobs), 'open');

  /* IN WORDS OF ITS OWN: the same words again are the question already open, not a second one. */
  const codexs = await ask(as('t_codex', 'p_1', 'owner', 'c-codex'), 'Ship Monday or wait?');
  assert.equal(value<Mine>(await api.instructionsMine({ answer: codexs, option: 'wait', said: 'Wait a week.' } as never, agent())).answered?.option, 'wait');
  sql.close();
});

test('A RUN A MEMBER MADE IN THE APP IS HIS, though no key opened it: his agent\'s question through it is answered in BrainDog (audit 31l, RL1)', async () => {
  const { api, sql } = await record();
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_2', 'bob@vance-studio.example', 'Bob')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_2', '*', 'write')");
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_bob', 'p_2', 'hb', 'write', 'Bob Claude', '2026-10-01T00:00:00.000Z')");
  const bob: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' }, credentialed: true } as never;
  /* RUNS ARE KEPT FOR THE OWNER NOW, so a member makes none today; one from before stands in the record and is made here as it was. */
  const made = value<{ id: string; seq: number }>(api.kernel.create('session', { doing: 'Tidy the Q3 drafts' }, { actor: 'p_2', principal: { kind: 'person' } }));
  const spoken = `S${made.seq}`;
  assert.equal(sql.one<{ t: unknown }>("SELECT json_extract(fields, '$.token_id') AS t FROM entry WHERE id = ?", made.id)?.t ?? null, null, 'no key opened the run');
  const bobsAgent = { principal: { kind: 'token', id: 't_bob', scope: 'write', person: 'p_2', level: 'write' }, session: { spoken, client: 'claude-code', host: 'mac', agent: 'claude' } } as never as CallContext;
  const asked = value<{ id: string }>(
    await api.propose(
      { question: 'Delete the Q3 draft or keep it?', body_kind: 'options', body: { options: [{ id: 'drop', label: 'Delete it', because: 'Old.' }, { id: 'keep', label: 'Keep it', because: 'Safer.' }] } } as never,
      bobsAgent,
    ),
  ).id;
  assert.equal(String(api.kernel.governanceRow('suggestion', asked)?.opened_by), spoken, 'the question is signed by the run Bob made');
  const out = refusal(await api.instructionsMine({ answer: asked, option: 'drop', said: "Yes, do what Bob's agent asked." } as never, agent()));
  assert.equal(out.code, 'FORBIDDEN');
  assert.match(out.fix, /was asked by somebody else/u);
  assert.equal(statusOf(api, asked), 'open');
  sql.close();
});

test('A RUN THE OWNER MADE IN THE APP IS HIS: a member\'s key cannot ask through it (audit 31m, RM1)', async () => {
  const { api, sql } = await record();
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_2', 'bob@vance-studio.example', 'Bob')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_2', '*', 'write')");
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_bob', 'p_2', 'hb', 'write', 'Bob Claude', '2026-10-01T00:00:00.000Z')");
  const made = value<{ id: string; seq: number }>(await api.create({ register: 'session', fields: { doing: 'Tidy the Q3 drafts' } }, owner));
  const spoken = `S${made.seq}`;
  const bobsAgent = { principal: { kind: 'token', id: 't_bob', scope: 'write', person: 'p_2', level: 'write' }, session: { spoken, client: 'claude-code', host: 'mac', agent: 'claude' } } as never as CallContext;
  const out = refusal(
    await api.propose(
      { question: 'Delete the Q3 draft or keep it?', body_kind: 'options', body: { options: [{ id: 'drop', label: 'Delete it', because: 'Old.' }, { id: 'keep', label: 'Keep it', because: 'Safer.' }] } } as never,
      bobsAgent,
    ),
  );
  assert.equal(out.code, 'FORBIDDEN', 'only his own keys work as a run he made');
  sql.close();
});

test('A QUESTION KEEPS THE KEY THAT ASKED, not the shared run it is filed under: the owner\'s agent cannot answer a member\'s (audit 31m, RM1)', async () => {
  const { api, sql } = await record();
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_2', 'bob@vance-studio.example', 'Bob')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_2', '*', 'write')");
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_bob', 'p_2', 'hb', 'write', 'Bob Claude', '2026-10-01T00:00:00.000Z')");
  const made = value<{ id: string; seq: number }>(await api.create({ register: 'session', fields: { doing: 'Tidy the Q3 drafts' } }, owner));
  /* AN AUTOMATION'S RUN, which any key may still work as. */
  sql.exec("UPDATE event SET actor = 'system' WHERE kind = 'create' AND target = ?", `entry:${made.id}`);
  const spoken = `S${made.seq}`;
  const bobsAgent = { principal: { kind: 'token', id: 't_bob', scope: 'write', person: 'p_2', level: 'write' }, session: { spoken, client: 'claude-code', host: 'mac', agent: 'claude' } } as never as CallContext;
  const asked = value<{ id: string }>(
    await api.propose(
      { question: 'Delete the Q3 draft or keep it?', body_kind: 'options', body: { options: [{ id: 'drop', label: 'Delete it', because: 'Old.' }, { id: 'keep', label: 'Keep it', because: 'Safer.' }] } } as never,
      bobsAgent,
    ),
  ).id;
  assert.equal(String(api.kernel.governanceRow('suggestion', asked)?.opened_by), spoken, 'the question is signed by the shared run');
  assert.equal(sql.one<{ d: string | null }>('SELECT drafted_by AS d FROM suggestion WHERE id = ?', asked)?.d, 'token:t_bob', 'and keeps the key that asked');
  const out = refusal(await api.instructionsMine({ answer: asked, option: 'drop', said: 'Yes, do what that run asked.' } as never, agent()));
  assert.equal(out.code, 'FORBIDDEN');
  assert.match(out.fix, /was asked by somebody else/u);
  assert.equal(statusOf(api, asked), 'open');
  sql.close();
});

test('ON HIS WORD A RUN ANSWERS A QUESTION AS HIS, his words and the run kept on the decision, and Undo takes it back', async () => {
  const { api, sql } = await record();
  const a = rowsAsked(api, 'Write the bounce report');
  const ctx = agent();
  const done = value<Mine>(await api.instructionsMine({ answer: a, option: 'yes', said: 'Yes, add the bounce report.' } as never, ctx));
  const run = done.run;
  assert.equal(done.answered?.option, 'accept', 'his "yes" is the yes this question takes');
  assert.match(done.answered?.said ?? '', new RegExp(`^Answered "[^"]+" \\(${a}\\) with yes, on Teodor's word\\. Undo is in BrainDog\\.$`, 'u'));
  assert.equal(statusOf(api, a), 'resolved');
  assert.equal(tasks(sql, 'Write the bounce report'), 1);

  const decision = api.kernel.governanceRow('decision', done.answered!.decision!);
  assert.equal(decision?.decided_by, 'p_1', 'he decided it, not the key');
  assert.equal(decision?.reason, `Teodor told ${run}: "Yes, add the bounce report."`);
  /* SAID IN HISTORY AND ACTIVITY AS GIVEN ON HIS WORD, BY THE RUN THAT CARRIED IT. */
  const lines = value<{ events: { note?: string | null }[] }>(await api.recentHistory({ limit: 50 }, owner)).events;
  assert.ok(
    lines.some((e) => e.note === `Answered by ${run} on Teodor's word: "Yes, add the bounce report."`),
    `no line says it was on his word: ${JSON.stringify(lines.map((e) => e.note).filter(Boolean))}`,
  );

  /* UNDO TAKES IT BACK AS ANY OF HIS ANSWERS. */
  const plan = value<{ hash: string }>(await api.undo({ decision: done.answered!.decision!, dry: true }, owner));
  value(await api.undo({ decision: done.answered!.decision!, hash: plan.hash }, owner));
  assert.equal(statusOf(api, a), 'open');
  assert.equal(tasks(sql, 'Write the bounce report'), 0);

  /* A CHOICE TAKES ITS OWN OPTIONS, and another is refused with them. */
  const b = await choice(api);
  assert.equal(refusal(await api.instructionsMine({ answer: b, option: 'maybe', said: 'Do whatever.' } as never, ctx)).code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(value<Mine>(await api.instructionsMine({ answer: b, option: 'wait', said: 'Wait a week.' } as never, ctx)).answered?.option, 'wait');
  assert.equal(statusOf(api, b), 'resolved');
  /* AND A TOKEN STILL NEVER REACHES `decide` ITSELF. */
  const c = await choice(api);
  assert.equal((await api.decide({ id: c, decide: { option: 'ship', reason: '' } } as never, ctx)).ok, false);
  sql.close();
});

test('HIS WORDS ARE NEEDED: an empty said is refused, and so is an answer with no option', async () => {
  const { api, sql } = await record();
  const a = rowsAsked(api, 'Write it');
  const ctx = agent();
  for (const said of ['', '   ']) {
    const no = refusal(await api.instructionsMine({ answer: a, option: 'accept', said } as never, ctx));
    assert.equal(no.code, 'REQUIRED_MISSING');
    assert.equal(no.at, 'said');
  }
  assert.equal(refusal(await api.instructionsMine({ answer: a, said: 'Go on.' } as never, ctx)).at, 'option');
  /* WITHOUT SAID IT IS AN ORDER'S ANSWER, and with none held it answers nothing, saying how. */
  assert.match(refusal(await api.instructionsMine({ answer: a }, ctx)).fix, /then send option, and said in their words/u);
  /* AND A WRITE WITH AN EMPTY SAID IS NOT LANDED. */
  assert.equal(refusal(await api.create({ register: 'tasks', fields: { name: 'Ship' }, said: '' }, ctx)).code, 'REQUIRED_MISSING');
  assert.equal(statusOf(api, a), 'open');
  assert.equal(tasks(sql, 'Write it'), 0);
  sql.close();
});

test('HIS SWITCH IS ON UNTIL HE TURNS IT OFF; off, his word is refused by its name, and only he turns it', async () => {
  const { api, sql } = await record();
  const a = rowsAsked(api, 'Write it');
  const ctx = agent();
  /* ONLY AN OWNER IN A BROWSER SETS IT: no agent turns it back on. */
  assert.equal(refusal(await api.setPref({ key: ON_WORD_PREF, value: false }, ctx)).code, 'FORBIDDEN');
  assert.equal(api.kernel.prefsOf('p_1')[ON_WORD_PREF], undefined, 'absent, and so on');
  value(await api.setPref({ key: ON_WORD_PREF, value: false }, owner));
  assert.equal(refusal(await api.setPref({ key: ON_WORD_PREF, value: true }, ctx)).code, 'FORBIDDEN');

  const off = refusal(await api.instructionsMine({ answer: a, option: 'accept', said: 'Accept it.' } as never, ctx));
  assert.equal(off.code, 'FORBIDDEN');
  assert.match(off.fix, /"Agents may answer when you tell them" is off in Settings > Agents/u);
  assert.equal(statusOf(api, a), 'open');
  assert.match(refusal(await api.create({ register: 'tasks', fields: { name: 'Ship' }, said: 'Add Ship.' }, ctx)).fix, /is off in Settings > Agents/u);
  assert.equal(tasks(sql, 'Ship'), 0);

  value(await api.setPref({ key: ON_WORD_PREF, value: true }, owner));
  value<Mine>(await api.instructionsMine({ answer: a, option: 'accept', said: 'Accept it.' } as never, ctx));
  assert.equal(statusOf(api, a), 'resolved');
  sql.close();
});

test('NO WORD REACHES A KEY, AN AMOUNT ON WHAT IS THERE, ERASING, DELETING THE RECORD OR THE KEYCHAIN', async () => {
  const { api, sql } = await record();
  const ctx = agent();
  const forbidden = (r: unknown, said: RegExp) => {
    const no = refusal(r);
    assert.equal(no.code, 'FORBIDDEN');
    assert.match(no.fix, said);
  };

  /* A KEY: a write to a list of keys, and a question whose automation calls out with one. */
  forbidden(await api.create({ register: 'logins', fields: { name: 'Bank' }, said: 'Add the bank login.' }, ctx), /about keys/u);
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG900', 'change', ?, 'open', 'system', ?)",
    JSON.stringify({ declaration_id: 'ingest.gold', to: { id: 'ingest.gold', kind: 'ingest', body: {} }, egress: [{ ingest: 'gold', channel: 'pull', key: 'goldapi', host: 'api.goldapi.io' }] }),
    new Date(NOW).toISOString(),
  );
  sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES ('01JZ8QK3F7R2M9V4XN6TCB5HAQ', ?, 'system', 'suggest', 'suggestion:SG900', 'suggestion', 'A change')", new Date(NOW).toISOString());
  forbidden(await api.instructionsMine({ answer: 'SG900', option: 'accept', said: 'Install it.' } as never, ctx), /about keys/u);
  assert.equal(statusOf(api, 'SG900'), 'open');

  /* AN AMOUNT ON WHAT IS THERE: a cost changed, by a write or by a question's answer. Adding an entry with one is filing it. */
  const ship = value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Ship' } }, owner));
  forbidden(await api.update({ register: 'tasks', seq: ship.seq!, patch: { cost: { amount: 5000, currency: 'GBP' } }, said: 'Set it to fifty.' }, ctx), /amount of money/u);
  const priced = value<{ id: string }>(
    api.kernel.propose({ question: 'Price Ship?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: `tasks#${ship.seq}`, version: ship.version, patch: { cost: { amount: 5000, currency: 'GBP' } } }] } }, 'slash', 'rules'),
  ).id;
  forbidden(await api.instructionsMine({ answer: priced, option: 'accept', said: 'Yes, price it.' } as never, ctx), /amount of money/u);
  /* A NO CHANGES NOTHING, so it may be said on his word. */
  value<Mine>(await api.instructionsMine({ answer: priced, option: 'decline', said: 'No, leave it.' } as never, ctx));
  assert.equal(statusOf(api, priced), 'resolved');
  assert.equal(api.kernel.get(`tasks#${ship.seq}`)?.fields.cost ?? null, null);
  const filed = value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Lunch', cost: { amount: 1200, currency: 'GBP' } }, said: 'Log lunch, twelve pounds.' }, ctx));
  assert.equal(filed.fields.name, 'Lunch');

  /* AND WHAT IS AN OWNER'S IN A BROWSER STAYS SO: erasing, deleting the record, the keychain, what this record is. */
  const as: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, registers: '*', credentialed: true, onWord: 'S1' };
  /* THE DOORS NO AGENT EVER OPENS SAY SO BY NAME (`ownerKeeps`), and the rest that his word answers and does nothing more. */
  for (const [out, said] of [
    [await api.erase({ subjects: ['tasks#1'] } as never, as), /No agent does that/u],
    [await api.deleteRecord({ slug: 'the-studio' }, as), /No agent does that/u],
    [await api.listGrants(as), /answers on your word and does nothing more/u],
  ] as const) {
    const no = refusal(out);
    assert.equal(no.code, 'NEEDS_BROWSER_SESSION');
    assert.match(no.fix, said);
  }
  /* AND EVERY OTHER DOOR HIS WORD REACHES, as his switch does (the owner's word of 2 Nov, `admin` in `index.ts`): a change
     to what the record is gets past the door to its own checks, and a setting of his is set. */
  const shape = refusal(await api.setDeclaration({ id: 'register.x', kind: 'register', body: {} } as never, as));
  assert.equal(shape.code, 'PACK_MALFORMED');
  assert.equal(value<{ value: unknown }>(await api.setPref({ key: ON_WORD_PREF, value: true }, as)).value, true);
  sql.close();
});

/* ── a change that would have asked ─────────────────────────────────────── */

test('ON HIS WORD A CHANGE THE LADDER WOULD HAVE ASKED IS WRITTEN, his words in its note, and counts towards no rung', async () => {
  const { api, sql } = await record();
  const ctx = agent();
  const ship = value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Ship' } }, owner));

  /* WITHOUT HIS WORD IT ASKS, as it always did. */
  const asked = value<Asked>(await api.update({ register: 'tasks', seq: ship.seq!, patch: { state: 'done' } }, ctx));
  assert.match(asked.asked.why, /ask until 10 of them have been kept/u);
  assert.equal(api.kernel.get(`tasks#${ship.seq}`)?.fields.state, 'open');
  const waiting = openCount(sql);

  /* WITH IT, IT IS WRITTEN, and nothing more is asked. */
  const done = value<Entry>(await api.update({ register: 'tasks', seq: ship.seq!, patch: { state: 'done' }, said: 'Ship is done, close it.' }, ctx));
  assert.equal(done.fields.state, 'done');
  /* AND THE QUESTION IT ASKED IS TAKEN BACK, since he has said (AK16): nothing more waits, and none was filed. */
  assert.equal(openCount(sql), waiting! - 1, 'a question was filed, or the one it asked was left waiting');
  assert.ok(
    sql.one("SELECT 1 AS y FROM event WHERE note = ? AND target = ?", `On Teodor's word: "Ship is done, close it."`, `entry:${ship.id}`),
    'the change does not say it was on his word',
  );
  /* COUNTED TOWARDS NOTHING: his word is not trust the agent earned. */
  const kept = sql.one<{ n: number }>("SELECT accepted_unchanged AS n FROM ladder WHERE agent = 't_claude' AND kind = 'tasks:move:done'")?.n ?? 0;
  assert.equal(kept, 0);

  /* A NEW ENTRY LIKEWISE, with the agent's own note kept beside his words. */
  const made = value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Book the venue' }, note: 'From the call.', said: 'Add a task to book the venue.' }, ctx));
  assert.equal(made.fields.name, 'Book the venue');
  assert.ok(sql.one('SELECT 1 AS y FROM event WHERE note = ?', `From the call. (On Teodor's word: "Add a task to book the venue.")`));
  sql.close();
});
