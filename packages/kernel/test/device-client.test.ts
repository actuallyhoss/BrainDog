/**
 * A machine's sign-in is stamped, and can be renamed.
 *
 * What is asserted: a login exchange mints a token whose app is BrainDog's own command on the machine its label names,
 * stamped by the kernel; the owner renames the machine and the grant and its live token say the new name together; and
 * a name that is empty, too long or more than one line, or a grant that has finished, is refused.
 *
 * THE MACHINE NAMES ARE INVENTED, plain words a person might give a computer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { deviceApprove, deviceList, devicePoll, deviceRevoke, deviceStart, renameDevice, type Exchanged } from '../src/device.ts';
import { applyMigrations } from '../src/migrate.ts';
import { verifyToken, type TokenDeps } from '../src/token.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const OWNER = 'p_owner';
const RECORD = 'rec_fake';

const sha256 = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

async function setup() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  await applyMigrations(sql, clock);
  let n = 0;
  const deps = (): TokenDeps => ({
    sql,
    nowMs: clock.now(),
    mint: () => `m_${String(++n).padStart(6, '0')}`,
    recordId: () => RECORD,
    digest: sha256,
    random: (size: number) => crypto.getRandomValues(new Uint8Array(size)),
  });
  return { sql, clock, deps };
}

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};
const refusalOf = (r: Result<unknown>) => {
  assert.equal(r.ok, false, 'the call went through');
  return !r.ok && 'refusal' in r ? r.refusal : { code: 'conflict', fix: '', at: undefined };
};

/** One machine through the whole walk: asked for, approved, exchanged. Answers its bearer and its handle. */
async function signIn(s: Awaited<ReturnType<typeof setup>>, label?: string) {
  const started = value(await deviceStart(s.deps(), { reach: 'login', label: label ?? 'placeholder' }));
  if (label === undefined) s.sql.exec('UPDATE device_grant SET label = NULL');
  const approved = value(await deviceApprove(s.deps(), OWNER, { user_code: started.user_code }));
  s.clock.advance(5_000);
  const out = value(await devicePoll(s.deps(), { device_code: started.device_code })) as Exchanged;
  return { bearer: out.bearer, handle: approved.handle };
}

/** The token's app columns, as a plain object: the driver's rows have no prototype. */
const tokenOf = (s: Awaited<ReturnType<typeof setup>>) => ({
  ...s.sql.one<{ label: string | null; client_id: string | null; client_kind: string | null; host: string | null }>(
    'SELECT label, client_id, client_kind, host FROM token',
  ),
});

test('AN EXCHANGED LOGIN IS STAMPED: BrainDog, device, and the machine its label names', async () => {
  const s = await setup();
  const { bearer } = await signIn(s, 'Studio · braindog-cli');
  assert.deepEqual(tokenOf(s), { label: 'Studio · braindog-cli', client_id: 'braindog', client_kind: 'device', host: 'Studio' });
  assert.deepEqual(value(await verifyToken(s.deps(), bearer)).client, { id: 'braindog', kind: 'device', host: 'Studio' });
  s.sql.close();
});

test('A GRANT WITH NO LABEL IS STAMPED WITH NO HOST', async () => {
  const s = await setup();
  await signIn(s);
  assert.deepEqual(tokenOf(s), { label: null, client_id: 'braindog', client_kind: 'device', host: null });
  s.sql.close();
});

test('RENAMED TO Desk: the grant, the token and its stamped host change together, and the command stays in the label', async () => {
  const s = await setup();
  const { bearer, handle } = await signIn(s, 'Studio · braindog-cli');
  const row = value(await renameDevice(s.deps(), handle, '  Desk  '));
  assert.equal(row.handle, handle);
  assert.equal(row.label, 'Desk · braindog-cli');
  assert.equal(row.status, 'active');
  assert.deepEqual(await deviceList(s.deps()), [row], 'the answer is the grant as the list shows it');
  assert.deepEqual(tokenOf(s), { label: 'Desk · braindog-cli', client_id: 'braindog', client_kind: 'device', host: 'Desk' });
  assert.equal(value(await verifyToken(s.deps(), bearer)).client?.host, 'Desk');
  s.sql.close();
});

test('A NAME THAT IS EMPTY, 61 CHARACTERS, OR TWO LINES IS REFUSED, naming the label, and nothing changes', async () => {
  const s = await setup();
  const { handle } = await signIn(s, 'Studio · braindog-cli');
  const empty = refusalOf(await renameDevice(s.deps(), handle, '   '));
  assert.equal(empty.code, 'REQUIRED_MISSING');
  assert.equal(empty.at, 'label');
  const long = refusalOf(await renameDevice(s.deps(), handle, 'x'.repeat(61)));
  assert.equal(long.code, 'OUT_OF_BOUNDS');
  assert.equal(long.at, 'label');
  assert.match(long.fix, /60/);
  const lines = refusalOf(await renameDevice(s.deps(), handle, 'Desk\nupstairs'));
  assert.equal(lines.code, 'VALUE_MALFORMED');
  assert.equal(lines.at, 'label');
  assert.ok(value(await renameDevice(s.deps(), handle, 'x'.repeat(60))).label?.startsWith('x'.repeat(60)), 'sixty is allowed');
  assert.equal(refusalOf(await renameDevice(s.deps(), 'not-a-handle', 'Desk')).at, 'handle');
  s.sql.close();
});

test('A REVOKED GRANT KEEPS ITS NAME: renaming it is refused, and its token is untouched', async () => {
  const s = await setup();
  const { handle } = await signIn(s, 'Studio · braindog-cli');
  value(await deviceRevoke(s.deps(), OWNER, handle));
  const refused = refusalOf(await renameDevice(s.deps(), handle, 'Desk'));
  assert.equal(refused.code, 'FORBIDDEN');
  assert.equal(refused.at, 'handle');
  assert.equal(tokenOf(s)?.host, 'Studio');
  assert.equal((await deviceList(s.deps()))[0]?.label, 'Studio · braindog-cli');
  s.sql.close();
});
