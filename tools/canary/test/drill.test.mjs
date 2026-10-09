/**
 * The hold's fire drill (`lane.d/50-drill.mjs`) on a fresh self-host: three arrivals that cannot file, the record's own
 * nights, the hold read at 0, then cleared. And the drill going red by itself when the alarm does not ring: a door that
 * files what arrives leaves the hold standing. The canary's weekly path is driven with stubbed answers.
 *
 *   node --test tools/canary/test/drill.test.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ARRIVALS, canaryDrill, canaryStep, DECLS, DOOR, judgeCleared, judgeHold, MARK, selfHostDrill } from '../lane.d/50-drill.mjs';

const WHY_RED = '0 days in a row with every watched sign green. “Arrivals file by themselves” read red on 6 October.';
const answer = (value) => ({ status: 200, said: { ok: true, value } });

test('on a fresh self-host the three arrivals wait a night, the hold reads 0 because of them, and clearing them stops the red', async () => {
  const lines = [];
  const wrong = await selfHostDrill({ say: (l) => lines.push(l) });
  assert.deepEqual(wrong, []);
  assert.match(lines.join('\n'), new RegExp(`${ARRIVALS} arrivals that cannot file were let in`));
  assert.match(lines.join('\n'), /the hold went back to 0, and says why: .*Arrivals file by themselves” read red/);
  assert.match(lines.join('\n'), /cleared, and “Arrivals file by themselves” no longer reads red/);
  assert.doesNotMatch(lines.join('\n'), /[0-9A-HJKMNP-TV-Z]{26}|\/in\/webhook|127\.0\.0\.1/, 'no id, address or host in a line');
});

test('the drill is red by itself when the alarm does not ring: arrivals the arrivals sign does not count leave the hold unmoved', async () => {
  /* The three sent with a token that is not the door's: stored as the sender's fault, which the sign leaves out. */
  const forged = (url, init) => fetch(url.replace(/[^/]+$/u, 'not-the-door-token'), init);
  const wrong = await selfHostDrill({ send: forged });
  assert.ok(wrong.length > 0, 'a drill whose arrivals rang no alarm must not be green');
  assert.match(wrong.join('\n'), /the hold reads (nothing|\d+) after three arrivals waited a night, where it must read 0|not because arrivals waited/);
});

test('the hold is judged green only at 0 and only when the arrivals ended it', () => {
  assert.equal(judgeHold(answer({ value: 0, why: WHY_RED })).red, false);
  assert.match(judgeHold(answer({ value: 3, why: '3 days in a row' })).line, /reads 3 after three arrivals waited a night, where it must read 0/);
  assert.match(judgeHold(answer({ value: 0, why: '0 days in a row. “The model answers” read red on 6 October.' })).line, /not because arrivals waited/);
  assert.match(judgeHold(answer({ value: null, why: 'no kept day' })).line, /reads nothing/);
  assert.match(judgeHold({ status: 403, said: { ok: false, refusal: { fix: 'Only an owner reads this.' } } }).line, /could not be read: Only an owner reads this/);
  assert.equal(judgeCleared(answer({ signs: [{ sign: 'arrivals-filed', state: 'green', said: 'x' }] })).red, false);
  assert.equal(judgeCleared(answer({ signs: [{ sign: 'arrivals-filed', state: 'red', said: 'x' }] })).red, true);
  assert.equal(judgeCleared(answer({ signs: [] })).red, true);
});

const PLACE = { live: true, origin: 'https://canary.example', slug: 'ops' };
const MONDAY = Date.parse('2026-10-12T06:00:00Z');
const TUESDAY = Date.parse('2026-10-13T06:00:00Z');

test('on the canary it lets the three in on Monday, reads and clears on Tuesday, and does nothing on other days', async () => {
  assert.deepEqual([MONDAY, TUESDAY, Date.parse('2026-10-14T06:00:00Z')].map(canaryStep), ['plant', 'read', null]);
  const env = { CANARY_DRILL_DOOR: 'https://canary.example/in/webhook/r/fire-drill/t', SMOKE_TOKEN: 'k' };
  const posted = [];
  const monday = await canaryDrill(PLACE, env, { nowMs: MONDAY, send: async (url, init) => (posted.push({ url, body: init.body }), new Response('', { status: 202 })) });
  assert.equal(monday.code, 0);
  assert.equal(posted.length, ARRIVALS);
  assert.ok(posted.every((p) => p.url === env.CANARY_DRILL_DOOR && p.body.includes(MARK)));
  assert.equal((await canaryDrill(PLACE, env, { nowMs: Date.parse('2026-10-15T06:00:00Z') })).code, 0);
  assert.equal((await canaryDrill(PLACE, { SMOKE_TOKEN: 'k' }, { nowMs: MONDAY })).code, 1, 'no drill door is red, not a skip');

  const archived = [];
  const ended = [];
  const send = async (url, init) => {
    const method = new URL(url).pathname.split('/').at(-1);
    if (method === 'logout') return (ended.push(init.headers.cookie), new Response('{}', { status: 200 }));
    if (method === 'metric') return Response.json({ ok: true, value: { value: 0, why: WHY_RED } });
    if (method === 'inbox') {
      /* Two pages of waiting arrivals, the drill's split across them, and a person's note that names the drill. */
      const { state, cursor } = JSON.parse(init.body);
      if (state !== 'untriaged') return Response.json({ ok: true, value: { arrivals: [], cursor: null } });
      const drill = (i) => ({ id: `a${i}`, body: `${MARK} of 2026-10-12, arrival ${i} of 3. Nothing should file this.` });
      const page = cursor === 2 ? [drill(3), { id: 'his', body: `Is the ${MARK} on this week?` }] : [drill(1), { id: 'other', body: 'a real message' }, drill(2)];
      return Response.json({ ok: true, value: { arrivals: page, cursor: cursor === 2 ? null : 2 } });
    }
    if (method === 'archiveArrival') return (archived.push(JSON.parse(init.body).id), Response.json({ ok: true, value: {} }));
    if (method === 'signs') return Response.json({ ok: true, value: { signs: [{ sign: 'arrivals-filed', state: 'green', said: 'x' }] } });
    return new Response('', { status: 404 });
  };
  const state = { cookies: [{ name: 'bd_s', value: 'drill', domain: 'canary.example', path: '/' }] };
  const tuesday = await canaryDrill(PLACE, env, { nowMs: TUESDAY, send, io: { signIn: async () => 0, read: async () => JSON.stringify(state) } });
  assert.deepEqual(tuesday.lines.length, 2, tuesday.lines.join('\n'));
  assert.equal(tuesday.code, 0, tuesday.lines.join('\n'));
  assert.deepEqual(archived, ['a1', 'a2', 'a3'], 'only the drill\'s own are cleared');
  assert.deepEqual(ended, ['bd_s=drill'], 'it signs out of the session it made');
});

test('the drill door is the drill\'s own: it names no list of anybody\'s and its pattern is one no drill message meets', () => {
  const ingest = DECLS.find((d) => d.kind === 'ingest').body;
  assert.equal(ingest.ingest, DOOR);
  assert.ok(!MARK.includes(ingest.match.contains) && !ingest.match.contains.includes(MARK));
  assert.equal(ingest.verify.kind, 'path', 'a door that verifies nothing would store arrivals the sign does not count');
});
