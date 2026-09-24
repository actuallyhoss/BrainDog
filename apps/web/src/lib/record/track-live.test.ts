/**
 * One thread against the record: the record's rows with their refs as numbers, and the record's own
 * sentence for every refusal.
 *
 * THE PROPERTY UNDER TEST IS WHOSE ROWS THEY ARE. `/t/<track>` drew the built-in sample whatever
 * record was open, so the assertions that matter are the ones where the two records DISAGREE: this
 * record's `things#4` is Kiln where the sample's is something else, and a thread read here must
 * carry Kiln. A test whose fixture agreed with the sample would pass against the bug.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ROWS, healthOf, runsIn, updatesIn } from './api.ts';
import { trackReader, type Fetch } from './track-live.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that answers by path, and remembers what it was sent. */
function host(answer: ((url: URL) => Response) | null): { io: Fetch; sent: URL[] } {
  const sent: URL[] = [];
  const io = (async (url: string | URL | Request) => {
    const at = new URL(String(url));
    sent.push(at);
    if (!answer) throw new TypeError('fetch failed');
    return answer(at);
  }) as Fetch;
  return { io, sent };
}

const THING = '01JTHING000000000000000000';
const TRACK = '01JTRACK000000000000000000';

/** Recent enough that the thread is `current` rather than stale, against the reader's own clock. */
const AT = new Date(Date.now() - 2 * 86_400_000).toISOString();
const SEEN = new Date(Date.now() - 60_000).toISOString();

const stamped = { version: 1, created_at: '2026-09-01T09:00:00.000Z', updated_at: '2026-09-10T09:00:00.000Z' };

/** One row per register, each pointing at the next the way the record stores it: by the target's id. */
const HELD: Record<string, unknown[]> = {
  /* `Kiln`, WHERE THE SAMPLE'S `things#4` IS NOT. The two differ on purpose. */
  things: [{ id: THING, seq: 4, fields: { name: 'Kiln' }, ...stamped }],
  tracks: [{ id: TRACK, seq: 2, fields: { name: 'Variable axis QA', state: 'open', thing: THING }, ...stamped }],
  updates: [
    { id: '01JUP0000000000000000000A', seq: 1, fields: { body: 'Nine instances cut.', health: 'at_risk', track: TRACK, by: 'you', at: AT }, ...stamped },
  ],
  tasks: [
    { id: '01JTASK00000000000000000A', seq: 1, fields: { what: 'Re-cut the italic', state: 'open', track: TRACK }, ...stamped },
    { id: '01JTASK00000000000000000B', seq: 2, fields: { what: 'Ship it', state: 'done', track: TRACK }, ...stamped },
  ],
  /* A RUN'S `project` IS TEXT, the project's spoken id, and must survive the walk untouched. */
  session: [{ id: '01JSESS00000000000000000A', seq: 1, fields: { doing: 'Mastering pass', agent: 'claude', state: 'active', project: 'things#4', last_seen: SEEN }, ...stamped }],
};

const record = (url: URL): Response => {
  if (url.pathname === '/api/list') {
    const rows = HELD[url.searchParams.get('register') ?? ''] ?? [];
    return json(200, { ok: true, value: { rows, cursor: null, matched: rows.length } });
  }
  return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
};

test("the thread is the record's, with every ref as the number a person says", async () => {
  const { io } = host(record);
  const out = await trackReader(BASE, io).read();
  assert.ok(out.from === 'live');

  /* THE REFS RESOLVED. A track points at its project and an update at its thread, and both arrive as
     ids; the screen asks about them by number, so they are numbers before they leave the reader. */
  assert.equal(out.thread.tracks[0]!.fields.thing, 4);
  assert.equal(out.thread.updates[0]!.fields.track, 2);
  assert.equal(out.thread.tasks[0]!.fields.track, 2);

  /* AND THE PROJECT IS THIS RECORD'S, not the sample's row of the same number. */
  assert.equal(out.thread.things[0]!.fields.name, 'Kiln');
  assert.notEqual(out.thread.things[0]!.fields.name, ROWS.things!.find((e) => e.seq === 4)!.fields.name);

  /* A RUN'S PROJECT IS NOT A REF and passes through as the spoken id `runsIn` matches on. */
  assert.equal(out.thread.session[0]!.fields.project, 'things#4');
  assert.equal(runsIn(out.thread.session, 'things#4').length, 1);
});

test('the screen derives the same thread from these rows as it does from the sample', async () => {
  const { io } = host(record);
  const out = await trackReader(BASE, io).read();
  assert.ok(out.from === 'live');
  const track = out.thread.tracks.find((t) => t.seq === 2);

  /* THE NEWEST UPDATE DECIDES, and the derivation is the one the sample goes through. */
  const health = healthOf(track, out.thread.updates, 2, out.now);
  assert.equal(health.health, 'at_risk');
  assert.equal(health.state, 'current');
  assert.equal(health.by, 'you');

  assert.equal(updatesIn(out.thread.updates, 2).length, 1);

  /* AND `Still open` MEANS STILL OPEN. The finished task is held back by the screen's own filter. */
  const open = out.thread.tasks.filter((t) => Number(t.fields.track) === 2 && t.fields.state !== 'done' && t.fields.state !== 'dropped');
  assert.equal(open.length, 1);
  assert.equal(open[0]!.fields.what, 'Re-cut the italic');
});

test('a register two refs point at is walked once', async () => {
  const { io, sent } = host(record);
  await trackReader(BASE, io).read();
  const things = sent.filter((u) => u.searchParams.get('register') === 'things');
  assert.equal(things.length, 1, 'both `tracks` and `tasks` point at things, and it is read once');
});

/* NO RECORD IS A REFUSAL NOW, NOT THE SAMPLE (DIRECTION 26): under these three the screen drew the studio's own
   thread, updates and runs under the thread number in the address. */
test("a 401 at no slug is the record's sentence, not the sample's thread", async () => {
  const { io } = host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } }));
  assert.deepEqual(await trackReader(BASE, io).read(), { from: 'refused', fix: 'Sign in again.' });
});

for (const [what, answer] of [
  ['nothing answers', null],
  ['a static host answers a 404 page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 })],
] as const)
  test(`a refusal, and no sample thread, when ${what}`, async () => {
    const out = await trackReader(BASE, host(answer).io).read();
    assert.equal(out.from, 'refused');
    assert.ok(out.from === 'refused' && out.fix.trim() !== '', 'a refusal with no sentence says nothing to the reader');
  });

test("any other refusal is the record's own sentence, and the sample is not drawn under it", async () => {
  const fix = 'This record has no threads. Install the work pack to make them.';
  const { io } = host(() => json(404, { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix } }));
  assert.deepEqual(await trackReader(BASE, io).read(), { from: 'refused', fix });
});

test('the thread screen reads the record, and draws no sample under a refusal', () => {
  const page = readFileSync(new URL('../../routes/t/[track]/+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /from '\$lib\/record\/track-live\.ts'/u);
  /* THE RECORD'S ROWS OR NONE: the sample's `ROWS` were the fallback here, and there is no sample to fall back to. */
  assert.match(page, /got\?\.from === 'live' \? got\.thread : \{\}/u);
  /* A REFUSAL IS THE RECORD'S SENTENCE, drawn before anything else and with no rows under it. */
  assert.match(page, /\{#if refused !== null\}/u);
  /* AND NOTHING IS DRAWN WHILE THE READ IS STILL OUT. */
  assert.match(page, /\{:else if !answered\}/u);
  /* NOR ANY OF THE SAMPLE: its rows, its frozen clock, its worked-example transcripts, or a toast saying nothing was
     posted where the post could have been written. */
  assert.doesNotMatch(page, /\bROWS\b|\bNOW\b|\bjobOf\b|notWritten/u, 'the thread screen reads the sample again');
});
