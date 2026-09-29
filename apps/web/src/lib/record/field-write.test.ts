/**
 * A field added to a list at run time, from the row page, and whether the screens then draw it.
 *
 * THE HALF THAT MATTERS IS AT THE BOTTOM. `learn` in `remote.ts` returned
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

import './fixtures/fill.ts';
import { display, readableFields, REGISTERS } from './api.ts';
import { ADDABLE, addField, additionOf, addValue, fieldOf, idOf, putBackOf, valueAdditionOf, valueOf } from './field-write.ts';
import { pageReader } from './page-live.ts';
import { rowReader, type Fetch } from './row-live.ts';
import { rowWriter } from './rows-write.ts';
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
    if (method === 'update') {
      const version = typeof args.version === 'number' ? { version: args.version } : {};
      return answer(k.update(register, `${register}#${Number(args.seq)}`, args.patch as never, { actor: 'p_1', ...version }) as { ok: boolean });
    }
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

/* ── a new value for a closed list ──────────────────────────────────── */

test('A NEW VALUE IS FILED AS AN ADDITION TO ONE CLOSED LIST, naming that value and nothing else', () => {
  /* THE PLANNED SHAPE, PLUS `declaration_id`. The plan wrote the body as `{ to: ... }` alone; `propose` refuses a
     change with no `declaration_id` (`kernel/src/govern.ts`, `missing('declaration_id')`), so the field's own body
     carries it and this one does too. */
  assert.deepEqual(valueAdditionOf('things', 'lane', 'paused'), {
    declaration_id: 'register.things',
    to: { add: { register: 'things', values: { lane: ['paused'] } } },
  });
});

test('A VALUE THE LIST HOLDS ALREADY, BY ITS SPELLING OR BY ITS LABEL, IS REFUSED BEFORE ANYTHING IS SENT', () => {
  fresh();
  assert.deepEqual(valueOf('things', 'lane', '  Paused  '), { ok: true, value: 'Paused' });
  assert.equal(valueOf('things', 'lane', 'Building').ok, false, 'a value the list holds in another case was offered');
  /* `on_track` IS READ AS "On track" everywhere a person sees it, so typing what they read is not a new value. */
  assert.equal(valueOf('things', 'health', 'on track').ok, false, 'a value typed as its label was offered');
  /* AND A LABEL THAT IS NOT THE VALUE RE-SPELLED. `on_track` folds to "on track" by itself, so the line above passed
     with the label comparison deleted (measured); a field that labels `building` as "In progress" is the case that
     comparison exists for. */
  const lane = BUNDLED.fields.find((f) => f.id === 'lane')!;
  REGISTERS.things = { ...BUNDLED, fields: BUNDLED.fields.map((f) => (f === lane ? { ...lane, labels: { building: 'In progress' } } : f)) };
  assert.equal(valueOf('things', 'lane', 'in progress').ok, false, 'a value typed as a label unlike its spelling was offered');
  fresh();
  assert.equal(valueOf('things', 'lane', '   ').ok, false);
  /* ONLY A CLOSED LIST TAKES VALUES: the kernel refuses `values` on any other field, so this does first. */
  assert.equal(valueOf('things', 'name', 'x').ok, false);
  assert.equal(valueOf('things', 'nope', 'x').ok, false);
});

test('THE OWNER ADDS A VALUE IN ONE PRESS, the record then takes it on a row, and this tab offers it', async () => {
  fresh();
  const k = await projects();
  const { io, asked } = served(k);
  assert.deepEqual(await addValue(BASE, 'things', 'lane', 'paused', true, io), { from: 'added' });
  assert.deepEqual(asked.slice(0, 2), ['propose', 'decide']);
  const lane = (k.register('things') as unknown as { fields: readonly { id: string; values?: readonly string[] }[] }).fields.find((f) => f.id === 'lane');
  assert.deepEqual(lane?.values?.slice(-1), ['paused']);
  assert.ok(k.update('things', 'things#1', { lane: 'paused' }, { actor: 'p_1', version: 1 }).ok, 'the record still refuses the value');
  /* AND THE EDITOR'S MENU, which reads `REGISTERS`, has it with no reload. */
  assert.ok(REGISTERS.things!.fields.find((f) => f.id === 'lane')?.values?.includes('paused'), 'this tab did not learn the value it added');
  fresh();
});

test('SOMEBODY WHO IS NOT AN OWNER FILES THE VALUE, and the list refuses it until an owner accepts', async () => {
  fresh();
  const k = await projects();
  const { io, asked } = served(k);
  const out = await addValue(BASE, 'things', 'lane', 'paused', false, io);
  assert.equal(out.from, 'filed');
  assert.deepEqual(asked, ['propose'], 'a member accepted their own value');
  assert.equal(k.update('things', 'things#1', { lane: 'paused' }, { actor: 'p_1', version: 1 }).ok, false);
  fresh();
});

/* ── Put back after an edit on the row page ── */

test('PUT BACK IS THE FIELD AS IT WAS, an unset one included, and names only what the edit touched', () => {
  assert.deepEqual(putBackOf({ lane: 'building', due: null, name: 'Kiln' }, { lane: 'earning' }), { lane: 'building' });
  /* A FIELD THE ROW DID NOT CARRY GOES BACK AS `null`, which is how the record is told to drop it; `undefined` would
     be left out of the JSON and the edit would stand. */
  assert.deepEqual(putBackOf({ name: 'Kiln' }, { launched: '2026-09-01' }), { launched: null });
});

test('AN EDIT PUT BACK AT THE VERSION IT ANSWERED LEAVES THE ROW AS IT WAS, and a second tab’s write is not overwritten', async () => {
  fresh();
  const k = await projects();
  const writer = rowWriter(BASE, served(k).io);
  const read = await rowReader(BASE, served(k).io).read('things', 1);
  assert.ok(read.from === 'live' && read.entry);
  const before = read.entry;

  const edit = { lane: 'earning' };
  const saved = await writer.update('things', 1, edit, before.version);
  assert.ok(saved.ok, JSON.stringify(saved));
  const back = await writer.update('things', 1, putBackOf(before.fields, edit), saved.entry.version);
  assert.ok(back.ok, JSON.stringify(back));
  assert.equal(back.entry.fields.lane, 'building');

  /* HELD TO THE ANSWERED VERSION: once somebody else has written since, the put back is a conflict and not a quiet
     revert of their change. */
  const again = await writer.update('things', 1, edit, back.entry.version);
  assert.ok(again.ok);
  assert.ok(k.update('things', 'things#1', { lane: 'parked' }, { actor: 'p_2', version: again.entry.version }).ok);
  const late = await writer.update('things', 1, putBackOf(back.entry.fields, edit), again.entry.version);
  assert.equal(late.ok, false);
  assert.equal(late.ok ? '' : late.why, 'conflict');
  assert.equal(k.get({ register: 'things', seq: 1 })?.fields.lane, 'parked');
  fresh();
});

test('THE ROW PAGE’S SAVED EDIT CARRIES ITS PUT BACK, and the enum editor offers a value the list does not hold', async () => {
  /* A SOURCE SWEEP, because a Svelte page does not mount under `node --test` (`lead.ts` says the same). It holds the
     one receipt a saved edit or title edit lands with, which had no way back, and the one editor that could not take a
     value the list lacks. */
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../routes/r/[register]/[seq]/+page.svelte', import.meta.url), 'utf8');
  const saved = src.split('toasts.push(copy.writeMarkSaved').slice(1);
  assert.ok(saved.length > 0, 'the saved edit no longer lands with a receipt');
  for (const rest of saved) assert.match(rest.slice(0, rest.indexOf(');') + 2), /undo:/u, 'a saved edit lands with no Put back');
  assert.match(src, /<AddValue\b/u, 'the enum editor has no way to add a value');
});
