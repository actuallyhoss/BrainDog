/**
 * A record for the browser gates to read: the self-host, in memory, with the seed installed.
 *
 *   node tools/gates/record.mjs     serves it on 127.0.0.1 at `budgets.json`'s `record.port`, for
 *                                   `vite dev` and screenshots, until the process is stopped
 *
 * WHY THE GATES NEED ONE. `/r/[register]` reads `boot`, `schema` and `list` from the record now, and
 * `layout`, `a11y`, `keys` and `prefs` drive a real browser against a static build. Without
 * something answering `/api/*` the build's own SPA fallback answers it with `index.html`, and the
 * four gates would be measuring a screen drawn from nothing.
 *
 * THE SAME RECORD THE PRODUCT READS, NOT A STAND-IN. It is `apps/selfhost`'s `start`, which serves
 * the same `handlersFor` over the same route table as the Worker, with `installSeed` writing the
 * seed's rows through the record's own write path. The clock is pinned at the seed's `NOW`, so every
 * tone and every date band is the same on every run and every day.
 *
 * AND `/signin` DRAWS ITS FULLEST SIGNED-OUT STATE. The gates' record has a server key and a Directory,
 * so `/auth/methods` offers a passkey and the key, nobody is signed in, and it is the first run. The key
 * is random, held in this module and never printed, and `forward` puts it on every `/api/*` request, so
 * the screens read the record as its owner exactly as they did when it was open.
 *
 * IN MEMORY AND ON PORT 0, so two gates never share a file or fight for a socket. NOT `unref`ED, though
 * this paragraph said so until 22 September: `start` never calls `unref`, and a process whose record
 * leaked stayed alive on it until it was killed (`test/record-throws.test.mjs`). So a record is handed
 * back by `close()`, which every gate calls from its `finally` and `startRecord` calls on any throw.
 *
 * AND A GATE THAT FORGETS TO FORWARD IS RED, NOT QUIETLY GREEN. With no record behind the port every
 * screen draws the refusal that says the record was not reached, and a refusal card is small enough to
 * pass every width and every contrast rule. `answers` asks the gate's own port for `boot` before
 * anything is measured and throws unless the record answered it.
 *
 * AND THE VARIANTS ARE RECORDS NOW, NOT BUILDS. See `VARIANTS`.
 */

import { randomBytes } from 'node:crypto';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

import { start } from '../../apps/selfhost/src/server.ts';
import { httpStatus } from '../../packages/host/src/index.ts';
import { NOW, installSeed } from '../../packages/seed/src/index.ts';

import { budget } from './lib.mjs';

/** Each running record's server key, by its base. Here and nowhere else. */
const KEYS = new Map();

/** Which variant each running record is, by its base, for the one variant `forward` has to answer for. */
const VARIANT_OF = new Map();

/**
 * THE OTHER RECORDS, FOR THE HALF OF EVERY BRANCH THE GATES' OWN RECORD CANNOT DRAW, and the routes each one shows.
 *
 * THEY WERE THREE MORE BUILDS OF THE APP. `BRAINDOG_VARIANT` swapped constants in the sample (`DEPLOYMENT`, `DEVICES`,
 * `TOKENS`, `DECIDED`) and `build:variants` wrote `build-cloud/`, `build-quiet/` and `build-busy/` for `layout` and `a11y`
 * to serve against this record. Once the screens read the record and not the sample, screen by screen,
 * none of those constants reached a screen, so each variant build drew exactly what the main build drew and the branches
 * it existed for went unmeasured, at three Vite builds a CI run. A variant is a record that holds something different,
 * which is what the build flag's own comment said it should be.
 *
 * `cloud` IS THIS RECORD SAYING IT IS ON THE CLOUD. `boot` carries the host's word (`host`, `apps/worker/src/index.ts`),
 * and the self-host cannot be asked to say `cloud`, so `forward` puts it in the answer. Backups and Billing are the two
 * areas whose sentences turn on it.
 *
 * `connected` REPLACES `quiet`, BECAUSE THE GATES' RECORD IS THE QUIET ONE NOW. `quiet` was the sample with no machines,
 * no keys and no vault grants, so `/settings/agents` could draw its two designed empty states; the seeded record has none
 * of the three (measured on 25 September: `listDevices` and `listTokens` both `[]`), so the main pass draws those states
 * and it was the populated half that no gate reached. This one signs a machine in through the device flow, leaves a
 * second waiting for its six digits, and mints a key, the way a person connecting an agent does.
 *
 * `busy` IS STILL ENOUGH DECISIONS TO OVERFLOW A GROUP: `/search` cuts a group at ten, and says the count in a sentence
 * for a group with no door, which is what questions are. The seed decides two, so twelve more renewal questions are
 * filed and decided here, through `propose` and `decide` as the record's own path writes them.
 */
export const VARIANTS = [
  { name: 'cloud', routes: ['/settings/backups', '/settings/billing'] },
  { name: 'connected', routes: ['/settings/agents'] },
  { name: 'busy', routes: ['/search?q=renewal', '/decide'] },
];

/** The view every gate record saves, which `routes.mjs` opens as `/v/obligations.open`. */
export const VIEW = { register: 'obligations', id: 'open', name: 'Still open', filter: { field: 'state', in: ['open', 'part'] }, order: [{ field: 'due', dir: 'asc' }] };

/** The twelve renewals `busy` decides, one a licence year, each answered the way the year before was. */
async function decideRenewals(kernel) {
  for (let i = 0; i < 12; i++) {
    const body = {
      options: [
        { id: 'same', label: 'Same terms', because: 'Nothing has changed on either side.' },
        { id: 'raise', label: 'Raise it', because: 'Costs have moved and the licence has not.' },
      ],
    };
    const opened = kernel.propose({ question: `Renewal terms for the ${2025 - i} licence year`, body_kind: 'options', body }, 'p_seed');
    if (!opened.ok) throw new Error(`the busy record could not file a renewal: ${opened.refusal?.fix ?? 'no reason given'}`);
    const decided = kernel.decide(opened.value.id, { decide: { option: 'same', reason: 'Nothing had changed on either side.' } }, 'p_seed');
    if (!decided.ok) throw new Error(`the busy record could not decide a renewal: ${decided.refusal?.fix ?? 'no reason given'}`);
  }
}

/**
 * Every gate record's name, which `startRecord` gives it before the seed goes in.
 *
 * A RECORD NOBODY NAMED IS NOT WHAT A PERSON READS. The gates' record was a self-host nobody ran `init` on, so `boot`
 * answered `record: null` and a review measured a shell with no name over it; `connected` alone was named, because a
 * bearer carries the record it is for and `createToken` refused "This record has no id yet". Named first, so the owner's
 * grant is the oldest line in its history and not news on the first screen. The owner is `p_self`, the person the
 * server key and open mode already read as (`apps/selfhost` `owner`).
 */
export const IDENTITY = { id: 'rec_01J8Z3N4W5X6Y7Z8A9B0C1D2E3', slug: 'the-studio', name: 'The Studio', tz: 'Europe/London', locale: 'en-GB', owner: { id: 'p_self' } };

/**
 * A machine signed in, a machine waiting, and a key, for `connected`.
 *
 * The device flow is asked at `localhost`, because the self-host signs devices in only at the origin it serves and
 * refuses a flow started by another name.
 */
async function connect(port, key) {
  const at = `http://localhost:${port}`;
  const send = async (path, body, bearer = false) => {
    const headers = { 'content-type': 'application/json', ...(bearer && key !== undefined ? { authorization: `Bearer ${key}` } : {}) };
    const said = await fetch(`${at}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }).then((r) => r.json());
    if (said?.ok !== true) throw new Error(`the connected record refused ${path}: ${said?.refusal?.fix ?? 'no reason given'}`);
    return said.value;
  };
  const laptop = await send('/auth/device', { reach: 'runner', label: 'Studio laptop' });
  await send('/api/deviceApprove', { user_code: laptop.user_code }, true);
  await send('/auth/device/token', { device_code: laptop.device_code });
  await send('/auth/device', { reach: 'login', label: 'Claude Code, this laptop' });
  await send('/api/createToken', { scope: 'read', label: 'Nightly export' }, true);
}

/**
 * Start one. `{ base, close, server, variants }`, where `base` is `http://127.0.0.1:<port>`.
 *
 * `pollMs: 0` because nothing is ever delivered from a gate's record, and a ticker is a timer.
 *
 * `open` IS FOR THE COMMAND LINE: `vite dev` proxies `/api` to it directly and cannot add a bearer, so that
 * record is the open self-host it always was, at the origin the dev server serves the app from.
 *
 * `variant` MAKES THIS RECORD ONE OF `VARIANTS`, and `variants: true` starts every one of them beside this record and
 * hands their bases back as `variants[name]`. ONE `close()` GIVES ALL OF THEM BACK, which is why they come from this
 * call and not from a second one in the gate: `test/handles.test.mjs` holds every gate to closing what it opened in the
 * `finally` of the `try` it opened it in, and four records under one handle are one close.
 */
export async function startRecord(port = 0, { open = false, origin, variant, variants = false } = {}) {
  if (variant !== undefined && !VARIANTS.some((v) => v.name === variant)) throw new Error(`there is no record variant called ${variant}`);
  const key = open ? undefined : randomBytes(32).toString('base64url');
  const running = await start({
    file: ':memory:',
    directory: ':memory:',
    port,
    host: '127.0.0.1',
    now: NOW,
    pollMs: 0,
    sessionKey: new Uint8Array(randomBytes(32)),
    ...(key === undefined ? {} : { token: key }),
    ...(origin === undefined ? {} : { origin }),
  });
  /* FROM HERE ANY THROW CLOSES WHAT `start` OPENED, and the gates rely on it: each one leaves `record` `null` when
     this throws, so a server still listening after the throw is a server nobody holds a handle to. Until 22 September
     only the two refusals below closed it, each by hand, and an exception out of `installSeed` or `person$` left the
     port bound: `test/record-throws.test.mjs` rebound it after a stubbed seed threw and got EADDRINUSE, and the child
     stayed alive on the leaked server until it was killed. The refusals now throw into the same `catch` rather than
     closing first, because closing twice takes `sql.close()` through a database already closed. The `.catch` only
     drops a rejection, so the caller sees why the record did not start and not why it did not stop; `close()` as
     `start` writes it never rejects, and a throw inside its `server.close` callback is uncaught rather than dropped. */
  try {
    const named = running.api.kernel.createRecord(IDENTITY);
    if (!named.ok) throw new Error(`the gate's record could not be named: ${named.refusal?.fix ?? 'no reason given'}`);
    const seeded = await installSeed(running.api.kernel);
    if (!seeded.ok) throw new Error(`the gate's record could not take the seed: ${seeded.refusal?.fix ?? 'no reason given'}`);
    /* ONE PERSON, SO THE KEY IS A WAY IN. Sign-in offers the server key only where the Directory holds exactly one
       person, so without an owner /signin would draw a self-host nobody ran `init --owner` on. */
    if (key !== undefined) {
      const owner = running.directory.person$('owner@the-studio.example', 'Owner');
      if (!owner.ok) throw new Error(`the gate's record could not name its owner: ${owner.refusal?.fix ?? 'no reason given'}`);
    }
    /* A SAVED VIEW, SO `/v/[view]` HAS SOMETHING TO DRAW. The seed saves none, so the gates opened the view route with
       the record taken away and measured the sample's view; with no sample that address is the refusal "the record was
       not reached", which is a finding on any route outside `MAY_REFUSE` (`lib.mjs`). `routes.mjs` samples this key. */
    const saved = running.api.kernel.saveView(VIEW, { actor: 'p_seed' });
    if (!saved.ok) throw new Error(`the gate's record could not save its view: ${saved.refusal?.fix ?? 'no reason given'}`);
    if (variant === 'busy') await decideRenewals(running.api.kernel);
    if (variant === 'connected') await connect(running.server.address().port, key);
  } catch (e) {
    await running.close().catch(() => {});
    throw e;
  }
  const { port: at } = running.server.address();
  const base = `http://127.0.0.1:${at}`;
  if (key !== undefined) KEYS.set(base, key);
  if (variant !== undefined) VARIANT_OF.set(base, variant);
  const stop = () => {
    KEYS.delete(base);
    VARIANT_OF.delete(base);
    return running.close();
  };

  /* THE VARIANTS, EACH A WHOLE RECORD OF ITS OWN, and a throw in any of them hands back every one already started and
     this one, for the reason the `catch` above gives. */
  const others = [];
  if (variants)
    try {
      for (const v of VARIANTS) others.push({ name: v.name, record: await startRecord(0, { variant: v.name }) });
    } catch (e) {
      for (const o of others) await o.record.close().catch(() => {});
      await stop().catch(() => {});
      throw e;
    }
  return {
    base,
    variants: Object.fromEntries(others.map((o) => [o.name, o.record.base])),
    close: async () => {
      for (const o of others) await o.record.close();
      await stop();
    },
    server: running.server,
  };
}

/** The paths a gate's server hands to the record: the record's, sign-in's, and the Cloud's billing door, which `forward`
    answers itself for the cloud variant. Everything else is the build's. */
export const forwards = (pathname) => /^\/+(?:api|auth|account\/billing)(?:\/|$)/.test(pathname);

/**
 * The server key of a record this module started, for the one gate that has to sign in as a person rather than
 * be handed the record: `passkey` drives the real ceremony, and the key is the door the first person comes
 * through before a passkey exists. It stays inside this process and is never printed, as it was before.
 */
export const serverKeyFor = (base) => KEYS.get(base);

/** Headers that describe one hop and not the message, so they are not copied across this one. */
const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length', 'content-encoding']);

/**
 * Hand one request to the record and its answer back, unchanged.
 *
 * THE BODY IS READ WHOLE BEFORE IT IS SENT, because `fetch` wants a body it can measure and a gate's
 * requests are small. A record that does not answer is `RECORD_UNAVAILABLE`, at the status the
 * shared table gives it: a refusal the screen draws as an error card, which is a finding on every
 * route outside `MAY_REFUSE`, and never `UNREACHABLE`, which is the one answer that means the gate's port
 * reached nothing at all.
 *
 * AND ONE ANSWER IS REWRITTEN, FOR ONE RECORD: `boot` from the `cloud` variant says `host: 'cloud'`, which is the
 * one fact the self-host cannot be started to say. See `VARIANTS`.
 *
 * EVERY `Set-Cookie` COMES BACK AS ITS OWN HEADER. `forEach` joins them into one value no browser can split.
 *
 * `bearer: false` KEEPS THE KEY OFF THE WIRE, which is what a gate about signing in needs: with the key on
 * every request, each screen reads the record as its owner and there is no signed-out state left to drive.
 * It is on by default because every other browser gate measures a screen rather than a door.
 */
export async function forward(req, res, base, { bearer = true } = {}) {
  /* THE CLOUD'S OWN BILLING DOOR, which the self-host behind the `cloud` variant has none of: the Cloud answers
     `GET /account/billing` for every signed-in person, so the variant answers it too, with nothing owed and no
     checkout open, and Billing draws the screen it draws for a record paid up. */
  if (VARIANT_OF.get(base) === 'cloud' && req.method === 'GET' && /^\/+account\/billing\/?$/u.test(new URL(req.url ?? '/', base).pathname)) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, value: { records: [], open: false } }));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && v !== undefined) headers[k] = Array.isArray(v) ? v.join(', ') : v;
  const url = new URL(req.url ?? '/', base);
  const key = KEYS.get(base);
  if (bearer && key !== undefined && /^\/+api(?:\/|$)/.test(url.pathname) && headers.authorization === undefined) headers.authorization = `Bearer ${key}`;
  try {
    const out = await fetch(url, {
      method: req.method ?? 'GET',
      headers,
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
    });
    const back = {};
    out.headers.forEach((v, k) => {
      if (!HOP.has(k) && k !== 'set-cookie') back[k] = v;
    });
    const cookies = out.headers.getSetCookie();
    if (cookies.length > 0) back['set-cookie'] = cookies;
    let body = Buffer.from(await out.arrayBuffer());
    if (VARIANT_OF.get(base) === 'cloud' && /^\/+api\/boot$/u.test(url.pathname)) {
      const said = JSON.parse(body.toString('utf8'));
      if (said?.ok === true) said.value.host = 'cloud';
      body = Buffer.from(JSON.stringify(said));
    }
    res.writeHead(out.status, back);
    res.end(body);
  } catch (e) {
    const answer = { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: `The gate's record did not answer: ${e instanceof Error ? e.message : String(e)}.` } };
    res.writeHead(httpStatus(answer), { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(answer));
  }
}

/**
 * Throw unless `origin`'s `/api/boot` is the record answering.
 *
 * ASKED OF THE GATE'S OWN PORT, so what is proved is the forward and not merely the record.
 */
export async function answers(origin) {
  const said = await fetch(new URL('/api/boot', origin))
    .then((r) => r.json())
    .catch(() => null);
  if (said?.ok !== true || !Array.isArray(said.value?.registers) || said.value.registers.length === 0)
    throw new Error(`${origin}/api/boot is not the gate's record answering, so every screen would draw the refusal that says so.`);
}

/* THE COMMAND LINE: one open record on a fixed port, for `vite dev` and `vite preview` to proxy to. Its
   origin is the dev server's (`apps/web/vite.config.ts`, port 5183), because that is the `Host` and the
   `Origin` the proxy passes on, and an open self-host answers only its own names. */
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  const { port } = budget('record');
  const { base, server } = await startRecord(port, { open: true, origin: 'http://localhost:5183' });
  server.ref();
  console.log(`  record: ${base}, the seed at ${new Date(NOW).toISOString().slice(0, 10)}. Stop it with Ctrl+C.`);
}
