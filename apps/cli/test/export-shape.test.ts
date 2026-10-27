/**
 * `braindog export --shape` against an in-memory door: a standing shape grant kept beside the login, one
 * request to `POST /api/shape` with no page's `Origin`, and a file that says it is a shape and holds no word of the record.
 *
 * THE FILE IS A REAL SHAPE COPY, the kernel's `shapeBrainl` over a real export of a record whose name and slug are
 * words nobody else uses, so "no value in it" is a search and not a hope.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openRecord, shapeBrainl } from '@braindog/kernel';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import * as signIn from '../src/login.ts';
import { exportFile, type BrainfileIo } from '../src/brainfile.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const NOW = Date.UTC(2026, 9, 9, 12);
/** As `hostKey` spells the address the app prints, `app.example.test/app/marrowgate`, which is the hosts file's key. */
const HOST = 'https://app.example.test/marrowgate';
/** Obviously fake, and long enough that any fragment of it in what the command printed is findable. */
const SHAPE = `${REC}.stub-shape-bearer-never-printed-9c2e`;
const NEW = `${REC}.stub-new-shape-bearer-never-printed-41aa`;
const WORDS = ['marrowgate', 'Quillfeather Studio'];

/** A record called "Quillfeather Studio", exported and taken through the scrambler, and the export it came from. */
async function copies(): Promise<{ real: string[]; shaped: string[] }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  sql.exec(
    'INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, ?, ?, ?, ?, ?, 1, ?)',
    REC,
    'marrowgate',
    'Quillfeather Studio',
    'en',
    'UTC',
    '2026-10-09T12:00:00.000Z',
  );
  const out = (await k.export()) as { ok: boolean; value?: string[] };
  assert.ok(out.ok, JSON.stringify(out));
  sql.close();
  return { real: out.value!, shaped: await shapeBrainl(out.value!, { now: NOW }) };
}

type Seen = { path: string; auth: string | null; origin: string | null; reach?: string };

/** The door: the device routes, and `/api/shape` taking only the grants it knows. */
function door(lines: string[], known: string[]) {
  const seen: Seen[] = [];
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    seen.push({ path: url.pathname, auth: headers.get('authorization'), origin: headers.get('origin'), ...(typeof body.reach === 'string' ? { reach: body.reach } : {}) });
    if (url.pathname === '/auth/device')
      return answer(200, { ok: true, value: { device_code: 'stub-poll-id-never-printed', user_code: '123456', verification_uri: `${url.origin}/settings/agents`, expires_in: 600, interval: 0 } });
    if (url.pathname === '/auth/device/token') {
      known.push(NEW);
      return answer(200, { ok: true, value: { pending: false, bearer: NEW, reach: 'shape', scope: null, expires: '2027-01-07T12:00:00.000Z' } });
    }
    if (url.pathname !== '/api/shape') return answer(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No.' } });
    const bearer = headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
    if (!known.includes(bearer)) return answer(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'That shape grant is not one this record knows.', at: 'shape' } });
    return answer(200, { ok: true, value: lines });
  }) as typeof globalThis.fetch;
  return { seen, fetch };
}

/** A folder, a hosts file holding a login and, when given, a shape grant, and everything the command printed. */
function rig(t: { after: (f: () => void) => void }, fetch: typeof globalThis.fetch, shape?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-shape-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'hosts.json');
  const entry = { token: { value: `${REC}.stub-login-never-sent`, expires: '2027-01-01T00:00:00.000Z', label: 'test' } };
  writeFileSync(
    file,
    JSON.stringify({ default: HOST, hosts: { [HOST]: shape === undefined ? entry : { ...entry, shape: { value: shape, expires: '2027-01-01T00:00:00.000Z', label: 'test · shape' } } } }),
    { mode: 0o600 },
  );
  const out: string[] = [];
  const said: string[] = [];
  const io: BrainfileIo = { env: {}, cwd: dir, file, out: (l) => void out.push(l), say: (l) => void said.push(l), fetch, now: () => NOW, label: 'test machine' };
  const hidden = () => {
    for (const secret of [SHAPE, NEW, 'stub-login-never-sent', 'stub-poll-id-never-printed'])
      assert.ok(!`${out.join('\n')}\n${said.join('\n')}`.includes(secret.split('.').at(-1)!), 'a secret was printed');
  };
  const held = () => (JSON.parse(readFileSync(file, 'utf8')) as { hosts: Record<string, { shape?: { value: string }; token?: unknown }> }).hosts[HOST];
  return { dir, io, out, said, hidden, held };
}

test('A KEPT SHAPE GRANT TAKES THE COPY WITH NO PROMPT: one request, no page, a 0600 file that is a shape and holds no word', async (t) => {
  const { real, shaped } = await copies();
  for (const w of WORDS) assert.ok(real.join('\n').includes(w), `the real export does not hold ${w}, so the check below proves nothing`);
  const d = door(shaped, [SHAPE]);
  const r = rig(t, d.fetch, SHAPE);

  assert.equal(await exportFile(['--shape'], r.io), 0, r.said.join('\n'));
  assert.deepEqual(d.seen.map((s) => s.path), ['/api/shape'], 'the command asked for more than the copy');
  assert.equal(d.seen[0]!.auth, `Bearer ${SHAPE}`);
  assert.equal(d.seen[0]!.origin, null, 'the command sent an Origin, which the door refuses');

  const path = join(r.dir, 'marrowgate.shape.brainl');
  assert.ok(existsSync(path), `no ${path}`);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const text = readFileSync(path, 'utf8');
  for (const w of WORDS) assert.ok(!text.includes(w), `the shape file holds ${w}`);
  assert.deepEqual(r.out, [`wrote marrowgate.shape.brainl: ${shaped.length} lines, every value scrambled`]);
  r.hidden();
});

test('A HOST THAT ANSWERS REAL VALUES GETS NOTHING WRITTEN', async (t) => {
  const { real } = await copies();
  const r = rig(t, door(real, [SHAPE]).fetch, SHAPE);
  assert.equal(await exportFile(['--shape', '-o', 'copy.shape.brainl'], r.io), 1);
  assert.equal(existsSync(join(r.dir, 'copy.shape.brainl')), false, 'a file of real values was kept under a shape name');
  assert.match(r.said.join('\n'), /does not say it is a shape copy/);
});

test('A GRANT THE RECORD NO LONGER KNOWS IS DROPPED AND ASKED FOR AGAIN, ONCE, and the new one is kept beside the login', async (t) => {
  const { shaped } = await copies();
  const d = door(shaped, []);
  const r = rig(t, d.fetch, SHAPE);
  const code = await exportFile(['--shape'], r.io);
  assert.equal(r.held()?.token !== undefined, true, 'the login was lost');

  if ((signIn as { approveShape?: unknown }).approveShape === undefined) {
    /* THE DEVICE FLOW FOR REACH `shape` IS `login.ts`'s, and until it is there the command says so and takes nothing. */
    assert.equal(code, 1);
    assert.equal(r.held()?.shape, undefined, 'a refused grant was kept');
    assert.match(r.said.join('\n'), /cannot ask for a shape grant yet/);
    return;
  }
  assert.equal(code, 0, r.said.join('\n'));
  assert.deepEqual(
    d.seen.map((s) => s.path),
    ['/api/shape', '/auth/device', '/auth/device/token', '/api/shape'],
  );
  assert.equal(d.seen[1]!.reach, 'shape');
  assert.equal(r.held()?.shape?.value, NEW);
  r.hidden();

  /* AND THE NEXT COPY ASKS NOBODY. */
  d.seen.length = 0;
  assert.equal(await exportFile(['--shape'], r.io), 0);
  assert.deepEqual(d.seen.map((s) => s.path), ['/api/shape']);
});

test('ANY OTHER FLAG BESIDE --shape IS REFUSED WITH THE USAGE, and nothing is sent', async (t) => {
  const d = door([], [SHAPE]);
  const r = rig(t, d.fetch, SHAPE);
  assert.equal(await exportFile(['--shape', '--redact-grants'], r.io), 1);
  assert.deepEqual(d.seen, []);
  assert.match(r.said.join('\n'), /braindog export --shape takes -o/);
});
