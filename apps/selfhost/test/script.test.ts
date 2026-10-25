/**
 * A script's scheduled run on the self-host, end to end.
 *
 * THE WHOLE PATH AND NOT A PIECE OF IT. A `script` declaration is installed, its schedule comes due, `poll` fires it
 * into the outbox, the pass leases it, QuickJS runs the source, its `ctx.fetch` leaves through the same `sendAction`
 * a `call` does (origin, `pin`, key by reference, scrubbed answer), the kernel applies the write, and the Directory
 * counts the run. `send` stands in for the socket and `resolve` for the name service, the pattern `actions.test.ts`
 * uses, so nothing here touches the network and every request that would have left is in `net.calls`.
 *
 * WHY NOT THE REHEARSAL'S REAL SOCKET. `rehearseOnThisMachine` is built inside `actionExecutor` and not exported, so a
 * script's fetch cannot be pointed at a local https server without editing `actions.ts`, which this change does not
 * own. The socket itself is the rehearsal's to prove (`rehearsal.test.ts`); what is new here is everything above it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Scripted } from '@braindog/kernel';

import type { Pinned, Resolve, Send } from '../src/actions.ts';
import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const FAKE_KEY = 'fake-gold-key-not-a-secret-7f3a';
const PUBLIC = '203.0.113.10';

/** A name service from a table, remembering what it was asked. */
function names(table: Record<string, string[]>): { resolve: Resolve; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    resolve: async (host) => {
      asked.push(host);
      return (table[host] ?? []).map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
    },
  };
}

/**
 * A provider that ECHOES THE AUTHORIZATION HEADER into its answer, which is the worst thing one can do with a key: if
 * the scrub in `sendAction` were not on the script's path, the key would come back into the sandbox and from there into
 * the row, the log and the event.
 */
function provider(): { send: Send; calls: { url: string; auth: string | null; pinned: Pinned }[] } {
  const calls: { url: string; auth: string | null; pinned: Pinned }[] = [];
  return {
    calls,
    send: async (url, init, pinned) => {
      const auth = new Headers(init.headers).get('authorization');
      calls.push({ url: url.href, auth, pinned });
      return new Response(JSON.stringify({ price: 421_050, echo: auth }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
}

const SOURCE = `export default async function run(ctx) {
  const r = await ctx.fetch(ORIGIN + '/v1/XAU/EGP', { key: 'goldapi' });
  const said = await r.text();
  ctx.log('the provider said', said);
  ctx.write('gold_egp', { at: ctx.now(), value: JSON.parse(said).price, said });
}`;

const GOLD_EGP = {
  id: 'register.gold_egp',
  kind: 'register',
  body: {
    id: 'gold_egp',
    name: 'Gold, EGP',
    title: 'at',
    fields: [
      { id: 'at', type: 'text', required: true },
      { id: 'value', type: 'int' },
      { id: 'said', type: 'text' },
    ],
  },
};

/** One scheduled script that fetches from `origin` with the key and writes one row: the same source, aimed anywhere. */
const script = (name: string, origin: string) => ({
  id: `script.${name}`,
  kind: 'script',
  body: {
    script: name,
    runs: { every: '1h' },
    egress: [origin],
    keys: ['goldapi'],
    reads: [],
    writes: ['gold_egp'],
    source: SOURCE.replace('ORIGIN', JSON.stringify(origin)),
  },
});

/** A self-host with a Directory, a record Ada owns, the key in its keychain and `scripts` installed and due now. */
async function selfhost(scripts: ReturnType<typeof script>[], resolve: Resolve, send: Send) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-script-'));
  let opened = 0;
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    actions: { openKey: async () => (opened++, FAKE_KEY), send, resolve },
  });
  const person = running.directory.person$('ada@example.test', 'Ada');
  assert.ok(person.ok);
  assert.ok((await running.api.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } })).ok);
  assert.ok(running.directory.provision({ slug: 'studio', email: 'ada@example.test', record: REC }).ok);
  const k = running.api.kernel;
  assert.ok(
    k.bindGrant(
      { label: 'goldapi', opens: 'api.gold.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([9, 8, 7]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_fake' },
      person.value.id,
    ).ok,
  );
  const installed = await k.install([GOLD_EGP, ...scripts] as never);
  assert.ok(installed.ok, JSON.stringify(installed));
  /* DUE NOW RATHER THAN AT ITS JITTER, which for an hourly script is up to an hour away (`firstDueMs`). */
  running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script'", new Date(Date.now() - 1_000).toISOString());

  const today = new Date().toISOString().slice(0, 10);
  return {
    running,
    k,
    opened: () => opened,
    rows: () => running.sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'gold_egp'"),
    events: (name: string) =>
      running.sql.all<{ actor: string; note: string; to_v: string | null }>("SELECT actor, note, to_v FROM event WHERE target = ? AND to_v IS NOT NULL ORDER BY rowid", `declaration:script.${name}`),
    allEvents: () => running.sql.all<Record<string, unknown>>('SELECT * FROM event'),
    ledger: () => {
      const usage = running.directory.usage(person.value.id, { from: today, to: today });
      assert.ok(usage.ok);
      return usage.value.records.find((r) => r.record === REC);
    },
    close: async () => {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('A SCHEDULED SCRIPT FETCHES WITH ITS KEY, WRITES ONE ROW AS ITSELF, and the Directory ledger shows one run', async () => {
  const net = provider();
  const dns = names({ 'api.gold.test': [PUBLIC] });
  const s = await selfhost([script('gold-rate', 'https://api.gold.test')], dns.resolve, net.send);
  try {
    await s.running.poll();

    /* ONE REQUEST, TO THE CHECKED ADDRESS, WITH THE KEY AS A BEARER. The key was opened outside the sandbox. */
    assert.deepEqual(
      net.calls.map((c) => [c.url, c.auth, c.pinned.address]),
      [['https://api.gold.test/v1/XAU/EGP', `Bearer ${FAKE_KEY}`, PUBLIC]],
    );
    assert.equal(s.opened(), 1);

    /* ONE ROW, WRITTEN BY THE VERSION THAT RAN, with the price the provider answered. */
    const rows = s.rows().map((r) => JSON.parse(r.fields) as { value: number; said: string });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.value, 421_050);
    const [run] = s.events('gold-rate');
    assert.equal(run?.actor, 'script:gold-rate@v1');
    const said = JSON.parse(run?.to_v ?? '{}') as { channel: string; outcome: string; usage: { runs: number; requests: number } };
    assert.equal(said.channel, 'script');
    assert.equal(said.outcome, 'ok', run?.note);
    assert.deepEqual([said.usage.runs, said.usage.requests], [1, 1]);

    /* THE LEDGER COUNTED IT ONCE, under the script's own name, on the self-host's plan. */
    const mine = s.ledger();
    assert.equal(mine?.plan, 'selfhost');
    assert.equal(mine?.totals.runs, 1);
    assert.equal(mine?.totals.failures, 0);
    assert.deepEqual(mine?.actions.map((a) => a.action), ['gold-rate']);

    /* THE KEY IS NOWHERE THE RECORD KEEPS: not in the row (the echo came back scrubbed), not in any event. */
    assert.match(rows[0]?.said ?? '', /--redacted--/);
    assert.doesNotMatch(JSON.stringify(s.rows()), new RegExp(FAKE_KEY));
    /* EVERY EVENT, NOT ONLY THE RUN'S: the `grant.read` the opening wrote, and the run's `to_v`, which carries the
       sandbox's log once the kernel keeps it there (measured with that change in the tree: the
       log arrived on the event as `Bearer --redacted--`). */
    assert.doesNotMatch(JSON.stringify(s.allEvents()), new RegExp(FAKE_KEY));

    /* A SECOND PASS WITHIN THE HOUR RUNS NOTHING. */
    await s.running.poll();
    assert.equal(net.calls.length, 1);
    assert.equal(s.ledger()?.totals.runs, 1);
  } finally {
    await s.close();
  }
});

test('THE SAME SCRIPT AIMED AT A LOCAL ADDRESS IS REFUSED BEFORE ANY SOCKET OPENS OR ANY KEY IS OPENED, written as one or resolved to one', async () => {
  const net = provider();
  /* `inside.gold.test` IS A NAME, so only `pin` can know it is loopback: it resolves there. `127.0.0.1` is written as
     an address, and `sendAction` refuses it before `pin` is asked, which is why the name service never hears of it. */
  const dns = names({ 'inside.gold.test': ['127.0.0.1'] });
  /* WITHOUT A KEY, because the rule under test is the address: `goldapi` opens `api.gold.test`, and sent to either host
     below it would be refused as a key sent away (`keyRefused`) before the address was ever asked about. */
  const keyless = (s: ReturnType<typeof script>) => ({ ...s, body: { ...s.body, keys: [] as string[], source: s.body.source.replace(", { key: 'goldapi' }", '') } });
  const s = await selfhost([keyless(script('gold-local', 'https://127.0.0.1')), keyless(script('gold-inside', 'https://inside.gold.test'))], dns.resolve, net.send);
  try {
    await s.running.poll();

    assert.equal(net.calls.length, 0, 'a request left for a local address');
    assert.equal(s.opened(), 0, 'a key was opened for a request that could never be sent');
    assert.deepEqual(dns.asked, ['inside.gold.test']);
    assert.equal(s.rows().length, 0);

    for (const [name, why] of [
      ['gold-local', /127\.0\.0\.1 is a private or local address, so nothing was sent\./],
      ['gold-inside', /inside\.gold\.test resolves to 127\.0\.0\.1, which is a loopback address, so nothing was sent to it\./],
    ] as const) {
      const [run] = s.events(name);
      const said = JSON.parse(run?.to_v ?? '{}') as { outcome?: string; log?: string };
      assert.equal(said.outcome, 'refused', `${name}: ${run?.note ?? 'no run event'}`);
      /* THE REASON IS IN THE LOG, NOT THE NOTE: a refusal can quote words the script chose, and the note is read by
         every whole-record reader while the log is read only by whoever may read the lists it touched. */
      assert.match(said.log ?? '', why);
      assert.match(run?.note ?? '', /did not finish, so it wrote nothing; its log says why\./);
    }

    /* A REFUSED RUN IS A RUN, and the ledger says so: two runs, two failures, nothing held. */
    const mine = s.ledger();
    assert.deepEqual([mine?.totals.runs, mine?.totals.failures, mine?.totals.held], [2, 2, 0]);
  } finally {
    await s.close();
  }
});

test("THE KEY'S VALUE IS NOT IN THE SANDBOX'S LOG EITHER, as the runner hands it back, before the record decides what to keep", async () => {
  /* THE BINDING IS IMPORTED HERE AND NOT AT THE TOP, so the two tests above fail on what the server does rather than
     on a module that does not exist yet. The log is asserted at the runner because whether the record keeps it, and
     where, is the kernel's call; what cannot depend on that call is that the key was never in it. */
  const { scriptSandbox } = await import('../src/script.ts');
  const net = provider();
  const runner = scriptSandbox(
    { kernel: { grants: () => [{ id: 'g_1', label: 'goldapi', opens: 'api.gold.test', revoked_at: null, created_at: '2026-09-22T00:00:00.000Z' }] } } as never,
    { openKey: async () => FAKE_KEY, send: net.send, resolve: names({ 'api.gold.test': [PUBLIC] }).resolve },
  );
  const decl = script('gold-rate', 'https://api.gold.test').body;
  const answer = await runner({
    job: { id: 'o_1', leasedUntil: '' },
    host: 'api.gold.test',
    scripted: { script: 'gold-rate', version: 1, actor: 'script:gold-rate@v1', input: null, decl, record: { id: REC, tz: 'UTC' } },
  } as unknown as Scripted);

  assert.ok('writes' in answer, JSON.stringify(answer));
  assert.match(answer.log, /^the provider said \{"price":421050,"echo":"Bearer --redacted--"\}/);
  assert.doesNotMatch(JSON.stringify(answer), new RegExp(FAKE_KEY));
  assert.equal(net.calls[0]?.auth, `Bearer ${FAKE_KEY}`);
});

test('A REVOKED KEY IS NEVER OPENED FOR A SCRIPT: the live one under the same label is, and with none live nothing is sent at all', async () => {
  /* HERE BECAUSE the three tests above stayed green with `grantNamed`'s revoked filter deleted and
     with the host's "not in the keychain" refusal deleted, which sent the request bare. A key revoked after the script was
     installed is the ordinary way to reach both. */
  const { scriptSandbox } = await import('../src/script.ts');
  const run = async (grants: { id: string; label: string; opens: string; revoked_at: string | null; created_at: string }[]) => {
    const net = provider();
    const opened: string[] = [];
    const runner = scriptSandbox({ kernel: { grants: () => grants } } as never, {
      openKey: async (grant) => (opened.push(grant.id), FAKE_KEY),
      send: net.send,
      resolve: names({ 'api.gold.test': [PUBLIC] }).resolve,
    });
    const answer = await runner({
      job: { id: 'o_1', leasedUntil: '' },
      host: 'api.gold.test',
      scripted: { script: 'gold-rate', version: 1, actor: 'script:gold-rate@v1', input: null, decl: script('gold-rate', 'https://api.gold.test').body, record: { id: REC, tz: 'UTC' } },
    } as unknown as Scripted);
    return { answer, opened, calls: net.calls.length };
  };

  /* THE REVOKED ONE IS THE NEWER, so an order that forgot `revoked_at` would pick it first. */
  const rotated = await run([
    { id: 'g_new', label: 'goldapi', opens: 'api.gold.test', revoked_at: '2026-09-22T01:00:00.000Z', created_at: '2026-09-22T00:00:00.000Z' },
    { id: 'g_old', label: 'goldapi', opens: 'api.gold.test', revoked_at: null, created_at: '2026-09-01T00:00:00.000Z' },
  ]);
  assert.ok('writes' in rotated.answer, JSON.stringify(rotated.answer));
  assert.deepEqual(rotated.opened, ['g_old']);

  const revoked = await run([{ id: 'g_new', label: 'goldapi', opens: 'api.gold.test', revoked_at: '2026-09-22T01:00:00.000Z', created_at: '2026-09-22T00:00:00.000Z' }]);
  assert.ok('refused' in revoked.answer, JSON.stringify(revoked.answer));
  assert.match(revoked.answer.refused.why, /The key "goldapi" is not in the keychain, so nothing was sent\./);
  assert.deepEqual([revoked.calls, revoked.opened.length], [0, 0]);
});

test('A SCRIPT AND A CALL IN ONE PASS SHARE ONE ADMISSION COUNT, so a record with one run left spends it once', async () => {
  /* HERE BECAUSE `holdingScript` could be made to ignore its hold and every test above stayed green:
     a pass on the self-host never meets the allowance in them. */
  const { holding, pass } = await import('../src/actions.ts');
  const { holdingScript } = await import('@braindog/host/script');
  const admissions = pass();
  const oneLeft = (_record: string, _action: string, pending = 0) => (pending >= 1 ? { until: 1, say: 'Studio has used its runs this month.' } : null);
  let sandboxes = 0;
  const call = holding(async () => ({ status: 200, body: '', bytes: 0, ms: 0, requests: 1 }), REC, oneLeft, admissions);
  const scripted = holdingScript(
    async () => {
      sandboxes++;
      return { writes: [], log: '', usage: { fetches: 0, bytes: 0, wall_ms: 0 } } as never;
    },
    REC,
    oneLeft,
    admissions,
  );

  assert.equal('held' in (await call({ ingest: 'nudge' } as never)), false);
  const answer = await scripted({ scripted: { script: 'gold-rate' } } as unknown as Scripted);
  assert.deepEqual(answer, { held: { until: 1, say: 'Studio has used its runs this month.' } });
  assert.equal(sandboxes, 0, 'the sandbox started for a run the allowance had already spent');
});
