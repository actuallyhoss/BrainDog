/**
 * Somebody invited to one list, asking every door once found open onto another.
 *
 * A member holding a read grant on Obligations and nothing else read a diary entry's full text, a bill's amount, the
 * owner's reason for letting somebody go and the figure a prediction was graded on, each through a method that already
 * refused her the list itself. Every test here builds that member the way the host builds one, from `kernel.access`,
 * and drives one door. Each was watched failing against the tree before it was closed. The last test is the other half:
 * the owner reads everything they read before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type HistoryPage, type WhatsNew } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const reg = (id: string, name: string, title: string, fields: unknown[]) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields } as never,
});
const decl = (kind: string, id: string, body: unknown) => ({ id: `${kind}.${id}`, kind, body }) as never;

const DECLS = [
  reg('obligations', 'Obligations', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'state', type: 'enum', values: ['open', 'paid'] },
  ]),
  reg('diary', 'Diary', 'body', [{ id: 'body', type: 'text', required: true }]),
  reg('bills', 'Bills', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'due', type: 'day', required: true },
  ]),
  /* A PAGE PER DIARY ROW, which is the shape the shipped seed declares over organisations, milestones, things and skills. */
  decl('page', 'entry', { page: 'entry', title: '{{body}}', for: { register: 'diary' }, requires: ['register.diary'], blocks: [{ kind: 'note', body: '{{body}}' }] }),
  /* AND ONE PER DIARY ROW WHOSE ONLY BLOCK READS HER OWN LIST, so the page's `for:` is the one thing that is not hers. */
  decl('page', 'entry-dues', {
    page: 'entry-dues',
    title: 'Dues for {{body}}',
    for: { register: 'diary' },
    requires: ['register.diary', 'register.obligations'],
    blocks: [{ kind: 'table', source: 'register.obligations' }],
  }),
  decl('page', 'private', {
    page: 'private',
    title: 'Private diary, for the tribunal',
    blocks: [
      { kind: 'note', body: 'Keep this away from Wren.' },
      { kind: 'table', source: 'register.diary', where: 'body is Dinner with the auditor' },
    ],
  }),
  decl('page', 'dues', { page: 'dues', title: 'Dues', blocks: [{ kind: 'table', source: 'register.obligations' }] }),
  decl('page', 'desk', {
    page: 'desk',
    title: 'Desk',
    /* THE FIRST BLOCK IS HERS, so the page is one she may open and each other block is judged on its own. */
    blocks: [
      { kind: 'table', source: 'register.obligations' },
      { kind: 'queue', source: 'governance.open' },
      { kind: 'table', source: 'sessions.live' },
      { kind: 'table', source: 'actions' },
      { kind: 'forecast', source: 'forecast.runway', opening: 1_000_000, from: [{ register: 'bills', on: 'due', amount: 'amount' }], horizon: 60 },
      /* A BLOCK OVER THE DIARY ON A PAGE SHE MAY OPEN, whose filter is a diary entry's words and whose columns name the
         diary's own fields, which is the schema `schema({ register: 'diary' })` refuses her. */
      { kind: 'table', source: 'register.diary', where: 'body is Told Sam about the redundancy list', columns: [{ field: 'body', label: 'What I told Sam' }] },
      /* AND A FIGURE OVER THE DIARY, whose `source` is the figure's name. */
      { kind: 'series', source: 'metric.diary-count', heading: 'Diary entries' },
    ],
  }),
  decl('metric', 'diary-count', { metric: 'diary-count', name: 'Diary entries', source: 'register.diary', value: { count: 'body' }, format: 'int', target: { lte: 99 }, window: '30d' }),
  decl('metric', 'dues-count', { metric: 'dues-count', name: 'Dues', source: 'register.obligations', value: { count: 'what' }, format: 'int', target: { lte: 99 }, window: '30d' }),
  decl('digest', 'monday', {
    digest: 'monday',
    name: 'Monday',
    schedule: { at: '08:00' },
    channels: ['in-app'],
    sections: [
      { heading: 'Diary', source: 'metric.diary-count' },
      { heading: 'Dues', source: 'metric.dues-count' },
    ],
  }),
];

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent = {
  principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_1', level: 'owner' },
  session: { agent: 'claude', repo: 'acme/payroll-secret', doing: 'Drafting the letter to the auditor' },
} as CallContext;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Refused = { ok: false; refusal: { code: string; fix: string; allowed?: string[] } };
type Block = { kind: string; source?: string; rows?: unknown[]; queue?: { id: string }[]; walk?: unknown; walks?: unknown; where?: unknown; refusals?: { code: string }[] };
type PageOut = { title: string; blocks: Block[] };

/** The record: Obligations, which she was invited to, and Diary and Bills, which she was not. */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { obligations: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  assert.equal(held.level, null, 'the member this file is about holds nothing on the record');
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };

  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41', state: 'open' } }, owner));
  clock.advance(60_000);
  value(await api.create({ register: 'diary', fields: { body: 'Dinner with the auditor' } }, owner));
  value(await api.create({ register: 'diary', fields: { body: 'Told Sam about the redundancy list' } }, owner));
  value(await api.create({ register: 'bills', fields: { what: 'Severance for Sam', amount: { amount: 1_250_000, currency: 'GBP' }, due: '2026-09-20' } }, owner));
  clock.advance(60_000);
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 42', state: 'open' } }, owner));
  return { api, sql, clock, wren };
}

/** A `change` to the diary carrying a prediction, accepted by the owner, which is what writes a `prediction` row. */
async function predict(api: Awaited<ReturnType<typeof record>>['api']) {
  const asked = value<{ id: string }>(
    await api.propose(
      {
        question: 'Give the diary a mood field?',
        body_kind: 'change',
        body: {
          declaration_id: 'register.diary',
          from: {},
          to: {
            id: 'register.diary',
            kind: 'register',
            body: { id: 'diary', name: 'Diary', title: 'body', fields: [{ id: 'body', type: 'text', required: true }, { id: 'mood', type: 'text' }] },
          },
          prediction: { claim: 'Diary entries about the audit reach ten', measure: { source: 'register.diary', value: { count: 'body' } }, target: { gte: 10 }, window: '30d', unit: 'count' },
        },
      } as never,
      agent,
    ),
  );
  value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'fine' } }, owner));
}

test('1. A PAGE PER DIARY ROW IS NOT HERS, and a wrong slug does not list every row title as a slug', async () => {
  const { api, sql, wren } = await record();

  /* MEASURED BEFORE: the page answered with the diary entry as its title, its body and `param.title`, because a filled
     `{{body}}` draws from no list and the page's own `for:` was never asked about. */
  const entry = (await api.page({ slug: 'dinner-with-the-auditor' }, wren)) as Refused;
  assert.equal(entry.ok, false, 'a page declared for a diary row handed the row to somebody invited to Obligations');
  assert.equal(entry.refusal.code, 'PAGE_UNKNOWN');
  /* The slug is the one she typed, so the test is that nothing OF THE ROW came back: its title is capitalised. */
  assert.doesNotMatch(JSON.stringify(entry), /Dinner|"param"|"for"/u);

  /* AND A PAGE PER ROW WHOSE BLOCKS ARE ALL HERS IS STILL A PAGE ABOUT A ROW THAT IS NOT: its title is the diary entry.
     Its slug is the row's too, second in line, so it is found by its title in the owner's list. */
  const duesSlug = value<{ slug: string; title: string }[]>(await api.pages(owner)).find((p) => p.title === 'Dues for Dinner with the auditor')!.slug;
  const dues = (await api.page({ slug: duesSlug }, wren)) as Refused;
  assert.equal(dues.ok, false, 'a page about a diary row was served because one block read her own list');
  assert.ok(
    !value<{ slug: string }[]>(await api.pages(wren)).some((p) => /auditor|redundancy/u.test(p.slug)),
    'the list of pages named a diary row by its title',
  );

  /* MEASURED BEFORE: `allowed` held every resolved slug, `told-sam-about-the-redundancy-list` among them. */
  const nope = (await api.page({ slug: 'nope' }, wren)) as Refused;
  assert.equal(nope.refusal.code, 'PAGE_UNKNOWN');
  const allowed = nope.refusal.allowed ?? [];
  assert.ok(!allowed.some((s) => /auditor|redundancy|private/u.test(s)), `allowed listed pages she cannot open: ${allowed.join(', ')}`);
  const listed = value<{ slug: string }[]>(await api.pages(wren)).map((p) => p.slug);
  assert.ok(allowed.length > 0 && allowed.every((s) => listed.includes(s)), `allowed named a page \`pages\` does not list her: ${allowed.join(', ')}`);

  /* THE ANSWER FOR A PAGE SHE CANNOT SEE IS THE ANSWER FOR ONE THAT DOES NOT EXIST, so the refusal is not an oracle. */
  assert.deepEqual({ ...entry.refusal, fix: entry.refusal.fix.replace('dinner-with-the-auditor', 'nope') }, nope.refusal);
  sql.close();
});

test('6. AN ORDINARY PAGE OVER A HIDDEN LIST IS REFUSED AS `pages` HIDES IT, title, prose and `where` literal included', async () => {
  const { api, sql, wren } = await record();
  assert.ok(!value<{ slug: string }[]>(await api.pages(wren)).some((p) => p.slug === 'private'), 'the precondition: `pages` already hides it');

  /* MEASURED BEFORE: the title, the note, `where: body is Dinner with the auditor` and `declared_version: 1` came back, and
     only the table's rows were blanked. */
  const out = (await api.page({ slug: 'private' }, wren)) as Refused;
  assert.equal(out.ok, false, 'a page `pages` hides was served by its slug');
  assert.equal(out.refusal.code, 'PAGE_UNKNOWN');
  assert.doesNotMatch(JSON.stringify(out), /tribunal|Wren|auditor/u);

  /* HER OWN PAGE STILL OPENS, so this is about sight and not a page method that went missing. */
  const dues = value<PageOut>(await api.page({ slug: 'dues' }, wren));
  assert.equal(dues.blocks[0]!.rows!.length, 2);
  sql.close();
});

test('2. A BLOCK WHOSE SOURCE IS NOT A LIST IS JUDGED BY WHAT IT READS: the cash walk, the queue, the runs and the actions', async () => {
  const { api, sql, wren } = await record();
  value(await api.propose({ question: 'File the note that Sam is on the redundancy list?', body_kind: 'rowset', body: { register: 'diary', rows: [{ body: 'Sam is on the list' }] } } as never, agent));
  const hers = value<{ id: string }>(
    await api.propose({ question: 'File invoice 43?', body_kind: 'rowset', body: { register: 'obligations', rows: [{ what: 'Invoice 43', state: 'open' }] } } as never, agent),
  );

  const desk = value<PageOut>(await api.page({ slug: 'desk' }, wren));
  /* FOUND BY WHERE THE PAGE DECLARES IT, because a refused block no longer says what it reads: `source: register.diary`
     named the list `boot` leaves out of her rail. The page answers its blocks in the order they are declared. */
  const declared = (DECLS as { id: string; body: { blocks?: { source?: string }[] } }[]).find((d) => d.id === 'page.desk')!.body.blocks!;
  assert.equal(desk.blocks.length, declared.length);
  const block = (source: string) => desk.blocks[declared.findIndex((b) => b.source === source)]!;
  const said = JSON.stringify(desk);

  /* MEASURED BEFORE: `Severance for Sam`, -1,250,000 on 2026-09-20, balance -250,000, from a list `list` refuses her. */
  assert.doesNotMatch(said, /Severance/u, 'the cash walk over Bills went to somebody who cannot read Bills');
  assert.equal(block('forecast.runway').refusals?.[0]?.code, 'FORBIDDEN');

  /* MEASURED BEFORE: every open question, the diary rowset's included. The queue is ranked and counted across the whole
     record, so it goes where `activity` goes, to somebody who reads all of it; her own question is on `governance`. */
  assert.doesNotMatch(said, /redundancy/u, 'the queue carried a question about the diary');
  assert.equal(block('governance.open').refusals?.[0]?.code, 'FORBIDDEN');
  assert.deepEqual(block('governance.open').queue ?? [], []);
  /* Her queue carries handles, not numbers (`scoped-question-ids.test.ts`); the owner reads each back as its number. */
  const queue = value<{ id: string }[]>(await api.governance({ register: 'suggestion' }, wren));
  assert.deepEqual(await Promise.all(queue.map(async (q) => value<{ id: string }>(await api.governance({ id: q.id }, owner)).id)), [hers.id]);

  /* MEASURED BEFORE: three live runs with `repo: acme/payroll-secret` and what each was doing. */
  assert.doesNotMatch(said, /payroll-secret|Drafting/u, "the live runs went to somebody `sessionsLive` refuses");
  assert.equal(block('sessions.live').refusals?.[0]?.code, 'FORBIDDEN');

  /* AND THE SCHEDULED ACTIONS, which `actions` refuses her outright. */
  assert.equal(block('actions').refusals?.[0]?.code, 'FORBIDDEN');
  assert.deepEqual(block('actions').rows, []);

  /* AND A REFUSED BLOCK DOES NOT CARRY ITS FILTER, which is a diary entry's words written into the page. */
  assert.equal(block('register.diary').refusals?.[0]?.code, 'FORBIDDEN');
  assert.equal(block('register.diary').where, undefined, 'a refused block kept the `where` a person wrote with a diary entry in it');

  /* NOR WHAT IT READS. MEASURED BEFORE: `source: register.diary` with `columns: [{ field: body }]`, and
     `source: metric.diary-count` on the figure, three names for what she cannot open. */
  assert.equal(block('register.diary').source, undefined, 'a refused block named the list it reads, which `boot` hides from her');
  assert.equal((block('register.diary') as { columns?: unknown }).columns, undefined, "a refused block carried the hidden list's field ids");
  assert.equal(block('metric.diary-count').refusals?.[0]?.code, 'FORBIDDEN');
  assert.equal(block('metric.diary-count').source, undefined, 'a refused block named a figure over a list she cannot open');
  /* A SOURCE THAT NAMES A VIEW AND NO LIST STAYS, since it says nothing she could not guess. */
  assert.equal(block('forecast.runway').source, 'forecast.runway');
  assert.equal(block('sessions.live').source, 'sessions.live');
  sql.close();
});

test('3. A PREDICTION ABOUT A HIDDEN LIST, and the question its miss files, are not hers', async () => {
  const { api, sql, clock, wren } = await record();
  await predict(api);

  /* MEASURED BEFORE: `for_decl: register.diary`, the claim, the measure and `baseline: 2`, while the change and its
     decision were already held back in the same run. */
  assert.equal(value<unknown[]>(await api.governance({ register: 'prediction' }, owner)).length, 1, 'the precondition: a prediction was written');
  assert.deepEqual(value<unknown[]>(await api.governance({ register: 'prediction' }, wren)), [], 'a prediction about the diary reached her');

  /* AND IT IS STILL SOMEBODY'S. A member invited to the diary reads the prediction about it; without the `for_decl` rule
     it fell to the rule for a question naming no list and went to nobody but the owner, and every test above stayed green. */
  value(await api.invite({ person: 'p_8', name: 'Ash', registers: { diary: 'read' } }, owner));
  const ash = api.kernel.access('p_8')!;
  const diarist: CallContext = { principal: { kind: 'person', id: 'p_8', level: ash.level }, registers: ash.registers ?? '*', levels: ash.levels };
  assert.equal(value<unknown[]>(await api.governance({ register: 'prediction' }, diarist)).length, 1, 'a prediction about the diary was held from somebody who reads the diary');

  /* AND WHEN IT MISSES, the kernel files an `options` question as `system` carrying the observed figure. Measured before:
     that question sat on her `boot.waiting` with `counts.decide` at 1. */
  value(await api.create({ register: 'diary', fields: { body: 'Third entry' } }, owner));
  clock.advance(31 * 86_400_000);
  await api.kernel.drain();
  const filed = value<{ question: string }[]>(await api.governance({ register: 'suggestion' }, owner));
  assert.ok(filed.some((q) => /observed 3/u.test(q.question)), 'the precondition: the miss filed its question');
  type Booted = { waiting: { question: string }[]; counts: { decide: number } };
  const boot = value<Booted>(await api.boot(wren));
  assert.deepEqual(boot.waiting, [], 'the question a missed diary prediction files reached her home screen');
  assert.equal(boot.counts.decide, 0);
  assert.deepEqual(value<unknown[]>(await api.governance({ register: 'suggestion' }, wren)), []);
  sql.close();
});

test('4. A DIGEST SECTION OVER A FIGURE IS HELD TO THE LIST THE FIGURE COUNTS', async () => {
  const { api, sql, wren } = await record();
  type Digest = { headline: string; sections: { heading: string; source: string }[] };

  /* MEASURED BEFORE: a `metric.diary-count` section with value 2 and a headline reading `Monday: Diary 2`, while
     `metric('diary-count')` answered her METRIC_UNKNOWN. */
  const [monday] = value<Digest[]>(await api.digestToday({}, wren));
  assert.deepEqual(monday!.sections.map((s) => s.heading), ['Dues'], 'a section over a figure about the diary went to her');
  assert.doesNotMatch(monday!.headline, /Diary/u);

  const [theirs] = value<Digest[]>(await api.digestToday({}, owner));
  assert.deepEqual(theirs!.sections.map((s) => s.heading), ['Diary', 'Dues']);
  sql.close();
});

test('5. A QUESTION THAT NAMES NO LIST IS ABOUT THE WHOLE RECORD, and so is its decision and the owner reason on it', async () => {
  const { api, sql, wren } = await record();
  const asked = value<{ id: string }>(
    await api.propose(
      { question: 'Should we let Sam go before the audit?', body_kind: 'options', body: { options: [{ id: 'yes', label: 'Yes', because: 'Cost' }, { id: 'no', label: 'No', because: 'Optics' }] } } as never,
      agent,
    ),
  );
  const decided = value<{ decision: string }>(await api.decide({ id: asked.id, decide: { option: 'yes', reason: 'The auditor must not see his salary line' } }, owner));

  /* MEASURED BEFORE: the question, the answer and that reason, in `governance`, `whatsNew` and `recentHistory`. The rule
     is `lineOf`'s own: a line about the record as a whole goes to somebody who reads the whole record. */
  assert.deepEqual(value<unknown[]>(await api.governance({ register: 'decision' }, wren)), [], 'the decision on a question about no list reached her');
  assert.equal(value(await api.governance({ register: 'suggestion', id: asked.id }, wren)), null);
  const history = JSON.stringify(value<HistoryPage>(await api.recentHistory(undefined, wren)));
  const news = JSON.stringify(value<WhatsNew>(await api.whatsNew(undefined, wren)));
  for (const said of [history, news]) {
    assert.doesNotMatch(said, /Sam go|salary line/u, "the owner's reason reached her through the log");
    assert.ok(!said.includes(`"decision:${decided.decision}"`));
  }

  /* THE OWNER READS IT ALL, as before. */
  assert.equal(value<unknown[]>(await api.governance({ register: 'decision' }, owner)).length, 1);
  assert.match(JSON.stringify(value<HistoryPage>(await api.recentHistory(undefined, owner))), /salary line/u);
  sql.close();
});

test('7. A CURSOR ON A QUESTION SHE MAY NOT SEE IS ANSWERED AS ONE ON NO QUESTION, so the ids do not count the queue', async () => {
  const { api, sql, wren } = await record();
  const asked = value<{ id: string }>(
    await api.propose(
      { question: 'Should we let Sam go before the audit?', body_kind: 'options', body: { options: [{ id: 'yes', label: 'Yes', because: 'Cost' }, { id: 'no', label: 'No', because: 'Optics' }] } } as never,
      agent,
    ),
  );
  const hidden = (await api.governance({ register: 'suggestion', cursor: asked.id }, wren)) as Refused;
  const missing = (await api.governance({ register: 'suggestion', cursor: 'SG999' }, wren)) as Refused;
  assert.equal(hidden.ok, false, 'a cursor on a question about no list answered her with a page');
  assert.deepEqual(hidden, missing, 'a hidden question and a missing one answered differently, which says the hidden one exists');

  /* THE OWNER'S CURSOR STILL WALKS, since the row is theirs to see. */
  assert.ok(((await api.governance({ register: 'suggestion', cursor: asked.id }, owner)) as { ok: boolean }).ok);
  sql.close();
});

test('THE OWNER READS WHAT THEY READ BEFORE: every page, every block, the prediction and every digest section', async () => {
  const { api, sql } = await record();
  value(await api.propose({ question: 'File the note that Sam is on the redundancy list?', body_kind: 'rowset', body: { register: 'diary', rows: [{ body: 'Sam is on the list' }] } } as never, agent));
  await predict(api);

  /* Every page the kernel resolves, the two made for each of two diary rows included. */
  const pages = value<{ slug: string; title: string }[]>(await api.pages(owner));
  assert.equal(pages.length, api.kernel.pages().length);
  assert.ok(pages.some((p) => p.title === 'Dues for Dinner with the auditor'));
  for (const slug of ['dinner-with-the-auditor', 'private', 'dues', 'desk']) assert.ok(pages.some((p) => p.slug === slug), `${slug} left the owner's pages`);
  const entry = value<PageOut>(await api.page({ slug: 'dinner-with-the-auditor' }, owner));
  assert.equal(entry.title, 'Dinner with the auditor');
  const priv = value<PageOut>(await api.page({ slug: 'private' }, owner));
  assert.equal(priv.blocks[1]!.rows!.length, 1);
  const missing = (await api.page({ slug: 'nope' }, owner)) as Refused;
  assert.deepEqual(missing, api.kernel.page('nope'), "the owner's refusal is the kernel's, as it was");

  const desk = value<PageOut>(await api.page({ slug: 'desk' }, owner));
  for (const b of desk.blocks) assert.ok(!(b.refusals ?? []).some((r) => r.code === 'FORBIDDEN'), `the owner was refused ${b.source}`);
  assert.match(JSON.stringify(desk), /Severance for Sam/u);
  assert.equal(desk.blocks.find((b) => b.source === 'governance.open')!.queue!.length, 1);
  sql.close();
});
