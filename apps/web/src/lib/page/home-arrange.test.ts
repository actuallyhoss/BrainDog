/**
 * Arranging Today and Decide: which page a home arranges, the body its first Done installs, and the read the mode
 * arranges by.
 *
 * WHAT WOULD BE SILENTLY WRONG: a preview kept under the address it is drawn at (`today`, which Home never reads first,
 * where `home` is), an installed page arranged as if it were still a preview and written over whole, a body arranged by
 * places that are not its own blocks, and Put back retiring the wrong declaration.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';

import '../record/fixtures/fill.ts';
import { copy } from '../copy.ts';
import { VOICE_LINES, type VoiceKey } from '../voice.ts';
import { heldTo, holdsOf, inVoice, keptAs, previewedBody, readToArrange, unkeep, voiceOf, whileHeld } from './home-arrange.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Sent = { path: string; body: Record<string, unknown> | null };
type Io = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

function host(answer: (path: string, body: Record<string, unknown> | null) => Response): { io: Io; sent: Sent[] } {
  const sent: Sent[] = [];
  const io: Io = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    sent.push({ path, body });
    return answer(path, body);
  };
  return { io, sent };
}

test('Today is kept as the page Home reads first, and Decide as itself', () => {
  assert.deepEqual(keptAs('today', []), { id: 'home', installed: false });
  assert.deepEqual(keptAs('today', ['home']), { id: 'home', installed: true });
  assert.deepEqual(keptAs('decide', ['money']), { id: 'decide', installed: false });
  assert.deepEqual(keptAs('decide', ['decide']), { id: 'decide', installed: true });
});

test('an installed home is arranged where it is, and an address that is neither has nothing to arrange', () => {
  assert.deepEqual(keptAs('home-bakery', ['home-bakery', 'money']), { id: 'home-bakery', installed: true });
  assert.deepEqual(keptAs('home', ['home']), { id: 'home', installed: true });
  assert.equal(keptAs('somewhere', ['money']), null);
  assert.equal(keptAs('constructor', []), null, 'a key Object lends is no preview');
});

test("Today's body is built from what the shell says the record holds", () => {
  const owner = { level: 'owner', owner: true, person: 'p_1', lists: null } as never;
  assert.deepEqual(holdsOf({ lists: [{ id: 'tasks', name: 'Tasks' }], pages: ['money'], me: owner }, {}), { tasks: true, adds: true, money: true, one: 'task' });
  assert.deepEqual(holdsOf({ lists: [{ id: 'notes', name: 'Notes' }], pages: [], me: owner }, {}), { tasks: false, adds: false, money: false });
});

test("Today's line on the vital signs is drawn where the record has the Health page, and a kept Today keeps it", async () => {
  const owner = { level: 'owner', owner: true, person: 'p_1', lists: null } as never;
  const holds = holdsOf({ lists: [{ id: 'tasks', name: 'Tasks' }], pages: ['money', 'health'], me: owner }, {});
  assert.equal(holds.health, true);
  assert.equal(holdsOf({ lists: [], pages: ['money'], me: owner }, {}).health, undefined, 'no Health page, no line that links to it');
  const member = { level: 'member', owner: false, person: 'p_2', lists: null } as never;
  assert.equal(holdsOf({ lists: [], pages: ['money', 'health'], me: member }, {}).health, undefined, 'a member is not told the count of vital signs');
  const signs = (body: Awaited<ReturnType<typeof previewedBody>>) => (body?.blocks ?? []).filter((b) => b.kind === 'note' && String((b as { body?: unknown }).body).includes('(/p/health)'));
  assert.equal(signs(await previewedBody('today', holds)).length, 2, 'one note for one red sign, one for several');
  assert.equal(signs(await previewedBody('today', { tasks: true, adds: true, money: true })).length, 0);
});

test('the line a task is typed into is named by the tasks list as the record words it, and Home and the arrange mode agree', () => {
  const owner = { level: 'owner', owner: true, person: 'p_1', lists: null } as never;
  const shell = { lists: [{ id: 'tasks', name: 'Tasks' }], pages: [], me: owner };
  assert.equal(holdsOf(shell, { 'tasks:one': 'job' }).one, 'job', "the record's own word for one of them");
  assert.equal(holdsOf(shell, { tasks: 'Chores' }).one, 'chore', 'a list renamed says one of its new name');
  assert.equal(holdsOf({ ...shell, lists: [] }, { 'tasks:one': 'job' }).one, undefined, 'no tasks list, no word for one');
});

test('the headings are asked of the voice that speaks', () => {
  const asked: string[] = [];
  const voice = voiceOf((key: VoiceKey) => (asked.push(key), `said ${key}`));
  assert.equal(voice.needsYou, 'said needs_you');
  assert.equal(voice.nothingDue, 'said nothing_due');
  assert.ok(asked.every((k) => k in VOICE_LINES));
});

test('the previews are the bodies their screens draw, as plain copies', async () => {
  const holds = { tasks: true, adds: true, money: false };
  const today = await previewedBody('today', holds);
  assert.equal(today?.page, 'today');
  assert.ok((today?.blocks.length ?? 0) > 0);
  const decide = await previewedBody('decide', holds);
  assert.equal(decide?.page, 'decide');
  assert.notEqual(decide, await previewedBody('decide', holds), 'each opening arranges its own copy');
  assert.equal(await previewedBody('money', holds), null);
});

/* FINDING 3 OF THE AUDIT OF BATCHES 11 TO 13: the first Done froze Today as the arranger saw it that minute. */

test('the body a first Done keeps is the house words, not the voice the arranger spoke in that minute', async () => {
  const kept = await previewedBody('today', { tasks: true, adds: true, money: true });
  const headings = (kept?.blocks ?? []).map((b) => b.heading).filter((h): h is string => typeof h === 'string');
  assert.ok(headings.includes(VOICE_LINES.needs_you));
  assert.ok(headings.includes(VOICE_LINES.coming_up));
  const queue = kept?.blocks.find((b) => b.kind === 'queue');
  assert.equal(queue?.empty, VOICE_LINES.nothing_waiting);
});

test("the kept body carries no block of the arranger's own: the capture line goes with tasks, and cash waits for Money", async () => {
  /* An arranger who may not add a task still keeps the line for those who may; the reader decides who sees it. */
  const kept = await previewedBody('today', { tasks: true, adds: false, money: false });
  const capture = kept?.blocks.find((b) => b.kind === 'capture');
  assert.ok(capture, 'the capture line is kept wherever the record keeps tasks');
  /* The cash tile is kept on a record without Money, drawn only once the record has the figure. */
  const cash = kept?.blocks.find((b) => b.kind === 'stat') as { when?: { metric: string; gte?: number } } | undefined;
  assert.ok(cash, 'the cash tile is kept whether or not Money is on yet');
  assert.equal(cash?.when?.metric, 'cash-now');
  assert.ok(typeof cash?.when?.gte === 'number' && cash.when.gte < -1e15, 'any figure at all draws it');
  /* A record with no tasks keeps no block over the list it does not hold, which the record would refuse. */
  const bare = await previewedBody('today', { tasks: false, adds: false, money: true });
  assert.ok(!bare?.blocks.some((b) => b.kind === 'capture' || b.source === 'register.tasks'));
});

test('a stat that already says when it draws keeps its own when, and a block with no figure is left alone', () => {
  const body = {
    page: 'p',
    title: 'P',
    blocks: [
      { kind: 'stat', cells: [{ metric: 'owed' }], when: { metric: 'owed', gt: 0 } },
      { kind: 'stat', cells: [{ label: 'Typed' }] },
      { kind: 'note', body: 'Hello' },
    ],
  };
  assert.deepEqual(whileHeld(body).blocks, body.blocks);
});

test('a kept heading is said in the voice that speaks, and words somebody wrote are left as written', () => {
  const said = (key: VoiceKey) => (key === 'needs_you' ? 'Waiting on you' : key === 'nothing_due' ? 'Clear ahead.' : VOICE_LINES[key]);
  const blocks = [
    { kind: 'queue', heading: VOICE_LINES.needs_you, empty: VOICE_LINES.nothing_waiting },
    { kind: 'timeline', heading: 'Next at the kiln', empty: VOICE_LINES.nothing_due },
    { kind: 'note' },
  ];
  const out = inVoice(blocks, said);
  assert.equal(out[0]?.heading, 'Waiting on you');
  assert.equal(out[0]?.empty, VOICE_LINES.nothing_waiting);
  assert.equal(out[1]?.heading, 'Next at the kiln');
  assert.equal(out[1]?.empty, 'Clear ahead.');
  assert.equal(out[2], blocks[2], 'a block with nothing to say again is the same block');
  assert.deepEqual(inVoice(out, said), out, 'twice is once');
});

test('the line to add a task is not drawn for a reader who may not add one, and stays at its place', () => {
  const blocks = [
    { kind: 'note', drawn: true },
    { kind: 'capture', register: 'tasks', drawn: true },
    { kind: 'capture', source: 'register.notes', drawn: true },
  ];
  const out = heldTo(blocks, (list) => list === 'notes');
  assert.equal(out.length, 3);
  assert.equal(out[1]?.drawn, false);
  assert.equal(out[2]?.drawn, true);
  assert.equal(out[0], blocks[0]);
});

test('a preview is arranged under the id it will be kept as, and installs that body', async () => {
  const body = { page: 'today', title: 'Today', layout: { rail: 4, sticky: false }, blocks: [{ kind: 'note', body: 'One' }, { kind: 'note', body: 'Two' }] };
  const { io, sent } = host((path, sentBody) => {
    if (path !== '/api/previewPage') return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'no' } });
    const blocks = ((sentBody?.body as { blocks: unknown[] }).blocks ?? []).map((b) => ({ ...(b as object), rows: [], columns: [], matched: 0, refusals: [] }));
    return json(200, { ok: true, value: { read_at: '2026-10-02T09:00:00.000Z', blocks } });
  });
  const got = await readToArrange(BASE, { id: 'home', installed: false }, async () => body, io as never);
  assert.ok(!('fix' in got), JSON.stringify(got));
  assert.equal(got.page.page, 'home');
  assert.equal(got.page.title, 'Today');
  assert.deepEqual(got.page.layout, { rail: 4, sticky: false });
  assert.equal(got.blocks.length, 2);
  assert.equal(got.install?.page, 'home');
  assert.equal(got.install?.blocks.length, 2);
  assert.equal(body.page, 'today', "the screen's own body is not touched");
  assert.equal((sent[0]?.body?.body as { page: string }).page, 'home');
});

test('a read that does not answer one block for each the body declares is not arranged', async () => {
  const body = { page: 'today', title: 'Today', blocks: [{ kind: 'note', body: 'One' }, { kind: 'note', body: 'Two' }] };
  const { io } = host(() => json(200, { ok: true, value: { blocks: [{ kind: 'note', body: 'One', rows: [], columns: [], refusals: [] }] } }));
  assert.deepEqual(await readToArrange(BASE, { id: 'home', installed: false }, async () => body, io as never), { fix: copy.arrangeMoved });
});

test('Put back retires the page the first Done installed, and says a refusal in its own words', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: [] }));
  assert.deepEqual(await unkeep(BASE, 'home', io as never), { ok: true });
  assert.equal(sent[0]?.path, '/api/retireDeclaration');
  assert.deepEqual(sent[0]?.body, { id: 'page.home' });

  const fix = 'Only an owner can change what this record declares.';
  const refused = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix } }));
  assert.deepEqual(await unkeep(BASE, 'decide', refused.io as never), { ok: false, fix });
});

/* ── through the record ───────────────────────────────────────────────── */

function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : void db.prepare(text).run(...(params as never[]))),
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
  } as unknown as Parameters<typeof openRecord>[0];
}

test('the kept cash tile installs on a record without Money, waits unseen, and draws once the record has the figure', async () => {
  const k = await openRecord(openSqlite(), { now: () => Date.parse('2026-10-06T09:00:00Z') });
  const body = whileHeld({
    page: 'home',
    title: 'Today',
    blocks: [
      { kind: 'note', body: 'Nothing needs you right now.' },
      { kind: 'stat', heading: 'Money', cells: [{ metric: 'cash-now', label: 'Cash now' }] },
    ],
  });
  const put = await k.install([
    { id: 'register.accounts', kind: 'register', body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } },
    { id: 'page.home', kind: 'page', body },
  ] as never);
  assert.ok(put.ok, JSON.stringify(put));
  const before = k.page('home');
  assert.ok(before.ok, JSON.stringify(before));
  assert.equal((before.value.blocks as { drawn: boolean }[])[1]?.drawn, false, 'no figure yet, so no tile');

  const money = await k.install([
    {
      id: 'metric.cash-now',
      kind: 'metric',
      body: { metric: 'cash-now', name: 'Cash now', source: 'register.accounts', value: { count: 'id' }, target: { gte: 0 }, window: '30d', compare: 'none', format: 'int' },
    },
  ] as never);
  assert.ok(money.ok, JSON.stringify(money));
  /* ONE ACCOUNT, because a figure over an empty list holds nothing and the record leaves an idle figure out for everybody
     (`drawn.ts`): what is under test is the figure arriving, not the empty list. */
  assert.ok(k.create('accounts', { name: 'Current' }, { actor: 'p_1' }).ok);
  const after = k.page('home');
  assert.ok(after.ok, JSON.stringify(after));
  /* THE RECORD MARKS ONLY A BLOCK IT LEAVES OUT; one it draws carries no `drawn` at all. */
  const tile = (after.value.blocks as { drawn?: boolean; readings?: unknown[] }[])[1];
  assert.notEqual(tile?.drawn, false, 'the figure is there, so the tile is');
  assert.equal(tile?.readings?.length, 1);
});
