/**
 * The sitting's parts that hold its promises, with no browser and no `gh`: nothing it says quotes a credential, every
 * value reaches `gh` on standard input and never in its arguments, and it waits for the owner and nobody else.
 * `enrol.mjs` itself is run by him alone.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CANARY, ENVIRONMENT, handOver, opsLine, parse, planOf, recordIdOf, said, SMOKE_KEY, waitForOwner } from '../enrol.mjs';

const PASSKEY = 'eyJjcmVkZW50aWFsSWQiOiJub3QtcmVhbCJ9';
const BEARER = 'rec_01J8Z3N4W5X6Y7Z8A9B0C1D2E3.not-a-real-secret-but-a-long-one';

test('it takes --dry, --slug and --origin, defaults to ops on app.brain.dog, and refuses the rest', () => {
  assert.deepEqual(parse([]), { dry: false, slug: CANARY, origin: 'https://app.brain.dog' });
  assert.equal(CANARY, 'ops');
  assert.deepEqual(parse(['--dry', '--slug=canary-two']), { dry: true, slug: 'canary-two', origin: 'https://app.brain.dog' });
  assert.throws(() => parse(['--token', 'x']), /--dry, --slug and --origin/u);
  assert.throws(() => parse(['--slug', 'Not A Name']), /not a record's name/u);
  assert.throws(() => parse(['--origin', 'http://brain.dog']), /not https/u);
});

test('the smoke’s key is asked at propose, for the longest a key may live', () => {
  assert.deepEqual(SMOKE_KEY, { label: 'Deploy smoke', scope: 'propose', days: 365 });
});

test('the record is named off the front of the key, and a key of another shape is refused without being quoted', () => {
  assert.equal(recordIdOf(BEARER), 'rec_01J8Z3N4W5X6Y7Z8A9B0C1D2E3');
  assert.equal(opsLine(recordIdOf(BEARER)), '"OPS_RECORD": "rec_01J8Z3N4W5X6Y7Z8A9B0C1D2E3"');
  for (const bad of ['', 'not-a-key-QUOTED', 'rec_short.QUOTED', 'acct_01J8Z3N4W5X6Y7Z8A9B0C1D2E3.QUOTED'])
    assert.throws(() => recordIdOf(bad), (e) => !e.message.includes('QUOTED') && /<record>\.<secret>/u.test(e.message));
});

test('what it sets is said by name and length, and no line holds a value that is secret', () => {
  const plan = planOf({ passkey: PASSKEY, bearer: BEARER, slug: 'ops', ends: '2027-10-09T00:00:00.000Z' });
  assert.deepEqual(plan.map((s) => `${s.kind} ${s.name}`), ['secret CANARY_PASSKEY', 'secret SMOKE_TOKEN', 'variable SMOKE_SLUG']);
  const lines = plan.map(said);
  for (const line of lines) {
    assert.ok(!line.includes(PASSKEY), line);
    assert.ok(!line.includes('not-a-real-secret'), line);
    assert.doesNotMatch(line, /—/u, 'no em dash in a line a person reads');
  }
  assert.match(lines[1], /until 2027-10-09/u);
  assert.match(lines[2], /SMOKE_SLUG = ops/u);
});

test('each secret goes to gh on standard input in the environment production, and the first that fails stops the rest', () => {
  const plan = planOf({ passkey: PASSKEY, bearer: BEARER, slug: 'ops' });
  const calls = [];
  const lines = handOver(plan, { run: (args, input) => (calls.push({ args, input }), { ok: true, why: '' }) });
  assert.equal(ENVIRONMENT, 'production');
  assert.deepEqual(calls[0], { args: ['secret', 'set', 'CANARY_PASSKEY', '--env', 'production'], input: PASSKEY });
  assert.deepEqual(calls[1], { args: ['secret', 'set', 'SMOKE_TOKEN', '--env', 'production'], input: BEARER });
  assert.deepEqual(calls[2].args, ['variable', 'set', 'SMOKE_SLUG', '--env', 'production', '--body', 'ops']);
  for (const c of calls.slice(0, 2)) assert.ok(!c.args.some((a) => a.includes(PASSKEY) || a.includes(BEARER)), 'never in the arguments');
  assert.equal(lines.length, 3);
  for (const line of lines) assert.ok(!line.includes(BEARER) && !line.includes(PASSKEY));

  const tried = [];
  assert.throws(
    () => handOver(plan, { run: (args) => (tried.push(args[2]), { ok: false, why: 'HTTP 403: Resource not accessible' }) }),
    /did not set CANARY_PASSKEY: HTTP 403.*Nothing after it was set/u,
  );
  assert.deepEqual(tried, ['CANARY_PASSKEY']);
});

test('it waits for the owner of the canary, refuses another level, and gives up after its wait', async () => {
  let t = 0;
  const clock = { now: () => t, sleep: async (ms) => void (t += ms), everyMs: 1000 };
  const answers = [null, { ok: true, value: [] }, { ok: true, value: [{ slug: 'elsewhere', level: 'owner' }] }, { ok: true, value: [{ slug: 'ops', level: 'owner' }] }];
  let asked = 0;
  await waitForOwner(async () => answers[Math.min(asked++, answers.length - 1)], 'ops', { ...clock, waitMs: 60_000 });
  assert.equal(asked, 4);

  await assert.rejects(waitForOwner(async () => ({ ok: true, value: [{ slug: 'ops', level: 'member' }] }), 'ops', { ...clock, waitMs: 60_000 }), /not as its owner/u);
  t = 0;
  await assert.rejects(waitForOwner(async () => ({ ok: true, value: [] }), 'ops', { ...clock, waitMs: 60_000 }), /Nobody signed in as the owner of ops in 1 minute,/u);
});
