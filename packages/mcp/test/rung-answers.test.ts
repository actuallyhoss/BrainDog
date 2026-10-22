/**
 * What an agent is told its rung did with a write (the ladder of trust).
 *
 * OVER THE STUB SURFACE, because the ladder is the record's: what is tested is that the tool layer says what the record
 * answered, in names, and decides nothing itself. `rung` beside a write means it went through on the agent's rung;
 * `filed` in place of the row means it was put on Decide and nothing was written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Look } from '../src/brief.ts';
import { ruledBrief, ruledOf } from '../src/brief.ts';
import { tools } from '../src/index.ts';
import { stub } from './stub.ts';

const ROW = '01M345FTM0D4F495AW6K6NDA09';
const agent = { who: 'agent' };
const boot = async () => ({ ok: true as const, value: { me: { level: 'owner', name: 'Mara' }, registers: [{ id: 'tasks', name: 'Tasks' }] } });
const schema = async () => ({ ok: true as const, value: { id: 'tasks', name: 'Tasks', title: 'title', seq_prefix: 'T', fields: [{ id: 'title', type: 'text' }] } });
const entry = (extra: Record<string, unknown> = {}) => ({ id: ROW, register: 'tasks', seq: 4, version: 2, state: null, fields: { title: 'Ship the undo' }, ...extra });

test('A WRITE ITS RUNG LET THROUGH SAYS DONE, in names, and who can undo it', async () => {
  const { surface } = stub({ boot: boot as never, schema: schema as never, create: (async () => ({ ok: true, value: entry({ rung: 'tell' }) })) as never });
  const said = await tools(surface).answer('create', { register: 'tasks', fields: { title: 'Ship the undo' } }, agent);
  assert.equal(said.text, `Added: Ship the undo (T4) · version 2\nDone, as you may on Tasks · Mara can undo it\nReceipt: Added: Ship the undo (T4) · version 2. No undo handle came back for this one; the owner can put it back from the app.`);
  assert.equal((said.result.ok && (said.result.value as Record<string, unknown>).rung) || null, 'tell');
  assert.doesNotMatch(said.text ?? '', /01M345/u, 'the answer carried a row id');
});

test('A WRITE FILED AS A SUGGESTION SAYS NOTHING WAS WRITTEN, and names the question and who decides', async () => {
  const filed = { filed: { id: 'Q12', question: 'Mark Ship the undo done?' } };
  const { surface } = stub({ boot: boot as never, schema: schema as never, update: (async () => ({ ok: true, value: filed })) as never });
  const said = await tools(surface).answer('update', { spoken: 'tasks#4', patch: { state: 'done' }, version: 2 }, agent);
  assert.equal(said.text, `Filed for Mara to decide: Mark Ship the undo done? (Q12)\nNothing is written until Mara accepts it in BrainDog.\nReceipt: Filed for Mara to decide: Mark Ship the undo done? (Q12). Nothing was written, so there is nothing to undo.`);
  assert.deepEqual(said.result.ok && said.result.value, filed);
});

test('A FILED WRITE LINKS THE QUESTION where the host serves the app', async () => {
  const { surface } = stub({
    boot: (async () => ({ ok: true, value: { me: { level: 'owner', name: 'Mara' }, record: { slug: 'mara' } } })) as never,
    create: (async () => ({ ok: true, value: { filed: { id: 'Q3', question: 'Add Renew brain.dog?' } } })) as never,
  });
  const said = await tools(surface, 'https://brain.dog').answer('create', { register: 'tasks', fields: {} }, agent);
  assert.match(said.text ?? '', /^Filed for Mara to decide: Add Renew brain\.dog\? \(Q3\)\nNothing is written until Mara accepts it in BrainDog at https:\/\/brain\.dog\/app\/mara\/decide\/Q3\.\nReceipt: Filed for Mara to decide: Add Renew brain\.dog\? \(Q3\)\. Nothing was written, so there is nothing to undo\.$/u);
});

test('A WRITE THE RECORD ANSWERS `asked` IS FILED, with its reason, and never said as written', async () => {
  /* THE SHAPE THE RECORD SENDS (`Asked` in packages/record/src/index.ts): `asked` in place of the row, with `why`. */
  const asked = { asked: { id: 'Q14', question: 'Add Ship the undo to Tasks?', why: 'Changes like this ask until 10 of them have been kept as they were.' } };
  const { surface } = stub({ boot: boot as never, schema: schema as never, create: (async () => ({ ok: true, value: asked })) as never });
  const said = await tools(surface).answer('create', { register: 'tasks', fields: { title: 'Ship the undo' } }, agent);
  assert.equal(
    said.text,
    `Filed for Mara to decide: Add Ship the undo to Tasks? (Q14)\nChanges like this ask until 10 of them have been kept as they were. Nothing is written until Mara accepts it in BrainDog.\nReceipt: Filed for Mara to decide: Add Ship the undo to Tasks? (Q14). Nothing was written, so there is nothing to undo.`,
  );
  assert.doesNotMatch(said.text ?? '', /^Added/mu);
});

test('A PROPOSAL THE RECORD SAYS LANDED BY THE LADDER IS DONE, NOT ASKED', async () => {
  const landed = { id: 'Q8', landed: true, decision: 'D3', undo: { decision: 'D3' } };
  const { surface } = stub({ boot: boot as never, schema: schema as never, propose: (async () => ({ ok: true, value: landed })) as never });
  const said = await tools(surface).answer('propose', { question: 'Close two tasks?', body_kind: 'rowset', body: { register: 'tasks', rows: [] } }, agent);
  /* WRITTEN, SO ITS RECEIPT DOES NOT SAY NOTHING WAS. */
  assert.equal(said.text, `Done, as you may on Tasks · Mara can undo it\nReceipt: Done, as you may on Tasks · Mara can undo it. No undo handle came back for this one; the owner can put it back from the app.`);
});

test('A NOTE ON ITS RUNG SAYS DONE AFTER WHERE IT WENT', async () => {
  const { surface } = stub({ boot: boot as never, schema: schema as never, update: (async () => ({ ok: true, value: entry({ rung: 'quiet' }) })) as never });
  const said = await tools(surface).answer('log', { spoken: 'tasks#4', note: 'Started on it.' }, agent);
  assert.equal(said.text, `Noted on Ship the undo (T4) · version 2\nDone, as you may on Tasks · Mara can undo it\nReceipt: Noted on Ship the undo (T4) · version 2. No undo handle came back for this one; the owner can put it back from the app.`);
});

test('A PROPOSAL THE LADDER ACCEPTED IS DONE, NOT ASKED', async () => {
  const { surface } = stub({ boot: boot as never, schema: schema as never, propose: (async () => ({ ok: true, value: { id: 'Q7', rung: 'tell' } })) as never });
  const said = await tools(surface).answer('propose', { question: 'Close two tasks?', body_kind: 'rowset', body: { register: 'tasks', rows: [] } }, agent);
  assert.equal(said.text, `Done, as you may on Tasks · Mara can undo it\nReceipt: Done, as you may on Tasks · Mara can undo it. No undo handle came back for this one; the owner can put it back from the app.`);
});

test('A WRITE WITH NO RUNG SAID IS ANSWERED AS IT ALWAYS WAS, as a person\'s is', async () => {
  const { surface } = stub({ boot: boot as never, schema: schema as never, create: (async () => ({ ok: true, value: entry() })) as never });
  const said = await tools(surface).answer('create', { register: 'tasks', fields: { title: 'Ship the undo' } }, agent);
  assert.equal(said.text, `Added: Ship the undo (T4) · version 2\nReceipt: Added: Ship the undo (T4) · version 2. No undo handle came back for this one; the owner can put it back from the app.`);
  assert.equal(ruledOf({ rung: 'ask' }), null, 'Ask is never a write that went through');
  assert.equal(ruledOf({ filed: { id: '' } }), null);
});

test('THE LINE NAMES EVERY LIST ONCE, and the owner in plain words where the record names nobody', () => {
  const look: Look = { now: 0, decl: (r) => (r === 'tasks' ? ({ id: 'tasks', name: 'Tasks', fields: [] } as never) : undefined), title: () => undefined, actor: (b) => b, decider: 'the owner' };
  assert.equal(ruledBrief({ rung: 'tell' }, ['tasks', 'tasks', 'notes'], look), 'Done, as you may on Tasks and notes · the owner can undo it');
  assert.equal(ruledBrief({ filed: { id: 'Q1', question: '' } }, [], look), 'Filed for the owner to decide (Q1)\nNothing is written until the owner accepts it in BrainDog.');
});
