/**
 * The drill against the Cloud harness: `startCloud` from `apps/worker/test/cloud-serve.ts`, the Worker's own
 * `fetch` over a real Directory and real records, sign-up by invitation, and every letter it sends captured.
 *
 * GREEN ON THE HARNESS BEFORE IT MEETS PRODUCTION: every step passes with nothing skipped, and no line holds the address,
 * the code, the link, the cookie or the agent token. THEN BROKEN: the same drill on a Cloud with no mail sender, and
 * `mail` is the one red step, the ones after it saying they had no letter to open.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OPERATOR, startCloud } from '../../apps/worker/test/cloud-serve.ts';
import { HOST } from '../../apps/worker/test/cloud-harness.ts';
import { planFor, stranger } from '../canary/lane.d/60-stranger.mjs';
import { close, erase, fileDelete, soleOwnerFix, sweep } from './ends.mjs';
import { argsOf, ORDER, runDrill } from './run.mjs';
import { capturedMail, drill, NOTE } from './steps.mjs';
import { countsWorking, drill as leakDrill, hiddenAmounts, inRepository, KNOWN } from './leak-on-copy.mjs';
import { openKeyStore, recordKeys } from '../../apps/selfhost/src/keys.ts';
import { signerFor } from '../../apps/selfhost/src/sign.ts';
import { build as leakRecord } from '../../packages/record/test/leak/fixture.ts';
import { openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { SHARE_TEMPLATES } from '../../packages/kernel/src/share-templates.ts';

const SUPPORT = `help@${HOST}`;
const ADDRESS = 'drill-ceramics@example.test';

const SECOND = 'drill-second@example.test';

/**
 * A Cloud by invitation, with a support address in its footer, and a drill code minted by its operator door.
 *
 * ITS QUEUE IS RUN, as the platform runs it: a record's doorbell (`INGRESS.send`) hands the Worker's own `queue` the
 * message a moment later, so an erasure's `erase.r2` reaches the bucket here as it does on a host, and `erase` sees the
 * file's address go quiet by the same path.
 */
async function cloudWithCode(env = {}) {
  let ref = null;
  const rung = (body) => ({ body, ack() {}, retry() {} });
  /* THE HARNESS NAMES ITS RECORDS BY THE ID ITSELF, so the id a doorbell carries is read back as the same string. */
  const queued = () => ({ ...ref.cloud.env, RECORD: { ...ref.cloud.env.RECORD, idFromString: (id) => id } });
  const INGRESS = { send: async (body) => void setTimeout(() => void ref?.cloud.bundle.default.queue({ messages: [rung(body)] }, queued()).catch(() => {}), 0) };
  const c = await startCloud({ env: { SIGNUP: 'invite', SUPPORT_ADDRESS: SUPPORT, INGRESS, ...env } });
  ref = c;
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
    const d = Object.assign(drillOn(c, code), { second: { address: SECOND, mail: capturedMail(c.letters) }, operatorKey: OPERATOR });
    const lines = [];
    const results = await runDrill(d, { say: (l) => lines.push(l), sweepWith: { operatorKey: OPERATOR } });
    assert.deepEqual(results.map((r) => r.name), ORDER);
    for (const r of results) {
      assert.equal(r.pass, true, `${r.name}: ${r.said}`);
      assert.ok(!r.skipped, `${r.name} skipped: ${r.said}`);
    }
    const said = lines.join('\n');
    for (const v of [ADDRESS, SECOND, code, d.cookie, d.bearer, d.link?.token, OPERATOR]) assert.ok(typeof v === 'string' && !said.includes(v), 'a line holds a value');
    assert.doesNotMatch(said, /@/u, 'a line holds an address');
    assert.match(said, /the letter “Finish making your BrainDog” came in [\d.]+ seconds/u);
    /* UNTIL THE RECORD'S DELETE PASSES `destroyRecord`'s ANSWER ON, the step says it cannot read it; then it says it. */
    assert.match(said, /the delete does not yet say what it kept|it kept one final copy, named final-, and removed \d+ other/u);
    assert.match(said, /erase: a second person was let in by invitation and attached a file; once the owner erased them/u);
    assert.match(said, /close: while it alone owned its record, a close was refused \(“Delete drill-[a-z0-9-]+, or make somebody else its owner, first\.”\)/u);
    /* THE LETTERS A STRANGER GETS: the link, the welcome, the notice of the close; and no sign-in link after it. */
    const theirs = c.letters.filter((l) => String(l.to).toLowerCase() === ADDRESS);
    assert.deepEqual(theirs.map((l) => l.subject), ['Finish making your BrainDog', 'Your BrainDog is ready', 'You are signed out of BrainDog']);
    /* THE SECOND ADDRESS IS CLOSED BY `erase`, or the next run's invitation would ask it to sign in first. */
    const second = c.letters.filter((l) => String(l.to).toLowerCase() === SECOND);
    assert.equal(second.at(-1)?.subject, 'You are signed out of BrainDog', 'the second address was left open for the next run');
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
    for (const n of ['verify-build', 'link-once', 'erase', 'lockout', 'file-delete', 'close']) assert.equal(by[n].skipped, true, `${n}: ${by[n].said}`);
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
  assert.equal(argsOf(['--host', 'https://alpha.brain.dog', '--pay']).pay, true, '--pay walks the money after the drill');
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
  assert.equal(seen.d.host, 'https://app.brain.dog');
  assert.equal(seen.d.mail.kind, 'inbox');
  assert.equal(seen.opts.sweepWith.operatorKey, 'o');
  const redOut = await stranger(env, { run: async () => [{ name: 'mail', pass: false, said: 'no letter' }] });
  assert.equal(redOut.code, 1);
});

/* ---- The ends against a fake door: the host's answers written out, so each line is read with and without them. ---- */

const SLUG = 'drill-kiln-1';

/** A host that answers by method and path from `routes`, `{ status, body }` each, and keeps every ask. */
function door(routes) {
  const asked = [];
  const send = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const key = `${init.method ?? 'GET'} ${path}`;
    asked.push({ key, body: init.body });
    const r = typeof routes[key] === 'function' ? routes[key](init) : (routes[key] ?? { status: 404, body: { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No such door.' } } });
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  };
  return { send, asked };
}

/** A drill signed in to its own record on the fake door. */
const fakeDrill = (send) => Object.assign(drill({ host: 'https://alpha.example.test', address: ADDRESS, send }), { cookie: 'bd_s=drill-session', made: { slug: SLUG } });

const ALONE = { status: 403, body: { ok: false, refusal: { code: 'LEVEL_REQUIRED', fix: soleOwnerFix(SLUG), at: 'records' } } };

/** The doors `file-delete` asks, with the delete answering `value`. */
const deleting = (value) => ({
  [`PUT /${SLUG}/api/files`]: { body: { sha256: 'a'.repeat(64) } },
  'POST /account/close': ALONE,
  [`POST /${SLUG}/api/deleteRecord`]: { body: { ok: true, value } },
  [`POST /${SLUG}/api/boot`]: { status: 404, body: { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'This BrainDog was deleted.' } } },
  'GET /account/records': { body: { ok: true, value: [] } },
});

test('FILE-DELETE SAYS WHAT THE DELETE KEPT when the host answers it, and says it cannot read it when it does not', async () => {
  const kept = await fileDelete(fakeDrill(door(deleting({ slug: SLUG, deleted: true, kept: 'rec_x/snapshots/final-2026-10-15.brainl.age', removed: 3 })).send));
  assert.equal(kept.pass, true, kept.said);
  assert.match(kept.said, /deleted by its name and no longer opens; it kept one final copy, named final-, and removed 3 other copies and files\.$/u);
  assert.doesNotMatch(kept.said, /rec_x/u, 'the line printed the copy’s key, which holds the record’s id');

  const one = await fileDelete(fakeDrill(door(deleting({ slug: SLUG, deleted: true, kept: 'rec_x/snapshots/final-2026-10-15.brainl.age', removed: 1 })).send));
  assert.match(one.said, /removed 1 other copy or file\.$/u);

  const before = await fileDelete(fakeDrill(door(deleting({ slug: SLUG, deleted: true })).send));
  assert.equal(before.pass, true, before.said);
  assert.match(before.said, /the delete does not yet say what it kept, so what was kept cannot be read\.$/u);

  const astray = await fileDelete(fakeDrill(door(deleting({ slug: SLUG, deleted: true, kept: 'rec_x/snapshots/latest.brainl.age', removed: 2 })).send));
  assert.equal(astray.pass, false);
  assert.match(astray.said, /not a final copy/u);
  const uncounted = await fileDelete(fakeDrill(door(deleting({ slug: SLUG, deleted: true, kept: 'rec_x/snapshots/final-2026-10-15.brainl.age' })).send));
  assert.equal(uncounted.pass, false);
  assert.match(uncounted.said, /not how many/u);
});

test('ERASE SKIPS AND SAYS WHY without a second address and its key, and prints neither when they are half there', async () => {
  const d = fakeDrill(door({}).send);
  const none = await erase(d, {});
  assert.equal(none.skipped, true);
  assert.equal(none.said, 'skipped: DRILL_SECOND_ADDRESS and DRILL_SECOND_KEY are not set, so there is no second person to erase.');
  const half = await erase(d, { DRILL_SECOND_ADDRESS: 'drill-second@example.test' });
  assert.equal(half.said, 'skipped: DRILL_SECOND_KEY is not set, so there is no second person to erase.');
  const unnamed = await erase(d, { DRILL_SECOND_ADDRESS: 'drill-second@example.test', DRILL_SECOND_KEY: 'k-second-key' });
  assert.equal(unnamed.said, 'skipped: no canary is named (SMOKE_SLUG), so the second address’s letters cannot be read.');
  for (const r of [none, half, unnamed]) assert.doesNotMatch(r.said, /@|k-second-key/u);
  const keyless = await erase(Object.assign(fakeDrill(door({}).send), { second: { address: 'drill-second@example.test', mail: capturedMail([]) } }), {});
  assert.equal(keyless.said, 'skipped: no operator key, so the drill’s record cannot leave Free, where nobody else can join.');
  const recordless = await erase(drill({ host: 'https://alpha.example.test', send: door({}).send }), {});
  assert.equal(recordless.said, 'skipped: there is no record of the drill’s to share.');
});

test('CLOSE HOLDS THE SOLE-OWNER RULE: refused with the door’s sentence while the drill alone owns its record', async () => {
  /* THE RECORD STILL STANDS: the close is asked, refused, and the account left open. */
  const standing = door({ 'POST /account/close': ALONE });
  const r = await close(fakeDrill(standing.send));
  assert.equal(r.pass, true, r.said);
  assert.equal(r.said, `while it alone owned its record, the close was refused: “Delete ${SLUG}, or make somebody else its owner, first.” The record still stands, so the account was left open.`);
  assert.deepEqual(standing.asked.map((a) => a.key), ['POST /account/close']);

  /* A DOOR THAT REFUSES IN OTHER WORDS, or closes an owner's account, is red. */
  const other = await close(fakeDrill(door({ 'POST /account/close': { status: 403, body: { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Not now.' } } } }).send));
  assert.equal(other.pass, false);
  assert.match(other.said, /not the door’s sentence: “Not now\.”/u);
  const orphaned = await close(fakeDrill(door({ 'POST /account/close': { body: { ok: true, value: {} } } }).send));
  assert.equal(orphaned.pass, false);
  assert.match(orphaned.said, /left with no owner/u);

  /* AFTER FILE-DELETE: the refusal it saw before the delete is said, then the account closes. */
  const nobody = { status: 202, body: { ok: true, value: { sent: true } } };
  const after = door({ 'POST /account/close': { body: { ok: true, value: { closed: true } } }, 'POST /auth/magic/start': nobody });
  const d = Object.assign(fakeDrill(after.send), { deleted: true, soleOwner: { status: 403, fix: soleOwnerFix(SLUG), refused: true, closed: false } });
  const closed = await close(d);
  assert.equal(closed.pass, true, closed.said);
  assert.match(closed.said, new RegExp(`^while it alone owned its record, a close was refused \\(“Delete ${SLUG}, or make somebody else its owner, first\\.”\\); then the account closed`, 'u'));
  const wrong = await close(Object.assign(fakeDrill(after.send), { deleted: true, soleOwner: { status: 200, fix: null, refused: false, closed: false } }));
  assert.equal(wrong.pass, false);
});

/* ── the leak drill on a copy ───────────────────────── */

/** The leak matrix's record, kept as a `.brain` file the leak drill opens a copy of, with no grants of its own. */
async function leakFile() {
  const dir = mkdtempSync(join(tmpdir(), 'leak-drill-test-'));
  const file = join(dir, 'studio.brain');
  (await leakRecord({ file, shapes: [] })).sql.close();
  return { dir, file };
}

const leakCli = (file) => spawnSync(process.execPath, [new URL('./leak-on-copy.mjs', import.meta.url).pathname, file], { encoding: 'utf8' });

test('THE LEAK DRILL MAKES EVERY TEMPLATE A REAL SHARE AND FINDS NOTHING on the leak matrix\'s record, with no gap tolerated', async () => {
  const { dir, file } = await leakFile();
  try {
    assert.deepEqual(KNOWN, {});
    const report = await leakDrill(file);
    assert.deepEqual(report.skipped, []);
    assert.deepEqual(report.grants.map((g) => g.template).sort(), [...SHARE_TEMPLATES.map((t) => t.id), 'project-no-amounts'].sort());
    for (const g of report.grants) assert.deepEqual(g.leaks, [], g.template);
    /* DENIES AND HIDES ARE MADE AS THE TEMPLATES SAY THEM, and the guest held to them sees some rows and not all. */
    assert.ok(report.grants.some((g) => g.rows.some((r) => r.effect === 'deny')));
    const hidden = report.grants.find((g) => g.template === 'project-no-amounts');
    assert.ok(hidden.amounts > 0 && hidden.sees > 0 && hidden.hidden > 0, JSON.stringify(hidden));
    const run = leakCli(file);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /6 share\(s\), 0 leak\(s\)/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('THE LEAK DRILL TAKES AN EXPORT: a .brainl is restored into a throwaway folder and drilled, and a file in the repository is refused', async () => {
  /* SIGNED AS A HOST SIGNS ITS NIGHTLY COPY, under a root key of the test's own, since a restore takes no unsigned file. */
  const dir = mkdtempSync(join(tmpdir(), 'leak-drill-test-'));
  try {
    const store = await openKeyStore(join(dir, 'kek'));
    const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
    let signer = null;
    const built = await leakRecord({ file: join(dir, 'studio.brain'), shapes: [], keys: await recordKeys(store, REC), sign: async (bytes) => (signer ? signer(bytes) : null) });
    signer = await signerFor(built.sql, store, REC);
    assert.ok(signer, 'the fixture has no signing key');
    const out = await built.api.kernel.export({ redactGrants: false, actor: 'system' });
    assert.ok(out.ok, JSON.stringify(out));
    built.sql.close();
    const brainl = join(dir, 'studio.brainl');
    writeFileSync(brainl, `${out.value.join('\n')}\n`);
    const report = await leakDrill(brainl);
    assert.equal(report.file, brainl);
    assert.deepEqual(report.skipped, []);
    assert.equal(report.grants.length, SHARE_TEMPLATES.length + 1);
    for (const g of report.grants) assert.deepEqual(g.leaks, [], g.template);
    const run = leakCli(brainl);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /share\(s\), 0 leak\(s\)/u);
    assert.ok(inRepository(new URL('./leak-on-copy.mjs', import.meta.url).pathname));
    assert.ok(!inRepository(brainl));
    await assert.rejects(leakDrill(new URL('./leak-on-copy.mjs', import.meta.url).pathname), /inside this repository/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A PLANTED LEAK FAILS THE LEAK DRILL: a guest the record answers more than its share is caught by the ids', async () => {
  const { dir, file } = await leakFile();
  try {
    /* THE RECORD IS PLANTED WITH MORE THAN THE SHARES SAY: an Admin's row for the one-row guest, and a whole-record read
       for the guest amounts are hidden from, before the drill makes either share. (The record still masks her amounts,
       a member row and all, so the amounts are proved by `hiddenAmounts` below.) */
    const sql = openSqlite(file);
    for (const [person, level] of [['p_leak_one_row', 'decide'], ['p_leak_project_no_amounts', 'read']]) {
      sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', person, `${person}@leak-drill.invalid`, person);
      sql.exec("INSERT INTO member (person_id, register, level) VALUES (?, '*', ?)", person, level);
    }
    sql.close();
    const report = await leakDrill(file);
    const of = (id) => report.grants.find((g) => g.template === id)?.leaks.join('\n') ?? report.skipped.join(' / ');
    assert.match(of('one-row'), /id\(s\) out of sight/u);
    assert.match(of('project-no-amounts'), /id\(s\) out of sight/u);
    assert.equal(of('accountant'), '');
    const run = leakCli(file);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /LEAK: /u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('THE LEAK DRILL FAILS A BOOT THAT COUNTS AN AGENT WORKING for a guest who may not open the runs, and not one who may', () => {
  const booted = (working, listed = []) => ({ ok: true, value: { waits: { working }, working: listed } });
  assert.equal(countsWorking(booted(0), { grant: { agents: false } }), null);
  assert.match(countsWorking(booted(1), { grant: { agents: false } }), /^boot: counts 1 agent\(s\) working/u);
  assert.match(countsWorking(booted(0, [{}]), {}), /^boot: counts 1 agent/u);
  assert.equal(countsWorking(booted(2), { grant: { agents: true } }), null);
  assert.equal(countsWorking({ ok: false }, {}), null);
});

test('THE LEAK DRILL HOLDS EVERY AMOUNT ON A ROW IN SIGHT against a guest amounts are hidden from, a field\'s and one in text', () => {
  const registers = new Map([['money', { fields: [{ id: 'payee', type: 'text' }, { id: 'amount', type: 'money' }, { id: 'old', type: 'money', retired: true }] }]]);
  const row = { register: 'money', fields: { payee: 'Paid £923.47 and $5 for clay', amount: { amount: 92347, currency: 'GBP' }, old: { amount: 55555, currency: 'GBP' } } };
  const said = hiddenAmounts([row, { register: 'money', fields: { amount: { amount: 42, currency: 'GBP' } } }], registers);
  assert.deepEqual(said.sort(), ['"amount":92347', '$5', '£923.47'].sort());
  /* AND A MASKED ANSWER CARRIES NONE OF THEM. */
  const masked = JSON.stringify({ fields: { payee: 'Paid £… and $… for clay', amount: { currency: 'GBP' } } });
  assert.deepEqual(said.filter((a) => masked.includes(a)), []);
  assert.deepEqual(said.filter((a) => JSON.stringify(row).includes(a)).sort(), said.sort());
});
