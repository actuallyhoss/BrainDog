/**
 * The plan's count of agents: where a key is minted, a record at its plan's count mints no more.
 *
 * The count is one row a host writes, `host_meta` under `plan.agents` (`apps/worker/src/slash.ts`, from `PLAN_TABLE`).
 * Written here the way the Worker writes it, so the kernel's reader and the host's writer meet on the same bytes.
 * Absent, as on every self-host, nothing is refused.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { deviceApprove, devicePoll, deviceStart } from '../src/device.ts';
import { applyMigrations } from '../src/migrate.ts';
import { AGENTS_KEY, agentCap, agentsFull, createToken, liveAgents, revokeToken, verifyToken, type TokenDeps } from '../src/token.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 86_400_000;
const OWNER = 'p_owner';
const RECORD = 'rec_fake';
const FREE_FULL = 'Free connects 3 AI tools at once, and they are all connected. Disconnect one in Settings > Agents to connect this one, or move to Cloud in Settings > Billing for more.';

const sha256 = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

async function setup() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  await applyMigrations(sql, clock);
  sql.exec("INSERT INTO person (id, email, name) VALUES (?, 'ada@example.com', 'Ada')", OWNER);
  let n = 0;
  const deps = (): TokenDeps => ({
    sql,
    nowMs: clock.now(),
    mint: () => `m_${String(++n).padStart(6, '0')}`,
    recordId: () => RECORD,
    digest: sha256,
    random: (size: number) => crypto.getRandomValues(new Uint8Array(size)),
  });
  /** What the Worker's `planMoved` writes for a plan. */
  const plan = (agents: number, name: string, next: string | null) => {
    sql.exec('CREATE TABLE IF NOT EXISTS host_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    sql.exec(
      'INSERT INTO host_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      AGENTS_KEY,
      JSON.stringify({ agents, plan: name, next }),
    );
  };
  const mint = (label: string) => createToken(deps(), OWNER, { scope: 'write', label });
  return { sql, clock, deps, plan, mint };
}

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};

test('ON FREE THE FOURTH KEY IS REFUSED in his sentence, nothing is written, and a revoke makes room', async () => {
  const { sql, deps, plan, mint } = await setup();
  plan(3, 'Free', 'Cloud');
  const keys = [value(await mint('claude code')), value(await mint('codex')), value(await mint('cursor'))];

  const fourth = await mint('gemini');
  assert.equal(fourth.ok, false, 'a fourth agent was connected on Free');
  assert.equal(fixOf(fourth), FREE_FULL);
  assert.equal(!fourth.ok && 'refusal' in fourth ? fourth.refusal.at : null, 'plan');
  assert.equal(sql.all('SELECT id FROM token').length, 3, 'a refused mint left a row');

  revokeToken(deps(), OWNER, keys[0]!.id);
  value(await mint('gemini'));
});

test('WITH NO CAP WRITTEN NOTHING IS REFUSED, and a cap that cannot be read is none', async () => {
  const { sql, deps, mint } = await setup();
  assert.equal(agentCap(sql), null);
  for (let i = 0; i < 20; i++) value(await mint(`agent ${i}`));
  sql.exec('CREATE TABLE host_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  sql.exec('INSERT INTO host_meta (key, value) VALUES (?, ?)', AGENTS_KEY, 'three');
  assert.equal(agentCap(sql), null);
  value(await mint('one more'));
  assert.equal(liveAgents(deps()), 21);
});

test('A SHARE LINK, A RUN AND A REPORT KEY ARE NOT AGENTS: none counted, and none refused at the count', async () => {
  const { sql, deps, plan, mint } = await setup();
  plan(3, 'Free', 'Cloud');
  /* A share link is two events and no key (`packages/record/src/methods/shares.ts`): opened here as the record opens one. */
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v) VALUES ('e_share', ?, ?, 'share.open', 'share:s1', 'share', 'home', ?)",
    new Date(NOW).toISOString(),
    OWNER,
    new Date(NOW + 30 * DAY).toISOString(),
  );
  for (const name of ['claude code', 'codex', 'cursor']) value(await mint(name));
  assert.equal(liveAgents(deps()), 3, 'a share link was counted');

  /* A machine claims a job and its run's bearer is minted (`claimJob`), at the count. */
  sql.exec(
    "INSERT INTO job (id, kind, args, status, runner_id, created_at, expires) VALUES ('j1', 'claude', '{}', 'claimed', 'r1', ?, ?)",
    new Date(NOW).toISOString(),
    new Date(NOW + DAY).toISOString(),
  );
  value(await createToken(deps(), OWNER, { scope: 'propose', label: 'job:j1', days: 1 }));
  /* A second bearer for the same run is a person's key wearing its label, and is counted and refused like any. */
  assert.equal(fixOf(await createToken(deps(), OWNER, { scope: 'propose', label: 'job:j1', days: 1 })), FREE_FULL);
  /* And a label for a job nobody claimed is not a run's. */
  assert.equal(fixOf(await mint('job:nobody')), FREE_FULL);

  value(await createToken(deps(), OWNER, { scope: 'write', label: 'report:{"register":"bank_texts"}' }));
  assert.equal(liveAgents(deps()), 3, 'a run or a report key was counted as an agent');
});

test('A RECORD MOVED DOWN KEEPS ITS KEYS AND MINTS NONE until it holds fewer than its count', async () => {
  const { clock, deps, plan, mint } = await setup();
  plan(15, 'Cloud', 'Cloud Plus');
  const bearers = [];
  for (let i = 0; i < 5; i++) bearers.push(value(await mint(`agent ${i}`)));
  plan(3, 'Free', 'Cloud');

  for (const b of bearers) value(await verifyToken(deps(), b.bearer));
  assert.equal(fixOf(await mint('a sixth')), FREE_FULL);
  for (const b of bearers.slice(0, 2)) revokeToken(deps(), OWNER, b.id);
  assert.equal(fixOf(await mint('still over')), FREE_FULL, 'three live keys of three let a fourth in');
  revokeToken(deps(), OWNER, bearers[2]!.id);
  value(await mint('room again'));

  /* A key past its life is not live, and so not counted. */
  clock.advance(91 * DAY);
  assert.equal(liveAgents(deps()), 0);
});

test('THE CLI LOGIN IS AN AGENT: at the count the exchange is refused in the sentence and the approval waits', async () => {
  const { sql, deps, plan, mint } = await setup();
  plan(3, 'Free', 'Cloud');
  for (const name of ['claude code', 'codex', 'cursor']) value(await mint(name));
  const started = value(await deviceStart(deps(), { reach: 'login', label: 'studio mac' }));
  value(await deviceApprove(deps(), OWNER, { user_code: started.user_code }));
  assert.equal(fixOf(await devicePoll(deps(), { device_code: started.device_code })), FREE_FULL);
  assert.equal(sql.one<{ status: string }>('SELECT status FROM device_grant')!.status, 'approved');
  /* A device named like a key the record makes itself is turned away before it can be approved past the count. */
  for (const label of ['report:{"register":"bank_texts"}', 'job:j1'])
    assert.equal((await deviceStart(deps(), { reach: 'login', label })).ok, false, `a device named ${label} was let start`);
});

test('EACH PLAN NAMES ITSELF AND THE WAY ON, and the top one names a revoke', () => {
  assert.equal(agentsFull({ agents: 3, plan: 'Free', next: 'Cloud' }), FREE_FULL);
  assert.equal(agentsFull({ agents: 15, plan: 'Cloud', next: 'Cloud Plus' }), 'Cloud connects 15 AI tools at once, and they are all connected. Disconnect one in Settings > Agents to connect this one, or move to Cloud Plus in Settings > Billing for more.');
  assert.equal(agentsFull({ agents: 75, plan: 'Cloud Plus', next: null }), 'Cloud Plus connects 75 AI tools at once, and they are all connected. Disconnect one in Settings > Agents to connect this one.');
});
