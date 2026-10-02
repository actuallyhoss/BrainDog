/**
 * DECIDE AS A DECLARED PAGE: the body every record draws, how the page shapes what the record answers, and the read.
 *
 * THE READ GOES THROUGH A REAL KERNEL. This package does not depend on `@braindog/record`, so the stub does what its
 * `previewPage` does for an owner: the install's lint, then each block through `kernel.block`. The questions are filed,
 * put off and answered through the kernel's own `propose` and `decide`, so the blocks drawn here are the shapes a record
 * sends and not shapes typed out to match the drawing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { openRecord, type QueueQuestion } from '@braindog/kernel';
import type { Fetch, LiveBlock } from '../../lib/record/page-live.ts';
import { callsRead, DECIDE_HOME, decideBlockOf, decideDrawn, decideHome, readDecide, type Call } from './views.ts';
import { words } from './words.ts';

const CLOCK = Date.UTC(2026, 9, 2, 12);
const DAY = 86_400_000;
const BASE = 'http://record.test';
const reply = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const OPTIONS = { options: [{ id: 'raise', label: 'Raise it', because: 'Covers the overrun', recommended: true }, { id: 'leave', label: 'Leave it', because: 'Keeps the quote' }] };

function sqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : db.prepare(text).run(...(params as never[]))),
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

const value = <T>(out: unknown): T => {
  const o = out as { ok: boolean; value?: T };
  assert.ok(o.ok, JSON.stringify(out));
  return o.value as T;
};

type Kernel = Awaited<ReturnType<typeof openRecord>>;

/** A record holding three open questions, one put off and one answered, and its `previewPage` as a host answers it. */
async function decideRecord(): Promise<{ k: Kernel; io: Fetch; ids: Record<string, string> }> {
  let now = CLOCK;
  const k = await openRecord(sqlite(), { now: () => now });
  const ask = (question: string) => value<{ id: string }>(k.propose({ question, body_kind: 'options', body: OPTIONS }, 'slash')).id;
  const decided = ask('Raise the retainer last time?');
  value(k.decide(decided, { decide: { option: 'leave', reason: 'The quote stood.' } }, 'p_1'));
  now += 60_000;
  const later = ask('Renew the studio lease?');
  value(k.decide(later, { defer: { until: new Date(CLOCK + 3 * DAY).toISOString(), why: 'after the quarter closes' } }, 'p_1'));
  const ids = { decided, later, first: ask('Raise the retainer?'), second: ask('Pay the kiln bill?'), third: ask('Hire a second potter?') };
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = new URL(String(url)).pathname.slice('/api/'.length);
    if (method !== 'previewPage') return reply(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no method called ${method}.` } });
    const { body: page } = JSON.parse(String(init?.body)) as { body: { page: string; blocks: unknown[] } };
    const fault = k.lint([{ id: `page.${page.page}`, kind: 'page', body: page } as never]);
    if (fault) return reply(400, { ok: false, refusal: fault });
    return reply(200, { ok: true, value: { ...page, read_at: new Date(now).toISOString(), blocks: page.blocks.map((b) => k.block(b as never)) } });
  }) as Fetch;
  return { k, io, ids };
}

/* ── the body ── */

test('the body is the line, the first question whole, the rest to choose from, then what was put off and decided, folded', () => {
  const body = decideHome();
  assert.equal(body.page, 'decide');
  assert.deepEqual(
    body.blocks.map((b) => [b.kind, b.source ?? '', b.lead === true, b.fold === true]),
    [
      ['note', '', true, false],
      ['queue', 'governance.open', true, false],
      ['queue', 'governance.open', false, false],
      ['section', '', false, true],
      ['queue', 'governance.later', false, false],
      ['section', '', false, true],
      ['table', 'governance.decided', false, false],
    ],
  );
  /* THE FIRST QUESTION ALONE IS DRAWN WHOLE, so it is never one of several chosen at once: the page's batch bar takes a
     queue's questions only where it holds two or more. */
  assert.equal(body.blocks[1]?.limit, 1);
  /* EVERY HEADING HAS ITS ICON, and the words are the person's, never the system's. */
  for (const b of body.blocks.filter((x) => x.heading)) assert.ok(b.icon, `${b.heading} has no icon`);
  for (const b of body.blocks) assert.doesNotMatch(`${b.heading ?? ''} ${typeof b.body === 'string' ? b.body : ''}`, /\b(row|rows|list item|entity|register)\b/iu);
  /* NOTHING IN IT IS ANYBODY'S RECORD BY NAME: every block reads the record's own questions. */
  assert.ok(body.blocks.every((b) => b.source === undefined || b.source.startsWith('governance.')));
});

test('the body installs as any page would, every block read clean', async () => {
  const { k } = await decideRecord();
  assert.equal(k.lint([{ id: 'page.decide', kind: 'page', body: DECIDE_HOME } as never]), null);
  for (const b of DECIDE_HOME.blocks) assert.deepEqual(k.block(b as never).refusals, [], `${b.kind} over ${b.source ?? 'nothing'} is refused`);
});

/* ── the read ── */

test('the record draws the page: the first question whole, the rest after it once each, what was put off and decided', async () => {
  const { io, ids } = await decideRecord();
  const got = await readDecide(BASE, DECIDE_HOME, io);
  assert.equal(got?.from, 'live', JSON.stringify(got));
  if (got?.from !== 'live') return;
  const blocks = got.page.blocks;
  assert.ok(blocks.every((b) => b.cannot === undefined), JSON.stringify(blocks.map((b) => [b.source, b.cannot])));

  const shaped = decideDrawn(blocks, got.now, (q) => (q.who === 'slash' ? 'Slash' : ''));
  const [note, lead, rest, , later, , decided] = shaped.blocks;
  /* THE LINE WENT TO THE HEAD, and says how many wait and what the first suggests. */
  assert.equal(note?.drawn, false);
  assert.equal(shaped.open, 3);
  assert.equal(shaped.sentence.text, 'Three questions wait on you. Slash suggests “Raise it” for the first.');
  assert.equal(shaped.sentence.needs, '');
  /* THE FIRST QUESTION ONCE, AND THE REST AFTER IT. */
  const leadIds = (lead?.queue ?? []).map((q) => q.id);
  const restIds = (rest?.queue ?? []).map((q) => q.id);
  assert.equal(leadIds.length, 1);
  assert.deepEqual([...leadIds, ...restIds].sort(), [ids.first, ids.second, ids.third].sort());
  assert.ok(!restIds.includes(leadIds[0]!), 'the first question is drawn twice');
  assert.equal(rest?.total, 2);
  /* WHAT WAS PUT OFF IS A QUEUE LIKE THE OPEN ONE, and what was decided is a table with a door to each decision. */
  assert.deepEqual(later?.queue?.map((q) => q.id), [ids.later]);
  assert.equal(later?.source, 'governance.later');
  assert.equal(decided?.rows.length, 1);
  assert.deepEqual(decided?.rows[0]?.cells.slice(0, 3), ['Raise the retainer last time?', 'Leave it', 'The quote stood.']);
  /* THE DOOR IS THE DECISION'S OWN, which `/decide/<id>` reads as the receipt of what was asked and answered. */
  assert.match((decided?.rows[0] as { href?: string } | undefined)?.href ?? '', /^\/decide\/D\d+$/u);
  assert.deepEqual(decided?.columns.map((c) => c.label), [words.question, words.chosen, words.why, words.when]);
  assert.ok(shaped.drawsAny);
});

test('a host older than the method shows the classic screen, and a refusal is the record’s sentence', async () => {
  const older = (async () => reply(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called previewPage.' } })) as unknown as Fetch;
  assert.equal(await readDecide(BASE, DECIDE_HOME, older), null);
  const refused = (async () => reply(400, { ok: false, refusal: { code: 'DECLARATION_INVALID', fix: 'That page cannot be drawn.' } })) as unknown as Fetch;
  assert.deepEqual(await readDecide(BASE, DECIDE_HOME, refused), { from: 'refused', fix: 'That page cannot be drawn.' });
});

/* ── the shaping ── */

const question = (id: string, cost: QueueQuestion['cost'] = 'call', recommended = false): QueueQuestion => ({
  id,
  who: 'slash',
  at: new Date(CLOCK).toISOString(),
  kind: 'options',
  question: `Question ${id}?`,
  why: '',
  cost,
  options: [{ key: 'a', label: 'Yes', because: '', recommended }, { key: 'b', label: 'No', because: '', recommended: false }],
});

const queueBlock = (queue: QueueQuestion[], total: number, lead = false): LiveBlock =>
  decideBlockOf({ kind: 'queue', source: 'governance.open', ...(lead ? { lead: true } : {}), queue, matched: total } as never, CLOCK);

const noteBlock = (): LiveBlock => decideBlockOf({ kind: 'note', lead: true, body: words.nothingWaiting } as never, CLOCK);

test('the head says the record’s count, in red when it is over the aim or one waiting is hard to undo', () => {
  const qs = ['q1', 'q2', 'q3', 'q4', 'q5'].map((id, n) => question(id, n === 4 ? 'undo' : 'call', n === 0));
  const shaped = decideDrawn([noteBlock(), queueBlock(qs.slice(0, 1), 5, true), queueBlock(qs, 5)], CLOCK, () => 'Claude');
  assert.equal(shaped.sentence.text, 'Five questions wait on you, two over the aim of three. Claude suggests “Yes” for the first.');
  assert.equal(shaped.sentence.needs, 'two over');
  assert.deepEqual(shaped.blocks[2]?.queue?.map((q) => q.id), ['q2', 'q3', 'q4', 'q5']);
  assert.equal(shaped.blocks[2]?.total, 4);
  /* THE FIRST CARD COUNTS ONLY ITSELF, so it draws no "4 more" door back to this page over the four drawn under it. */
  assert.equal(shaped.blocks[1]?.total, 1);
  assert.equal(shaped.open, 5);

  const one = decideDrawn([noteBlock(), queueBlock([question('q1', 'undo')], 1, true), queueBlock([question('q1', 'undo')], 1)], CLOCK);
  assert.equal(one.sentence.text, 'One question waits on you.');
  assert.equal(one.sentence.needs, 'One question waits on you');
  /* THE REST HOLD NOTHING BUT THE FIRST, so they are not drawn, and the indexes stay. */
  assert.equal(one.blocks.length, 3);
  assert.equal(one.blocks[2]?.drawn, false);
});

test('nothing waiting says the calm line, with when the last one was decided, and draws nothing that holds nothing', () => {
  const decided = decideBlockOf(
    {
      kind: 'table',
      source: 'governance.decided',
      columns: [{ field: 'question' }, { field: 'answer_label' }, { field: 'at' }],
      rows: [{ id: 'SG4', fields: { question: 'Pay the bill?', answer: 'accept', answer_label: null, at: new Date(CLOCK - 2 * DAY).toISOString() } }],
      matched: 1,
    } as never,
    CLOCK,
  );
  assert.deepEqual(decided.rows[0]?.cells.slice(0, 2), ['Pay the bill?', 'Accept']);
  const shaped = decideDrawn([noteBlock(), queueBlock([], 0, true), queueBlock([], 0), decided], CLOCK);
  assert.equal(shaped.open, 0);
  assert.match(shaped.sentence.text, /^Nothing waits on you\. The last one was decided .+\.$/u);
  assert.deepEqual(shaped.blocks.map((b) => b.drawn), [false, false, false, true]);

  const empty = decideDrawn([noteBlock(), queueBlock([], 0, true), queueBlock([], 0)], CLOCK);
  assert.deepEqual(empty.sentence, { text: words.nothingWaiting, needs: '' });
  assert.equal(empty.drawsAny, false);
});

test('a block the record refused keeps its sentence and is never reshaped', () => {
  const refused = decideBlockOf({ kind: 'queue', source: 'governance.later', refusals: [{ code: 'NOT_IN_THIS_BUILD', fix: 'Not here yet.' }] } as never, CLOCK);
  assert.equal(refused.refusals.length, 1);
  const shaped = decideDrawn([noteBlock(), refused], CLOCK);
  assert.equal(shaped.blocks[1]?.drawn, refused.drawn);
});

/* ── the calls ── */

test('how the calls went is one line over those already checked', () => {
  const call = (id: string, went: Call['went']): Call => ({ id, claim: `Claim ${id}`, went, at: '2026-09-01', about: null });
  assert.deepEqual(callsRead([call('a', 'met'), call('b', 'met'), call('c', 'missed'), call('d', 'due')]), { met: 2, missed: 1, unread: 0, said: '2 of 3 checked came true.' });
  assert.equal(callsRead([call('d', 'due')]).said, 'None has been checked yet.');
});

/* ── the screen ── */

const screen = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

test('the screen draws the declared page through the one reader, and keeps the old one at ?classic', () => {
  assert.match(screen, /<PageView slug="decide" got=\{drawn\} mode="home" select \{reread\} \/>/u);
  assert.match(screen, /readDecide\(/u);
  assert.match(screen, /decideDrawn\(/u);
  assert.match(screen, /searchParams\.has\('classic'\)/u);
  assert.match(screen, /import\('\.\/Classic\.svelte'\)/u);
});

test('the head is calm: no group control, no Select, no waiting chart, no key hints, no counts', () => {
  for (const gone of ['segmented', 'decideSelect', 'decideGroup', '<Bars', 'waitedOf', '<Kbd', 'group-n', 'LEAD.switch'])
    assert.ok(!screen.includes(gone), `the page still draws ${gone}`);
});
