/**
 * Every first-party module and every pack in `packs/`, taken from the version brain.dog last served to the one in this
 * tree, over a record that has rows in it (REC-A17 job 2).
 *
 * WHY. "must still open with rows kept after every change" (HD.477). A rehearsal opens an older record with the new
 * kernel (`apps/cli/test/migration-rehearsal.test.ts`), and `pack-versions.test.ts` walks each module's versions, but
 * nothing took each of them from its last released document to this one over a record a person had been using. So an
 * update that emptied a field, lost a row or wiped the nights already kept would have reached a record with every
 * test green.
 *
 * THE RELEASED DOCUMENTS ARE FILES, `fixtures/released/<id>-<version>.json`, written from the deployed commit by
 * `fixtures/released/freeze.mjs` (its README says how and from which commit). This file never calls git, so it says
 * the same thing on a machine with no history. A module or a pack with no file there is new since the last release:
 * it is named and skipped, never passed in silence.
 *
 * ONE JOURNEY EACH. A record takes the five modules as released and whatever the pack needs, as released. A row is
 * written in every list the subject declares or lays a field on, with every field the list has that the record will
 * take. Two nights pass, so the record holds its own nightly rows and the night's points. Then everything it holds is
 * updated to this tree's documents, each planned and then installed as a person's update is, and the two pictures are
 * compared: every row is still there, every field the list still declares holds the value it held, no list holds
 * fewer rows, no list that had rows has gone, every point of every night is as it was, and the next night adds more.
 *
 * AND IT GOES RED WHEN AN UPDATE DROPS SOMETHING. The last tests run the same journey with an update that is made to
 * empty one field, delete one row, forget one night and stop declaring one list, and hold the comparison to naming
 * each. Without them a comparison that compared nothing would read as every update being safe.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

import { compareVersions } from '@braindog/declare/catalogue';
import type { Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';

import { fillFeed } from '../../../packs/live-feed/fill.ts';
import { fillRates } from '../../../packs/rates-poll/fill.ts';
import { FIRST_PARTY, NOW, PAGES, firstPartyDocument, firstPartyManifest } from '../src/index.ts';
import { projectTemplate } from '../src/modules/portfolio.ts';

type Body = Record<string, unknown>;
type Doc = Body & { pack: string; version: string; requires?: { packs?: Record<string, string> }; declarations: Body[]; extends?: Record<string, unknown> };
type Field = { id: string; type: string; required?: boolean; unique?: boolean; values?: string[]; to?: string; of?: string; min?: number; max?: number };

const OWNER = { actor: 'p_1' };
const iso = (ms: number): string => new Date(ms).toISOString();
const DAY_MS = 86_400_000;

const RELEASED_DIR = new URL('./fixtures/released/', import.meta.url);
const PACKS_DIR = new URL('../../../packs/', import.meta.url);
const json = (url: URL): Doc => JSON.parse(readFileSync(url, 'utf8')) as Doc;

/** Every released document, by the id it carries, oldest first. The file's name is checked against what it holds. */
const RELEASED: ReadonlyMap<string, Doc[]> = (() => {
  const by = new Map<string, Doc[]>();
  for (const name of readdirSync(RELEASED_DIR).filter((n) => n.endsWith('.json')).sort()) {
    const doc = json(new URL(name, RELEASED_DIR));
    assert.equal(name, `${doc.pack}-${doc.version}.json`, `${name} holds ${doc.pack} ${doc.version}, so its name says another version than its body`);
    by.set(doc.pack, [...(by.get(doc.pack) ?? []), doc]);
  }
  for (const docs of by.values()) docs.sort((a, b) => compareVersions(a.version, b.version));
  return by;
})();

/** A pack's document as its folder ships it today, `null` for a folder that holds no pack file. */
const packFolders = (): string[] => readdirSync(PACKS_DIR).filter((f) => statSync(new URL(f, PACKS_DIR)).isDirectory() && existsSync(new URL(`${f}/${f}.pack.json`, PACKS_DIR))).sort();
const CURRENT_PACKS: ReadonlyMap<string, Doc> = new Map(packFolders().map((f) => json(new URL(`${f}/${f}.pack.json`, PACKS_DIR))).map((d) => [d.pack, d]));

/**
 * The two packs that ship as a template: a person supplies an address and what to read from it, and what is installed
 * is the template filled, under an id of its own. Each is filled here with the same supplies before and after, by the
 * pack's own `fill.ts`, so the update is the one a record that filled the released template is offered.
 */
const FILLS: Readonly<Record<string, (template: Doc) => Doc>> = {
  'live-feed': (t) => fillFeed(t, { id: 'kept', url: 'https://stats.example.com/numbers.json', every: '1d', measures: [{ name: 'Sign-ups', path: 'data.signups', unit: 'users' }] }) as Doc,
  'rates-open-er-api-com': (t) => fillRates(t, { id: 'kept', url: 'https://open.er-api.com/v6/latest/USD', every: '1d', base: 'USD', rates: [{ currency: 'EGP', path: 'rates.EGP' }] }) as Doc,
};

/** A document as a record is given it: itself, or filled when it is a template. A template nothing here fills fails by name. */
function ready(doc: Doc): Doc {
  if (!('fill' in doc)) return structuredClone(doc);
  const fill = FILLS[doc.pack];
  assert.ok(fill, `${doc.pack} is a template (it carries fill) and FILLS in this file has no supplies for it, so it cannot be installed`);
  return fill(structuredClone(doc));
}

/** This tree's document for an id, a module's or a pack's. */
const current = (id: string): Doc => {
  const doc = (firstPartyDocument(id) as Doc | null) ?? CURRENT_PACKS.get(id);
  assert.ok(doc, `${id} is neither a first-party module nor a folder under packs/`);
  return ready(doc);
};

/** The newest released document for an id, or this tree's when it was never released, which is what a record would be offered. */
const released = (id: string): Doc => {
  const doc = RELEASED.get(id)?.at(-1);
  return doc ? ready(doc) : current(id);
};

/** What is taken through an update: the five modules, then every pack folder. */
const SUBJECTS: readonly string[] = [...FIRST_PARTY, ...CURRENT_PACKS.keys()];

/* ── a record, and what it takes ─────────────────────────────────────────── */

type Refusal = { code: string; fix: string; at?: string };
type Out<T> = { ok: boolean; value?: T; refusal?: Refusal };
const value = <T>(r: unknown, doing: string): T => {
  const x = r as Out<T>;
  assert.ok(x.ok, x.ok ? '' : `${doing}: ${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Rec = { api: Api; k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> };

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** What an update is made to do to the record as it lands, for the tests that plant a loss. */
type Plant = (rec: Rec, doc: Doc) => void;

/**
 * One document into the record by the road a person's install or update takes from the app: `planPack`, then
 * `installPack` against that plan with exactly what the plan asked to be approved. The example rows are left out, so
 * every row in the record is one this file wrote or a night did.
 *
 * THE RECORD'S OWN ROAD AND NOT `declare`'S `plan` AND `install` BY HAND. Tried first, the way
 * `cash-cross-check.test.ts` installs money-core, and it refused what brain.dog installs: a pack that lays a field on
 * a module's list (`bank-hsbc-eg`, `mercury`, `stripe`) left that list reading as written in the record, so the
 * module's own update was refused `PROVIDES_CONFLICT`. The record knows which pack laid what and a host made by hand
 * here did not, so the test would have been about its own host.
 */
async function take(rec: Rec, doc: Doc, doing: string, plant?: Plant): Promise<void> {
  const given = { ...doc, seeds: [] };
  for (let keys = 0; ; keys++) {
    const planned = value<{ diff: { planHash: string; approve: string[] } }>(await rec.api.planPack({ doc: given, source: { kind: 'local' } } as never, owner), `${doing}, planning ${doc.pack} ${doc.version}`);
    const out = (await rec.api.installPack({ doc: given, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner)) as Out<unknown>;
    /* A PACK THAT SENDS A KEY IS REFUSED UNTIL THE VAULT HOLDS ONE UNDER THE LABEL IT NAMES. The entry is a label and no
       bytes, sealed for a connector as a key a script opens is (`packs/mercury/mercury.test.ts` has the reasons). */
    const label = out.ok || keys > 3 ? null : /^Add the key called "(.+)" to the (?:keychain|vault)/u.exec(out.refusal?.fix ?? '')?.[1];
    if (!label) {
      value(out, `${doing}, installing ${doc.pack} ${doc.version}`);
      break;
    }
    rec.sql.exec(
      "INSERT INTO grant (id, label, opens, kind, kdf, wrapped_by, kek_id, created_at, sealed_under) VALUES (?, ?, 'example.com', 'api_token', 'none', 'kek', 'k_test', ?, 'connector')",
      `g_kept_${keys}_${doc.pack}`,
      label,
      iso(rec.clock.now()),
    );
  }
  plant?.(rec, doc);
}

/**
 * What a record holds that no pack in `packs/` names and three of them lean on: the project page, which reads three
 * modules at once and so sits in none of them (`project-brief` adds a block to it), and a list of readings called
 * `datapoints`, which `live-feed` writes and `portfolio-bands` reads from whichever pack declares it. On brain.dog the
 * first is laid by the starter and the second comes with a use case. Here the page is the seed's own and the list is
 * a pack invented for the purpose, the fields the founder's list has.
 */
const READINGS: Doc = {
  pack: 'kept-readings',
  version: '1.0.0',
  summary: 'Readings about each project.',
  author: 'Example',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: { portfolio: '^1.0.0' } },
  declarations: [
    {
      register: 'datapoints',
      name: 'Readings',
      one: 'reading',
      holds: 'one number about one project at one moment',
      title: 'name',
      fields: [
        { id: 'name', label: 'Measure', type: 'text', required: true, index: true, search: true },
        { id: 'value', label: 'Value', type: 'decimal' },
        { id: 'amount', label: 'Amount', type: 'money' },
        { id: 'unit', label: 'Unit', type: 'text' },
        { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
        { id: 'at', label: 'When', type: 'instant', index: true },
        /* THE FOUNDER'S OWN VALUES, which Portfolio 1.19.0 declares when it takes the list over: a text field here would be
           a retype of every reading written under it. */
        { id: 'source', label: 'Source', type: 'enum', values: ['reported', 'polled', 'typed', 'example'], index: true },
      ],
    },
  ],
} as never;

/**
 * AND THE SAME PACK ONCE PORTFOLIO DECLARES THE LIST ITSELF (portfolio 1.19.0, which takes Numbers over): it hands the
 * list on (`hands`), as founder 3.0.0 does, and keeps a page over it, so Portfolio's update takes the list over with every
 * reading in it rather than meeting a second owner.
 */
const READINGS_HANDED: Doc = {
  ...READINGS,
  version: '1.1.0',
  hands: { 'register.datapoints': 'portfolio' },
  declarations: [
    {
      page: 'kept-readings',
      title: 'Readings',
      icon: 'observe',
      requires: ['register.datapoints'],
      blocks: [{ kind: 'table', heading: 'Readings', icon: 'list', span: 12, source: 'register.datapoints', columns: [{ field: 'name' }, { field: 'at' }] }],
    },
  ],
} as never;

async function furnish(rec: Rec): Promise<void> {
  /* THE PROJECT PAGE THE RECORD'S LISTS LAY: a Portfolio released before 1.23.0 keeps no stages, so its page has no road. */
  const page = projectTemplate(picture(rec).lists.keys());
  value(await rec.k.install([{ id: 'page.project', kind: 'page', body: page as never }]), 'laying the project page');
  await take(rec, READINGS, 'the readings list');
}

/**
 * THE MODULES A RECORD HELD BEFORE `core` EXISTED, and the order an update takes them in: People first, which hands its
 * four pages to core, and core after it, which takes them over (people 4.0.0). Core first would meet the pages under
 * People and be refused, which is also what the night does, so it asks again after People is in.
 */
const BEFORE_CORE: readonly string[] = FIRST_PARTY.filter((id) => id !== 'core');

/** The packs a document needs that are not modules, each before the one that needs it. */
function needs(id: string, pick: (id: string) => Doc, seen: string[] = []): string[] {
  for (const dep of Object.keys(pick(id).requires?.packs ?? {})) {
    if ((FIRST_PARTY as readonly string[]).includes(dep) || seen.includes(dep)) continue;
    needs(dep, pick, seen);
    seen.push(dep);
  }
  return seen;
}

/** The order a record takes things in: the five modules, what the subject needs, then the subject when it is a pack. */
const order = (subject: string, pick: (id: string) => Doc): string[] => {
  const isModule = (FIRST_PARTY as readonly string[]).includes(subject);
  /* A PACK THAT HANDS A DECLARATION TO A MODULE (Roadmap's page to Work) GOES IN BEFORE THE MODULE, which would otherwise
     take a page the pack still holds: the order the night keeps (`updateFirstParty` plans the module again once the add-on is in). */
  const hands = Object.values((pick(subject) as { hands?: Record<string, string> }).hands ?? {}).some((to) => (FIRST_PARTY as readonly string[]).includes(to));
  if (!isModule && hands) return [...needs(subject, pick).filter((x) => !(FIRST_PARTY as readonly string[]).includes(x) && x !== 'core'), subject, ...BEFORE_CORE, 'core'];
  return [...BEFORE_CORE, 'core', ...needs(subject, pick), ...(isModule ? [] : [subject])];
};

/** The lists a subject's rows go in: the ones its document declares, the ones it lays a field on, and the ones a door of its writes into. */
const listsOf = (doc: Doc): string[] => [
  ...new Set([
    ...doc.declarations.filter((d) => Object.keys(d)[0] === 'register').map((d) => String(d.register)),
    ...Object.keys(doc.extends ?? {}).map((id) => id.replace(/^register\./u, '')),
    ...doc.declarations.map((d) => (d.writes as { register?: unknown } | undefined)?.register).filter((r): r is string => typeof r === 'string'),
  ]),
];

/** A list's fields as the record holds them now, a pack's laid fields among them. `null` when the record declares no such list. */
function fieldsOf(k: Kernel, register: string): Field[] | null {
  const row = k.declarations().find((d) => d.id === `register.${register}`);
  return row ? ((JSON.parse(row.body) as { fields?: Field[] }).fields ?? []) : null;
}

/* ── a row in every list ─────────────────────────────────────────────────── */


/**
 * A value a field of this type takes, made from the list and the field so no two are alike and a value that moved to
 * another field would be seen. `undefined` when this file has nothing to say for the type, which leaves the field out.
 */
function sample(rec: Rec, register: string, field: Field, making: readonly string[]): unknown {
  const n = [...`${register}.${field.id}`].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  switch (field.type) {
    case 'text':
      return `Kept ${register} ${field.id}`;
    case 'document':
      return `Kept ${register} ${field.id}\n\nA second line.`;
    case 'email':
      return `kept.${field.id}@example.com`.toLowerCase();
    case 'url':
      return `https://example.com/${register}/${field.id}`;
    case 'bool':
      return true;
    case 'int':
    case 'duration':
      return Math.min(field.max ?? Infinity, Math.max(field.min ?? 1, (n % 40) + 1));
    case 'decimal':
      return (n % 90) + 1.5;
    case 'money':
      return { amount: 1_000 + n, currency: 'GBP' };
    case 'day':
      return iso(NOW + ((n % 20) + 30) * DAY_MS).slice(0, 10);
    case 'instant':
      return iso(NOW - (n % 20) * DAY_MS);
    case 'enum':
      return field.values?.[0];
    case 'list':
      return field.of === undefined || field.of === 'text' ? [`kept-${field.id}`] : undefined;
    case 'file':
      return { sha256: 'ab'.repeat(32), mime: 'text/plain', bytes: n, name: `${field.id}.txt` };
    case 'ref':
      /* A ROW TO POINT AT, MADE FIRST. A list that points at itself, or round at one being made, is left empty. */
      return typeof field.to === 'string' && !making.includes(field.to) ? rowIn(rec, field.to, making) : undefined;
    default:
      return undefined;
  }
}

/** The one row this file keeps in each list of a record, by list, so a link field always has something to name. */
const WRITTEN = new WeakMap<Kernel, Map<string, string>>();

/** The fields each record's rows went without, as `list.field`, because the record refused the value or this file had none to give. */
const LEFT_OUT = new WeakMap<Kernel, string[]>();
const leftOut = (k: Kernel): string[] => LEFT_OUT.get(k) ?? (LEFT_OUT.set(k, []), LEFT_OUT.get(k)!);

/** How many times a refused row is sent again without the field the refusal named. */
const TRIES = 24;

/**
 * A row in a list with every field the record will take, and its id.
 *
 * EVERY FIELD FIRST, THEN WITHOUT WHAT IS REFUSED. A list has rules this file does not know: a currency read from the
 * account, a state a new row may not start in, a field a script fills. So the whole row is sent, and a refusal that
 * names a field the list does not require drops that field and sends the rest again. A refusal that names a required
 * field, or names nothing, fails with the list's name: a list this file cannot write a row in is a list it would
 * otherwise say nothing about.
 */
function rowIn(rec: Rec, register: string, making: readonly string[] = []): string | undefined {
  const { k } = rec;
  const mine = WRITTEN.get(k) ?? new Map<string, string>();
  WRITTEN.set(k, mine);
  if (mine.has(register)) return mine.get(register);
  const declared = fieldsOf(k, register);
  if (!declared) return undefined;

  const fields: Body = {};
  for (const field of declared) {
    const v = sample(rec, register, field, [...making, register]);
    if (v !== undefined) fields[field.id] = v;
    else leftOut(k).push(`${register}.${field.id}`);
  }
  for (let i = 0; i < TRIES; i++) {
    const out = k.create(register, fields as never, OWNER) as Out<{ id: string }>;
    if (out.ok) {
      mine.set(register, out.value!.id);
      return out.value!.id;
    }
    const at = String(out.refusal?.at ?? '').replace(/^fields\./u, '').split('.')[0]!;
    const named = declared.find((f) => f.id === at);
    assert.ok(named && named.required !== true && at in fields, `no row could be written in ${register}: ${out.refusal?.code} at ${out.refusal?.at}: ${out.refusal?.fix}`);
    delete fields[at];
    leftOut(k).push(`${register}.${at}`);
  }
  assert.fail(`no row could be written in ${register} in ${TRIES} tries`);
}

/* ── two pictures of one record, and what the second lost ────────────────── */

type Row = { id: string; register: string; fields: Body };
type Point = { series: string; grain: string; at: string; value: number };
type Picture = { rows: Row[]; points: Point[]; lists: Map<string, Set<string>> };

/** The record's rows, its nights' points, and the fields each live list declares, read from the tables themselves. */
function picture({ k, sql }: Rec): Picture {
  const rows = sql
    .all<{ id: string; register: string; fields: string }>('SELECT id, register, fields FROM entry WHERE deleted_at IS NULL ORDER BY register, id')
    .map((r) => ({ id: r.id, register: r.register, fields: JSON.parse(r.fields) as Body }));
  const points = sql.all<Point>('SELECT series, grain, at, value FROM metric_point ORDER BY series, grain, at');
  const lists = new Map<string, Set<string>>();
  for (const d of k.declarations())
    if (d.kind === 'register') lists.set(d.id.replace(/^register\./u, ''), new Set(((JSON.parse(d.body) as { fields?: Field[] }).fields ?? []).map((f) => f.id)));
  return { rows, points, lists };
}

/** A row said by its list and what it is called, never by its id. */
const called = (row: Row): string => `${row.register} "${String(row.fields.name ?? row.fields.what ?? row.fields.title ?? Object.values(row.fields).find((v) => typeof v === 'string') ?? 'unnamed')}"`;

const same = (a: unknown, b: unknown): boolean => {
  try {
    assert.deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
};

/**
 * Everything the second picture lost, one sentence each, empty when the update kept it all.
 *
 * A FIELD THE NEW VERSION NO LONGER DECLARES IS NOT COUNTED, because a release may take a field away and says so in its
 * plan. A list that held rows and is no longer declared IS, since its rows are then on no page a person can open.
 */
function lost(before: Picture, after: Picture): string[] {
  const out: string[] = [];
  const count = (p: Picture, register: string): number => p.rows.filter((r) => r.register === register).length;
  for (const register of new Set(before.rows.map((r) => r.register))) {
    const [was, is] = [count(before, register), count(after, register)];
    if (is < was) out.push(`${register} held ${was} and holds ${is}`);
    if (!after.lists.has(register)) out.push(`${register} is no longer a list, and it held ${was}`);
  }
  const now = new Map(after.rows.map((r) => [r.id, r]));
  for (const row of before.rows) {
    const kept = now.get(row.id);
    if (!kept) {
      out.push(`${called(row)} is gone`);
      continue;
    }
    for (const [field, was] of Object.entries(row.fields)) {
      if (!after.lists.get(row.register)?.has(field)) continue;
      if (!same(kept.fields[field], was)) out.push(`${called(row)} had ${field} ${JSON.stringify(was)} and has ${JSON.stringify(kept.fields[field])}`);
    }
  }
  const points = new Map(after.points.map((p) => [`${p.series} ${p.grain} ${p.at}`, p.value]));
  for (const p of before.points) {
    const key = `${p.series} ${p.grain} ${p.at}`;
    if (!points.has(key)) out.push(`the night of ${p.at} lost its point of ${p.series}`);
    else if (points.get(key) !== p.value) out.push(`the night of ${p.at} read ${p.value} for ${p.series} and reads ${points.get(key)}`);
  }
  return out;
}

/* ── the journey ─────────────────────────────────────────────────────────── */

/** The list the record writes a row into each night. Its rows here are the nights' own, so this file types none into it unless it is the subject's. */
const NIGHTS = 'snapshots';

/** The next night passes: the clock moves to ten past the coming midnight and whatever is due is done. */
async function night({ k, clock }: Rec): Promise<void> {
  clock.set((Math.floor(clock.now() / DAY_MS) + 1) * DAY_MS + 10 * 60_000);
  const out = await k.drain();
  assert.equal(out.failed + out.dead, 0, `a night's work failed: ${JSON.stringify(out)}`);
}

const nightsIn = (p: Picture): number => p.rows.filter((r) => r.register === NIGHTS).length;

type Journey = { rec: Rec; before: Picture; after: Picture; wrote: string[] };

/**
 * A record on the released documents, used, then updated to this tree's: the picture before the update and after it.
 * `from` is the subject's released document. `to` and `plant` are for the tests that make an update lose something.
 */
async function journey(subject: string, from: Doc, o: { to?: Doc; plant?: Plant } = {}): Promise<Journey> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  /* A HOST THAT ANSWERS SLASH, as brain.dog's does: `pad` asks it a question, and is refused on a host that cannot answer. */
  const api = await createRecordApi({ sql, clock, answersSlash: true });
  const rec: Rec = { api, k: api.kernel, sql, clock };
  const old = (id: string): Doc => (id === subject ? ready(from) : released(id));
  for (const id of BEFORE_CORE) await take(rec, old(id), `${subject} as released`);
  await furnish(rec);
  for (const id of order(subject, old).filter((x) => !(FIRST_PARTY as readonly string[]).includes(x))) await take(rec, old(id), `${subject} as released`);

  /* THE SUBJECT'S LISTS FIRST, each held to taking a row, then every other list the record holds: a person's record has
     rows everywhere, and an update that lays a field on another module's list can lose a value there as well. */
  const wrote = listsOf(ready(from));
  for (const register of wrote) assert.ok(rowIn(rec, register), `${subject} ${from.version} declares ${register} and the record holds no such list`);
  for (const register of [...picture(rec).lists.keys()].filter((r) => r !== NIGHTS)) rowIn(rec, register);
  const typed = nightsIn(picture(rec));
  await night(rec);
  await night(rec);
  const before = picture(rec);
  assert.equal(nightsIn(before) - typed, 2, 'two nights passed and the record did not write two nightly rows, so there is no history for the update to keep');
  assert.ok(before.points.length > 0, 'two nights passed and no point of any night was kept');

  const next = (id: string): Doc => (id === subject && o.to ? ready(o.to) : current(id));
  if (firstPartyManifest('portfolio').provides.includes('register.datapoints')) await take(rec, READINGS_HANDED, `${subject} updated, handing the readings on`);
  for (const id of order(subject, next)) await take(rec, next(id), `${subject} updated`, id === subject ? o.plant : undefined);
  return { rec, before, after: picture(rec), wrote };
}

for (const subject of SUBJECTS) {
  const docs = RELEASED.get(subject) ?? [];
  if (docs.length === 0) {
    test(`${subject} is new: no released version to update from`, { skip: `new: fixtures/released holds no ${subject}-<version>.json` }, () => {});
    continue;
  }
  for (const from of docs) {
    test(`${subject} ${from.version} to ${current(subject).version} keeps every row, every value and every night`, async (t) => {
      const { rec, before, after, wrote } = await journey(subject, from);
      const held = before.rows.filter((r) => wrote.includes(r.register));
      t.diagnostic(`${wrote.length} list(s) of its own with ${held.reduce((n, r) => n + Object.keys(r.fields).length, 0)} value(s), and ${before.rows.length} row(s) and ${before.points.length} point(s) of two nights across the record, compared`);
      const without = leftOut(rec.k).filter((f) => wrote.includes(f.split('.')[0]!));
      if (without.length > 0) t.diagnostic(`written without: ${without.join(', ')}`);
      assert.deepEqual(lost(before, after), [], `updating ${subject} from ${from.version} lost something a person had`);

      /* AND THE RECORD STILL KEEPS ITS NIGHTS: the one after the update writes its row and its points as the two before did. */
      await night(rec);
      const later = picture(rec);
      assert.equal(nightsIn(later), nightsIn(after) + 1, 'the night after the update wrote no nightly row');
      assert.ok(later.points.length > after.points.length, 'the night after the update kept no new point');
      assert.deepEqual(lost(after, later), [], 'the night after the update changed what the record already held');
      rec.sql.close();
    });
  }
}

test('EVERY RELEASED DOCUMENT IS STILL SOMETHING THIS TREE SHIPS, so a pack a record holds cannot leave the tree unseen', () => {
  const gone = [...RELEASED.keys()].filter((id) => !SUBJECTS.includes(id));
  assert.deepEqual(gone, [], 'fixtures/released holds a document for something that is no longer a module or a folder under packs/, and a record that installed it is offered nothing');
});

/* ── an update made to lose something, and the comparison held to saying so ── */

/** The newest released document of a subject, for a planted journey. */
const from = (subject: string): Doc => {
  const doc = RELEASED.get(subject)?.at(-1);
  assert.ok(doc, `the planted loss needs a released ${subject}, and fixtures/released holds none`);
  return doc;
};

/** The journey with a loss planted in the subject's own update, and what the comparison then says. */
async function planted(subject: string, plant: Plant): Promise<string[]> {
  const { rec, before, after } = await journey(subject, from(subject), { plant });
  rec.sql.close();
  return lost(before, after);
}

test('AN UPDATE THAT EMPTIES ONE FIELD OF ONE ROW IS NAMED, by its list, its row and the value it held', async () => {
  const said = await planted('portfolio', ({ sql }) => sql.exec("UPDATE entry SET fields = json_remove(fields, '$.name') WHERE register = 'things'"));
  assert.deepEqual(said, ['things "Kept things name" had name "Kept things name" and has undefined']);
});

test('AN UPDATE THAT CHANGES A VALUE IN A LIST ANOTHER MODULE DECLARES IS NAMED, because a pack lays fields on lists it does not own', async () => {
  const said = await planted('stripe', ({ sql }) => sql.exec("UPDATE entry SET fields = json_set(fields, '$.balance.amount', 1) WHERE register = 'accounts'"));
  assert.equal(said.length, 1, said.join('\n'));
  assert.match(said[0]!, /^accounts "Kept accounts name" had balance \{"amount":\d+,"currency":"GBP"\} and has \{"amount":1,"currency":"GBP"\}$/u);
});

test('AN UPDATE THAT DELETES A ROW IS NAMED TWICE, as a count that fell and as the row that went', async () => {
  const said = await planted('work', (rec) => rec.sql.exec("UPDATE entry SET deleted_at = ? WHERE register = 'tasks'", iso(rec.clock.now())));
  assert.deepEqual(said, ['tasks held 1 and holds 0', 'tasks "Kept tasks what" is gone']);
});

test('AN UPDATE THAT FORGETS A NIGHT IS NAMED, the nightly row and every point of that night', async () => {
  let night = '';
  const said = await planted('money-core', ({ sql }) => {
    night = sql.one<{ at: string }>('SELECT MIN(at) AS at FROM metric_point')!.at;
    sql.exec('DELETE FROM metric_point WHERE at = ?', night);
    const first = sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'snapshots' ORDER BY json_extract(fields, '$.on') LIMIT 1")!.id;
    sql.exec('DELETE FROM entry WHERE id = ?', first);
  });
  assert.ok(said.some((s) => /^snapshots held \d+ and holds \d+$/u.test(s)), said.join('\n'));
  const points = said.filter((s) => s.startsWith(`the night of ${night} lost its point of `));
  assert.ok(points.length > 0, `no point of ${night} was missed:\n${said.join('\n')}`);
});

test('A VERSION THAT STOPS DECLARING A LIST WITH A ROW IN IT IS REFUSED BY THE RECORD, and a list that went anyway is named', async () => {
  /* A COPY OF THE PACK'S DOCUMENT, one major step on, that declares another list in place of the one a row is in. */
  const to = current('hello');
  to.version = '2.0.0';
  to.declarations = [{ register: 'greetings', name: 'Greetings', one: 'greeting', holds: 'a word said once', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }];
  await assert.rejects(journey('hello', from('hello'), { to }), /hello updated, installing hello 2\.0\.0: WOULD_ORPHAN at register\.items/u);

  /* AND WERE THE RECORD EVER TO LET ONE THROUGH, the rows would sit under a list no page opens. The declaration is
     retired behind the update's back, and the comparison says which list and how many rows it held. */
  const said = await planted('hello', ({ sql }) => sql.exec("UPDATE declaration SET retired = 1 WHERE id = 'register.items' AND superseded_at IS NULL"));
  assert.deepEqual(said, ['items is no longer a list, and it held 1']);
});
