/**
 * `exportPack` (`src/methods/export-pack.ts`, SHL-B09 job 2): an add-on made from what a person made on a fresh record.
 *
 * The first record has Portfolio installed as a person installs it, and lists, a figure, a page and an automation of
 * its own, set from the app (`setDeclaration`). What it offers is its own and never the add-on's. The page and the
 * automation ticked make a file that brings the lists and the figure they read, requires Portfolio for the list of it
 * the page shows, and carries no entry, no name and no key of the first record. Planned and installed on a SECOND fresh
 * record, the file draws the page. Invented names from `fixtures/names.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal, type Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, type ExportOffer, type ExportedPack } from '../src/methods/export-pack.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { COMPANIES, PEOPLE, PROJECTS } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** A member who reads the jobs and nothing else. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['jobs'] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (out: Result<unknown>): Refusal => {
  assert.ok(!out.ok, `expected a refusal, got ${JSON.stringify(out).slice(0, 300)}`);
  return (out as { refusal: Refusal }).refusal;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;

const [OWNER, CONTACT] = [PEOPLE[2]!, PEOPLE[3]!];
const [CLIENT, OTHER] = [COMPANIES[1], COMPANIES[4]];

const CLIENTS = { register: 'clients', name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'contact', type: 'text' }] };
const JOBS = {
  register: 'jobs',
  name: 'Jobs',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'client', type: 'ref', to: 'clients' },
    { id: 'kind', type: 'enum', values: ['court', 'paper'] },
    { id: 'tags', type: 'list', of: 'text' },
  ],
};
const OPEN = { metric: 'jobs-open', name: 'Open jobs', source: 'register.jobs', value: { count: 'what' }, format: 'int', target: { lte: 99 }, window: '30d' };
const STAMP = { rule: 'stamp', name: 'Court jobs are paper too', register: 'jobs', on: 'create', when: 'kind is court', then: [{ set: { field: 'kind', to: 'paper' } }] };

/** The page, its filter naming one client of this record by its number. */
const BOARD = {
  page: 'jobs-board',
  title: 'Jobs board',
  blocks: [
    { kind: 'stat', key: 'count', cells: [{ metric: 'jobs-open' }] },
    { kind: 'table', key: 'mine', heading: 'For one client', source: 'register.jobs', where: 'client is clients#2', columns: [{ field: 'what' }] },
    { kind: 'table', key: 'all', heading: 'Every job', source: 'register.jobs', columns: [{ field: 'what' }, { field: 'kind' }] },
    { kind: 'table', key: 'built', heading: 'What we build', source: 'register.things', columns: [{ field: 'name' }] },
  ],
};

/** The methods of this file on the record's own kernel, with the guards a list closed to the caller is refused by. */
function door(api: Api, sql: ReturnType<typeof openSqlite>) {
  const closed = (ctx: CallContext, register?: string): Refusal | null =>
    register !== undefined && Array.isArray(ctx.registers) && !ctx.registers.includes(register)
      ? { code: 'REGISTER_UNKNOWN', fix: `There is no list called ${register}.`, at: 'register' }
      : null;
  const deps = {
    kernel: api.kernel,
    sql,
    guard: (ctx: CallContext, _need: string, asked?: string) => closed(ctx, asked),
    scoped: () => null,
    readable: closed,
    readsEveryList: (ctx: CallContext) => ctx.registers === undefined || ctx.registers === '*',
    no,
    tail: async <T>(o: T) => o,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  return methods(deps);
}

/** A fresh record with Portfolio installed as a person installs it. */
async function fresh(slug: string, name: string, person: { id: string; email: string; name: string }) {
  const { firstPartyDocument } = await import('../../seed/src/index.ts');
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug, name, tz: 'UTC', locale: 'en', owner: person }));
  await put(api, firstPartyDocument('portfolio', { seeds: [] }));
  return { api, sql };
}

/** Plan a document and install it with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<void> {
  const planned = value<{ diff: { planHash: string; approve: unknown } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  value(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.planHash, approve: planned.approve } as never, owner));
}

/** The first record: Portfolio, and a list, a figure, a page and an automation of its own, with entries in them. */
async function first() {
  const made = await fresh('the-yard', 'The Yard', { id: 'p_1', email: OWNER.email, name: OWNER.name });
  const { api } = made;
  for (const body of [CLIENTS, JOBS, OPEN, STAMP, BOARD]) value(await api.setDeclaration({ body }, owner));
  value(await api.create({ register: 'clients', fields: { name: CLIENT, contact: CONTACT.name } } as never, owner));
  value(await api.create({ register: 'clients', fields: { name: OTHER } } as never, owner));
  value(await api.create({ register: 'jobs', fields: { what: 'Reglaze the north window', client: 'clients#1', kind: 'paper' } } as never, owner));
  value(await api.create({ register: 'things', fields: { name: PROJECTS[0], lane: 'building' } } as never, owner));
  return { ...made, ...door(api, made.sql) };
}

test('WHAT IS OFFERED IS THE RECORD OWN: its lists, figure, page and automation, by name, and none of an installed add-on', async () => {
  const { exportPack, api } = await first();
  const out = value<ExportOffer>(await exportPack(undefined, owner));
  const ids = out.offered.map((o) => o.id).sort();
  assert.deepEqual(ids, ['metric.jobs-open', 'page.jobs-board', 'register.clients', 'register.jobs', 'rule.stamp']);
  assert.deepEqual(
    out.offered.find((o) => o.id === 'page.jobs-board'),
    { id: 'page.jobs-board', kind: 'page', title: 'Jobs board' },
  );
  assert.equal(out.offered.find((o) => o.id === 'rule.stamp')?.title, 'Court jobs are paper too');
  const theirs = api.kernel.declarations().filter((d) => d.pack_id === 'portfolio').map((d) => d.id);
  assert.ok(theirs.includes('register.things') && theirs.includes('page.portfolio'));
  for (const id of theirs) assert.ok(!ids.includes(id), `${id} is Portfolio's, never offered`);
});

test('THE PAGE AND THE AUTOMATION TICKED BRING WHAT THEY READ, require Portfolio, and carry nothing of the first record', async () => {
  const { exportPack, api } = await first();
  const out = value<ExportedPack>(await exportPack({ declarations: ['page.jobs-board', 'rule.stamp'] }, owner));
  assert.equal(out.file, 'jobs-board.pack.json');
  assert.deepEqual([...out.adds].sort(), ['metric.jobs-open', 'page.jobs-board', 'register.clients', 'register.jobs', 'rule.stamp']);
  assert.deepEqual(out.brings.map((b) => b.id).sort(), ['metric.jobs-open', 'register.clients', 'register.jobs']);
  assert.equal(out.brings.find((b) => b.id === 'register.clients')?.why, 'The list Jobs reads the list Clients.');
  assert.match(out.brings.find((b) => b.id === 'metric.jobs-open')!.why, /^The page Jobs board reads the figure Open jobs\.$/u);
  for (const b of out.brings) assert.doesNotMatch(b.why, /—|\bids?\b|\brows?\b|\bentit(y|ies)\b|#/u);

  const doc = JSON.parse(out.text) as Record<string, unknown>;
  assert.equal(doc.pack, 'jobs-board');
  assert.equal(doc.version, '1.0.0');
  const version = api.kernel.packStates().find((s) => s.id === 'portfolio')!.version;
  assert.deepEqual((doc.requires as { packs: unknown }).packs, { portfolio: `^${version}` }, 'the add-on whose list the page shows');
  assert.equal(doc.seeds, undefined, 'no entry unless one is named');
  /* THE ROW THE PAGE FILTERED ON IS A SETTING NOW, holding a stand-in: whoever installs it picks their own. */
  assert.deepEqual(out.settings.map((s) => s.key), ['client']);
  const client = (doc.config as Record<string, { default?: unknown; note?: string }>).client!;
  assert.equal(client.default, 'clients#1', 'a stand-in: the first client wherever it is installed');
  assert.doesNotMatch(client.note ?? '', /made from/u, 'the note does not say the stand-in came from the first record');
  for (const said of ['clients#2', CLIENT, OTHER, CONTACT.name, OWNER.name, OWNER.email, 'The Yard', 'the-yard', 'p_1', 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', 'Reglaze', PROJECTS[0]])
    assert.ok(!out.text.includes(said), `${said} is the first record's and stays there`);
  assert.doesNotMatch(out.text, /[0-9A-HJKMNP-TV-Z]{26}/u, 'no id of anything on the first record');
});

test('THE FILE, PLANNED AND INSTALLED ON A SECOND FRESH RECORD, DRAWS THE PAGE', async () => {
  const { exportPack } = await first();
  const out = value<ExportedPack>(await exportPack({ declarations: ['page.jobs-board', 'rule.stamp'], title: 'Jobs board' }, owner));
  const second = await fresh('the-shed', 'The Shed', { id: 'p_1', email: PEOPLE[5]!.email, name: PEOPLE[5]!.name });
  const doc = JSON.parse(out.text) as unknown;
  const planned = value<{ diff: { planHash: string; approve: unknown; adds?: string[] } }>(await second.api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  value(await second.api.installPack({ doc, source: { kind: 'local' }, planHash: planned.planHash, approve: planned.approve } as never, owner));
  value(await second.api.create({ register: 'jobs', fields: { what: 'Sand the oak floor', kind: 'court' } } as never, owner));

  const page = value<{ title: string; blocks: { key?: string; heading?: string; rows?: { fields: Record<string, unknown> }[] }[] }>(await second.api.page({ slug: 'jobs-board' }, owner));
  assert.equal(page.title, 'Jobs board');
  const every = page.blocks.find((b) => b.key === 'all');
  assert.equal(every?.heading, 'Every job');
  assert.deepEqual(every?.rows?.map((r) => r.fields.what), ['Sand the oak floor']);
  /* AND THE AUTOMATION CAME WITH IT and runs there. */
  assert.equal(every?.rows?.[0]?.fields.kind, 'paper');
});

test('THE AUTHOR ONE LINE IS THE FILE SUMMARY, kept to one short line, and no line is the plain default', async () => {
  const { exportPack } = await first();
  const said = value<ExportedPack>(await exportPack({ declarations: ['page.jobs-board'], title: 'Jobs board', summary: '  A board of  every job,\nby client. ' }, owner));
  assert.equal((JSON.parse(said.text) as { summary: string }).summary, 'A board of every job, by client.');
  const plain = value<ExportedPack>(await exportPack({ declarations: ['page.jobs-board'], title: 'Jobs board' }, owner));
  assert.match((JSON.parse(plain.text) as { summary: string }).summary, /^Jobs board, made on one BrainDog/u);
  for (const summary of ['', '   ', 'x'.repeat(141)]) assert.equal(refusal(await exportPack({ declarations: ['page.jobs-board'], summary }, owner)).at, 'summary');
});

test('A TICK OF SOMETHING NOT ITS OWN, A STRAY KEY AND A MEMBER WHO READS ONE LIST ARE REFUSED BY NAME', async () => {
  const { exportPack } = await first();
  const theirs = refusal(await exportPack({ declarations: ['register.things'] }, owner));
  assert.deepEqual([theirs.code, theirs.at], ['DECLARATION_UNKNOWN', 'declarations']);
  assert.match(theirs.fix, /register\.things/u);
  const stray = refusal(await exportPack({ declarations: ['page.jobs-board'], publish: true } as never, owner));
  assert.deepEqual([stray.code, stray.at], ['FIELD_UNKNOWN', 'publish']);
  const rows = refusal(await exportPack({ declarations: ['rule.stamp'], rows: { things: [1] } }, owner));
  assert.equal(rows.at, 'rows.things');
  for (const args of [undefined, { declarations: ['page.jobs-board'] }]) {
    const no = refusal(await exportPack(args, shut));
    assert.deepEqual([no.code, no.at], ['FORBIDDEN', 'principal']);
  }
});

test('AN ENTRY GOES ONLY WHEN rows NAMES IT, as an example, with no link to another of the first record', async () => {
  const { exportPack } = await first();
  const out = value<ExportedPack>(await exportPack({ declarations: ['register.jobs'], rows: { jobs: [1, 1] }, title: 'Jobs', version: '1.2.0' }, owner));
  const doc = JSON.parse(out.text) as { pack: string; version: string; seeds?: { register: string; fields: Record<string, unknown> }[] };
  assert.deepEqual([doc.pack, doc.version, out.file], ['jobs', '1.2.0', 'jobs.pack.json']);
  assert.deepEqual(doc.seeds, [{ register: 'jobs', fields: { what: 'Reglaze the north window', kind: 'paper' } }]);
  assert.ok(!out.text.includes('clients#1') && !out.text.includes(CLIENT), 'the link to a client stays behind');
  const missing = refusal(await exportPack({ declarations: ['register.jobs'], rows: { jobs: [9] } }, owner));
  assert.deepEqual([missing.code, missing.at], ['ROW_UNKNOWN', 'rows.jobs']);
});

test('A NEW VERSION CARRIES THE NOTE ON WHAT IT CHANGED, and the version and id it is sent as', async () => {
  const { exportPack } = await first();
  const out = value<ExportedPack>(await exportPack({ declarations: ['page.jobs-board'], title: 'Jobs board', id: 'jobs-board', version: '1.0.1', changes: '  Fixes the\nfilter on the board. ' }, owner));
  const doc = JSON.parse(out.text) as { pack: string; version: string; changes: string };
  assert.deepEqual([doc.pack, doc.version, doc.changes], ['jobs-board', '1.0.1', 'Fixes the filter on the board.']);
  const plain = JSON.parse(value<ExportedPack>(await exportPack({ declarations: ['page.jobs-board'], title: 'Jobs board' }, owner)).text) as { changes: string };
  assert.equal(plain.changes, 'The first version.');
  for (const changes of ['', '   ', 'x'.repeat(501)]) assert.equal(refusal(await exportPack({ declarations: ['page.jobs-board'], changes }, owner)).at, 'changes');
});

test('SKILLS ARE OFFERED ONLY WHEN THE RECORD KEEPS THEM, and one ticked goes out with its steps, named as a pack names one', async () => {
  const { exportPack, api } = await first();
  assert.equal(value<ExportOffer>(await exportPack(undefined, owner)).skills, undefined, 'no Skills list, no skills offered');
  assert.equal(refusal(await exportPack({ declarations: ['page.jobs-board'], skills: [1] }, owner)).code, 'ROW_UNKNOWN');

  const { agentsPackDocument } = await import('../../seed/src/index.ts');
  await put(api, agentsPackDocument());
  value(await api.create({ register: 'skills', fields: { name: 'Weekly tidy', trigger: 'On a Friday, when the week is done.', what: 'Closes out the week.', body: '1. List what is open.\n2. Ask which to carry over.' } } as never, owner));
  value(await api.create({ register: 'skills', fields: { name: 'Mail the client', trigger: 'When a job is done.', body: 'Write to ada.client@example.org with the result.' } } as never, owner));
  const offered = value<ExportOffer>(await exportPack(undefined, owner)).skills;
  /* NEWEST MADE FIRST, as every list reads in its default order. */
  assert.deepEqual(offered?.map((s) => [s.name, s.trigger]), [['Mail the client', 'When a job is done.'], ['Weekly tidy', 'On a Friday, when the week is done.']]);
  const tidy = offered!.find((s) => s.name === 'Weekly tidy')!;
  const mail = offered!.find((s) => s.name === 'Mail the client')!;

  const out = value<ExportedPack>(await exportPack({ declarations: ['page.jobs-board'], skills: [tidy.seq] }, owner));
  const doc = JSON.parse(out.text) as { skills: { name: string; trigger: string; what: string; body: string }[] };
  assert.deepEqual(doc.skills, [{ name: 'weekly-tidy', trigger: 'On a Friday, when the week is done.', what: 'Closes out the week.', body: '1. List what is open.\n2. Ask which to carry over.' }]);

  const withAddress = refusal(await exportPack({ declarations: ['page.jobs-board'], skills: [mail.seq] }, owner));
  assert.deepEqual([withAddress.code, withAddress.at], ['VALUE_MALFORMED', 'skills']);
  assert.match(withAddress.fix, /Mail the client/u);
});
