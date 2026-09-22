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

async function record(options: { model?: SparkModel; catalogue?: CatalogueEntry[] } = {}) {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 120 * DAY);
  const api = await createRecordApi({ sql, clock, catalogue: options.catalogue ?? CATALOGUE, ...(options.model ? { sparkModel: options.model } : {}) });
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
  assert.equal(said['unopened:notes'], undefined, 'a page of a pack already said to be untouched was said again');
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

test('A RECORD MADE TODAY STARTED TODAY, not "0 days old"', async () => {
  const { api, sql, install } = await record();
  await install({ install: 'log' });
  value(api.kernel.create('logbook', { what: 'First entry' }, { actor: 'p_owner' }));
  const seen = value<Reading>(await api.spark({}, owner));
  assert.equal(seen.quiet, 'This BrainDog started today. Spark waits for two weeks of use before it suggests changes.');
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
  assert.deepEqual(input.kinds, ['pack', 'settings', 'arrange', 'change']);

  assert.equal(out.by, 'test model');
  assert.deepEqual(out.filed.map((f) => [f.question, f.by]), [['Turn off Log? You have a page for it now.', 'test model']]);
  assert.equal(out.skipped.length, 1);
  assert.match(out.skipped[0]!.why, /nonsense/u);
  assert.deepEqual(out.dropped, ['Proposal 3 was a rowset proposal, and Spark files only pack, settings, arrange and change.', 'Proposal 4 had no question, or one over 280 characters.']);
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

/* ── tone, skills and the daily run ─────────────────────────────────────── */

/** A use case that declares its words: a label for its list, and how Home heads what changed. And a skill for agents. */
const TEAM = (() => {
  const u = normaliseUseCase({
    usecase: 'team',
    version: '1.0.0',
    title: 'Team',
    summary: 'Team.',
    author: 'BrainDog',
    license: 'MIT',
    audience: 'team',
    tone: 'plain',
    signals: ['team'],
    modules: [],
    voice: { home: 'Team', since_away: 'Since you last looked' },
    labels: { tickets: 'Tickets' },
    skills: [
      { name: 'task-triage', trigger: 'when a ticket is opened, to set its priority' },
      { name: 'standup-digest', trigger: 'each morning, to say what moved yesterday' },
    ],
    pack: { ...manifest('usecase-team'), declarations: [list('usecase-team', 'tickets', 'Tickets'), page('team-home', 'Team', 'tickets', 'Team')] },
  });
  assert.ok(u.ok, JSON.stringify(u));
  return u.value;
})();

/** The Skills list as the agents pack declares it: the text is changed only by a decision. */
const SKILLS = {
  ...manifest('agents'),
  declarations: [
    {
      register: 'skills',
      name: 'Skills',
      title: 'name',
      pack: 'agents',
      fields: [
        { id: 'name', type: 'text', required: true, max: 64 },
        { id: 'trigger', type: 'text', required: true, max: 400 },
        { id: 'what', type: 'text', max: 400 },
        { id: 'kind', type: 'enum', values: ['skill', 'command'], default: 'skill', required: true },
        { id: 'body', type: 'document', required: true, by: 'decide' },
      ],
    },
  ],
};

const TEAM_CATALOGUE: CatalogueEntry[] = [
  ...CATALOGUE,
  { ...entry('usecase-team', 'Team', useCasePack(TEAM)!, 'usecase'), skills: TEAM.skills },
  entry('agents', 'Agents', SKILLS),
];

type Toned = Reading & { daily: { on: boolean; last: string | null } };
const settingsOf = async (api: Awaited<ReturnType<typeof record>>['api'], id: string) => value<{ values: Record<string, unknown> }>(await api.packConfig({ id }, owner)).values;

test('THE WORDS FOLLOW USE: a page the owner keeps opening lends its list its name, and a label only the use case declares', async () => {
  const { api, sql, install, day } = await record({ catalogue: TEAM_CATALOGUE });
  await install({ usecase: 'team', why: ['A team.'] }, 'arrange');
  /* THE OWNER'S OWN PAGE over Tickets, called Issues, and a list with no label declared that is shown the same way. */
  await install({ install: 'log' });
  await install(
    {
      why: ['My pages.'],
      pages: [
        { id: 'page.issues', body: page('issues', 'Issues', 'tickets', 'Team') },
        { id: 'page.captains-log', body: page('captains-log', 'Captain', 'logbook', 'Log') },
      ],
    },
    'arrange',
  );
  for (const n of [20, 20, 11, 6, 2, 1]) {
    day(n);
    value(await api.page({ slug: 'issues' }, owner));
    value(await api.page({ slug: 'captains-log' }, owner));
  }
  day(0);

  const seen = value<Toned>(await api.spark({}, owner));
  const said = seen.noticed.find((x) => x.kind === 'label');
  assert.equal(said?.text, 'You opened Issues, a page of Tickets, 6 times in the last thirty days.');
  const labels = seen.drafts.filter((d) => d.body_kind === 'settings');
  assert.deepEqual(
    labels.map((d) => d.question),
    ['Call Tickets Issues everywhere? You opened the Issues page, which shows Tickets, 6 times on 5 separate days in the last thirty days.'],
    'a list the use case declares no label for was offered one',
  );

  const out = value<Filed>(await api.sparkPropose({}, owner));
  const id = out.filed.find((f) => f.question.startsWith('Call Tickets'))?.id;
  assert.ok(id, JSON.stringify(out));
  /* FILED THROUGH `prepare`: the body carries what the label was, as a token's settings proposal does. */
  const row = api.kernel.governanceRow('suggestion', id!) as { body: { pack: string; values: Record<string, unknown>; before: Record<string, unknown> } };
  assert.deepEqual(row.body.values, { label_tickets: 'Issues' });
  assert.deepEqual(row.body.before, { label_tickets: 'Tickets' });
  assert.equal((await settingsOf(api, 'usecase-team')).label_tickets, 'Tickets', 'filing changed the label');

  value(await api.decide({ id: id!, decide: { option: 'accept', reason: 'yes' } }, owner));
  assert.equal((await settingsOf(api, 'usecase-team')).label_tickets, 'Issues');
  const after = value<Toned>(await api.spark({}, owner));
  assert.ok(!after.drafts.some((d) => d.question.startsWith('Call Tickets')), 'a label already the page title was offered again');
  for (const d of after.drafts) assert.ok(!d.question.includes('—'), `an em dash in: ${d.question}`);
  sql.close();
});

/** The same use case, declaring all three of a list's words: its name, one of it, and the line saying what it holds. */
const CREW = (() => {
  const u = normaliseUseCase({
    usecase: 'crew',
    version: '1.0.0',
    title: 'Crew',
    summary: 'Crew.',
    author: 'BrainDog',
    license: 'MIT',
    audience: 'team',
    tone: 'plain',
    signals: ['crew'],
    modules: [],
    voice: { home: 'Crew' },
    labels: { tickets: 'Tickets', 'tickets:one': 'ticket', 'tickets:holds': 'every ticket we know about' },
    pack: { ...manifest('usecase-crew'), declarations: [list('usecase-crew', 'tickets', 'Tickets'), page('crew-home', 'Crew', 'tickets', 'Crew')] },
  });
  assert.ok(u.ok, JSON.stringify(u));
  return u.value;
})();

const CREW_CATALOGUE: CatalogueEntry[] = [...CATALOGUE, entry('usecase-crew', 'Crew', useCasePack(CREW)!, 'usecase')];

test('A LIST RENAMED IS RENAMED IN ALL THREE WORDS: its name, one of it, and the line saying what it holds', async () => {
  const { api, sql, install, day } = await record({ catalogue: CREW_CATALOGUE });
  await install({ usecase: 'crew', why: ['A crew.'] }, 'arrange');
  await install({ why: ['My pages.'], pages: [{ id: 'page.issues', body: page('issues', 'Issues', 'tickets', 'Crew') }] }, 'arrange');
  for (const n of [20, 20, 11, 6, 2, 1]) {
    day(n);
    value(await api.page({ slug: 'issues' }, owner));
  }
  day(0);

  const seen = value<Toned>(await api.spark({}, owner));
  const words = seen.drafts.filter((d) => d.body_kind === 'settings').map((d) => d.question);
  assert.deepEqual(words, [
    'Call Tickets Issues everywhere? You opened the Issues page, which shows Tickets, 6 times on 5 separate days in the last thirty days.',
    'Call one of them issue? You opened the Issues page, which shows Tickets, 6 times on 5 separate days in the last thirty days.',
    'Say Issues holds every issue we know about? The line reads "every ticket we know about" now, in the word this list was called before.',
  ]);
  for (const q of words) assert.ok(!q.includes('—'), `an em dash in: ${q}`);

  /* EACH IS A SETTING `prepare` CHECKS, filed and accepted the way the name is. */
  const out = value<Filed>(await api.sparkPropose({}, owner));
  for (const f of out.filed) value(await api.decide({ id: f.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  const now = await settingsOf(api, 'usecase-crew');
  assert.equal(now.label_tickets, 'Issues');
  assert.equal(now.one_tickets, 'issue', 'a list renamed to Issues was left saying one of them is an Issues');
  assert.equal(now.holds_tickets, 'every issue we know about');

  /* AND NOTHING IS ASKED TWICE. The page title is the list's word now, so there is nothing left to offer. */
  const after = value<Toned>(await api.spark({}, owner));
  assert.deepEqual(after.drafts.filter((d) => d.body_kind === 'settings').map((d) => d.question), []);
  sql.close();
});

test('HOME SAYS WHO DID THE WORK: agents doing most of it are named, and a quarter with none puts the line back', async () => {
  const { api, sql, install, day } = await record({ catalogue: TEAM_CATALOGUE });
  await install({ usecase: 'team', why: ['A team.'] }, 'arrange');
  for (const n of [25, 18, 9, 4]) {
    day(n);
    for (let i = 0; i < 4; i++) value(api.kernel.create('tickets', { what: `Ticket ${n}.${i}` }, { actor: 'agent:claude' }));
    value(api.kernel.create('tickets', { what: `Mine ${n}` }, { actor: 'p_owner' }));
  }
  day(0);
  const seen = value<Toned>(await api.spark({}, owner));
  const heading = seen.drafts.find((d) => d.question.startsWith('Head what changed'));
  assert.equal(
    heading?.question,
    'Head what changed on Home "What you and your agents did since you last looked"? Agents made 16 of the 20 changes here in the last thirty days, and "Since you last looked" does not say so.',
  );
  const out = value<Filed>(await api.sparkPropose({}, owner));
  const id = out.filed.find((f) => f.question.startsWith('Head what changed'))?.id;
  assert.ok(id, JSON.stringify(out));
  value(await api.decide({ id: id!, decide: { option: 'accept', reason: 'yes' } }, owner));
  assert.equal((await settingsOf(api, 'usecase-team')).voice_since_away, 'What you and your agents did since you last looked');

  /* A QUARTER LATER, NO AGENT HAS WORKED: the use case's own line is offered back, as a different question from the first. */
  day(-100);
  value(api.kernel.create('tickets', { what: 'Still here' }, { actor: 'p_owner' }));
  const quiet = value<Toned>(await api.spark({}, owner));
  const back = quiet.drafts.find((d) => d.question.startsWith('Head what changed'));
  assert.equal(back?.question, 'Head what changed on Home "Since you last looked" instead of "What you and your agents did since you last looked"? No agent has changed anything here in ninety days.');
  assert.equal(back?.asked, null, 'turning the line back was taken for the question already answered');
  const again = value<Filed>(await api.sparkPropose({}, owner));
  const backId = again.filed.find((f) => f.question.startsWith('Head what changed'))?.id;
  assert.ok(backId, JSON.stringify(again));
  assert.deepEqual((api.kernel.governanceRow('suggestion', backId!) as { body: { values: unknown } }).body.values, { voice_since_away: null });
  value(await api.decide({ id: backId!, decide: { option: 'accept', reason: 'yes' } }, owner));
  assert.equal((await settingsOf(api, 'usecase-team')).voice_since_away, 'Since you last looked');
  sql.close();
});

test('THE SKILLS A USE CASE NAMES are offered to the agents once each, as rows only the owner accepting writes', async () => {
  const { api, sql, install, day } = await record({ catalogue: TEAM_CATALOGUE });
  await install({ usecase: 'team', why: ['A team.'] }, 'arrange');
  let seen = value<Toned>(await api.spark({}, owner));
  assert.ok(!seen.drafts.some((d) => d.body_kind === 'rowset'), 'skills were offered to a record that keeps none');

  await install({ install: 'agents' });
  day(0);
  seen = value<Toned>(await api.spark({}, owner));
  assert.equal(seen.noticed.find((x) => x.kind === 'skills')?.text, 'Team names skills for agents that your Skills list does not hold: task-triage and standup-digest.');
  assert.deepEqual(
    seen.drafts.filter((d) => d.body_kind === 'rowset').map((d) => d.question),
    [
      'Give your agents the skill task-triage? Team names it for when a ticket is opened, and your Skills list has none by that name.',
      'Give your agents the skill standup-digest? Team names it for each morning, and your Skills list has none by that name.',
    ],
  );

  const out = value<Filed>(await api.sparkPropose({}, owner));
  const [triage, digest] = ['task-triage', 'standup-digest'].map((name) => out.filed.find((f) => f.question.includes(name))?.id);
  assert.ok(triage && digest, JSON.stringify(out));
  assert.equal(sql.all("SELECT 1 FROM entry WHERE register = 'skills'").length, 0, 'filing wrote a skill');
  assert.deepEqual(sql.all<{ kind: string }>("SELECT DISTINCT kind FROM event WHERE actor = 'spark'").map((e) => e.kind), ['suggest']);

  value(await api.decide({ id: triage!, decide: { option: 'accept', reason: 'yes' } }, owner));
  value(await api.decide({ id: digest!, resolved_as: 'wont-fix', reason: 'not this one' }, owner));
  const names = sql.all<{ name: string; body: string }>("SELECT json_extract(fields, '$.name') AS name, json_extract(fields, '$.body') AS body FROM entry WHERE register = 'skills'");
  assert.deepEqual(names.map((n) => n.name), ['task-triage']);
  assert.match(names[0]!.body, /^Use this skill when a ticket is opened/u);

  const after = value<Toned>(await api.spark({}, owner));
  assert.deepEqual(after.drafts.filter((d) => d.body_kind === 'rowset').map((d) => [d.question.slice(0, 40), d.asked?.status]), [['Give your agents the skill standup-diges', 'resolved']]);
  assert.equal(value<Filed>(await api.sparkPropose({}, owner)).filed.length, 0, 'a skill declined was offered again');
  sql.close();
});

test('SPARK LOOKS ONCE A DAY ON ITS OWN, keeps to three waiting, never asks a dismissed question again, and the owner can turn it off', async () => {
  let calls = 0;
  const model: SparkModel = { name: 'counting', draft: async () => { calls++; return { drafts: [] }; } };
  const { api, sql, day } = await used({ model });

  /* THE FIRST TICK OF THE DAY RUNS; A SECOND THE SAME DAY DOES NOT, and does not ask the model again. */
  const first = await api.sparkTick();
  assert.ok(first.ran);
  assert.equal(first.filed.length, 3);
  assert.equal(calls, 1);
  assert.deepEqual(await api.sparkTick(), { ran: false, why: 'today' });
  assert.equal(calls, 1);
  assert.deepEqual(value<Toned>(await api.spark({}, owner)).daily, { on: true, last: '2026-09-17' });

  /* THE NEXT DAY: three wait, so nothing more is filed. */
  day(-1);
  const second = await api.sparkTick();
  assert.ok(second.ran);
  assert.equal(second.filed.length, 0);
  assert.equal(calls, 2);

  /* A DISMISSED QUESTION IS NOT ASKED AGAIN BY THE SCHEDULE, even with room under the cap. */
  const dismissed = first.filed[1]!;
  value(await api.decide({ id: dismissed.id, resolved_as: 'wont-fix', reason: 'no' }, owner));
  day(-2);
  const third = await api.sparkTick();
  assert.ok(third.ran);
  assert.deepEqual(third.filed, []);
  assert.ok(third.skipped.some((s) => s.question === dismissed.question && s.why === 'Spark has asked this before.'));
  assert.equal(sql.all("SELECT 1 FROM suggestion WHERE opened_by = 'spark' AND status = 'open'").length, 2);

  /* OFF: an owner's choice in a browser, and the tick does nothing until it is on again. */
  assert.equal((await api.sparkDaily({ on: false }, agent) as Out).refusal?.code, 'NEEDS_BROWSER_SESSION');
  assert.equal((await api.sparkDaily({ on: 'no' }, owner) as Out).refusal?.code, 'VALUE_MALFORMED');
  assert.deepEqual(value(await api.sparkDaily({ on: false }, owner)), { on: false, last: '2026-09-19' });
  day(-3);
  assert.deepEqual(await api.sparkTick(), { ran: false, why: 'off' });
  day(-10);
  assert.deepEqual(await api.sparkTick(), { ran: false, why: 'off' });
  assert.equal(calls, 3);
  value(await api.sparkDaily({ on: true }, owner));
  assert.ok((await api.sparkTick()).ran);
  assert.equal(calls, 4);
  sql.close();
});
