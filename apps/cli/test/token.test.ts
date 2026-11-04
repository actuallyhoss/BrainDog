/**
 * `braindog token create`, and `--inbox`.
 *
 * WHAT WAS MEASURED BEFORE THIS. No CLI command minted an agent token at all, and no token from anywhere could read the
 * money inbox: `createToken` kept no reach, and a token principal never carried one, so the record's inbox gate
 * (d41ec831) refused every token with "This needs owner, and no token reaches it".
 *
 * THE FIRST TEST IS THE WHOLE ROAD ON A REAL SELF-HOST, over a socket: the command mints, the printed bearer is sent to
 * `/api/inbox`, and the self-host's own `bearerFor` puts the reach on the principal the record reads. A token minted
 * without `--inbox` is sent the same way and refused, so the reach and nothing else is what opened it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { start } from '../../selfhost/src/server.ts';
import { tokenCommand, type TokenIo } from '../src/token.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';

/** A self-host holding one created record, and the io the command reaches it with under the server key. */
async function stack(t: { after: (f: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-token-selfhost-'));
  const serverKey = randomBytes(32).toString('base64url');
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: serverKey,
    sessionKey: new Uint8Array(randomBytes(32)),
    pollMs: 0,
  });
  t.after(async () => {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  const made = await running.api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: person.value.id, email: 'ada@example.com', name: 'Ada' },
  });
  assert.ok(made.ok, JSON.stringify(made));
  const base = `http://127.0.0.1:${(running.server.address() as { port: number }).port}`;
  const out: string[] = [];
  const said: string[] = [];
  const io: TokenIo = {
    env: { BRAINDOG_HOST: base, BRAINDOG_TOKEN: serverKey },
    cwd: dir,
    file: join(dir, 'hosts.json'),
    out: (l) => void out.push(l),
    say: (l) => void said.push(l),
  };
  /* The inbox, asked with a bearer the way an agent asks it. */
  const inbox = async (bearer: string) => {
    const res = await fetch(`${base}/api/inbox`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: '{}' });
    return { status: res.status, body: (await res.json()) as { ok: boolean; refusal?: { code: string; fix: string } } };
  };
  return { io, out, said, inbox, running };
}

test('--inbox MINTS A TOKEN THAT READS THE INBOX ON A SELF-HOST, printed once; without it the same road is refused', async (t) => {
  const s = await stack(t);

  assert.equal(await tokenCommand(['create', '--name', 'triage', '--inbox'], s.io), 0, s.said.join('\n'));
  assert.equal(s.out.length, 4, s.out.join('\n'));
  assert.match(s.out[0]!, /^triage · read · reads the inbox · expires \d{1,2} [A-Z][a-z]{2}( \d{4})? · t_\S+$/);
  assert.equal(s.out[1], '');
  assert.equal(s.out[3], 'shown once');
  const granted = s.out[2]!;
  assert.ok(granted.startsWith(`${REC}.`), 'the printed line is not a bearer for this record');

  const read = await s.inbox(granted);
  assert.equal(read.status, 200, JSON.stringify(read.body));
  assert.equal(read.body.ok, true);

  /* THE SAME COMMAND WITHOUT THE FLAG: a token for the whole record, from the owner, refused at the inbox. */
  s.out.length = 0;
  assert.equal(await tokenCommand(['create', '--name', 'laptop'], s.io), 0, s.said.join('\n'));
  assert.match(s.out[0]!, /^laptop · read · expires \d{1,2} [A-Z][a-z]{2}( \d{4})? · t_\S+$/);
  const without = await s.inbox(s.out[2]!);
  assert.equal(without.status, 403, JSON.stringify(without.body));
  assert.equal(without.body.refusal?.code, 'FORBIDDEN');

  /* AND THE ROW SAYS WHICH IS WHICH, so Settings and a later listing can tell the owner what each one opens. */
  const rows = s.running.api.kernel.listTokens().map((r) => [r.label, r.reach]);
  assert.deepEqual(rows.sort(), [['laptop', []], ['triage', ['inbox']]]);
});

/** A host that answers every `createToken` with `value` and records what was sent. */
function fake(value: unknown) {
  const sent: { url: string; auth: string | null; body: unknown }[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), auth: new Headers(init?.headers).get('authorization'), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return { fetch, sent };
}

const MINTED = { id: 't_1', bearer: `${REC}.thesecretthesecret`, scope: 'propose', expires_at: '2026-12-24T09:00:00.000Z' };

test('ON A HOST ELSEWHERE THE OWNER APPROVES THIS ONE MINT, and the grant is sent once, as the bearer of that mint', async () => {
  const host = fake({ ...MINTED, reach: [] });
  const asked: string[] = [];
  const out: string[] = [];
  const said: string[] = [];
  const code = await tokenCommand(['create', '--scope', 'read,propose', '--days', '30'], {
    env: { BRAINDOG_HOST: 'https://app.brain.dog/app/the-studio' },
    cwd: tmpdir(),
    file: join(tmpdir(), 'braindog-token-no-hosts.json'),
    out: (l) => void out.push(l),
    say: (l) => void said.push(l),
    fetch: host.fetch,
    approve: async (key) => (asked.push(key), { bearer: 'rec_x.operation' }),
  });
  assert.equal(code, 0, said.join('\n'));
  /* NOTHING WAS SENT BEFORE THE APPROVAL: no server key, and not this machine, so a first try could only be refused. */
  assert.deepEqual(asked, ['https://app.brain.dog/the-studio']);
  assert.deepEqual(host.sent, [{ url: 'https://app.brain.dog/api/createToken', auth: 'Bearer rec_x.operation', body: { scope: 'propose', days: 30 } }]);
  assert.equal(out[2], MINTED.bearer);
});

test('A HOST OLDER THAN THE REACH MINTS WITHOUT IT, and that token is not printed as one that reads the inbox', async () => {
  /* What a kernel before migration 15 answers: `reach` dropped on the way in, and absent on the way out. */
  const host = fake(MINTED);
  const out: string[] = [];
  const said: string[] = [];
  const code = await tokenCommand(['create', '--inbox'], {
    env: { BRAINDOG_HOST: 'http://127.0.0.1:9', BRAINDOG_TOKEN: 'server-key' },
    cwd: tmpdir(),
    file: join(tmpdir(), 'braindog-token-no-hosts.json'),
    out: (l) => void out.push(l),
    say: (l) => void said.push(l),
    fetch: host.fetch,
  });
  assert.equal(code, 1);
  assert.deepEqual(host.sent.map((s) => s.body), [{ scope: 'read', reach: ['inbox'] }]);
  assert.deepEqual(out, [], 'the bearer of a token that cannot do what was asked was printed');
  assert.match(said.join('\n'), /without the inbox/);
});

test('WHAT IS NOT A TOKEN THE RECORD COULD MAKE IS REFUSED HERE, with nothing sent', async () => {
  const host = fake(MINTED);
  const said: string[] = [];
  const io: TokenIo = {
    env: { BRAINDOG_HOST: 'http://127.0.0.1:9', BRAINDOG_TOKEN: 'server-key' },
    cwd: tmpdir(),
    file: join(tmpdir(), 'braindog-token-no-hosts.json'),
    out: () => {},
    say: (l) => void said.push(l),
    fetch: host.fetch,
  };
  assert.equal(await tokenCommand(['create', '--scope', 'admin'], io), 1);
  assert.equal(await tokenCommand(['create', '--days', 'soon'], io), 1);
  assert.equal(await tokenCommand(['create', 'extra'], io), 1);
  assert.equal(await tokenCommand(['list'], io), 1);
  assert.equal(await tokenCommand([], io), 1);
  assert.deepEqual(host.sent, []);
  assert.match(said[0]!, /admin is not one of them/);
});
