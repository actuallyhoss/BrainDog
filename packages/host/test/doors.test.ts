/**
 * Every door a self-host has answers, or says in a sentence what this host lacks (LCH-C13 job 4): the software
 * stays self-hostable.
 *
 * EVERY ROUTE OF `ROUTES` IS ASKED ON THE SELF-HOST, started in this process as `apps/selfhost/test/front-doors.test.ts`
 * starts it, twice (with no server key as the owner on the machine, and with one and the owner's key), with the least a
 * call can carry: a read as a GET with nothing, a write as a POST of
 * `{}`. A refusal for what the call left out is an answer. `NOT_IN_THIS_BUILD` is an answer when its `fix` is one
 * sentence that ends in a full stop and says what this host has not got. A 404 or a 500 is red, and so is a
 * `NOT_IN_THIS_BUILD` that is not a sentence a person can act on.
 *
 * `HELD` IS WHAT FAILS TODAY, each with why, and each one written as a change for the file that owes it in this batch's
 * report. The test is red on a door that fails and is not held, and on a held door that has started to answer,
 * so the list cannot outlive the fault.
 *
 * WRITES THAT END THINGS GO LAST (`LAST`), so a minimal `deleteRecord` that the record takes does not leave the doors
 * after it asking a record that has gone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ROUTES, type Route } from '../src/index.ts';
import { start } from '../../../apps/selfhost/src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HDR';

/** The doors that fail on a self-host today, by route name, each with what is wrong. Kept as short as the truth. */
const HELD: Readonly<Record<string, string>> = {};

/** Writes that end the record or its keys, asked after every other door. */
const LAST = ['revokeToken', 'revokeOwnToken', 'erase', 'restore', 'import', 'deleteRecord'];

type Asked = { route: string; status: number; code: string | null; fix: string; text: string };

/** One sentence: ends in a full stop, holds no second sentence, and names something (four words or more). */
export function oneSentence(fix: string): string | null {
  const s = fix.trim();
  if (!s.endsWith('.')) return 'it does not end in a full stop';
  if (/[.!?]\s+[A-Z]/u.test(s.slice(0, -1))) return 'it is more than one sentence';
  if (s.split(/\s+/u).length < 4) return 'it is too short to say what this host lacks';
  if (/—/u.test(s)) return 'it holds an em dash';
  if (/\brec_[0-9A-Z]{6,}|\b[a-z]+#\d+\b|\/Users\/|https?:\/\//u.test(s)) return 'it shows an id, a path or an address';
  return null;
}

/** Why one answer is red, or null when the door answered. */
export function redOf(a: Asked): string | null {
  /* FIRST, because the registry answers it with 501: a door this build has not got is an answer, if it says so. */
  if (a.code === 'NOT_IN_THIS_BUILD') {
    const why = oneSentence(a.fix);
    return why ? `NOT_IN_THIS_BUILD, but ${why}: "${a.fix}"` : null;
  }
  if (a.status === 404) return `404 ${a.code ?? ''}: ${a.text}`;
  if (a.status >= 500) return `${a.status}: ${a.text}`;
  return null;
}

/** A body as JSON, or null: a body that is not JSON is kept as text, and read as red only if the status says so. */
const parsed = (text: string): { refusal?: { code?: string; fix?: string } } | null => {
  try {
    return JSON.parse(text) as { refusal?: { code?: string; fix?: string } } | null;
  } catch {
    return null;
  }
};

const ordered = (routes: readonly Route[]): Route[] => [
  ...routes.filter((r) => !LAST.includes(r.name)),
  ...LAST.map((name) => routes.find((r) => r.name === name)).filter((r): r is Route => r !== undefined),
];

/** Obviously not a real key: the self-host's own, for the run with a server key. */
const SERVER_KEY = 'fake-server-key-for-doors-tests';

/**
 * Every route asked once on a fresh self-host. `open` is the host with no server key, one person on one machine, where
 * every call is the owner's and reaches its door; `key` is the host with a server key, asked with the owner's bearer, as
 * an agent on another machine asks it.
 */
async function askEvery(mode: 'open' | 'key'): Promise<Asked[]> {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-doors-'));
  const running = await start({
    file: join(dir, 'record.sqlite'),
    port: 0,
    host: '127.0.0.1',
    ...(mode === 'key' ? { token: SERVER_KEY } : {}),
    pollMs: 0,
    limits: null,
  });
  const port = (running.server.address() as { port: number }).port;
  try {
    const made = running.api.kernel.createRecord({ id: REC, slug: 'doors-studio', name: 'Doors Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
    assert.ok(made.ok, JSON.stringify(made));
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (mode === 'key') {
      const minted = (await running.api.createToken({ scope: 'write', label: 'Studio laptop' }, { principal: { kind: 'person', id: 'p_1', level: 'owner' } })) as {
        value?: { bearer?: string };
      };
      assert.ok(minted.value?.bearer, JSON.stringify(minted));
      headers['authorization'] = `Bearer ${minted.value.bearer}`;
    }
    const asked: Asked[] = [];
    for (const route of ordered(ROUTES)) {
      const res = await fetch(`http://127.0.0.1:${port}/api/${route.name}`, {
        method: route.writes ? 'POST' : 'GET',
        headers,
        ...(route.writes ? { body: '{}' } : {}),
      });
      const text = await res.text();
      const body = parsed(text);
      asked.push({ route: route.name, status: res.status, code: body?.refusal?.code ?? null, fix: body?.refusal?.fix ?? '', text: text.slice(0, 200) });
    }
    assert.equal(asked.length, ROUTES.length, 'every route was asked once');
    return asked;
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('EVERY ROUTE ON A SELF-HOST ANSWERS, OR SAYS IN ONE SENTENCE WHAT THIS HOST LACKS, with no server key and with one', async () => {
  const runs = { open: await askEvery('open'), key: await askEvery('key') };
  const red: string[] = [];
  const stillRed = new Set<string>();
  for (const [mode, asked] of Object.entries(runs))
    for (const a of asked) {
      const why = redOf(a);
      if (why === null) continue;
      if (Object.hasOwn(HELD, a.route)) stillRed.add(a.route);
      else red.push(`${a.route} (${mode}): ${why}`);
    }
  assert.deepEqual(red, [], `doors that fail on a self-host and are not held:\n${red.join('\n')}`);
  const healed = Object.keys(HELD).filter((name) => !stillRed.has(name));
  assert.deepEqual(healed, [], `held doors that answer now (or are gone), so take them off HELD: ${healed.join(', ')}`);
  /* THE OPEN RUN REACHES THE DOORS THEMSELVES: most answer or name what the call left out, not who may ask. */
  const reached = runs.open.filter((a) => a.code !== 'NEEDS_BROWSER_SESSION' && a.code !== 'FORBIDDEN').length;
  assert.ok(reached >= ROUTES.length * 0.8, `only ${reached} of ${ROUTES.length} doors were reached as the owner`);
});

test('THE SENTENCE RULE: a fix that names the lack passes, and a stub, two sentences or an id do not', () => {
  assert.equal(oneSentence('This host holds no signing key for its record, so there is no key here to check a file against.'), null);
  assert.notEqual(oneSentence('Not in this build'), null);
  assert.notEqual(oneSentence('Not here.'), null);
  assert.notEqual(oneSentence('This host has no model. Set one up first.'), null);
  assert.notEqual(oneSentence('There is no model for rec_01JZ8QK3F7R2M9V4XN6TCB5HDR on this host.'), null);
  assert.equal(redOf({ route: 'x', status: 404, code: 'ROUTE_UNKNOWN', fix: '', text: '' }) !== null, true);
  assert.equal(redOf({ route: 'x', status: 500, code: 'INTERNAL', fix: '', text: '' }) !== null, true);
  assert.equal(redOf({ route: 'x', status: 422, code: 'REQUIRED_MISSING', fix: 'A list is named.', text: '' }), null);
  assert.equal(redOf({ route: 'x', status: 501, code: 'NOT_IN_THIS_BUILD', fix: 'This host has no model, so there is nothing to ask.', text: '' }), null);
  assert.notEqual(redOf({ route: 'x', status: 501, code: 'NOT_IN_THIS_BUILD', fix: 'Not in this build', text: '' }), null);
});
