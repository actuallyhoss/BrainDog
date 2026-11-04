/**
 * The rulings of `docs/04-PACKS.md` §9 that the record holds, one test each, every name carrying its ruling's number.
 *
 * `tools/gates/rulings.mjs` keeps the page and this file together. A ruling a later unit builds is a real test marked
 * `todo` with what it waits on, and the page says the same, so a ruling written and never built shows on both.
 * Rulings 285 and 305 are lists of calls rather than one behaviour, so their tests read the page and check each call
 * against the code it names.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { installFault, normalise, plan, type Installed, type Pack } from '@braindog/declare';
import { declarations, firstPartyDocument, REGISTERS } from '@braindog/seed';
import { moduleDocument } from '@braindog/seed/usecases/install';

import { createRecordApi, type Boot, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8');

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown) => {
  const x = r as Out;
  assert.ok(!x.ok, 'the call was allowed');
  return x.refusal!;
};

async function record(...batch: unknown[]) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install(batch as never));
  return { api, sql };
}

/* ── 298 · a call on a switched-off add-on's list ──────────────────────── */

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', pack: 'work', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};
const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

test('ruling 298: a write to a switched-off add-on\'s list is refused with a sentence naming the add-on, and the rest still works', async () => {
  const { api, sql } = await record(TASKS, NOTES);
  value(await api.create({ register: 'tasks', fields: { what: 'Kerning pass' } }, owner));
  value(await api.disablePack({ id: 'work' }, owner));

  const said = refusal(await api.create({ register: 'tasks', fields: { what: 'Spacing' } }, owner));
  assert.equal(said.code, 'PACK_DISABLED');
  assert.match(said.fix, /\bwork\b/i, 'the sentence did not name the add-on that is off');
  assert.deepEqual(said.allowed, ['work']);
  /* AND THE REST OF THE REACH STANDS: a list no add-on owns takes the same call. */
  value(await api.create({ register: 'notes', fields: { body: 'Still here' } }, owner));
  sql.close();
});

test('ruling 298: reading a switched-off add-on\'s list is refused with the same sentence', async () => {
  const { api, sql } = await record(TASKS);
  value(await api.disablePack({ id: 'work' }, owner));
  const said = refusal(await api.list({ register: 'tasks' }, owner));
  assert.equal(said.code, 'PACK_DISABLED', `a read said "${said.fix}" and not which add-on is off`);
  assert.match(said.fix, /\bwork\b/i);
  sql.close();
});

/* ── 302 · a plan that retires a list with rows ─────────────────────────── */

test('ruling 302: a plan that retires a list with rows is shown, with the row count, and waits for his press', { todo: 'SHL-A12 builds it' }, async () => {
  const doc = {
    pack: 'studio-books',
    version: '1.2.0',
    summary: 'What a small studio owes.',
    author: 'Halden',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [{ register: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }],
  };
  const pack = value<Pack>(await normalise(doc));
  const state: Installed = {
    format: 1,
    primitives: 1,
    record_version: 7,
    packs: [{ id: 'studio-books', version: '1.0.0' }],
    declarations: [{ id: 'register.invoices', version: 1, kind: 'register', pack_id: 'studio-books', body: '{}', checksum: 'a' }],
    rows: { invoices: 412 },
  } as never;
  const diff = await plan(pack, state);
  assert.equal(diff.retires.find((r) => r.id === 'register.invoices')?.rows, 412, 'the plan did not count the rows the removal takes');
  assert.equal(installFault(pack, diff), null, 'the plan was refused rather than shown');
});

/* ── 338 · a service's price and renewal day ────────────────────────────── */

test('ruling 338: a service\'s price and renewal day are optional', () => {
  const fields = REGISTERS.services!.fields as readonly { id: string; required?: boolean }[];
  for (const id of ['cost', 'renews']) {
    const field = fields.find((f) => f.id === id);
    assert.ok(field, `Services has no ${id}`);
    assert.notEqual(field.required, true, `a service cannot be kept without its ${id}`);
  }
});

/* ── 339 · the examples ─────────────────────────────────────────────────── */

type Entry = { id: string; latest: string; audience?: string; versions: { version: string }[] };
const catalogue = (): Entry[] => (JSON.parse(read('apps/web/static/catalogue/index.json')) as { entries: Entry[] }).entries;

test('ruling 339: the Reading list and Hello stay in the catalogue, each with its file', () => {
  for (const id of ['reading-list', 'hello']) {
    const entry = catalogue().find((e) => e.id === id);
    assert.ok(entry, `${id} left the catalogue`);
    assert.ok(existsSync(`${ROOT}apps/web/static/catalogue/packs/${id}/${entry.latest}.pack.json`), `${id} ${entry.latest} has no file to install`);
  }
});

test('ruling 339: the Reading list and Hello sit on their own shelf, as examples', { todo: 'SHL-A11 builds it' }, () => {
  for (const id of ['reading-list', 'hello']) assert.equal(catalogue().find((e) => e.id === id)?.audience, 'example', `${id} is shelved with the add-ons`);
});

/* ── 340 · one list owns repeating money ────────────────────────────────── */

test('ruling 340: a bill that repeats is refused in favour of a line in Recurring', { todo: 'SHL-A15 builds it' }, async () => {
  const { api, sql } = await record(...declarations());
  const bill = { what: 'Studio rent', direction: 'owed_by_me', amount: { amount: 1_650_00, currency: 'GBP' }, due: '2026-11-01', state: 'open' };
  value(await api.create({ register: 'obligations', fields: { ...bill, repeats: 'none' } }, owner));
  const said = refusal(await api.create({ register: 'obligations', fields: { ...bill, repeats: 'monthly' } }, owner));
  assert.match(said.fix, /recurring/i, 'the refusal did not say where repeating money goes');
  sql.close();
});

/* ── 341 · categories ───────────────────────────────────────────────────── */

test('ruling 341: categories are rows a record owns, so a person adds one with no new declaration', async () => {
  const { api, sql } = await record(...declarations());
  assert.ok(api.kernel.register('categories'), 'categories is not a list');
  value(await api.create({ register: 'categories', fields: { name: 'Childcare', direction: 'out', state: 'live' } }, owner));
  sql.close();
});

test('ruling 341: Money seeds a starter set of categories, in and out', () => {
  const seeds = ((firstPartyDocument('money-core') as { seeds?: { register: string; fields: { direction?: string } }[] }).seeds ?? []).filter((s) => s.register === 'categories');
  assert.ok(seeds.length >= 6, `Money seeds ${seeds.length} categories, the sample studio's, and not a starter set`);
  assert.ok(seeds.some((s) => s.fields.direction === 'in') && seeds.some((s) => s.fields.direction === 'out'));
  /* AND THE SET ITSELF, asked for by name with no example beside it (`starters: true`): eight, both ways, none tagged.
     No caller that installs asks for it yet: the record's host would plant each as an example. */
  const set = ((moduleDocument(null, 'money-core', { today: '2026-10-09', starters: true }) as { seeds?: { register: string; fields: { direction?: string; tags?: string[] } }[] }).seeds ?? []);
  assert.equal(set.length, 8);
  assert.ok(set.every((s) => s.register === 'categories' && !(s.fields.tags ?? []).includes('example')));
  assert.ok(set.some((s) => s.fields.direction === 'in') && set.some((s) => s.fields.direction === 'out'));
});

/* ── 439 · names through a list that meets people ───────────────────────── */

const CONTACTS = {
  id: 'register.contacts',
  kind: 'register' as const,
  body: {
    id: 'contacts',
    name: 'Contacts',
    title: 'full_name',
    meets: { name: 'full_name', email: 'mail', handles: 'accounts', met: 'seen', merged_into: 'folded_into' },
    fields: [
      { id: 'full_name', type: 'text', required: true },
      { id: 'mail', type: 'email', unique: true, index: true },
      { id: 'accounts', type: 'list', of: 'text' },
      { id: 'seen', type: 'list', of: 'text' },
      { id: 'folded_into', type: 'ref', to: 'contacts' },
    ],
  } as never,
};

test('ruling 439: a member who reads a list whose role meets people reads the names of who is here', { todo: 'SHL-A05 builds it' }, async () => {
  const { api, sql } = await record(CONTACTS);
  value(await api.invite({ person: 'p_bo', name: 'Bo Lindqvist', level: 'read' } as never, owner));
  const held = api.kernel.access('p_bo')!;
  const bo: CallContext = { principal: { kind: 'person', id: 'p_bo', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  const boot = value<Boot>(await api.boot(bo));
  assert.equal(boot.names?.p_bo, 'Bo Lindqvist', 'a member who reads Contacts was told "Someone on this record"');
  sql.close();
});

/* ── 440 · the eighth via ───────────────────────────────────────────────── */

test('ruling 440: the eighth via, pull, is kept and named, and its seven fixtures say it', () => {
  const spec = read('docs/40-SPEC-FIXTURES.md');
  assert.match(spec, /^\| `pull` \| 7 \|/mu, 'the via table no longer names pull with its seven codes');
  const pulled = readdirSync(`${ROOT}fixtures/refusals`).filter((f) => /^via:\s*pull\s*$/mu.test(read(`fixtures/refusals/${f}`)));
  assert.equal(pulled.length, 7, `${pulled.length} fixtures are driven by pull`);
});

/* ── 285 and 305 · the two lists of calls ───────────────────────────────── */

/** The lines of one table under a `### 9.x` heading of the rulings page, each split into its cells. */
const tableUnder = (heading: string): string[][] => {
  const page = read('docs/04-PACKS.md');
  const at = page.indexOf(heading);
  assert.ok(at >= 0, `the rulings page has no "${heading}"`);
  const rest = page.slice(at + heading.length);
  const end = rest.search(/^#{2,3} /mu);
  return (end < 0 ? rest : rest.slice(0, end))
    .split('\n')
    .filter((l) => /^\| \d+ \|/u.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
};
const ticked = (cell: string): string[] => [...cell.matchAll(/`([^`]+)`/gu)].map((m) => m[1]!);

/** Every source file under the apps' and packages' `src`, tests left out, for the word a cut thing would still leave. */
const sources = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(`${ROOT}${dir}`, { withFileTypes: true })) {
      const at = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== 'dist') walk(at);
      } else if (/\.(ts|mjs|js|svelte)$/u.test(e.name) && !/\.test\./u.test(e.name)) out.push(at);
    }
  };
  for (const top of ['apps', 'packages'])
    for (const e of readdirSync(`${ROOT}${top}`, { withFileTypes: true })) if (e.isDirectory() && existsSync(`${ROOT}${top}/${e.name}/src`)) walk(`${top}/${e.name}/src`);
  return out;
};

test('ruling 285: each of the eight overbuilt things is kept where the page says, or cut from every source folder', () => {
  const lines = tableUnder('### 9.1 · The eight overbuilt things (ruling 285)');
  assert.deepEqual(lines.map((l) => l[0]), ['1', '2', '3', '4', '5', '6', '7', '8']);
  let files: string[] | null = null;
  for (const [n, thing, call, why, where] of lines) {
    assert.ok(call === 'kept' || call === 'cut', `${n} ${thing} is "${call}", neither kept nor cut`);
    assert.ok((why ?? '').length > 20, `${n} ${thing} has no reason`);
    const named = ticked(where ?? '');
    assert.ok(named.length > 0, `${n} ${thing} names nowhere`);
    if (call === 'kept') for (const path of named) assert.ok(existsSync(`${ROOT}${path}`), `${thing} is kept at ${path}, which is not there`);
    else {
      files ??= sources();
      for (const word of named) {
        const still: string | undefined = files.find((f) => read(f).includes(word));
        assert.equal(still, undefined, `${thing} is cut, and ${still} still holds ${word}`);
      }
    }
  }
});

test('ruling 305: each of the twelve module questions is confirmed or replaced, and the replaced ones say by what', () => {
  const lines = tableUnder('### 9.2 · The twelve module questions (ruling 305)');
  assert.deepEqual(lines.map((l) => l[0]), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
  for (const [n, , call, ruling] of lines) {
    assert.match(call ?? '', /^(confirmed|replaced later|replaced by ruling \d+)$/u, `question ${n} is "${call}"`);
    assert.ok((ruling ?? '').length > 10, `question ${n} has no ruling`);
  }
  const call = (n: string) => lines.find((l) => l[0] === n)?.[2];
  /* THE THREE LATER WORDS: the demo went, and a model joined the first run, each by a later decision; one by a ruling. */
  assert.equal(call('11'), 'replaced later');
  assert.equal(call('8'), 'replaced later');
  assert.equal(call('6'), 'replaced by ruling 304');
  /* AND TWO CONFIRMED CALLS THE CODE CAN SHOW: the icons are Lucide's, credited, and nothing draws a frame from another site. */
  assert.match(read('packages/render/src/glyphs/set.ts'), /Lucide, ISC License/u);
  /* EVERY FRAME IS THE HOST'S DRAWN FRAME (a drawn component's, a visual's): it runs code the record keeps, in a sandbox, in
     the host's own frame document, and loads nothing from another site. */
  const host = (t: string) => [...t.matchAll(/<iframe\b[^>]*>/gu)].every((m) => m[0].includes('src={SRC}') && m[0].includes('sandbox="allow-scripts"')) && t.includes('const SRC = `${BASE}/drawn-frame`;');
  /* AND A PDF IN THE BROWSER'S OWN VIEWER, from a `blob:` the app made of the record's own bytes with that type and no other: from no other site, and no page. */
  const pdf = (t: string) => {
    const frames = [...t.matchAll(/<iframe\b[^>]*>/gu)].filter((m) => !(m[0].includes('src={SRC}') && m[0].includes('sandbox="allow-scripts"')));
    return frames.every((m) => m[0].includes('src={pdf}')) && t.includes("new Blob([bytes], { type: 'application/pdf' })");
  };
  const framed = sources().filter((f) => (f.startsWith('apps/web/') || f.startsWith('packages/render/')) && read(f).includes('<iframe') && !host(read(f)) && !pdf(read(f)));
  assert.deepEqual(framed, [], 'an outside embed is drawn in a frame');
});
