/**
 * A line typed into a page's `capture` (`capture.ts`, `page-writes.ts` `captureLine`): it is read in Today's light
 * syntax, a question is asked in the palette rather than filed, and a row that lands is offered back for six seconds.
 *
 * THE WRITE RUNS FOR REAL over a `fetch` this file answers by hand, as `page-writes.test.ts` does, so what is checked is
 * what the record is sent and what the page says.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS, TITLES } from '../record/held.ts';
import type { LiveBlock } from '../record/page-live.ts';
import type { RegisterDecl } from '../record/schema.ts';
import { addDays, dayOf } from '../work/board.ts';
import { captureRow, readLine } from './capture.ts';
import { heldNone, pageWrites, type Held } from './page-writes.ts';

/** Noon, so the reader's day is the same on any wall clock this runs on. */
const NOW = Date.parse('2026-09-29T12:00:00Z');
const TODAY = dayOf(NOW);

/* A LIST WITH A DUE DAY, A PRIORITY AND A PROJECT, and one with none of them. */
REGISTERS.chores = {
  id: 'chores',
  name: 'Chores',
  one: 'chore',
  title: 'what',
  state: 'state',
  done: ['done'],
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'state', type: 'enum', values: ['backlog', 'open', 'done'], default: 'open' },
    { id: 'due', type: 'day', label: 'Due' },
    { id: 'tier', type: 'enum', label: 'Priority', values: ['urgent', 'normal'] },
    { id: 'thing', type: 'ref', to: 'things' },
  ],
} as unknown as RegisterDecl;
REGISTERS.notes = {
  id: 'notes',
  name: 'Notes',
  one: 'note',
  title: 'text',
  fields: [{ id: 'text', type: 'text', required: true }],
} as unknown as RegisterDecl;
TITLES.set('things', new Map([[4, 'Kiln rebuild']]));
/* THE SAME LIST WITH NO LINK, which the write tests use, so the writer walks no other list to send a row. */
REGISTERS.jobs = { ...REGISTERS.chores, id: 'jobs', name: 'Jobs', fields: REGISTERS.chores.fields.filter((f) => f.type !== 'ref') } as RegisterDecl;

test('A LINE IS READ IN THE LIGHT SYNTAX on a list that has the parts it names', () => {
  const read = readLine('chores', 'Chase Halden tomorrow !urgent #kiln', NOW);
  assert.equal(read.text, 'Chase Halden');
  assert.deepEqual(read.parsed, { due: addDays(TODAY, 1), tier: 'urgent', thing: 4 });
  assert.ok(read.said.includes('Kiln rebuild'), 'the receipt does not name the project the line filed it under');
});

test('A LIST WITH NONE OF THOSE PARTS READS THE LINE AS ITS WORDS', () => {
  assert.deepEqual(readLine('notes', 'Ring the vet tomorrow #kiln', NOW), { text: 'Ring the vet tomorrow #kiln', parsed: {}, said: [] });
});

test('WHAT THE LINE SAID WINS OVER THE STATE NOTHING, AND THE BLOCK’S OWN FILLS STAY', () => {
  const read = readLine('chores', 'Sweep the yard friday', NOW);
  const row = captureRow('chores', read.text, { state: 'backlog' }, NOW, read.parsed);
  assert.ok(row);
  assert.equal(row.fields.what, 'Sweep the yard');
  assert.equal(row.fields.state, 'backlog', 'the block’s `state is backlog` was overwritten by the line');
  assert.equal(typeof row.fields.due, 'string');
});

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise<void>((r) => setImmediate(r));
};

let bases = 0;

/** A page's writes over a `fetch` that answers every create and update at once and keeps what was sent. */
function page() {
  const base = `https://capture-${++bases}.test`;
  let held: Held = heldNone();
  const sent: { url: string; body: unknown }[] = [];
  const asked: string[] = [];
  const toasts: { text: string; intent?: string | undefined; life?: number | undefined; undo?: (() => void) | undefined }[] = [];
  let rereads = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (u.includes('/api/create')) {
      sent.push({ url: u, body });
      return json(200, { ok: true, value: { id: 'e_9', seq: 9, version: 1, fields: body.fields } });
    }
    if (u.includes('/api/update')) {
      sent.push({ url: u, body });
      return json(200, { ok: true, value: { id: 'e_9', seq: 9, version: 2, fields: {} } });
    }
    return json(200, { ok: true, value: REGISTERS.jobs });
  }) as typeof fetch;
  const writes = pageWrites({
    slug: () => 'today',
    now: () => NOW,
    blocks: () => [] as LiveBlock[],
    base: () => base,
    reread: async () => void rereads++,
    toasts: { push: (text, opts = {}) => (toasts.push({ text, ...opts }), toasts.length) },
    state: { get: () => held, set: (next) => (held = next) },
    ask: (line) => void asked.push(line),
  });
  writes.forPage('today');
  return { writes, sent, asked, toasts, rereads: () => rereads };
}

test('A QUESTION TYPED INTO A CAPTURE IS ASKED IN THE PALETTE, and nothing is written', async () => {
  const p = page();
  await p.writes.captureLine('jobs', 'What is due this week?', {});
  assert.deepEqual(p.asked, ['What is due this week?']);
  assert.deepEqual(p.sent, []);
  assert.deepEqual(p.toasts, []);
});

test('A ROW THAT LANDS IS NAMED IN ITS RECEIPT AND OFFERED BACK FOR SIX SECONDS, and Undo archives it', async () => {
  const p = page();
  await p.writes.captureLine('jobs', 'Chase Halden tomorrow', {});
  assert.equal(p.sent.length, 1, JSON.stringify(p.toasts));
  const created = p.sent[0]!.body as { register: string; fields: Record<string, unknown> };
  assert.equal(created.register, 'jobs');
  assert.equal(created.fields.what, 'Chase Halden');
  assert.equal(created.fields.due, addDays(TODAY, 1));
  const receipt = p.toasts.at(-1)!;
  assert.equal(receipt.intent, 'good');
  assert.equal(receipt.life, 6_000);
  assert.match(receipt.text, /^Added “Chase Halden” to Jobs · Due /u);
  assert.equal(p.rereads(), 1);
  receipt.undo!();
  await settle();
  const archived = p.sent.at(-1)!.body as { register: string; seq: number; patch: Record<string, unknown>; version: number };
  assert.equal(archived.seq, 9);
  assert.equal(archived.version, 1, 'Undo archived at a version the row was never at');
  assert.equal(typeof archived.patch.deleted_at, 'string');
  assert.equal(p.rereads(), 2, 'the page was not read again once the row was taken back');
});

test('A REFUSED LINE SAYS THE RECORD’S SENTENCE AND OFFERS NO UNDO', async () => {
  const p = page();
  globalThis.fetch = (async () => json(200, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'You can read chores but not add to them.' } })) as typeof fetch;
  await p.writes.captureLine('jobs', 'Sweep the yard', {});
  assert.deepEqual(p.toasts.map((t) => [t.text, t.intent, t.undo]), [['You can read chores but not add to them.', 'warn', undefined]]);
  assert.equal(p.rereads(), 0);
});
