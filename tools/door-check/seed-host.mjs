#!/usr/bin/env node
/**
 * A SEED HOST FOR THE DOOR CHECKS: the self-host in memory with the seed installed, on this machine alone, so a real
 * agent app can be driven against a record that is nobody's.
 *
 *   node tools/door-check/seed-host.mjs --port 8790 -- node tools/door-check/run.mjs --host {host} --only instructions
 *   node tools/door-check/seed-host.mjs [--port 8790]          serve until stopped, for a person to look at
 *
 * With a command after `--`, it starts the record, runs the command with `{host}` turned into the record's address,
 * stops the record and exits with the command's code. Without one, it prints the address and serves until Ctrl+C.
 * Nothing is written to disk.
 *
 * ITS KEY IS MADE HERE AND GOES NOWHERE BUT THE COMMAND'S ENVIRONMENT. The record is started with a server key of 32
 * random bytes, which speaks as its owner (`apps/selfhost/src/server.ts`, `owner`). It is handed to the command as
 * `DOOR_SEED_KEY` and to nothing else: never printed, never written, gone when the record stops. `run.mjs` hands the
 * night's own keys only to brain.dog, and this one opens only a record nobody holds, so a check reads it to speak as
 * the owner of the seed (to tell a run something, to make its agent's token) and for nothing else.
 *
 * A REAL CLOCK, NOT THE GATES' PINNED ONE (`tools/gates/record.mjs`): a pulse, a stop and an end are moments, and a
 * record whose clock stands still cannot say which came first.
 *
 * THE COMMAND FROM THIS TREE AT `/cli/`, as brain.dog serves it: `install.sh` with its address turned to this host,
 * the bundle `pnpm --filter braindog-cli build` made (`apps/cli/dist/braindog.mjs`) and its checksum, so a check
 * installs the command the way a stranger does (`installCli`) and gets this tree's. Everything else is the record's.
 */

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { start } from '../../apps/selfhost/src/server.ts';
import { installSeed } from '../../packages/seed/src/index.ts';
import { IDENTITY } from '../gates/record.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUNDLE = join(REPO, 'apps', 'cli', 'dist', 'braindog.mjs');
const INSTALL = join(REPO, 'apps', 'site', 'static', 'cli', 'install.sh');

/** The request headers a forward drops: the hop's own, and `host`, which the record reads as its own name. */
const HOP = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'content-length']);

/**
 * Start one: the record, named and seeded, behind a front that answers `/cli/` and forwards the rest. Answers
 * `{ base, record, key, close }`, `base` as `http://localhost:<port>` and `key` its server key, for the caller's
 * memory alone. `grow`, when given, is handed the seeded kernel to add rows before the first request.
 */
export async function startSeedHost({ port = 0, grow } = {}) {
  const key = randomBytes(32).toString('base64url');
  const running = await start({
    token: key,
    file: ':memory:',
    directory: ':memory:',
    port: 0,
    host: '127.0.0.1',
    sessionKey: new Uint8Array(randomBytes(32)),
    /* NO PUBLIC KENNEL: a check measures this record and nothing on the network. */
    kennel: { kennel: 'off', fetch: () => Promise.reject(new Error('the seed host reads no Kennel')), now: () => Date.now() },
  });
  try {
    /* THE SEED'S OWN OWNER, `p_seed`, who wrote its rows: owned by anyone else, every row an agent read would be
       another person's words, and the run would drop to Ask at its first read. */
    const named = running.api.kernel.createRecord({ ...IDENTITY, owner: { id: 'p_seed' } });
    if (!named.ok) throw new Error(`the seed host could not be named: ${named.refusal?.fix ?? 'no reason given'}`);
    const seeded = await installSeed(running.api.kernel);
    if (!seeded.ok) throw new Error(`the seed host could not take the seed: ${seeded.refusal?.fix ?? 'no reason given'}`);
    /* `grow`, A FUNCTION OVER THE KERNEL, MAKES IT BIGGER, as the agent bench's `big-seed.mjs` does to his size. */
    if (typeof grow === 'function') await grow(running.api.kernel);
  } catch (e) {
    await running.close().catch(() => {});
    throw e;
  }
  const inner = `http://127.0.0.1:${running.server.address().port}`;

  let base = '';
  const cli = (path) => {
    if (!existsSync(BUNDLE)) return null;
    if (path === 'braindog.mjs') return { type: 'text/javascript', body: readFileSync(BUNDLE) };
    if (path === 'braindog.mjs.sha256') return { type: 'text/plain', body: `${createHash('sha256').update(readFileSync(BUNDLE)).digest('hex')}  braindog.mjs\n` };
    if (path === 'install.sh') return { type: 'text/x-shellscript', body: readFileSync(INSTALL, 'utf8').replace(/^BASE=.*$/mu, `BASE='${base}/cli'`).replace(/^PIN=.*$/mu, "PIN=''") };
    return null;
  };

  const front = createServer(async (req, res) => {
    const at = new URL(req.url ?? '/', 'http://localhost');
    const served = at.pathname.startsWith('/cli/') ? cli(at.pathname.slice('/cli/'.length)) : undefined;
    if (served !== undefined) {
      if (served === null) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        return res.end(existsSync(BUNDLE) ? 'Not here.\n' : 'No bundle yet: run pnpm --filter braindog-cli build.\n');
      }
      res.writeHead(200, { 'content-type': served.type, 'cache-control': 'no-store' });
      return res.end(served.body);
    }
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && v !== undefined) headers[k] = Array.isArray(v) ? v.join(', ') : v;
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req);
    try {
      const got = await fetch(`${inner}${at.pathname}${at.search}`, { method: req.method, headers, body, duplex: 'half', redirect: 'manual' });
      const out = {};
      got.headers.forEach((v, k) => {
        if (!HOP.has(k) && k !== 'content-encoding') out[k] = v;
      });
      res.writeHead(got.status, out);
      if (got.body === null) return res.end();
      Readable.fromWeb(got.body).on('error', () => res.destroy()).pipe(res);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`The seed host's record did not answer: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  });
  await new Promise((done, fail) => front.once('error', fail).listen(port, '127.0.0.1', done));
  base = `http://localhost:${front.address().port}`;
  return {
    base,
    record: IDENTITY.slug,
    key,
    /* THE RECORD'S OWN API, for a caller in this process that times a call where the record answers it (`record-cost.mjs`). */
    api: running.api,
    close: async () => {
      await new Promise((done) => front.close(() => done()));
      await running.close();
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const split = process.argv.indexOf('--');
  const own = split === -1 ? process.argv.slice(2) : process.argv.slice(2, split);
  const command = split === -1 ? [] : process.argv.slice(split + 1);
  const { values } = parseArgs({ args: own, options: { port: { type: 'string', default: '0' } } });
  const host = await startSeedHost({ port: Number(values.port) });
  if (!existsSync(BUNDLE)) console.error('No command bundle yet, so /cli/ answers nothing: run pnpm --filter braindog-cli build.');
  if (command.length === 0) {
    console.log(host.base);
    const stop = () => host.close().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } else {
    console.error(`The seed host is at ${host.base}.`);
    const [cmd, ...args] = command.map((a) => a.replaceAll('{host}', host.base));
    const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, DOOR_SEED_KEY: host.key } });
    const code = await new Promise((done) => {
      child.on('error', (e) => {
        console.error(`${cmd} did not start: ${e.message}`);
        done(127);
      });
      child.on('close', (c) => done(c ?? 1));
    });
    await host.close();
    process.exit(code);
  }
}
