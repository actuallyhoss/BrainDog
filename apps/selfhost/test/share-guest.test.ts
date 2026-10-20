/**
 * Somebody not on the record yet, end to end over a real socket (sharing plan slice 8): the owner shares Kiln's tasks
 * with an address, mints the link, the stranger opens it and is told what is shared in the share's own words, proves
 * the mailbox, accepts, and boots seeing only Kiln's tasks. Stopping the share is their last, so their next call is
 * refused and the record leaves their switcher.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { start } from '../src/server.ts';
import { asJSON, register, testKeys } from '../../../packages/record/test/fixtures/webauthn/authenticator.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const KEYS = testKeys()!;
const NOW = Date.UTC(2026, 9, 20, 12);
const UNTIL = new Date(Date.UTC(2026, 11, 1, 12)).toISOString();

type Body = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } } | null;

const reg = (id: string, name: string, title: string, fields: unknown[], more: Record<string, unknown> = {}) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields, ...more } as never,
});

const DECLS = [
  reg('things', 'Things', 'name', [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }], { scopes: { repos: 'repos' } }),
  reg('tasks', 'Tasks', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'thing', type: 'ref', to: 'things', scope: {} },
  ]),
];

test('SHARED WITH A NEW ADDRESS: link, mailbox proof, accept, a guest who sees only Kiln, then nothing once it stops', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-share-guest-'));
  const serverKey = randomBytes(32).toString('base64url');
  const mailed: { to: string; link: string; kind?: string }[] = [];
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: serverKey,
    sessionKey: new Uint8Array(randomBytes(32)),
    now: () => NOW,
    pollMs: 0,
    mail: (to, link, kind) => void mailed.push({ to, link, ...(kind === undefined ? {} : { kind }) }),
  });
  try {
    const port = (running.server.address() as { port: number }).port;
    const origin = `http://localhost:${port}`;
    const call = async (path: string, init: { body?: unknown; sid?: string } = {}) => {
      const method = init.body === undefined ? 'GET' : 'POST';
      const headers: Record<string, string> = {
        ...(method === 'GET' ? {} : { origin, 'content-type': 'application/json' }),
        ...(init.sid === undefined ? {} : { cookie: `bd_s=${init.sid}` }),
      };
      const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) });
      const raw = await res.text();
      const sid = res.headers.getSetCookie().map((c) => /^bd_s=([A-Za-z0-9_-]{43});/.exec(c)?.[1]).find(Boolean);
      return { status: res.status, raw, body: (raw ? JSON.parse(raw) : null) as Body, sid };
    };
    const value = <T>(out: { status: number; raw: string; body: Body }): T => {
      assert.equal(out.status, 200, out.raw);
      return out.body?.value as T;
    };

    /* THE RECORD: Ada owns it, and Kiln and the Mill each have tasks. */
    const ada = running.directory.person$('ada@example.com', 'Ada');
    assert.ok(ada.ok);
    assert.ok((await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: ada.value.id, email: 'ada@example.com', name: 'Ada' } })).ok);
    assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
    assert.ok((await running.api.kernel.install(DECLS)).ok);

    const keyed = await call('/auth/token', { body: { serverKey } });
    const owner = keyed.sid ?? assert.fail(keyed.raw);
    /* A PASSKEY FIRST, so the server key's one-person rule no longer stands between the owner and a second person. */
    const options = await call('/auth/passkey/register/options', { sid: owner, body: {} });
    const credential = await register(KEYS.es256, { rpId: 'localhost', origin, challenge: String((options.body?.value as { challenge: string }).challenge) });
    assert.equal((await call('/auth/passkey/register', { sid: owner, body: { credential: asJSON.registration(credential), label: 'Laptop' } })).status, 200);

    const kiln = value<{ id: string }>(await call('/api/create', { sid: owner, body: { register: 'things', fields: { name: 'Kiln' } } }));
    const mill = value<{ id: string }>(await call('/api/create', { sid: owner, body: { register: 'things', fields: { name: 'Mill' } } }));
    for (const [what, thing] of [['Glaze test', kiln.id], ['Fire the kiln', kiln.id], ['Oil the mill', mill.id]] as const)
      value(await call('/api/create', { sid: owner, body: { register: 'tasks', fields: { what, thing } } }));

    /* 1. SHARED WITH AN ADDRESS NOBODY HERE HOLDS, and the link that carries it: no level, only what waits for it. */
    const shared = value<{ sentence: string }>(
      await call('/api/share', { sid: owner, body: { share: { who: { kind: 'email', id: 'priya@studio.co' }, what: { project: kiln.id, lists: ['tasks'] }, can: 'edit', when: { until: UNTIL } } } }),
    );
    assert.equal(shared.sentence, 'priya@studio.co can edit tasks in Kiln until 1 Dec.');
    const minted = value<{ token: string }>(await call('/api/invite', { sid: owner, body: { email: 'priya@studio.co' } }));

    /* 2. OPENED BY NOBODY SIGNED IN: what is shared, said in the share's own words, names and never ids. */
    const seen = value<{ shared: string; level: null; lists: unknown[] }>(await call('/auth/invite', { body: { inviteToken: minted.token } }));
    assert.equal(seen.shared, 'Ada shared Kiln with you. You can edit tasks in Kiln until 1 Dec.');
    assert.equal(seen.level, null);
    assert.deepEqual(seen.lists, []);
    assert.ok(!seen.shared.includes(kiln.id));

    /* 3. THE MAILBOX PROVES ITSELF: accept mails a link, and the proof in it comes back beside the invitation. */
    const proving = await call('/auth/invite', { body: { inviteToken: minted.token, accept: true, name: 'Priya' } });
    assert.equal(proving.status, 202, proving.raw);
    const link = mailed.find((m) => m.to.toLowerCase() === 'priya@studio.co')?.link ?? assert.fail('no proof was mailed');
    const proof = /&proof=([A-Za-z0-9_-]+)$/.exec(link)?.[1] ?? assert.fail(link);

    /* 4. ACCEPTED: a session for the new person, and the share is now theirs. */
    const accepted = await call('/auth/invite', { body: { inviteToken: minted.token, accept: true, proof } });
    assert.equal(accepted.status, 200, accepted.raw);
    const priya = accepted.sid ?? assert.fail('no session for the guest');
    const kept = running.api.kernel.sharesKept();
    assert.equal(kept.length, 1);
    assert.equal(kept[0]!.who.kind, 'person');
    assert.equal(running.api.kernel.sharesWaiting('priya@studio.co').length, 0);

    /* 5. THE GUEST BOOTS, AND SEES ONLY KILN'S TASKS: no member row, no Mill task, no list of things. */
    const boot = await call('/api/boot', { sid: priya });
    assert.equal(boot.status, 200, boot.raw);
    const tasks = value<{ rows: { fields: { what: string } }[] }>(await call('/api/list', { sid: priya, body: { register: 'tasks' } }));
    assert.deepEqual(tasks.rows.map((r) => r.fields.what).sort(), ['Fire the kiln', 'Glaze test']);
    /* THE PROJECT ITSELF IS SEEN, as a project share shows the row it is about, and the Mill is not. */
    const things = value<{ rows: { fields: { name: string } }[] }>(await call('/api/list', { sid: priya, body: { register: 'things' } }));
    assert.deepEqual(things.rows.map((r) => r.fields.name), ['Kiln']);
    const records = value<{ slug: string }[]>(await call('/account/records', { sid: priya }));
    assert.deepEqual(records.map((r) => r.slug), ['the-studio']);

    /* 6. THE LAST SHARE STOPS: the next call is refused, and the record leaves the guest's switcher. */
    const stopped = value<{ ended: string[]; left: string[] }>(await call('/api/unshare', { sid: owner, body: { id: kept[0]!.id } }));
    assert.deepEqual(stopped.ended, [kept[0]!.id]);
    assert.equal(stopped.left.length, 1);
    /* AND THE DIRECTORY FOLLOWED: it no longer names them as reaching the record. */
    assert.equal(running.directory.reaches(REC, stopped.left[0]!), false);
    assert.equal((await call('/api/list', { sid: priya, body: { register: 'tasks' } })).status, 403);
    const after = await call('/account/records', { sid: priya });
    assert.deepEqual(after.body?.value ?? [], []);
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
