/**
 * Add-ons phase 4 on a real self-host: the plan says what an add-on may also do and asks to approve it, and a drawn
 * view's write goes through `drawnAct`, which takes nothing on the frame's word. Every refusal path is proved: an install
 * that leaves the new lines out, an action the block never declared, a block with no actions, an index that is no drawn
 * block, a list outside the add-on's own and its uses, and a reader whose own ladder does not let them write.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDrawnSample } from './addon-sample.ts';
import type { Send } from '../src/actions.ts';
import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF';
const BEA = 'p_01JZ8QK3F7R2M9V4XN6TCB5HB1';

type R = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const said = <T>(r: unknown): T => {
  const x = r as R;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusedWith = (r: unknown, code: string) => {
  const x = r as R;
  assert.equal(x.ok, false, `expected ${code}, it went through`);
  assert.equal(x.refusal?.code, code, x.refusal?.fix);
};

async function stack() {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-drawn-act-'));
  const send: Send = async () => new Response('{}');
  const running = await start({ file: join(dir, 'record.brain'), directory: join(dir, 'directory.sqlite'), port: 0, host: '127.0.0.1', pollMs: 0, actions: { openKey: async () => null, send, resolve: async () => [] } });
  const person = running.directory.person$('ada@example.test', 'Ada');
  assert.ok(person.ok);
  said(await running.api.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } }));
  const owner = { principal: { kind: 'person' as const, id: person.value.id, level: 'owner' as const } };
  running.sql.exec("INSERT INTO person (id, email, name) VALUES (?, 'bea@example.test', 'Bea')", BEA);
  running.sql.exec("INSERT INTO member (person_id, register, level) VALUES (?, '*', 'read')", BEA);
  const reader = { principal: { kind: 'person' as const, id: BEA, level: 'read' as const } };
  return {
    running,
    owner,
    reader,
    rows: (list: string) => running.sql.all<{ id: string }>('SELECT id FROM entry WHERE register = ? AND deleted_at IS NULL', list).length,
    close: async () => {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('THE PLAN SAYS WHAT IT MAY ALSO DO, ASKS TO APPROVE IT, AND REFUSES AN INSTALL THAT LEAVES IT OUT', async () => {
  const s = await stack();
  try {
    const doc = createDrawnSample();
    const plan = said<{ diff: { planHash: string; approve: string[]; may?: { line: string; change: string }[] } }>(await s.running.api.planPack({ doc, source: { kind: 'paste' } } as never, s.owner));
    const lines = (plan.diff.may ?? []).map((m) => m.line);
    assert.ok(lines.includes('Film night may send you notifications, at most 20 a day.'), lines.join(' | '));
    assert.ok(lines.includes("Film night asks Slash's model on your allowance, at most 1 time a run."), lines.join(' | '));
    assert.ok(lines.includes('Its view on Films can add rows to films, as whoever is looking.'), lines.join(' | '));
    for (const l of lines) assert.ok(plan.diff.approve.includes(l), `${l} is not asked to be approved`);
    refusedWith(await s.running.api.installPack({ doc, source: { kind: 'paste' }, planHash: plan.diff.planHash, approve: [] } as never, s.owner), 'REQUIRED_MISSING');
    said(await s.running.api.installPack({ doc, source: { kind: 'paste' }, planHash: plan.diff.planHash, approve: plan.diff.approve } as never, s.owner));
    /* AND THE SAME FILE AGAIN ASKS NOTHING NEW. */
    const again = said<{ diff: { approve: string[]; may?: { change: string }[] } }>(await s.running.api.planPack({ doc, source: { kind: 'paste' } } as never, s.owner));
    assert.deepEqual(again.diff.approve, []);
    assert.ok((again.diff.may ?? []).every((m) => m.change === 'same'));
  } finally {
    await s.close();
  }
});

test('A DRAWN VIEW ADDS A ROW AS THE VIEWER, ONLY AS ITS BLOCK DECLARES', async () => {
  const s = await stack();
  try {
    const doc = createDrawnSample();
    const plan = said<{ diff: { planHash: string; approve: string[] } }>(await s.running.api.planPack({ doc, source: { kind: 'paste' } } as never, s.owner));
    said(await s.running.api.installPack({ doc, source: { kind: 'paste' }, planHash: plan.diff.planHash, approve: plan.diff.approve } as never, s.owner));
    const act = (args: Record<string, unknown>, ctx = s.owner) => s.running.api.drawnAct!(args as never, ctx as never);

    said(await act({ page: 'films', block: 0, create: { list: 'films', fields: { name: 'Dune' } } }));
    assert.equal(s.rows('films'), 1);
    /* AN ACTION THE BLOCK NEVER DECLARED: it says create, not update. */
    refusedWith(await act({ page: 'films', block: 0, update: { ref: 'films#1', patch: { name: 'Dune 2' } } }), 'FORBIDDEN');
    /* A LIST IT NEVER NAMED. */
    refusedWith(await act({ page: 'films', block: 0, create: { list: 'tasks', fields: { title: 'x' } } }), 'FORBIDDEN');
    /* A DRAWN BLOCK WITH NO ACTIONS WRITES NOTHING. */
    refusedWith(await act({ page: 'films', block: 1, create: { list: 'films', fields: { title: 'x' } } }), 'FORBIDDEN');
    /* AN INDEX THAT IS NO DRAWN BLOCK, AND A PAGE THAT IS NOT THERE. */
    refusedWith(await act({ page: 'films', block: 2, create: { list: 'films', fields: { title: 'x' } } }), 'REF_UNKNOWN');
    refusedWith(await act({ page: 'nowhere', block: 0, create: { list: 'films', fields: { title: 'x' } } }), 'REF_UNKNOWN');
    /* BOTH OR NEITHER OF CREATE AND UPDATE, AND A KEY IT DOES NOT TAKE. */
    refusedWith(await act({ page: 'films', block: 0 }), 'VALUE_MALFORMED');
    assert.equal((await act({ page: 'films', block: 0, create: { list: 'films', fields: {} }, sneak: true }) as R).ok, false);
    /* A READER WHOSE LADDER IS READ: the view's write is theirs, and refused as theirs would be. */
    const asReader = (await act({ page: 'films', block: 0, create: { list: 'films', fields: { name: 'Bea' } } }, s.reader as never)) as R;
    assert.equal(asReader.ok, false, 'a read-only reader wrote through a view');
    assert.equal(s.rows('films'), 1);
  } finally {
    await s.close();
  }
});
