/**
 * People as a file: `people.pack.json` held equal to the module the build still compiles in
 * (`packages/seed/src/modules/people.ts`), so taking the module out is one small change and not a rewrite.
 *
 * WHAT IS HELD. People leans on two lists it does not own: Projects (`things`), which a person and an organisation are
 * met in and which an organisation's page draws, and Money's ledger (`transactions`), which that page draws too. Money
 * only links to Projects since 4b137c806, so the records BrainDog makes hold neither, either alone, or both, and each is
 * made here. The file is
 * read by `normalise`, planned on that record by `plan` (through the record's own `planPack`), and what the plan would
 * store is laid beside `firstPartyDocument('people', { holds })` after `normalise`: list by list, page by page, figure
 * by figure and rule by rule. Where they differ the failure says so in names, never in a path.
 *
 * TWO CUTS NO `when` IS WRITTEN FOR, WHICH THE PLAN MAKES ITSELF. The module cuts a part of a role (`meets` and `org`
 * each name the Projects field, and the kernel refuses a role naming a field the list does not have) and a list a page
 * requires (an organisation's page requires Projects and Money, and the kernel refuses a page requiring a list the
 * record does not hold). The file says both in full, as the module does on a record that holds everything, and since
 * batch 90 the plan (`packages/declare/src/when.ts`) takes a role's part out with the field it names and a list out of
 * a page's `requires` with the only blocks that read it, so the file goes in as it ships on every record BrainDog makes.
 * "THE TWO CUTS" below holds that, so the day the plan stops making either it goes red.
 *
 * IT RUNS WHILE THE MODULE LIVES AND IS DELETED WITH IT. Until then a change to the module that the file does not make
 * is a red test here, which is the point: nobody edits one and forgets the other.
 *
 * RED FIRST, MEASURED: with no `people.pack.json` this file failed at its first read, ENOENT, on each of the file's own
 * checks. The rows in the fixtures are invented; none is anybody's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { settleWhen } from '../../packages/declare/src/catalogue.ts';
import { MODULE_WORDS, normalise, type Pack } from '../../packages/declare/src/index.ts';
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
const PACK_FILE = new URL('./people.pack.json', import.meta.url);
type File = Body & { pack: string; version: string; declarations: Body[]; seeds: { register: string; fields: Body }[] };
const file = (): File => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as never;

/** The two lists People leans on and does not own, and People's own two. */
const PROJECTS = 'things';
const MONEY = 'transactions';
const OWN = ['people', 'organisations'] as const;
const SUBSETS: readonly { name: string; holds: readonly string[] }[] = [
  { name: 'with Projects and Money', holds: [PROJECTS, MONEY] },
  { name: 'with Projects alone', holds: [PROJECTS] },
  /* SINCE 4b137c806 (31 October) MONEY ONLY LINKS TO PROJECTS, so a record with Money alone can be made and is held too. */
  { name: 'with Money alone', holds: [MONEY] },
  { name: 'with neither', holds: [] },
];

/** A fresh record holding exactly `holds` of what People leans on, with no example rows of theirs. */
async function record(holds: readonly string[]): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  if (holds.includes(PROJECTS)) said(await put(api, firstPartyDocument('portfolio', { holds: [PROJECTS], seeds: [] })));
  /* MONEY BEFORE PEOPLE, with who a payment is with left out, since its own link waits for People as People's waits for it. */
  if (holds.includes(MONEY)) said(await put(api, firstPartyDocument('money-core', { holds: holds.filter((n) => n === PROJECTS), seeds: [] })));
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

/** The module's People for a record that holds `holds`, as `normalise` reads it. */
const moduleFor = (holds: readonly string[]): Promise<Pack> => read(firstPartyDocument('people', { holds: [...holds, ...OWN] }));

const isBody = (v: unknown): v is Body => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The file as `plan` would store it on this record: the parts that wait taken out, and what waits. */
async function resolved(api: Api): Promise<{ pack: Pack; diff: Diff }> {
  const diff = await planOf(api, file());
  return { pack: settleWhen(await read(file()), diff.waiting), diff };
}

/* ── Saying a difference in names ──────────────────────────────────────────────────────────────── */

const KINDS: Readonly<Record<string, string>> = { register: 'the list', page: 'the page', metric: 'the figure', rule: 'the rule', script: 'the script' };

/** What a person calls one declaration: "the figure Quiet for three months", never `metric.people-quiet`. */
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
  /* A PAGE DRAWN PER PERSON OR ORGANISATION IS TITLED BY THEIR NAME, so it is said by its own word here. */
  const called = (d: Body): unknown => d.name ?? (typeof d.title === 'string' && !d.title.includes('{{') ? d.title : d.page);
  doc.declarations.forEach((d, i) => walk(d, partName({ name: called(d) }, i)));
  return out;
}

const kindOf = (d: Body): string => ['rule', 'script', 'ingest', 'register', 'page', 'metric'].find((k) => typeof d[k] === 'string') ?? 'something else';

test('THE FILE IS ITS OWN: one script that reaches nowhere, two lists, three pages, twelve figures over those lists, four rules', () => {
  const doc = file();
  assert.equal(doc.pack, 'people');
  const kinds = doc.declarations.map(kindOf);
  assert.deepEqual(
    Object.fromEntries(['register', 'page', 'metric', 'rule', 'script'].map((k) => [k, kinds.filter((x) => x === k).length])),
    /* EIGHT SINCE 4.2.0: organisations you work with apart from shops from card texts (`organisations-known`). TWELVE
       SINCE 4.3.0 (a4993e50f): clients and the rest, people and organisations apart. FOUR RULES AND ONE SCRIPT SINCE
       4.7.0: `script.people_fields` offers the facts in a person's note as fields, and `rule.people-fields` is its Run
       now. */
    { register: 2, page: 3, metric: 12, rule: 4, script: 1 },
    'two lists, three pages, twelve figures, four rules and one script',
  );
  assert.ok(!kinds.includes('something else'), 'the file declares something that is none of the five');
  /* THE SCRIPT READS AND WRITES PEOPLE ALONE AND REACHES NOWHERE. */
  const script = doc.declarations.find((d) => typeof d.script === 'string')!;
  assert.deepEqual([script.script, script.reads, script.writes, script.egress, script.keys], ['people_fields', ['people'], ['people'], [], []]);
  assert.doesNotMatch(JSON.stringify(doc.declarations.filter((d) => d !== script)), /"egress"|"hosts"/u, 'a part that reaches out');

  /* NO FIGURE OVER A LIST IT DOES NOT OWN, and every block over Projects or Money waits for it. */
  for (const d of doc.declarations) if (typeof d.metric === 'string') assert.match(String(d.source), /^register\.(people|organisations)$/u, `${String(d.name)} reads a list that is not People's`);
  for (const d of doc.declarations)
    for (const b of (d.blocks as Body[] | undefined) ?? [])
      if (b.source === `register.${PROJECTS}` || b.source === `register.${MONEY}`)
        assert.deepEqual(b.when, { holds: [String(b.source).slice('register.'.length)] }, `"${String(b.heading)}" reads a list People does not own and does not wait for it`);
  /* AND THE RULES ARE ON PEOPLE'S OWN LISTS: whoever writes in, whoever sends the mail, whoever a payment was with. */
  assert.deepEqual(doc.declarations.filter((d) => typeof d.rule === 'string').map((d) => d.rule), ['meet-senders', 'meet-sender-organisations', 'meet-payees', 'people-fields']);

  assert.doesNotMatch(JSON.stringify(doc), /—/u, 'an em dash in words a person reads');
});

test('ITS VERSION IS THE MODULE\'S, which is not released yet, and it says what changed in one plain note', () => {
  const doc = file();
  /* NOT A STEP ABOVE, AS ESTATE'S IS: People 3.4.0 is still unreleased (commit 63423720 holds 3.3.0), so the file takes
     the version the module is at and nothing a record already holds is changed in place. */
  assert.equal(doc.version, FIRST_PARTY_VERSIONS.people);
  /* 3.6.0 SINCE 24 October (things, not rows): Everyone as faces, the owner left off. 3.5.0 is released. 3.7.0
     SINCE 24 October: Scripts is a page. 3.8.0 SINCE 25 October: an organisation can be retired. 3.9.0
     SINCE 27 October: one line a person, and shops from card texts apart. 4.0.0 SINCE 27 October: Health, Scripts,
     Calendar and Activity leave for core. 4.1.0 SINCE 29 October: organisations are one place and one count. 4.2.0
     SINCE 29 October: organisations you work with apart from shops. 4.2.1 SINCE 29 October: one organisations count.
     4.2.2 SINCE 30 October: who may be listed twice, in plainer words. 4.3.0 SINCE 2 November: people and organisations
     counted apart. 4.4.0, 4.5.0 and 4.6.0 SINCE 2 November: the roles a person may hold. 4.7.0 SINCE 3 November: a
     person's facts are fields. 4.7.1 SINCE 3 November: a person's note stops repeating them. */
  assert.equal(doc.version, '4.7.1');
  const changes = doc.changes;
  assert.ok(typeof changes === 'string' && changes.trim() !== '', 'the file says what this version changed');
  assert.ok(changes.length <= 500 && !/[\r\n]/u.test(changes), 'one note, on one line, 500 characters at most');
  assert.doesNotMatch(changes, /\b(register|declaration|manifest|entity|row|pack|module|seed|[0-9A-HJKMNP-TV-Z]{26})\b/u, 'a word of the build in a note a person reads');
  /* WHAT A PERSON CALLS THE LIST is what the build calls it today, and only People: Organisations has no word of its own
     yet, and giving it one would put a box on Settings > Words the module does not. */
  assert.deepEqual(doc.words, { people: MODULE_WORDS.people });
  assert.equal(doc.title, 'People');
  /* NO SETTINGS, AS THE MODULE HAS NONE: no figure of People's is held to a line. */
  assert.equal(firstPartyDocument('people')!.config, undefined);
  assert.equal(doc.config, undefined);
});

test('PROJECTS AND MONEY ARE ASKED FOR ONLY WHERE THEY ARE READ: six parts wait, and nothing else', () => {
  const doc = file();
  assert.deepEqual(doc.requires, { format: 1, primitives: 1, packs: {} }, 'People installs on a record with no other add-on');
  assert.deepEqual(waits(doc), [
    { at: '"People", "Met in"', holds: [PROJECTS] },
    { at: '"Organisations", "Projects"', holds: [PROJECTS] },
    { at: '"People", "Everyone", "Met in"', holds: [PROJECTS] },
    { at: '"someone", "cards", "Met in"', holds: [PROJECTS] },
    { at: '"relation", "Projects"', holds: [PROJECTS] },
    { at: '"relation", "Money"', holds: [MONEY] },
  ]);
  for (const list of OWN) {
    const fields = doc.declarations.find((d) => d.register === list)!.fields as Body[];
    const met = fields.find((f) => f.id === 'projects')!;
    assert.deepEqual([met.type, met.of, met.to, met.required ?? false], ['list', 'ref', PROJECTS, false], 'a part that waits cannot be one everybody must have');
    /* AND NOTHING ELSE POINTS OUT OF THE FILE: past People's own two lists, the one link is to the projects. */
    assert.deepEqual(fields.filter((f) => f.to !== undefined && !(OWN as readonly unknown[]).includes(f.to)).map((f) => f.id), ['projects']);
  }
});

test('THE RECORDS BRAINDOG MAKES ARE THE FOUR HELD HERE: Money only links to Projects, and People needs nothing', () => {
  /* SINCE 4b137c806 (31 October) A RECORD WITH MONEY AND NO PROJECTS CAN BE MADE, which is why it is in SUBSETS. The day
     Money needs Projects again this goes red and says that record has stopped being one to hold it to. */
  assert.ok(!firstPartyManifest('money-core').requires.includes(`register.${PROJECTS}`), 'Money needs Projects again: a record with Money alone cannot be made, so take it out of SUBSETS');
  assert.ok(firstPartyManifest('money-core').links.includes(`register.${PROJECTS}`), 'Money no longer points at Projects at all');
  assert.deepEqual(firstPartyManifest('people').requires, []);
  assert.deepEqual(firstPartyManifest('people').links, [`register.${PROJECTS}`, `register.${MONEY}`], 'People leans on a list this test does not make a record for');
});

/* ── Parity with the module, on every record BrainDog makes ────────────────────────────────────── */

/** The parts the file lets wait on a record that holds `holds`, as the plan names them, in the order the file says them. */
async function waitingParts(holds: readonly string[]): Promise<Waiting[]> {
  const pack = await read(file());
  const body = (id: string): Body => pack.declarations.find((d) => d.id === id)!.body as Body;
  const field = (list: string): number => (body(`register.${list}`).fields as Body[]).findIndex((f) => f.id === 'projects');
  const block = (page: string, test: (b: Body) => boolean): number => (body(`page.${page}`).blocks as Body[]).findIndex(test);
  const column = (page: string, at: number): number => (((body(`page.${page}`).blocks as Body[])[at]!.columns as Body[]) ?? []).findIndex((c) => c.field === 'projects');
  const lead = block('someone', (b) => b.lead === true);
  const everyone = block('people', (b) => b.heading === 'Everyone');
  const all: Waiting[] = [
    { at: `register.people.fields[${field('people')}]`, holds: [PROJECTS] },
    { at: `register.organisations.fields[${field('organisations')}]`, holds: [PROJECTS] },
    { at: `page.people.blocks[${everyone}].columns[${column('people', everyone)}]`, holds: [PROJECTS] },
    { at: `page.someone.blocks[${lead}].columns[${column('someone', lead)}]`, holds: [PROJECTS] },
    { at: `page.relation.blocks[${block('relation', (b) => b.source === `register.${PROJECTS}`)}]`, holds: [PROJECTS] },
    { at: `page.relation.blocks[${block('relation', (b) => b.source === `register.${MONEY}`)}]`, holds: [MONEY] },
  ];
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
    for (const key of ['pack', 'version', 'summary', 'author', 'license', 'requires', 'hands', 'config'])
      assert.deepEqual(mine[key], theirs[key], `the file's ${key} is not the module's:\n  ${differences(mine[key], theirs[key], key).join('\n  ')}`);
    close();
  });
}

test('THE TWO CUTS THE PLAN MAKES ITSELF: without Projects or Money the file goes in as it ships, the parts over them cut by the plan', async () => {
  const want: Readonly<Record<string, { requires: string[]; meets: boolean }>> = {
    'with Projects and Money': { requires: ['register.organisations', 'register.people', `register.${PROJECTS}`, `register.${MONEY}`], meets: true },
    'with Projects alone': { requires: ['register.organisations', 'register.people', `register.${PROJECTS}`], meets: true },
    'with Money alone': { requires: ['register.organisations', 'register.people', `register.${MONEY}`], meets: false },
    'with neither': { requires: ['register.organisations', 'register.people'], meets: false },
  };
  for (const { name, holds } of SUBSETS) {
    const { api, close } = await record(holds);
    /* THE PAGE'S REQUIRES: a list only waiting blocks read leaves an organisation's page with them. Were it kept, the
       plan would refuse the file whole (REGISTER_UNRESOLVED at page.relation.requires). */
    said(await put(api, file()));
    const body = (id: string): Body => JSON.parse(stored(api).get(id)!) as Body;
    assert.deepEqual(body('page.relation').requires, want[name]!.requires, `${name}, an organisation's page asks for a list the record does not hold`);
    /* THE ROLE'S PART: meeting somebody and an organisation name the Projects field only where it is there. Were it
       kept, the record would refuse the role (FIELD_UNKNOWN at meets). */
    for (const [list, role] of [['people', 'meets'], ['organisations', 'org']] as const)
      assert.equal(Object.hasOwn(body(`register.${list}`)[role] as Body, 'projects'), want[name]!.meets, `${name}, ${role} and the Projects field disagree`);
    close();
  }
});

/* ── On a real record: the move, and Projects arriving later ───────────────────────────────────── */

type Entry = { id: string; fields: Body };
type Stored = { id: string; body: string };
const add = (api: Api, list: string, fields: Body): string => said<{ id: string }>(api.kernel.create(list, fields as never, { actor: 'p_1' })).id;
const stored = (api: Api): Map<string, string> => new Map((api.kernel.declarations() as unknown as Stored[]).map((d) => [d.id, d.body]));
const versionOf = (api: Api): string | undefined => (api.kernel.packs() as unknown as { id: string; version: string }[]).find((p) => p.id === 'people')?.version;
const theModule = (holds: readonly string[]): unknown => firstPartyDocument('people', { holds: [...holds, ...OWN], seeds: [] });
const ours = async (): Promise<string[]> => (await read(file())).declarations.map((d) => d.id);

/** A project with whatever its list makes every project say, so the test does not name Projects' own fields. */
function project(api: Api, name: string): string {
  const list = JSON.parse(stored(api).get(`register.${PROJECTS}`)!) as { title: string; fields: { id: string; type: string; required?: boolean; values?: string[] }[] };
  const fields: Body = { [list.title]: name };
  for (const f of list.fields) if (f.required === true && f.id !== list.title && f.type === 'enum') fields[f.id] = f.values![0];
  return add(api, PROJECTS, fields);
}

const PERSON = { name: 'Ines Varga', email: 'ines@kiln.example', note: 'Draws the plans.' };

for (const { name, holds } of SUBSETS)
  test(`INSTALLED FROM THE FILE OR FROM THE MODULE, a record ${name} stores the same twenty-two parts, word for word`, async () => {
    const built = await record(holds);
    const filed = await record(holds);
    said(await put(built.api, theModule(holds)));
    said(await put(filed.api, file()));
    const [mine, theirs] = [stored(filed.api), stored(built.api)];
    const people = await ours();
    assert.equal(people.length, 22);
    for (const id of people) {
      assert.ok(theirs.has(id), `${id} is in the file and the module did not store it`);
      const lines = differences(JSON.parse(mine.get(id)!), JSON.parse(theirs.get(id)!), id.slice(id.indexOf('.') + 1));
      assert.deepEqual(lines, [], `stored differently:\n  ${lines.join('\n  ')}`);
      assert.equal(mine.get(id), theirs.get(id), `${id} is stored in another order`);
    }
    built.close();
    filed.close();
  });

test('THE MOVE IS NOTHING AT ALL: over the module, the file is the same version and adds, changes, retires and asks nothing', async () => {
  const { api, close } = await record([PROJECTS, MONEY]);
  said(await put(api, theModule([PROJECTS, MONEY])));
  const kiln = project(api, 'Kiln');
  const id = add(api, 'people', { ...PERSON, projects: [kiln] });
  const before = stored(api);

  const diff = await planOf(api, file());
  assert.equal(versionOf(api), FIRST_PARTY_VERSIONS.people);
  assert.deepEqual([diff.direction, diff.installed_version], ['reinstall', FIRST_PARTY_VERSIONS.people]);
  assert.deepEqual([diff.adds, diff.changes, diff.retires, diff.conflicts, diff.waiting], [[], [], [], [], []]);
  assert.deepEqual([diff.newly_required, diff.retypes, diff.orphans], [[], [], 0], 'the move would make a field required, retype one or strand a person');
  said(await put(api, file()));
  assert.equal(versionOf(api), file().version);
  for (const [decl, body] of stored(api)) assert.equal(body, before.get(decl), `${decl} was rewritten by the move`);
  /* THE PERSON IS AS THEY WERE, the project they were met in with them. */
  assert.deepEqual((api.kernel.get(id) as unknown as Entry).fields.projects, [kiln]);
  assert.equal((api.kernel.get(id) as unknown as Entry).fields.name, PERSON.name);
  close();
});

test('PROJECTS AND MONEY ARRIVING LATER: the person kept before is still there, and what waited comes in', async () => {
  const { api, close } = await record([]);
  said(await put(api, file()));
  const id = add(api, 'people', PERSON);
  said(await put(api, firstPartyDocument('portfolio', { holds: [PROJECTS], seeds: [] })));
  /* PLANNED AGAIN, AS THE RECORD DOES AFTER AN INSTALL: only the Money block waits now. */
  const again = await planOf(api, file());
  assert.deepEqual(again.waiting, await waitingParts([PROJECTS]));
  assert.deepEqual(again.conflicts, []);
  said(await put(api, file()));
  const list = JSON.parse(stored(api).get('register.people')!) as { fields: Body[]; meets: Body };
  assert.ok(list.fields.some((f) => f.id === 'projects' && f.to === PROJECTS), 'Met in did not come in once Projects was there');
  assert.equal(list.meets.projects, 'projects', 'meeting somebody does not say the project once Projects was there');
  said(await put(api, firstPartyDocument('money-core', { holds: [PROJECTS], seeds: [] })));
  said(await put(api, file()));
  assert.equal((api.kernel.get(id) as unknown as Entry).fields.name, PERSON.name);
  /* AND NOW IT IS THE MODULE'S, PART FOR PART, so a record reaches the same place by either road. */
  const whole = await record([PROJECTS, MONEY]);
  said(await put(whole.api, theModule([PROJECTS, MONEY])));
  for (const d of await ours()) assert.equal(stored(api).get(d), stored(whole.api).get(d), `${d} differs from the module after Projects and Money arrived`);
  whole.close();
  close();
});

test('THE EXAMPLES ARE THE MODULE\'S TWO: one organisation and one person there, linked to no project', async () => {
  const mine = file().seeds;
  const theirs = firstPartyDocument('people')!.seeds as { register: string; fields: Body }[];
  assert.deepEqual(mine, theirs);
  assert.deepEqual(mine.map((s) => s.register), ['organisations', 'people']);
  for (const s of mine) assert.equal(s.fields.projects, undefined, 'an example names a project, which a record with none would refuse');
  const { api, close } = await record([]);
  said(await put(api, file()));
  const names = (list: string): unknown[] => said<{ rows: Entry[] }>(api.kernel.list({ register: list, limit: 50 })).rows.map((r) => r.fields.name);
  assert.deepEqual([names('organisations'), names('people')], [['Halden Type Co'], ['Mara Lindqvist']]);
  close();
});
