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
 * same rows the in-browser sample shows. The clock is pinned at the seed's `NOW`, so every tone and
 * every date band is the one the sample draws, on every run and every day.
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
 * AND A GATE THAT FORGETS TO FORWARD IS RED, NOT QUIETLY GREEN. The register screen falls back to the
 * in-browser sample when there is no record to read, which is right for the public demo and would be
 * a silent pass here: the page would draw and every check would hold. `answers` asks the gate's own
 * port for `boot` before anything is measured and throws unless the record answered it.
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

/**
 * Start one. `{ base, close, server }`, where `base` is `http://127.0.0.1:<port>`.
 *
 * `pollMs: 0` because nothing is ever delivered from a gate's record, and a ticker is a timer.
 *
 * `open` IS FOR THE COMMAND LINE: `vite dev` proxies `/api` to it directly and cannot add a bearer, so that
 * record is the open self-host it always was, at the origin the dev server serves the app from.
 */
export async function startRecord(port = 0, { open = false, origin } = {}) {
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
    const seeded = await installSeed(running.api.kernel);
    if (!seeded.ok) throw new Error(`the gate's record could not take the seed: ${seeded.refusal?.fix ?? 'no reason given'}`);
    /* ONE PERSON, SO THE KEY IS A WAY IN. Sign-in offers the server key only where the Directory holds exactly one
       person, so without an owner /signin would draw a self-host nobody ran `init --owner` on. */
    if (key !== undefined) {
      const owner = running.directory.person$('owner@the-studio.example', 'Owner');
      if (!owner.ok) throw new Error(`the gate's record could not name its owner: ${owner.refusal?.fix ?? 'no reason given'}`);
    }
  } catch (e) {
    await running.close().catch(() => {});
    throw e;
  }
  const { port: at } = running.server.address();
  const base = `http://127.0.0.1:${at}`;
  if (key !== undefined) KEYS.set(base, key);
  return {
    base,
    close: () => {
      KEYS.delete(base);
      return running.close();
    },
    server: running.server,
  };
}

/** The paths a gate's server hands to the record: the record's and sign-in's. Everything else is the build's. */
export const forwards = (pathname) => /^\/+(?:api|auth)(?:\/|$)/.test(pathname);

/**
 * THE ROUTES ONLY THE SAMPLE DRAWS, opened with the record taken away.
 *
 * `/v/<key>` is the sample's saved view. On a live record a view is a page (`apps/web/src/lib/record/views.ts`), so
 * the route sends the reader to `/p/<key>`, and the seeded record saves no view: every gate that opened
 * `/v/obligations.overdue` over it measured the refusal of a page that does not exist, while the view screen itself
 * went unmeasured. A record that cannot be reached is what `readBoot` answers with the sample, so aborting the
 * record's paths for these routes is the product's own sample path, not a stand-in for it.
 */
const SAMPLE_ONLY = [/^\/v\//];
const RECORD_PATHS = (url) => forwards(url.pathname);
const ABORT = (r) => r.abort();

/** Call before opening `route` on `page`: the record is there for every route but the sample's own. */
export async function recordFor(page, route) {
  await page.unroute(RECORD_PATHS, ABORT);
  if (SAMPLE_ONLY.some((r) => r.test(route))) await page.route(RECORD_PATHS, ABORT);
}

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
 * route outside `MAY_REFUSE`, and never `UNREACHABLE`, which is the one answer the screen would read
 * as "draw the sample instead".
 *
 * EVERY `Set-Cookie` COMES BACK AS ITS OWN HEADER. `forEach` joins them into one value no browser can split.
 *
 * `bearer: false` KEEPS THE KEY OFF THE WIRE, which is what a gate about signing in needs: with the key on
 * every request, each screen reads the record as its owner and there is no signed-out state left to drive.
 * It is on by default because every other browser gate measures a screen rather than a door.
 */
export async function forward(req, res, base, { bearer = true } = {}) {
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
    res.writeHead(out.status, back);
    res.end(Buffer.from(await out.arrayBuffer()));
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
    throw new Error(`${origin}/api/boot is not the gate's record answering, so the register screen would draw the sample.`);
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
