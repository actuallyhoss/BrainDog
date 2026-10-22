/**
 * THE STEPS LEFT FOR THE NEXT RUN ON A PAGE (AGT-C05 job c): a computed source `handoffs.open` and a built-in figure
 * `handoffs-open`, both over `handoff.ts`'s `openHandoffs`, the read the briefing hands a new session its step from.
 *
 * On the real kernel and `node:sqlite`: runs work, leave a step and close, as the agents do.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok as okResult } from '@braindog/ports';

/* `pages.ts` FIRST, as `signs-page.test.ts` does, so the kernel's modules load in the order the record loads them. */
import { readBlock, registersOfBlock, type PageBlock, type PageDeps } from '../src/pages.ts';
import { BUILT_IN_FIGURES, HANDOFFS_OPEN, openSteps, readHandoffsOpen } from '../src/built-in-figures.ts';
import { openRecord, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 86_400_000;

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

const as = (client_id: string, repo: string, more: SessionHints = {}): WriteContext => ({
  actor: 'agent:claude',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id, agent: 'claude', client: 'claude-code', repo, ...more },
});
const ok = (r: { ok: boolean }): void => assert.ok(r.ok, JSON.stringify(r));

/** A record where a run in each of two repositories has left a step and closed. */
async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  ok(await k.install([TASKS]));
  const leave = (client: string, repo: string, next: string) => {
    ok(k.create('tasks', { what: `Work of ${client}` }, as(client, repo)));
    const run = k.findRun({ client_id: client }, 't_1')!;
    ok(k.update('session', `S${String(run.seq)}`, { next }, as(client, repo)));
    ok(k.endRun(as(client, repo), {}));
    return `S${String(run.seq)}`;
  };
  const first = leave('c1', 'braindog', 'Wire the handoff source into the record');
  const second = leave('c2', 'oxbow', 'Check the refund webhook');
  return { sql, k, first, second };
}

test('EVERY OPEN STEP ON THE RECORD, each place read in its own right, newest first', async () => {
  const { sql, first, second } = await record();
  const steps = openSteps(sql, NOW);
  assert.deepEqual(steps.map((s) => [s.spoken, s.repo, s.mark]).sort(), [
    [first, 'braindog', 'next'],
    [second, 'oxbow', 'next'],
  ]);
  assert.equal(openSteps(sql, NOW + 8 * DAY).every((s) => s.mark === 'earlier'), true, 'a step past a week is earlier');
  assert.deepEqual(openSteps(sql, NOW, 'things#1'), [], 'a project nobody left a step in has none');
  sql.close();
});

test('handoffs-open COUNTS THEM, a built-in figure with no target', async () => {
  const { sql } = await record();
  const decl = BUILT_IN_FIGURES['handoffs-open']!;
  assert.equal(decl.source, HANDOFFS_OPEN);
  assert.equal(decl.target, undefined, 'a step left is neither good nor bad');
  const read = readHandoffsOpen(sql, { nowMs: NOW }, decl);
  assert.ok(read.ok);
  assert.equal(read.value.value, 2);
  assert.equal(read.value.met, null);
  const one = readHandoffsOpen(sql, { nowMs: NOW }, { ...decl, about: 'things#1' } as never);
  assert.ok(one.ok);
  assert.equal(one.value.value, 0, 'with about filled, one project’s');
  sql.close();
});

function depsOver(steps: PageDeps['handoffs'] | undefined): PageDeps {
  return {
    pages: () => [],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: () => okResult({ rows: [], matched: 0 }),
    schemaOf: () => null,
    titleOf: () => null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => null },
    ...(steps ? { handoffs: steps } : {}),
  };
}

const TABLE: PageBlock = { kind: 'table', source: HANDOFFS_OPEN, columns: [{ field: 'agent' }, { field: 'next' }, { field: 'left_at' }] };

test('A handoffs.open BLOCK DRAWS EACH STEP: the agent by name, the step, when, and the run as a run', async () => {
  const { sql, first } = await record();
  const read = readBlock(depsOver((p) => openSteps(sql, NOW, p)), TABLE);
  assert.deepEqual(read.refusals, []);
  assert.equal(read.matched, 2);
  const mine = read.rows.find((r) => r.fields.run === first)!;
  assert.equal(mine.fields.agent, 'Claude Code', 'called as the run calls itself, by its client');
  assert.equal(mine.fields.next, 'Wire the handoff source into the record');
  assert.equal(mine.fields.mark, 'next');
  assert.equal(read.types?.run, 'run');
  assert.equal(read.types?.left_at, 'instant');
  const narrowed = readBlock(depsOver((p) => openSteps(sql, NOW + 8 * DAY, p)), { ...TABLE, where: 'mark is next' } as PageBlock);
  assert.equal(narrowed.matched, 0, 'where: mark is next keeps only the steps a new session is handed');
  sql.close();
});

test('an order, a field a step has not, a malformed about and a record that reads no steps are each said', () => {
  const steps = () => [];
  assert.equal(readBlock(depsOver(steps), { ...TABLE, order: [{ field: 'left_at' }] } as PageBlock).refusals[0]?.code, 'DECLARATION_INVALID');
  assert.equal(readBlock(depsOver(steps), { ...TABLE, columns: [{ field: 'token' }] }).refusals[0]?.code, 'FIELD_UNKNOWN');
  assert.equal(readBlock(depsOver(steps), { ...TABLE, about: 'BrainDog' } as PageBlock).refusals[0]?.code, 'VALUE_MALFORMED');
  assert.equal(readBlock(depsOver(undefined), TABLE).refusals[0]?.code, 'NOT_IN_THIS_BUILD');
});

test('about: narrows to one project, handed as its spoken id', () => {
  const asked: (string | null)[] = [];
  readBlock(depsOver((p) => (asked.push(p), [])), { ...TABLE, about: 'things#3' } as PageBlock);
  readBlock(depsOver((p) => (asked.push(p), [])), TABLE);
  assert.deepEqual(asked, ['things#3', null]);
});

test('the block names the runs it reads', () => {
  assert.ok(registersOfBlock(TABLE).includes('session'));
});
