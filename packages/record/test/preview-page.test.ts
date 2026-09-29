/**
 * An agent's proposed page, drawn before anybody accepts it.
 *
 * WHAT DECIDE SHOWED. A `change` carrying a page was drawn as lines: where it sits in the sidebar, the headings of its
 * blocks and the lists it reads. Nothing on the screen said what those blocks would hold, because the only method that
 * draws a page, `page`, draws one the record already declares, and accepting the proposal was the one way to find out.
 *
 * `previewPage({ body })` DRAWS THE BODY AND WRITES NOTHING. It asks the kernel's own lint, the check an install runs, so
 * a body the record would refuse is refused here in the install's words; it runs each block through `kernel.block`; it
 * blanks a block over a list the caller cannot read exactly as `page` blanks one; and it does not write `page`'s
 * `page.render` observation, since a page nobody declared has nobody opening it. Each test was run against the record
 * before the method existed and failed there with `previewPage is not a function`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { createClient } from '../../client/src/index.ts';
import { handlersFor, serveApi } from '../../host/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const reg = (id: string, name: string, title: string, fields: unknown[]) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields } as never,
});

const DECLS = [
  reg('tasks', 'Tasks', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'state', type: 'enum', values: ['open', 'done'] },
  ]),
  reg('notes', 'Notes', 'body', [{ id: 'body', type: 'text', required: true }]),
];

type Refusal = { code: string; fix: string; at?: string };
type Block = { kind: string; source?: string; columns?: unknown; rows: unknown[]; matched: number; refusals: Refusal[] };
type Preview = { page: string; title: string; read_at: string; blocks: Block[] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: Refusal };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusalOf = (r: unknown): Refusal => {
  const x = r as { ok: boolean; refusal?: Refusal };
  assert.equal(x.ok, false, `answered ${JSON.stringify(r)}`);
  return x.refusal!;
};

/** Three tasks and a note, and Wren, invited to Notes alone, built the way the host builds a member. */
async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  for (const what of ['Write the brief', 'Ring the printer', 'Send the invoice']) value(await api.create({ register: 'tasks', fields: { what, state: 'open' } }, owner));
  value(await api.create({ register: 'notes', fields: { body: 'The printer shuts at five' } }, owner));
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { notes: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  return { sql, api, wren };
}

/** What an agent proposes: a page of open tasks, with the note beside it. */
const PROPOSED = {
  page: 'open-tasks',
  title: 'Open tasks',
  nav: { section: 'Work', order: 10 },
  blocks: [
    { kind: 'table', source: 'register.tasks', heading: 'Open', where: 'state is open' },
    { kind: 'table', source: 'register.notes', heading: 'Notes' },
  ],
};

/** Every write this connection has made, which is the one count that cannot miss a table nobody thought to ask. */
const changes = (sql: ReturnType<typeof openSqlite>): number => sql.one<{ n: number }>('SELECT total_changes() AS n')!.n;

test('A PROPOSED TABLE OVER TASKS DRAWS THE THREE TASKS THE RECORD HOLDS, and nothing is written, not even the page.render line', async () => {
  const { sql, api } = await record();
  const declared = api.kernel.declarations().length;
  const before = changes(sql);
  const seen = sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM observation')!.n;

  const drawn = value<Preview>(await api.previewPage({ body: PROPOSED }, owner));
  assert.equal(drawn.title, 'Open tasks');
  assert.equal(drawn.blocks.length, 2);
  assert.equal(drawn.blocks[0]!.rows.length, 3, JSON.stringify(drawn.blocks[0]));
  assert.equal(drawn.blocks[0]!.matched, 3);
  assert.deepEqual(drawn.blocks[0]!.refusals, []);
  assert.equal(drawn.blocks[1]!.rows.length, 1);
  /* THE RECORD'S CLOCK, as `page` answers it, so Decide draws what is late against the day the record reads. */
  assert.equal(drawn.read_at, new Date(NOW).toISOString());

  assert.equal(api.kernel.declarations().length, declared, 'a preview installed a declaration');
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM observation')!.n, seen, 'a preview wrote an observation');
  assert.equal(changes(sql), before, 'a preview wrote to the record');
  /* AND THE PAGE IS STILL NOBODY'S: asking for it by its slug is asking for a page that does not exist. */
  assert.equal(refusalOf(await api.page({ slug: 'open-tasks' }, owner)).code, 'PAGE_UNKNOWN');
  sql.close();
});

test('SOMEBODY WHO CANNOT READ TASKS IS REFUSED THAT BLOCK AND DRAWN THE OTHER, as page draws a declared one', async () => {
  const { sql, api, wren } = await record();
  const drawn = value<Preview>(await api.previewPage({ body: PROPOSED }, wren));
  const [tasks, notes] = drawn.blocks;
  assert.deepEqual(tasks!.rows, []);
  assert.equal(tasks!.matched, 0);
  assert.equal(tasks!.refusals.length, 1);
  assert.equal(tasks!.refusals[0]!.code, 'FORBIDDEN');
  /* THE LIST'S ID AND ITS FIELDS GO WITH THE ROWS, which is what `page` keeps back from her for the same block. */
  assert.equal(tasks!.source, undefined);
  assert.equal(tasks!.columns, undefined);
  /* AND THE CONTROL, so a preview that refused everybody everything cannot pass: her own list draws. */
  assert.equal(notes!.rows.length, 1);
  assert.deepEqual(notes!.refusals, []);
  sql.close();
});

test("A BODY THE RECORD WOULD NOT INSTALL IS REFUSED IN THE INSTALL'S OWN WORDS, and is never drawn", async () => {
  const { sql, api, wren } = await record();
  const kind = refusalOf(await api.previewPage({ body: { ...PROPOSED, blocks: [{ kind: 'nosuch', source: 'register.tasks' }] } }, owner));
  assert.equal(kind.code, 'KIND_UNKNOWN');
  assert.equal(kind.at, 'blocks[0]');
  const untitled = refusalOf(await api.previewPage({ body: { ...PROPOSED, title: '' } }, owner));
  assert.equal(untitled.code, 'DECLARATION_INVALID');
  assert.equal(untitled.at, 'title');
  assert.equal(refusalOf(await api.previewPage({ body: { ...PROPOSED, requires: ['register.nosuch'] } }, owner)).code, 'DEPENDENCY_UNRESOLVED');
  assert.equal(refusalOf(await api.previewPage({}, owner)).code, 'REQUIRED_MISSING');
  assert.equal(refusalOf(await api.previewPage({ body: PROPOSED, extra: 1 } as never, owner)).code, 'FIELD_UNKNOWN');

  /* A LIST SHE CANNOT READ AND A LIST NOBODY DECLARED ARE ONE ANSWER TO HER, or `requires` would be the way to learn
     which lists this record keeps, one guess at a time. The owner is told which is which, since she reads them all. */
  const held = refusalOf(await api.previewPage({ body: { ...PROPOSED, requires: ['register.tasks'] } }, wren));
  const absent = refusalOf(await api.previewPage({ body: { ...PROPOSED, requires: ['register.nosuch'] } }, wren));
  assert.equal(held.code, absent.code);
  assert.equal(held.at, 'requires');
  assert.equal(held.fix.replace('tasks', 'X'), absent.fix.replace('nosuch', 'X'));
  sql.close();
});

test('A BLOCK OVER A LIST SHE CANNOT READ IS HELD BEFORE THE LINT READS IT, or its refusal would name the fields of that list', async () => {
  /* MEASURED BY THE CHECKER ON THE FIRST CUT. The `requires` guard ran before the lint, and nothing guarded a block: Wren,
     invited to Notes alone, sent a table over Tasks filtered by `nosuch is x`, and the lint answered `FIELD_UNKNOWN` with
     `allowed: ["what","state","tags",...]`, the schema `schema` refuses her, while `state is open` drew a blanked block
     and `register.nosuch` drew another. Three bodies, three answers: which lists exist and every field of each. */
  const { sql, api, wren } = await record();
  const over = (block: Record<string, unknown>) => api.previewPage({ body: { ...PROPOSED, blocks: [{ kind: 'table', heading: 'Open', ...block }] } }, wren);
  const unknownField = value<Preview>(await over({ source: 'register.tasks', where: 'nosuch is x' }));
  const knownField = value<Preview>(await over({ source: 'register.tasks', where: 'state is open' }));
  const noList = value<Preview>(await over({ source: 'register.nosuch', where: 'nosuch is x' }));
  assert.equal(unknownField.blocks[0]!.refusals[0]!.code, 'FORBIDDEN');
  assert.doesNotMatch(JSON.stringify(unknownField), /"state"/u);
  assert.deepEqual(unknownField.blocks, knownField.blocks);
  assert.deepEqual(unknownField.blocks, noList.blocks);
  /* AND THE OWNER, WHO READS EVERY LIST, is still told in the lint's words what is wrong with the block. */
  assert.equal(refusalOf(await api.previewPage({ body: { ...PROPOSED, blocks: [{ kind: 'table', source: 'register.tasks', where: 'nosuch is x' }] } }, owner)).code, 'FIELD_UNKNOWN');
  sql.close();
});

test('AND IT IS ROUTED: the client posts it to the host, READ+, and gets what the record answers', async () => {
  /* A POST AND NOT A GET, as `scriptTry` is: a page body is not a query string, and a caller-written body that walks a
     list is not a read to leave in a URL. (The Cloud's public demo, which once answered GET reads to anybody, is gone.) */
  const { sql, api } = await record();
  const handlers = handlersFor(api);
  const sent: string[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    sent.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    return serveApi(new Request(url, init), handlers, owner);
  }) as typeof globalThis.fetch;
  const client = createClient({ base: 'https://braindog.example', fetch });
  const drawn = value<Preview>(await client.call('previewPage', { body: PROPOSED }));
  assert.equal(drawn.blocks[0]!.rows.length, 3);
  assert.deepEqual(sent, ['POST /api/previewPage']);
  sql.close();
});
