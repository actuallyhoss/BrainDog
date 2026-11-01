/**
 * A push when an instruction he gave reaches Done or Needs you (agents and MCP plan §2.3, §5.1 "On finish"; W3-D).
 *
 * WHAT IS HELD: the agent's settings row decides (off, told, long; push or the Needs you list only); the record's quiet
 * hours, or the row's own, hold it; it is content-free (a phone id and a handle, none of the words said); and it rings at
 * most once per instruction state. A record nobody subscribed a phone on queues nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_PROFILE, type Instr, type Profile } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { finishCause, tellFinished } from '../src/push.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';

const MIN = 60_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' } };
const agent = (client: string): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'portage', agent: 'claude', client_id: client },
});

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_seed', 'teo@vance-studio.example', 'Teodor')");
  sql.exec("INSERT INTO push_sub (id, person_id, endpoint, p256dh, auth, created_at) VALUES ('ps_1', 'p_seed', 'https://fcm.googleapis.com/fcm/send/seed', 'k', 'a', ?)", new Date(NOW).toISOString());
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level) VALUES ('p_seed', '*', 'owner')");
  clock.advance(MIN);
  const pushes = () =>
    sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'notify.push' ORDER BY rowid").map((r) => JSON.parse(r.payload) as Record<string, unknown>);
  return { api, sql, clock, pushes };
}

/** Tells run `ctx` something, takes it, and answers it in `state`. */
async function finish(r: Awaited<ReturnType<typeof record>>, ctx: CallContext, state: 'done' | 'needs_you'): Promise<void> {
  const run = value<{ spoken: string }>(await r.api.attach({ source: 'startup', doing: 'Working' }, ctx)).spoken;
  const told = value<{ id: string }>(await r.api.instruct({ said: 'Merge wave 1, then stop', to_run: run }, owner));
  value(await r.api.instructionsMine({ take: told.id }, ctx));
  value(await r.api.instructionsMine({ reply: told.id, said: 'Merged W1-A..E, three commits', state }, ctx));
}

test('DONE RINGS ONCE, content-free: a phone id and a handle, none of the words anybody said', async () => {
  const r = await record();
  await finish(r, agent('c-one'), 'done');
  const out = r.pushes();
  assert.equal(out.length, 1);
  /* AND WHERE A TAP OPENS, a path and never a word: Done is read on Agents. */
  assert.deepEqual(Object.keys(out[0]!).sort(), ['cause', 'kind', 'open', 'sub']);
  assert.equal(out[0]!.open, '/p/agents');
  assert.deepEqual(out[0]!.sub, { id: 'ps_1' });
  assert.match(String(out[0]!.cause), /^instruction\.[^.]+\.done$/u);
  const all = JSON.stringify(r.sql.all("SELECT payload FROM outbox WHERE kind = 'notify.push'"));
  assert.doesNotMatch(all, /Merge wave|Merged W1|commits/u, 'the words of the instruction or its reply reached the outbox');
  r.sql.close();
});

test('NEEDS YOU RINGS TOO', async () => {
  const r = await record();
  await finish(r, agent('c-two'), 'needs_you');
  assert.match(String(r.pushes()[0]?.cause), /\.needs_you$/u);
  r.sql.close();
});

test('ON FINISH OFF RINGS NOTHING, and so does Needs you only: the row says so', async () => {
  const r = await record();
  value(await r.api.setAgentProfile({ name: 'Claude Code', match: { kind: 'claude' }, notify: { on: 'off', by: 'push' } }, owner));
  await finish(r, agent('c-off'), 'done');
  assert.equal(r.pushes().length, 0, 'a push rang with On finish off');
  r.sql.close();

  const s = await record();
  value(await s.api.setAgentProfile({ name: 'Claude Code', match: { kind: 'claude' }, notify: { on: 'told', by: 'needs_you' } }, owner));
  await finish(s, agent('c-list'), 'done');
  assert.equal(s.pushes().length, 0, 'a push rang for a row that says the Needs you list only');
  s.sql.close();
});

test('QUIET HOURS HOLD IT, and nothing is queued to go later', async () => {
  const r = await record();
  const tz = r.api.kernel.identity()?.tz ?? 'UTC';
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(NOW + MIN))) % 24;
  const pad = (h: number): string => `${String((h + 24) % 24).padStart(2, '0')}:00`;
  /* THE ROW'S OWN HOURS, around now. */
  const mine = value<{ id: string }>(await r.api.setAgentProfile({ name: 'Claude Code', match: { kind: 'claude' }, quiet: { from: pad(hour - 1), to: pad(hour + 2) } }, owner));
  await finish(r, agent('c-quiet'), 'done');
  assert.equal(r.pushes().length, 0, 'a push sounded inside the row\'s quiet hours');
  /* AND OUTSIDE THEM IT RINGS: the same row with its window moved away from now. */
  value(await r.api.setAgentProfile({ id: mine.id, quiet: { from: pad(hour + 3), to: pad(hour + 5) } }, owner));
  await finish(r, agent('c-quiet-after'), 'done');
  assert.equal(r.pushes().length, 1);
  r.sql.close();
});

/** A stand-in for the two reads `tellFinished` makes: the outbox's told count and the owners' phones. */
function fake(subs: string[]) {
  const queued: { cause: string }[] = [];
  const sql = {
    one: (q: string, ...a: unknown[]) => (q.includes('FROM outbox') ? { n: queued.filter((p) => p.cause === a[0]).length } : null),
    all: () => subs.map((id) => ({ id })),
  };
  const deps = { sql: sql as never, outbox: (_k: 'notify.push', p: unknown) => void queued.push(p as { cause: string }), nowMs: Date.UTC(2026, 9, 21, 12), tz: 'UTC' };
  return { deps, queued };
}

const quietless: Profile = { ...DEFAULT_PROFILE, quiet: null };
const row = (state: string, taken_at: string | null = null, id = 'e1') => ({ row: id, state, taken_at }) as Pick<Instr, 'row' | 'state' | 'taken_at'>;

test('AT MOST ONE PER INSTRUCTION STATE: the same state again rings nothing, another state does', () => {
  const { deps, queued } = fake(['ps_1']);
  assert.equal(finishCause(row('done')), 'instruction.e1.done');
  assert.equal(tellFinished(deps, row('done'), quietless), 'sent');
  assert.equal(tellFinished(deps, row('done'), quietless), 'told');
  assert.equal(tellFinished(deps, row('needs_you'), quietless), 'sent');
  assert.equal(tellFinished(deps, row('working'), quietless), 'not_this_state');
  assert.equal(queued.length, 2);
});

test('A RECORD NOBODY SUBSCRIBED A PHONE ON QUEUES NOTHING', () => {
  const { deps, queued } = fake([]);
  assert.equal(tellFinished(deps, row('done'), quietless), 'no_phone');
  assert.equal(queued.length, 0);
});

test('LONG RINGS FOR A DONE ONLY AFTER N MINUTES, and always for Needs you', () => {
  const { deps } = fake(['ps_1']);
  const long: Profile = { ...quietless, notify: { on: 'long', minutes: 10, by: 'push' } };
  const ago = (min: number) => new Date(deps.nowMs - min * MIN).toISOString();
  assert.equal(tellFinished(deps, row('done', ago(3), 'a'), long), 'short');
  assert.equal(tellFinished(deps, row('done', ago(12), 'b'), long), 'sent');
  assert.equal(tellFinished(deps, row('needs_you', ago(1), 'c'), long), 'sent');
});
