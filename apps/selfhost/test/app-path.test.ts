/**
 * The record's methods under the app's address, on the self-host: `/app/<slug>/api/<method>` is `/api/<method>` when
 * the slug is this host's record, and a 403 for any other name.
 *
 * WHY THE SELF-HOST ANSWERS IT AT ALL. The web sends every record call under a slug to `${origin}/app/<slug>`
 * (`apps/web/src/lib/at.ts` `apiBase`), so a tab opened at `/app/the-studio/r/tasks` asked this host for
 * `/app/the-studio/api/boot`, and the host handed that path to the shell, which answered it with `index.html` and a 200.
 * The app then read a page as a record and drew nothing.
 *
 * ONE RECORD, SO ONE NAME. A self-host serves the record in its file, and any other slug is refused in the same sentence
 * the Directory uses for a name that is not the caller's, whether or not such a name exists anywhere. A caller with no
 * credential is refused as the root refuses it, so the answer does not say which name this host serves.
 *
 * `/auth/*`, `/account/*` AND `/in/*` STAY AT THE ROOT. They are the person's and a stranger's doors and never a
 * record's, so they are not answered under a slug.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const PAGE = '<!doctype html><title>BrainDog</title>';

type Body = { ok?: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } } | null;

/**
 * A self-host behind a server key, with a Directory holding its owner and the record `the-studio` they own, and with
 * `shell` a built app laid out as `apps/web` writes it, `build/app/index.html`.
 */
async function stack(o: { shell?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-app-path-'));
  const serverKey = randomBytes(32).toString('base64url');
  const shell = join(dir, 'build');
  if (o.shell) {
    mkdirSync(join(shell, 'app'), { recursive: true });
    writeFileSync(join(shell, 'app', 'index.html'), PAGE);
  }
  const running = await start({
    ...(o.shell ? { shell } : {}),
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: serverKey,
    sessionKey: new Uint8Array(randomBytes(32)),
    now: () => Date.UTC(2026, 8, 23, 12),
    pollMs: 0,
  });
  const port = (running.server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;
  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  assert.ok((await running.api.createRecord({ id: REC, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.com', name: 'Ada' } })).ok);
  assert.ok(running.directory.provision({ slug: 'the-studio', email: 'ada@example.com', record: REC }).ok);
  assert.ok((await running.api.kernel.install([TASKS])).ok);

  const call = async (path: string, init: { body?: unknown; sid?: string; bearer?: string; headers?: Record<string, string> } = {}) => {
    const method = init.body === undefined ? 'GET' : 'POST';
    const headers: Record<string, string> = {
      ...(method === 'POST' ? { 'content-type': 'application/json', origin } : {}),
      ...(init.sid === undefined ? {} : { cookie: `bd_s=${init.sid}` }),
      ...(init.bearer === undefined ? {} : { authorization: `Bearer ${init.bearer}` }),
      ...init.headers,
    };
    const res = await fetch(`http://localhost:${port}${path}`, { method, headers, redirect: 'manual', ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) });
    const raw = await res.text();
    let body: Body = null;
    try {
      body = raw ? (JSON.parse(raw) as Body) : null;
    } catch {
      /* A page and not JSON, which is the failure the first test is about. */
    }
    return { status: res.status, raw, body, headers: res.headers };
  };

  return {
    call,
    serverKey,
    running,
    /** A session from the server key, which proves a sign-in now. */
    async signIn(): Promise<string> {
      const out = await call('/auth/token', { body: { serverKey } });
      assert.equal(out.status, 200, out.raw);
      const sid = /^bd_s=([A-Za-z0-9_-]{43});/.exec(out.headers.getSetCookie()[0] ?? '')?.[1];
      return sid ?? assert.fail('no session cookie');
    },
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const NOT_ON = { code: 'FORBIDDEN', fix: 'You are not on this record.' };

test('UNDER ITS OWN SLUG, A SESSION AND A BEARER ARE ANSWERED AS AT /api, reads and writes, the query kept', async () => {
  /* WITH A SHELL, because that is what answered the path before: `index.html` and a 200, which the app read as a record. */
  const s = await stack({ shell: true });
  try {
    const sid = await s.signIn();
    const root = await s.call('/api/boot', { sid });
    assert.equal(root.status, 200, root.raw);
    const under = await s.call('/app/the-studio/api/boot', { sid });
    assert.equal(under.status, 200, under.raw);
    assert.notEqual(under.raw, PAGE, 'the shell answered a record method with the page');
    assert.match(under.headers.get('content-type') ?? '', /json/u);
    assert.deepEqual(under.body, root.body);

    const made = await s.call('/app/the-studio/api/create', { sid, body: { register: 'tasks', fields: { what: 'Ship it' } } });
    assert.equal(made.status, 200, made.raw);
    const seq = (made.body?.value as { seq: number }).seq;
    /* THE QUERY IS THE METHOD'S ARGUMENTS ON A GET, so it has to come through the move. */
    const got = await s.call(`/app/the-studio/api/get?register=tasks&seq=${seq}`, { bearer: s.serverKey });
    assert.equal(got.status, 200, got.raw);
    assert.equal((got.body?.value as { fields: { what: string } }).fields.what, 'Ship it');
    /* A DOUBLED SLASH IS THE SAME METHOD, and never a URL whose host is `api`. */
    const doubled = await s.call('/app/the-studio//api/boot', { sid });
    assert.equal(doubled.status, 200, doubled.raw);
    assert.deepEqual((doubled.body?.value as { record: unknown }).record, (root.body?.value as { record: unknown }).record);
    /* AND THE APP'S OWN PAGES UNDER THE SLUG ARE STILL THE SHELL'S. */
    assert.equal((await s.call('/app/the-studio/r/tasks', { sid })).raw, PAGE);
  } finally {
    await s.close();
  }
});

test('ANY OTHER SLUG IS 403 IN THE DIRECTORY’S SENTENCE, for a session and a bearer alike, and nothing is written', async () => {
  const s = await stack();
  try {
    const sid = await s.signIn();
    for (const who of [{ sid }, { bearer: s.serverKey }]) {
      for (const path of ['/app/someone-else/api/boot', '/app/the-studios/api/boot', '/app/studio/api/list?register=tasks']) {
        const out = await s.call(path, who);
        assert.equal(out.status, 403, `${path} ${out.raw}`);
        assert.deepEqual(out.body, { ok: false, refusal: NOT_ON }, path);
      }
      const write = await s.call('/app/someone-else/api/create', { ...who, body: { register: 'tasks', fields: { what: 'Not here' } } });
      assert.equal(write.status, 403, write.raw);
    }
    const listed = await s.call('/api/list?register=tasks', { bearer: s.serverKey });
    assert.equal(listed.status, 200, listed.raw);
    assert.deepEqual((listed.body?.value as { rows: unknown[] }).rows, [], 'a write under another slug reached the record');
  } finally {
    await s.close();
  }
});

test('WITH NO CREDENTIAL, EVERY SLUG IS REFUSED AS THE ROOT REFUSES IT, so the answer names no record', async () => {
  const s = await stack();
  try {
    const bare = await s.call('/api/boot');
    assert.equal(bare.status, 401, bare.raw);
    for (const path of ['/app/the-studio/api/boot', '/app/someone-else/api/boot']) {
      const out = await s.call(path);
      assert.equal(out.status, bare.status, path);
      assert.deepEqual(out.body, bare.body, path);
    }
  } finally {
    await s.close();
  }
});

test('THE KEY DOORS ARE AT THE ROOT ONLY, and /auth, /account and /in are never answered under a slug', async () => {
  const s = await stack();
  try {
    /* A grant names its own record, so a slug in front of the keychain would be a second answer to which record. The
       Worker refuses the same path in the same words (`apps/worker/src/index.ts` `recordApi`). */
    for (const path of ['/app/the-studio/api/vault/open', '/app/the-studio/api/vault/deposit']) {
      const out = await s.call(path, { body: {}, bearer: s.serverKey });
      assert.equal(out.status, 404, `${path} ${out.raw}`);
      assert.equal(out.body?.refusal?.code, 'ROUTE_UNKNOWN', path);
    }
    /* No shell is configured here, so a path that is not a door is this host's 404, and no session is minted. */
    const token = await s.call('/app/the-studio/auth/token', { body: { serverKey: s.serverKey } });
    assert.equal(token.status, 404, token.raw);
    assert.deepEqual(token.headers.getSetCookie(), []);
    assert.equal((await s.call('/app/the-studio/auth/methods')).status, 404);
    assert.equal((await s.call('/app/the-studio/account/usage?from=2026-09-01&to=2026-09-30', { sid: await s.signIn() })).status, 404);
    assert.equal((await s.call('/app/the-studio/in/webhook/x', { body: {} })).status, 404);
    /* AND `/app/api/*` NAMES NO RECORD: it is not a second copy of the root. */
    assert.equal((await s.call('/app/api/boot', { bearer: s.serverKey })).status, 404);
    /* THE ROOT DOORS ARE WHERE THEY WERE. */
    assert.equal((await s.call('/auth/methods')).status, 200);
  } finally {
    await s.close();
  }
});

/* ── the shell `braindog serve` finds on its own ───────────────────────── */

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const BUILT = fileURLToPath(new URL('../../web/build/app', import.meta.url));

test('`braindog serve` WITH NO BRAINDOG_SHELL FINDS THE WEB BUILD AT build/app, AND ITS BUNDLED CATALOGUE', { skip: existsSync(join(BUILT, 'index.html')) ? false : 'apps/web is not built, so there is no build/app/index.html for serve to find' }, async () => {
  /* THE WEB BUILD NOW WRITES EVERYTHING UNDER `build/app` (`apps/web/svelte.config.js`), and `main.ts` looked for
     `build/index.html`, which is no longer written. So a self-host started the documented way served no app and no
     catalogue, and said nothing about either: `/app/` was the record's `ROUTE_UNKNOWN`. This is the real entry in a
     real process, against the real build, because the property is which directory that entry finds. */
  const data = mkdtempSync(join(tmpdir(), 'braindog-serve-shell-'));
  /* Whatever this shell has set for the two is taken out, so the entry has to find both on its own. */
  const { BRAINDOG_SHELL: _shell, BRAINDOG_CATALOGUE: _catalogue, ...inherited } = process.env;
  const env = { ...inherited, BRAINDOG_DATA: data, BRAINDOG_OWNER: '', PORT: '0' };
  const made = spawnSync(process.execPath, [MAIN, 'init', 'the-studio', '--owner', 'ada@example.com'], { encoding: 'utf8', env });
  assert.equal(made.status, 0, made.stderr);
  const served = spawn(process.execPath, [MAIN, 'serve'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const origin = await new Promise<string>((resolve, reject) => {
      let said = '';
      const timer = setTimeout(() => reject(new Error(`serve did not say where it listens: ${said}`)), 15_000);
      served.stderr.setEncoding('utf8');
      served.stderr.on('data', (chunk: string) => {
        said += chunk;
        const at = /^braindog · .* · (https?:\/\/\S+)$/m.exec(said)?.[1];
        if (at) {
          clearTimeout(timer);
          resolve(at);
        }
      });
      served.once('exit', (code) => reject(new Error(`serve exited ${code}: ${said}`)));
    });
    const page = await fetch(`${origin}/app/`);
    assert.equal(page.status, 200);
    assert.equal(await page.text(), readFileSync(join(BUILT, 'index.html'), 'utf8'));
    if (existsSync(join(BUILT, 'catalogue', 'index.json'))) {
      const index = await fetch(`${origin}/app/catalogue/index.json`);
      assert.equal(index.status, 200);
      assert.match(index.headers.get('content-type') ?? '', /json/u);
      assert.deepEqual(await index.json(), JSON.parse(readFileSync(join(BUILT, 'catalogue', 'index.json'), 'utf8')));
    }
  } finally {
    served.kill();
    await new Promise((resolve) => (served.exitCode === null ? served.once('exit', resolve) : resolve(null)));
    rmSync(data, { recursive: true, force: true });
  }
});
