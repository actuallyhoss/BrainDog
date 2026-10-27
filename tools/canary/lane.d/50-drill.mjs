/**
 * The lane's fifth step: the hold's fire drill.
 *
 * WHY. The seven-day hold counts days on which every watched sign read green (`holdDays`, `packages/kernel/src/hold.ts`).
 * A counter nobody ever sees go back to 0 may simply be broken, so it is tested the way a fire drill tests an alarm:
 * three arrivals that cannot file are let in, a night passes, the hold must read 0 and say that arrivals did not file,
 * and then the three are cleared and the sign must stop reading red.
 *
 * ON A FRESH SELF-HOST, EVERY RUN, "self-host only". The self-host is `apps/selfhost`'s own server, as `selfHost` in
 * `../lib.mjs` starts it, with one difference: `selfHost` pins the record's clock at the seed's instant, and a drill
 * needs a night to pass, so this one starts the same server on a clock it moves (`drillHost`). The record gets a door of
 * its own whose pattern no drill message meets (`DECLS`); its token is minted by the record and the three arrivals come
 * in through `/in/webhook/...` as any sender's would. The night is the record's own (`drain` once the clock is past five
 * past midnight); the hold is read through `metric green-days` and the arrivals are cleared through `archiveArrival`,
 * each over HTTP with the self-host's key, as an owner would.
 *
 * ON THE CANARY IT WAITS on the owner's sitting (a drill door on the canary and its address kept as the secret
 * `CANARY_DRILL_DOOR`) and on a decision for a weekly production run. Until the weekly run sets `CANARY_DRILL=weekly`,
 * a deploy drills a fresh self-host and says so. Once it does: on a Monday (UTC) the three arrivals go to the canary's
 * drill door; on a Tuesday the hold is read with the smoke's key and must be 0, and the lane signs in by itself (the look
 * ended the session it kept, `30-look.mjs`) to clear the three, then signs out. Any other day it has nothing to do.
 *
 * A RED HERE OPENS A FINDING; it does not roll back. No line names the key, a token, an address or a record id.
 */

import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HOLD_NAMES } from '../../../packages/kernel/src/hold.ts';
import { call, cookieFor, endSession, fixOf, SELF_HOST_ONLY, sessionFrom, where } from '../lib.mjs';

export const onRed = 'finding';

/** How many arrivals the drill lets in: the scope's three. */
export const ARRIVALS = 3;

/** Words every drill arrival carries, so clearing takes the drill's own and nothing else. */
export const MARK = 'BrainDog fire drill';

/** The door the drill's arrivals come in at, on the self-host and, after the owner's sitting, on the canary. */
export const DOOR = 'fire-drill';

/** The list the door would file into, were anything to match. */
const LIST = 'fire_drill';

/** What the hold must say once the drill's night has passed. */
const ARRIVALS_SIGN = HOLD_NAMES['arrivals-filed'];

const DAY = 86_400_000;

/**
 * The drill door and the list it would file into. Its pattern asks for words no drill message holds, so every arrival
 * at it is stored and waits, which is exactly an arrival that cannot file. Nothing here names a bank, a list of his or a
 * record.
 */
export const DECLS = [
  { id: `register.${LIST}`, kind: 'register', body: { id: LIST, name: 'Fire drill', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } },
  {
    id: `ingest.${DOOR}`,
    kind: 'ingest',
    body: {
      ingest: DOOR,
      channel: 'webhook',
      verify: { kind: 'path' },
      description: 'Arrivals the weekly fire drill sends, which no pattern files.',
      map: { body: { path: '$.text', type: 'text' } },
      match: { field: 'body', contains: 'no fire drill message says this' },
      writes: { register: LIST },
    },
  },
];

/**
 * A fresh self-host on a clock the drill moves: `{ at, clock, drain, mint, close }`. `at` is what `call` takes. `decls`
 * replaces the drill door, for a test that hands it one that files.
 */
export async function drillHost({ startMs = Date.parse('2026-10-05T10:00:00Z'), decls = DECLS } = {}) {
  const { start } = await import('../../../apps/selfhost/src/server.ts');
  const { IDENTITY } = await import('../../gates/record.mjs');
  let now = startMs;
  const key = randomBytes(32).toString('base64url');
  const running = await start({ file: ':memory:', port: 0, host: '127.0.0.1', now: () => now, pollMs: 0, token: key, sessionKey: new Uint8Array(randomBytes(32)) });
  try {
    const named = running.api.kernel.createRecord({ ...IDENTITY, tz: 'UTC' });
    if (!named.ok) throw new Error(`the drill's record could not be named: ${named.refusal?.fix ?? 'no reason given'}`);
    const put = await running.api.kernel.install(decls);
    if (!put.ok) throw new Error(`the drill's door could not be set up: ${put.refusal?.fix ?? 'no reason given'}`);
  } catch (e) {
    await running.close().catch(() => {});
    throw e;
  }
  const base = `http://127.0.0.1:${running.server.address().port}`;
  return {
    at: { base, origin: base, bearer: key },
    clock: { now: () => now, set: (ms) => (now = ms) },
    drain: () => running.drain(),
    close: () => running.close(),
  };
}

/** Five past midnight, the record's night, on the day `days` after `ms` (UTC, the drill's zone), and a minute more. */
export const nightAfter = (ms, days) => Math.floor(ms / DAY) * DAY + days * DAY + 6 * 60_000;

/** Let the three in at `url`, each a message no pattern files. The statuses the door answered, in order. */
export async function plant(url, { n = ARRIVALS, send = fetch, day = new Date().toISOString().slice(0, 10) } = {}) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const res = await send(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `${MARK} of ${day}, arrival ${i} of ${n}. Nothing should file this.` }), redirect: 'error' }).catch(() => null);
    out.push(res?.status ?? 0);
  }
  return out;
}

/** The verdict on `metric green-days` after the drill's night: `{ red, line }`. Green only at 0, ended by the arrivals. */
export function judgeHold(answer) {
  const v = answer?.said?.ok === true ? answer.said.value : null;
  if (v === null || typeof v !== 'object') return { red: true, line: `the hold could not be read: ${fixOf(answer)}.` };
  if (v.value !== 0) return { red: true, line: `the hold reads ${v.value ?? 'nothing'} after three arrivals waited a night, where it must read 0: ${v.why ?? 'no reason given'}` };
  if (!String(v.why ?? '').includes(`${ARRIVALS_SIGN}” read red`)) return { red: true, line: `the hold reads 0, but not because arrivals waited: ${v.why ?? 'no reason given'}` };
  return { red: false, line: `the hold went back to 0, and says why: ${v.why}` };
}

/** The words `plant` sends, and nothing a person would write: only an arrival that is all of this is the drill's. */
const PLANTED = new RegExp(`^${MARK} of \\d{4}-\\d{2}-\\d{2}, arrival \\d+ of \\d+\\. Nothing should file this\\.$`);

/** Whether a waiting arrival is one `plant` sent: the webhook keeps the body it was sent, `{ text }`, as it came. */
const planted = (a) => {
  const body = String(a?.body ?? '').trim();
  let text = body;
  try {
    const j = JSON.parse(body);
    if (j && typeof j.text === 'string') text = j.text;
  } catch {
    /* kept as words */
  }
  return PLANTED.test(text.trim());
};

/**
 * Take the drill's own arrivals out of the inbox: the waiting ones, in either waiting state and on every page, whose
 * words are exactly what `plant` sent. They are all found before any is archived, so archiving never moves a page.
 * How many it took.
 */
export async function clear(at, send = fetch) {
  const ids = [];
  for (const state of ['untriaged', 'review']) {
    let cursor = null;
    for (let page = 0; page < 20; page++) {
      const inbox = await call(at, 'inbox', { state, limit: 50, ...(cursor === null ? {} : { cursor }) }, { send });
      if (inbox.said?.ok !== true) throw new Error(`the inbox could not be read to clear the drill: ${fixOf(inbox)}`);
      for (const a of inbox.said.value.arrivals ?? []) if (planted(a)) ids.push(a.id);
      cursor = inbox.said.value.cursor ?? null;
      if (cursor === null) break;
    }
  }
  let n = 0;
  for (const id of new Set(ids)) {
    const done = await call(at, 'archiveArrival', { id }, { send });
    if (done.said?.ok !== true) throw new Error(`a drill arrival could not be cleared: ${fixOf(done)}`);
    n++;
  }
  return n;
}

/** The verdict once cleared: the arrivals sign, read now, is no longer red. `{ red, line }`. */
export function judgeCleared(signs) {
  const s = (Array.isArray(signs?.said?.value?.signs) ? signs.said.value.signs : Array.isArray(signs?.said?.value) ? signs.said.value : []).find((x) => x?.sign === 'arrivals-filed');
  if (!s) return { red: true, line: 'after clearing, the signs answered no arrivals sign.' };
  if (s.state === 'red') return { red: true, line: `after clearing, \u201c${ARRIVALS_SIGN}\u201d still reads red: ${s.said}` };
  return { red: false, line: `cleared, and \u201c${ARRIVALS_SIGN}\u201d no longer reads red.` };
}

/**
 * The whole drill on a fresh self-host: the door's token minted, three arrivals let in, a night and a day passed, the
 * hold read at 0, then cleared. The lines it says, and what was wrong (empty when the alarm works). `send` is how the three
 * go in, for a test that sends them where the sign does not count them.
 */
export async function selfHostDrill({ say = () => {}, decls, send = fetch } = {}) {
  const host = await drillHost({ decls });
  const wrong = [];
  try {
    const minted = await call(host.at, 'ingestMint', { ingest: DOOR });
    if (minted.said?.ok !== true || typeof minted.said.value?.path !== 'string') throw new Error(`the drill door's address could not be made: ${fixOf(minted)}`);
    const took = await plant(`${host.at.base}${minted.said.value.path}`, { send, day: new Date(host.clock.now()).toISOString().slice(0, 10) });
    if (took.some((s) => s !== 202)) wrong.push(`the door answered ${took.join(', ')} to the three arrivals, where each must be 202.`);
    else say(`${ARRIVALS} arrivals that cannot file were let in.`);
    /* TWO NIGHTS, so by the second they have waited more than a day, whichever of the sign's rules sees them first. */
    for (let night = 0; night < 2; night++) {
      host.clock.set(nightAfter(host.clock.now(), 1));
      await host.drain();
    }
    const held = judgeHold(await call(host.at, 'metric', { metric: 'green-days' }));
    if (held.red) wrong.push(held.line);
    else say(held.line);
    const n = await clear(host.at);
    if (n !== ARRIVALS) wrong.push(`clearing took ${n} drill arrivals, where it let in ${ARRIVALS}.`);
    const after = judgeCleared(await call(host.at, 'signs', {}));
    if (after.red) wrong.push(after.line);
    else say(after.line);
  } finally {
    await host.close();
  }
  return wrong;
}

/** What the weekly run does on the canary on the day of `ms` (UTC): `plant` on a Monday, `read` on a Tuesday, else null. */
export function canaryStep(ms) {
  const d = new Date(ms).getUTCDay();
  return d === 1 ? 'plant' : d === 2 ? 'read' : null;
}

/**
 * The weekly drill on the canary, once the owner's sitting made its door and B25 made the weekly run. Monday lets the three in;
 * Tuesday reads the hold with the smoke's key, then signs in by itself to clear them and signs out. `io` holds `signIn`
 * (the passkey sign-in, `tools/gates/signin-live.mjs`), stubbed in the tests. Answers `{ code, lines }`.
 */
export async function canaryDrill(place, env, { nowMs = Date.now(), send = fetch, io = {} } = {}) {
  const door = String(env.CANARY_DRILL_DOOR ?? '').trim();
  const key = String(env.SMOKE_TOKEN ?? '').trim();
  if (!door) return { code: 1, lines: [`the weekly drill is on and CANARY_DRILL_DOOR is not set, so the canary ${place.slug} has no drill door to send to.`] };
  if (!key) return { code: 1, lines: [`the weekly drill is on and SMOKE_TOKEN is not set, so the hold on the canary ${place.slug} cannot be read.`] };
  const step = canaryStep(nowMs);
  if (step === null) return { code: 0, lines: [`nothing today: the drill lets arrivals in on Mondays and reads the hold on Tuesdays.`] };
  if (step === 'plant') {
    const took = await plant(door, { send, day: new Date(nowMs).toISOString().slice(0, 10) });
    if (took.some((s) => s !== 202)) return { code: 1, lines: [`the canary's drill door answered ${took.join(', ')}, where each must be 202.`] };
    return { code: 0, lines: [`${ARRIVALS} arrivals that cannot file were let in on the canary ${place.slug}; Tuesday's run reads the hold at 0.`] };
  }
  const lines = [];
  const held = judgeHold(await call({ origin: place.origin, slug: place.slug, live: true, bearer: key }, 'metric', { metric: 'green-days' }, { send }));
  lines.push(held.line);
  /* SIGNED IN BY ITSELF: the look ended the session the lane kept, and clearing is an owner's act the smoke's key is not. */
  const file = join(String(env.RUNNER_TEMP ?? '').trim() || tmpdir(), 'braindog-canary', 'drill-session.json');
  let cookie = null;
  try {
    const signIn = io.signIn ?? (async (e) => (await import('../../gates/signin-live.mjs')).default(undefined, e));
    const code = await signIn({ ...env, CANARY_SESSION: file });
    const kept = await sessionFrom({ CANARY_SESSION: file }, io.read);
    cookie = kept.state ? cookieFor(kept.state, place.origin) : null;
    if (code || cookie === null) return { code: 1, lines: [...lines, `the drill could not sign in to clear its arrivals: ${kept.why ?? `the sign-in ended with ${code}`}`] };
    const n = await clear({ origin: place.origin, slug: place.slug, live: true, cookie }, send);
    if (n !== ARRIVALS) lines.push(`clearing took ${n} drill arrivals on the canary, where Monday let in ${ARRIVALS}.`);
    const after = judgeCleared(await call({ origin: place.origin, slug: place.slug, live: true, bearer: key }, 'signs', {}, { send }));
    lines.push(after.line);
    return { code: held.red || after.red || n !== ARRIVALS ? 1 : 0, lines };
  } finally {
    await endSession(place.origin, cookie, file, send);
    await rm(file, { force: true }).catch(() => {});
  }
}

async function main(env = process.env) {
  const place = where({ ...env, CANARY_ORIGIN: env.CANARY_ORIGIN || (env.DEPLOY_HOST ? `https://${env.DEPLOY_HOST}` : '') });
  if (place.live && String(env.CANARY_DRILL ?? '').trim() === 'weekly') {
    const out = await canaryDrill(place, env);
    for (const l of out.lines) (out.code ? console.error : console.log)(`  drill, on the canary ${place.slug}: ${l}`);
    return out.code;
  }
  if (place.live) console.log(`  drill, on the canary ${place.slug}: waits on the owner's sitting and on a decision for a weekly production run (B25), so this deploy drills a fresh self-host.`);
  const lines = [];
  const wrong = await selfHostDrill({ say: (l) => lines.push(l) });
  for (const l of lines) console.log(`  drill, ${SELF_HOST_ONLY}: ${l}`);
  for (const w of wrong) console.error(`  drill, ${SELF_HOST_ONLY}: red: ${w}`);
  return wrong.length ? 1 : 0;
}

if (import.meta.main)
  main().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(`  drill stopped: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      process.exitCode = 1;
    },
  );
