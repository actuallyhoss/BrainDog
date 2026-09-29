/**
 * Slash's three new doors on the self-host, over a real socket: `GET /api/slash/status`, `POST /api/slash/settings`
 * and the cap they set, held by `POST /api/slash/read` and kept across a restart.
 *
 * WHY A SECOND FILE AND NOT MORE CASES IN `packages/host/test/slash-ask.test.ts`. That suite drives `serveSlash`
 * over an engine it writes itself, so it can say the door calls `configure` and cannot say the call reaches the
 * package's engine, lands in `slash.sqlite` and is read back by the next process. `server.ts` dispatches on the
 * truth of `servesSlash` alone, so widening it mounted three doors here without a line of this app changing, and
 * nothing had driven them through this host until this file.
 *
 * RED BEFORE THE DOORS, MEASURED with `aa763cdf^`'s `packages/host/src/slash-ask.ts` served in place of
 * today's by a loader hook and nothing in the tree changed: both tests failed at their first status GET, 404
 * `ROUTE_UNKNOWN`, "There is no method called slash/status." The old `servesSlash` named `read` alone, so the path
 * fell through to `serveApi`, which read it as a record method. Neither test reached a settings POST.
 *
 * THE SESSIONS ARE PLANTED IN THE DIRECTORY, as `signin.test.ts` plants them, because the server key's sign-in
 * stops at the second person on a record (`invite.test.ts`) and a colleague is what one of these cases needs. The
 * cookie still goes through the directory's own `session` flow on every request, so what the door is handed is the
 * context this host builds for a browser and not one written here.
 *
 * THE MODEL IS THE ONLY DOUBLE, and it is counted, so a refusal is seen to have spent nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { start } from '../src/server.ts';

const HOUR = 3_600_000;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const DRAFT = '{"registers":["things"],"where":null,"q":"Kiln"}';

/* A REGISTER WITH A ROW, BECAUSE A RECORD WITH NO LISTS IS NOT BILLED. `asksUsed` skips a call whose model is `-`,
   which is the read that answered `nothing` without drafting (`packages/slash/src/call.ts`), so on an empty record
   the cap of 1 would hold nothing and the second ask would be answered 200 for the right reason. */
const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Things', title: 'name', search: ['name'], fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

type Body = { ok: boolean; value?: Record<string, unknown>; refusal?: { code: string; fix: string; at?: string } } | null;

/** One process over `dir`, with the record made on the first boot and found on the file on every boot after it. */
async function boot(dir: string, sessionKey: Uint8Array, first: boolean) {
  let calls = 0;
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: randomBytes(32).toString('base64url'),
    sessionKey,
    pollMs: 0,
    slash: {
      url: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'small',
      key: 'fake-operator-key',
      send: async () => (
        calls++,
        new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: DRAFT } }], usage: { prompt_tokens: 400, completion_tokens: 12 } }), {
          status: 200,
        })
      ),
    },
  });
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;

  if (first) {
    const ada = running.directory.person$('ada@example.com', 'Ada');
    assert.ok(ada.ok);
    const made = await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: ada.value.id, email: 'ada@example.com', name: 'Ada' } });
    assert.ok(made.ok, JSON.stringify(made));
    assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
    assert.ok((await running.api.kernel.install([THINGS])).ok, 'the register was not installed');
    assert.ok(running.api.kernel.create('things', { name: 'Kiln' }, { actor: ada.value.id }).ok, 'the row was not written');
  }

  /** A session for `person` on this record, written where the directory keeps sessions and hashed with its key. */
  const plant = (person: string): string => {
    const sid = randomBytes(32).toString('base64url');
    const now = Date.now();
    const db = new DatabaseSync(join(dir, 'directory.sqlite'));
    try {
      db.prepare('INSERT INTO dir_session (id_hash, person, record, expires, rotated_at, authed_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(createHmac('sha256', sessionKey).update(`s:${sid}`).digest('hex'), person, REC, now + HOUR, now, now);
    } finally {
      db.close();
    }
    return sid;
  };

  /* A BROWSER: the cookie on every request, and `Origin` on a POST alone, which is what the Fetch standard sends to a
     page's own site. The status GET below carries none, so it is held to the GET rule and not the POST one. */
  const call = async (path: string, sid: string, body?: unknown) => {
    const res = await fetch(`http://localhost:${port}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { cookie: `bd_s=${sid}`, ...(body === undefined ? {} : { origin, 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await res.text();
    return { status: res.status, raw, body: (raw ? JSON.parse(raw) : null) as Body };
  };

  return {
    running,
    call,
    plant,
    calls: () => calls,
    owner: (): string => {
      const ada = running.directory.person$('ada@example.com', 'Ada');
      return ada.ok ? ada.value.id : assert.fail('Ada is not in the directory');
    },
    close: () => running.close(),
  };
}

test('AN OWNER SETS THE CAP TO 1 FROM A BROWSER: one ask answered, the second SLASH_BUDGET_SPENT, and a restart still reads 1', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-slash-routes-'));
  const sessionKey = new Uint8Array(randomBytes(32));
  try {
    const one = await boot(dir, sessionKey, true);
    try {
      const ada = one.plant(one.owner());

      const before = await one.call('/api/slash/status', ada);
      assert.equal(before.status, 200, before.raw);
      assert.equal((before.body?.value?.asks as { cap: number }).cap, 80, 'the premise: a fresh record starts on the default cap');

      const set = await one.call('/api/slash/settings', ada, { ask_cap: 1 });
      assert.equal(set.status, 200, set.raw);
      const after = await one.call('/api/slash/status', ada);
      assert.deepEqual(after.body?.value?.asks && { used: (after.body.value.asks as { used: number }).used, cap: (after.body.value.asks as { cap: number }).cap }, { used: 0, cap: 1 });

      const first = await one.call('/api/slash/read', ada, { question: 'Kiln' });
      assert.equal(first.status, 200, first.raw);
      assert.equal(one.calls(), 1, 'the first ask did not reach the model');

      const second = await one.call('/api/slash/read', ada, { question: 'Kiln again' });
      assert.equal(second.status, 422, `the ask past the cap was answered ${second.status}: ${second.raw}`);
      assert.equal(second.body?.refusal?.code, 'SLASH_BUDGET_SPENT');
      assert.equal(one.calls(), 1, 'the ask past the cap was spent on the model anyway');
    } finally {
      await one.close();
    }

    /* THE SAME FILE, A NEW PROCESS. The setting is a row in `slash.sqlite` beside the record (`b8a07ebd`), so a
       host that kept it in memory would read 80 here and answer the next ask 200. */
    const two = await boot(dir, sessionKey, false);
    try {
      const ada = two.plant(two.owner());
      const status = await two.call('/api/slash/status', ada);
      assert.equal(status.status, 200, status.raw);
      assert.deepEqual(status.body?.value?.asks && { used: (status.body.value.asks as { used: number }).used, cap: (status.body.value.asks as { cap: number }).cap }, { used: 1, cap: 1 });
      const again = await two.call('/api/slash/read', ada, { question: 'Kiln' });
      assert.equal(again.status, 422, again.raw);
      assert.equal(again.body?.refusal?.code, 'SLASH_BUDGET_SPENT');
      assert.equal(two.calls(), 0);
    } finally {
      await two.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("A READ COLLEAGUE'S SETTINGS POST IS 403 IN THE PACKAGE'S OWN SENTENCE, and the cap does not move", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-slash-routes-'));
  const sessionKey = new Uint8Array(randomBytes(32));
  const s = await boot(dir, sessionKey, true);
  try {
    const owner = s.owner();
    const bo = s.running.directory.person$('bo@example.com', 'Bo');
    assert.ok(bo.ok);
    const invited = await s.running.api.invite(
      { person: bo.value.id, email: 'bo@example.com', name: 'Bo', level: 'read' },
      { principal: { kind: 'person', id: owner, level: 'owner' } },
    );
    assert.ok(invited.ok, `Bo was not put on the record: ${JSON.stringify(invited)}`);
    assert.ok(s.running.directory.join(REC, bo.value.id).ok);
    const bos = s.plant(bo.value.id);

    /* THE PREMISE: Bo is a session this host answers, or a 403 below could be the cookie's and not the package's. */
    const seen = await s.call('/api/slash/status', bos);
    assert.equal(seen.status, 200, seen.raw);

    const refused = await s.call('/api/slash/settings', bos, { ask_cap: 1000 });
    assert.equal(refused.status, 403, `a read colleague configured Slash: ${refused.raw}`);
    assert.deepEqual(refused.body?.refusal && { code: refused.body.refusal.code, fix: refused.body.refusal.fix }, {
      code: 'FORBIDDEN',
      fix: 'Only the record owner changes how Slash is set up.',
    });

    const ada = s.plant(owner);
    const status = await s.call('/api/slash/status', ada);
    assert.equal((status.body?.value?.asks as { cap: number }).cap, 80, 'the refused patch was written anyway');
    assert.equal(s.calls(), 0);
  } finally {
    await s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
