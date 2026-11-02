/**
 * An agent acting for a colleague is told in one plain sentence what it can reach (`acts-for.ts`): "You act
 * for Sam and can view Kiln. Amounts are hidden from you." Said by `context` as its Reach line, never cut, never an id; nothing for an
 * owner's agent or a person.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { actsFor } from '../src/acts-for.ts';
import { planContext, planText, type ContextFacts } from '../src/context-plan.ts';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 22, 12);
const until = new Date(NOW + 30 * 86_400_000).toISOString();

const reg = (id: string, name: string, title: string, fields: unknown[]) => ({ id: `register.${id}`, kind: 'register' as const, body: { id, name, title, fields } as never });

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(
    (
      await api.kernel.install([
        { id: 'register.things', kind: 'register' as const, body: { id: 'things', name: 'Things', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] } as never },
        reg('tasks', 'Tasks', 'what', [
          { id: 'what', type: 'text', required: true },
          { id: 'thing', type: 'ref', to: 'things', scope: {} },
          { id: 'cost', type: 'money' },
        ]),
      ])
    ).ok,
  );
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF', slug: 'the-kiln', name: 'The Kiln', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW };
  const kiln = (await api.create({ register: 'things', fields: { name: 'Kiln' } }, owner)) as { value: { id: string } };
  sql.exec("INSERT INTO person (id, email, name, suspended_at) VALUES ('p_sam', 'sam@example.test', 'Sam', NULL)");
  return { api, sql, owner, kiln: kiln.value.id };
}

/** The context the door builds for Sam's agent, from what the record says he holds. */
const agentOf = (api: Awaited<ReturnType<typeof createRecordApi>>, person: string): CallContext => {
  const held = api.kernel.access(person)!;
  return {
    principal: { kind: 'token', id: 'tok_sam', scope: 'write', person, level: held.level as never },
    ...(held.registers === null ? {} : { registers: held.registers }),
    levels: held.levels as never,
    ...(held.wheres ? { wheres: held.wheres } : {}),
    ...(held.hides ? { hides: held.hides } : {}),
    ...(held.grant ? { grant: held.grant } : {}),
  } as CallContext;
};

test('SAM\'S AGENT IS TOLD WHAT HIS SHARE REACHES, BY NAME, AND THAT AMOUNTS ARE HIDDEN', async () => {
  const { api, sql, owner, kiln } = await record();
  const out = (await api.share({ share: { who: { kind: 'person', id: 'p_sam' }, what: { project: kiln }, can: 'view', hide: { types: ['money'] }, when: { until } } }, owner)) as { ok: boolean };
  assert.ok(out.ok, JSON.stringify(out));
  const ctx = agentOf(api, 'p_sam');
  const { namesOf } = await import('../src/methods/sharing.ts');
  const { sharesFor } = await import('@braindog/kernel');
  const line = actsFor(ctx, api.kernel.catalog(), namesOf(sql, api.kernel.catalog()), sharesFor(sql, 'p_sam') ?? []);
  assert.equal(line, 'You act for Sam and can view Kiln. Amounts are hidden from you.');
  assert.doesNotMatch(line!, /p_sam|sh_|tok_|01[0-9A-HJKMNP-TV-Z]{20}/u);
});

test('AN OWNER\'S AGENT AND A PERSON ARE TOLD NOTHING', async () => {
  const { api, sql } = await record();
  const { namesOf } = await import('../src/methods/sharing.ts');
  const names = namesOf(sql, api.kernel.catalog());
  assert.equal(actsFor({ principal: { kind: 'token', id: 't', scope: 'write', person: 'p_1', level: 'owner' } }, api.kernel.catalog(), names, []), null);
  assert.equal(actsFor({ principal: { kind: 'person', id: 'p_sam', level: 'read' } }, api.kernel.catalog(), names, []), null);
});

test('A MEMBER\'S AGENT IS TOLD ITS ROLE, AND A LIST HELD TO SOME ROWS SAYS SO', async () => {
  const { api, sql } = await record();
  const { namesOf } = await import('../src/methods/sharing.ts');
  const names = namesOf(sql, api.kernel.catalog());
  const whole: CallContext = { principal: { kind: 'token', id: 't', scope: 'write', person: 'p_sam', level: 'write' } };
  assert.equal(actsFor(whole, api.kernel.catalog(), names, []), 'You act for Sam and can edit everything.');
  const narrow: CallContext = {
    principal: { kind: 'token', id: 't', scope: 'write', person: 'p_sam', level: null },
    registers: ['tasks'],
    levels: { tasks: 'read' },
    wheres: { tasks: { field: 'what', is: 'Glaze' } },
    hides: { tasks: ['what'] },
  } as CallContext;
  assert.equal(actsFor(narrow, api.kernel.catalog(), names, []), 'You act for Sam and can view some rows of tasks. Some fields are hidden from you.');
});

test('THE PLAN SAYS IT AS ITS REACH LINE, BEFORE MAY, AND NEVER CUTS IT', () => {
  const facts: ContextFacts = {
    stop: null,
    told: [],
    who: { who: 'Claude Code on MacBook', placed: false, also: null, next: null, signs: null, waiting: null, learned: null, update: null, step: null },
    may: 'You only read: ask for any change with propose.',
    reach: 'You act for Sam and can view Kiln. Amounts are hidden from you.',
    rules: [],
    brief: null,
    others: [],
    lane: [],
    decided: [],
    learned: [],
    now: NOW,
  };
  const plan = planContext(facts, { budget: 1 });
  assert.deepEqual(plan.sections.map((s) => s.id).slice(0, 1), ['reach']);
  assert.match(planText(plan), /^Reach +You act for Sam and can view Kiln\. Amounts are hidden from you\.$/mu);
  const script = planContext({ ...facts, who: null });
  assert.ok(script.sections.some((s) => s.id === 'reach'), 'a script key is told what it reaches');
});
