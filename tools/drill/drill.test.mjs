/**
 * The drill against the Cloud harness (LCH-A03): `startCloud` from `apps/worker/test/cloud-serve.ts`, the Worker's own
 * `fetch` over a real Directory and real records, sign-up by invitation, and every letter it sends captured.
 *
 * GREEN ON THE HARNESS BEFORE IT MEETS PRODUCTION: every step passes with nothing skipped, and no line holds the address,
 * the code, the link, the cookie or the agent token. THEN BROKEN: the same drill on a Cloud with no mail sender, and
 * `mail` is the one red step, the ones after it saying they had no letter to open.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OPERATOR, startCloud } from '../../apps/worker/test/cloud-serve.ts';
import { HOST } from '../../apps/worker/test/cloud-harness.ts';
import { planFor, stranger } from '../canary/lane.d/60-stranger.mjs';
import { sweep } from './ends.mjs';
import { argsOf, ORDER, runDrill } from './run.mjs';
import { capturedMail, drill, NOTE } from './steps.mjs';

const SUPPORT = `help@${HOST}`;
const ADDRESS = 'drill-ceramics@example.test';

/** A Cloud by invitation, with a support address in its footer, and a drill code minted by its operator door. */
async function cloudWithCode(env = {}) {
  const c = await startCloud({ env: { SIGNUP: 'invite', SUPPORT_ADDRESS: SUPPORT, ...env } });
  const res = await c.ask('/account/ops/invite', { method: 'POST', bearer: OPERATOR, body: JSON.stringify({ note: NOTE }) });
  const link = ((await res.json()).value?.links ?? [])[0] ?? '';
  return { c, code: link.slice(link.indexOf('#code=') + '#code='.length) };
}

/** A drill on `c`, read through its captured letters, at one invented address of its own. */
const drillOn = (c, code, more = {}) =>
  drill({ host: c.base, publicHost: HOST, address: ADDRESS, code, mail: capturedMail(c.letters), sender: `signin@${HOST}`, support: SUPPORT, ip: '203.0.113.40', waitMs: 3_000, quietMs: 100, ...more });

test('THE WHOLE DRILL IS GREEN ON THE HARNESS, every step run, and no line holds a value', async () => {
  const { c, code } = await cloudWithCode();
  try {
    const d = drillOn(c, code);
    const lines = [];
    const results = await runDrill(d, { say: (l) => lines.push(l), sweepWith: { operatorKey: OPERATOR } });
    assert.deepEqual(results.map((r) => r.name), ORDER);
    for (const r of results) {
      assert.equal(r.pass, true, `${r.name}: ${r.said}`);
      assert.ok(!r.skipped, `${r.name} skipped: ${r.said}`);
    }
    const said = lines.join('\n');
    for (const v of [ADDRESS, code, d.cookie, d.bearer, d.link?.token, OPERATOR]) assert.ok(typeof v === 'string' && !said.includes(v), 'a line holds a value');
    assert.doesNotMatch(said, /@/u, 'a line holds an address');
    assert.match(said, /the letter “Finish making your BrainDog record” came in [\d.]+ seconds/u);
    assert.match(said, /the delete does not yet say what it kept/u, 'until destroy.ts answers what it kept, the step says so');
    /* THE LETTERS A STRANGER GETS: the link, the welcome, the notice of the close; and no sign-in link after it. */
    assert.deepEqual(c.letters.map((l) => l.subject), ['Finish making your BrainDog record', 'Your BrainDog record is ready', 'You are signed out of BrainDog']);
    assert.ok(!c.letters.some((l) => String(l.text).includes('#magic=')), 'a sign-in link went to the closed address');
  } finally {
    await c.close();
  }
});

/**
 * A SENDER THAT IS SET AND REFUSES EVERY LETTER, as Email Service does for a sender it has not verified. NOT AN UNSET
 * `AUTH_MAIL_FROM`: measured here, a Worker with none offers no sign-up at all (`/auth/signup/start` is 404), so that
 * break shows at `signup`, and the scope's "unset the mail sender" on alpha would too.
 */
const REFUSING = { send: async () => Promise.reject(new Error('the sender is not verified')) };

test('WITH A BROKEN MAIL SENDER, MAIL GOES RED BY ITSELF, and the steps after it skip for want of a letter', async () => {
  const { c, code } = await cloudWithCode({ EMAIL: REFUSING });
  try {
    const results = await runDrill(drillOn(c, code, { waitMs: 300 }), { steps: ORDER.filter((s) => s !== 'sweep') });
    const reds = results.filter((r) => !r.pass);
    assert.deepEqual(reds.map((r) => r.name), ['mail'], results.map((r) => `${r.name}: ${r.said}`).join('\n'));
    assert.match(reds[0].said, /no letter came within/u);
    const by = Object.fromEntries(results.map((r) => [r.name, r]));
    assert.equal(by.shut.skipped, undefined);
    assert.equal(by.signup.skipped, undefined);
    for (const n of ['verify-build', 'link-once', 'lockout', 'file-delete', 'close']) assert.equal(by[n].skipped, true, `${n}: ${by[n].said}`);
  } finally {
    await c.close();
  }
});

test('THE SWEEP DELETES A DRILL RECORD LEFT A DAY AGO, and leaves a stranger who is not the drill alone', async () => {
  const { c, code } = await cloudWithCode();
  try {
    /* A RUN CUT AFTER ITS RECORD WAS MADE, and somebody else's record beside it. */
    const cut = await runDrill(drillOn(c, code), { steps: ['shut', 'signup', 'mail', 'verify-build'] });
    assert.ok(cut.every((r) => r.pass && !r.skipped), cut.map((r) => r.said).join('\n'));
    const other = await c.provision('ines@example.test', { slug: 'ines-studio' });
    const mail = capturedMail(c.letters);
    const young = await sweep({ host: c.base, operatorKey: OPERATOR, mail, waitMs: 300 });
    assert.equal(young.said, 'no drill record older than a day was left.');
    const swept = await sweep({ host: c.base, operatorKey: OPERATOR, mail, now: Date.now() + 2 * 86_400_000, waitMs: 3_000 });
    assert.equal(swept.pass, true, swept.said);
    assert.equal(swept.said, '1 drill record older than a day was deleted.');
    const theirs = await fetch(`${c.base}/account/records`, { headers: { cookie: other.cookie } }).then((r) => r.json());
    assert.deepEqual(theirs.value.map((r) => r.slug), ['ines-studio'], 'the sweep touched a record that is not the drill’s');
    const again = await sweep({ host: c.base, operatorKey: OPERATOR, mail, now: Date.now() + 2 * 86_400_000, waitMs: 300 });
    assert.equal(again.said, 'no drill record older than a day was left.');
    assert.equal((await sweep({ host: c.base, mail })).skipped, true, 'without the operator key the sweep skips');
  } finally {
    await c.close();
  }
});

test('WITH THE OPERATOR KEY AND NO CODE, THE DRILL MINTS ITS OWN, noted drill, and signs up with it', async () => {
  const { c } = await cloudWithCode();
  try {
    const d = drillOn(c, null);
    const results = await runDrill(d, { steps: ['shut', 'signup', 'mail', 'verify-build'], sweepWith: { operatorKey: OPERATOR } });
    assert.ok(results.every((r) => r.pass && !r.skipped), results.map((r) => `${r.name}: ${r.said}`).join('\n'));
    const listed = await c.ask('/account/ops/invite', { bearer: OPERATOR }).then((r) => r.json());
    assert.deepEqual(listed.value.codes.map((x) => `${x.note} ${x.state}`).sort(), ['drill open', 'drill spent']);
  } finally {
    await c.close();
  }
});

test('THE COMMAND refuses production without --live, a step it does not have, and no host', () => {
  assert.match(argsOf(['--host', 'https://brain.dog']).wrong, /is production/u);
  assert.equal(argsOf(['--host', 'https://brain.dog', '--live']).host, 'https://brain.dog');
  assert.deepEqual(argsOf(['--host', 'https://alpha.brain.dog', '--steps', 'shut,mail']).steps, ['shut', 'mail']);
  assert.match(argsOf(['--host', 'https://alpha.brain.dog', '--steps', 'nap']).wrong, /no step called nap/u);
  assert.match(argsOf([]).wrong, /needs --host/u);
  assert.equal(argsOf(['--help']).help, true);
});

test('THE LANE RUNS THE DRILL ONLY WHEN ITS NAMES ARE SET, and says skipped otherwise', async () => {
  assert.match(planFor({}).line, /^skipped: no canary is named/u);
  const half = await stranger({ SMOKE_SLUG: 'canary-one', CANARY_MAIL_DOOR: 'x' });
  assert.equal(half.code, 3);
  assert.match(half.lines[0], /^skipped: CANARY_INVITE_CODE \(or DRILL_OPERATOR_KEY\), CANARY_INBOX_KEY are not set/u);
  assert.equal(planFor({ SMOKE_SLUG: 'canary-one', CANARY_MAIL_DOOR: 'x', CANARY_INBOX_KEY: 'k', DRILL_OPERATOR_KEY: 'o' }).run, true, 'the operator key mints the run its own code');
  const env = { SMOKE_SLUG: 'canary-one', CANARY_MAIL_DOOR: 'door@example.test', CANARY_INVITE_CODE: 'c', CANARY_INBOX_KEY: 'k', DRILL_OPERATOR_KEY: 'o' };
  let seen = null;
  const run = async (d, opts) => ((seen = { d, opts }), opts.say('  green  shut: fine'), [{ name: 'shut', pass: true, said: 'fine' }]);
  const out = await stranger(env, { run });
  assert.deepEqual(out, { code: 0, lines: ['green  shut: fine'] });
  assert.equal(seen.d.host, 'https://brain.dog');
  assert.equal(seen.d.mail.kind, 'inbox');
  assert.equal(seen.opts.sweepWith.operatorKey, 'o');
  const redOut = await stranger(env, { run: async () => [{ name: 'mail', pass: false, said: 'no letter' }] });
  assert.equal(redOut.code, 1);
});
