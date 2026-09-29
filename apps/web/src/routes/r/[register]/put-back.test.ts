/**
 * A put back pressed once is not pressed again by the toast that offered the same rows.
 *
 * MEASURED ON THE REGISTER SCREEN ON 24 SEPTEMBER. Move three rows to Paid and the toast offers Put back for all three,
 * while each row's own chip offers Put back for itself. Press the chip on row 1 and then the toast: the toast sent
 * row 1's inverse again, at the version the move had answered with, which the chip's put back had already spent. The
 * record said conflict, the row's `Restored` chip was cleared, and the toast then showed a conflict sentence about the
 * reader's own earlier press, as if somebody else had moved the row.
 *
 * THE FAKE BELOW IS THE RECORD'S VERSION RULE AND NOTHING ELSE: a write at the version the row holds lands and moves
 * it on, and a write at any other version is a conflict. That rule is the whole of the defect.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { Entry, Fields } from '../../../lib/record/schema.ts';

/* A NAMESPACE AND NOT A NAMED IMPORT, so a missing export is one failing test rather than a file that will not load. */
import * as back from './put-back.ts';

const SCREEN = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

const row = (seq: number, version: number, state: string): Entry => ({ seq, version, created: '2026-09-24T09:00:00.000Z', by: 'you', fields: { state } });

/** Rows held at a version each, and the one rule the record applies to a write at a version. */
function record(rows: readonly Entry[]) {
  const held = new Map(rows.map((r) => [r.seq, r]));
  return {
    held,
    update(seq: number, patch: Fields, version: number): { ok: true; entry: Entry } | { ok: false; why: 'conflict' } {
      const now = held.get(seq)!;
      if (now.version !== version) return { ok: false, why: 'conflict' };
      const next = { ...now, version: now.version + 1, fields: { ...now.fields, ...patch } };
      held.set(seq, next);
      return { ok: true, entry: next };
    },
  };
}

/** The bulk move the toast is about: every row to `paid`, each change carrying the entry the record answered with. */
function moveAll(r: ReturnType<typeof record>, seqs: readonly number[]): back.Change[] {
  return seqs.map((seq) => {
    const before = r.held.get(seq)!;
    const patch = { state: 'paid' };
    const out = r.update(seq, patch, before.version);
    assert.ok(out.ok);
    return { before, patch, answered: out.entry };
  });
}

/** What the screen's `putBack` does with the changes a press hands it, against the fake: the conflicts it met. */
function press(r: ReturnType<typeof record>, spent: back.Spent, changes: readonly back.Change[]): number[] {
  const conflicts: number[] = [];
  for (const c of spent.take(changes)) {
    const out = r.update(c.before.seq, { state: String(c.before.fields.state) }, c.answered.version);
    spent.answered(c, out);
    if (!out.ok) conflicts.push(c.before.seq);
  }
  return conflicts;
}

test('the toast leaves out a row whose own chip has already put it back', () => {
  assert.equal(typeof back.spentPutBacks, 'function', 'put-back.ts exports no spentPutBacks');
  const r = record([row(1, 4, 'open'), row(2, 9, 'open'), row(3, 2, 'open')]);
  const changed = moveAll(r, [1, 2, 3]);
  const spent = back.spentPutBacks();
  /* THE CHIP ON ROW 1 BUILDS ITS OWN CHANGE, from the same answered entry the toast holds, as `putBackOf` does. */
  assert.deepEqual(press(r, spent, [{ ...changed[0]! }]), []);
  assert.deepEqual(press(r, spent, changed), [], 'the toast wrote row 1 a second time, at a spent version');
  assert.deepEqual([...r.held.values()].map((e) => e.fields.state), ['open', 'open', 'open']);
});

test('a second press of the same toast writes nothing', () => {
  const r = record([row(1, 4, 'open'), row(2, 9, 'open')]);
  const changed = moveAll(r, [1, 2]);
  const spent = back.spentPutBacks();
  assert.deepEqual(press(r, spent, changed), []);
  assert.deepEqual(spent.take(changed), []);
});

test('a put back that never reached the record is still owed, and one somebody else overtook is not', () => {
  const r = record([row(1, 4, 'open'), row(2, 9, 'open')]);
  const [one, two] = moveAll(r, [1, 2]) as [back.Change, back.Change];
  const spent = back.spentPutBacks();
  /* A DROPPED CONNECTION DID NOT MOVE THE ROW, so the chip comes back with its Put back and that press must still write. */
  assert.deepEqual(spent.take([one]), [one]);
  spent.answered(one, { ok: false, why: 'unreachable' });
  assert.deepEqual(spent.take([one, two]), [one, two]);
  /* A CONFLICT MEANS SOMEBODY ELSE MOVED IT, and the inverse would now write over them, so it is not offered again. */
  spent.answered(two, { ok: false, why: 'conflict' });
  assert.deepEqual(spent.take([two]), []);
});

test("the record's raw conflict reaches a put back as a conflict, so the change is spent", async () => {
  /* MEASURED RATHER THAN READ. `rows-write.ts` `failed` has a line mapping a raw `conflict`
     answer to `why: 'refused'`, which this file would treat as still owed. That line is reached only when `seq` is
     null, which is a create; an update has a number, so `stale` is already true and the answer is `conflict`. This
     drives the real writer with the record's own 409 body, twice: once carrying the row as it now stands and once
     carrying nothing, which makes the writer read the row again. */
  const { rowWriter } = await import('../../../lib/record/rows-write.ts');
  const current = { id: '01JROW0000000000000000000', register: 'notes', seq: 1, fields: { state: 'paid' }, state: null, version: 9, created_at: '2026-09-24T09:00:00.000Z', updated_at: '2026-09-24T09:00:00.000Z', deleted_at: null };
  for (const carried of [current, null]) {
    const io = (async (url: string | URL | Request) => {
      const at = new URL(String(url));
      const body = at.pathname === '/api/get' ? { ok: true, value: current } : at.pathname === '/api/list' ? { ok: true, value: { rows: [], cursor: null, matched: 0 } } : { ok: false, conflict: { version: 9, current: carried, actor: 'p_2' } };
      return new Response(JSON.stringify(body), { status: at.pathname === '/api/update' ? 409 : 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const out = await rowWriter('http://record.test', io).update('notes', 1, { state: 'open' }, 5);
    assert.equal(out.ok ? 'ok' : out.why, 'conflict', `a raw conflict carrying ${carried ? 'a row' : 'nothing'} answered ${JSON.stringify(out)}`);
    const spent = back.spentPutBacks();
    const change: back.Change = { before: row(1, 4, 'open'), patch: { state: 'paid' }, answered: row(1, 5, 'paid') };
    assert.deepEqual(spent.take([change]), [change]);
    spent.answered(change, out);
    assert.deepEqual(spent.take([change]), [], 'a put back the record answered conflict is offered again');
  }
});

test("the screen's put back asks what is still owed before it writes", () => {
  const body = SCREEN.slice(SCREEN.indexOf('async function putBack('), SCREEN.indexOf('async function restoreOnRecord('));
  assert.ok(body.length > 100, 'putBack was not found on the register screen, so this sweep proves nothing');
  const take = body.indexOf('.take(');
  assert.ok(take > 0, 'putBack writes every change it is handed, including rows already put back');
  assert.ok(take < body.indexOf('writes()'), 'putBack writes before it has left out the rows already put back');
  assert.match(body, /\.answered\(/u, 'putBack never says how a write answered, so a dropped connection loses its Put back');
});
