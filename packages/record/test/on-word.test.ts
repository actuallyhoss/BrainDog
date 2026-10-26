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

const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
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

/** A choice of two, filed by the agent. */
const choice = async (api: Api): Promise<string> =>
  value<{ id: string }>(
    await api.propose(
      { question: 'Ship Friday or wait?', body_kind: 'options', body: { options: [{ id: 'ship', label: 'Ship Friday', because: 'Ready.' }, { id: 'wait', label: 'Wait', because: 'Safer.' }] } } as never,
      agent('c-filer'),
    ),
  ).id;

/* ── a question answered on his word ───────────────────────────────────── */

test('ON HIS WORD A RUN ANSWERS A QUESTION AS HIS, his words and the run kept on the decision, and Undo takes it back', async () => {
  const { api, sql } = await record();
  const a = rowsAsked(api, 'Write the bounce report');
  const ctx = agent();
  const done = value<Mine>(await api.instructionsMine({ answer: a, option: 'yes', said: 'Yes, add the bounce report.' } as never, ctx));
  const run = done.run;
  assert.equal(done.answered?.option, 'accept', 'his "yes" is the yes this question takes');
  assert.equal(done.answered?.said, `Answered ${a} with accept, on Teodor's word. Undo is in BrainDog.`);
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
  assert.match(refusal(await api.instructionsMine({ answer: a }, ctx)).fix, /send option and said/u);
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
  for (const out of [
    await api.erase({ subjects: ['tasks#1'] } as never, as),
    await api.deleteRecord({ slug: 'the-studio' }, as),
    await api.listGrants(as),
    await api.setDeclaration({ id: 'register.x', kind: 'register', body: {} } as never, as),
    await api.setPref({ key: ON_WORD_PREF, value: true }, as),
  ]) {
    const no = refusal(out);
    assert.equal(no.code, 'NEEDS_BROWSER_SESSION');
    assert.match(no.fix, /answers on your word and does nothing more/u);
  }
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
  assert.equal(openCount(sql), waiting, 'no question was filed');
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
