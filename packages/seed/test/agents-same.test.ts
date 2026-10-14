/**
 * WHAT MAKES TWO ROWS OF THE AGENTS ADD-ON ONE THING, SINCE 1.13.0 (AGT-C13 job e, with AGT-D03's half): learnings by
 * their lesson, skills by their name as written, tools by their name, and keys by their name with the sealed one kept,
 * each within its project. Said as data, so every record that installs the add-on gets it; the kernel reads it
 * (`same:` among a list's own keys in `packages/kernel/src/declare.ts`). And a learning's kind gains `rule`
 * (AGT-B09 job 4), and the learnings' own words carry the four-part test (AGT-D15 job 1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { AGENTS_REGISTERS, NOW, agentsPackDocument, declarations, installAgentsPack } from '../src/index.ts';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

/** A fresh record with projects and the add-on, and nothing else: what every record that takes it starts from. */
async function fresh(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install(declarations().filter((d) => d.id === 'register.things')));
  value(await installAgentsPack(k));
  return { k, sql };
}

/** A list's declaration as the record stored it, so what is checked is what the record keeps and not the source. */
const stored = (k: Kernel, list: string): Record<string, unknown> => {
  const row = k.declarations().find((d) => d.id === `register.${list}`);
  assert.ok(row, `the record holds no ${list}`);
  return JSON.parse(row.body) as Record<string, unknown>;
};

const SAME = {
  learnings: { fields: ['lesson'], within: 'project', fold: 'text' },
  skills: { fields: ['name'], within: 'project', fold: 'exact' },
  tools: { fields: ['name'], within: 'project', fold: 'text' },
  credentials: { fields: ['label'], within: 'project', fold: 'text', keep: 'sealed' },
} as const;

test('EACH OF THE FOUR LISTS SAYS WHAT MAKES TWO OF IT ONE, and the record keeps it as it was said', async () => {
  const { k, sql } = await fresh();
  for (const [list, same] of Object.entries(SAME)) {
    assert.deepEqual(AGENTS_REGISTERS[list]!.same, same, `${list} says another same`);
    assert.deepEqual(stored(k, list).same, same, `the record kept another same for ${list}`);
  }
  sql.close();
});

test('EVERY FIELD A SAME NAMES IS A TEXT FIELD OF ITS LIST, compared within its scope field, and a sealed keep has a sealed field', () => {
  for (const [list, same] of Object.entries(SAME)) {
    const fields = AGENTS_REGISTERS[list]!.fields;
    for (const id of same.fields) assert.equal(fields.find((f) => f.id === id)?.type, 'text', `${list}.${id} is not text`);
    const within = fields.find((f) => f.id === same.within);
    assert.ok(within?.type === 'ref' && within.scope, `${list}.${same.within} is not its scope field`);
  }
  assert.ok(AGENTS_REGISTERS.credentials!.fields.some((f) => f.type === 'secret'), 'keys hold no sealed field to keep');
});

test('THE PACK DOCUMENT CARRIES IT, read by the pack reader as it is installed', async () => {
  const pack = value<Pack>(await normalise(agentsPackDocument()));
  const lists = (pack as unknown as { declarations: { id?: string; register?: string; body?: Record<string, unknown>; same?: unknown }[] }).declarations;
  for (const [list, same] of Object.entries(SAME)) {
    const decl = lists.find((d) => d.id === `register.${list}` || d.register === list);
    assert.ok(decl, `the pack holds no ${list}`);
    assert.deepEqual((decl.body ?? decl).same, same, `the pack reader lost ${list}'s same`);
  }
});

test('A LEARNING CAN BE A RULE, said in a plain word, and the two kinds before it are as they were', async () => {
  const kind = AGENTS_REGISTERS.learnings!.fields.find((f) => f.id === 'kind') as { values?: readonly string[]; labels?: Record<string, string> } | undefined;
  assert.deepEqual(kind?.values, ['method', 'fact', 'rule']);
  assert.deepEqual(kind?.labels, { rule: 'Rule' });
  const { k, sql } = await fresh();
  value(k.create('things', { name: 'Kiln', lane: 'earning' }, { actor: 'p_seed' }));
  const rule = value<{ id: string }>(
    k.create('learnings', { lesson: 'Divide every estimate by four.', because: 'Estimates were four times the work in every review this year.', kind: 'rule' }, { actor: 'p_seed' }),
  );
  assert.equal(k.get(rule.id)?.fields.kind, 'rule');
  value(k.create('learnings', { lesson: 'A method still writes as one.', because: 'The value added beside it must change no kind before it.', kind: 'method', project: 'things#1' }, { actor: 'p_seed' }));
  sql.close();
});

test('THE LEARNINGS SAY WHEN TO RECORD ONE, the four parts in one line an agent reads with the list', () => {
  const holds = AGENTS_REGISTERS.learnings!.holds;
  assert.ok(holds.startsWith('what an agent found out the hard way, with the failure that taught it. '), 'what the list holds is said first, as it was');
  assert.ok(
    holds.endsWith('Record one only when it changes what a session does, holds beyond this one case, a session without it would get something wrong, and it has no other home'),
    holds,
  );
  /* A PAGE ENDS IT: "Learnings holds " and this, and a full stop. */
  assert.ok(!holds.endsWith('.'));
  assert.ok(!/—/u.test(holds), 'an em dash');
});
