/**
 * A field added to a list at run time, from the row page, and whether the screens then draw it (DIRECTION §22).
 *
 * THE HALF THAT MATTERS IS AT THE BOTTOM. `loop/research-shell-audit.md` finding 3: `learn` in `remote.ts` returned
 * early for any list this build ships, and `page-live.ts` skipped its `schema` call on the same test, so a field added
 * to Projects on the record reached no row, no form and no page block. The owner's own example is a `domain` on a
 * project, and `things` is the list the build ships as Projects, so that is the case driven here.
 *
 * AGAINST A REAL KERNEL over `node:sqlite`. Only the HTTP envelope is written here, as `row-live.test.ts` writes it and
 * for its reason: `@braindog/record` is not a dependency of this app. `propose` and `decide` call the kernel's own, and
 * an accepted change is installed against the version the kernel hands back, which is the three lines the record's
 * `decide` adds on top (`packages/record/src/index.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';

import { display, readableFields, REGISTERS } from './api.ts';
import { ADDABLE, addField, additionOf, fieldOf, idOf } from './field-write.ts';
import { pageReader } from './page-live.ts';
import { rowReader, type Fetch } from './row-live.ts';
import { FIELD_TYPES, type RegisterDecl } from './schema.ts';

const BASE = 'http://record.test';
const CLOCK = Date.UTC(2026, 8, 22, 9);

/* THE BUILD'S OWN PROJECTS, as it was before any test here ran, so each test starts from the bundle and not from what
   the one before it learnt. `REGISTERS` is one table for the whole process. */
const BUNDLED: RegisterDecl = REGISTERS.things!;
const fresh = () => {
  REGISTERS.things = BUNDLED;
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return sql as unknown as Parameters<typeof openRecord>[0];
}

/** A record holding the build's own Projects list, word for word, with one project in it. */
async function projects(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => CLOCK });
  /* THE LIST AS THE SEED DECLARES IT, less the two keys that name other lists this bare record does not hold. */
  const { scopes: _scopes, pack: _pack, ...body } = JSON.parse(JSON.stringify(BUNDLED)) as Record<string, unknown>;
  const fields = (body.fields as { id: string }[]).filter((f) => f.id !== 'repos' && f.id !== 'folders');
  const put = await k.install([{ id: 'register.things', kind: 'register', body: { ...body, fields } } as never]);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(k.create('things', { name: 'Kiln', lane: 'building' }, { actor: 'p_1' }).ok);
  return k;
}

/** The record's routes this file needs, over the real kernel, and every method asked in order. */
function served(k: Kernel, page?: unknown): { io: Fetch; asked: string[] } {
  const asked: string[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const at = new URL(String(url));
    const method = at.pathname.slice('/api/'.length);
    asked.push(method);
    const args = (init?.body ? JSON.parse(String(init.body)) : Object.fromEntries(at.searchParams)) as Record<string, unknown>;
    const register = String(args.register ?? '');
    const answer = (out: { ok: boolean }) => json(out.ok ? 200 : 'conflict' in out ? 409 : 400, out);
    if (method === 'schema') {
      const decl = k.register(register);
      return decl ? json(200, { ok: true, value: decl }) : json(404, { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.` } });
    }
    if (method === 'get') return json(200, { ok: true, value: k.get({ register, seq: Number(args.seq) }) });
    if (method === 'list') return answer(k.list({ register, limit: Number(args.limit ?? 50) } as never) as { ok: boolean });
    if (method === 'page' && page) return json(200, { ok: true, value: page });
    if (method === 'propose') return answer(k.propose(args as never, 'p_1'));
    if (method === 'decide') {
      const out = k.decide(String(args.id), args as never, 'p_1');
      if (!out.ok || !out.value.install) return answer(out);
      const put = await k.install([out.value.install as never], out.value.expect, { actor: 'p_1' });
      if (!put.ok) k.reopen(out.value.suggestion);
      return answer(put.ok ? out : put);
    }
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  }) as Fetch;
  return { io, asked };
}

const ids = (register: string) => readableFields(register).map((f) => f.id);

/* ── the body, before anything is sent ── */

test('A NAME BECOMES THE ID THE RECORD KEEPS, and one with no letter to spell an id with is refused', () => {
  assert.equal(idOf('Domain'), 'domain');
  assert.equal(idOf('  Next review!  '), 'next_review');
  assert.equal(idOf('Café hours'), 'cafe_hours');
  /* AN ACCENT INSIDE A WORD IS DROPPED, NOT A BREAK IN IT: `Résumé` was kept as `re_sume` and `Naïve date` as
     `nai_ve_date`, because the accent NFKD splits off was treated as punctuation. `Café` passed only because its
     accent sits beside a space. */
  assert.equal(idOf('Résumé'), 'resume');
  assert.equal(idOf('Naïve date'), 'naive_date');
  assert.equal(idOf('2nd owner'), null);
  assert.equal(idOf('موقع'), null);
  assert.equal(idOf('a'.repeat(40)), 'a'.repeat(32));
});

test('ONLY KINDS SCHEMA NAMES ARE OFFERED, and a field the list has already is refused before anything is sent', () => {
  for (const kind of ADDABLE) assert.ok((FIELD_TYPES as readonly string[]).includes(kind), kind);
  fresh();
  const taken = fieldOf('things', 'Name', 'text');
  assert.equal(taken.ok, false);
  assert.match(taken.ok ? '' : taken.fix, /already has a field called Name/);
  assert.equal(fieldOf('things', 'Owner', 'ref').ok, false, 'a link with no list to point at was offered');
  assert.equal(fieldOf('things', 'Budget', 'money').ok, false, 'an amount with no currency was offered');
  assert.equal(fieldOf('things', ' ', 'text').ok, false);

  const asked = fieldOf('things', 'Domain', 'url');
  assert.ok(asked.ok);
  /* ONE FIELD AND NOTHING ELSE: the body names no field the list has, so it can take nothing away. */
  assert.deepEqual(additionOf('things', asked.field), {
    declaration_id: 'register.things',
    to: { add: { register: 'things', fields: [{ id: 'domain', label: 'Domain', type: 'url' }] } },
  });
});

test('EVERY KIND OFFERED INSTALLS through the addition path, one field each, onto a list with rows', async () => {
  fresh();
  const k = await projects();
  const { io } = served(k);
  for (const kind of ADDABLE) {
    const out = await addField(BASE, 'things', { id: `x_${kind}`, label: `X ${kind}`, type: kind }, true, io);
    assert.deepEqual(out, { from: 'added' }, `${kind}: ${JSON.stringify(out)}`);
  }
  const live = (k.register('things') as { fields: readonly { id: string }[] }).fields.map((f) => f.id);
  for (const kind of ADDABLE) assert.ok(live.includes(`x_${kind}`), `${kind} is not on the list`);
  fresh();
});

test('SOMEBODY WHO IS NOT AN OWNER FILES IT, and the list does not change until an owner accepts', async () => {
  fresh();
  const k = await projects();
  const { io, asked } = served(k);
  const out = await addField(BASE, 'things', { id: 'domain', label: 'Domain', type: 'url' }, false, io);
  assert.equal(out.from, 'filed');
  assert.deepEqual(asked, ['propose'], 'a member accepted their own field');
  assert.ok(!(k.register('things') as { fields: readonly { id: string }[] }).fields.some((f) => f.id === 'domain'));
  fresh();
});

/* ── and then every screen has it, with no further code ── */

/** Projects on the record with `launched` added by its owner, and one project holding a day in it. */
async function launched(): Promise<Kernel> {
  const k = await projects();
  assert.deepEqual(await addField(BASE, 'things', { id: 'launched', label: 'Launched', type: 'day' }, true, served(k).io), { from: 'added' });
  assert.ok(k.update('things', 'things#1', { launched: '2026-09-01' }, { actor: 'p_1', version: 1 }).ok);
  return k;
}

test('THE OWNER WHO ADDS A FIELD HAS IT IN THIS TAB AT ONCE, which is what RowForm and the row page draw', async () => {
  fresh();
  assert.ok(!ids('things').includes('launched'));
  await launched();
  assert.ok(ids('things').includes('launched'), `this tab did not learn the field it added: ${ids('things').join(', ')}`);
  fresh();
});

test('A ROW READ IN ANOTHER TAB HAS THE FIELD, typed as the record declares it, on a list the build ships', async () => {
  const k = await launched();
  /* A TAB THAT NEVER PRESSED ANYTHING holds the bundle, and reads the row. */
  fresh();
  const row = await rowReader(BASE, served(k).io).read('things', 1);
  assert.ok(row.from === 'live' && row.entry, JSON.stringify(row));
  assert.equal(row.entry.fields.launched, '2026-09-01');
  assert.ok(ids('things').includes('launched'), `the row page reads the list as the build shipped it: ${ids('things').join(', ')}`);
  /* TYPED, NOT ONLY LISTED: a day is drawn as a day, where a field `display` does not know is drawn as the raw text. */
  assert.notEqual(display('things', 'launched', '2026-09-01', CLOCK), '2026-09-01');
  /* AND WHAT THE BUILD SHIPS IS NOT LOST: the list is still Projects, with its own words. */
  assert.equal(REGISTERS.things!.name, 'Projects');
  assert.equal(REGISTERS.things!.one, 'project');
  fresh();
});

test('A PAGE OVER THE LIST, OPENED FIRST IN A TAB, ASKS THE RECORD ABOUT IT and has the field', async () => {
  const k = await launched();
  fresh();
  const answer = {
    page: 'portfolio',
    title: 'Portfolio',
    blocks: [{ kind: 'table', source: 'register.things', columns: [{ field: 'name' }, { field: 'launched' }], rows: [], matched: 0, refusals: [] }],
  };
  const paged = served(k, answer);
  const out = await pageReader(BASE, paged.io, () => CLOCK).read('portfolio');
  assert.equal(out.from, 'live', JSON.stringify(out));
  assert.ok(paged.asked.includes('schema'), `the page never asked the record about Projects: ${paged.asked.join(', ')}`);
  assert.ok(ids('things').includes('launched'), `the page reads the list as the build shipped it: ${ids('things').join(', ')}`);
  fresh();
});

test('A RECORD THAT WILL NOT SAY LEAVES THE BUILD’S OWN LIST WHERE IT WAS', async () => {
  fresh();
  const io = (async () => json(404, { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'There is no register called things.' } })) as Fetch;
  const { learn } = await import('./remote.ts');
  const { createClient } = await import('@braindog/client');
  await learn(createClient({ base: BASE, fetch: io }).schema, 'things', new Map());
  assert.equal(REGISTERS.things, BUNDLED);
});
