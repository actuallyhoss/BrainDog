/**
 * `actionRun`, the door behind Run now on a scheduled action (`src/methods/action-run.ts`).
 *
 * The kernel's own test holds the press (`packages/kernel/test/nudge.test.ts`). What is held here is the door: the owner
 * in a browser presses and the event names her; a reader and a member at `write` in a browser are refused; a token whose
 * agent may write in the action's project presses and one that may not is refused; a second press inside the minute is
 * `RATE_LIMITED` with `retry_after`; and an argument the call does not take is refused. A fresh record, invented names.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, type ActionRan } from '../src/methods/action-run.ts';
import { nudgeAction } from '../../kernel/src/nudge.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const SITE = PROJECTS[0];

const SITES = {
  id: 'register.sites',
  kind: 'register' as const,
  body: { id: 'sites', name: 'Sites', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};
const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};
/** A poll that sends no key, for the first site. */
const TIDE = {
  id: 'ingest.tide',
  kind: 'ingest' as const,
  body: {
    ingest: 'tide',
    channel: 'poll',
    url: 'https://api.example.test/v1/tide',
    every: '6h',
    project: 'sites#1',
    extract: { what: { after: 'tide ' } },
    writes: { register: 'notes' },
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const reader: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' } };
const writer: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'write' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_1', level: 'write' } };
/** A token that may write Notes and nothing else, so it may not write in the site the action runs for. */
const notesOnly: CallContext = {
  principal: { kind: 'token', id: 't_2', scope: 'write', person: 'p_1', level: null },
  levels: { notes: 'write' },
  registers: ['notes'],
};
const readToken: CallContext = { principal: { kind: 'token', id: 't_3', scope: 'read', person: 'p_1', level: 'read' } };

type Made = { sql: NodeSql; run: (args: unknown, ctx: CallContext) => Promise<Result<ActionRan>>; due: () => string | undefined };

/**
 * THE METHOD AS THE RECORD SERVES IT once `methods/index.ts` joins it; until then the file's own `methods`, handed the
 * real kernel, storage and press, and a ladder that reads levels, scopes and `registers` as the record's guards do.
 */
async function record(): Promise<Made> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  /* THE TOKEN BELOW IS THE OWNER'S, and a key presses only while its person is an owner. */
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_1', 'owner@example.test', 'Owner')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_1', '*', 'owner')");
  assert.ok((await api.kernel.install([SITES, NOTES])).ok);
  const site = await api.create({ register: 'sites', fields: { name: SITE } }, owner);
  assert.ok(site.ok, JSON.stringify(site));
  const installed = await api.kernel.install([TIDE]);
  assert.ok(installed.ok, JSON.stringify(installed));
  /* A NEW ACTION IS ARMED FOR NOW; this one has run and waits six hours. */
  sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'poll' AND key = 'tide'", new Date(NOW + 6 * 3_600_000).toISOString());
  const due = () => sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'poll' AND key = 'tide'")?.due_at;

  const served = (api as unknown as { actionRun?: Made['run'] }).actionRun;
  if (typeof served === 'function') return { sql, run: served.bind(api), due };
  const LADDER = ['read', 'append', 'write', 'decide', 'owner'];
  const short = (need: string, held: string | null | undefined) => ({ code: 'LEVEL_REQUIRED', fix: `This needs ${need}, and you have ${held ?? 'no'} access.` });
  const reach = (ctx: CallContext, need: string, register?: string) => {
    const p = ctx.principal;
    if (p.kind !== 'person' && p.kind !== 'token') return short(need, null);
    if (register !== undefined && ctx.registers !== undefined && ctx.registers !== '*' && !ctx.registers.includes(register))
      return { code: 'FORBIDDEN', fix: `You may not reach ${register}.`, at: 'register' };
    const held = register !== undefined && ctx.levels?.[register] !== undefined ? ctx.levels[register] : p.level;
    if (p.kind === 'token' && need !== 'read' && p.scope !== 'write') return { code: 'FORBIDDEN', fix: 'This key may not write.' };
    return held !== null && held !== undefined && LADDER.indexOf(held) >= LADDER.indexOf(need) ? null : short(need, held);
  };
  const own = methods({
    kernel: api.kernel,
    sql,
    clock,
    no,
    guard: reach,
    scoped: (ctx: CallContext, need: string) =>
      reach(ctx, need) === null || Object.values(ctx.levels ?? {}).some((l) => LADDER.indexOf(l) >= LADDER.indexOf(need)) ? null : reach(ctx, need),
    admin: (ctx: CallContext) =>
      ctx.principal.kind === 'token' ? { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app.' } : reach(ctx, 'owner'),
    tail: async <T>(out: T) => out,
    nudgeAction,
  } as never);
  return { sql, run: own.actionRun as Made['run'], due };
}

const presses = (sql: NodeSql) =>
  sql.all<{ actor: string; target: string; note: string }>("SELECT actor, target, note FROM event WHERE kind = 'pull' AND field = 'run_now'").map((e) => ({ ...e }));
const refusal = (r: Result<unknown>) => {
  assert.ok(!r.ok, 'the press was taken');
  return (r as { refusal: { code: string; fix: string; at?: string; retry_after?: number } }).refusal;
};

test('THE OWNER PRESSES RUN NOW: the next run is due now, and one event names the action and her', async () => {
  const { sql, run, due } = await record();
  const out = await run({ ingest: 'tide' }, owner);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual({ ...out.value }, { ingest: 'tide', due_at: new Date(NOW).toISOString() });
  assert.equal(due(), new Date(NOW).toISOString());
  assert.deepEqual(presses(sql), [{ actor: 'p_1', target: 'declaration:ingest.tide', note: 'tide was asked to run now.' }]);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'pull.fetch'")?.n, 0, 'the press made a request itself');

  const again = refusal(await run({ ingest: 'tide' }, owner));
  assert.deepEqual([again.code, again.retry_after], ['RATE_LIMITED', 60]);
  assert.equal(presses(sql).length, 1);
});

test('A READER AND A MEMBER AT WRITE IN A BROWSER ARE REFUSED, and nothing moves', async () => {
  const { sql, run, due } = await record();
  const before = due();
  refusal(await run({ ingest: 'tide' }, reader));
  refusal(await run({ ingest: 'tide' }, writer));
  refusal(await run({ ingest: 'tide' }, readToken));
  assert.equal(due(), before);
  assert.deepEqual(presses(sql), []);
});

test("A TOKEN THAT MAY WRITE IN THE ACTION'S PROJECT PRESSES; one held to another list may not", async () => {
  const { sql, run, due } = await record();
  refusal(await run({ ingest: 'tide' }, notesOnly));
  assert.deepEqual(presses(sql), []);
  const out = await run({ ingest: 'tide' }, agent);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(due(), new Date(NOW).toISOString());
  assert.deepEqual(presses(sql).map((e) => e.actor), ['p_1'], 'the press is signed by the person the token was minted for');
});

test('AN ARGUMENT THE CALL DOES NOT TAKE, A MISSING ACTION AND AN UNKNOWN ONE ARE EACH REFUSED', async () => {
  const { run } = await record();
  const stray = refusal(await run({ ingest: 'tide', force: true }, owner));
  assert.deepEqual([stray.code, stray.at], ['FIELD_UNKNOWN', 'force']);
  assert.equal(refusal(await run({}, owner)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await run({ ingest: 'lighthouse' }, owner)).code, 'DECLARATION_UNKNOWN');
});

test("A MEMBER'S OWN KEY PRESSES NO MORE THAN THEY DO: refused in a browser, refused by their token", async () => {
  const { sql, run, due } = await record();
  const before = due();
  const theirs: CallContext = { principal: { kind: 'token', id: 't_9', scope: 'write', person: 'p_3', level: 'write' } };
  refusal(await run({ ingest: 'tide' }, theirs));
  assert.equal(due(), before);
  assert.deepEqual(presses(sql), []);
});
