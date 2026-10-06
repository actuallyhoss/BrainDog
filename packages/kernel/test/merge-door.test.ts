/**
 * The merge door (`loop/research-audit-17.md` H2, M3, L4): only a decision or the record's own merge folds a row, and
 * only into a standing row of its own list that is not itself or one folded into it. A merge keeps what the two
 * disagreed on, is answered whole, and undoes back to one consistent state even after a later merge moved things on:
 * keys, links and the fields the merge carried. A restored row never comes back answering to a key another row holds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel, type Met, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const DAY = '2026-10-06';
const OWNER: WriteContext = { actor: 'p_owner' };
const AGENT: WriteContext = { actor: 'claude-code' };

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'aliases', type: 'list', of: 'text' },
      { id: 'job', type: 'text', label: 'Job' },
      { id: 'site', type: 'url' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
    meets: { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into', aliases: 'aliases' },
  },
};

/** A list whose rows point at people, so a merge has links to move and an undo has links to put back. */
const DEALS: Declaration = {
  id: 'register.deals',
  kind: 'register',
  body: { id: 'deals', name: 'Deals', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'with', type: 'ref', to: 'people' }] },
};

type Refused = { ok: false; refusal: { code: string; at?: string; fix: string } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refused = (r: unknown): Refused['refusal'] => {
  const x = r as Refused | { ok: true };
  assert.equal(x.ok, false, 'the write went through');
  return (x as Refused).refusal;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, PEOPLE, DEALS]));
  return { k, sql };
}

const keys = (sql: NodeSql) =>
  Object.fromEntries(sql.all<{ key: string; row_id: string }>('SELECT key, row_id FROM entity_key ORDER BY key').map((r) => [r.key, r.row_id]));

/** The owner accepting "are these one person?": `fold` folded into `keep`, with the carry the record would draw. */
function merge(k: Kernel, fold: Entry, keep: Entry, carry?: Record<string, unknown>, rows?: number[]) {
  const now = k.get(fold.id, { includeDeleted: true })!;
  const kept = k.get(keep.id, { includeDeleted: true })!;
  const made = value<{ id: string }>(
    k.propose(
      {
        question: 'Are these one person?',
        body_kind: 'rowset',
        body: {
          register: 'people',
          rows: [
            { at: k.nameOf(now.id), version: now.version, patch: { merged_into: k.nameOf(kept.id), deleted_at: new Date(NOW).toISOString() } },
            ...(carry === undefined ? [] : [{ at: k.nameOf(kept.id), version: kept.version, patch: carry }]),
          ],
        },
      },
      'p_owner',
    ),
  );
  return k.decide(made.id, { decide: { option: 'accept', reason: 'the same person', ...(rows === undefined ? {} : { rows }) } }, 'p_owner');
}

test('ONLY A DECISION FOLDS A ROW: a plain write that sets merged_into, or deletes or restores a folded row, is refused', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));
  const twin = value<Entry>(k.create('people', { name: 'A. Lovelace', email: 'al@example.com' }, OWNER));

  for (const into of [ada.id, 'people#1']) {
    const no = refused(k.update('people', twin.id, { merged_into: into }, OWNER));
    assert.equal(no.code, 'FORBIDDEN');
    assert.equal(no.at, 'merged_into');
    assert.match(no.fix, /^A\. Lovelace is merged into another only by an accepted merge/);
  }
  /* Nor folded and deleted in one patch, and never by a key's agent either. */
  assert.equal(refused(k.update('people', twin.id, { merged_into: ada.id, deleted_at: new Date(NOW).toISOString() } as never, AGENT)).code, 'FORBIDDEN');
  /* Nor made folded. */
  assert.equal(refused(k.create('people', { name: 'Ada again', merged_into: ada.id }, OWNER)).at, 'merged_into');
  assert.equal(k.get(twin.id)?.fields.merged_into, undefined);
  assert.equal(keys(sql)['email:al@example.com'], twin.id, 'a refused fold moved a key');

  value(merge(k, twin, ada));
  assert.equal(keys(sql)['email:al@example.com'], ada.id);

  /* A folded row comes back only by undoing the merge, and is not unfolded by hand. */
  const back = refused(k.update('people', twin.id, { deleted_at: null } as never, OWNER));
  assert.equal(back.code, 'FORBIDDEN');
  assert.equal(back.at, 'deleted_at');
  assert.match(back.fix, /A\. Lovelace was merged into Ada Lovelace\. Undo the merge/);
  assert.equal(refused(k.update('people', twin.id, { merged_into: null }, OWNER)).fix, 'A. Lovelace comes apart from Ada Lovelace only by undoing the merge.');
  /* Sending back what it already holds changes nothing, and passes. */
  value(k.update('people', twin.id, { merged_into: ada.id }, OWNER));

  value(k.undoMerge(twin.id, OWNER));
  assert.equal(k.get(twin.id)?.deleted_at, null);
  assert.equal(keys(sql)['email:al@example.com'], twin.id);
  sql.close();
});

test('A FOLD LANDS ON A ROW THAT CAN TAKE IT: not itself, not deleted, not another list, not one folded into it', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace' }, OWNER));
  const bo = value<Entry>(k.create('people', { name: 'Bo Chen' }, OWNER));
  const cy = value<Entry>(k.create('people', { name: 'Cy Twombly' }, OWNER));
  const project = value<Entry>(k.create('things', { name: 'BrainDog' }, OWNER));

  assert.match(refused(merge(k, ada, ada)).fix, /^Ada Lovelace cannot be merged into itself/);

  value(k.update('people', cy.id, { deleted_at: new Date(NOW).toISOString() } as never, OWNER));
  assert.equal(refused(merge(k, ada, cy)).code, 'VALUE_MALFORMED');
  /* By its row id, past the spoken id's own check. */
  const byId = value<{ id: string }>(
    k.propose(
      { question: 'Fold Ada into Cy?', body_kind: 'rowset', body: { register: 'people', rows: [{ at: 'people#1', version: ada.version, patch: { merged_into: cy.id } }] } },
      'p_owner',
    ),
  );
  assert.match(refused(k.decide(byId.id, { decide: { option: 'accept', reason: 'x' } }, 'p_owner')).fix, /^Cy Twombly was deleted/);

  /* A row id of another list passes as an id, and is still not a person. */
  const elsewhere = value<{ id: string }>(
    k.propose(
      { question: 'Fold Ada into a project?', body_kind: 'rowset', body: { register: 'people', rows: [{ at: 'people#1', version: ada.version, patch: { merged_into: project.id } }] } },
      'p_owner',
    ),
  );
  assert.equal(refused(k.decide(elsewhere.id, { decide: { option: 'accept', reason: 'x' } }, 'p_owner')).code, 'REF_REGISTER_MISMATCH');

  /* A loop written by hand past the door is not closed by a decision. */
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.merged_into', ?) WHERE id = ?", bo.id, ada.id);
  const circle = refused(merge(k, bo, ada));
  assert.match(circle.fix, /^Ada Lovelace was merged into Bo Chen, so merging back the other way would go round in a circle/);
  /* And a row folded already is not a place to fold into: its survivor is. */
  const dee = value<Entry>(k.create('people', { name: 'Dee Rao' }, OWNER));
  assert.match(refused(merge(k, dee, ada)).fix, /^Ada Lovelace was itself merged into Bo Chen\. Merge into that one/);

  assert.equal(k.count('people'), 3, 'a refused merge took a row out');
  sql.close();
});

test('A MERGE KEEPS WHAT THE TWO DISAGREED ON: the kept row wins, the other name is an alias, the rest a dated line', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', job: 'Engineer', site: 'https://ada.dev', met: ['2026-09-01 · commit 1 in braindog'] }, OWNER));
  const aug = value<Entry>(k.create('people', { name: 'Augusta Ada King', job: 'Countess of Lovelace', site: 'https://ada.dev' }, OWNER));

  value(merge(k, aug, ada));
  const kept = k.get(ada.id)!;
  assert.equal(kept.fields.name, 'Ada Lovelace');
  assert.equal(kept.fields.job, 'Engineer');
  assert.deepEqual(kept.fields.aliases, ['Augusta Ada King']);
  assert.deepEqual(kept.fields.met, ['2026-09-01 · commit 1 in braindog', `${DAY} · Job: Countess of Lovelace, from Augusta Ada King`]);

  /* The undo takes the carried lines back with the rest. */
  value(k.undoMerge(aug.id, OWNER));
  const after = k.get(ada.id)!;
  assert.equal(after.fields.aliases, undefined);
  assert.deepEqual(after.fields.met, ['2026-09-01 · commit 1 in braindog']);
  assert.equal(k.get(aug.id)?.fields.job, 'Countess of Lovelace');
  sql.close();
});

test('A STRONG MERGE KEEPS WHAT THE TWO DISAGREED ON TOO, in the batch its Undo takes back', async () => {
  const { k, sql } = await record();
  const first = value<Entry>(k.create('people', { name: 'Rohan Mehta', email: 'rohanm@encore.example', job: 'CTO' }, OWNER));
  value(k.create('people', { name: 'Rohan Mehta', email: 'rohanm@brightloom.com', job: 'Founder' }, OWNER));

  const met = value<Met>(k.meet({ name: 'Rohan Mehta', email: 'rohanm@brightloom.com', where: 'commit 1 in encore' }, AGENT));
  /* Found by its address, then folded into the older Rohan by the strong rules. */
  assert.ok(met.undo, 'the strong rules did not merge them');
  assert.equal(met.row?.id, first.id);
  const kept = k.get(first.id)!;
  assert.equal(kept.fields.job, 'CTO');
  assert.ok((kept.fields.met as string[]).includes(`${DAY} · Job: Founder, from Rohan Mehta`));
  assert.equal(Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE batch = ? AND field = 'met'", met.undo!)?.n) > 0, true);

  value(k.undoMerge(met.undo!, OWNER));
  assert.ok(!((k.get(first.id)!.fields.met as string[] | undefined) ?? []).some((l) => l.includes('Founder')), 'the undo left the carried line');
  sql.close();
});

test('A MERGE IS ANSWERED WHOLE: a pick of the fold without the carry, or the carry without the fold, is refused', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace' }, OWNER));
  const al = value<Entry>(k.create('people', { name: 'A. Lovelace', handles: ['github:al'] }, OWNER));
  const carry = { handles: ['github:al'], aliases: ['A. Lovelace'] };

  for (const rows of [[0], [1]]) {
    const no = refused(merge(k, al, ada, carry, rows));
    assert.equal(no.code, 'VALUE_MALFORMED');
    assert.equal(no.at, 'rows');
    assert.match(no.fix, /^A merge is answered whole/);
  }
  /* The same merge spelled two ways, the kept one by id in the fold and by its number at the carry, is still one. */
  const mixed = value<{ id: string }>(
    k.propose(
      {
        question: 'Are these one person?',
        body_kind: 'rowset',
        body: {
          register: 'people',
          rows: [
            { at: k.nameOf(al.id), version: al.version, patch: { merged_into: ada.id, deleted_at: new Date(NOW).toISOString() } },
            { at: k.nameOf(ada.id), version: ada.version, patch: carry },
          ],
        },
      },
      'p_owner',
    ),
  );
  assert.equal(refused(k.decide(mixed.id, { decide: { option: 'accept', reason: 'x', rows: [0] } }, 'p_owner')).at, 'rows');
  value(k.decide(mixed.id, { decide: { option: 'reject', reason: 'asked twice' } }, 'p_owner'));
  assert.equal(k.get(al.id)?.deleted_at, null, 'a refused pick folded the row');
  assert.equal(k.get(ada.id)?.fields.handles, undefined, 'a refused pick carried onto the kept row');

  /* Both rows picked is the whole merge. */
  value(merge(k, al, ada, carry, [0, 1]));
  assert.deepEqual(k.get(ada.id)?.fields.handles, ['github:al']);
  assert.ok(k.get(al.id, { includeDeleted: true })?.deleted_at);
  sql.close();
});

test('UNDO AFTER A LATER MERGE: keys, links and what was carried come back from the end of the chain', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@x.io' }, OWNER));
  const bo = value<Entry>(k.create('people', { name: 'Ada L', email: 'ada@work.io' }, OWNER));
  const cy = value<Entry>(k.create('people', { name: 'Ada King', email: 'ada@king.io' }, OWNER));
  const deal = value<Entry>(k.create('deals', { what: 'The engine', with: ada.id }, OWNER));

  /* Ada into Bo, carrying her address as a key and her name as an alias; then Bo into Cy, carrying all of it on. */
  value(merge(k, ada, bo, { handles: ['email:ada@x.io'], aliases: ['Ada Lovelace'] }));
  assert.equal(k.get(deal.id)?.fields.with, bo.id);
  const bo2 = k.get(bo.id)!;
  value(merge(k, bo2, cy, { handles: ['email:ada@x.io', 'email:ada@work.io'], aliases: ['Ada Lovelace', 'Ada L'] }));
  assert.equal(k.get(deal.id)?.fields.with, cy.id);
  assert.deepEqual(keys(sql), { 'email:ada@king.io': cy.id, 'email:ada@work.io': cy.id, 'email:ada@x.io': cy.id });

  /* Undo the first: Ada stands again, answering to her own address, which Cy no longer carries. */
  const undone = value<{ restored: string[] }>(k.undoMerge(ada.id, OWNER));
  assert.deepEqual(undone.restored, ['Ada Lovelace']);
  const back = k.get(ada.id)!;
  assert.equal(back.deleted_at, null);
  assert.equal(back.fields.merged_into, undefined);
  assert.deepEqual(keys(sql), { 'email:ada@king.io': cy.id, 'email:ada@work.io': cy.id, 'email:ada@x.io': ada.id });
  /* The link that left her comes back to her, not to the row it last pointed at. */
  assert.equal(k.get(deal.id)?.fields.with, ada.id);
  /* And what her merge carried, Cy gives back, keeping what Bo's own merge brought. */
  const kept = k.get(cy.id)!;
  assert.deepEqual(kept.fields.handles, ['email:ada@work.io']);
  assert.deepEqual(kept.fields.aliases, ['Ada L']);
  /* Bo is still folded into Cy. */
  assert.equal(k.get(bo.id, { includeDeleted: true })?.fields.merged_into, cy.id);
  sql.close();
});

test('A RESTORED ROW IS NOT A GHOST: one whose key another row took since is refused, naming who has it', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', handles: ['github:ada'] }, OWNER));
  value(k.update('people', ada.id, { deleted_at: new Date(NOW).toISOString() } as never, OWNER));
  const again = value<Entry>(k.create('people', { name: 'Ada L', handles: ['github:ada'] }, OWNER));
  assert.equal(keys(sql)['github:ada'], again.id);

  const no = refused(k.update('people', ada.id, { deleted_at: null } as never, OWNER));
  assert.equal(no.code, 'ALREADY_KNOWN');
  assert.match(no.fix, /^Ada L now has ada on github\. Merge the two, or take it off Ada Lovelace before bringing it back\.$/);
  assert.ok(k.get(ada.id, { includeDeleted: true })?.deleted_at);

  /* With the key free again, it comes back. */
  value(k.update('people', again.id, { handles: null }, OWNER));
  value(k.update('people', ada.id, { deleted_at: null } as never, OWNER));
  assert.equal(keys(sql)['github:ada'], ada.id);
  sql.close();
});
