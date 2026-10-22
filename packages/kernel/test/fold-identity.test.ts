/**
 * A fold never changes who somebody is behind the owner's back (ENG-B04 job 5): a confident match is made, and shown
 * with Undo.
 *
 * The strong rules fold two of one full name and one handle as one batch. What the folded one held as evidence (the
 * later day in touch, where they were met, their address as a key) is written by that batch. An organisation the kept
 * one leaves empty and the folded one holds is on the identity floor (`change-kind.ts`): it is offered, in names, in the
 * fold's own line, and never written. Undo of the fold takes back what it wrote and has nothing it offered to take back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMPANIES, PEOPLE as NAMES } from '../../../fixtures/names.ts';
import { MET_CAP, openRecord, shapeIn, type Declaration, type Entry, type Kernel, type Met, type WriteContext } from '../src/index.ts';
import { foldFill, identityFloor, type FoldFields } from '../src/mentions.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const TODAY = '2026-10-14';

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

const ORGS: Declaration = {
  id: 'register.organisations',
  kind: 'register',
  body: {
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    org: { name: 'name', keys: 'keys', domain: 'domain', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'domain', type: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  },
};

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into', keys: 'keys', aliases: 'aliases', org: 'org', self: 'self', in_touch: 'in_touch' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'aliases', type: 'list', of: 'text' },
      { id: 'self', type: 'bool' },
      { id: 'org', label: 'Organisation', type: 'ref', to: 'organisations' },
      { id: 'in_touch', type: 'day' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  },
};

const OWNER: WriteContext = { actor: 'p_owner' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, ORGS, PEOPLE]));
  return { k, sql };
}

/** Priya, twice: an address at one place, and an address at another under the same handle. */
const PRIYA = NAMES[3]!;
const [handle] = PRIYA.email.split('@');
const HOME = `${handle}@lanternfish.example`;
const WORK = PRIYA.email;
const KEPT = { name: PRIYA.name, email: HOME, in_touch: '2026-09-01', met: ['2026-09-01 · a note about a call'] };

/** The two, the kept one first, then the second met again by its own address, which folds it into the kept one. */
function foldTwo(k: Kernel, org: { kept?: string; folded: string }): { kept: Entry; folded: Entry; met: Met } {
  const kept = value<Entry>(k.create('people', { ...KEPT, ...(org.kept === undefined ? {} : { org: org.kept }) }, OWNER));
  const folded = value<Entry>(k.create('people', { name: PRIYA.name, email: WORK, org: org.folded, met: ['2026-09-20 · a note about a visit'] }, OWNER));
  const met = value<Met>(k.meet({ name: PRIYA.name, email: WORK, where: 'a note about lunch' }, OWNER));
  return { kept, folded, met };
}

/** Every line of one batch. */
const lines = (sql: NodeSql, batch: string) =>
  sql.all<{ target: string; field: string | null; note: string | null }>('SELECT target, field, note FROM event WHERE batch = ? ORDER BY rowid', batch);

test('A FOLD WRITES THE EVIDENCE AND OFFERS THE ORGANISATION: the kept one has none, the offered line names it, Undo gives both back', async () => {
  const { k, sql } = await record();
  const org = value<Entry>(k.create('organisations', { name: COMPANIES[1] }, OWNER));
  const { kept, folded, met } = foldTwo(k, { folded: org.id });
  /* MET BY ITS OWN ADDRESS, so the meeting says `key`; the fold is the batch it carries. */
  assert.ok(met.undo, 'the two were not folded');
  assert.equal(met.row?.id, kept.id, 'the older one was not the one kept');
  assert.equal(k.count('people'), 1);

  const now = k.get(kept.id)!.fields;
  assert.equal(now.org, undefined, 'the fold gave the kept person an organisation nobody pressed for');
  assert.equal(now.in_touch, TODAY, 'the later day in touch was not written');
  assert.ok((now.keys as string[] | undefined)?.includes(`email:${WORK}`), 'the folded address was not kept as a key');
  assert.equal(now.email, HOME, 'the kept address moved');
  assert.ok((now.met as string[]).some((l) => l.includes('a note about a visit')), 'where the folded one was met was lost');

  /* NOTHING IN THE BATCH SETS THE ORGANISATION, and the fold's own line says what was left, in names. */
  const batch = lines(sql, met.undo!);
  assert.equal(batch.filter((l) => l.field === 'org').length, 0, 'a line of the fold set the organisation');
  const offered = batch.map((l) => l.note ?? '').filter((n) => n.includes('Not filled in'));
  assert.equal(offered.length, 1, 'the offered line was not kept in the fold');
  assert.match(offered[0]!, new RegExp(`${COMPANIES[1]} as the organisation`, 'u'));
  assert.doesNotMatch(offered[0]!, new RegExp(`${org.id}|${kept.id}|${folded.id}|—`, 'u'), 'an id or a long dash was put where a person reads');
  /* THE LINE `matched` READS ITS SENTENCE FROM is the pointing one, and it is as it was. */
  const pointed = batch.find((l) => l.field === 'merged_into')!;
  assert.doesNotMatch(pointed.note ?? '', /Not filled in/u);
  /* AND THE SAME LINE IS READ BACK FROM WHAT STANDS, as the `matched` read is to answer it: the folded row keeps its
     fields when it is taken out, so the split run again on the two says what is still offered. */
  const fieldsOf = (id: string) => JSON.parse(sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', id)!.fields) as Record<string, unknown>;
  const shape = shapeIn(sql, 'people');
  const at = { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into', keys: 'keys', aliases: 'aliases', org: 'org', self: 'self', in_touch: 'in_touch' };
  const still = foldFill({ declared: shape!.fields, at, metCap: MET_CAP }, { id: kept.id, fields: fieldsOf(kept.id) }, [{ id: folded.id, fields: fieldsOf(folded.id) }], identityFloor(shape, at));
  assert.deepEqual(still.offered, [{ field: 'org', value: org.id, from: folded.id }]);

  value(k.undoMerge(met.undo!, OWNER));
  assert.equal(k.count('people'), 2, 'Undo did not give two back');
  const back = k.get(kept.id)!.fields;
  assert.equal(back.org, undefined);
  assert.equal(back.in_touch, KEPT.in_touch, 'Undo did not put the day in touch back');
  assert.equal(back.keys, undefined, 'Undo left the folded address on the kept one');
  assert.equal(k.get(folded.id)!.fields.org, org.id, 'the folded one lost its organisation');
  assert.equal(k.get(folded.id)!.fields.email, WORK);
  sql.close();
});

test('A FOLD WHERE BOTH HOLD THE SAME ORGANISATION OFFERS NOTHING, and writes the evidence as ever', async () => {
  const { k, sql } = await record();
  const org = value<Entry>(k.create('organisations', { name: COMPANIES[2] }, OWNER));
  const { kept, met } = foldTwo(k, { kept: org.id, folded: org.id });
  assert.ok(met.undo, 'the two were not folded');
  const now = k.get(kept.id)!.fields;
  assert.equal(now.org, org.id);
  assert.equal(now.in_touch, TODAY);
  assert.equal(lines(sql, met.undo!).filter((l) => (l.note ?? '').includes('Not filled in')).length, 0, 'something was offered');
  sql.close();
});

test('THE SPLIT ITSELF: evidence written, an empty field on the floor offered once a value, the floor read from change-kind', async () => {
  const { sql } = await record();
  const shape = shapeIn(sql, 'people');
  assert.ok(shape?.identity?.includes('org'), 'the floor does not hold the organisation');
  const floor = identityFloor(shape, undefined);
  const fields: FoldFields = {
    declared: (PEOPLE.body as unknown as { fields: FoldFields['declared'] }).fields,
    at: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into', keys: 'keys', aliases: 'aliases', org: 'org', self: 'self', in_touch: 'in_touch' },
    metCap: 20,
  };
  const keep = { id: 'a', fields: { name: PRIYA.name, email: HOME, in_touch: '2026-09-01' } };
  const one = { id: 'b', fields: { name: 'Priya R.', email: WORK, org: 'o1', in_touch: '2026-10-01', self: true } };
  const two = { id: 'c', fields: { name: PRIYA.name, org: 'o2' } };
  const three = { id: 'd', fields: { org: 'o1' } };
  const filled = foldFill(fields, keep, [one, two, three], floor);
  assert.deepEqual(filled.offered, [{ field: 'org', value: 'o1', from: 'b' }, { field: 'org', value: 'o2', from: 'c' }]);
  assert.equal(filled.write.org, undefined);
  assert.equal(filled.write.self, undefined, 'which row is the record’s own person was carried');
  assert.equal(filled.write.in_touch, '2026-10-01');
  assert.deepEqual(filled.write.keys, [`email:${WORK}`]);
  assert.deepEqual(filled.write.aliases, ['Priya R.']);
  /* A KEPT ROW WITH NO ADDRESS takes the folded one's, which is what the two were matched on, so the next mail finds one person. */
  const bare = foldFill(fields, { id: 'a', fields: { name: PRIYA.name } }, [one], floor);
  assert.equal(bare.write.email, WORK);
  assert.deepEqual(bare.offered.map((o) => o.field), ['org']);
  /* NO FLOOR TO READ offers rather than writes, by the parts the list plays. */
  assert.deepEqual(foldFill(fields, keep, [three], identityFloor(null, fields.at)).offered, [{ field: 'org', value: 'o1', from: 'd' }]);
  sql.close();
});
