/**
 * Services and Renewals as a file: `estate.pack.json` held equal to the module the build still compiles in
 * (`packages/seed/src/modules/estate.ts`), so taking the module out is one small change and not a rewrite.
 *
 * WHAT IS HELD. For each thing Estate may lean on, which is Projects and nothing else, a record is made with it and one
 * without. The file is read by `normalise`, planned on that record by `plan` (through the record's own `planPack`), and
 * what the plan would store is laid beside `firstPartyDocument('estate', { holds })` after `normalise`: list by list,
 * page by page, figure by figure and rule by rule. Where they differ the failure says so in names, never in a path.
 *
 * WHERE THE FILE SAYS MORE THAN THE MODULE CAN, AND THE TEST SAYS SO OUT LOUD. The module's document is the same
 * whatever a record holds: its Project field is not one of the links `firstPartyDocument` leaves out, so on a record
 * with no Projects the module is refused whole (`REGISTER_UNRESOLVED`). The file says the field, and the one figure
 * asked of it, wait for Projects. So with Projects the two are equal part for part, and without them the file is the
 * module less those two parts, each named in the plan's `waiting`. The day the module learns to leave the field out,
 * the test under "WITHOUT PROJECTS" goes red and says to drop the allowance.
 *
 * IT RUNS WHILE THE MODULE LIVES AND IS DELETED WITH IT. Until then a change to the module that the file does not make
 * is a red test here, which is the point: nobody edits one and forgets the other.
 *
 * RED FIRST, MEASURED: with no `estate.pack.json` this file failed at its first read, ENOENT, on each of the four tests
 * written by then (the file's own checks). The rows in the fixtures are invented; none is anybody's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { settleWhen } from '../../packages/declare/src/catalogue.ts';
import { normalise, type Pack } from '../../packages/declare/src/index.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { FIRST_PARTY_VERSIONS, firstPartyDocument, firstPartyManifest } from '../../packages/seed/src/index.ts';

const NOW = Date.UTC(2026, 2, 10, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Body = Record<string, unknown>;
type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Waiting = { at: string; holds: string[] };
type Diff = {
  planHash: string;
  approve: unknown[];
  direction: string;
  installed_version: string | null;
  waiting: Waiting[];
  conflicts: unknown[];
  adds: { id: string }[];
  changes: { id: string }[];
  retires: unknown[];
  retypes: unknown[];
  newly_required: unknown[];
  orphans: number;
};

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./estate.pack.json', import.meta.url);
type File = Body & { pack: string; version: string; declarations: Body[]; seeds: { register: string; fields: Body }[]; config: Record<string, Body> };
const file = (): File => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as never;

/** Projects' own list, the one thing Estate may lean on, and the add-on that declares it. */
const PROJECTS = 'things';
const SUBSETS: readonly { name: string; holds: readonly string[] }[] = [
  { name: 'with Projects', holds: [PROJECTS] },
  { name: 'without Projects', holds: [] },
];

/** A fresh record holding exactly `holds` of what Estate may lean on, with no example rows of theirs. */
async function record(holds: readonly string[]): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  if (holds.includes(PROJECTS)) said(await put(api, firstPartyDocument('portfolio', { holds: [PROJECTS], seeds: [] })));
  return { api, close: () => sql.close() };
}

const planOf = async (api: Api, doc: unknown): Promise<Diff> =>
  said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<Out> {
  const diff = await planOf(api, doc);
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

const read = async (doc: unknown): Promise<Pack> => said<Pack>(await normalise(doc));

/** The module's Estate for a record that holds `holds`, as `normalise` reads it. */
const moduleFor = (holds: readonly string[]): Promise<Pack> => read(firstPartyDocument('estate', { holds: [...holds, 'services'] }));

/** The file as `plan` would store it on this record: the parts that wait taken out, and what waits. */
async function resolved(api: Api): Promise<{ pack: Pack; diff: Diff }> {
  const diff = await planOf(api, file());
  return { pack: settleWhen(await read(file()), diff.waiting), diff };
}

/* ── Saying a difference in names ──────────────────────────────────────────────────────────────── */

const isBody = (v: unknown): v is Body => v !== null && typeof v === 'object' && !Array.isArray(v);
const KINDS: Readonly<Record<string, string>> = { register: 'the list', page: 'the page', metric: 'the figure', rule: 'the rule', script: 'the script' };

/** What a person calls one declaration: "the figure Cost per month", never `metric.estate-month`. */
function nameOf(d: { kind: string; id: string; body: Body }): string {
  const name = d.body.name ?? d.body.title;
  return `${KINDS[d.kind] ?? d.kind} ${typeof name === 'string' && name !== '' ? name : d.id.slice(d.id.indexOf('.') + 1)}`;
}

/** What one part of a body is called: a field by its label, a block by its heading, a column by its field. */
function partName(part: unknown, i: number): string {
  if (!isBody(part)) return `part ${i + 1}`;
  for (const key of ['label', 'heading', 'name', 'id', 'field', 'metric', 'kind']) if (typeof part[key] === 'string' && part[key] !== '') return `"${part[key] as string}"`;
  return `part ${i + 1}`;
}

/** Every place two values differ, each said as the words that lead to it and what each side says there. */
function differences(mine: unknown, theirs: unknown, at: string, out: string[] = []): string[] {
  if (JSON.stringify(mine) === JSON.stringify(theirs)) return out;
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const most = Math.max(mine.length, theirs.length);
    for (let i = 0; i < most; i++) differences(mine[i], theirs[i], `${at}, ${partName(mine[i] ?? theirs[i], i)}`, out);
    return out;
  }
  if (isBody(mine) && isBody(theirs)) {
    const before = out.length;
    for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs)])) differences(mine[key], theirs[key], `${at}, ${key}`, out);
    /* THE SAME KEYS IN ANOTHER ORDER is a difference too: a stored body is its text, and a plan compares the text. */
    if (out.length === before) out.push(`${at}: the same words in another order`);
    return out;
  }
  const say = (v: unknown): string => (v === undefined ? 'nothing' : JSON.stringify(v));
  out.push(`${at}: the file says ${say(mine)}, the module says ${say(theirs)}`);
  return out;
}

/** The file's declarations against the module's, kind by kind, as lines a person can act on. Empty when they agree. */
function parity(mine: Pack, theirs: Pack): string[] {
  const out: string[] = [];
  const byId = new Map(theirs.declarations.map((d) => [d.id, d]));
  for (const d of mine.declarations) {
    const other = byId.get(d.id);
    if (other === undefined) out.push(`${nameOf(d)} is in the file and not in the module`);
    else differences(d.body, other.body, nameOf(d), out);
    byId.delete(d.id);
  }
  for (const d of byId.values()) out.push(`${nameOf(d)} is in the module and not in the file`);
  /* AND IN THE SAME ORDER, since a page is laid in the order its figures are declared where two share a place. */
  if (out.length === 0 && mine.declarations.map((d) => d.id).join() !== theirs.declarations.map((d) => d.id).join())
    out.push(`the file declares its parts in another order: ${mine.declarations.map(nameOf).join(', ')}`);
  return out;
}

const KIND_ORDER = ['register', 'page', 'metric', 'rule'] as const;
const of = (pack: Pack, kind: string): Pack => ({ ...pack, declarations: pack.declarations.filter((d) => d.kind === kind) });

/* ── The file's own checks ─────────────────────────────────────────────────────────────────────── */

/** Every part of the file that waits on what a record holds, as where it is and what it waits for. */
function waits(doc: File): { at: string; holds: unknown }[] {
  const out: { at: string; holds: unknown }[] = [];
  const walk = (v: unknown, at: string): void => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${at}, ${partName(x, i)}`));
    if (!isBody(v)) return;
    if (isBody(v.when) && Object.hasOwn(v.when, 'holds')) out.push({ at, holds: v.when.holds });
    for (const [key, inner] of Object.entries(v)) if (key !== 'when') walk(inner, at);
  };
  doc.declarations.forEach((d, i) => walk(d, partName({ name: d.name ?? d.title }, i)));
  return out;
}

test('THE FILE IS DATA AND ONLY ITS OWN: no script, one list, two pages and ten figures over that list, four rules', () => {
  const doc = file();
  assert.equal(doc.pack, 'estate');
  const kinds = doc.declarations.map((d) => ['rule', 'script', 'ingest', 'register', 'page', 'metric'].find((k) => typeof d[k] === 'string') ?? 'something else');
  assert.deepEqual(
    Object.fromEntries(['register', 'page', 'metric', 'rule'].map((k) => [k, kinds.filter((x) => x === k).length])),
    /* TWO PAGES SINCE 2.3.0 (things, not rows): Renewals, and one for each service. */
    { register: 1, page: 2, metric: 10, rule: 4 },
    'one list, two pages, ten figures and four rules',
  );
  assert.ok(!kinds.includes('script') && !kinds.includes('something else'), 'the file declares a script, or something that is none of the four');
  assert.doesNotMatch(JSON.stringify(doc.declarations), /"script"|"source":"(?!register\.|metric\.|governance\.|activity")|"egress"|"keys"/u, 'a step that runs a script or reaches out');

  /* NO LIST AND NO FIGURE IT DOES NOT OWN: every figure reads Services, and so does every block that reads a list. */
  assert.deepEqual(doc.declarations.flatMap((d) => (typeof d.register === 'string' && d.rule === undefined ? [d.register] : [])), ['services']);
  for (const d of doc.declarations) if (typeof d.metric === 'string') assert.equal(d.source, 'register.services', `${String(d.name)} reads a list that is not Services`);
  const page = doc.declarations.find((d) => d.page === 'estate')!;
  assert.deepEqual(page.requires, ['register.services']);
  const lists = (page.blocks as Body[]).flatMap((b) => (typeof b.source === 'string' && b.source.startsWith('register.') ? [b.source] : []));
  assert.deepEqual([...new Set(lists)], ['register.services'], 'a block reads a list that is not Services');
  const own = new Set(doc.declarations.flatMap((d) => (typeof d.metric === 'string' ? [d.metric] : [])));
  for (const b of page.blocks as Body[]) {
    const from = typeof b.source === 'string' && b.source.startsWith('metric.') ? [b.source.slice('metric.'.length)] : [];
    for (const m of [...from, ...((b.cells as Body[] | undefined) ?? []).map((c) => String(c.metric))]) assert.ok(own.has(m), `"${String(b.heading)}" draws a figure the file does not declare`);
  }
  for (const d of doc.declarations) if (typeof d.rule === 'string' && typeof d.register === 'string') assert.equal(d.register, 'services');

  assert.doesNotMatch(JSON.stringify(doc), /—/u, 'an em dash in words a person reads');
});

test('ITS VERSION IS ONE MINOR STEP ABOVE THE MODULE, and it says what changed in one plain note', () => {
  const doc = file();
  const [major, minor] = FIRST_PARTY_VERSIONS.estate.split('.').map(Number) as [number, number];
  assert.equal(doc.version, `${major}.${minor + 1}.0`, `the module is at ${FIRST_PARTY_VERSIONS.estate}, so the file is the next minor step`);
  const changes = doc.changes;
  assert.ok(typeof changes === 'string' && changes.trim() !== '', 'the file says what this version changed');
  assert.ok(changes.length <= 500 && !/[\r\n]/u.test(changes), 'one note, on one line, 500 characters at most');
  assert.doesNotMatch(changes, /\b(register|declaration|manifest|entity|row|pack|module|seed|[0-9A-HJKMNP-TV-Z]{26})\b/u, 'a word of the build in a note a person reads');
  assert.deepEqual(doc.words, { services: { name: 'Services', one: 'service' } }, 'what a person calls the list, many and one');
});

test('PROJECTS IS ASKED FOR ONLY WHERE IT IS READ: the Project field and the figure asked of it wait, and nothing else', () => {
  const doc = file();
  assert.deepEqual(doc.requires, { format: 1, primitives: 1, packs: {} }, 'Services installs on a record with no other add-on');
  assert.deepEqual(waits(doc), [
    { at: '"Services", "Project"', holds: [PROJECTS] },
    { at: '"Costs a year"', holds: [PROJECTS] },
  ]);
  const fields = doc.declarations.find((d) => d.register === 'services')!.fields as Body[];
  const project = fields.find((f) => f.id === 'thing')!;
  assert.deepEqual([project.type, project.to, project.required ?? false], ['ref', PROJECTS, false], 'a part that waits cannot be one every service must have');
  /* AND NOTHING ELSE POINTS OUT OF THE FILE: the one link is the only field that names another list. */
  assert.deepEqual(fields.filter((f) => f.to !== undefined).map((f) => f.id), ['thing']);
  /* PRICE AND RENEWAL DAY ARE OPTIONAL, so a service whose day or price nobody has looked up is still kept. */
  assert.deepEqual(fields.filter((f) => f.required === true).map((f) => f.id), ['name', 'kind', 'cycle', 'state']);
});

test('THE FIVE SETTINGS ARE WRITTEN IN THE FILE, each with no line set, and they are the five the module builds', () => {
  const doc = file();
  const built = firstPartyDocument('estate')!.config as Record<string, Body>;
  assert.deepEqual(Object.keys(doc.config), Object.keys(built), 'the same settings in the same order');
  assert.equal(Object.keys(doc.config).length, 5);
  for (const [key, setting] of Object.entries(doc.config)) {
    assert.deepEqual(setting, built[key], `the setting "${String(setting.label)}" is not what the module builds`);
    assert.equal(setting.default, undefined, `"${String(setting.label)}" starts with a line nobody set`);
  }
  /* EACH IS HELD BY ONE FIGURE, and no figure is held to a setting the file does not say. */
  const held = doc.declarations.flatMap((d) => (typeof d.metric === 'string' && isBody(d.target) && typeof d.target.setting === 'string' ? [d.target.setting] : []));
  assert.deepEqual([...held].sort(), Object.keys(doc.config).sort());
});

/* ── Parity with the module, on a record with Projects and on one without ──────────────────────── */

/** The two parts the file lets wait, as the plan names them, in the order the file says them. */
async function waitingParts(): Promise<Waiting[]> {
  const pack = await read(file());
  const list = pack.declarations.find((d) => d.id === 'register.services')!;
  const at = (list.body.fields as Body[]).findIndex((f) => f.id === 'thing');
  return [
    { at: `register.services.fields[${at}]`, holds: [PROJECTS] },
    { at: 'metric.project-cost', holds: [PROJECTS] },
  ];
}

/** The module's Estate with the Project field and the figure asked of it taken out: what it would be if it could wait. */
function lessProjects(pack: Pack): Pack {
  return {
    ...pack,
    declarations: pack.declarations
      .filter((d) => d.id !== 'metric.project-cost')
      .map((d) => (d.id === 'register.services' ? { ...d, body: { ...d.body, fields: (d.body.fields as Body[]).filter((f) => f.id !== 'thing') } as never } : d)),
  };
}

for (const { name, holds } of SUBSETS) {
  const has = holds.includes(PROJECTS);
  for (const kind of KIND_ORDER)
    test(`PARITY ${name}, ${KINDS[kind]!.replace('the ', '')} by ${KINDS[kind]!.replace('the ', '')}: what the plan would store is what the module declares`, async () => {
      const { api, close } = await record(holds);
      const { pack } = await resolved(api);
      const built = has ? await moduleFor(holds) : lessProjects(await moduleFor(holds));
      const lines = parity(of(pack, kind), of(built, kind));
      assert.deepEqual(lines, [], `the file and the module disagree ${name}:\n  ${lines.join('\n  ')}`);
      close();
    });

  test(`PARITY ${name}, whole: the same parts in the same order, the same settings, and ${has ? 'nothing waits' : 'two parts wait for Projects'}`, async () => {
    const { api, close } = await record(holds);
    const { pack, diff } = await resolved(api);
    const built = has ? await moduleFor(holds) : lessProjects(await moduleFor(holds));
    const lines = parity(pack, built);
    assert.deepEqual(lines, [], `the file and the module disagree ${name}:\n  ${lines.join('\n  ')}`);
    assert.deepEqual(diff.waiting, has ? [] : await waitingParts());
    assert.deepEqual(diff.conflicts, []);
    const mine = pack.manifest as unknown as Body;
    const theirs = built.manifest as unknown as Body;
    for (const key of ['pack', 'summary', 'author', 'license', 'requires', 'config'])
      assert.deepEqual(mine[key], theirs[key], `the file's ${key} is not the module's:\n  ${differences(mine[key], theirs[key], key).join('\n  ')}`);
    close();
  });
}

test('WITHOUT PROJECTS THE MODULE CANNOT GO IN AT ALL, which is the one place the file says more than it', async () => {
  /* THE MODULE'S DOCUMENT IS THE SAME WHATEVER THE RECORD HOLDS. The day this stops being so the module has learned to
     leave its Project field out, and `lessProjects` above is no longer an allowance but a second copy of that: drop it
     and compare `moduleFor([])` as it is. */
  assert.equal(JSON.stringify(firstPartyDocument('estate', { holds: ['services'] })), JSON.stringify(firstPartyDocument('estate', { holds: ['services', PROJECTS] })));
  assert.deepEqual(firstPartyManifest('estate').requires, [`register.${PROJECTS}`]);
  const { api, close } = await record([]);
  const refused = (await api.planPack({ doc: firstPartyDocument('estate', { holds: ['services'] }), source: { kind: 'local' } } as never, owner)) as Out;
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal?.code, 'REGISTER_UNRESOLVED');
  /* AND THE FILE DOES: one list, one page, nine figures and four rules, with the two parts named as waiting. */
  const diff = await planOf(api, file());
  assert.deepEqual(diff.waiting, await waitingParts());
  said(await put(api, file()));
  const ids = api.kernel.declarations().map((d) => d.id);
  for (const id of ['register.services', 'page.estate', 'metric.estate-month', 'rule.renew-soon']) assert.ok(ids.includes(id), `${id} did not go in`);
  assert.ok(!ids.includes('metric.project-cost'), 'the figure asked of a project went in on a record with no projects');
  const fields = (JSON.parse(api.kernel.declarations().find((d) => d.id === 'register.services')!.body) as { fields: Body[] }).fields;
  assert.ok(!fields.some((f) => f.id === 'thing'), 'the Project field went in on a record with no projects');
  close();
});

/* ── On a real record: the move, and Projects arriving later ───────────────────────────────────── */

type Entry = { id: string; fields: Body };
type Stored = { id: string; body: string };
const add = (api: Api, list: string, fields: Body): string => said<{ id: string }>(api.kernel.create(list, fields as never, { actor: 'p_1' })).id;
const stored = (api: Api): Map<string, string> => new Map((api.kernel.declarations() as unknown as Stored[]).map((d) => [d.id, d.body]));
const versionOf = (api: Api): string | undefined => (api.kernel.packs() as unknown as { id: string; version: string }[]).find((p) => p.id === 'estate')?.version;

/** A project with whatever its list makes every project say, so the test does not name Projects' own fields. */
function project(api: Api, name: string): string {
  const list = JSON.parse(stored(api).get(`register.${PROJECTS}`)!) as { title: string; fields: { id: string; type: string; required?: boolean; values?: string[] }[] };
  const fields: Body = { [list.title]: name };
  for (const f of list.fields) if (f.required === true && f.id !== list.title && f.type === 'enum') fields[f.id] = f.values![0];
  return add(api, PROJECTS, fields);
}

const SERVICE = { name: 'kiln.example', provider: 'Nordhaven Registry', kind: 'domain', cycle: 'yearly', state: 'live', cost: { amount: 1_400, currency: 'GBP' }, renews: '2026-03-22' };

test('INSTALLED FROM THE FILE OR FROM THE MODULE, a record with Projects stores the same seventeen parts, word for word', async () => {
  const built = await record([PROJECTS]);
  const filed = await record([PROJECTS]);
  said(await put(built.api, firstPartyDocument('estate', { holds: [PROJECTS, 'services'], seeds: [] })));
  said(await put(filed.api, file()));
  const mine = stored(filed.api);
  const theirs = stored(built.api);
  const ids = [...theirs.keys()].filter((id) => !id.endsWith(`.${PROJECTS}`) && (id.startsWith('register.services') || id.startsWith('page.estate') || id.startsWith('page.service') || id.startsWith('metric.') || id.startsWith('rule.')));
  const estate = (await read(file())).declarations.map((d) => d.id);
  /* SEVENTEEN SINCE 2.3.0: a service's own page is the seventeenth. */
  assert.equal(estate.length, 17);
  for (const id of estate) {
    assert.ok(ids.includes(id), `${id} is in the file and the module did not store it`);
    const lines = differences(JSON.parse(mine.get(id)!), JSON.parse(theirs.get(id)!), id.slice(id.indexOf('.') + 1));
    assert.deepEqual(lines, [], `stored differently:\n  ${lines.join('\n  ')}`);
    assert.equal(mine.get(id), theirs.get(id), `${id} is stored in another order`);
  }
  built.close();
  filed.close();
});

test('THE MOVE IS A VERSION AND NOTHING ELSE: over the module, the file adds, changes, retires and asks nothing', async () => {
  const { api, close } = await record([PROJECTS]);
  said(await put(api, firstPartyDocument('estate', { holds: [PROJECTS, 'services'], seeds: [] })));
  const kiln = project(api, 'Kiln');
  const id = add(api, 'services', { ...SERVICE, thing: kiln });
  const before = stored(api);

  const diff = await planOf(api, file());
  assert.equal(versionOf(api), FIRST_PARTY_VERSIONS.estate);
  assert.deepEqual([diff.direction, diff.installed_version], ['upgrade', FIRST_PARTY_VERSIONS.estate]);
  /* NOTHING OF HIS WOULD BE LOST, so the update arrives with no press (SHL-A13's "Arrives"): no part goes, no field
     becomes one every service must have, and no question is asked. */
  assert.deepEqual([diff.adds, diff.changes, diff.retires, diff.conflicts, diff.waiting], [[], [], [], [], []]);
  assert.deepEqual([diff.newly_required, diff.retypes, diff.orphans], [[], [], 0], 'the move would make a field required, retype one or strand a service');
  said(await put(api, file()));
  assert.equal(versionOf(api), file().version);
  for (const [decl, body] of stored(api)) assert.equal(body, before.get(decl), `${decl} was rewritten by the move`);
  /* THE SERVICE IS AS IT WAS, its project with it, and no example was planted on a list that already holds his own. */
  assert.deepEqual((api.kernel.get(id) as unknown as Entry).fields.thing, kiln);
  assert.equal((api.kernel.get(id) as unknown as Entry).fields.name, SERVICE.name);
  close();
});

test('PROJECTS ARRIVING LATER: the service kept before it is still there, and the Project field and its figure come in', async () => {
  const { api, close } = await record([]);
  said(await put(api, file()));
  const id = add(api, 'services', SERVICE);
  said(await put(api, firstPartyDocument('portfolio', { holds: [PROJECTS], seeds: [] })));
  /* PLANNED AGAIN, AS THE RECORD DOES AFTER AN INSTALL: nothing waits now, and both parts are additions. */
  const again = await planOf(api, file());
  assert.deepEqual(again.waiting, []);
  assert.deepEqual(again.conflicts, []);
  said(await put(api, file()));
  const list = JSON.parse(stored(api).get('register.services')!) as { fields: Body[] };
  assert.ok(list.fields.some((f) => f.id === 'thing' && f.to === PROJECTS), 'the Project field did not come in once Projects was there');
  assert.ok(stored(api).has('metric.project-cost'), 'Costs a year did not come in once Projects was there');
  assert.equal((api.kernel.get(id) as unknown as Entry).fields.name, SERVICE.name);
  /* AND NOW IT IS THE MODULE'S, PART FOR PART, so a record reaches the same place by either road. */
  const whole = await record([PROJECTS]);
  said(await put(whole.api, firstPartyDocument('estate', { holds: [PROJECTS, 'services'], seeds: [] })));
  for (const d of (await read(file())).declarations) assert.equal(stored(api).get(d.id), stored(whole.api).get(d.id), `${d.id} differs from the module after Projects arrived`);
  whole.close();
  close();
});

test('THE EXAMPLE IS THE MODULE\'S ONE, with its renewal counted from the day it is installed and no project named', async () => {
  const mine = file().seeds;
  const theirs = firstPartyDocument('estate')!.seeds as { register: string; fields: Body }[];
  assert.equal(mine.length, 1);
  assert.equal(theirs.length, 1);
  assert.deepEqual({ ...mine[0]!.fields, renews: null }, { ...theirs[0]!.fields, renews: null });
  /* THE MODULE WRITES A DAY, twelve after its sample's own today, so on any other day it is a renewal already past.
     The file counts the same twelve from install day. */
  assert.deepEqual(mine[0]!.fields.renews, { day: '+12' });
  assert.match(String(theirs[0]!.fields.renews), /^\d{4}-\d{2}-\d{2}$/u);
  assert.equal(mine[0]!.fields.thing, undefined);
  const { api, close } = await record([]);
  said(await put(api, file()));
  const rows = said<{ rows: Entry[] }>(api.kernel.list({ register: 'services', limit: 50 }));
  assert.deepEqual(rows.rows.map((r) => [r.fields.name, r.fields.renews]), [['kiln.example', '2026-03-22']]);
  close();
});
