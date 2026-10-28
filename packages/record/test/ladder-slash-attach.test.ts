/**
 * Slash earns an attach ("Slash may act on its own", "always undoable", "never money"): ten attach
 * questions kept as they were offer the next rung once, in words that say what it does and that it asked; an Undo takes
 * it back to Ask and the next asks again; an attach on a row with an amount is on the money floor and is never offered.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SLASH, type ChangeKind } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { ATTACH_VERB, kindWords, ladder } from '../src/ladder.ts';
import * as changeKind from '../../kernel/src/change-kind.ts';
import { openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { PEOPLE as NAMES } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 15, 12);

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** The attach kind as the kernel makes it (`kindOfAttach`), its amount putting it on the money floor. */
const attachOf = (hasAmount = false): ChangeKind => {
  const made = (changeKind as { kindOfAttach?: (list: string, hasAmount: boolean) => ChangeKind }).kindOfAttach;
  return made !== undefined ? made('people', hasAmount) : { key: `people:${ATTACH_VERB}`, list: 'people', verb: ATTACH_VERB, floor: hasAmount ? 'money' : null };
};

async function record() {
  const sql = openSqlite();
  let at = NOW;
  const clock = { now: () => at };
  const api = await createRecordApi({ sql, clock: clock as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([PEOPLE]));
  for (const p of NAMES.slice(0, 2)) value(await api.create({ register: 'people', fields: { name: p.name, email: p.email } }, owner));
  const trust = ladder({ sql, kernel: api.kernel, now: () => at });
  const names = { agent: 'Slash', list: (id: string) => api.kernel.register(id)?.name ?? id };
  return { api, sql, trust, names, later: (ms: number) => (at += ms) };
}

const offers = (sql: NodeSql) => sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' AND opened_by = 'rule:ladder' ORDER BY rowid");
/** One question as the owner reads it: its words and its body. */
type Asked = { question: string; body: { about: string; options: { id: string; because: string }[] } };
const asked = async (api: Awaited<ReturnType<typeof createRecordApi>>, id: string): Promise<Asked> => value<Asked>(await api.governance({ register: 'suggestion', id }, owner));
const rungOf = (sql: NodeSql, kind: string) => sql.one<{ rung: string; dropped_at: string | null }>('SELECT rung, dropped_at FROM ladder WHERE agent = ? AND kind = ?', SLASH, kind);

test("THE VERB IS THE KERNEL'S, said here until the kernel's index hands it out", () => {
  assert.equal(ATTACH_VERB, changeKind.ATTACH);
  assert.equal(kindWords(attachOf(), () => 'People'), 'put a name on the right person');
});

test('TEN KEPT ATTACH QUESTIONS OFFER SLASH THE NEXT RUNG ONCE, in words that say what it does and that it asked', async () => {
  const { api, sql, trust, names, later } = await record();
  for (let i = 0; i < 9; i += 1) {
    trust.kept(SLASH, [attachOf()], names);
    later(60_000);
  }
  assert.equal(offers(sql).length, 0, 'nine kept is not ten');
  trust.kept(SLASH, [attachOf()], names);
  const filed = offers(sql);
  assert.equal(filed.length, 1);
  const { question, body } = await asked(api, filed[0]!.id);
  assert.equal(question, 'Let Slash put a name on the right person without asking? It asked 10 times and you kept every one.');
  assert.equal(body.about, 'Slash');
  assert.match(body.options.find((o) => o.id === 'yes')!.because, /listed under Matched for you with its Undo/u);
  /* NO GRANT'S ID AND NO KIND'S KEY IN WHAT A PERSON READS. */
  assert.doesNotMatch(question + JSON.stringify(body), /people:attach|t_[a-z]/u);
  /* AN ELEVENTH KEPT WHILE IT WAITS FILES NO SECOND ONE. */
  trust.kept(SLASH, [attachOf()], names);
  assert.equal(offers(sql).length, 1);
  sql.close();
});

test('AFTER ACCEPT THE ATTACH LANDS AT DO AND TELL, and Slash is listed with the kind in words', async () => {
  const { api, sql, trust, names } = await record();
  for (let i = 0; i < 10; i += 1) trust.kept(SLASH, [attachOf()], names);
  value(await api.decide({ id: offers(sql)[0]!.id, decide: { option: 'yes', reason: '' } }, owner));
  assert.equal(rungOf(sql, 'people:attach')?.rung, 'tell');
  assert.equal(trust.rungFor(SLASH, 'write', [attachOf()]), 'tell');
  const slash = trust.standing().agents.find((a) => a.agent === 'Slash');
  assert.deepEqual(slash?.kinds.map((k) => [k.kind, k.rung]), [['put a name on the right person', 'tell']]);
  sql.close();
});

test('AN UNDO TAKES SLASH BACK TO ASK on attaching, says why, and the next attach asks again', async () => {
  const { api, sql, trust, names } = await record();
  for (let i = 0; i < 10; i += 1) trust.kept(SLASH, [attachOf()], names);
  value(await api.decide({ id: offers(sql)[0]!.id, decide: { option: 'yes', reason: '' } }, owner));
  trust.drop(SLASH, ['people:attach'], 'undone');
  assert.equal(trust.rungFor(SLASH, 'write', [attachOf()]), 'ask', 'the next one asks');
  const kind = trust.standing().agents.find((a) => a.agent === 'Slash')!.kinds[0]!;
  assert.equal(kind.rung, 'ask');
  assert.equal(kind.dropped?.why, 'A change like this was undone.');
  /* CLIMBING AGAIN STARTS FROM NOTHING: nine more kept is not an offer. */
  for (let i = 0; i < 9; i += 1) trust.kept(SLASH, [attachOf()], names);
  assert.equal(offers(sql).length, 0);
  trust.kept(SLASH, [attachOf()], names);
  assert.equal(offers(sql).length, 1, 'ten more kept offer it once again');
  sql.close();
});

test('AN OFFER WAITING WHEN AN ATTACH IS UNDONE IS WITHDRAWN in words that say Slash asks again', async () => {
  const { api, sql, trust, names } = await record();
  for (let i = 0; i < 10; i += 1) trust.kept(SLASH, [attachOf()], names);
  const id = offers(sql)[0]!.id;
  trust.drop(SLASH, ['people:attach'], 'undone');
  assert.equal(offers(sql).length, 0);
  assert.equal(value<{ status: string }>(await api.governance({ register: 'suggestion', id }, owner)).status, 'resolved');
  const said = sql.one<{ note: string | null }>("SELECT note FROM event WHERE target = ? AND kind = 'resolve'", `suggestion:${id}`);
  assert.equal(said?.note, 'A change like this was undone. Slash asks again before it puts a name on anyone.');
  sql.close();
});

test('AN ATTACH ON A ROW WITH AN AMOUNT IS NEVER OFFERED, however many are kept', async () => {
  const { sql, trust, names } = await record();
  assert.equal(attachOf(true).floor, 'money');
  for (let i = 0; i < 25; i += 1) trust.kept(SLASH, [attachOf(true)], names);
  assert.equal(offers(sql).length, 0);
  assert.equal(rungOf(sql, attachOf(true).key), undefined, 'no rung is kept for it at all');
  assert.equal(trust.rungFor(SLASH, 'write', [attachOf(true)]), 'ask');
  sql.close();
});

test("ANOTHER AGENT'S ATTACH OFFER KEEPS ITS GRANT'S WORDS, with the attach said as what it does", async () => {
  const { api, sql, trust } = await record();
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  for (let i = 0; i < 10; i += 1) trust.kept('t_claude', [attachOf()], { agent: 'Claude Code', list: () => 'People' });
  assert.equal((await asked(api, offers(sql)[0]!.id)).question, 'Claude Code has made 10 changes like this and you kept them all. Let it put a name on the right person without asking?');
  sql.close();
});
