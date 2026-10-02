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

import '../record/fixtures/fill.ts';
import { copy } from '../copy.ts';
import { VOICE_LINES, type VoiceKey } from '../voice.ts';
import { holdsOf, keptAs, previewedBody, readToArrange, unkeep, voiceOf } from './home-arrange.ts';

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
  assert.deepEqual(holdsOf({ lists: [{ id: 'tasks', name: 'Tasks' }], pages: ['money'], me: owner }), { tasks: true, adds: true, money: true });
  assert.deepEqual(holdsOf({ lists: [{ id: 'notes', name: 'Notes' }], pages: [], me: owner }), { tasks: false, adds: false, money: false });
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
  const voice = voiceOf((key: VoiceKey) => VOICE_LINES[key]);
  const today = await previewedBody('today', holds, voice);
  assert.equal(today?.page, 'today');
  assert.ok((today?.blocks.length ?? 0) > 0);
  const decide = await previewedBody('decide', holds, voice);
  assert.equal(decide?.page, 'decide');
  assert.notEqual(decide, await previewedBody('decide', holds, voice), 'each opening arranges its own copy');
  assert.equal(await previewedBody('money', holds, voice), null);
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
