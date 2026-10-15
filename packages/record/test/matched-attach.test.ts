/**
 * `matched` lists the names Slash put on somebody alone (ENG-B15 job 4): once Slash stands at Do and tell on attaching,
 * its question is accepted by the ladder and the line lands under the ladder's name. Each is listed as an `attach`,
 * with the text's own words, who it went to and the batch its Undo takes; one the owner answered is not, nor one
 * undone. One Undo of it takes Slash's rung back (`landed`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal } from '@braindog/ports';
import { LADDER_RULE, SLASH } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { ladder } from '../src/ladder.ts';
import { methods, type Matched } from '../src/methods/matched.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { PEOPLE as NAMES } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 15, 12);

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
type Api = Awaited<ReturnType<typeof createRecordApi>>;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** The method on the record's own kernel, every list open, as `matched.test.ts` reads it. */
function read(api: Api, sql: ReturnType<typeof openSqlite>) {
  const open = (): Refusal | null => null;
  const deps = { kernel: api.kernel, sql, guard: open, readable: open, no, tail: async <T>(o: T) => o, clock: fixedClock(NOW) } as unknown as RecordDeps;
  return methods(deps).matched;
}

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([PEOPLE]));
  /* MET IN A NOTE, so the rows are the record's own and no person's: an attach to them is off every floor. */
  const people = NAMES.slice(0, 2).map((p) => value<{ id: string; seq: number; version: number }>(api.kernel.create('people', { name: p.name }, { actor: 'rule:meet', note: 'Met in a note.' } as never)));
  /* SLASH STANDS AT DO AND TELL ON ATTACHING, as a yes to its offer leaves it (`ladder-slash-attach.test.ts`). */
  sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES (?, 'people:attach', 'tell', 0, '2026-10-15T00:00:00.000Z')", SLASH);
  const trust = ladder({ sql, kernel: api.kernel, now: () => NOW });
  /** Slash asks to put a line on one of them, as the about read files it: the question, unanswered. */
  const ask = (row: { id: string }, line: string): string => {
    const version = (api.kernel.get(row.id) as { version: number }).version;
    const body = { register: 'people', as: 'attach', rows: [{ at: row.id, version, patch: { met: [line] } }] };
    return value<{ id: string }>(api.kernel.propose({ question: 'Is the Mara in this note Mara Okafor?', body_kind: 'rowset', body } as never, SLASH)).id;
  };
  /** The same, landed by the ladder at Slash's rung with no question: the batch it was written under. */
  const land = (row: { id: string }, line: string): string => value<{ batch: string }>(api.kernel.decide(ask(row, line), { rule: 'ladder' } as never, LADDER_RULE)).batch;
  return { api, sql, people, trust, ask, land, matched: read(api, sql) };
}

test('AN ATTACH SLASH LANDED ALONE IS LISTED: its sentence, who it went to, and the batch its Undo takes', async () => {
  const { sql, people, land, matched } = await record();
  const batch = land(people[1]!, '2026-10-15 · Mara said the draft is ready for Friday.');
  const out = value<Matched>(await matched(undefined, owner));
  assert.ok(out !== null);
  assert.equal(out.matches.length, 1);
  const one = out.matches[0]!;
  assert.equal(one.kind, 'attach');
  assert.deepEqual(one.from, [], 'nobody was folded');
  assert.deepEqual(one.into, { name: NAMES[1]!.name, seq: people[1]!.seq });
  assert.equal(one.sentence, 'Mara said the draft is ready for Friday.', "the text's own words, without the day");
  assert.equal(one.evidence, `Slash put this on ${NAMES[1]!.name} without asking.`);
  assert.equal(one.batch, batch);
  assert.equal(one.at, '2026-10-15T12:00:00.000Z');
  /* NAMES, NEVER IDS, in what a person reads. */
  assert.doesNotMatch(JSON.stringify({ ...one, batch: '' }), /[0-9A-HJKMNP-TV-Z]{26}|rule:|slash:|—/u);
  sql.close();
});

test('NEWEST FIRST, UNDER THE LIMIT, and a long sentence is cut as the about read cuts it', async () => {
  const { sql, people, land, matched } = await record();
  land(people[0]!, '2026-10-15 · Lunch with the printers on Tuesday.');
  const long = `2026-10-15 · ${'The quarterly proofs went back twice before anyone signed them off, '.repeat(4)}`;
  const newest = land(people[1]!, long);
  const all = value<Matched>(await matched(undefined, owner))!.matches;
  assert.deepEqual(all.map((m) => m.into.name), [NAMES[1]!.name, NAMES[0]!.name]);
  assert.equal(all[0]!.sentence!.length, 160);
  assert.ok(all[0]!.sentence!.endsWith('...'));
  const one = value<Matched>(await matched({ limit: 1 }, owner))!.matches;
  assert.deepEqual(one.map((m) => m.batch), [newest]);
  sql.close();
});

test('ONE THE OWNER ANSWERED IS HIS, NOT SLASH ALONE, and a question still waiting is nothing yet', async () => {
  const { api, sql, people, ask, matched } = await record();
  const waiting = ask(people[0]!, '2026-10-15 · Mara sent the invoice.');
  assert.deepEqual(value<Matched>(await matched(undefined, owner))!.matches, []);
  value(await api.decide({ id: waiting, decide: { option: 'accept', reason: 'yes' } }, owner));
  assert.ok((api.kernel.get(people[0]!.id) as { fields: { met?: string[] } }).fields.met?.length, 'the line was written');
  assert.deepEqual(value<Matched>(await matched(undefined, owner))!.matches, []);
  sql.close();
});

test('ONE UNDO PUTS IT BACK, IT IS NO LONGER LISTED, and the batch names Slash and the attach for the ladder', async () => {
  const { api, sql, people, land, trust, matched } = await record();
  const batch = land(people[1]!, '2026-10-15 · Mara said the draft is ready.');
  assert.deepEqual(trust.landed(batch), { agent: SLASH, kinds: ['people:attach'] });
  const plan = value<{ hash: string }>(await api.undo({ batch, dry: true }, owner));
  value(await api.undo({ batch, hash: plan.hash }, owner));
  assert.deepEqual(value<Matched>(await matched(undefined, owner))!.matches, []);
  /* WHAT THE UNDO HANDS THE LADDER (a blocked line in `undo.ts`): Slash back at Ask, and the next attach asks again. */
  const by = trust.landed(batch)!;
  trust.drop(by.agent, by.kinds, 'undone');
  assert.equal(trust.rungFor(SLASH, 'write', [{ key: 'people:attach', list: 'people', verb: 'attach', floor: null }]), 'ask');
  assert.equal(trust.landed('01M4ZPXYG0000000000000000'), null, 'a batch the ladder did not land names nobody');
  sql.close();
});

test('A FOLD ANSWERS AS IT DID, WITH ITS KIND BESIDE IT, and folds and attaches are said together newest first', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  const keyed = structuredClone(PEOPLE) as unknown as { body: { meets: Record<string, string>; fields: Record<string, unknown>[] } };
  keyed.body.meets.handles = 'handles';
  keyed.body.fields[1] = { id: 'email', type: 'email', unique: true, index: true };
  keyed.body.fields.push({ id: 'handles', type: 'list', of: 'text', label: 'Handles' });
  value(await api.kernel.install([keyed as never]));
  const teo = { name: 'Teodor Vance' };
  const meet = async (said: Record<string, unknown>) => value<{ undo?: string }>(await api.meet(said as never, owner));
  await meet({ name: teo.name, email: 'teodorv@lanternfish.example', source: 'commit 1 in lanternfish' });
  await meet({ name: teo.name, email: 'teodor.v@pellucid.example', source: 'note from Tuesday' });
  const fold = (await meet({ name: teo.name, email: 'teodorv@lanternfish.example', source: 'note from Wednesday' })).undo;
  assert.ok(fold, 'the strong rules folded the two');
  /* THE ATTACH GOES TO SOMEBODY MET IN A NOTE: a row the owner's own meeting made is his, and an attach to it asks. */
  const kept = value<{ id: string }>(api.kernel.create('people', { name: NAMES[3]!.name }, { actor: 'rule:meet', note: 'Met in a note.' } as never));
  sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES (?, 'people:attach', 'tell', 0, '2026-10-15T00:00:00.000Z')", SLASH);
  const version = (api.kernel.get(kept.id) as { version: number }).version;
  const body = { register: 'people', as: 'attach', rows: [{ at: kept.id, version, patch: { met: ['2026-10-15 · Teo sent the proofs.'] } }] };
  const asked = value<{ id: string }>(api.kernel.propose({ question: 'Is the Teo in this note Teodor Vance?', body_kind: 'rowset', body } as never, SLASH)).id;
  const landed = value<{ batch: string }>(api.kernel.decide(asked, { rule: 'ladder' } as never, LADDER_RULE)).batch;
  const matches = value<Matched>(await read(api, sql)(undefined, owner))!.matches;
  assert.deepEqual(matches.map((m) => [m.kind, m.batch]), [['attach', landed], ['fold', fold]]);
  const folded = matches.find((m) => m.kind === 'fold')!;
  assert.deepEqual(Object.keys(folded).sort(), ['at', 'batch', 'evidence', 'from', 'into', 'kind']);
  assert.equal(folded.batch, fold);
  sql.close();
});
