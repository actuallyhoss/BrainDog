/**
 * Spark reading how a record is used (`src/spark.ts`, `loop/research-spark.md` S15): what it notices, what it proposes, and
 * that every proposal goes through the same door as a token's and changes nothing until the owner accepts it.
 *
 * THE RECORDS ARE REAL. Packs are installed by an accepted proposal, rows are written through the kernel with the clock moved
 * day by day, and pages are opened and lists read through the API, so the observations are the ones a browser leaves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normaliseUseCase, useCasePack } from '@braindog/declare';

import { createRecordApi, type CallContext, type CatalogueEntry, type SparkModel } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 17, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const manifest = (pack: string) => ({ pack, version: '1.0.0', summary: `${pack}.`, author: 'BrainDog', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} } });
const list = (pack: string, register: string, name: string) => ({ register, name, title: 'what', pack, fields: [{ id: 'what', type: 'text', required: true }] });
const page = (slug: string, title: string, register: string, section: string) => ({
  page: slug,
  title,
  nav: { section, order: 10 },
  requires: [`register.${register}`],
  blocks: [{ kind: 'table', source: `register.${register}`, span: 12, empty: 'Nothing yet.' }],
});

const WORK = { ...manifest('work'), declarations: [list('work', 'tasks', 'Tasks'), page('work', 'Work', 'tasks', 'Work')] };
const NOTES = { ...manifest('notes'), declarations: [list('notes', 'jottings', 'Jottings'), page('notes', 'Notes', 'jottings', 'Notes')] };
/** A page opened now and then, so pages being opened is recorded. */
const DIARY = { ...manifest('diary'), declarations: [list('diary', 'days', 'Days'), page('diary', 'Diary', 'days', 'Diary')] };
/** A list with no page of its own. */
const LOG = { ...manifest('log'), declarations: [list('log', 'logbook', 'Logbook')] };
/** A pack whose page shows what agents did. */
const WATCH = {
  ...manifest('watch'),
  declarations: [{ page: 'watch', title: 'Watch', nav: { section: 'Agents', order: 10 }, blocks: [{ kind: 'agents', heading: 'What agents did', span: 12, source: 'activity', empty: 'Nothing yet.' }] }],
};

const useCase = (id: string, title: string, register: string, name: string) => {
  const u = normaliseUseCase({
    usecase: id,
    version: '1.0.0',
    title,
    summary: `${title}.`,
    author: 'BrainDog',
    license: 'MIT',
    audience: 'individual',
    tone: 'plain',
    signals: [id],
    modules: [],
    voice: { home: title },
    pack: { ...manifest(`usecase-${id}`), declarations: [list(`usecase-${id}`, register, name), page(`${id}-home`, title, register, title)] },
  });
  assert.ok(u.ok);
  return useCasePack(u.value)!;
};

const entry = (id: string, title: string, doc: Record<string, unknown>, kind: 'pack' | 'usecase' = 'pack'): CatalogueEntry => ({ id, kind, title, summary: `${title}.`, modules: [], doc: () => doc });

const CATALOGUE: CatalogueEntry[] = [
  entry('work', 'Work', WORK),
  entry('notes', 'Notes', NOTES),
  entry('log', 'Log', LOG),
  entry('diary', 'Diary', DIARY),
  entry('watch', 'Watch', WATCH),
  entry('usecase-study', 'Study', useCase('study', 'Study', 'courses', 'Courses'), 'usecase'),
  entry('usecase-garden', 'Garden', useCase('garden', 'Garden', 'plants', 'Plants'), 'usecase'),
];

async function record(options: { model?: SparkModel } = {}) {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 120 * DAY);
  const api = await createRecordApi({ sql, clock, catalogue: CATALOGUE, ...(options.model ? { sparkModel: options.model } : {}) });
  const install = async (body: Record<string, unknown>, kind: 'pack' | 'arrange' = 'pack') => {
    const asked = value<{ id: string }>(await api.propose({ question: 'Set up?', body_kind: kind, body }, owner));
    value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  };
  const day = (n: number) => clock.set(NOW - n * DAY);
  return { api, sql, clock, install, day };
}

type Reading = {
  model: string | null;
  quiet: string | null;
  noticed: { kind: string; subject: string; text: string }[];
  drafts: { question: string; body_kind: string; asked: { id: string; status: string } | null }[];
  waiting: { id: string; question: string }[];
};
type Filed = { by: string; filed: { id: string; question: string; by: string }[]; skipped: { question: string; why: string }[]; dropped: string[] };

/** A record four months old: Work used by an agent, a Logbook filled by hand with no page, Notes left alone. */
async function used(options: { model?: SparkModel } = {}) {
  const r = await record(options);
  for (const id of ['work', 'notes', 'log', 'diary']) await r.install({ install: id });
  for (const n of [80, 60, 40]) {
    r.day(n);
    value(await r.api.page({ slug: 'work' }, owner));
    value(await r.api.page({ slug: 'diary' }, owner));
    value(await r.api.list({ register: 'tasks' }, owner));
    value(await r.api.list({ register: 'logbook' }, owner));
  }
  for (const n of [20, 12, 5]) {
    r.day(n);
    for (let i = 0; i < 4; i++) value(r.api.kernel.create('tasks', { what: `Ticket ${n}.${i}` }, { actor: 'agent:claude' }));
    for (let i = 0; i < 2; i++) value(r.api.kernel.create('logbook', { what: `Entry ${n}.${i}` }, { actor: 'p_owner' }));
  }
  r.day(0);
  return r;
}

test('SPARK READS HOW A RECORD IS USED and says what it noticed in plain sentences', async () => {
  const { api, sql } = await used();
  const seen = value<Reading>(await api.spark({}, owner));
  assert.equal(seen.model, null);
  assert.equal(seen.quiet, null);
  const said = Object.fromEntries(seen.noticed.map((n) => [`${n.kind}:${n.subject}`, n.text]));
  assert.equal(said['grows:tasks'], 'Tasks gained 12 rows in the last thirty days, on 3 separate days.');
  assert.equal(said['grows:logbook'], 'Logbook gained 6 rows in the last thirty days, on 3 separate days.');
  assert.equal(said['agents:agent:claude'], 'An agent made 12 changes in the last thirty days, mostly in Tasks.');
  assert.equal(said['unopened:notes'], 'Nobody has opened Notes in ninety days.');
  assert.equal(said['untouched:notes'], 'Nothing in Notes has been opened or changed in ninety days.');
  assert.equal(said['unopened:work'], undefined, 'a page opened this quarter was called unopened');
  for (const n of seen.noticed) assert.ok(!n.text.includes('—'), `an em dash in: ${n.text}`);

  assert.deepEqual(
    seen.drafts.map((d) => [d.body_kind, d.question]),
    [
      ['arrange', 'Give Logbook a page of its own? It gained 6 rows in the last thirty days, and no page shows it yet.'],
      ['pack', 'Add Watch, so you can see what agents do here? They made 12 changes in the last thirty days.'],
      ['pack', 'Turn off Notes? Nothing in it has been opened or changed in ninety days. Its rows stay, and you can turn it back on.'],
    ],
  );
  assert.ok(seen.drafts.every((d) => d.asked === null));

  /* READING WRITES NOTHING, and a token cannot read it. */
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE opened_by = 'spark'").length, 0);
  assert.equal((await api.spark({}, agent) as Out).refusal?.code, 'NEEDS_BROWSER_SESSION');
  assert.equal((await api.sparkPropose({}, agent) as Out).refusal?.code, 'NEEDS_BROWSER_SESSION');
  sql.close();
});

test('SPARK FILES ITS PROPOSALS THROUGH THE SAME DOOR, and only the owner accepting changes the record', async () => {
  const { api, sql } = await used();
  const out = value<Filed>(await api.sparkPropose({}, owner));
  assert.equal(out.by, 'rules');
  assert.equal(out.filed.length, 3);
  assert.deepEqual(out.skipped, []);

  /* FILED AS SPARK, WHICH MAY SUGGEST AND NOTHING ELSE, and nothing about the record moved. */
  assert.deepEqual(sql.all<{ kind: string }>("SELECT DISTINCT kind FROM event WHERE actor = 'spark'").map((e) => e.kind), ['suggest']);
  assert.ok(!api.kernel.packStates().some((p) => p.id === 'watch'));
  assert.ok(api.kernel.packStates().find((p) => p.id === 'notes')?.disabled_at === null);

  /* THE BODIES ARE THE RECORD'S OWN READING: the install carries its plan, the page its lint-checked declaration. */
  const [page, watch, off] = out.filed.map((f) => api.kernel.governanceRow('suggestion', f.id) as { body: Record<string, unknown>; body_kind: string });
  assert.ok(Array.isArray(watch!.body.plan), 'the install was filed without its plan');
  assert.deepEqual(off!.body.disable, 'notes');
  assert.equal((page!.body.pages as { id: string }[])[0]!.id, 'page.logbook');

  /* THE CAP HOLDS, AND ASKING AGAIN FILES NOTHING. */
  const again = value<Filed>(await api.sparkPropose({}, owner));
  assert.equal(again.filed.length, 0);
  assert.ok(again.skipped.every((s) => s.why === 'Spark has asked this before.'), JSON.stringify(again.skipped));

  const reading = value<Reading>(await api.spark({}, owner));
  assert.equal(reading.waiting.length, 3);
  assert.ok(reading.drafts.every((d) => d.asked?.status === 'open'));

  /* ACCEPTED, THE PAGE LANDS AND THE PACK GOES OFF; DISMISSED, IT IS NEVER ASKED AGAIN. */
  value(await api.decide({ id: out.filed[0]!.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  value(await api.decide({ id: out.filed[2]!.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  value(await api.decide({ id: out.filed[1]!.id, resolved_as: 'wont-fix', reason: 'not now' }, owner));
  assert.ok(api.kernel.pages().some((p) => p.slug === 'logbook'));
  assert.notEqual(api.kernel.packStates().find((p) => p.id === 'notes')?.disabled_at, null);

  const after = value<Reading>(await api.spark({}, owner));
  assert.equal(after.waiting.length, 0);
  assert.deepEqual(after.drafts.map((d) => [d.question.slice(0, 9), d.asked?.status]), [['Add Watch', 'resolved']]);
  assert.equal(value<Filed>(await api.sparkPropose({}, owner)).filed.length, 0, 'a dismissed proposal was asked again');
  sql.close();
});

test('A YOUNG RECORD IS WATCHED, NOT ADVISED', async () => {
  const { api, sql, install, day } = await record();
  await install({ install: 'log' });
  for (const n of [117, 115, 113]) {
    day(n);
    for (let i = 0; i < 3; i++) value(api.kernel.create('logbook', { what: `Entry ${n}.${i}` }, { actor: 'p_owner' }));
  }
  const seen = value<Reading>(await api.spark({}, owner));
  assert.equal(seen.quiet, 'This BrainDog is 7 days old. Spark waits for two weeks of use before it suggests changes.');
  assert.ok(seen.noticed.some((n) => n.kind === 'grows' && n.subject === 'logbook'));
  assert.deepEqual(seen.drafts, []);
  assert.deepEqual(value<Filed>(await api.sparkPropose({}, owner)).filed, []);
  sql.close();
});

test('THE TONE FOLLOWS USE: another use case taking most of what is added is offered the voice', async () => {
  const { api, sql, install, day } = await record();
  await install({ usecase: 'study', why: ['Studying.'] }, 'arrange');
  await install({ install: 'usecase-garden' });
  assert.equal(value<{ voice: { pack: string } }>(await api.arrangement({}, owner)).voice.pack, 'usecase-study');
  day(25);
  value(api.kernel.create('courses', { what: 'Botany' }, { actor: 'p_owner' }));
  for (const n of [20, 14, 8, 3]) {
    day(n);
    for (let i = 0; i < 3; i++) value(api.kernel.create('plants', { what: `Plant ${n}.${i}` }, { actor: 'p_owner' }));
  }
  day(0);
  const seen = value<Reading>(await api.spark({}, owner));
  const draft = seen.drafts.find((d) => d.body_kind === 'arrange');
  assert.equal(draft?.question, 'Let Garden set the tone? Most of what you added in the last thirty days went there, and BrainDog still speaks as Study.');
  const filed = value<Filed>(await api.sparkPropose({}, owner));
  const id = filed.filed.find((f) => f.question.startsWith('Let Garden'))?.id;
  assert.ok(id, JSON.stringify(filed));
  value(await api.decide({ id: id!, decide: { option: 'accept', reason: 'yes' } }, owner));
  assert.equal(value<{ voice: { pack: string } }>(await api.arrangement({}, owner)).voice.pack, 'usecase-garden');
  sql.close();
});

test('A MODEL DRAFTS BEHIND THE PORT, and what it answers goes through the same checks or is dropped with a reason', async () => {
  const asked: unknown[] = [];
  const model: SparkModel = {
    name: 'test model',
    draft: async (input) => {
      asked.push(input);
      return {
        drafts: [
          { question: 'Turn off Log? You have a page for it now.', body_kind: 'pack', body: { disable: 'log' } },
          { question: 'Install a pack nobody offers?', body_kind: 'pack', body: { install: 'nonsense' } },
          { question: 'Write a row?', body_kind: 'rowset', body: { register: 'tasks', rows: [] } },
          { body_kind: 'pack', body: { disable: 'work' } },
        ],
      };
    },
  };
  const { api, sql } = await used({ model });
  assert.equal(value<Reading>(await api.spark({}, owner)).model, 'test model');
  assert.equal(asked.length, 0, 'reading asked the model');

  const out = value<Filed>(await api.sparkPropose({}, owner));
  assert.equal(asked.length, 1);
  const input = asked[0] as { usage: { lists: unknown[] }; rules: unknown[]; kinds: string[]; most: number };
  assert.ok(input.usage.lists.length >= 3 && input.rules.length === 3);
  assert.deepEqual(input.kinds, ['pack', 'settings', 'arrange']);

  assert.equal(out.by, 'test model');
  assert.deepEqual(out.filed.map((f) => [f.question, f.by]), [['Turn off Log? You have a page for it now.', 'test model']]);
  assert.equal(out.skipped.length, 1);
  assert.match(out.skipped[0]!.why, /nonsense/u);
  assert.deepEqual(out.dropped, ['Proposal 3 was a rowset proposal, and Spark files only pack, settings and arrange.', 'Proposal 4 had no question, or one over 280 characters.']);
  assert.ok(api.kernel.packStates().find((p) => p.id === 'log')?.disabled_at === null, 'a model draft changed the record');
  assert.deepEqual(sql.all<{ kind: string }>("SELECT DISTINCT kind FROM event WHERE actor = 'spark'").map((e) => e.kind), ['suggest']);
  sql.close();
});

test('A MODEL THAT FAILS OR SAYS NOTHING USEFUL leaves the rules to speak', async () => {
  const broken: SparkModel = { name: 'broken', draft: async () => { throw new Error('offline'); } };
  const a = await used({ model: broken });
  const out = value<Filed>(await a.api.sparkPropose({}, owner));
  assert.equal(out.by, 'rules');
  assert.equal(out.filed.length, 3);
  assert.deepEqual(out.dropped, ["The model did not answer, so Spark's own rules drafted these."]);
  a.sql.close();

  const vague: SparkModel = { name: 'vague', draft: async () => 'Consider tidying up.' };
  const b = await used({ model: vague });
  const said = value<Filed>(await b.api.sparkPropose({}, owner));
  assert.equal(said.by, 'rules');
  assert.equal(said.filed.length, 3);
  assert.deepEqual(said.dropped, ['The model did not answer a list of proposals.', "The model proposed nothing Spark could use, so Spark's own rules drafted these."]);
  b.sql.close();
});
