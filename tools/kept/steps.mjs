/**
 * The kept lane's steps: a fresh founder's record, made by sign-up, the add-ons installed from the catalogue, fed from a
 * stand-in the lane owns, one schedule turn, and the rows read back.
 *
 * NOTHING HERE IS HIS. The record is a stranger's, signed up through the public path by the drill's own steps
 * (`tools/drill/steps.mjs`, imported and never written again), and every add-on goes in through the record's own
 * install door with the file the catalogue publishes (`apps/web/static/catalogue`), never a document `packages/seed`
 * builds. What a stranger gets is what he gets.
 *
 * A LANE IS A DRILL WITH MORE STATE. `kept()` makes one with `drill()` and adds the catalogue it reads, the harness it
 * may be on, and its stand-in; `ask`, `api`, `hide`, `ok`, `red` and `skip` are the drill's, so a line here holds no
 * address, code, link, cookie or token, and no key the lane put in its own vault.
 *
 * THE HARNESS IS HANDED IN, NEVER FOUND. On the Cloud harness the test hands `harness`: its `turn` moves the clock for
 * the record (every pending schedule row due, the alarm rung), and its stand-in answers the hosts the add-ons call. On a
 * real host there is neither: a poll is pressed with Run now and waited for, a script waits its own hour, and a step that
 * needs the stand-in skips and says why (the JSON address is SHL-C03's `/probe/ok`, which is not built).
 */

import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { fileChecksum, offeredVersion } from '../../packages/declare/src/catalogue.ts';
import { api, ask, drill, fixOf, hide, mail, ok, red, signup, skip, verifyBuild } from '../drill/steps.mjs';

export { api, ask, fixOf, hide, ok, red, skip };

/**
 * The start of the lane's records' names. A drill's, so that the drill's own sweep (`tools/drill/ends.mjs`), which
 * deletes only records named `drill-…` signed up with a drill code, takes a record a cut run left behind.
 */
export const PREFIX = 'drill-kept-';

/** An invented founder's sentence, and nothing of anybody's. */
export const SENTENCE = 'We are two people making a booking app for pottery studios and want our projects, money and runway in one place.';

/** The name the stranger is set up under: invented. */
export const FOUNDER = 'Wren Calloway';

/** The use case a founder is set up with, through the record's own first-run door. */
export const USECASE = 'founder';

/** How long a real host is given to run what Run now was pressed on. */
export const TURN_MOST_MS = 90_000;

const HERE = new URL('../../apps/web/static/catalogue/', import.meta.url);

/** The catalogue as the web shell publishes it, read from the folder: `path` to its text, or null. */
export const diskCatalogue = (root = fileURLToPath(HERE)) => async (path) => readFile(`${root.replace(/\/$/u, '')}/${path}`, 'utf8').catch(() => null);

/** The catalogue a host serves at `/catalogue/` (or under `/app`, on a host built before the app left it), or null for a file it does not hold. */
export const hostCatalogue = (host, send = fetch) => async (path) => {
  for (const place of ['/catalogue/', '/app/catalogue/']) {
    const res = await send(`${new URL(host).origin}${place}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (res?.ok && (res.headers.get('content-type') ?? '').includes('json')) return res.text();
  }
  return null;
};

/** A new lane: a drill (`drill()`'s options), the catalogue it installs from, and the harness, when it is on one. */
export const kept = ({ catalogue, harness, turnMs, ...rest } = {}) =>
  asKept(drill({ said: SENTENCE, slug: `${PREFIX}${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`, ...rest }), { catalogue, harness, turnMs });

/** Drill `d` made a lane: what `kept()` adds, onto a drill made elsewhere (`drillFor`, with the environment's names). */
export function asKept(d, { catalogue = diskCatalogue(), harness = null, turnMs = TURN_MOST_MS } = {}) {
  return Object.assign(d, { catalogue, harness, turnMs, standIn: harness?.standIn ?? null, installed: new Map(), deleted: false });
}

/** The drill's sign-up, the letter and its link, then the founder use case through the first-run door. One line. */
export async function signUp(ctx) {
  for (const step of [signup, mail, verifyBuild]) {
    const r = await step(ctx);
    if (!r.pass || r.skipped) return { ...r, name: 'sign-up', said: `${r.name}: ${r.said}` };
  }
  const set = await api(ctx, 'setup', { usecase: USECASE, me: { name: FOUNDER } });
  if (set.said?.ok !== true) return red(ctx, 'sign-up', `the record was made, and setting it up as a founder's was refused: ${fixOf(set)}.`);
  const failed = set.said.value?.failed ?? [];
  if (failed.length > 0) return red(ctx, 'sign-up', `setting it up as a founder's left ${failed.length} part${failed.length === 1 ? '' : 's'} undone.`);
  const n = (set.said.value?.done?.installed ?? []).length;
  return ok(ctx, 'sign-up', `a stranger signed up, a Free record was made, and it was set up as a founder's with ${n} parts.`);
}

/**
 * Install add-on `id` from the catalogue through the record's own door: the version the catalogue offers (its latest
 * when every version is withdrawn, which the answer says), held to the checksum the index lists, `fill` applied when
 * the file names what a person supplies, then planned, and installed with the lines the plan calls out approved, as the
 * owner's press approves them. Answers `{ pass, said, doc, diff, version, withdrawn, brought }`, `said` the refusal's
 * own words, `brought` the modules the file stands on that went in first.
 */
export async function installFromCatalogue(ctx, id, { fill = null } = {}) {
  const fail = (said) => ({ pass: false, said: hide(ctx, said) });
  const index = await ctx.catalogue('index.json');
  let entry = null;
  try {
    entry = (JSON.parse(index ?? 'null')?.entries ?? []).find((e) => e?.kind === 'pack' && e?.id === id) ?? null;
  } catch {
    entry = null;
  }
  if (!entry) return fail(`the catalogue does not list ${id}`);
  const offered = offeredVersion(entry);
  const v = offered ?? entry.versions.find((x) => x.version === entry.latest) ?? entry.versions[0];
  if (!v) return fail(`the catalogue lists ${id} with no version`);
  const text = await ctx.catalogue(`packs/${id}/${v.version}.pack.json`);
  if (text === null) return fail(`the catalogue lists ${id} ${v.version} and holds no file for it`);
  if ((await fileChecksum(text).catch(() => '')) !== v.checksum) return fail(`${id} ${v.version} is not the file the catalogue lists: its checksum differs`);
  let doc = JSON.parse(text);
  if (fill) {
    try {
      doc = fill(doc);
    } catch (e) {
      return fail(`the file could not be filled: ${e instanceof Error ? e.message : 'it threw'}`);
    }
  }
  /* A PLAN THE RECORD CALLS STALE IS READ AGAIN AND PRESSED AGAIN, as the add-ons screen does (`installPlanned`), after
     a pause a person reading the plan would take: measured on the harness, the work a founder's setup leaves running
     beside its answer moves the record's version for a moment after, so a press at once is stale. A third stale answer
     in a row is the fault, and the line says the record's sentence. */
  /* A PLAN REFUSED FOR A LIST THE RECORD DOES NOT HOLD YET puts in the modules the file stands on (`requires.packs`), as
     the refusal tells a person to ("Install work first") and as an agent's arrange of the add-on does (the catalogue
     offers it with those modules under it), then is read again, once. A founder's record holds Projects and Money on
     its first day and Work only when the words point at it (founder 2.7.0), so project-brief and roadmap go
     in after Work. The modules go in through the record's own first-run door, `setup` with `again`, which passes over
     one that is on. */
  let diff = {};
  let approve = [];
  let stale = 0;
  let brought = [];
  for (;;) {
    const planned = await api(ctx, 'planPack', { doc, source: { kind: 'local' } });
    if (planned.said?.ok !== true && planned.said?.refusal?.code === 'REGISTER_UNRESOLVED' && brought.length === 0) {
      const under = Object.keys(doc?.requires?.packs ?? {});
      const set = under.length === 0 ? null : await api(ctx, 'setup', { again: true, packs: { install: under } });
      if (set?.said?.ok === true && (set.said.value?.failed ?? []).length === 0) {
        brought = set.said.value?.done?.installed ?? [];
        if (brought.length > 0) continue;
      }
    }
    if (planned.said?.ok !== true) return fail(`the plan was refused: “${fixOf(planned)}”`);
    diff = planned.said.value?.diff ?? {};
    approve = Array.isArray(diff.approve) ? diff.approve : [];
    const put = await api(ctx, 'installPack', { doc, source: { kind: 'local' }, planHash: diff.planHash, ...(approve.length > 0 ? { approve } : {}) });
    if (put.said?.ok === true) break;
    if (put.said?.refusal?.code !== 'PLAN_STALE' || ++stale > 2) return fail(`the install was refused${stale > 2 ? ' three times, the plan read again between' : ''}: “${fixOf(put)}”`);
    await new Promise((r) => setTimeout(r, 500 * stale));
  }
  const withdrawn = offered === null ? (v.yanked?.reason ?? 'withdrawn') : null;
  const out = { pass: true, said: '', doc, diff, approve, version: v.version, withdrawn, stale, brought };
  ctx.installed.set(doc.pack ?? id, out);
  return out;
}

/** The ingests a document declares on a clock (`poll`, `pull`, `call`), which Run now can press. */
export const clockIngests = (doc) => (doc?.declarations ?? []).filter((x) => ['poll', 'pull', 'call'].includes(x?.channel) && x?.trigger !== 'rule').map((x) => x.ingest);

/**
 * One schedule turn. On the harness, its own (`harness.turn`). On a host, Run now pressed on each of `ingests` and the
 * record watched until `done(ctx)` says the run landed or `turnMs` passes. A script cannot be pressed: with no harness
 * a turn that is only a script's answers `{ skipped }` with why, and the check skips.
 */
export async function turn(ctx, { ingests = [], done = async () => true } = {}) {
  if (ctx.harness?.turn) {
    await ctx.harness.turn(ctx);
    return { ran: true };
  }
  if (ingests.length === 0) return { skipped: 'a script runs on its own hour on a host, and Run now presses only a poll, a pull or a call' };
  for (const ingest of ingests) {
    const pressed = await api(ctx, 'actionRun', { ingest });
    if (pressed.said?.ok !== true) return { refused: hide(ctx, fixOf(pressed)) };
  }
  const until = Date.now() + ctx.turnMs;
  while (Date.now() < until) {
    if (await done(ctx)) return { ran: true };
    await new Promise((r) => setTimeout(r, 3_000));
  }
  return { ran: true };
}

/** The rows of `list` on the record, newest last: `{ rows }`, or `{ fix }` with the record's sentence. */
export async function rowsOf(ctx, list) {
  const out = await api(ctx, 'list', { register: list, limit: 200 });
  if (out.said?.ok !== true) return { rows: null, fix: hide(ctx, fixOf(out)) };
  const v = out.said.value;
  return { rows: Array.isArray(v?.rows) ? v.rows : Array.isArray(v) ? v : [] };
}

/** One row written through the record's own create: its id, or null and the sentence. */
export async function create(ctx, list, fields) {
  const out = await api(ctx, 'create', { register: list, fields });
  return out.said?.ok === true ? { id: String(out.said.value?.id ?? ''), seq: out.said.value?.seq } : { id: null, fix: hide(ctx, fixOf(out)) };
}

/**
 * A key of the lane's own into its record's vault, through the app's key door as the Keys screen sends it: `label`,
 * the host it opens and a value the lane made up, sealed for a scheduled run. The value is a stand-in, never a
 * credential of anybody's, and it is added to what every line hides.
 */
export async function putKey(ctx, { label, opens, value }) {
  ctx.secrets.push(value);
  const put = () => api(ctx, 'keys/put', { label, opens, kind: 'api_token', value, sealed_under: 'connector' });
  let out = await put();
  /* A RECORD WITH NO KEYS LIST HAS NOT TURNED ITS AGENTS ON, which is where a key's row lives, and the refusal says "no Keychain yet". It is
     turned on through the record's own setup door, from what the host offers, as a person turns it on, and said. */
  let turnedOn = false;
  if (out.said?.refusal?.code === 'REGISTER_UNKNOWN' && /Keychain/u.test(String(out.said.refusal.fix ?? ''))) {
    const on = await api(ctx, 'setup', { again: true, packs: { install: [AGENTS] } });
    if (on.said?.ok !== true || (on.said.value?.failed ?? []).length > 0) return { ok: false, fix: hide(ctx, `the record holds no keys list, and turning its agents on was refused: ${fixOf(on)}`) };
    turnedOn = true;
    out = await put();
  }
  return out.said?.ok === true ? { ok: true, turnedOn } : { ok: false, fix: hide(ctx, fixOf(out)) };
}

/** The module whose list holds a record's keys, as the host's own shelf names it. */
export const AGENTS = 'agents';

/**
 * The door poster: a text posted to `ingest`'s door with its own token, minted by the owner as the app mints it. The
 * token and the path that carries it are added to what every line hides. Answers the door's status, or the sentence.
 */
export async function postToDoor(ctx, ingest, text) {
  const minted = await api(ctx, 'ingestMint', { ingest });
  if (minted.said?.ok !== true) return { ok: false, fix: hide(ctx, `the door's token was not made: ${fixOf(minted)}`) };
  const { token, path } = minted.said.value ?? {};
  for (const v of [token, path]) if (typeof v === 'string') ctx.secrets.push(v);
  if (typeof path !== 'string' || path === '') return { ok: false, fix: 'the door has no address to post to' };
  const out = await ask(ctx, path, { body: undefined, raw: text, type: 'text/plain', cookie: null });
  return out.status >= 200 && out.status < 300 ? { ok: true, status: out.status } : { ok: false, fix: hide(ctx, `the door answered ${out.status}: ${fixOf(out)}`) };
}

/**
 * The stand-in: the JSON addresses the lane serves itself, by host and path, and every call the record made out while
 * it stood in. `answer(host, path, fn)` sets what one address says, `fn(url, init)` answering a Response or a JSON value.
 * `fetch` is what the harness hands the Worker in the platform's place: a host the stand-in holds is answered here and
 * logged, a loopback host (the lane's own asks) goes through, and anything else is logged and refused, so a call to a
 * host nobody named shows in `calls` and never leaves this machine.
 */
export function standIn(through = globalThis.fetch) {
  const routes = new Map();
  const calls = [];
  const loopback = (host) => host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    if (loopback(url.hostname)) return through(input, init);
    calls.push({ host: url.hostname, path: url.pathname });
    const fn = routes.get(`${url.hostname}${url.pathname}`);
    if (!fn) return new Response('{"error":"the stand-in holds no such address"}', { status: 404, headers: { 'content-type': 'application/json' } });
    const said = await fn(url, init);
    return said instanceof Response ? said : new Response(JSON.stringify(said), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return {
    calls,
    fetch,
    answer: (host, path, fn) => void routes.set(`${host}${path}`, typeof fn === 'function' ? fn : () => fn),
    /** Whether the stand-in answers any address on `host`. */
    holds: (host) => [...routes.keys()].some((k) => k.startsWith(`${host}/`)),
    /** The hosts called since `mark` (`calls.length` read before). */
    hostsSince: (mark) => [...new Set(calls.slice(mark).map((c) => c.host))],
  };
}

/**
 * The harness half for `startCloud()`'s Cloud (`apps/worker/test/cloud-serve.ts`), handed to `kept({ harness })`:
 * its `turn` makes every pending schedule row of the lane's record due once and rings the record's alarm a few times,
 * with the stand-in in the platform's `fetch` while it runs. Built from what the test hands, and the harness is never
 * imported here, so the lane itself runs against any host.
 *
 * THE HARNESS RUNS NO SCRIPT. It binds no `LOADER`, so the Worker drops every script's run and says so ("this host has
 * no sandbox to run it in"), and an add-on that is a script is a named FAIL here until it does.
 */
export function harnessOf(c, stand = standIn()) {
  return {
    standIn: stand,
    async turn(ctx) {
      const found = await c.cloud.directory.resolve(ctx.made?.slug ?? ctx.slug);
      if (!found) throw new Error('the harness does not know the lane’s record');
      const sql = c.cloud.storages.get(found.record)?.sql;
      const was = globalThis.fetch;
      globalThis.fetch = stand.fetch;
      try {
        /* DUE ONCE, RUNG UNTIL IT IS DONE: a poll's first ring queues its fetch and a later one delivers it, so the alarm
           is rung a few times over one move of the clock, and each thing that was due runs once. A ring leases a few
           script runs, and a founder's own scripts queue ahead of an add-on's, so it is rung until no run waits. */
        sql?.exec("UPDATE schedule SET due_at = ? WHERE state = 'pending'", new Date(Date.now() - 1_000).toISOString());
        const queued = () => {
          const rows = sql?.exec("SELECT count(*) AS n FROM outbox WHERE kind = 'script.run' AND state IN ('pending', 'leased')");
          return Number((rows?.toArray?.() ?? [...(rows ?? [])])[0]?.n ?? 0);
        };
        for (let i = 0; i < 4 || (queued() > 0 && i < 40); i++) {
          await c.cloud.record(found.record).alarm();
          await c.cloud.settle();
        }
      } finally {
        globalThis.fetch = was;
      }
    },
  };
}

/**
 * The record deleted by its name and the account closed, whatever happened before. A record that still opens, or is
 * still listed as reachable, is red: the lane leaves nothing behind.
 */
export async function deleteRecord(ctx) {
  if (!ctx.made || !ctx.cookie) return skip(ctx, 'delete', 'no record was made, so there is none to delete.');
  const gone = await api(ctx, 'deleteRecord', { slug: ctx.made.slug });
  if (gone.said?.ok !== true || gone.said.value?.deleted !== true) return red(ctx, 'delete', `the record was not deleted: ${fixOf(gone)}.`);
  ctx.deleted = true;
  if ((await api(ctx, 'boot')).said?.ok === true) return red(ctx, 'delete', 'the record was said to be deleted and still opens.');
  const listed = await ask(ctx, '/account/records', { method: 'GET' });
  if ((listed.said?.value ?? []).some((r) => r?.slug === ctx.made.slug)) return red(ctx, 'delete', 'the record was said to be deleted and is still listed as reachable.');
  const closed = ctx.address ? await ask(ctx, '/account/close', { body: { email: ctx.address } }) : null;
  return ok(ctx, 'delete', `the record was deleted by its name and no longer opens${closed?.said?.ok === true ? ', and the account was closed' : ''}.`);
}
