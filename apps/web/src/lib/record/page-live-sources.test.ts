/**
 * THE TWO COMPUTED SOURCES THE WEB COULD NOT DRAW (integrate-41-42 A22): `handoffs.open`, the steps runs left, and
 * `signs`, the record's vital signs. `registerOf` knew only sessions, inputs and lists, so both fell to the line saying
 * the block cannot be drawn, and Health, which is three cards blocks over `signs`, drew that line three times.
 *
 * Each test fails by itself on that code: the block came back with `cannot` set and no rows.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, quietSign } from '@braindog/kernel';
import { NOW, PAGES, installSeed } from '@braindog/seed';

import './fixtures/fill.ts';
import { answeredTypes, blockOf, pageReader, runsNamed, type Fetch } from './page-live.ts';
import { toSegments } from './blocks.ts';
/* TWO OF `fixtures/names.ts`'s invented projects, written here: a file under `src/` may not reach out of `apps/web` by a
   relative path (`graph`, 31 §3 layer 3), and the names file is no package to import. */
const PROJECTS = ['Lanternfish', 'Copperleaf'] as const;

const AT = Date.parse('2026-10-09T12:00:00.000Z');
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u;
const HANDLE = /\bS\d+\b/u;
const ULID = /\b[0-9A-HJKMNP-TV-Z]{26}\b/u;
const RUN = { agent: 'claude', client: 'Claude Code', started: '2026-10-06T19:00:00.000Z', state: 'done' };

const cellsOf = (b: { rows: { cells: (string | null)[] }[] }): string[] => b.rows.flatMap((r) => r.cells).filter((c): c is string => c !== null);

/* ── handoffs.open ──────────────────────────────────────────────────────── */

const step = (id: string, run: string, agent: string, next: string, mark: 'next' | 'earlier') => ({
  id,
  register: 'session',
  seq: null,
  fields: { run, agent, next, left_at: '2026-10-09T08:00:00.000Z', mark, project: `things#${run === 'S731' ? 1 : 2}` },
  state: 'handoff',
  version: 1,
  created_at: '2026-10-09T08:00:00.000Z',
  updated_at: '2026-10-09T08:00:00.000Z',
  deleted_at: null,
});

const handoffs = (types?: Record<string, string>) => ({
  kind: 'cards',
  heading: 'Left for the next run',
  source: 'handoffs.open',
  columns: [
    { field: 'next', as: 'title' },
    { field: 'run', label: 'Left by', as: 'who' },
    { field: 'left_at', label: 'Left', as: 'when' },
    { field: 'mark', label: 'Mark', as: 'fact' },
  ],
  rows: [step('01JSTEPA', 'S731', 'Claude Code', 'Wire the rates page', 'next'), step('01JSTEPB', 'S740', 'Codex', `Check the ${PROJECTS[1]} refund hook`, 'earlier')],
  matched: 2,
  refusals: [],
  scopes: [PROJECTS[0], PROJECTS[1]],
  ...(types ? { types } : {}),
});

test('a handoffs.open card is drawn: the step, the run by its app and day, the time in words, and the mark as words', () => {
  const runs = new Map([['S731', RUN]]);
  const block = blockOf(handoffs({ run: 'run', agent: 'text', next: 'text', left_at: 'instant', mark: 'enum' }) as never, new Map(), AT, null, new Map(), runs);
  assert.equal(block.cannot, undefined, 'it said it cannot be drawn');
  assert.equal(block.register, 'handoffs.open');
  assert.equal(block.shown, 2);
  const cells = cellsOf(block);
  assert.ok(cells.includes('Wire the rates page'), cells.join(' | '));
  assert.ok(cells.includes('[Claude Code, 6 Oct](/r/session/731)'), cells.join(' | '));
  assert.ok(cells.includes('[Codex](/r/session/740)'), `a run the page could not read is its agent: ${cells.join(' | ')}`);
  assert.ok(cells.includes('Next') && cells.includes('Left earlier'), cells.join(' | '));
  assert.ok(!cells.some((c) => ISO.test(c) || /^S\d+$/u.test(c) || ULID.test(c)), cells.join(' | '));
  assert.deepEqual(block.rows.map((r) => r.key), ['handoff:01JSTEPA', 'handoff:01JSTEPB']);
  assert.deepEqual(block.rows.map((r) => r.href), ['/r/session/731', '/r/session/740'], 'a step opens the run that left it');
  assert.deepEqual(block.runFaces, [{ run: 'S731', agent: 'claude', live: 'stopped', presence: 'before' }, null]);
  const drawn = JSON.stringify(toSegments(block as never));
  assert.ok(drawn.includes('Wire the rates page') && drawn.includes('Left earlier'), drawn.slice(0, 400));
});

test('a record that answered no types still draws the steps, by the source’s own', () => {
  assert.deepEqual(answeredTypes({ source: 'handoffs.open' })?.left_at, 'instant');
  const block = blockOf(handoffs() as never, new Map(), AT, null, new Map(), new Map());
  assert.equal(block.cannot, undefined);
  const cells = cellsOf(block);
  assert.ok(!cells.some((c) => ISO.test(c) || HANDLE.test(c.replace(/\(\/r\/session\/\d+\)/u, ''))), cells.join(' | '));
});

test('the reader asks the record once for each run a step names', async () => {
  assert.deepEqual(runsNamed(handoffs({ run: 'run' }) as never), ['S731', 'S740']);
  const sent: string[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = new URL(String(url)).pathname.split('/').pop() ?? '';
    sent.push(method);
    const asked = `${String(url)} ${typeof init?.body === 'string' ? init.body : ''}`;
    const body =
      method === 'page'
        ? { ok: true, value: { page: 'agents', title: 'Agents', blocks: [handoffs({ run: 'run', left_at: 'instant' })] } }
        : method === 'get' && asked.includes('731')
          ? { ok: true, value: { id: '01JRUN', seq: 731, register: 'session', state: 'done', fields: RUN } }
          : { ok: false, refusal: { code: 'ROW_UNKNOWN', fix: 'There is no such run here.' } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as Fetch;
  const out = await pageReader('https://brain.example/api', io, () => AT).read('agents');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal(sent.filter((m) => m === 'get').length, 2);
  assert.equal(out.page.blocks[0]!.cannot, undefined);
});

/* ── signs ──────────────────────────────────────────────────────────────── */

const sign = (id: string, name: string, state: 'red' | 'green' | 'none', said: string) => ({
  id: `sign:${id}`,
  register: 'signs',
  seq: null,
  fields: { sign: id, name, state, value: state === 'none' ? null : 3, said },
  state,
  version: 1,
  created_at: '2026-10-09T12:00:00.000Z',
  updated_at: '2026-10-09T12:00:00.000Z',
  deleted_at: null,
});

const signs = {
  kind: 'cards',
  heading: 'Needs a look',
  source: 'signs',
  columns: [
    { field: 'name', as: 'title' },
    { field: 'state', label: 'State', as: 'fact' },
    { field: 'said', as: 'reply' },
  ],
  rows: [sign('tasks-moving', 'Tasks are moving', 'red', 'No task was closed in nine days.'), sign('agents-heard', 'Agents are heard from', 'green', 'Two agents wrote today.'), sign('money-read', 'Money is read', 'none', 'Nothing to read yet.')],
  matched: 3,
  refusals: [],
};

test('a signs card is drawn: each sign by its name and its sentence, its state in words, and a red one carries the bad tone', () => {
  const block = blockOf(signs as never, new Map(), AT);
  assert.equal(block.cannot, undefined, 'it said it cannot be drawn');
  assert.equal(block.register, 'signs');
  assert.deepEqual(
    block.rows.map((r) => r.cells),
    [
      ['Tasks are moving', 'Needs a look', 'No task was closed in nine days.'],
      ['Agents are heard from', 'All good', 'Two agents wrote today.'],
      ['Money is read', 'Not checked yet', 'Nothing to read yet.'],
    ],
  );
  assert.deepEqual(block.rows.map((r) => r.key), ['sign:tasks-moving', 'sign:agents-heard', 'sign:money-read']);
  assert.deepEqual(block.rows.map((r) => r.tone), ['bad', undefined, undefined], 'red is a tone, which carries its glyph, and only red');
  assert.ok(block.rows.every((r) => r.href === undefined), 'a sign opens nothing');
  /* AND THE PAGE DRAWS IT: the cards hold each sign's name, and nothing says it cannot be drawn. */
  const drawn = JSON.stringify(toSegments(block as never));
  assert.ok(drawn.includes('Tasks are moving') && drawn.includes('Nothing to read yet.'), drawn.slice(0, 400));
  assert.deepEqual(runsNamed(signs as never), []);
});

/* ── Health on a real kernel ────────────────────────────────────────────── */

type Sql = Parameters<typeof openRecord>[0];

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
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
  } as unknown as Sql;
}

test('every sign card on the seed Health page, answered by a real kernel, is drawn, and the record’s signs are all on it', async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, JSON.stringify(out));
  const groups = ((PAGES.health?.blocks ?? []) as readonly { source?: unknown; heading?: unknown }[]).filter((b) => b.source === 'signs');
  assert.equal(groups.length, 3, 'Health is three groups of signs');
  let drawn = 0;
  for (const decl of groups) {
    const answer = k.block(decl as never);
    assert.deepEqual(answer.refusals, [], JSON.stringify(answer.refusals));
    const block = blockOf(answer as never, new Map(), NOW);
    assert.equal(block.cannot, undefined, `${String((decl as { heading?: unknown }).heading)} said it cannot be drawn`);
    assert.equal(block.rows.length, (answer.rows ?? []).length);
    const cells = cellsOf(block);
    assert.ok(!cells.some((c) => ULID.test(c) || c.includes(String.fromCharCode(0x2014))), cells.join(' | '));
    drawn += block.rows.length;
  }
  assert.ok(drawn > 0, 'a fresh record holds its signs, each under one group');
  assert.equal(drawn, (k.block({ kind: 'table', source: 'signs', columns: [{ field: 'name' }] } as never).rows ?? []).length);
});

test('a step a run left on a real kernel is drawn on a handoffs.open card, by the run’s agent and never its handle', async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await installSeed(k)).ok);
  const as = { actor: 'agent:claude', principal: { kind: 'token', token: 't_1' }, session: { client_id: 'c1', agent: 'claude', client: 'claude-code', repo: 'lanternfish' } } as never;
  assert.ok(k.create('tasks', { what: 'Draft the rates page' }, as).ok);
  const run = k.findRun({ client_id: 'c1' }, 't_1')!;
  assert.ok(k.update('session', `S${String(run.seq)}`, { next: 'Wire the rates page' }, as).ok);
  assert.ok(k.endRun(as, {}).ok);
  const answer = k.block({ kind: 'cards', source: 'handoffs.open', columns: handoffs().columns } as never);
  assert.deepEqual(answer.refusals, [], JSON.stringify(answer.refusals));
  const block = blockOf(answer as never, new Map(), NOW);
  assert.equal(block.cannot, undefined);
  const cells = cellsOf(block);
  assert.ok(cells.includes('Wire the rates page'), cells.join(' | '));
  assert.ok(cells.some((c) => c.endsWith(`(/r/session/${String(run.seq)})`)), cells.join(' | '));
  assert.ok(!cells.some((c) => ISO.test(c) || /^S\d+$/u.test(c) || ULID.test(c)), cells.join(' | '));
  assert.equal(block.rows[0]?.href, `/r/session/${String(run.seq)}`);
});

test('a reader held from the inbox is drawn the quiet sentence the record sent, and the owner the sentence as filed', async () => {
  /* THE WEB SAYS NO SIGN IN ITS OWN WORDS: the kernel tells each sign quietly before it is a row (`quietSign`), and the
     card draws `said` as it came, so a reader with no inbox reach never sees a message's words on Health. */
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await installSeed(k)).ok);
  const read = k.signs();
  assert.ok(read.ok);
  if (!read.ok) return;
  const told = read.value.signs.filter((s) => quietSign(s).said !== s.said);
  assert.ok(told.length > 0, 'a fresh record holds no sign the inbox changes the words of, so this proves nothing');
  const drawnFor = (reader?: { hold: (b: never) => never; inbox: boolean }): string[] => {
    const page = k.page('health', undefined, reader ? { reader: reader as never } : {});
    assert.ok(page.ok, JSON.stringify(page));
    if (!page.ok) return [];
    return page.value.blocks.filter((b) => b.source === 'signs').flatMap((b) => cellsOf(blockOf(b as never, new Map(), NOW)));
  };
  const held = drawnFor({ hold: (b) => b, inbox: false });
  const owner = drawnFor();
  for (const s of told) {
    assert.ok(held.includes(quietSign(s).said), `${s.name}: ${held.join(' | ')}`);
    assert.ok(!held.includes(s.said), `${s.name} told a reader held from the inbox: ${s.said}`);
    assert.ok(owner.includes(s.said), `${s.name}: ${owner.join(' | ')}`);
  }
});
