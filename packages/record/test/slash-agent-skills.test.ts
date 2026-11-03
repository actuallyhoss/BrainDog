/**
 * THE SKILLS THE AGENTS ADD-ON SHIPS reach a record the first night, as one question, and a newer text reaches a record
 * still holding the old one as it came (`noticeWhole` in `src/slash.ts`).
 *
 * THE REAL CATALOGUE, so what is held here is what a host offers: `seedCatalogue()`, whose agents entry carries
 * `AGENTS_SKILLS`. A version 2 is made from it by `shipping`, as the add-on would ship one, so no test here waits on a
 * second version of a skill being written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type CatalogueEntry } from '../src/index.ts';
import { noticeUsage, type Offered, type Usage } from '../src/slash.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';
import { AGENTS_SKILLS } from '../../seed/src/packs/agents-skills.ts';
import { seedCatalogue } from '../../seed/src/usecases/catalogue.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const DAY = 86_400_000;

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

/** The catalogue with the agents add-on shipping each skill at the next version, the text it replaced kept in `was`. */
const shipping = (): CatalogueEntry[] =>
  seedCatalogue().map((e) =>
    e.id === 'agents' ? { ...e, skills: AGENTS_SKILLS.map((s) => ({ ...s, body: `${s.body}\nOne more step.\n`, rev: s.rev + 1, was: [...(s.was ?? []), s.body] })) } : e,
  ) as CatalogueEntry[];

/** A fresh record with agents on, put in as an owner says yes to it. */
async function fresh(catalogue: CatalogueEntry[] = seedCatalogue() as CatalogueEntry[]) {
  const now = { at: Date.UTC(2026, 9, 9, 3) };
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => now.at } as never, catalogue });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const asked = value<{ id: string }>(await api.propose({ question: 'Turn on agents?', body_kind: 'pack', body: { install: 'agents' } }, owner));
  value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  return { api, sql, now };
}

const skillsOf = (sql: ReturnType<typeof openSqlite>) =>
  sql
    .all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'skills' AND deleted_at IS NULL ORDER BY seq")
    .map((r) => JSON.parse(r.fields) as { name: string; body: string; rev: number; managed: boolean; trigger: string });

const questions = (sql: ReturnType<typeof openSqlite>) =>
  sql.all<{ id: string; status: string; body: string }>("SELECT id, status, body FROM suggestion WHERE body_kind = 'rowset' AND opened_by = 'slash' ORDER BY rowid");

test('A FRESH RECORD WITH AGENTS ON is offered both skills the first night, in one question, and a yes writes them as shipped', async () => {
  const { api, sql } = await fresh();
  const night = await api.slashTick();
  assert.ok(night.ran, JSON.stringify(night));
  const asked = questions(sql);
  assert.equal(asked.length, 1, JSON.stringify(night));
  assert.equal(
    api.kernel.question(asked[0]!.id),
    'Give your agents the skills after-an-import and keep-a-record-current? The Agents plugin ships them, and Skills has neither yet.',
  );
  assert.equal(skillsOf(sql).length, 0, 'filing wrote a skill');

  value(await api.decide({ id: asked[0]!.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  const held = skillsOf(sql);
  assert.deepEqual(held.map((s) => [s.name, s.rev, s.managed]), [['after-an-import', 2, true], ['keep-a-record-current', 1, true]]);
  for (const s of held) assert.equal(s.body, AGENTS_SKILLS.find((x) => x.name === s.name)!.body);
  sql.close();
});

test('A SKILLS QUESTION DECLINED is not asked again, and nothing is offered twice while it waits', async () => {
  const { api, sql, now } = await fresh();
  await api.slashTick();
  now.at += DAY;
  await api.slashTick();
  assert.equal(questions(sql).length, 1, 'the waiting question was filed again');
  value(await api.decide({ id: questions(sql)[0]!.id, resolved_as: 'wont-fix', reason: 'not now' }, owner));
  now.at += DAY;
  await api.slashTick();
  assert.equal(questions(sql).length, 1, 'a declined question came back');
  sql.close();
});

test('A NEWER TEXT reaches a skill the record wrote and nobody changed, as its next version, and never one somebody edited', async () => {
  const { api, sql, now } = await fresh();
  await api.slashTick();
  value(await api.decide({ id: questions(sql)[0]!.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  /* SOMEBODY EDITS ONE: keep-a-record-current is theirs now in all but name. */
  const keep = sql.one<{ id: string; fields: string }>("SELECT id, fields FROM entry WHERE register = 'skills' AND json_extract(fields, '$.name') = 'keep-a-record-current'")!;
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.body', ?) WHERE id = ?", 'My own steps.', keep.id);

  const next = await createRecordApi({ sql, clock: { now: () => now.at + DAY } as never, catalogue: shipping() });
  const night = await next.slashTick();
  assert.ok(night.ran, JSON.stringify(night));
  const asked = questions(sql).filter((q) => q.status === 'open');
  assert.equal(asked.length, 1, JSON.stringify(night));
  assert.equal(next.kernel.question(asked[0]!.id), 'Take version 3 of the skill after-an-import? The Agents plugin ships a newer text, and yours is still version 2 as it came.');
  value(await next.decide({ id: asked[0]!.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  const held = skillsOf(sql);
  assert.deepEqual(held.map((s) => [s.name, s.rev]), [['after-an-import', 3], ['keep-a-record-current', 1]]);
  assert.match(held[0]!.body, /One more step\.\n$/u);
  assert.equal(held[1]!.body, 'My own steps.');
  sql.close();
});

test('A SKILL EDITED AFTER ITS NEWER TEXT WAS ASKED keeps the edit: the yes is refused, never written over it', async () => {
  const { api, sql, now } = await fresh();
  await api.slashTick();
  value(await api.decide({ id: questions(sql)[0]!.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  const next = await createRecordApi({ sql, clock: { now: () => now.at + DAY } as never, catalogue: shipping() });
  await next.slashTick();
  const asked = questions(sql).filter((q) => q.status === 'open');
  assert.equal(asked.length, 2, 'both untouched skills are offered their next text');
  /* NAMED AS A PERSON SAYS IT, never by its id. */
  for (const q of asked) assert.match(String((JSON.parse(q.body) as { rows: { at: string }[] }).rows[0]!.at), /^skills#\d+$|^[A-Z]+\d+$/u);
  /* HIS OWN TEXT LANDS FIRST, by a change he accepted (a skill's text changes only so), which moves its version on. */
  const after = sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'skills' AND json_extract(fields, '$.name') = 'after-an-import'")!;
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.body', ?), version = version + 1 WHERE id = ?", 'My own steps.', after.id);
  const mine = asked.find((q) => next.kernel.question(q.id)!.includes('after-an-import'))!;
  const yes = (await next.decide({ id: mine.id, decide: { option: 'accept', reason: 'yes' } }, owner)) as Out;
  assert.equal(yes.ok, false, 'a yes wrote over an edit made after the question');
  assert.equal(skillsOf(sql).find((s) => s.name === 'after-an-import')!.body, 'My own steps.');
  sql.close();
});

/** A reading of a record a day old with agents on and the skills named, for the rule alone. */
const usage = (skills: string[], held: Usage['held'] = []): Usage =>
  ({
    at: '2026-10-09T03:00:00.000Z',
    firstWrite: '2026-10-08T03:00:00.000Z',
    ageDays: 1,
    listening: { pages: false, lists: false },
    lists: [],
    pages: [],
    agents: [],
    packs: [{ id: 'agents', title: 'Agents', on: true }],
    speaking: null,
    writes: { all30: 0, agents30: 0, agents90: 0 },
    tone: null,
    skills,
    held,
  }) as unknown as Usage;
const AGENTS: Offered[] = [{ id: 'agents', kind: 'pack', title: 'Agents', modules: [], showsAgents: false, skills: AGENTS_SKILLS }];

test('ONLY WHAT IS MISSING is offered, and a record that keeps no skills is offered none', () => {
  const one = noticeUsage(usage(['after-an-import']), AGENTS);
  assert.equal(one.noticed.find((n) => n.kind === 'skills')?.text, 'The Agents plugin ships a skill for agents that you do not have in Skills yet: keep-a-record-current.');
  assert.deepEqual(one.drafts.map((d) => d.question), ['Give your agents the skill keep-a-record-current? The Agents plugin ships it, and Skills has none by that name yet.']);
  assert.deepEqual((one.drafts[0]!.body.rows as { managed: boolean; rev: number }[]).map((r) => [r.managed, r.rev]), [[true, 1]]);
  assert.equal(noticeUsage(usage(['after-an-import', 'keep-a-record-current']), AGENTS).drafts.length, 0);
  assert.equal(noticeUsage({ ...usage([]), skills: null }, AGENTS).drafts.length, 0);
  /* AND THE SAME VERSION, OR A TEXT THE ADD-ON NEVER SHIPPED, IS NO NEWER TEXT. */
  const s = AGENTS_SKILLS[0]!;
  assert.equal(noticeUsage(usage(['after-an-import', 'keep-a-record-current'], [{ at: 'e1', version: 1, name: s.name, rev: s.rev, body: s.body }]), AGENTS).drafts.length, 0);
});
