/**
 * A question names the one person who decides it (`docs/20-COLLABORATION.md`: "one named person decides").
 *
 * BEFORE THIS a question held who opened it and who settled it, and any member who may decide answered any of them. Now
 * an owner hands one to Ada, the newest hand wins, a hand is taken back with nobody, an agent's proposal may arrive
 * already hers, and Ben, who may also decide, is told whose it is by her name. No migration: a hand is a note.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { deciderFault, deciderOf, handQuestion } from '../src/govern.ts';
import { openRecord, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { PEOPLE } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 15, 9);
const [OWNER, ADA, BEN, READER] = [PEOPLE[0]!, PEOPLE[3]!, PEOPLE[2]!, PEOPLE[6]!];

const value = <T>(out: { ok: boolean }): T => {
  assert.ok(out.ok, fixOf(out as never));
  return (out as unknown as { value: T }).value;
};
const refusal = (out: { ok: boolean }) => {
  assert.equal(out.ok, false);
  return (out as unknown as { refusal: { code: string; fix: string; at?: string } }).refusal;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; deps: Parameters<typeof handQuestion>[0] }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const [id, p, level] of [
    ['p_owner', OWNER, 'owner'],
    ['p_ada', ADA, 'decide'],
    ['p_ben', BEN, 'decide'],
    ['p_reader', READER, 'read'],
  ] as const) {
    sql.exec('INSERT INTO person (id, email, name) VALUES (?, ?, ?)', id, p.email, p.name);
    sql.exec("INSERT INTO member (person_id, register, level) VALUES (?, '*', ?)", id, level);
  }
  let n = 0;
  const deps = { sql, nowMs: NOW, mint: () => `01JZDECIDER0000000000${String(++n).padStart(5, '0')}` };
  return { k, sql, deps };
}

const ask = (question = 'Which supplier for the jars?') => ({
  question,
  body_kind: 'options' as const,
  body: { options: [{ id: 'north', label: 'Northgate', because: 'Cheaper.' }, { id: 'cedar', label: 'Cedar', because: 'Faster.' }] },
});
const filed = (k: Kernel, more: Record<string, unknown> = {}, question?: string): string => value<{ id: string }>(k.propose({ ...ask(question), ...more }, 'p_owner')).id;
const named = (sql: NodeSql) => (person: string) => sql.one<{ name: string }>('SELECT name FROM person WHERE id = ?', person)!.name;

test('AN OWNER HANDS A QUESTION TO ADA, AND THE RECORD SAYS SO ON THE QUESTION', async () => {
  const { k, sql, deps } = await record();
  const id = filed(k);
  assert.equal(deciderOf(sql, id), null, 'a question nobody was handed names nobody');
  assert.equal(k.governanceRow('suggestion', id)?.decider, null);

  assert.deepEqual(value(handQuestion(deps, id, 'p_ada', 'p_owner')), { id, decider: 'p_ada' });
  assert.equal(deciderOf(sql, id), 'p_ada');
  assert.equal(k.governanceRow('suggestion', id)?.decider, 'p_ada', 'getGovernance answers it');
  const open = value<Record<string, unknown>[]>(k.governance('suggestion'));
  assert.equal(open.find((r) => r.id === id)?.decider, 'p_ada', 'listGovernance answers it');

  /* One note on the question, signed by the owner, holding the person; nothing else in the log reads it as a join. */
  /* The person in `to_v`, and words in `note`, which History says as they are: her name, never her id. */
  const lines = sql.all<{ actor: string; field: string; to_v: string; note: string }>("SELECT actor, field, to_v, note FROM event WHERE kind = 'note' AND target = ?", `suggestion:${id}`);
  assert.deepEqual(lines.map((l) => ({ ...l })), [{ actor: 'p_owner', field: 'decider', to_v: 'p_ada', note: `Handed to ${ADA.name} to decide.` }]);

  /* The same hand again writes nothing. */
  value(handQuestion(deps, id, 'p_ada', 'p_owner'));
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'note' AND target = ?", `suggestion:${id}`)?.n, 1);
});

test('THE NEWEST HAND WINS, AND A HAND IS TAKEN BACK WITH NOBODY', async () => {
  const { k, sql, deps } = await record();
  const id = filed(k);
  const other = filed(k, {}, 'Which carrier for the boxes?');
  value(handQuestion(deps, id, 'p_ada', 'p_owner'));
  value(handQuestion(deps, id, 'p_ben', 'p_owner'));
  assert.equal(deciderOf(sql, id), 'p_ben');
  assert.equal(deciderOf(sql, other), null, 'a hand is on its one question');

  assert.deepEqual(value(handQuestion(deps, id, null, 'p_owner')), { id, decider: null });
  assert.equal(deciderOf(sql, id), null);
  const back = sql.one<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND field = 'decider' AND target = ? ORDER BY rowid DESC LIMIT 1", `suggestion:${id}`);
  assert.equal(back?.note, 'Taken back, so anybody who may decide can answer it.');
  assert.equal(k.governanceRow('suggestion', id)?.decider, null);
  /* Handed again after being taken back, it is hers again. */
  value(handQuestion(deps, id, 'p_ada', 'p_owner'));
  assert.equal(deciderOf(sql, id), 'p_ada');
});

test('ONLY SOMEBODY WHO MAY DECIDE IS HANDED ONE, AND A SETTLED QUESTION IS HANDED TO NOBODY', async () => {
  const { k, sql, deps } = await record();
  const id = filed(k);
  const r = refusal(handQuestion(deps, id, 'p_reader', 'p_owner'));
  assert.equal(r.fix, `${READER.name} cannot decide here. Name somebody who can, or nobody.`);
  assert.equal(r.at, 'to');
  assert.equal(refusal(handQuestion(deps, 'SG999', 'p_ada', 'p_owner')).code, 'OUT_OF_BOUNDS');
  assert.equal(deciderOf(sql, id), null, 'a refused hand wrote nothing');

  value(k.decide(id, { decide: { option: 'north', reason: 'Cheaper and good enough.' } }, 'p_owner'));
  const settled = refusal(handQuestion(deps, id, 'p_ada', 'p_owner'));
  assert.equal(settled.code, 'TRANSITION_ILLEGAL');
  assert.equal(settled.fix, 'This question is already settled, so it cannot be handed to anybody.');
});

test('A PROPOSAL CAN ARRIVE ALREADY HERS, AND ONE NAMING SOMEBODY WHO CANNOT DECIDE IS NOT FILED', async () => {
  const { k, sql } = await record();
  const id = filed(k, { decider: 'p_ada' });
  assert.equal(deciderOf(sql, id), 'p_ada');
  assert.equal(k.governanceRow('suggestion', id)?.decider, 'p_ada');

  const before = sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM suggestion')?.n;
  const r = refusal(k.propose({ ...ask('Which printer for the labels?'), decider: 'p_reader' }, 'p_owner'));
  assert.equal(r.fix, `${READER.name} cannot decide here. Name somebody who can, or nobody.`);
  assert.equal(r.at, 'decider');
  assert.equal(refusal(k.propose({ ...ask('Which printer for the tape?'), decider: 'p_nobody' }, 'p_owner')).at, 'decider');
  assert.equal(refusal(k.propose({ ...ask('Which van for the boxes?'), decider: 'p_ada' }, 'slash')).at, 'decider', 'a model names nobody');
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM suggestion')?.n, before, 'nothing was filed');
});

test('ONLY THE DECIDER OR AN OWNER ANSWERS A HANDED QUESTION, AND ANYBODY ELSE READS WHOSE IT IS', async () => {
  const { k, sql, deps } = await record();
  const id = filed(k);
  assert.equal(deciderFault(sql, id, 'p_ben', false), null, 'a question nobody was handed is anybody who may decide');

  value(handQuestion(deps, id, 'p_ada', 'p_owner'));
  assert.equal(deciderFault(sql, id, 'p_ada', false, named(sql)), null, 'the decider answers it');
  assert.equal(deciderFault(sql, id, 'p_owner', true, named(sql)), null, 'an owner answers it');
  assert.equal(deciderFault(sql, id, 'p_ben', false, named(sql)), `This one is ${ADA.name}'s to decide.`);
  assert.equal(deciderFault(sql, id, 'p_ben', false), `This one is ${ADA.name}'s to decide.`, 'by the record name when no nameOf is passed');
  assert.ok(!/p_ada/.test(deciderFault(sql, id, 'p_ben', false) ?? ''), 'a name, never an id');
});
