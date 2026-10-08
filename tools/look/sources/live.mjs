/**
 * `live:<record>`: a real record, read through the command's own sign-in, and nothing pressed.
 *
 * A FORWARDER THAT CANNOT PRESS (`loop/scope/area-proof-a.md` 2.4). The allow-list is the host's own route table:
 * a route goes on only when its row says `writes: false` and it sits in one of the two reading groups, DATA and
 * READ+. Every other request is answered here with a refusal and counted, so a screen that tries to write while it
 * only draws shows up as "writes blocked" above 0 and never reaches his record. When a read is marked as a write
 * (`previewPage` is), the fix is the route's mark, never this list.
 *
 * THE TOKEN IS THE COMMAND'S, READ THROUGH `readHosts`, and it leaves only as `Authorization: Bearer` on a request
 * to the host the sign-in names. Nothing else the headless browser holds goes with it: no cookie, no `Origin`, no
 * header of the page's. No sentence this file writes holds it, and no answer brings a cookie back.
 *
 * ONLY `/api`, SO TWO KINDS OF SCREEN CANNOT BE DRAWN, and that is said rather than hidden (`cannot`). `/account/*`
 * is the person's and not the record's and answers a browser session, never a token, so Usage and Billing have no
 * data here. The ADMIN group (`listTokens`, `listDevices`) is outside the reading groups, so Settings' agent and
 * device lists draw a refusal. Those screens are seen on a Cloud record through the canary and the Cloud harness.
 *
 * IT REFUSES TO START UNDER `CI`. CI never sees his record, and a runner holding his sign-in is the leak this exists
 * to make impossible.
 */

import { ROUTES } from '../../../packages/host/src/index.ts';
import { hostKey, hostsPath, inTheClear, readHosts, sameHost } from '../../../apps/cli/src/http.ts';

/** The groups a token reads a record's screens through. `30 §5`'s browser-session groups are not among them. */
export const READING = new Set(['DATA', 'READ+']);

/** Every route this forwarder hands on: reads, in a reading group. Built once from the table, never written by hand. */
export const allowed = (routes = ROUTES) => new Set(routes.filter((r) => !r.writes && READING.has(r.group)).map((r) => r.name));

/** What this source cannot draw, and why, for the capture's `said.json` to carry as screens not seen. */
export const CANNOT = [
  {
    reads: '/account/*',
    screens: ['Usage', 'Billing'],
    why: "The live look hands on the record's reads under /api with a token, and /account/* answers a signed-in browser only, so Usage and Billing cannot be drawn from it.",
  },
  {
    reads: 'ADMIN',
    screens: ['Settings: agents', 'Settings: devices'],
    why: 'The live look reads only the DATA and READ+ groups, so the agent tokens and devices under Settings draw a refusal here.',
  },
];

const refusal = (fix) => ({ ok: false, refusal: { code: 'FORBIDDEN', fix } });

/** Which hosts-file entry `record` names: a host address as written, or a slug matched against each entry's path. */
function entryFor(record, hosts) {
  const entries = Object.entries(hosts.hosts);
  if (/[./:]/u.test(record)) {
    const key = hostKey(record);
    return entries.find(([written]) => sameHost(written, key)) ?? [key, undefined];
  }
  const named = entries.filter(([written]) => {
    try {
      return new URL(hostKey(written)).pathname === `/${record}`;
    } catch {
      return false;
    }
  });
  const preferred = named.find(([written]) => hosts.default !== undefined && sameHost(hosts.default, hostKey(written)));
  return preferred ?? named[0];
}

/**
 * Open the forwarder. `env` stands in for `process.env`, so a test points the hosts file at a folder of its own.
 * `send` is `fetch` unless a test hands in another.
 */
export async function open(record, { env = process.env, now = Date.now(), send = fetch, routes = ROUTES } = {}) {
  if (env.CI)
    throw new Error(
      'The live look runs only on a machine signed in to the record and refuses to start under CI, because CI never sees a real record. ' +
        'Draw the seed or a file instead. Even signed in, it cannot draw a screen that reads /account/* (Usage, Billing).',
    );
  if (!record) throw new Error('Name the record to read: --source live:<record>, as the sign-in file keeps it.');
  const file = hostsPath(env);
  const found = entryFor(record, readHosts(file));
  if (found === undefined) throw new Error(`No sign-in for a record called ${record} is kept on this machine. Run braindog login https://brain.dog/app/${record}.`);
  const [written, entry] = found;
  const key = hostKey(written);
  const url = new URL(key);
  if (inTheClear(url)) throw new Error(`${key} is http, not https, so the live look will not send a token to it.`);
  const held = entry?.token;
  if (typeof held?.value !== 'string' || held.value === '') throw new Error(`The sign-in for ${key} holds no token. Run braindog login ${key}.`);
  const until = typeof held.expires === 'string' ? Date.parse(held.expires) : Number.NaN;
  if (until <= now) throw new Error(`The sign-in for ${key} expired on ${String(held.expires).slice(0, 10)}. Run braindog login ${key}.`);
  const token = held.value;
  const reads = allowed(routes);
  const groupOf = new Map(routes.map((r) => [r.name, r]));
  const tally = { forwarded: 0, refused: 0, writes: 0, outside: 0, blocked: {} };

  const refuse = (res, kind, what, fix) => {
    tally.refused += 1;
    tally[kind] += 1;
    tally.blocked[what] = (tally.blocked[what] ?? 0) + 1;
    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(refusal(fix)));
  };

  /** One request from the page: `at` is its address with any `/app/<slug>` taken off, as `run.mjs` hands it. */
  async function handle(req, res, at) {
    const method = req.method ?? 'GET';
    const name = /^\/api\/([A-Za-z][A-Za-z0-9]*)$/u.exec(at.pathname)?.[1];
    const route = name === undefined ? undefined : groupOf.get(name);
    if (route === undefined) {
      for await (const _ of req);
      const where = at.pathname.startsWith('/account') ? ' A screen that reads /account/* (Usage, Billing) cannot be drawn by the live look.' : '';
      return refuse(res, 'outside', at.pathname, `The live look hands on the record's reads under /api and nothing else, so ${at.pathname} was not sent.${where}`);
    }
    if (route.writes || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
      for await (const _ of req);
      return refuse(res, 'writes', name, `The live look reads and never writes, so ${name} was not sent. The host's route table marks it as a write.`);
    }
    if (!reads.has(name) || (method !== 'GET' && method !== 'HEAD' && method !== 'POST')) {
      for await (const _ of req);
      return refuse(res, 'outside', name, `The live look reads only the DATA and READ+ groups, so ${name}, in ${route.group}, was not sent.`);
    }
    /* A POST TO A READ IS STILL A READ: the client sends a read too long for an address as a POST, which the host
       accepts for any read. Only its body goes on, with its type, and the token. */
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
    if (method === 'POST') headers['content-type'] = 'application/json';
    tally.forwarded += 1;
    try {
      const out = await send(`${url.origin}/api/${name}${at.search}`, {
        method,
        headers,
        redirect: 'error',
        ...(method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
      });
      const body = Buffer.from(await out.arrayBuffer());
      res.writeHead(out.status, { 'content-type': out.headers.get('content-type') ?? 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      /* The error's own text is not repeated: it can quote the request, and the request carried the token. */
      const answer = { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: `${key} did not answer ${name}.` } };
      res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(answer));
    }
  }

  return {
    name: 'live',
    record,
    seen: true,
    pressable: false,
    outUnder: 'loop/proof/looks',
    prefix: url.pathname === '/' ? '' : url.pathname,
    cannot: CANNOT,
    handle,
    counts: () => structuredClone(tally),
    close: async () => {},
  };
}
