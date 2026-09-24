/**
 * Which source the register screen reads, and what it keeps between reads.
 *
 * WHY THIS FILE COMPILES ITS IMPORTS, AND WHAT THAT IS NOT. `record.ts` imports `ui/screen.svelte.ts`,
 * which evaluates `$state` at module scope. A rune is a compiler macro with no runtime binding, so
 * importing that module under a plain `node --test` fails with `ReferenceError: $state is not
 * defined`. It is not that the runner cannot load a `.svelte.ts` file: Node strips the types itself
 * and several such modules are tested here already. It is the evaluation at load time that has to be
 * compiled away. `registerHooks` hands each one to `compileModule` on the way in, which is the
 * technique `packages/render/src/parity.test.ts` proved.
 *
 * WHAT `generate: 'server'` LEAVES UNCOVERED, STATED SO NOBODY READS MORE INTO A GREEN RUN THAN IS
 * THERE. Compiled for the server, `$state({ ... })` becomes a plain object literal and an assignment
 * to a field is an assignment and nothing more. Every counter in `screen.svelte.ts` therefore holds
 * the right VALUE here, and none of it is reactive. Nothing below proves that a browser re-renders
 * when `pending` changes, that `data-screen` appears on `#main`, or that an effect ever runs. A rune
 * that had quietly stopped being reactive would pass every test in this file. The reactivity is the
 * browser gates' claim to make; the logic is this file's.
 *
 * THE HOOK STAYS IN THIS FILE. It costs this one process the Svelte compiler, which is a second or
 * so, and it is not a decision about what `node --test` means for the rest of the app.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileModule } from 'svelte/compiler';

import { REGISTERS } from '../record/api.ts';
import { forget } from '../record/boot-live.ts';
import type { Ask, Refusal, Said } from './record.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

/* AFTER THE HOOK, AND THAT IS WHY IT IS DYNAMIC. A static import is evaluated before this file's body
   runs, so the module would load before the hook that makes it loadable was registered. */
const { open, read } = await import('./record.ts');
const screen = await import('../ui/screen.svelte.ts');

const BASE = 'http://record.test';

/* THE TAB'S OWN ORIGIN, which is the only thing `open` reads off `location`. */
globalThis.location = { origin: BASE } as unknown as Location;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Every request this tab made, in order: the method's name and the query it carried. */
const sent: { name: string; params: URLSearchParams }[] = [];

/** What the host answers. `null` is a host that cannot be reached at all. */
let host: ((name: string, params: URLSearchParams) => Response) | null = null;

globalThis.fetch = (async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(String(input));
  const name = url.pathname.replace(/^\/api\//u, '');
  sent.push({ name, params: url.searchParams });
  if (!host) throw new TypeError('fetch failed');
  return host(name, url.searchParams);
}) as typeof fetch;

/** How many times a method was asked, for one register or across all of them. */
const asked = (name: string, register?: string): number =>
  sent.filter((r) => r.name === name && (register === undefined || r.params.get('register') === register)).length;

/** A fresh tab: the shell has asked nothing, and nothing is kept from the test before. */
function tab(answer: ((name: string, params: URLSearchParams) => Response) | null): void {
  forget();
  sent.length = 0;
  host = answer;
}

/** The value an answer carried, or a failure naming the refusal the screen would have drawn instead. */
function value<T>(out: Said<T>, what: string): T {
  if (!out.ok) assert.fail(`${what} was refused: ${out.refusal.code}, ${out.refusal.fix}`);
  return out.value;
}

/** The refusal an answer carried, where a refusal is what is being asserted. Whatever it would have
    answered is not read, so the four calls on a `Source` can be walked as one list. */
function refused(out: Said<unknown>, what: string): Refusal {
  if (out.ok) assert.fail(`${what} answered instead of refusing`);
  return out.refusal;
}

const EMPTY: Ask = { filters: [], q: '' };

/* ── the record, as one would answer ─────────────────────────────────────── */

/** Obviously not a real identifier, and long enough to be one. */
const ulid = (n: number): string => `01J${String(n).padStart(23, '0')}`;

const row = (id: string, seq: number, fields: Record<string, unknown>) => ({
  id,
  seq,
  fields,
  version: 3,
  created_at: '2026-09-01T09:00:00.000Z',
});

const AMARA = ulid(1);
const BEN = ulid(2);
const KILN = ulid(11);

/* `people` HOLDS TWO PAGES, so the walk that builds the ref map is a walk and not one request. */
const PEOPLE = [row(AMARA, 1, { name: 'Amara Lee' }), row(BEN, 2, { name: 'Ben Okoro' })];
const THINGS = [row(KILN, 4, { name: 'Kiln' })];
const OBLIGATIONS = [row(ulid(21), 7, { what: 'Invoice 2026-041', party: AMARA, thing: KILN, state: 'open' })];

const BOOT = {
  registers: [{ id: 'obligations', name: 'Obligations', count: 1 }],
  now: '2026-09-16T12:00:00.000Z',
  record: { slug: 'the-studio', name: 'The Studio', locale: 'en' },
};

const page = (rows: unknown[], cursor: string | null, matched = rows.length) => json(200, { ok: true, value: { rows, matched, cursor } });

/**
 * A record that answers: `boot`, a declaration, and `list` for the three registers in play.
 *
 * `people` ANSWERS A CURSOR FIRST, so a reader of this file can see that the map is built from a
 * whole walk rather than from whatever the first page happened to hold.
 */
function record(name: string, params: URLSearchParams): Response {
  if (name === 'boot') return json(200, { ok: true, value: BOOT });
  if (name === 'schema') return json(200, { ok: true, value: REGISTERS[params.get('register') ?? ''] });
  if (name === 'list') {
    const register = params.get('register');
    if (register === 'people') return params.get('cursor') === null ? page([PEOPLE[0]], 'after-1', 2) : page([PEOPLE[1]], null, 2);
    if (register === 'things') return page(THINGS, null);
    if (register === 'obligations') return page(OBLIGATIONS, null, 38);
  }
  return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `Nothing here answers ${name}.` } });
}

/* ── 1. the record, or its refusal ───────────────────────────────────────── */

test('a record that answers boot is the source, and boot is not asked a second time to say so', async () => {
  tab(record);
  const source = await open();
  assert.equal(source.sample, false);
  assert.deepEqual(value(await source.boot(), 'boot'), BOOT, 'the screen re-asked rather than reading the answer the shell already had');
  assert.equal(asked('boot'), 1);
});

for (const [what, answer, code] of [
  ['nothing answers at all', null, 'UNREACHABLE'],
  ['a static host serves its fallback page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 }), 'UNREACHABLE'],
  ['the record says UNAUTHORIZED', () => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } }), 'UNAUTHORIZED'],
] as const) {
  test(`${what}: there is no record here, so every call repeats the refusal and the host is asked nothing more`, async () => {
    tab(answer === null ? null : () => answer());
    const source = await open();
    assert.equal(source.sample, false, 'a record that could not be read was drawn as the sample, and there is no sample any more');

    for (const [call, out] of [
      ['boot', await source.boot()],
      ['schema', await source.schema('obligations')],
      ['page', await source.page('obligations', EMPTY, null)],
      ['count', await source.count('obligations', EMPTY)],
    ] as const) {
      assert.equal(refused(out, call).code, code, `${call} answered with a different code from the one boot gave`);
    }

    assert.equal(sent.length, 1, 'a refused screen went on asking the record');
    assert.equal(sent[0]?.name, 'boot');
  });
}

test('any other refusal is the record’s own answer, and every call on the screen repeats it rather than guessing', async () => {
  tab(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Ask the owner for access.' } }));
  const source = await open();
  assert.equal(source.sample, false, 'a record that refused was drawn as the sample, which is a claim about someone else’s data');

  for (const [what, out] of [
    ['boot', await source.boot()],
    ['schema', await source.schema('obligations')],
    ['page', await source.page('obligations', EMPTY, null)],
    ['count', await source.count('obligations', EMPTY)],
  ] as const) {
    const r = refused(out, what);
    assert.equal(r.code, 'FORBIDDEN', `${what} answered with a different code from the one boot gave`);
    assert.equal(r.fix, 'Ask the owner for access.');
  }
  assert.equal(sent.length, 1, 'a refused screen went on asking the record');
});

/* ── 2. the memo, and what its key is ────────────────────────────────────── */

test('THE SOURCE IS HELD WHILE THE SHELL’S ANSWER IS HELD, promise and all', async () => {
  tab(record);
  const first = open();
  const second = open();
  assert.equal(first, second, 'the memo handed back two promises for one answer');
  assert.equal(await first, await second);
  assert.equal(asked('boot'), 1);
});

test('and it is not rebuilt merely because the record changed its mind underneath', async () => {
  tab(record);
  const held = await open();
  assert.equal(held.sample, false);

  /* The record now refuses, and nothing has told this tab so. */
  host = () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Ask the owner for access.' } });
  assert.equal(await open(), held, 'the memo rebuilt on its own, so it is paying for the walk again on every read');
  assert.equal(asked('boot'), 1);
});

/**
 * THE TEST THE REPAIR WAS MADE FOR.
 *
 * The memo is keyed on the identity of `readBoot`'s promise, so `forget()` clears it without knowing
 * it exists. A tab that read one answer once used to go on drawing it on `/r/<register>` for as long
 * as it was open, even after the record had answered something else.
 *
 * IT WOULD FAIL AGAIN IF THE KEY WENT BACK TO A BOOLEAN. `chosen !== null`, a `built` flag or any
 * module-level latch is true for the rest of the tab's life, so `open` would hand back the source
 * below and `after.boot()` would still answer. The assertion on identity fails first, which is the
 * same fault said more precisely. The test above is the other half of the pin: together they allow
 * exactly one rebuild, the one the shell asked for.
 */
test('A WRITE FORGETS THE SHELL’S ANSWER, AND THE NEXT READ ARRIVES SOMEWHERE ELSE', async () => {
  tab(record);
  const before = await open();
  assert.deepEqual(value(await before.boot(), 'boot'), BOOT);

  forget();
  host = () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Ask the owner for access.' } });

  const after = await open();
  assert.notEqual(after, before, 'the memo survived the forget, so this tab is still drawing an answer the record has since changed');
  assert.equal(refused(await after.boot(), 'boot').code, 'FORBIDDEN');
  assert.equal(asked('boot'), 2, 'the record was asked again, once');
});

test('a refusal is not kept by the shell either, so the next screen lands here with a different answer in hand', async () => {
  tab(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Ask the owner for access.' } }));
  const refusing = await open();
  assert.equal(refused(await refusing.boot(), 'boot').code, 'FORBIDDEN');

  host = record;
  const next = await open();
  assert.notEqual(next, refusing, 'the refusal was held for the tab, so access granted since would never be noticed');
  assert.equal(next.sample, false);
  assert.equal(asked('boot'), 2);
});

/* ── 3. what the held source avoids repeating ────────────────────────────── */

test('THE WALK THAT BUILDS THE REF MAP HAPPENS ONCE PER REGISTER, however many times the list is asked', async () => {
  tab(record);
  const source = await open();

  const first = value(await source.page('obligations', EMPTY, null), 'the first page');
  assert.equal(asked('list', 'people'), 2, 'the walk stopped at the first page of the target register');
  assert.equal(asked('list', 'things'), 1);
  assert.equal(asked('list', 'obligations'), 1);

  /* THE ROWS COME BACK IN THE NUMBERS A PERSON SAYS, which is what the walk was for. */
  assert.equal(first.entries[0]?.fields.party, 1);
  assert.equal(first.entries[0]?.fields.thing, 4);
  assert.equal(first.matched, 38);
  assert.deepEqual(
    first.names,
    new Map([
      ['people#1', 'Amara Lee'],
      ['people#2', 'Ben Okoro'],
      ['things#4', 'Kiln'],
    ]),
    'the ref names were not the ones this record holds',
  );

  await source.page('obligations', EMPTY, null);
  await source.page('obligations', { filters: [{ field: 'party', op: 'in', values: ['1'] }], q: '' }, null);
  await source.count('obligations', EMPTY);

  assert.equal(asked('list', 'people'), 2, 'every page, filter and count paid for the target register’s rows again');
  assert.equal(asked('list', 'things'), 1);
  assert.equal(asked('list', 'obligations'), 4, 'a read of the asked register was skipped');

  /* AND THE MAP IS READ IN BOTH DIRECTIONS: a ref named by its number goes out as the target's own id. */
  const filtered = sent.filter((r) => r.name === 'list' && r.params.get('register') === 'obligations')[2];
  assert.deepEqual(JSON.parse(filtered?.params.get('where') ?? 'null'), { field: 'party', is: AMARA });

  /* A COUNT IS ONE ROW, because only `matched` is read off it. */
  const counting = sent.filter((r) => r.name === 'list' && r.params.get('register') === 'obligations')[3];
  assert.equal(counting?.params.get('limit'), '1');
});

test('a declaration is read once for the tab, and the record is asked for it only the first time', async () => {
  tab(record);
  const source = await open();
  assert.equal(value(await source.schema('obligations'), 'the declaration').title, 'what');
  await source.schema('obligations');
  assert.equal(asked('schema'), 1);
  await source.schema('people');
  assert.equal(asked('schema'), 2, 'one declaration was answered for another register');
});

test('and the walk is what the memo is protecting: a rebuilt source pays for it again', async () => {
  tab(record);
  await (await open()).page('obligations', EMPTY, null);
  const before = asked('list', 'people');

  forget();
  await (await open()).page('obligations', EMPTY, null);
  assert.equal(asked('list', 'people'), before * 2, 'a source built after a forget kept the previous source’s ref maps');
});

/* ── the readiness bracket, which is the reason this file needs the compiler ─ */

test('a call is bracketed by the screen’s counters, and a screen with one still out has not settled', async () => {
  tab(record);
  screen.leaving();

  let release = (): void => {};
  const held = new Promise<void>((r) => {
    release = r;
  });
  const running = read(async () => {
    await held;
    return true;
  });
  assert.equal(screen.settled(), undefined, 'a screen said it was ready over a page whose only call was still out');
  release();
  await running;
  assert.equal(screen.settled(), 'ready');

  screen.leaving();
  await read(async () => false);
  assert.equal(screen.settled(), 'refused', 'a refusal was drawn as a settled, readable screen');

  /* THE `finally` IS LOAD-BEARING: a call that threw has still come back, and it did not answer. */
  screen.leaving();
  await assert.rejects(read(async () => Promise.reject(new Error('the host went away'))));
  assert.equal(screen.settled(), 'refused');
});

test('an answer that lands after a navigation is not counted against the screen that is there now', async () => {
  tab(record);
  screen.leaving();
  await read(async () => {
    screen.leaving();
    return false;
  });
  assert.equal(screen.settled(), undefined, 'the previous screen’s refusal was attributed to this one');
});

test('A SORTED LIST PAGES WITH THE RECORD’S CURSOR, and a later page keeps the record’s order', async () => {
  /* THE RECORD PAGES AN ORDER NOW, handing back a `~` cursor that belongs to that order. The list asks
     for the next page with the cursor and the same order, and draws the rows in the order they came. */
  /* THE RECORD ORDERS TEXT BY ITS BYTES, so `Invoice C` sorts before `invoice a`, where the reader's
     collation would put them the other way round. A page re-sorted here would swap them. */
  const B = row(ulid(22), 8, { what: 'Invoice B', party: AMARA, thing: KILN, state: 'open' });
  const A = row(ulid(23), 9, { what: 'invoice a', party: BEN, thing: KILN, state: 'open' });
  const C = row(ulid(24), 10, { what: 'Invoice C', party: BEN, thing: KILN, state: 'open' });
  tab((name, params) => {
    if (name === 'list' && params.get('register') === 'obligations') {
      if (params.get('order') === null) return json(400, { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'That cursor pages a sorted list.' } });
      return params.get('cursor') === '~next' ? page([C, A], null, 3) : page([B], '~next', 3);
    }
    return record(name, params);
  });
  const source = await open();
  const sort = { field: 'what', dir: 'asc' as const };

  const first = value(await source.page('obligations', { filters: [], q: '', sort }, null), 'the first sorted page');
  assert.equal(first.cursor, '~next', 'the sorted page dropped the record’s cursor');
  const second = value(await source.page('obligations', { filters: [], q: '', sort }, first.cursor), 'the next sorted page');

  const asks = sent.filter((r) => r.name === 'list' && r.params.get('register') === 'obligations');
  assert.equal(asks[1]?.params.get('cursor'), '~next');
  assert.deepEqual(JSON.parse(asks[1]?.params.get('order') ?? 'null'), [sort], 'the next page was not asked in the order its cursor belongs to');
  assert.equal(second.cursor, null);
  assert.deepEqual(
    [...first.entries, ...second.entries].map((e) => e.fields.what),
    ['Invoice B', 'Invoice C', 'invoice a'],
    'a later page was re-sorted on its own, so the list is no longer the record’s order',
  );
});

test("a list this build does not ship draws a link by the linked row's name, and asks the record what the linked list is", async () => {
  const declared: Record<string, unknown> = {
    rs_meetings: { id: 'rs_meetings', name: 'Meetings', title: 'what', fields: [{ id: 'what', type: 'text' }, { id: 'book', type: 'ref', to: 'rs_books' }] },
    rs_books: { id: 'rs_books', name: 'Books', title: 'name', fields: [{ id: 'name', type: 'text' }] },
  };
  const BOOK = ulid(52);
  tab((name, params) => {
    if (name === 'boot') return json(200, { ok: true, value: BOOT });
    if (name === 'schema') return json(200, { ok: true, value: declared[params.get('register') ?? ''] });
    if (name === 'list' && params.get('register') === 'rs_books') return page([row(BOOK, 2, { name: 'The Remains of the Day' })], null);
    if (name === 'list' && params.get('register') === 'rs_meetings') return page([row(ulid(61), 1, { what: 'Stevens and the dinner', book: BOOK })], null);
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `Nothing here answers ${name}.` } });
  });
  const source = await open();
  value(await source.schema('rs_meetings'), 'the declaration');
  const answer = value(await source.page('rs_meetings', EMPTY, null), 'the page');
  assert.equal(answer.entries[0]?.fields.book, 2);
  assert.equal(answer.names?.get('rs_books#2'), 'The Remains of the Day');
});
