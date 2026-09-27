/**
 * A whole change drawn before anybody accepts it: `previewChange` (`loop/finish/contracts.md` §2.4, pages C2).
 *
 * WHAT COULD NOT BE DRAWN BEFORE. `previewPage` draws one page against the record as it is, so the launch desk, whose
 * pages read lists the same change brings, could not be seen at all until its lists were accepted, and its page per
 * part was drawn with `{{name}}` in it (`packages/mcp/test/compose-page.test.ts` measured both). `previewChange`
 * installs the whole change in the kernel's rehearsal, writes the sample rows through the write path, reads each page
 * with `page`'s own reader and throws every write away.
 *
 * SO THE TESTS ASK TWO THINGS OF EVERY CALL: what was drawn, and that nothing stayed. The rehearsal's rollback is the
 * SQL's, and the list cache is put back by hand (`packages/kernel/src/api/rehearse.ts`), so the cache is read after
 * each call as well as the tables: a list the rehearsal installed and the cache kept would be a list the record does
 * not hold and every later write would read (`loop/finish/pages.md` §6.4 risk 2).
 *
 * THE DESK IN THREE CALLS, NOT ONE. A preview takes at most `PREVIEW_DECLARATIONS_MOST` declarations (§2.4), and the
 * whole desk with the pad's notes is more than that, so the brief's one call (`loop/finish/pages.md`, PGS-6) is three
 * here. Its Desk and part pages with the lists and figures they read fit in one call, Numbers with its own in another,
 * which the Numbers test holds to the ceiling exactly, and the rule and the script that add a price check's costs up in
 * a third, beside the list they watch.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createRecordApi, PREVIEW_DECLARATIONS_MOST, type CallContext, type ChangePreviewed, type PreviewedPage } from '../src/index.ts';
import { tools } from '../../mcp/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 26, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; fix: string; at?: string };
type Drawn = { kind: string; heading?: string; source?: string; columns?: unknown; rows: { fields: Record<string, unknown> }[]; matched: number; refusals: Refusal[] };
type Decl = Record<string, unknown>;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: Refusal };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};
const refusalOf = (r: unknown): Refusal => {
  const x = r as { ok: boolean; refusal?: Refusal };
  assert.equal(x.ok, false, `answered ${JSON.stringify(r).slice(0, 400)}`);
  return x.refusal!;
};

/* ── the desk, as the pack ships it ── */

const packOf = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as { declarations: Decl[] };
const DESK_PACK = packOf('../../../packs/launch-desk/launch-desk.pack.json').declarations;
const NOTES = packOf('../../../packs/pad/pad.pack.json').declarations.find((d) => d.register === 'notes')!;

/** A pack's declaration as a change carries it: the kind is its first key, and a list's own word becomes `id`. */
const declarationOf = (d: Decl): { id: string; kind: string; body: Decl } => {
  const kind = Object.keys(d)[0]!;
  const name = String(d[kind]);
  if (kind !== 'register') return { id: `${kind}.${name}`, kind, body: d };
  const { register: _named, ...rest } = d;
  return { id: `register.${name}`, kind, body: { id: name, ...rest } };
};
const named = (kind: string, ...names: string[]): Decl[] => names.map((n) => (kind === 'register' && n === 'notes' ? NOTES : DESK_PACK.find((d) => d[kind] === n)!));

/** The Desk and the page per part, with every list and figure they read. */
const DESK = [
  ...named('register', 'parts', 'steps', 'contacts', 'lessons', 'notes'),
  ...named('metric', 'essentials', 'essentials-done', 'essentials-share'),
  ...named('page', 'desk', 'part'),
].map(declarationOf);

/** Numbers, with its two lists, the parts a budget line points at, and its figures. */
const NUMBERS = [
  ...named('register', 'parts', 'checks', 'lines'),
  ...named('metric', 'price', 'costs', 'priced', 'cost-share', 'least-price', 'price-room', 'price-free', 'price-unjudged'),
  ...named('page', 'numbers'),
].map(declarationOf);

/** Two parts, a step done and one to do on the first, and a thought on the pad: invented, for a small launch. */
const SAMPLES = {
  parts: [
    { name: 'Product', what: 'The first piece', big: true },
    { name: 'Box', what: 'What it ships in' },
  ],
  steps: [
    { what: 'Cut the pattern', part: 'parts#1', done: true, priority: 'essential', rank: 1 },
    { what: 'Sample the fit', part: 'parts#1', done: false, priority: 'essential', rank: 2 },
  ],
  notes: [{ text: 'Maybe fewer parts to start with.' }],
};

/* ── the records ── */

async function blank() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'launch', name: 'Launch', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  return { sql, api };
}

const reg = (id: string, name: string, title: string, fields: unknown[]) => ({ id: `register.${id}`, kind: 'register' as const, body: { id, name, title, fields } as never });

/** Three tasks and a note, and Wren, invited to Notes alone, built the way the host builds a member. */
async function studio() {
  const { sql, api } = await blank();
  const put = await api.kernel.install([
    reg('tasks', 'Tasks', 'what', [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ]),
    reg('notes', 'Notes', 'body', [{ id: 'body', type: 'text', required: true }]),
  ]);
  assert.ok(put.ok, JSON.stringify(put));
  for (const what of ['Write the brief', 'Ring the printer', 'Send the invoice']) value(await api.create({ register: 'tasks', fields: { what, state: 'open' } }, owner));
  value(await api.create({ register: 'notes', fields: { body: 'The printer shuts at five' } }, owner));
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { notes: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  return { sql, api, wren };
}

/** What a record holds that a preview must leave as it was: its declarations, its version, its log, its lists. */
async function held(sql: ReturnType<typeof openSqlite>, api: Awaited<ReturnType<typeof createRecordApi>>) {
  const count = (table: string): number => sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n;
  return {
    declarations: api.kernel.declarations().map((d) => `${d.id}@${d.version}`),
    version: value<unknown>(await api.version(owner)),
    events: count('event'),
    observations: count('observation'),
    entries: count('entry'),
    lists: [...api.kernel.registers().keys()].sort(),
  };
}

const pageOf = (answer: ChangePreviewed, id: string): PreviewedPage => {
  const found = answer.pages.find((p) => p.id === id);
  assert.ok(found, `no ${id} among ${answer.pages.map((p) => p.id).join(', ')}`);
  return found;
};
const headed = (blocks: unknown[], heading: string): Drawn => {
  const found = (blocks as Drawn[]).find((b) => b.heading === heading);
  assert.ok(found, `no block headed ${heading} among ${JSON.stringify((blocks as Drawn[]).map((b) => b.heading ?? b.kind))}`);
  return found;
};

/* ── the tests ── */

test('THE DESK AND ITS PAGE PER PART, TRIED IN ONE CALL OVER SAMPLE ROWS, DRAW WHAT THEY WOULD HOLD, and the record keeps nothing', async () => {
  const { sql, api } = await blank();
  const before = await held(sql, api);

  const drawn = value<ChangePreviewed>(await api.previewChange({ to: { declarations: DESK }, rows: SAMPLES }, owner));
  assert.deepEqual(drawn.pages.map((p) => p.id), ['page.desk', 'page.part']);

  const desk = pageOf(drawn, 'page.desk');
  assert.equal(desk.slug, 'desk');
  assert.equal(desk.title, 'Desk');
  assert.deepEqual(desk.nav, { section: 'Launch', order: 10, tabs: true });
  assert.deepEqual(desk.layout, { rail: 4, sticky: true });
  assert.equal(desk.about, null);
  assert.equal(desk.was, null, 'a new page has no page as it stands');
  const done = headed(desk.blocks, 'Already done');
  assert.deepEqual(done.refusals, []);
  assert.deepEqual(done.rows.map((r) => r.fields.what), ['Cut the pattern']);

  /* THE PAGE PER PART, FILLED OVER THE FIRST PART, where `previewPage` drew `{{name}}`. */
  const part = pageOf(drawn, 'page.part');
  assert.equal(part.about, 'parts#1');
  assert.equal(part.title, 'Product');
  /* THE OPEN STEP IN ITS SHORT VIEW, as the installed tab draws it (`packages/mcp/test/compose-page.test.ts`). */
  assert.deepEqual(headed(part.blocks, 'The path').rows.map((r) => r.fields.what), ['Sample the fit']);

  /* AND NOTHING STAYED: not a declaration, not a row, not a line of the log, and not a list in the cache. */
  assert.deepEqual(await held(sql, api), before);
  assert.equal(api.kernel.register('parts'), undefined, 'the rehearsal left Parts in the list cache');
  assert.equal(refusalOf(await api.list({ register: 'parts' } as never, owner)).code, 'REGISTER_UNKNOWN');
  sql.close();
});

test('about FILLS THE PAGE PER PART OVER THE PART IT NAMES, and a row that is no such part is refused in its own words', async () => {
  const { sql, api } = await blank();
  const box = value<ChangePreviewed>(await api.previewChange({ to: { declarations: DESK }, rows: SAMPLES, about: 'parts#2' }, owner));
  const part = pageOf(box, 'page.part');
  assert.equal(part.about, 'parts#2');
  assert.equal(part.title, 'Box');
  assert.deepEqual(headed(part.blocks, 'The path').rows, []);

  const none = refusalOf(await api.previewChange({ to: { declarations: DESK }, rows: SAMPLES, about: 'parts#9' }, owner));
  assert.equal(none.code, 'VALUE_MALFORMED');
  assert.equal(none.at, 'about');
  /* A ROW OF A LIST NO PAGE OF THE CHANGE IS MADE FOR says so, rather than being dropped without a word. */
  assert.equal(refusalOf(await api.previewChange({ to: { declarations: DESK }, rows: SAMPLES, about: 'steps#1' }, owner)).at, 'about');
  sql.close();
});

test('A PAGE PER ROW WITH NO ROW YET IS DRAWN WITH ITS PLACEHOLDERS, under one sentence that says so', async () => {
  const { sql, api } = await blank();
  const drawn = value<ChangePreviewed>(await api.previewChange({ to: { declarations: DESK } }, owner));
  const part = pageOf(drawn, 'page.part');
  assert.equal(part.about, null);
  const first = part.blocks[0] as unknown as { kind: string; body?: string };
  assert.equal(first.kind, 'note');
  assert.match(first.body ?? '', /^No row of Parts yet, so this page is drawn with its placeholders\.$/);
  sql.close();
});

test('NUMBERS, WITH ITS LISTS AND EVERY FIGURE IT READS, IS TWELVE DECLARATIONS AND DRAWS; A THIRTEENTH IS OUT OF BOUNDS', async () => {
  const { sql, api } = await blank();
  const before = await held(sql, api);
  assert.equal(NUMBERS.length, PREVIEW_DECLARATIONS_MOST);
  const drawn = value<ChangePreviewed>(await api.previewChange({ to: { declarations: NUMBERS }, rows: { checks: [{ what: 'First price', price: 1000, making: 200, packing: 50, sending: 50, cost: 300 }] } }, owner));
  const numbers = pageOf(drawn, 'page.numbers');
  assert.equal(numbers.slug, 'numbers');
  assert.ok(numbers.blocks.length > 0);
  assert.deepEqual(await held(sql, api), before);

  const over = refusalOf(await api.previewChange({ to: { declarations: [...NUMBERS, declarationOf(NOTES)] } }, owner));
  assert.equal(over.code, 'OUT_OF_BOUNDS');
  assert.equal(over.at, 'to.declarations');
  sql.close();
});

test("THE DESK'S RULE AND THE SCRIPT IT STARTS ARE TRIED BESIDE THE PRICE CHECK THEY WATCH, and neither stays", async () => {
  const { sql, api } = await blank();
  const before = await held(sql, api);
  /* A SAMPLE THAT WRITES A COST, so the rule's trigger is met inside the rehearsal and its run is thrown away with it. */
  const costed = { checks: [{ what: 'First price', price: 1000, making: 200, packing: 50, sending: 50 }] };
  const change = [...named('register', 'checks'), ...named('rule', 'launch_desk_cost'), ...named('script', 'launch_desk_cost')].map(declarationOf);
  const drawn = value<ChangePreviewed>(await api.previewChange({ to: { declarations: change }, rows: costed }, owner));
  assert.deepEqual(drawn.pages, [], 'a change with no page draws none');
  assert.deepEqual(await held(sql, api), before);
  for (const id of ['register.checks', 'rule.launch_desk_cost', 'script.launch_desk_cost'])
    assert.equal(api.kernel.declarations().some((d) => d.id === id), false, `the rehearsal kept ${id}`);
  sql.close();
});

test('A CHANGE TO A PAGE THE RECORD HAS ANSWERS THE PAGE AS IT STANDS BESIDE THE PAGE AS IT WOULD', async () => {
  const { sql, api } = await studio();
  const page = (source: string) => ({ id: 'page.work', kind: 'page', body: { page: 'work', title: 'Work', blocks: [{ kind: 'table', source, heading: 'Rows' }] } });
  const put = await api.kernel.install([page('register.notes') as never]);
  assert.ok(put.ok, JSON.stringify(put));
  const before = await held(sql, api);

  const drawn = value<ChangePreviewed>(await api.previewChange({ to: page('register.tasks') }, owner));
  const work = pageOf(drawn, 'page.work');
  assert.equal((work.blocks[0] as unknown as Drawn).rows.length, 3, 'the page as it would stand reads Tasks');
  assert.ok(work.was, 'a change to a page the record has answered no page as it stands');
  assert.equal((work.was[0] as unknown as Drawn).rows.length, 1, 'the page as it stands reads Notes');
  assert.deepEqual(await held(sql, api), before);
  sql.close();
});

test('SOMEBODY HELD FROM TASKS HAS THE BLOCK OVER TASKS HELD AND HER OWN LIST DRAWN, as page holds a declared one', async () => {
  const { sql, api, wren } = await studio();
  const both = {
    id: 'page.both',
    kind: 'page',
    body: {
      page: 'both',
      title: 'Both',
      blocks: [
        { kind: 'table', source: 'register.tasks', heading: 'Tasks', where: 'state is open' },
        { kind: 'table', source: 'register.notes', heading: 'Notes' },
      ],
    },
  };
  const drawn = value<ChangePreviewed>(await api.previewChange({ to: both }, wren));
  const [tasks, notes] = pageOf(drawn, 'page.both').blocks as unknown as Drawn[];
  assert.deepEqual(tasks!.rows, []);
  assert.equal(tasks!.refusals.length, 1);
  assert.equal(tasks!.refusals[0]!.code, 'FORBIDDEN');
  /* THE LIST'S ID AND ITS FIELDS GO WITH THE ROWS. */
  assert.equal(tasks!.source, undefined);
  assert.equal(tasks!.columns, undefined);
  assert.equal(notes!.rows.length, 1);
  sql.close();
});

test('A LIST SHE CANNOT READ IS REFUSED BEFORE ANYTHING IS LINTED, IN THE SENTENCE A LIST NOBODY DECLARED GETS', async () => {
  const { sql, api, wren } = await studio();
  const page = { id: 'page.mine', kind: 'page', body: { page: 'mine', title: 'Mine', blocks: [{ kind: 'table', source: 'register.notes' }] } };
  const hidden = refusalOf(await api.previewChange({ to: page, rows: { tasks: [{ what: 'x' }] } }, wren));
  const absent = refusalOf(await api.previewChange({ to: page, rows: { nosuch: [{ what: 'x' }] } }, wren));
  assert.equal(hidden.code, absent.code);
  assert.equal(hidden.at, 'rows.tasks');
  assert.equal(hidden.fix.replace('tasks', 'X'), absent.fix.replace('nosuch', 'X'));
  /* AND A RULE IS FOR WHOEVER READS THE WHOLE RECORD, since it acts on rows across it. */
  const rule = refusalOf(await api.previewChange({ to: { id: 'rule.chase', kind: 'rule', body: { rule: 'chase', register: 'notes' } } }, wren));
  assert.equal(rule.code, 'FORBIDDEN');
  sql.close();
});

test('AN AGENT TRIES THE DESK AS ONE BUNDLE OVER MCP AND IS ANSWERED change_preview, and nothing is filed', async () => {
  const { sql, api } = await blank();
  const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'propose', person: 'p_1', level: 'owner' } };
  const suggestions = (): number => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM suggestion')!.n;
  const before = await held(sql, api);
  const filed = suggestions();

  const out = await tools(api).call(
    'propose',
    { question: 'Add the launch desk?', body_kind: 'change', body: { declaration_id: 'metric.essentials', to: { declarations: DESK }, try: { rows: SAMPLES } } },
    agent,
  );
  const answered = value<{ change_preview: ChangePreviewed; proposed: boolean }>(out);
  assert.equal(answered.proposed, false);
  assert.deepEqual(answered.change_preview.pages.map((p) => p.id), ['page.desk', 'page.part']);
  assert.equal(pageOf(answered.change_preview, 'page.part').title, 'Product');
  assert.equal(suggestions(), filed, 'a tried change was filed');
  assert.deepEqual(await held(sql, api), before);

  /* `try` TAKES rows AND about AND NOTHING ELSE, named in its own sentence. */
  const odd = refusalOf(
    await tools(api).call('propose', { question: 'q', body_kind: 'change', body: { declaration_id: 'metric.essentials', to: { declarations: DESK }, try: { input: 1 } } }, agent),
  );
  assert.equal(odd.code, 'VALUE_MALFORMED');
  assert.equal(odd.at, 'body.try');
  sql.close();
});

test("THE LINT'S REFUSAL NAMES THE DECLARATION IT IS ABOUT, so the author of a bundle knows which one to mend", async () => {
  const { sql, api } = await studio();
  const bad = { id: 'page.bad', kind: 'page', body: { page: 'bad', title: 'Bad', blocks: [{ kind: 'nosuch', source: 'register.tasks' }] } };
  const list = reg('extras', 'Extras', 'what', [{ id: 'what', type: 'text', required: true }]);
  const said = refusalOf(await api.previewChange({ to: { declarations: [list, bad] } }, owner));
  assert.equal(said.code, 'KIND_UNKNOWN');
  assert.ok(said.at?.startsWith('page.bad'), `at is ${said.at}`);
  /* AND AN ARGUMENT THE METHOD DOES NOT TAKE IS NAMED, with what it does take. */
  const stray = refusalOf(await api.previewChange({ to: bad, body: {} } as never, owner));
  assert.equal(stray.code, 'FIELD_UNKNOWN');
  assert.equal(stray.at, 'body');
  sql.close();
});
