/**
 * The self-host's wiring for batch 39: the command's build reaches the token check, the build address says the oldest
 * command it serves, a server whose operator left the switch off holds each action with the sentence Scheduled shows,
 * and a start at a shared name is refused.
 *
 * EACH ONE IS A LINE IN `server.ts` THAT A LATER EDIT COULD DROP WITHOUT ANY OTHER TEST NOTICING, so each is asserted
 * through the door a caller uses, not through the helper behind it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sharedSuffix } from '@braindog/record/directory';
import { MIN_CLI } from '../../../packages/mcp/src/build.ts';
import { openKeyStore } from '../src/keys.ts';
import { start } from '../src/server.ts';
import { OUTBOUND_HELD_MS, OUTBOUND_OFF } from '../src/script.ts';
import { serveUntil } from './serving.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOW = Date.UTC(2026, 9, 9, 12);
/** Obviously not a real key. */
const SERVER_KEY = 'fake-server-key-for-server-wire-tests';
/** A build as the command sends it (`apps/cli/scripts/bundle.mjs`, `TUPLE`). */
const BUILD = '2026.10.08+1a2b3c4';
const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

type Running = Awaited<ReturnType<typeof start>>;

/**
 * A host on a pinned clock with one record and its owner, and no `actions`: the server an operator gets by default. A key
 * store, so the deposit door asks a login token at all.
 */
async function host(build = ''): Promise<{ running: Running; port: number; dir: string; close: () => Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-server-wire-'));
  const keys = await openKeyStore(join(dir, 'kek.key'));
  const running = await start({ file: join(dir, 'record.sqlite'), port: 0, host: '127.0.0.1', token: SERVER_KEY, now: () => NOW, pollMs: 0, build, keys });
  assert.ok(running.api.kernel.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const port = (running.server.address() as { port: number }).port;
  return {
    running,
    port,
    dir,
    close: async () => {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Every `verifyToken` call this host makes, by its arguments, and the real check still answering. */
function watchVerify(running: Running): unknown[][] {
  const kernel = running.api.kernel as unknown as { verifyToken: (...args: unknown[]) => Promise<unknown> };
  const real = kernel.verifyToken.bind(kernel);
  const calls: unknown[][] = [];
  kernel.verifyToken = (...args: unknown[]) => (calls.push(args), real(...args));
  return calls;
}

/* ── the command's build ────────────────────────────────────────────────── */

test('THE BUILD HEADER REACHES THE TOKEN CHECK at /api, /mcp and the deposit door, as its fourth argument', async () => {
  const h = await host();
  try {
    const calls = watchVerify(h.running);
    /* A BEARER WITH A DOT IS AN AGENT TOKEN TO THIS HOST, so each of these reaches the check; this one is not known. */
    const bearer = `${REC}.not-a-token-this-record-minted`;
    const headers = { authorization: `Bearer ${bearer}`, 'content-type': 'application/json', 'x-braindog-cli': BUILD };
    await (await fetch(`http://127.0.0.1:${h.port}/api/boot`, { method: 'POST', headers, body: '{}' })).body?.cancel();
    await (
      await fetch(`http://127.0.0.1:${h.port}/mcp`, {
        method: 'POST',
        headers: { ...headers, accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
    ).body?.cancel();
    await (await fetch(`http://127.0.0.1:${h.port}/api/vault/deposit`, { method: 'POST', headers, body: '{}' })).body?.cancel();

    assert.deepEqual(
      calls.map((c) => [c[1], c[3]]),
      [
        ['api', BUILD],
        ['mcp', BUILD],
        ['api', BUILD],
      ],
    );

    /* AND A CALL WITHOUT THE HEADER HANDS NOTHING ON, rather than an empty string the kernel would have to tell apart. */
    calls.length = 0;
    await (await fetch(`http://127.0.0.1:${h.port}/api/boot`, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: '{}' })).body?.cancel();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.[3], undefined);
  } finally {
    await h.close();
  }
});

test('A KEY KEEPS THE BUILD OF THE COMMAND THAT LAST USED IT, and the token listing says it', async () => {
  const h = await host();
  try {
    const minted = await h.running.api.createToken({ scope: 'read', label: 'Studio laptop' }, { principal: { kind: 'person', id: 'p_1', level: 'owner' } });
    assert.ok(minted.ok, JSON.stringify(minted));
    const { id, bearer } = (minted as { value: { id: string; bearer: string } }).value;
    const boot = async (cli: string): Promise<string | null | undefined> => {
      const res = await fetch(`http://127.0.0.1:${h.port}/api/boot`, {
        method: 'POST',
        headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json', 'x-braindog-cli': cli },
        body: '{}',
      });
      assert.equal(res.status, 200);
      await res.body?.cancel();
      return (h.running.api.kernel.listTokens().find((t) => t.id === id) as { last_build?: string | null } | undefined)?.last_build;
    };
    /* A HEADER THAT IS NOT A BUILD IS DROPPED, a path of the caller's machine above all: the key keeps nothing, and later
       keeps the build it had. The header is anybody's to send, and the listing is read by a person. */
    const path = '/Users/someone/braindog/apps/cli';
    assert.equal(await boot(path), null);
    assert.equal(await boot(BUILD), BUILD);
    assert.equal(await boot(`${BUILD} ${path}`), BUILD);
    assert.equal(await boot(path), BUILD);
  } finally {
    await h.close();
  }
});

/* ── the build address ──────────────────────────────────────────────────── */

test('THE BUILD ADDRESS ANSWERS { app, min_cli }, and min_cli is the day packages/mcp keeps', async () => {
  for (const [build, app] of [['2026.10.09+abcdef1', '2026.10.09+abcdef1'], ['', null]] as const) {
    const h = await host(build);
    try {
      const res = await fetch(`http://127.0.0.1:${h.port}/.well-known/braindog-build`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      /* THE SAME DAY AS THE PACKAGE'S, so the copy in `server.ts` cannot move without this going red. */
      assert.deepEqual(await res.json(), { app, min_cli: MIN_CLI });
      assert.match(MIN_CLI, /^\d{4}\.\d{2}\.\d{2}$/);
    } finally {
      await h.close();
    }
  }
});

/* ── the operator's switch, off ─────────────────────────────────────────── */

test('WITH THE SWITCH OFF AN ADD-ON ACTION IS HELD WITH THE SENTENCE SCHEDULED SHOWS, and offered again a day on', async () => {
  const h = await host();
  try {
    const { kernel } = h.running.api;
    assert.ok(
      kernel.bindGrant(
        { label: 'example read', opens: 'api.example.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' },
        'p_1',
      ).ok,
    );
    const installed = await kernel.install([
      { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
      {
        id: 'ingest.balance',
        kind: 'ingest',
        body: { ingest: 'balance', channel: 'poll', url: 'https://api.example.test/v1/balance', every: '1h', grant: 'example read', extract: { what: { after: 'balance ' } }, writes: { register: 'notes' } } as never,
      },
    ]);
    assert.ok(installed.ok, JSON.stringify(installed));
    /* DUE NOW RATHER THAN AT ITS JITTER. */
    h.running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'poll' AND key = 'balance'", new Date(NOW - 1_000).toISOString());

    await h.running.poll();

    /* HELD BEFORE ANYTHING WAS RESOLVED: a name that does not exist would have said so in the note instead. */
    assert.equal(h.running.sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' ORDER BY ts DESC, id DESC LIMIT 1")?.note, OUTBOUND_OFF);
    const row = h.running.sql.one<{ state: string; due_at: string }>("SELECT state, due_at FROM schedule WHERE kind = 'poll' AND key = 'balance'");
    assert.equal(row?.state, 'pending');
    assert.equal(row?.due_at, new Date(NOW + OUTBOUND_HELD_MS).toISOString());
    assert.equal(h.running.sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'notes'")?.n, 0);
  } finally {
    await h.close();
  }
});

/**
 * The environment `serve` gets by default: no switch and no model. Taken from this process and not written fresh, so
 * Node and the paths it needs are as they are for every other test that serves.
 */
function bareEnv(extra: Record<string, string>): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, ...extra };
  for (const name of ['BRAINDOG_OUTBOUND', 'SLASH_KEY', 'SLASH_MODEL', 'SLASH_ENDPOINT', 'BRAINDOG_TOKEN', 'BRAINDOG_SERVER_KEY', 'BRAINDOG_LISTEN', 'BRAINDOG_ORIGIN', 'BRAINDOG_BUILD']) delete env[name];
  return env;
}

test('WITH NO MODEL AND THE SWITCH OFF, THE SERVER STILL STARTS, says its actions are held, and answers the build address', async () => {
  const data = mkdtempSync(join(tmpdir(), 'braindog-bare-start-'));
  try {
    const env = bareEnv({ BRAINDOG_DATA: data, BRAINDOG_OWNER: '', PORT: '0', BRAINDOG_HOST: '127.0.0.1' });
    const made = spawnSync(process.execPath, [MAIN, 'init', 'the-studio', '--owner', 'ada@example.com'], { encoding: 'utf8', env });
    assert.equal(made.status, 0, made.stderr);
    let answered: unknown = null;
    const served = await serveUntil(env, async (said) => {
      const port = /http:\/\/localhost:(\d+)/.exec(said)?.[1];
      if (port === undefined || !said.includes('their scheduled actions are held')) return false;
      try {
        answered = await (await fetch(`http://127.0.0.1:${port}/.well-known/braindog-build`)).json();
        return true;
      } catch {
        return false;
      }
    });
    /* AN ANSWER IS A SERVER THAT WAS UP; the test stopped it, and it shut down cleanly rather than refusing. */
    assert.deepEqual(answered, { app: null, min_cli: MIN_CLI }, served.stderr);
    assert.notEqual(served.status, 1, served.stderr);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

/* ── a start at a shared name ───────────────────────────────────────────── */

test('A START AT A SHARED NAME IS REFUSED: the sentence on stderr, nothing on stdout, no key, and a non-zero exit', async () => {
  const data = mkdtempSync(join(tmpdir(), 'braindog-shared-name-'));
  const serverKey = randomBytes(32).toString('base64url');
  try {
    const env = { ...process.env, BRAINDOG_DATA: data, BRAINDOG_OWNER: '', PORT: '0' };
    const made = spawnSync(process.execPath, [MAIN, 'init', 'the-studio', '--owner', 'ada@example.com'], { encoding: 'utf8', env });
    assert.equal(made.status, 0, made.stderr);
    /* NEVER READY: the process is waited on until it exits by itself, which is the refusal. */
    const served = await serveUntil({ ...env, BRAINDOG_TOKEN: serverKey, BRAINDOG_HOST: '127.0.0.1', BRAINDOG_ORIGIN: 'https://the-studio.fly.dev' }, () => false);
    const said = sharedSuffix('the-studio.fly.dev');
    assert.ok(said, 'fly.dev is not a shared name any more');
    assert.equal(served.status, 1, served.stderr);
    assert.ok(served.stderr.includes(said), served.stderr);
    assert.equal(served.stdout, '', 'serve wrote to stdout, which belongs to the CLI');
    assert.ok(!`${served.stdout}${served.stderr}`.includes(serverKey), 'the refusal printed the server key');
    /* NO PATH OF THIS MACHINE IN WHAT THE OPERATOR READS. */
    assert.ok(!served.stderr.includes(data), served.stderr);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});
