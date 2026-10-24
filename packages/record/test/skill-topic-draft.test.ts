/**
 * A learning with a topic drafts a skill change (scope B32): the path was built (`skillBearings`, `slashSkills`) and never
 * ran on his record, because no learning named a skill. Here a lesson whose topic is "wrangler" meets the skill called
 * wrangler at the daily look, and one `version:skills:` question waits on Decide; a lesson with no topic drafts nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext, type SlashMeter, type SlashModel } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW as SEEDED, installAgentsPack, installSeed } from '../../seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A model that writes the lessons it is handed under the skill's text, and drafts nothing else. */
const model = {
  name: 'test model',
  draft: async () => ({ drafts: [] }),
  skill: async (input: { skill: { body: string }; learnings: { lesson: string }[] }) => ({ body: `${input.skill.body}\n${input.learnings.map((l) => `- ${l.lesson}`).join('\n')}\n` }),
} as unknown as SlashModel;
const meter: SlashMeter = {
  hold: async () => ({ ok: true, value: { settle: () => {}, release: () => {} } }),
  background: async () => ({ ok: true, value: { settle: () => {}, release: () => {} } }),
};

async function record(topic: string | null) {
  const sql = openSqlite();
  const clock = fixedClock(SEEDED);
  const api = await createRecordApi({ sql, clock, slashModel: model, slashMeter: meter });
  value(await installSeed(api.kernel));
  value(await installAgentsPack(api.kernel));
  /* THE SEED'S OWN LESSONS TAKEN BACK, so the only bearing is the one this file writes. */
  for (const row of value<{ rows: Entry[] }>(await api.list({ register: 'learnings', limit: 100 }, owner)).rows)
    if (row.state === 'active') value(await api.update({ register: 'learnings', seq: row.seq!, patch: { state: 'reverted', why: 'Taken off so this file counts only what it wrote.' } }, owner));
  value(await api.create({ register: 'skills', fields: { name: 'wrangler', trigger: 'When a Worker is deployed.', kind: 'skill', body: '# wrangler\n\nDeploy with the env named.\n' } }, owner));
  value(
    await api.create(
      {
        register: 'learnings',
        fields: {
          lesson: 'Name the environment on every wrangler deploy.',
          because: 'A deploy with no env went to the default Worker and took the site down for ten minutes.',
          kind: 'method',
          ...(topic === null ? {} : { topic }),
        },
      },
      owner,
    ),
  );
  clock.set(SEEDED + 86_400_000);
  return { sql, api };
}

const drafts = (sql: ReturnType<typeof openSqlite>) =>
  sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' AND body_kind = 'rowset' AND json_extract(body, '$.register') = 'skills' AND body LIKE '%wrangler%'");

test('A LESSON WHOSE TOPIC IS A SKILL\'S NAME DRAFTS ITS NEXT VERSION AT THE DAILY LOOK, as one question on Decide', async () => {
  const { sql, api } = await record('wrangler');
  const out = await api.slashTick();
  assert.ok(out.ran, JSON.stringify(out));
  const filed = out.filed.filter((f) => /skill wrangler/u.test(f.question));
  assert.equal(filed.length, 1, JSON.stringify(out));
  assert.match(filed[0]!.question, /^Take version 2 of the skill wrangler\? It takes in what LN\d+ teaches\.$/u);
  assert.equal(drafts(sql).length, 1);
  sql.close();
});

test('A LESSON WITH NO TOPIC DRAFTS NOTHING', async () => {
  const { sql, api } = await record(null);
  await api.slashTick();
  assert.equal(drafts(sql).length, 0);
  sql.close();
});
