/**
 * The New project guide's first plan from a model, and its next milestone, on a record made with this host's own catalogue.
 *
 * A PLAN IS ASKED FOR, NEVER MADE. With a model, what the owner said goes to it and the plan comes back as rows on Decide
 * (`slashForm`); nothing is written until the owner accepts, and then every row lands with its milestone linked. With no
 * model, a model that throws, or an answer outside the guide's limits, nothing is filed and the caller keeps the templates.
 * The model is always a fake here; nothing leaves the machine and no key is used.
 *
 * NO MILESTONE STARTS BY ITSELF. Reaching one asks once on Decide whether to start the next in order, unless the owner turned
 * the guide's setting on, when the next one is marked underway directly.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type SlashModel } from '@braindog/record';
import { seedCatalogue } from '@braindog/seed/usecases/catalogue';
import { useCaseDocument } from '@braindog/seed/usecases';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const SAID = 'I want to start a podcast about slow travel and have no idea where to begin';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const PLAN = {
  plan: {
    milestones: [
      { what: 'Say what the show is about and who it is for', stage: 'idea', why: 'Everything else follows from it.' },
      { what: 'Record a pilot episode', stage: 'build' },
      { what: 'Publish the first three episodes', stage: 'launch' },
    ],
    steps: [
      { what: 'Write one sentence about the show', milestone: 0, by: 2 },
      { what: 'List five places you travelled slowly', milestone: 0, by: 4, how: 'A line each.' },
      { what: 'Record ten minutes on your phone', milestone: 1 },
    ],
    choices: [{ question: 'Alone or with a co-host?', options: 'Alone\nWith a co-host', milestone: 0 }],
    resources: [{ name: 'Three travel shows to learn from', kind: 'example', milestone: 0 }],
  },
};

type Row = { seq: number; fields: Record<string, unknown> };

/** A record with the guide installed as onboarding installs it where a model is configured: its lists, and no rows. */
async function guideRecord(model?: SlashModel) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17, 12)), catalogue: seedCatalogue(), ...(model ? { slashModel: model } : {}) });
  const doc = { ...useCaseDocument('guide', '2026-09-17')! };
  delete doc.seeds;
  const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc }, owner));
  value(await api.installPack({ doc, planHash: planned.diff.planHash }, owner));
  const rows = async (register: string) => value<{ rows: Row[] }>(await api.list({ register, limit: 50 }, owner)).rows;
  return { sql, api, rows };
}

const fake = (answer: () => unknown): SlashModel & { asked: unknown[] } => {
  const asked: unknown[] = [];
  return { name: 'endpoint', asked, draft: async () => ({ drafts: [] }), form: async (input) => (asked.push(input), answer()) };
};

test('A MODEL FORMS A FIRST PLAN FROM WHAT WAS SAID, filed on Decide as rows, made only when the owner accepts, and asked once', async () => {
  const model = fake(() => structuredClone(PLAN));
  const { sql, api, rows } = await guideRecord(model);
  const out = value<{ formed: boolean; id: string; question: string; counts: Record<string, number> }>(await api.slashForm({ usecase: 'guide', said: SAID }, owner));
  assert.equal(out.formed, true);
  assert.deepEqual(out.counts, { milestones: 3, steps: 3, choices: 1, resources: 1 });
  /* THE MODEL WAS HANDED THE SENTENCE AND THE LISTS' LIMITS, and nothing of the record. */
  const input = model.asked[0] as { said: string; lists: { register: string }[]; usage?: unknown };
  assert.equal(input.said, SAID);
  assert.deepEqual(input.lists.map((l) => l.register), ['milestones', 'steps', 'choices', 'resources']);
  assert.equal(input.usage, undefined);

  for (const register of ['milestones', 'steps', 'choices', 'resources']) assert.equal((await rows(register)).length, 0, `${register} has nothing before the owner accepts`);
  const suggestion = sql.one<{ body_kind: string; opened_by: string; status: string }>('SELECT body_kind, opened_by, status FROM suggestion WHERE id = ?', out.id)!;
  assert.deepEqual({ ...suggestion }, { body_kind: 'arrange', opened_by: 'slash', status: 'open' });

  value(await api.decide({ id: out.id, decide: { option: 'accept', reason: 'Looks right.' } } as never, owner));
  const milestones = await rows('milestones');
  const steps = await rows('steps');
  assert.deepEqual(
    milestones.map((m) => [m.fields.what, m.fields.stage, m.fields.state, m.fields.order]).sort((a, b) => Number(a[3]) - Number(b[3])),
    [
      ['Say what the show is about and who it is for', 'idea', 'underway', 1],
      ['Record a pilot episode', 'build', 'not_started', 2],
      ['Publish the first three episodes', 'launch', 'not_started', 3],
    ],
  );
  const step = (what: string) => steps.find((s) => s.fields.what === what)!;
  const linked = sql.all<{ what: string; target: string }>(
    "SELECT json_extract(s.fields, '$.what') AS what, json_extract(m.fields, '$.what') AS target FROM entry s JOIN entry m ON m.id = json_extract(s.fields, '$.milestone') WHERE s.register = 'steps'",
  );
  assert.deepEqual(
    linked.map((l) => [l.what, l.target]).sort(),
    [
      ['List five places you travelled slowly', 'Say what the show is about and who it is for'],
      ['Record ten minutes on your phone', 'Record a pilot episode'],
      ['Write one sentence about the show', 'Say what the show is about and who it is for'],
    ],
  );
  assert.equal(step('Write one sentence about the show').fields.by, '2026-09-19', 'a number of days is written as the day');
  assert.equal(step('Record ten minutes on your phone').fields.state, 'to_do');
  assert.equal((await rows('choices'))[0]!.fields.options, 'Alone\nWith a co-host');
  assert.equal((await rows('resources')).length, 1);

  const again = value<{ formed: boolean; why: string }>(await api.slashForm({ usecase: 'guide', said: SAID }, owner));
  assert.deepEqual({ ...again }, { formed: false, why: 'asked' });
  assert.equal(model.asked.length, 1, 'the model is not asked twice');
});

test('NO MODEL, A MODEL THAT FAILS, OR AN ANSWER OUTSIDE THE GUIDE\'S LIMITS FILES NOTHING, so the templates stand', async () => {
  const none = await guideRecord();
  assert.deepEqual({ ...value<object>(await none.api.slashForm({ usecase: 'guide', said: SAID }, owner)) }, { formed: false, why: 'no-model' });

  const thrown = await guideRecord(fake(() => { throw new Error('down'); }));
  assert.deepEqual({ ...value<object>(await thrown.api.slashForm({ usecase: 'guide', said: SAID }, owner)) }, { formed: false, why: 'failed' });

  const bad = (change: (p: typeof PLAN.plan & Record<string, unknown>) => void) => {
    const p = structuredClone(PLAN);
    change(p.plan as typeof PLAN.plan & Record<string, unknown>);
    return p;
  };
  const table: [string, unknown][] = [
    ['not a plan', 'Here is your plan!'],
    ['a list the guide does not form', bad((p) => { p.tasks = [{ what: 'x' }]; })],
    ['a field a milestone does not take', bad((p) => { (p.milestones[0] as Record<string, unknown>).target = '2026-10-01'; })],
    ['a resource link, which a plan may not carry', bad((p) => { (p.resources[0] as Record<string, unknown>).link = 'https://example.org'; })],
    ['too few milestones', bad((p) => { p.milestones = p.milestones.slice(0, 2); })],
    ['too many steps', bad((p) => { p.steps = Array.from({ length: 13 }, (_, i) => ({ what: `Step ${i}`, milestone: 0 })); })],
    ['a stage the guide does not have', bad((p) => { p.milestones[1]!.stage = 'dream'; })],
    ['a link outside the plan', bad((p) => { p.steps[2]!.milestone = 7; })],
    ['a step with no milestone', bad((p) => { delete (p.steps[0] as Record<string, unknown>).milestone; })],
    ['text past its length', bad((p) => { p.milestones[0]!.what = 'x'.repeat(81); })],
    ['a web address in a step', bad((p) => { p.steps[0]!.what = 'Read www.example.org first'; })],
    ['an email address in a choice', bad((p) => { p.choices[0]!.question = 'Write to someone@example.org?'; })],
    ['a credential in a note', bad((p) => { p.steps[1]!.how = 'Use key ghp_R8x2Lk9Qm4Tz7Vb1Nc6Hd3Jf5Wp0Ys2Ae8Ug'; })],
    ['a day past ninety', bad((p) => { p.steps[0]!.by = 400; })],
  ];
  for (const [what, answer] of table) {
    const { sql, api } = await guideRecord(fake(() => answer));
    const out = value<{ formed: boolean; why: string; detail?: string }>(await api.slashForm({ usecase: 'guide', said: SAID }, owner));
    assert.equal(out.formed, false, what);
    assert.equal(out.why, 'invalid', `${what}: ${out.detail}`);
    assert.equal(sql.all('SELECT id FROM suggestion').length, 0, `${what}: nothing is filed`);
    assert.equal(sql.all('SELECT id FROM entry WHERE deleted_at IS NULL AND register IN (\'milestones\', \'steps\', \'choices\', \'resources\')').length, 0, `${what}: nothing is made`);
  }
});

test('ROWS IN AN ARRANGEMENT ARE HELD TO THE LISTS THE CALLER REACHES (arrange-47): one held to another list is refused at that entry', async () => {
  const { api } = await guideRecord();
  const body = { why: ['A plan.'], rows: [{ register: 'milestones', fields: { what: 'Start' } }] };
  const held: CallContext = { principal: { kind: 'token', id: 'tok_h', scope: 'propose', person: 'p_owner', level: 'owner' }, registers: ['steps'] };
  const put = (await api.propose({ question: 'Add a plan?', body_kind: 'arrange', body } as never, held)) as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(put.ok, false);
  assert.equal(put.refusal?.at, 'body.rows[0]');
  /* AND THE OWNER, WHO REACHES MILESTONES, files it: the four-part question an agent puts is no longer refused for rows. */
  const asked = (await api.propose({ question: 'Add a plan?', body_kind: 'arrange', body } as never, owner)) as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(asked.ok, true, JSON.stringify(asked.refusal));
});

test('A MILESTONE REACHED ASKS ONCE WHETHER TO START THE NEXT ONE, and the guide\'s setting starts it instead', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17, 12)), catalogue: seedCatalogue() });
  const asked = value<{ id: string }>(await api.propose({ question: 'Use the New project guide?', body_kind: 'pack', body: { install: 'usecase-guide' } }, owner));
  value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'yes' } } as never, owner));
  /* NO EXAMPLE ROWS COME WITH THE PACK ANY MORE: a plain install off the catalogue
     plants nothing, so the guide's own template rows, word for word as `guide.ts`'s retired `seeds:` once planted
     them, are written by hand for this test to reach a milestone in. */
  for (const fields of [
    { what: 'Say what it is and who it is for', stage: 'idea', state: 'underway', order: 1 },
    { what: 'Find the people who want it', stage: 'idea', state: 'not_started', order: 2 },
    { what: 'Plan the smallest first version', stage: 'plan', state: 'not_started', order: 3 },
    { what: 'Make the first version', stage: 'build', state: 'not_started', order: 4 },
    { what: 'Share it with the first people', stage: 'launch', state: 'not_started', order: 5 },
    { what: 'Keep it going and learn from it', stage: 'grow', state: 'not_started', order: 6 },
  ])
    value(await api.create({ register: 'milestones', fields }, owner));
  for (const fields of [
    { what: 'Write one sentence about what this is and who it is for', state: 'to_do', order: 1, by: '2026-09-19' },
    { what: 'Name three people who would use it', state: 'to_do', order: 2, by: '2026-09-22' },
    { what: 'Ask one of them what they would want first', state: 'to_do', order: 3, by: '2026-09-26' },
  ])
    value(await api.create({ register: 'steps', fields }, owner));
  const milestones = async () =>
    value<{ rows: Row[] }>(await api.list({ register: 'milestones', limit: 50 }, owner)).rows.sort((a, b) => Number(a.fields.order) - Number(b.fields.order));
  const next = () => sql.all<{ id: string; body: string; status: string }>("SELECT id, body, status FROM suggestion WHERE opened_by = 'slash' AND body_kind = 'rowset'");

  const [first, second, third, fourth] = await milestones();
  assert.equal(first!.fields.state, 'underway');
  assert.equal(next().length, 0, 'nothing is asked while a milestone is underway');

  value(await api.update({ register: 'milestones', seq: first!.seq, patch: { state: 'reached' } }, owner));
  assert.equal((await milestones())[1]!.fields.state, 'not_started', 'the next milestone does not start by itself');
  const filed = next();
  assert.equal(filed.length, 1, 'Decide asks once');
  const question = sql.one<{ q: string }>("SELECT coalesce(to_v, note) AS q FROM event WHERE kind = 'suggest' AND target = ?", `suggestion:${filed[0]!.id}`)?.q;
  assert.equal(question, `You reached "${first!.fields.what}". Start "${second!.fields.what}" next?`);
  value(await api.update({ register: 'steps', seq: 1, patch: { state: 'done' } }, owner));
  assert.equal(next().length, 1, 'another write does not ask again');

  value(await api.decide({ id: filed[0]!.id, decide: { option: 'accept', reason: 'Yes, next.' } } as never, owner));
  assert.equal((await milestones())[1]!.fields.state, 'underway', 'accepting starts it');

  /* DISMISSED, AND SET BACK BY HAND: never asked again for that milestone. */
  value(await api.update({ register: 'milestones', seq: second!.seq, patch: { state: 'reached' } }, owner));
  const third_ = next().find((s) => s.status === 'open')!;
  assert.ok(JSON.parse(third_.body).rows[0].at.endsWith(`#${third!.seq}`), 'the next is the third by order');
  value(await api.decide({ id: third_.id, resolved_as: 'wont-fix', reason: 'Not yet.' } as never, owner));
  value(await api.update({ register: 'steps', seq: 2, patch: { state: 'done' } }, owner));
  assert.equal(next().filter((s) => s.status === 'open').length, 0);

  /* THE SETTING ON: reaching one starts the next directly, signed by who reached it, and asks nothing. */
  value(await api.setPackConfig({ id: 'usecase-guide', values: { start_next_milestone: true } }, owner));
  value(await api.update({ register: 'milestones', seq: third!.seq, patch: { state: 'reached' } }, owner));
  const now = await milestones();
  assert.equal(now.find((m) => m.seq === fourth!.seq)!.fields.state, 'underway');
  assert.equal(next().filter((s) => s.status === 'open').length, 0);
  const by = sql.one<{ actor: string; note: string | null }>("SELECT actor, note FROM event WHERE target = (SELECT 'entry:' || id FROM entry WHERE register = 'milestones' AND seq = ?) ORDER BY rowid DESC LIMIT 1", fourth!.seq)!;
  assert.equal(by.actor, 'p_owner');
});

test('WHEN NO MODEL FORMS A PLAN, THE TEMPLATES WRITTEN AFTER THE LISTS ARE THE ROWS THE PACK WOULD HAVE SEEDED, linked the same way', async () => {
  const { plantedRows, carriedDocument } = await import('@braindog/seed/usecases/install');
  const { linkExamples } = await import('@braindog/seed/usecases/links');
  const { useCase } = await import('@braindog/seed/usecases');
  const guide = useCase('guide')!;
  const shape = (sql: ReturnType<typeof openSqlite>) =>
    sql
      .all<{ register: string; fields: string; target: string | null }>(
        "SELECT e.register, e.fields, json_extract(m.fields, '$.what') AS target FROM entry e LEFT JOIN entry m ON m.id = json_extract(e.fields, '$.milestone') WHERE e.deleted_at IS NULL AND e.register IN ('milestones', 'steps', 'choices', 'resources')",
      )
      .map((r) => {
        const { milestone: _m, ...fields } = JSON.parse(r.fields) as Record<string, unknown>;
        return JSON.stringify([r.register, fields, r.target]);
      })
      .sort();
  const io = (api: Awaited<ReturnType<typeof guideRecord>>['api']) => ({
    rows: async (register: string) => {
      const read = (await api.list({ register, limit: 200 }, owner)) as { ok: boolean; value?: { rows: Row[] } };
      return read.ok ? read.value!.rows : null;
    },
    link: async (register: string, seq: number, field: string, spoken: string | readonly string[]) =>
      ((await api.update({ register, seq, patch: { [field]: spoken as never } }, owner)) as { ok: boolean }).ok,
  });

  for (const said of [SAID, 'I want to start something new']) {
    /* AS BEFORE: the pack with its seeds, then its links. */
    const seeded = openSqlite();
    const before = await createRecordApi({ sql: seeded, clock: fixedClock(Date.UTC(2026, 8, 17, 12)), catalogue: seedCatalogue() });
    const doc = carriedDocument(guide, '2026-09-17', said)!;
    const planned = value<{ diff: { planHash: string } }>(await before.planPack({ doc }, owner));
    value(await before.installPack({ doc, planHash: planned.diff.planHash }, owner));
    const plan = plantedRows(guide, '2026-09-17', said);
    await linkExamples(io(before), 'guide', plan.links ? { links: plan.links } : undefined);

    /* WITH A MODEL THAT FORMED NOTHING: the lists empty, then the same rows written, then the same links. */
    const { sql, api } = await guideRecord(fake(() => 'nothing'));
    assert.equal(value<{ formed: boolean }>(await api.slashForm({ usecase: 'guide', said }, owner)).formed, false);
    for (const row of plan.rows) value(await api.create({ register: row.register, fields: row.fields as never }, owner));
    await linkExamples(io(api), 'guide', plan.links ? { links: plan.links } : undefined);

    assert.deepEqual(shape(sql), shape(seeded), said);
  }
});
