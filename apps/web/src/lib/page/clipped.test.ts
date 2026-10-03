/**
 * A long text a page answered cut short is never saved back cut.
 *
 * THE DOCKED PANEL SAVED THE CUT OVER THE WHOLE. A page answers each text past 280 characters as its first 280 and marks
 * the row `clipped` (the kernel's `leanRows`), and the web dropped the mark, so a project's note opened in the panel on
 * its first 280 characters and Save wrote those, with the edit, over the whole note. Every case below is the real path
 * over a kernel on an in-memory SQLite: the page read the app's own way (`pageReader`), the record's `get` of the row,
 * and the write the panel sends (`rowWriter`), and what counts is what the record keeps.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { createClient } from '@braindog/client';
import { openRecord, ROW_TEXT_MOST, type Kernel } from '@braindog/kernel';

import '../record/fixtures/fill.ts';
import { currencyFor, readableFields, REGISTERS } from '../record/api.ts';
import { inverseOf, rowWriter } from '../record/rows-write.ts';
import { pageReader, type Fetch } from '../record/page-live.ts';
import type { RecordRow } from '../record/remote.ts';
import type { Entry, Fields, RegisterDecl } from '../record/schema.ts';
import { cutIn, mayBeCut, wholeOf } from './clipped.ts';
import { rowPatch } from './row-fields.ts';
import { tickBackOf } from './tick-undo.ts';

const BASE = 'http://record.test';
const CLOCK = Date.UTC(2026, 9, 3, 9);
const OWNER = { actor: 'p_1' };

/** A note well past the cut, every sentence of it different, so a cut anywhere shows. */
const NOTE = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} of the kiln plan.`).join(' ');

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

/** The build's own Projects list, a Projects page with one table over it, and one project with a long note. */
async function projects(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => CLOCK });
  const { scopes: _scopes, pack: _pack, ...body } = JSON.parse(JSON.stringify(REGISTERS.things as RegisterDecl)) as Record<string, unknown>;
  const fields = (body.fields as { id: string }[]).filter((f) => f.id !== 'repos' && f.id !== 'folders');
  const put = await k.install([
    { id: 'register.things', kind: 'register', body: { ...body, fields } } as never,
    {
      id: 'page.projects',
      kind: 'page',
      body: { page: 'projects', title: 'Projects', requires: ['register.things'], blocks: [{ kind: 'table', source: 'register.things', columns: [{ field: 'name' }] }] },
    } as never,
  ]);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(k.create('things', { name: 'Kiln', lane: 'building', note: NOTE }, OWNER).ok);
  return k;
}

/** The record's routes the panel's path asks, over the real kernel. */
function served(k: Kernel): Fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const at = new URL(String(url));
    const method = at.pathname.slice('/api/'.length);
    const args = (init?.body ? JSON.parse(String(init.body)) : Object.fromEntries(at.searchParams)) as Record<string, unknown>;
    const register = String(args.register ?? '');
    const answer = (out: { ok: boolean }) => json(out.ok ? 200 : 'conflict' in out ? 409 : 400, out);
    if (method === 'page') {
      const out = k.page(String(args.slug));
      return out.ok ? json(200, out) : json(404, out);
    }
    if (method === 'schema') {
      const decl = k.register(register);
      return decl ? json(200, { ok: true, value: decl }) : json(404, { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'No such list.' } });
    }
    if (method === 'get') return json(200, { ok: true, value: k.get({ register, seq: Number(args.seq) }) });
    if (method === 'list') return answer(k.list({ register, limit: Number(args.limit ?? 50) } as never) as { ok: boolean });
    if (method === 'update') {
      const version = typeof args.version === 'number' ? { version: args.version } : {};
      return answer(k.update(register, `${register}#${Number(args.seq)}`, args.patch as never, { ...OWNER, ...version }) as { ok: boolean });
    }
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  }) as Fetch;
}

/** The project as the Projects page hands it to the panel: the block's own entry, read the app's way. */
async function pageEntry(io: Fetch): Promise<Entry> {
  const read = await pageReader(BASE, io, () => CLOCK).read('projects');
  assert.equal(read.from, 'live', JSON.stringify(read));
  if (read.from !== 'live') throw new Error('unread');
  const e = read.page.blocks[0]?.entries?.[0];
  assert.ok(e, 'the Projects page answered no project');
  return e;
}

/** What the panel's form hands out after an edit: the row's fields, the note with a line added to its end. */
const edited = (e: Entry): Fields => ({ ...e.fields, note: `${String(e.fields.note)} Fire it on Friday.` });

const currency = (f: { id: string }) => currencyFor('things', f.id);

test("a page's cut row says so on the entry, and its note is the cut", async () => {
  const k = await projects();
  const e = await pageEntry(served(k));
  assert.equal(e.clipped, true, 'the entry dropped the mark the page answered');
  assert.equal(String(e.fields.note).length, ROW_TEXT_MOST);
  assert.ok(mayBeCut(e, 'note'));
  /* A SHORT TEXT ON THE SAME ROW WAS NEVER CUT, so a change to it is safe to put back. */
  assert.equal(mayBeCut(e, 'name'), false);
});

test('a clipped note edited in the panel keeps its full text', async () => {
  const k = await projects();
  const io = served(k);
  const cut = await pageEntry(io);

  /* THE PANEL'S PATH: the record's get of the row, the cut made whole, the edit diffed against the whole, and sent. */
  const got = await createClient({ base: BASE, fetch: io }).get('things', cut.seq);
  assert.ok(got.ok && got.value, JSON.stringify(got));
  const whole = wholeOf(cut, got.value as RecordRow);
  assert.ok(whole, 'the get answered another version of the row');
  assert.equal(whole.clipped, undefined);
  assert.equal(whole.fields.note, NOTE);

  const patch = rowPatch(edited(whole), whole, readableFields('things'), REGISTERS.things!.title, currency);
  assert.deepEqual(Object.keys(patch), ['note']);
  const out = await rowWriter(BASE, io).update('things', cut.seq, patch, whole.version);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(k.get('things#1')!.fields.note, `${NOTE} Fire it on Friday.`);

  /* THE FAULT, MEASURED: the same edit worked out from the page's cut saves 280 characters and the edit over the note. */
  const wrong = rowPatch(edited(cut), cut, readableFields('things'), REGISTERS.things!.title, currency);
  assert.ok(String(wrong.note).length < NOTE.length, 'the cut row would not have lost the note, so this proves nothing');
});

test('a row that moved on since the page read it is not made whole from that read', async () => {
  const k = await projects();
  const io = served(k);
  const cut = await pageEntry(io);
  assert.ok(k.update('things', 'things#1', { lane: 'parked' }, { ...OWNER, version: cut.version }).ok);
  const got = k.get('things#1')!;
  assert.equal(wholeOf(cut, got as unknown as RecordRow), null);
});

test('no way back worked out from a cut row puts back the cut', async () => {
  const k = await projects();
  const cut = await pageEntry(served(k));
  /* THE PANEL'S OWN UNDO, from a row the page cut: it names the note, so it is not offered (`row-host` `#change`). */
  assert.ok(cutIn(cut, inverseOf(cut, { note: 'Short now.' }, undefined)));
  /* A CHANGE OF LANE PUTS BACK THE LANE ALONE, which was never cut, so its Undo stays. */
  assert.equal(cutIn(cut, inverseOf(cut, { lane: 'parked' }, undefined)), false);
  /* A TICK'S UNDO NAMES THE STATE, never a text, so a cut row keeps it. */
  const ref = { register: 'things', seq: cut.seq, version: cut.version };
  const back = tickBackOf(ref, true, k.register('things') as never, cut);
  assert.ok(back === null || !('note' in back), JSON.stringify(back));
});

test('the panel seeds its form from the row whole and diffs Save against it', () => {
  const svelte = readFileSync(new URL('./RowPanel.svelte', import.meta.url), 'utf8');
  assert.match(svelte, /const whole = \$derived\(entry && !entry\.clipped \? entry : undefined\)/u);
  assert.match(svelte, /rowPatch\(taken, base,/u, 'Save is worked out against something other than the row whole');
  assert.doesNotMatch(svelte, /rowPatch\(taken, entry,/u, 'Save is worked out against the page\'s read, which may be cut');
  assert.match(svelte, /host\.whole\(/u, 'the panel never reads a cut row whole');
  const host = readFileSync(new URL('./row-host.svelte.ts', import.meta.url), 'utf8');
  assert.match(host, /!cutIn\(before, inverse\)/u, "the panel's Undo can put back a cut");
});
