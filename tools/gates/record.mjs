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
 * IN MEMORY AND ON PORT 0, so two gates never share a file or fight for a socket, and `unref`ed, so
 * a gate that exits early is not held open by its record.
 *
 * AND A GATE THAT FORGETS TO FORWARD IS RED, NOT QUIETLY GREEN. The register screen falls back to the
 * in-browser sample when there is no record to read, which is right for the public demo and would be
 * a silent pass here: the page would draw and every check would hold. `answers` asks the gate's own
 * port for `boot` before anything is measured and throws unless the record answered it.
 */

import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

import { start } from '../../apps/selfhost/src/server.ts';
import { httpStatus } from '../../packages/host/src/index.ts';
import { NOW, installSeed } from '../../packages/seed/src/index.ts';

import { budget } from './lib.mjs';

/**
 * Start one. `{ base, close }`, where `base` is `http://127.0.0.1:<port>`.
 *
 * `pollMs: 0` because nothing is ever delivered from a gate's record, and a ticker is a timer.
 */
export async function startRecord(port = 0) {
  const running = await start({ file: ':memory:', port, now: NOW, pollMs: 0 });
  const seeded = await installSeed(running.api.kernel);
  if (!seeded.ok) {
    await running.close();
    throw new Error(`the gate's record could not take the seed: ${seeded.refusal?.fix ?? 'no reason given'}`);
  }
  const { port: at } = running.server.address();
  return { base: `http://127.0.0.1:${at}`, close: running.close, server: running.server };
}

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
 */
export async function forward(req, res, base) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && v !== undefined) headers[k] = Array.isArray(v) ? v.join(', ') : v;
  try {
    const out = await fetch(new URL(req.url ?? '/', base), {
      method: req.method ?? 'GET',
      headers,
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
    });
    const back = {};
    out.headers.forEach((v, k) => {
      if (!HOP.has(k)) back[k] = v;
    });
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

/* THE COMMAND LINE: one record on a fixed port, for `vite dev` and `vite preview` to proxy to. */
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  const { port } = budget('record');
  const { base, server } = await startRecord(port);
  server.ref();
  console.log(`  record: ${base}, the seed at ${new Date(NOW).toISOString().slice(0, 10)}. Stop it with Ctrl+C.`);
}
