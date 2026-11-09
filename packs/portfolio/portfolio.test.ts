/**
 * Projects as a file: `portfolio.pack.json` held equal to the module the build still compiles in
 * (`packages/seed/src/modules/portfolio.ts`), so taking the module out is one small change and not a rewrite.
 *
 * WHAT IS HELD. Projects owns its one list and reads one figure it does not own: the card of a project in play draws a
 * line of the work finished on it each week, Work's Done, by week, over Work's tasks. So the records BrainDog makes hold
 * Work or not, and each is made here. "THE ONE NEIGHBOUR" holds that the module cuts on nothing else, so the day it
 * starts reading another list it goes red and says which, and that record is added to SUBSETS. The file is read by
 * `normalise`, planned on that record by `plan` (through the record's own `planPack`), and what the plan would store is
 * laid beside `firstPartyDocument('portfolio', { holds })` after `normalise`: list by list, page by page, figure by
 * figure and rule by rule. Where they differ the failure says so in names, never in a path.
 *
 * THE PROJECT PAGE IS NOT HERE. It is `projectTemplate` and `crossPack` in the seed, in no add-on today, and moving it
 * in is a change to the module (SHL-A14 job 2's page half), not to this file.
 *
 * IT RUNS WHILE THE MODULE LIVES AND IS DELETED WITH IT. Until then a change to the module that the file does not make
 * is a red test here, which is the point: nobody edits one and forgets the other.
 *
 * RED FIRST, MEASURED: with no `portfolio.pack.json` this file failed at its first read, ENOENT, on each of the file's
 * own checks. The rows in the fixtures are invented; none is anybody's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { settleWhen } from '../../packages/declare/src/catalogue.ts';
import { MODULE_WORDS, normalise, type Pack } from '../../packages/declare/src/index.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { rulesLine } from '../../packages/record/src/headlines.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument, firstPartyManifest } from '../../packages/seed/src/index.ts';
import { BUILT_IN_FIGURES } from '../../packages/kernel/src/built-in-figures.ts';

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
const PACK_FILE = new URL('./portfolio.pack.json', import.meta.url);
type File = Body & { pack: string; version: string; declarations: Body[]; seeds: { register: string; fields: Body }[] };
const file = (): File => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as never;

/** The one list Projects leans on and does not own, Work's tasks, and Projects' own one. */
const WORK = 'tasks';
const OWN = ['things'] as const;
/** AND ITS OTHER TWO SINCE 1.19.0: Numbers, taken over from the founder use case, and each project's key numbers; and its stages since 1.23.0. */
const LISTS = [...OWN, 'stages', 'datapoints', 'kpis'] as const;
const SUBSETS: readonly { name: string; holds: readonly string[] }[] = [
  { name: 'with Work', holds: [WORK] },
  { name: 'without Work', holds: [] },
];

/** A list's id as the manifests say what each add-on provides. */
const listsOf = (id: (typeof FIRST_PARTY)[number]): string[] =>
  firstPartyManifest(id).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice('register.'.length)] : []));

/** Work's own lists, read off its manifest so the test names none of them but the one Projects reads. */
const workLists = (): string[] => listsOf('work');

/** A fresh record holding exactly `holds` of what Projects leans on, with no example rows of theirs. */
async function record(holds: readonly string[]): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  /* WORK ALONE, AS A HOMEWORK LIST HAS IT, with which project a task is for left out, since Projects is not there yet. */
  if (holds.includes(WORK)) said(await put(api, firstPartyDocument('work', { holds: workLists(), seeds: [] })));
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

/** The module's Projects for a record that holds `holds`, as `normalise` reads it. */
const moduleFor = (holds: readonly string[]): Promise<Pack> => read(firstPartyDocument('portfolio', { holds: [...holds, ...OWN] }));

const isBody = (v: unknown): v is Body => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The file as `plan` would store it on this record: the parts that wait taken out, and what waits. */
async function resolved(api: Api): Promise<{ pack: Pack; diff: Diff }> {
  const diff = await planOf(api, file());
  return { pack: settleWhen(await read(file()), diff.waiting), diff };
}

/* ── Saying a difference in names ──────────────────────────────────────────────────────────────── */

const KINDS: Readonly<Record<string, string>> = { register: 'the list', page: 'the page', metric: 'the figure', rule: 'the rule', script: 'the script' };

/** What a person calls one declaration: "the figure In play", never `metric.projects-live`. */
function nameOf(d: { kind: string; id: string; body: Body }): string {
  const name = d.body.name ?? d.body.title;
  const plain = typeof name === 'string' && name !== '' && !name.includes('{{') ? name : d.id.slice(d.id.indexOf('.') + 1);
  return `${KINDS[d.kind] ?? d.kind} ${plain}`;
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
  doc.declarations.forEach((d, i) => walk(d, partName({ name: d.name ?? d.title ?? d.page }, i)));
  return out;
}

const kindOf = (d: Body): string => ['rule', 'script', 'ingest', 'register', 'page', 'metric'].find((k) => typeof d[k] === 'string') ?? 'something else';

/** Every figure a block of the file draws, by its id, with the block it is drawn in. */
function drawn(doc: File): { metric: string; when: unknown }[] {
  const out: { metric: string; when: unknown }[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!isBody(v)) return;
    if (typeof v.metric === 'string' && typeof v.as === 'string') out.push({ metric: v.metric.split(':')[0]!, when: v.when });
    for (const inner of Object.values(v)) walk(inner);
  };
  for (const d of doc.declarations) if (typeof d.page === 'string') walk(d.blocks);
  return out;
}

test('THE FILE IS ITS OWN: four lists, two pages, twenty-six figures over them, two rules and two scripts that only ask', () => {
  const doc = file();
  assert.equal(doc.pack, 'portfolio');
  const kinds = doc.declarations.map(kindOf);
  assert.deepEqual(
    Object.fromEntries(['register', 'page', 'metric', 'rule', 'script'].map((k) => [k, kinds.filter((x) => x === k).length])),
    /* TWENTY SINCE 1.17.0: `projects-with-health`, what the health split waits on, and `projects-lane-earning`,
       the strip's Earning with its nights. THREE LISTS AND TWENTY-TWO FIGURES SINCE 1.19.0: Numbers and the key numbers,
       with how many key numbers are kept and how long since a measure was read. FOUR LISTS AND TWENTY-FIVE SINCE 1.23.0:
       the stages, how many a project has, and which shape its plan is drawn in. TWO PAGES SINCE 1.25.0: Numbers' own. A SECOND RULE AND ITS SCRIPT SINCE 1.24.0
       (B27 of 24 October): a project's kind offers its key numbers as drafts. TWENTY-SIX SINCE 1.31.0: `readings-held`, so
       Numbers says what it will list while no reading is in. */
    { register: 4, page: 2, metric: 26, rule: 2, script: 2 },
    'four lists, two pages, twenty-six figures, two rules and two scripts',
  );
  /* ONE SCRIPT SINCE 1.22.0, the key-numbers backfill, AND A SECOND SINCE 1.24.0, the drafts by kind: each reads Projects'
     own lists, reaches nothing outside and holds no key, and files questions rather than rows. Only the rule that starts
     the second runs a script, and nothing reaches out. */
  assert.ok(!kinds.includes('something else'), 'the file declares something that is none of the five');
  const scripts = doc.declarations.filter((d) => typeof d.script === 'string');
  assert.deepEqual(
    scripts.map((d) => [d.script, d.egress, d.keys, d.reads, d.writes]),
    [
      ['kpi_backfill', [], [], ['things', 'kpis', 'datapoints'], ['kpis']],
      ['kind_drafts', [], [], ['things', 'kpis'], ['kpis']],
    ],
    'a script reaches out, holds a key or touches a list that is not Projects\'',
  );
  const rest = doc.declarations.filter((d) => typeof d.script !== 'string' && d.rule !== 'kind-offers-kpis');
  assert.doesNotMatch(JSON.stringify(rest), /"script":|"egress"|"hosts"/u, 'a step that runs a script or reaches out');

  /* NO FIGURE OVER A LIST IT DOES NOT OWN, and the rule is on the projects: a project past the day it aims for. */
  for (const d of doc.declarations)
    if (typeof d.metric === 'string') assert.ok(LISTS.some((l) => d.source === `register.${l}`), `${String(d.name)} reads a list that is not Projects'`);
  assert.deepEqual(doc.declarations.filter((d) => typeof d.rule === 'string').map((d) => [d.rule, d.register ?? ((d.on as Body | undefined)?.written as Body | undefined)?.register]), [['project-past-aim', OWN[0]], ['kind-offers-kpis', OWN[0]]]);

  /* A FIGURE DRAWN HERE THAT THE FILE DOES NOT DECLARE IS WORK'S, and its line waits for the list that figure reads. OR
     THE RECORD'S OWN (`built-in-figures.ts`), which every record has and nothing waits for: since 1.26.0 the card's when
     is `project-worked`, a project's tasks and its runs together (Z7 of 25 October). */
  const mine = new Set([...doc.declarations.flatMap((d) => (typeof d.metric === 'string' ? [d.metric] : [])), ...Object.keys(BUILT_IN_FIGURES)]);
  assert.ok(drawn(doc).some((m) => m.metric === 'project-worked' && m.when === undefined), 'the card\'s when is not the record\'s own figure');
  const work = (firstPartyDocument('work') as { declarations: Body[] }).declarations;
  for (const { metric, when } of drawn(doc).filter((m) => !mine.has(m.metric))) {
    const theirs = work.find((d) => d.metric === metric);
    assert.ok(theirs !== undefined, `the figure ${metric} is drawn here and declared by nobody`);
    assert.deepEqual(when, { holds: [String(theirs.source).slice('register.'.length)] }, `Work's ${String(theirs.name)} is drawn without waiting for Work`);
  }

  assert.doesNotMatch(JSON.stringify(doc), /—/u, 'an em dash in words a person reads');
});

test('ITS VERSION IS THE MODULE\'S, which is not released yet, and it says what changed in one plain note', () => {
  const doc = file();
  /* NOT A STEP ABOVE: Projects 1.18.0 is still unreleased (commit 63423720 holds 1.16.0), so the file takes the version
     the module is at and nothing a record already holds is changed in place. 1.19.0 since the key numbers, 1.20.0 since the cards draw the key number they lead with, 1.21.0 since the cards draw every project in play or parked, 1.22.0 since the key-numbers backfill ships, 1.23.0 since a project keeps its stages and its plan's shape, 1.24.0 since a project's kind offers its key numbers, 1.25.0 since Numbers has a page of its own, 1.26.0 since the card's when reads the runs too, 1.27.0 since a page with nothing in play opens on a box to add one, 1.28.0 since Numbers opens on a plain line and Where they are leaves Finished out, 1.29.0 since agents' short reads leave out the bookkeeping fields, 1.30.0 since Projects is drawn as its board, 1.30.1 since a finished project reads Closed. */
  assert.equal(doc.version, FIRST_PARTY_VERSIONS.portfolio);
  /* 1.31.0 AND 1.31.1 SINCE 3 November: Numbers with no reading says what it will list, and opens on no line. 1.31.2 SINCE
     4 November: Projects opens on the projects, with no bar of how they are going (fdc1b185b). 1.32.0 SINCE 9 November: a
     project wears a picture, its logo, in place of its mark. */
  assert.equal(doc.version, '1.32.0');
  const changes = doc.changes;
  assert.ok(typeof changes === 'string' && changes.trim() !== '', 'the file says what this version changed');
  assert.ok(changes.length <= 500 && !/[\r\n]/u.test(changes), 'one note, on one line, 500 characters at most');
  assert.doesNotMatch(changes, /\b(register|declaration|manifest|entity|row|pack|module|seed|[0-9A-HJKMNP-TV-Z]{26})\b/u, 'a word of the build in a note a person reads');
  /* WHAT A PERSON CALLS THE LIST is what the build calls it today. */
  assert.deepEqual(doc.words, { [OWN[0]]: MODULE_WORDS[OWN[0]] });
  assert.equal(doc.title, 'Projects');
  /* NO SETTINGS, AS THE MODULE HAS NONE: no figure of Projects' is held to a line a person sets. */
  assert.equal(firstPartyDocument('portfolio')!.config, undefined);
  assert.equal(doc.config, undefined);
});

test('WORK IS ASKED FOR ONLY WHERE IT IS READ: one line on a card waits, and nothing else', () => {
  const doc = file();
  assert.deepEqual(doc.requires, { format: 1, primitives: 1, packs: {} }, 'Projects installs on a record with no other add-on');
  /* The work finished each week, Work's figure. HOW LONG SINCE ANYBODY WORKED ON IT WAITED TOO from 1.17.0 to 1.25.0
     (projects-last-worked-96); since 1.26.0 it is the record's own `project-worked` (Z7 of 25 October), which reads the
     runs where there are no tasks, so it waits for nothing. */
  assert.deepEqual(waits(doc), [{ at: '"Projects", "In play", "project-done-by-week:{{name}}"', holds: [WORK] }]);
  /* AND NOTHING POINTS OUT OF THE FILE: Projects' one list links to no other. */
  const fields = doc.declarations.find((d) => d.register === OWN[0] && d.rule === undefined)!.fields as Body[];
  assert.deepEqual(fields.filter((f) => f.to !== undefined && f.to !== OWN[0]).map((f) => f.id), []);
});

test('THE ONE NEIGHBOUR: the module cuts Projects on Work\'s tasks and on no other list a record can hold', () => {
  assert.deepEqual([firstPartyManifest('portfolio').requires, firstPartyManifest('portfolio').links], [[], []], 'Projects needs or links to a list this test does not make a record for');
  const others = FIRST_PARTY.filter((id) => id !== 'portfolio').flatMap(listsOf).filter((l) => l !== WORK);
  const text = (holds: readonly string[]): string => JSON.stringify(firstPartyDocument('portfolio', { holds: [...holds, ...OWN] }));
  /* EVERY OTHER LIST HELD, OR NONE, IS THE SAME DOCUMENT; and Work's tasks held is the document as it is, cut on nothing. */
  assert.equal(text(others), text([]), 'the module cuts Projects on a list other than Work\'s tasks: hold the file on that record too');
  assert.equal(text([WORK]), JSON.stringify(firstPartyDocument('portfolio')));
  assert.notEqual(text([WORK]), text([]), 'the module no longer cuts on Work: drop the subset without Work, and the when');
});

/* ── Parity with the module, on every record BrainDog makes ────────────────────────────────────── */

/** The parts the file lets wait on a record that holds `holds`, as the plan names them. */
async function waitingParts(holds: readonly string[]): Promise<Waiting[]> {
  const pack = await read(file());
  const blocks = pack.declarations.find((d) => d.id === 'page.portfolio')!.body.blocks as Body[];
  const cards = blocks.findIndex((b) => b.heading === 'In play' && b.kind === 'cards');
  const columns = blocks[cards]!.columns as Body[];
  const lines = ['project-done-by-week'].map((m) => columns.findIndex((c) => String(c.metric).startsWith(m)));
  const all: Waiting[] = lines.map((line) => ({ at: `page.portfolio.blocks[${cards}].columns[${line}]`, holds: [WORK] }));
  return all.filter((w) => !w.holds.every((n) => holds.includes(n)));
}

for (const { name, holds } of SUBSETS) {
  for (const kind of KIND_ORDER)
    test(`PARITY ${name}, ${KINDS[kind]!.replace('the ', '')} by ${KINDS[kind]!.replace('the ', '')}: what the plan would store is what the module declares`, async () => {
      const { api, close } = await record(holds);
      const { pack } = await resolved(api);
      const lines = parity(of(pack, kind), of(await moduleFor(holds), kind));
      assert.deepEqual(lines, [], `the file and the module disagree ${name}:\n  ${lines.join('\n  ')}`);
      close();
    });

  test(`PARITY ${name}, whole: the same parts in the same order, the same examples, and what waits`, async () => {
    const { api, close } = await record(holds);
    const { pack, diff } = await resolved(api);
    const built = await moduleFor(holds);
    const lines = parity(pack, built);
    assert.deepEqual(lines, [], `the file and the module disagree ${name}:\n  ${lines.join('\n  ')}`);
    assert.deepEqual(diff.waiting, await waitingParts(holds));
    assert.deepEqual(diff.conflicts, []);
    assert.deepEqual(pack.seeds, built.seeds, 'the examples are not the module\'s');
    const mine = pack.manifest as unknown as Body;
    const theirs = built.manifest as unknown as Body;
    for (const key of ['pack', 'version', 'summary', 'author', 'license', 'requires', 'config'])
      assert.deepEqual(mine[key], theirs[key], `the file's ${key} is not the module's:\n  ${differences(mine[key], theirs[key], key).join('\n  ')}`);
    close();
  });
}

/* ── On a real record: the move, and Work arriving later ───────────────────────────────────────── */

type Entry = { id: string; fields: Body };
type Stored = { id: string; body: string };
const add = (api: Api, list: string, fields: Body): string => said<{ id: string }>(api.kernel.create(list, fields as never, { actor: 'p_1' })).id;
const stored = (api: Api): Map<string, string> => new Map((api.kernel.declarations() as unknown as Stored[]).map((d) => [d.id, d.body]));
const versionOf = (api: Api): string | undefined => (api.kernel.packs() as unknown as { id: string; version: string }[]).find((p) => p.id === 'portfolio')?.version;
const theModule = (holds: readonly string[]): unknown => firstPartyDocument('portfolio', { holds: [...holds, ...OWN], seeds: [] });
const ours = async (): Promise<string[]> => (await read(file())).declarations.map((d) => d.id);

/** A project with whatever its list makes every project say, read off the list so the test names none of its fields. */
function project(api: Api, name: string): string {
  const list = JSON.parse(stored(api).get(`register.${OWN[0]}`)!) as { title: string; fields: { id: string; type: string; required?: boolean; values?: string[] }[] };
  const fields: Body = { [list.title]: name };
  for (const f of list.fields) if (f.required === true && f.id !== list.title && f.type === 'enum') fields[f.id] = f.values![0];
  return add(api, OWN[0], fields);
}

for (const { name, holds } of SUBSETS)
  test(`INSTALLED FROM THE FILE OR FROM THE MODULE, a record ${name} stores the same thirty-six parts, word for word`, async () => {
    const built = await record(holds);
    const filed = await record(holds);
    said(await put(built.api, theModule(holds)));
    said(await put(filed.api, file()));
    const [mine, theirs] = [stored(filed.api), stored(built.api)];
    const parts = await ours();
    assert.equal(parts.length, 36);
    for (const id of parts) {
      assert.ok(theirs.has(id), `${id} is in the file and the module did not store it`);
      const lines = differences(JSON.parse(mine.get(id)!), JSON.parse(theirs.get(id)!), id.slice(id.indexOf('.') + 1));
      assert.deepEqual(lines, [], `stored differently:\n  ${lines.join('\n  ')}`);
      assert.equal(mine.get(id), theirs.get(id), `${id} is stored in another order`);
    }
    built.close();
    filed.close();
  });

test('THE MOVE IS NOTHING AT ALL: over the module, the file is the same version and adds, changes, retires and asks nothing', async () => {
  const { api, close } = await record([WORK]);
  said(await put(api, theModule([WORK])));
  const id = project(api, 'Larkspur');
  const before = stored(api);

  const diff = await planOf(api, file());
  assert.equal(versionOf(api), FIRST_PARTY_VERSIONS.portfolio);
  assert.deepEqual([diff.direction, diff.installed_version], ['reinstall', FIRST_PARTY_VERSIONS.portfolio]);
  assert.deepEqual([diff.adds, diff.changes, diff.retires, diff.conflicts, diff.waiting], [[], [], [], [], []]);
  assert.deepEqual([diff.newly_required, diff.retypes, diff.orphans], [[], [], 0], 'the move would make a field required, retype one or strand a project');
  said(await put(api, file()));
  assert.equal(versionOf(api), file().version);
  for (const [decl, body] of stored(api)) assert.equal(body, before.get(decl), `${decl} was rewritten by the move`);
  /* THE PROJECT IS AS IT WAS. */
  assert.equal((api.kernel.get(id) as unknown as Entry).fields.name, 'Larkspur');
  close();
});

test('WORK ARRIVING LATER: the project kept before is still there, and the line that waited comes in', async () => {
  const { api, close } = await record([]);
  said(await put(api, file()));
  const id = project(api, 'Larkspur');
  /* WORK AFTER PROJECTS, THE ORDER EVERY RECORD TAKES THEM IN, so a task says which project it is for. */
  said(await put(api, firstPartyDocument('work', { holds: [...OWN, ...workLists()], seeds: [] })));
  /* PLANNED AGAIN, AS THE RECORD DOES AFTER AN INSTALL: nothing waits now. */
  const again = await planOf(api, file());
  assert.deepEqual(again.waiting, []);
  assert.deepEqual(again.conflicts, []);
  said(await put(api, file()));
  assert.equal((api.kernel.get(id) as unknown as Entry).fields.name, 'Larkspur');
  /* AND NOW IT IS THE MODULE'S, PART FOR PART, so a record reaches the same place by either road. */
  const whole = await record([]);
  said(await put(whole.api, theModule([])));
  said(await put(whole.api, firstPartyDocument('work', { holds: [...OWN, ...workLists()], seeds: [] })));
  said(await put(whole.api, theModule([WORK])));
  for (const d of await ours()) assert.equal(stored(api).get(d), stored(whole.api).get(d), `${d} differs from the module after Work arrived`);
  whole.close();
  close();
});

test('THE EXAMPLE IS THE MODULE\'S ONE PROJECT, and it goes in on a record with nothing else', async () => {
  const mine = file().seeds;
  const theirs = firstPartyDocument('portfolio')!.seeds as { register: string; fields: Body }[];
  assert.deepEqual(mine, theirs);
  assert.deepEqual(mine.map((s) => s.register), [OWN[0]]);
  const { api, close } = await record([]);
  said(await put(api, file()));
  const names = said<{ rows: Entry[] }>(api.kernel.list({ register: OWN[0], limit: 50 })).rows.map((r) => r.fields.name);
  assert.deepEqual(names, [mine[0]!.fields.name]);
  close();
});

test('THE PROJECT PAGE STAYS IN THE SEED: the file draws no page per project, and says so', () => {
  const pages = file().declarations.filter((d) => typeof d.page === 'string');
  assert.deepEqual(pages.map((d) => d.page), ['portfolio', 'all-numbers']);
  for (const d of pages) assert.ok(typeof d.title !== 'string' || !d.title.includes('{{'), 'a page drawn per project is in the file; move the README line and this test with it');
  assert.match(readFileSync(new URL('./README.md', import.meta.url), 'utf8'), /project page/u, 'the README does not say where the project page lives');
});

/* ── The questions about projects, on Projects ───────────────────────────────────────── */

type Laid = { kind: string; heading?: string; lead?: boolean; fold?: boolean; box?: boolean; area?: string; body?: string; where?: string; when?: unknown; limit?: number; tiles?: boolean };
type Drawn = { kind: string; heading?: string; lead?: boolean; body?: string; drawn?: boolean; values?: Record<string, never>; matched?: number };

const projectsPage = (): Laid[] => (file().declarations.find((d) => d.page === 'portfolio')!.blocks as Laid[]);

/**
 * The tiles a page shows before its first fold at 1440: the line is the page's sentence, the capture line is the header's,
 * and a boxed heading with what follows it is one tile, as `calm-pages.test.ts` counts them and the app draws them.
 */
function beforeTheFold(blocks: readonly Laid[]): string[] {
  const main = blocks.filter((b) => b.area !== 'rail');
  const fold = main.findIndex((b) => b.kind === 'section' && b.fold === true);
  let boxed = false;
  return (fold < 0 ? main : main.slice(0, fold))
    .filter((b) => {
      if (b.kind === 'section') return (boxed = b.box === true);
      return !boxed && !b.lead && b.kind !== 'capture';
    })
    .map((b) => b.heading ?? b.kind);
}

test('PROJECTS ASKS ITS OWN QUESTIONS: a queue of the questions about projects, three drawn as tiles, only while one waits', () => {
  const queue = projectsPage().find((b) => b.kind === 'queue');
  assert.ok(queue, 'Projects declares no queue');
  assert.deepEqual(
    { heading: queue.heading, where: queue.where, when: queue.when, limit: queue.limit, tiles: queue.tiles },
    { heading: 'Waiting on you', where: 'list is things', when: { metric: 'questions-open-in:things', gt: 0 }, limit: 3, tiles: true },
  );
  /* SINCE 1.30.0 THE BOARD SAYS THEM (`key: board`), by project, in its headline; no line said from figures is left. */
  const lines = projectsPage().filter((b) => b.lead && typeof b.body === 'string' && b.body.includes('{{'));
  assert.equal(lines.length, 0, 'a line said from figures is declared over the board');
  assert.equal(projectsPage().filter((b) => (b as { key?: unknown }).key === 'board').length, 1, 'Projects declares no board');
});

/* FIVE SINCE 1.18.0: the In play and earning strip is gone, so Where they are leads, over How they are going, and the page is at
   the most a page shows before its fold (`calm-pages.test.ts`). */
/* AND NO OPEN TILE (proj F5): What each one earns stands alone under the questions. */
/* AND THREE SINCE 1.30.0: the board is In play and says where they are and what each earns itself. */
/* AND TWO SINCE 1.31.2 (fdc1b185b): no bar of how they are going, each project's card says it. */
test('TWO TILES BEFORE THE FOLD AT 1440, the board and the questions under it', () => {
  assert.deepEqual(beforeTheFold(projectsPage()), ['In play', 'Waiting on you']);
});

test('ON A RECORD, THE QUEUE AND THE LINE SAY THE QUESTIONS ABOUT PROJECTS: nothing at nought, two at two, and not the one about a task', async () => {
  const { api, close } = await record([WORK]);
  said(await put(api, file()));
  const stored = new Map((api.kernel.declarations() as unknown as { id: string; body: string }[]).map((d) => [d.id, d.body]));
  const list = JSON.parse(stored.get('register.things')!) as { title: string; fields: { id: string; type: string; required?: boolean; values?: string[] }[] };
  const make = (name: string): string => {
    const fields: Body = { [list.title]: name };
    for (const f of list.fields) if (f.required === true && f.id !== list.title && f.type === 'enum') fields[f.id] = f.values![0];
    return said<{ id: string }>(api.kernel.create('things', fields as never, { actor: 'p_1' })).id;
  };
  const spoken = (id: string): string => {
    const e = api.kernel.get(id) as unknown as { register: string; seq: number };
    return `${e.register}#${e.seq}`;
  };
  const kiln = make('Kiln');
  const atlas = make('Atlas');
  const task = said<{ id: string }>(api.kernel.create('tasks', { what: 'Glaze the test tiles', state: 'open' } as never, { actor: 'p_1' })).id;
  const OPTIONS = [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'Not yet' }];
  const ask = (question: string, about: string) => said(api.kernel.propose({ question, body_kind: 'options', body: { options: OPTIONS, about } } as never, 'slash'));
  const page = (): Drawn[] => said<{ blocks: Drawn[] }>(api.kernel.page('portfolio')).blocks;
  const line = (): string | null => {
    const lead = page().find((b) => b.kind === 'note' && b.lead && b.drawn !== false && typeof b.body === 'string' && b.body.includes('questions-open-in'));
    return lead ? rulesLine(lead.body!, lead.values ?? {}) : null;
  };
  const waiting = (): Drawn => page().find((b) => b.kind === 'queue' && b.heading === 'Waiting on you')!;

  assert.equal(waiting().drawn, false, 'the queue drew with nothing asked');
  /* BOTH IN PLAY (`building`, the first a project can say): SINCE 1.30.0 the board leads, and no line said from figures is drawn. */
  assert.equal(line(), null, 'a line is drawn over the board');

  ask('Ship the Kiln beta?', spoken(kiln));
  ask('Park Atlas for a month?', spoken(atlas));
  ask('Move the glazing to Friday?', spoken(task));
  assert.notEqual(waiting().drawn, false);
  assert.equal(waiting().matched, 2, 'the queue kept a question about a task');
  /* THE BOARD SAYS THEM BY PROJECT (`projects-board.ts`), so still no line is drawn. */
  assert.equal(line(), null, 'a line is drawn over the board');
  close();
});
