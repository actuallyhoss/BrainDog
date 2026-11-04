/**
 * Work as a file: `work.pack.json` held equal to the module the build still compiles in (`packages/seed/src/modules/
 * work.ts`), so taking the module out is one small change and not a rewrite (the way SHL-A13 did Estate).
 *
 * WHAT IS HELD. Work leans on two neighbours, Projects (a task's or a thread's project) and People (who owns a task),
 * and on nothing else. For each of the four ways a record can hold them, both, one or neither, a record is made with
 * exactly that. The file is read by `normalise`, planned on that record by `plan` (through the record's own `planPack`),
 * and what the plan would store is laid beside `firstPartyDocument('work', { holds })` after `normalise`: list by list,
 * page by page, figure by figure, rule by rule and script by script. Where they differ the failure says so in names.
 *
 * THE MODULE ALREADY CUTS ITSELF PER RECORD (`LINKS` in `packages/seed/src/packs/first-party.ts`: `owner` and `thing`),
 * and the file writes each cut as `when: { holds }`: three fields, five columns, nine figures and Work's filter by
 * project (`filters: thing`, which a page may let wait since batch 90's `packages/declare/src/when.ts`). Who a task is
 * handed to (`hand.person: owner`) is said whole, as the module says it where People is held: the plan takes a part of
 * `hand` out with the field it names, so on a record without People it goes with Owner and nothing is refused.
 *
 * TWO PLACES THE PLAN STILL STORES MORE THAN THE MODULE, both only where Projects is not held, AND THE TEST SAYS SO OUT
 * LOUD. Neither is refused and neither draws anything:
 *   - the phone line of a task and a thread (`mobile`), which names the project. The plan keeps a phone field that is
 *     not there (his to rule), and a list of words has no place for `when`, so the file keeps `thing` in it.
 *   - Work's filters, which the plan leaves as an empty list once the one filter waits, where the module leaves the key
 *     out. The plan dropping an emptied `filters` (as `without` in `packages/seed/src/packs/first-party.ts` does) is
 *     AREA K's line in `when.ts`.
 * `apart` below lays exactly those two on the module before comparing, and THEY ARE SAID WORD FOR WORD in their own
 * test, so the day the plan cuts one that test goes red and says to drop it from `apart`. Wherever Projects is held the
 * file is the module, part for part and stored word for word.
 *
 * THE VERSION IS THE MODULE'S, 1.19.0, which no release holds (the deployed build, commit 63423720, holds 1.18.0).
 *
 * IT RUNS WHILE THE MODULE LIVES AND IS DELETED WITH IT. Until then a change to the module that the file does not make
 * is a red test here. RED FIRST, MEASURED: with no `work.pack.json` every test failed at its first read, ENOENT. The rows
 * in the fixtures are invented; none is anybody's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { settleWhen } from '../../packages/declare/src/catalogue.ts';
import { normalise, type Pack } from '../../packages/declare/src/index.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import type { CtxHost, Json, ScriptAnswer, ScriptDecl, ScriptWrite } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { FIRST_PARTY_VERSIONS, firstPartyDocument, firstPartyManifest } from '../../packages/seed/src/index.ts';

const NOW = Date.UTC(2026, 2, 10, 9);
const TODAY = '2026-03-10';
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
const PACK_FILE = new URL('./work.pack.json', import.meta.url);
type File = Body & { pack: string; version: string; changes: string; declarations: Body[]; seeds: { register: string; fields: Body }[] };
const file = (): File => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as never;

/** Work's own lists, and the two neighbours' lists it may lean on. */
const OWN = ['tracks', 'updates', 'tasks'] as const;
const PROJECTS = 'things';
const PEOPLE = 'people';
const ORGANISATIONS = 'organisations';
const SUBSETS: readonly { name: string; holds: readonly string[] }[] = [
  { name: 'with Projects and People', holds: [PROJECTS, PEOPLE] },
  { name: 'with Projects alone', holds: [PROJECTS] },
  { name: 'with People alone', holds: [PEOPLE] },
  { name: 'with neither', holds: [] },
];

/** People's own lists, read off its manifest so the test names none of them but the one Work points at. */
const peopleLists = (): string[] => firstPartyManifest('people').provides.flatMap((p) => (p.startsWith('register.') ? [p.slice('register.'.length)] : []));

/** A fresh record holding exactly `holds` of Work's neighbours, with no example rows of theirs. */
async function record(holds: readonly string[]): Promise<{ api: Api; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  await neighbours(api, holds);
  return { api, close: () => sql.close() };
}

/** Projects and People put on a record, in the order every record takes them in. */
async function neighbours(api: Api, holds: readonly string[]): Promise<void> {
  if (holds.includes(PROJECTS)) said(await put(api, firstPartyDocument('portfolio', { holds: [PROJECTS], seeds: [] })));
  if (holds.includes(PEOPLE)) said(await put(api, firstPartyDocument('people', { holds: [...holds, ...peopleLists()], seeds: [] })));
}

const planOf = async (api: Api, doc: unknown): Promise<Diff> =>
  said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<Out> {
  const diff = await planOf(api, doc);
  return (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
}

const read = async (doc: unknown): Promise<Pack> => said<Pack>(await normalise(doc));

/** The module's Work for a record that holds `holds`, as `normalise` reads it. */
const moduleDoc = (holds: readonly string[], seeds?: []): Record<string, unknown> =>
  firstPartyDocument('work', { holds: [...holds, ...(holds.includes(PEOPLE) ? peopleLists() : []), ...OWN], ...(seeds ? { seeds } : {}) })!;
const moduleFor = (holds: readonly string[]): Promise<Pack> => read(moduleDoc(holds));

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

const KIND_ORDER = ['register', 'page', 'metric', 'rule', 'script'] as const;
const of = (pack: Pack, kind: string): Pack => ({ ...pack, declarations: pack.declarations.filter((d) => d.kind === kind) });

/** Every part of the file that waits on what a record holds, as where it is and what it waits for. */
function waits(doc: File, have?: readonly string[]): { at: string; holds: unknown }[] {
  const out: { at: string; holds: unknown }[] = [];
  /* A BLOCK DRAWN ON A FIGURE THAT WAITS WAITS WITH IT (`sifted` in `packages/declare/src/when.ts`), so Late is said here. */
  const figures = new Map(doc.declarations.flatMap((d) => (typeof d.metric === 'string' && isBody(d.when) ? [[d.metric, d.when.holds] as const] : [])));
  const walk = (v: unknown, at: string): void => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${at}, ${partName(x, i)}`));
    if (!isBody(v)) return;
    const held = isBody(v.when) ? (Object.hasOwn(v.when, 'holds') ? v.when.holds : figures.get(String(v.when.metric))) : undefined;
    /* ASKED ABOUT ONE RECORD, ONLY WHAT IT DOES NOT HOLD, and a part taken out says nothing about what is inside it. */
    if (held !== undefined) {
      const isIn = have !== undefined && (held as string[]).every((h) => have.includes(h));
      if (!isIn) out.push({ at, holds: held });
      if (!isIn && have !== undefined) return;
    }
    for (const [key, inner] of Object.entries(v)) if (key !== 'when') walk(inner, at);
  };
  doc.declarations.forEach((d, i) => walk(d, partName({ name: d.name ?? d.title }, i)));
  return out;
}

/* ── Where the file and the module cannot agree yet ────────────────────────────────────────────── */

/**
 * The module with the one place the plan still stores more laid on as the file says it, on a record without Projects:
 * a task's and a thread's phone line still name the project, second. Work's filters no longer empty there: its
 * filter by whose work it is stays when the one by project waits. And the one place the module stores more taken out
 * (`unplaced`).
 */
function apart(pack: Pack, holds: readonly string[]): Pack {
  const body = (d: Pack['declarations'][number], next: Body): Pack['declarations'][number] => ({ ...d, body: next as never });
  if (holds.includes(PROJECTS)) return pack;
  const kept = unplaced(pack, holds);
  return {
    ...kept,
    declarations: kept.declarations.map((d) => {
      if (d.id === 'register.tasks' || d.id === 'register.tracks') {
        const mobile = [...((d.body as Body).mobile as string[])];
        mobile.splice(1, 0, 'thing');
        d = body(d, { ...(d.body as Body), mobile });
      }
      return d;
    }),
  };
}

/**
 * THE ONE PLACE THE MODULE STILL STORES MORE, on a record without Projects: Work's With no project, whose sentence reads
 * the project. The file waits it on Projects (`when: { holds }`); the module keeps it, since `without` in
 * `packages/seed/src/packs/first-party.ts` takes out a figure over a field that is gone and not yet a block
 * (work-head-and-no-project-101 asks for that line). Taken out here only where the module still has it, so the day the
 * line lands nothing here goes red; the day after, this can go.
 */
function unplaced(pack: Pack, holds: readonly string[]): Pack {
  if (holds.includes(PROJECTS)) return pack;
  return {
    ...pack,
    declarations: pack.declarations.map((d) => {
      if (d.id !== 'page.work') return d;
      const blocks = ((d.body as Body).blocks as Body[]).filter((b) => b.heading !== 'With no project');
      return { ...d, body: { ...(d.body as Body), blocks } as never };
    }),
  };
}

/* ── The file's own checks ─────────────────────────────────────────────────────────────────────── */

const SCRIPTS: Readonly<Record<string, string>> = { close_follow_ups: './close-follow-ups.js', start_with_parent: './start-with-parent.js' };
const source = (script: string): string => readFileSync(new URL(SCRIPTS[script]!, import.meta.url), 'utf8');

test('THE FILE IS WORK AND ONLY WORK: three lists, three pages, twenty-nine figures over its own lists, two rules, two scripts', () => {
  const doc = file();
  assert.equal(doc.pack, 'work');
  const kinds = doc.declarations.map((d) => ['rule', 'script', 'ingest', 'register', 'page', 'metric'].find((k) => typeof d[k] === 'string') ?? 'something else');
  assert.deepEqual(
    Object.fromEntries(['register', 'page', 'metric', 'rule', 'script'].map((k) => [k, kinds.filter((x) => x === k).length])),
    { register: 3, page: 3, metric: 29, rule: 2, script: 2 },
  );
  assert.ok(!kinds.includes('ingest') && !kinds.includes('something else'), 'the file declares something that is none of the five');
  assert.deepEqual(doc.declarations.flatMap((d) => (typeof d.register === 'string' && d.rule === undefined ? [d.register] : [])), [...OWN]);
  /* EVERY FIGURE AND EVERY BLOCK READS ONE OF WORK'S OWN LISTS, and every block's figure is one the file declares. */
  const lists = new Set<string>(OWN.map((l) => `register.${l}`));
  for (const d of doc.declarations) if (typeof d.metric === 'string') assert.ok(lists.has(String(d.source)), `${String(d.name)} reads a list that is not Work's`);
  const own = new Set(doc.declarations.flatMap((d) => (typeof d.metric === 'string' ? [d.metric] : [])));
  for (const page of doc.declarations.filter((d) => typeof d.page === 'string')) {
    assert.deepEqual(page.requires, ['register.tasks'], `${String(page.title)} asks for more than Tasks`);
    for (const b of page.blocks as Body[]) {
      if (typeof b.source === 'string' && b.source.startsWith('register.')) assert.ok(lists.has(b.source), `"${String(b.heading)}" reads a list that is not Work's`);
      const from = typeof b.source === 'string' && b.source.startsWith('metric.') ? [b.source.slice('metric.'.length)] : [];
      const cells = ((b.cells as Body[] | undefined) ?? []).map((c) => String(c.metric));
      for (const m of [...from, ...cells]) assert.ok(own.has(m.split(':')[0]!), `"${String(b.heading)}" draws ${m}, a figure the file does not declare`);
    }
  }
  for (const d of doc.declarations) if (typeof d.rule === 'string') assert.equal((d.on as { written: Body }).written.register, 'tasks');
  assert.doesNotMatch(JSON.stringify(doc), /—/u, 'an em dash in words a person reads');
});

test('THE TWO SCRIPTS ARE THE FILES BESIDE IT, byte for byte, and each reaches tasks and nothing else', () => {
  const doc = file();
  const scripts = doc.declarations.filter((d) => typeof d.script === 'string');
  assert.deepEqual(scripts.map((s) => s.script), Object.keys(SCRIPTS));
  for (const s of scripts) {
    assert.equal(s.source, source(String(s.script)), `work.pack.json and ${SCRIPTS[String(s.script)]} disagree; copy the file into the source`);
    assert.deepEqual([s.egress, s.keys, s.reads, s.writes, s.runs], [[], [], ['tasks'], ['tasks'], { rule: true }], `${String(s.title)} reaches past tasks`);
  }
  /* EACH IS STARTED BY ONE RULE, and no rule starts a script the file does not carry. */
  const started = doc.declarations.flatMap((d) => (typeof d.rule === 'string' ? (d.steps as { script?: { id: string } }[]).map((s) => s.script?.id) : []));
  assert.deepEqual(started, Object.keys(SCRIPTS));
});

/** The version the deployed build holds (commit 63423720), kept as it was served. Never changed in place. */
const RELEASED = new URL('../../packages/seed/test/fixtures/released/work-1.18.0.json', import.meta.url);
const released = (): Body & { version: string } => JSON.parse(readFileSync(RELEASED, 'utf8')) as never;

test('ITS VERSION IS THE MODULE\'S, ABOVE THE RELEASED ONE, and it says what changed in one plain note', () => {
  const doc = file();
  assert.equal(doc.version, FIRST_PARTY_VERSIONS.work, `the module is at ${FIRST_PARTY_VERSIONS.work}, and the file is the same step`);
  /* 1.19.0 WAS SERVED ON 27 October (51de57604), newer than the frozen 1.18.0 file. THE FILE TAKES THE MODULE'S VERSION AND
     NO STEP OF ITS OWN (the module's own notes are in `changelog.ts`): 1.26.1 SINCE 3 November (7438cc7e8), Work and the
     Board drop their line of counts. */
  const live = '1.19.0';
  assert.ok(released().version < live, 'the frozen file is older than what is served');
  const numbers = (v: string): number[] => v.split('.').map(Number);
  assert.ok(numbers(doc.version)[1]! > numbers(live)[1]!, `${live} was released, so the file is past it and not that one`);
  assert.equal(doc.version, '1.26.2');
  const changes = doc.changes;
  assert.ok(typeof changes === 'string' && changes.trim() !== '', 'the file says what this version changed');
  assert.ok(changes.length <= 500 && !/[\r\n]/u.test(changes), 'one note, on one line, 500 characters at most');
  assert.doesNotMatch(changes, /\b(register|declaration|manifest|entity|row|pack|module|seed|[0-9A-HJKMNP-TV-Z]{26})\b/u, 'a word of the build in a note a person reads');
  assert.deepEqual(doc.words, { tracks: { name: 'Threads', one: 'thread' }, updates: { name: 'Updates', one: 'update' }, tasks: { name: 'Tasks', one: 'task' } });
  for (const d of doc.declarations) if (typeof d.register === 'string') assert.deepEqual([d.name, d.one], [(doc.words as Record<string, Body>)[d.register]!.name, (doc.words as Record<string, Body>)[d.register]!.one]);
  /* NO SETTINGS: the module builds none for Work, and the file says none. */
  assert.equal(doc.config, undefined);
  assert.equal(firstPartyDocument('work')!.config, undefined);
});

test('PROJECTS AND PEOPLE ARE ASKED FOR ONLY WHERE THEY ARE READ: twenty-eight parts wait, each on one neighbour', () => {
  /* WHAT IS YOURS WAITS ON NOBODY SINCE 1.26.2: with no Owner the clause goes and the bands and their six figures stay. */
  const doc = file();
  assert.deepEqual(doc.requires, { format: 1, primitives: 1, packs: {} }, 'Work installs on a record with no other add-on');
  assert.deepEqual(firstPartyManifest('work').requires, [], 'and so does the module');
  assert.deepEqual(waits(doc), [
    { at: '"Threads", "Project"', holds: [PROJECTS] },
    { at: '"Tasks", "Assigned to"', holds: [PEOPLE] },
    { at: '"Tasks", "Project"', holds: [PROJECTS] },
    /* WHO A TASK IS FOR, AN ORGANISATION OF PEOPLE'S (work 1.23.0). */
    { at: '"Tasks", "Client"', holds: [ORGANISATIONS] },
    { at: '"Work", "thing"', holds: [PROJECTS] },
    /* EVERY TASK SAYS ITS PROJECT AND CLIENT UNDER IT (proj F10), and each column waits for its own. THE BANDS OF YOUR OWN
       WORK ARE DRAWN ON A FIGURE THAT READS THE ASSIGNEE, so they wait for People with it (1.21.0, 4d5f2fe2e). */
    { at: '"Work", "Late", "thing"', holds: [PROJECTS] },
    { at: '"Work", "Late", "client"', holds: [ORGANISATIONS] },
    { at: '"Work", "Waiting on you", "thing"', holds: [PROJECTS] },
    { at: '"Work", "Your work this week", "thing"', holds: [PROJECTS] },
    { at: '"Work", "Your work this week", "client"', holds: [ORGANISATIONS] },
    { at: '"Work", "With an agent", "thing"', holds: [PROJECTS] },
    { at: '"Work", "After this week", "client"', holds: [ORGANISATIONS] },
    { at: '"Work", "No due day", "thing"', holds: [PROJECTS] },
    { at: '"Work", "No due day", "client"', holds: [ORGANISATIONS] },
    { at: '"Work", "Later", "thing"', holds: [PROJECTS] },
    { at: '"Work", "Later", "client"', holds: [ORGANISATIONS] },
    /* NEEDS A PROJECT IS DRAWN ON THE FIGURE THAT ASKS IT, WHICH WAITS FOR PROJECTS. */
    { at: '"Work", "Needs a project"', holds: [PROJECTS] },
    /* OPEN WORK WITH NO PROJECT ASKS FOR PROJECTS WHOLE, SINCE work 1.19.0: its sentence is about the project. */
    { at: '"Work", "With no project"', holds: [PROJECTS] },
    { at: '"Board", "board", "owner"', holds: [PEOPLE] },
    /* NO EVERYTHING OPEN UNDER THE BOARD, so its Project and Owner wait no more. */
    ...['Open', 'Due soon', 'In review', 'Handed back or blocked', 'Changed this week', 'Last worked', 'Done this week', 'Planned with a day'].map(
      (name) => ({ at: `"${name}"`, holds: [PROJECTS] }),
    ),
    { at: '"Done, by week"', holds: [PROJECTS] },
    { at: '"With no project"', holds: [PROJECTS] },
  ]);
  /* EVERY PART THAT NAMES THE PROJECT OR THE OWNER WAITS, and nothing else does: no column, field or figure over either
     is there unconditionally, so nothing the record lacks is ever drawn. */
  const LINKED: Readonly<Record<string, string>> = { thing: PROJECTS, owner: PEOPLE, client: ORGANISATIONS };
  for (const d of doc.declarations) {
    for (const f of (d.fields as Body[] | undefined) ?? []) {
      if (LINKED[String(f.id)]) assert.deepEqual([f.type, f.to, f.required ?? false, f.when], ['ref', LINKED[String(f.id)], false, { holds: [LINKED[String(f.id)]] }]);
      else assert.ok(f.to === undefined || (OWN as readonly unknown[]).includes(f.to), `${String(f.id)} points at a list that is not Work's`);
    }
    for (const b of (d.blocks as Body[] | undefined) ?? [])
      for (const c of (b.columns as Body[] | undefined) ?? []) if (LINKED[String(c.field)]) assert.deepEqual(c.when, { holds: [LINKED[String(c.field)]] });
    for (const f of (d.filters as Body[] | undefined) ?? []) if (LINKED[String(f.field)]) assert.deepEqual(f.when, { holds: [LINKED[String(f.field)]] }, `the filter by ${String(f.field)} does not wait`);
    /* WHO A TASK IS HANDED TO NAMES THE OWNER FIELD, so it waits with that field and needs no `when` of its own. */
    const handed = isBody(d.hand) ? d.hand.person : undefined;
    if (handed !== undefined) assert.ok(((d.fields as Body[] | undefined) ?? []).some((f) => f.id === handed && isBody(f.when)), 'the hand names a field that does not wait');
    if (typeof d.metric === 'string' && /(?:^|,\s*)thing\s/u.test(String(d.where))) assert.deepEqual(d.when, { holds: [PROJECTS] }, `${String(d.name)} is asked of a project`);
  }
});

/* ── Parity with the module, over every subset of what Work leans on ───────────────────────────── */

for (const { name, holds } of SUBSETS) {
  for (const kind of KIND_ORDER)
    test(`PARITY ${name}, ${KINDS[kind]!.replace('the ', '')} by ${KINDS[kind]!.replace('the ', '')}: what the plan would store is what the module declares`, async () => {
      const { api, close } = await record(holds);
      const { pack } = await resolved(api);
      const lines = parity(of(pack, kind), of(apart(await moduleFor(holds), holds), kind));
      assert.deepEqual(lines, [], `the file and the module disagree ${name}:\n  ${lines.join('\n  ')}`);
      close();
    });

  test(`PARITY ${name}, whole: the same parts in the same order, and what waits is what the record does not hold`, async () => {
    const { api, close } = await record(holds);
    const { pack, diff } = await resolved(api);
    const built = apart(await moduleFor(holds), holds);
    const lines = parity(pack, built);
    assert.deepEqual(lines, [], `the file and the module disagree ${name}:\n  ${lines.join('\n  ')}`);
    const have = [...holds, ...(holds.includes(PEOPLE) ? peopleLists() : [])];
    const unheld = waits(file(), have);
    assert.deepEqual(diff.waiting.map((w) => w.holds), unheld.map((w) => w.holds));
    assert.deepEqual(diff.conflicts, []);
    const mine = pack.manifest as unknown as Body;
    const theirs = built.manifest as unknown as Body;
    for (const key of ['pack', 'version', 'summary', 'author', 'license', 'requires', 'config'])
      assert.deepEqual(mine[key], theirs[key], `the file's ${key} is not the module's:\n  ${differences(mine[key], theirs[key], key).join('\n  ')}`);
    close();
  });
}

test('ONE THING THE PLAN STILL STORES MORE THAN THE MODULE, word for word, only where Projects is not: the day it goes, drop it from apart', async () => {
  /* THE PLAN KEEPS A PHONE FIELD THAT IS NOT THERE (his to rule). Its emptied list of filters went with C32: Work filters
     by whose work it is on every record. Each line below is the whole of a difference, so a new one is a red test too. */
  const PHONE = ['Threads', 'Tasks'].flatMap((list) => [
    `the list ${list}, mobile, part 2: the file says "thing", the module says "state"`,
    `the list ${list}, mobile, part 3: the file says "state", the module says nothing`,
  ]);
  const want: Readonly<Record<string, string[]>> = {
    'with Projects and People': [],
    'with Projects alone': [],
    'with People alone': [PHONE[0]!, PHONE[1]!, PHONE[2]!, PHONE[3]!],
    'with neither': [...PHONE],
  };
  for (const { name, holds } of SUBSETS) {
    const { api, close } = await record(holds);
    const { pack } = await resolved(api);
    assert.deepEqual(parity(pack, unplaced(await moduleFor(holds), holds)), want[name], `${name}, the file and the module differ in other ways than the two`);
    close();
  }
});

test('HAND AND FILTER GO IN AS THE FILE SHIPS on all four records, and each waits with what it names where that is not held', async () => {
  const stores: Record<string, unknown> = {};
  for (const { name, holds } of SUBSETS) {
    const { api, close } = await record(holds);
    said(await put(api, file()));
    const body = (id: string): Body => JSON.parse(stored(api).get(id)!) as Body;
    stores[name] = [body('register.tasks').hand, body('page.work').filters];
    close();
  }
  /* EACH COUNTS WHAT OPEN COUNTS (1.20.0), so the backlog is in no chip or segment. */
  const OPEN = 'state is not backlog or done or dropped';
  const WHOSE = {
    field: 'whose',
    control: 'segmented',
    counts: OPEN,
    options: [
      /* NOT SOMEBODY ELSE'S, SINCE 1.21.0 (4d5f2fe2e): read for whoever is looking, and true of every task with no Owner field. */
      { value: 'yours', label: 'Yours', where: 'agent is empty, owner is not someone else' },
      { value: 'agents', label: 'Agents', where: 'agent is set' },
    ],
  };
  const FILTER = [{ field: 'thing', control: 'chips', counts: OPEN }, WHOSE];
  assert.deepEqual(stores, {
    'with Projects and People': [{ person: 'owner', agent: 'agent', taken: 'doing' }, FILTER],
    'with Projects alone': [{ agent: 'agent', taken: 'doing' }, FILTER],
    'with People alone': [{ person: 'owner', agent: 'agent', taken: 'doing' }, [WHOSE]],
    'with neither': [{ agent: 'agent', taken: 'doing' }, [WHOSE]],
  });
});

/* ── On a real record: the move, and the neighbours arriving later ─────────────────────────────── */

type Entry = { id: string; fields: Body };
type Stored = { id: string; body: string };
const add = (api: Api, list: string, fields: Body): string => said<{ id: string }>(api.kernel.create(list, fields as never, { actor: 'p_1' })).id;
const stored = (api: Api): Map<string, string> => new Map((api.kernel.declarations() as unknown as Stored[]).map((d) => [d.id, d.body]));
const versionOf = (api: Api): string | undefined => (api.kernel.packs() as unknown as { id: string; version: string }[]).find((p) => p.id === 'work')?.version;
const entry = (api: Api, id: string): Entry => api.kernel.get(id) as unknown as Entry;

/** A project with whatever its list makes every project say, so the test does not name Projects' own fields. */
function project(api: Api, name: string): string {
  const list = JSON.parse(stored(api).get(`register.${PROJECTS}`)!) as { title: string; fields: { id: string; type: string; required?: boolean; values?: string[] }[] };
  const fields: Body = { [list.title]: name };
  for (const f of list.fields) if (f.required === true && f.id !== list.title && f.type === 'enum') fields[f.id] = f.values![0];
  return add(api, PROJECTS, fields);
}

/** A person, by what People's list makes every person say. */
function person(api: Api, name: string): string {
  const list = JSON.parse(stored(api).get(`register.${PEOPLE}`)!) as { title: string; fields: { id: string; type: string; required?: boolean; values?: string[] }[] };
  const fields: Body = { [list.title]: name };
  for (const f of list.fields) if (f.required === true && f.id !== list.title && f.type === 'enum') fields[f.id] = f.values![0];
  return add(api, PEOPLE, fields);
}

const TASK = { what: 'Proof the spring catalogue', state: 'open', by: '2026-03-14' };
const THREAD = { name: 'Spring catalogue', state: 'open' };

for (const holds of [[PROJECTS, PEOPLE], [PROJECTS]])
  test(`INSTALLED FROM THE FILE OR FROM THE MODULE, a record with ${holds.length === 2 ? 'both neighbours' : 'Projects alone'} stores the same thirty-nine parts, word for word`, async () => {
    const built = await record(holds);
    const filed = await record(holds);
    said(await put(built.api, moduleDoc(holds, [])));
    said(await put(filed.api, file()));
    const mine = stored(filed.api);
    const theirs = stored(built.api);
    const work = (await read(file())).declarations.map((d) => d.id);
    assert.equal(work.length, 39);
    for (const id of work) {
      /* A FIGURE THAT WAITS FOR PEOPLE IS STORED BY NEITHER ON A RECORD WITHOUT THEM, and by both where it is held. */
      assert.equal(mine.has(id), theirs.has(id), `${id}: the file stored it ${mine.has(id)}, the module ${theirs.has(id)}`);
      if (!mine.has(id)) continue;
      const lines = differences(JSON.parse(mine.get(id)!), JSON.parse(theirs.get(id)!), id.slice(id.indexOf('.') + 1));
      assert.deepEqual(lines, [], `stored differently:\n  ${lines.join('\n  ')}`);
      assert.equal(mine.get(id), theirs.get(id), `${id} is stored in another order`);
    }
    built.close();
    filed.close();
  });

test('THE MOVE OVER THE MODULE IS NOTHING AT ALL: the same version, and it adds, changes, retires and asks nothing, and keeps every task', async () => {
  const { api, close } = await record([PROJECTS, PEOPLE]);
  said(await put(api, moduleDoc([PROJECTS, PEOPLE], [])));
  const kiln = project(api, 'Kiln');
  const ada = person(api, 'Ada Byrne');
  const thread = add(api, 'tracks', { ...THREAD, thing: kiln });
  const id = add(api, 'tasks', { ...TASK, thing: kiln, owner: ada, track: thread });
  const before = stored(api);

  const diff = await planOf(api, file());
  assert.deepEqual([diff.direction, diff.installed_version], ['reinstall', FIRST_PARTY_VERSIONS.work]);
  assert.deepEqual([diff.adds, diff.changes, diff.retires, diff.conflicts, diff.waiting, diff.approve], [[], [], [], [], [], []]);
  assert.deepEqual([diff.newly_required, diff.retypes, diff.orphans], [[], [], 0], 'the move would make a field required, retype one or strand a task');
  said(await put(api, file()));
  assert.equal(versionOf(api), file().version);
  for (const [decl, body] of stored(api)) assert.equal(body, before.get(decl), `${decl} was rewritten by the move`);
  /* THE TASK IS AS IT WAS, its project, owner and thread with it. */
  assert.deepEqual([entry(api, id).fields.thing, entry(api, id).fields.owner, entry(api, id).fields.track], [kiln, ada, thread]);
  close();
});

test('OVER THE RELEASED 1.18.0 THE FILE IS AN UPGRADE that takes nothing away, asks nothing and keeps every task', async () => {
  const { api, close } = await record([PROJECTS, PEOPLE]);
  said(await put(api, { ...released(), seeds: [] }));
  assert.equal(versionOf(api), released().version);
  const kiln = project(api, 'Kiln');
  const id = add(api, 'tasks', { ...TASK, thing: kiln });
  const diff = await planOf(api, file());
  assert.deepEqual([diff.direction, diff.installed_version], ['upgrade', released().version]);
  assert.deepEqual([diff.retires, diff.conflicts, diff.waiting], [[], [], []]);
  assert.deepEqual([diff.newly_required, diff.retypes, diff.orphans], [[], [], 0]);
  said(await put(api, file()));
  assert.equal(versionOf(api), file().version);
  assert.deepEqual([entry(api, id).fields.what, entry(api, id).fields.thing], [TASK.what, kiln]);
  close();
});

test('PROJECTS AND PEOPLE ARRIVING LATER: the tasks kept before are still there, and every part that waited comes in', async () => {
  const { api, close } = await record([]);
  said(await put(api, file()));
  const thread = add(api, 'tracks', THREAD);
  const id = add(api, 'tasks', { ...TASK, track: thread });
  assert.ok(!stored(api).has('metric.project-open'), 'a figure asked of a project went in on a record with no projects');
  await neighbours(api, [PROJECTS, PEOPLE]);
  /* PLANNED AGAIN, AS THE RECORD DOES AFTER AN INSTALL: nothing waits now, and nothing is asked. */
  const again = await planOf(api, file());
  assert.deepEqual([again.waiting, again.conflicts], [[], []]);
  said(await put(api, file()));
  const tasks = JSON.parse(stored(api).get('register.tasks')!) as { fields: Body[] };
  assert.ok(tasks.fields.some((f) => f.id === 'thing' && f.to === PROJECTS), 'the Project field did not come in once Projects was there');
  assert.ok(tasks.fields.some((f) => f.id === 'owner' && f.to === PEOPLE), 'the Owner field did not come in once People was there');
  for (const m of ['project-open', 'project-done-by-week']) assert.ok(stored(api).has(`metric.${m}`), `${m} did not come in once Projects was there`);
  assert.deepEqual([entry(api, id).fields.what, entry(api, id).fields.track], [TASK.what, thread]);
  /* AND NOW IT IS WHAT THE FILE IS ON A RECORD THAT HAD BOTH FROM THE START, so a record reaches one place by either road. */
  const whole = await record([PROJECTS, PEOPLE]);
  said(await put(whole.api, file()));
  for (const d of (await read(file())).declarations) assert.equal(stored(api).get(d.id), stored(whole.api).get(d.id), `${d.id} differs after the neighbours arrived`);
  whole.close();
  close();
});

test('THE EXAMPLES ARE THE MODULE\'S TWO, with their days counted from the day they are installed', async () => {
  const mine = file().seeds;
  const theirs = firstPartyDocument('work')!.seeds as { register: string; fields: Body }[];
  assert.deepEqual(mine.map((s) => s.register), theirs.map((s) => s.register));
  const undated = (f: Body): Body => ({ ...f, opened: null, by: null });
  for (const [i, s] of mine.entries()) assert.deepEqual(undated(s.fields), undated(theirs[i]!.fields));
  /* THE MODULE WRITES DAYS FROM ITS SAMPLE'S OWN TODAY (3 September), so a thread opened 38 days before and a task due
     the day after; on any other day the task is late from the first look. The file counts the same days from install. */
  assert.deepEqual([mine[0]!.fields.opened, mine[1]!.fields.by], [{ day: '-38' }, { day: '+1' }]);
  assert.deepEqual([theirs[0]!.fields.opened, theirs[1]!.fields.by], ['2026-07-27', '2026-09-04']);
  const { api, close } = await record([]);
  said(await put(api, file()));
  const list = (register: string): Entry[] => said<{ rows: Entry[] }>(api.kernel.list({ register, limit: 50 })).rows;
  assert.deepEqual(list('tracks').map((r) => [r.fields.name, r.fields.opened]), [['Variable axis QA', '2026-01-31']]);
  assert.deepEqual(list('tasks').map((r) => [r.fields.what, r.fields.by]), [['Chase Halden on 2026-041', '2026-03-11']]);
  close();
});

/* ── The two scripts, in QuickJS ───────────────────────────────────────────────────────────────── */

type Row = { id: string; register: string; seq: number; fields: Record<string, Json>; version: number; updated_at: string };
const row = (seq: number, fields: Record<string, Json>, version = 1): Row => ({ id: `01K7TASK00000000000000000${seq}`, register: 'tasks', seq, fields, version, updated_at: `${TODAY}T09:00:00.000Z` });

/** A host double holding a few tasks, handed one of them as a rule would, answering `list` by the leaves a script asks. */
const hostOf = (rows: Row[], input: Record<string, Json>): CtxHost => ({
  fetch: async () => {
    throw new Error('Work fetches nothing');
  },
  get: async (spoken) => (rows.find((r) => r.id === spoken) ?? null) as unknown as Json,
  list: async (register, where) => {
    const leaves = (where as { all: { field: string; is?: Json; in?: Json[] }[] }).all;
    const fits = (r: Row) => leaves.every((l) => (l.in !== undefined ? l.in.includes(r.fields[l.field]!) : r.fields[l.field] === l.is));
    return rows.filter((r) => r.register === register && fits(r)) as unknown as Json[];
  },
  now: () => `${TODAY}T09:00:00.000Z`,
  tz: 'UTC',
  input,
});

const scriptOf = (id: string): ScriptDecl => {
  const s = file().declarations.find((d) => d.script === id)!;
  return { id, version: 1, egress: s.egress as never, keys: s.keys as never, reads: s.reads as never, writes: s.writes as never, source: source(id) };
};
const writesOf = (a: ScriptAnswer): ScriptWrite[] => {
  assert.ok('writes' in a, `the run was refused: ${JSON.stringify(a)}`);
  return a.writes;
};

test('A FOLLOW-UP STARTS WHERE ITS PARENT IS, on a record with no Projects or People too: it takes the thread it left empty', async () => {
  const parent = row(1, { what: 'Proof the spring catalogue', state: 'open', track: '01K7TRACK0000000000000001' });
  const step = row(2, { what: 'Check the colour plates', state: 'open', parent: parent.id });
  const a = await runInQuickJs(scriptOf('start_with_parent'), hostOf([parent, step], { id: step.id }));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: 'tasks#2', patch: { track: '01K7TRACK0000000000000001' }, version: 1 }]);
  /* AND THE PROJECT AND OWNER TOO WHERE THE PARENT HAS THEM, never over what the follow-up says for itself. */
  const placed = row(3, { what: 'Proof the index', state: 'open', parent: parent.id, thing: '01K7THING0000000000000002' });
  const full = { ...parent, fields: { ...parent.fields, thing: '01K7THING0000000000000001', owner: '01K7PERSON000000000000001' } };
  const b = await runInQuickJs(scriptOf('start_with_parent'), hostOf([full, placed], { id: placed.id }));
  assert.deepEqual(writesOf(b), [{ op: 'update', spoken: 'tasks#3', patch: { track: '01K7TRACK0000000000000001', owner: '01K7PERSON000000000000001' }, version: 1 }]);
});

test('A FINISHED TASK CLOSES ITS OPEN FOLLOW-UPS, and leaves one in review or dropped as it is', async () => {
  const parent = row(1, { what: 'Proof the spring catalogue', state: 'done' });
  const steps = [row(2, { what: 'Plates', state: 'open', parent: parent.id }), row(3, { what: 'Index', state: 'review', parent: parent.id }), row(4, { what: 'Cover', state: 'dropped', parent: parent.id })];
  const a = await runInQuickJs(scriptOf('close_follow_ups'), hostOf([parent, ...steps], { id: parent.id }));
  assert.deepEqual(writesOf(a), [{ op: 'update', spoken: 'tasks#2', patch: { state: 'done', note: 'Closed with Proof the spring catalogue (tasks#1).' }, version: 1 }]);
});

/* ── The questions about tasks, on Work ──────────────────────────────────────────────── */

type Laid = { kind: string; heading?: string; lead?: boolean; fold?: boolean; box?: boolean; area?: string; body?: string; where?: string; when?: unknown; limit?: number; tiles?: boolean };
type Drawn = { kind: string; heading?: string; lead?: boolean; body?: string; drawn?: boolean; values?: Record<string, Json>; queue?: { id: string }[]; matched?: number };

const workPage = (): Laid[] => (file().declarations.find((d) => d.page === 'work')!.blocks as Laid[]);

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

test('WORK ASKS ITS OWN QUESTIONS: a queue of the questions about tasks, three drawn as tiles, only while one waits', () => {
  const queue = workPage().find((b) => b.kind === 'queue');
  assert.ok(queue, 'Work declares no queue');
  assert.deepEqual(
    { heading: queue.heading, where: queue.where, when: queue.when, limit: queue.limit, tiles: queue.tiles },
    { heading: 'Questions for you', where: 'list is tasks', when: { metric: 'questions-open-in:tasks', gt: 0 }, limit: 3, tiles: true },
  );
  /* NO LINE OF COUNTS OVER THE PAGE SINCE 1.26.1 (7438cc7e8): the queue itself says the questions, and the bands the rest. */
  assert.deepEqual(workPage().filter((b) => b.lead && typeof b.body === 'string' && b.body.includes('{{')), [], 'a line of counts over Work');
});

/* FIVE SINCE the screens scope of 24 October: the questions, then four bands in his order, Late, Waiting on you,
   Your work this week (called This week until 30 October, 4daeed99c) and With an agent, two to a row. */
test('FIVE TILES BEFORE THE FOLD AT 1440, the questions over four bands in his order', () => {
  assert.deepEqual(beforeTheFold(workPage()), ['Questions for you', 'Late', 'Waiting on you', 'Your work this week', 'With an agent']);
});

test('ON A RECORD, THE QUEUE SAYS THE QUESTIONS ABOUT TASKS: nothing at nought, two at two, and not the one about a person', async () => {
  const { api, close } = await record([PROJECTS, PEOPLE]);
  said(await put(api, file()));
  const late = add(api, 'tasks', { what: 'Glaze the test tiles', state: 'open', by: '2026-03-02' });
  const later = add(api, 'tasks', { what: 'Book the kiln', state: 'open', by: '2026-03-12' });
  const ada = person(api, 'Ada Byrne');
  const spoken = (id: string): string => {
    const e = api.kernel.get(id) as unknown as { register: string; seq: number };
    return `${e.register}#${e.seq}`;
  };
  const OPTIONS = [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'Not yet' }];
  const ask = (question: string, about: string) => said(api.kernel.propose({ question, body_kind: 'options', body: { options: OPTIONS, about } } as never, 'slash'));
  const page = (): Drawn[] => said<{ blocks: Drawn[] }>(api.kernel.page('work')).blocks;
  const questions = (): Drawn => page().find((b) => b.heading === 'Questions for you')!;

  assert.equal(questions().drawn, false, 'the queue drew with nothing asked');
  assert.equal(page().find((b) => b.heading === 'Late')!.matched, 1, 'Late does not hold the one task past its day');

  ask('Move the glazing to Friday?', spoken(late));
  ask('Book the small kiln?', spoken(later));
  ask('Is this the same potter?', spoken(ada));
  assert.notEqual(questions().drawn, false);
  assert.equal(questions().matched, 2, 'the queue kept a question about a person');
  close();
});
