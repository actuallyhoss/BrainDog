/**
 * Writes held to the row (sharing plan §2.6, Slice 4): §4.4's P4 for writes and P5, on the leak matrix's record.
 *
 * P4: A WRITE ABOUT A ROW OUT OF SIGHT IS REFUSED EXACTLY AS ONE ABOUT A ROW THAT IS NOT THERE, by every caller, on
 * every write that names a row: update (an edit, a delete, a move), log, makePrivate, a proposal's rowset, a comment, and
 * the MCP's update and log. The two answers are compared whole, with only the row's own name and number masked.
 *
 * P5: RANDOM GRANTEE WRITES are either refused or keep both images inside the writer's predicate, and a writer whose
 * predicate on the list is conditional leaves its gate fields as they were. The predicate is the fixture's own truth
 * (`Shape.sees` and the private rows), read off the stored row, never the record's answer. Drawn from a seeded
 * `mulberry32`, `WRITE_FUZZ` cases per shape (200 by default).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import type { CallContext } from '../src/index.ts';
import { mulberry32 } from './leak/canary.ts';
import { build, NOW, personCtx, SAM, type Caller, type Fixture, type RowInfo, type Shape } from './leak/fixture.ts';
import { ask, handlers } from './leak/routes.ts';
import { callTool } from './leak/mcp.ts';

const FUZZ = Number(process.env.WRITE_FUZZ ?? 200);

/** An answer as a string, with a row's names (`tasks#4`, `TK4`) masked, so a hidden row and a missing one compare. */
const masked = (answer: unknown, names: readonly string[]): string => {
  /* A JSON-RPC reply carries its own request number, which is the transport's and says nothing about the row. */
  let s = JSON.stringify(answer).replace(/^\{"jsonrpc":"2.0","id":[0-9]+/u, '{"jsonrpc":"2.0","id":0');
  for (const n of names) s = s.replace(new RegExp(`${n.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![0-9])`, 'gu'), '<row>');
  return s;
};

/** The same row's names with a number nobody holds. */
const missingOf = (name: string): string => name.replace(/[0-9]+$/u, '999');

/* ── P4 ─────────────────────────────────────────────────────────────────── */

test('P4 every write about a row out of sight is refused exactly as one about a row that is not there', async () => {
  const f = await build();
  const h = handlers(f);
  const unlike: string[] = [];
  const when = new Date(NOW).toISOString();
  for (const c of f.callers)
    for (const r of [...f.rows.values()].filter((x) => !f.visible(c, x))) {
      const ref = `${r.list}#${r.seq}`;
      const spoken = f.spoken(r);
      const gone = { ref: missingOf(ref), spoken: missingOf(spoken), seq: 999 };
      const pair = async (what: string, run: (row: { ref: string; spoken: string; seq: number }) => Promise<unknown>) => {
        const hidden = masked(await run({ ref, spoken, seq: r.seq }), [ref, spoken, `${r.list} #${r.seq}`]);
        const none = masked(await run(gone), [gone.ref, gone.spoken, `${r.list} #999`]);
        if (hidden !== none) unlike.push(`${c.label} ${what} ${r.canary.label}:\n    hidden  ${hidden.slice(0, 220)}\n    missing ${none.slice(0, 220)}`);
      };
      await pair('update', (x) => ask(h, 'update', { register: r.list, seq: x.seq, patch: { notes: 'mine now' } }, c.ctx));
      await pair('delete', (x) => ask(h, 'update', { register: r.list, seq: x.seq, patch: { deleted_at: when } }, c.ctx));
      await pair('move', (x) => ask(h, 'update', { register: r.list, seq: x.seq, patch: { thing: f.built.ids.kiln } }, c.ctx));
      await pair('log', (x) => ask(h, 'log', { register: r.list, seq: x.seq, note: 'Seen.' }, c.ctx));
      await pair('makePrivate', (x) => f.api.makePrivate({ ref: x.ref }, c.ctx));
      await pair('propose', (x) =>
        ask(h, 'propose', { question: 'Close this?', body_kind: 'rowset', body: { register: r.list, rows: [{ at: x.ref, version: 1, patch: { notes: 'closed' } }] } }, c.ctx),
      );
      await pair('comment', (x) => ask(h, 'comment', { on: x.spoken, body: 'A word on this.' }, c.ctx));
      await pair('mcp update', (x) => callTool(f, 'update', { spoken: x.spoken, patch: { notes: 'mine now' } }, c.ctx));
      await pair('mcp log', (x) => callTool(f, 'log', { spoken: x.spoken, note: 'Seen.' }, c.ctx));
    }
  assert.deepEqual(unlike.slice(0, 8), [], `${unlike.length} refusal(s) told a hidden row from a missing one`);
});

test("P4 an update to another member's private row is the missing-row refusal, byte for byte but the number", async () => {
  const f = await build();
  const h = handlers(f);
  const own = f.rows.get('t-sam-kiln')!;
  const hidden = await ask(h, 'update', { register: 'tasks', seq: own.seq, patch: { notes: 'seen' } }, f.owner);
  const none = await ask(h, 'update', { register: 'tasks', seq: 999, patch: { notes: 'seen' } }, f.owner);
  assert.equal(JSON.stringify(hidden).replace(`tasks#${own.seq}`, 'tasks#999'), JSON.stringify(none));
  assert.equal((hidden as { ok: boolean }).ok, false);
  /* AND SAM, WHO MADE IT, STILL WRITES IT. */
  assert.ok(((await ask(h, 'update', { register: 'tasks', seq: own.seq, patch: { notes: 'mine' } }, f.sam())) as { ok: boolean }).ok);
});

/* ── what the post-image and the gate fields say ───────────────────────── */

test('a narrowed writer is told why a write that leaves her rule is undone, and the row is as it was', async () => {
  const f = await build();
  const h = handlers(f);
  const contractor = f.callers.find((c) => c.shape.id === 'contractor' && c.variant === 'person')!.ctx;
  const held = f.api.kernel.count('tasks');
  const made = (await ask(h, 'create', { register: 'tasks', fields: { name: 'On Loom', thing: f.built.ids.loom } }, contractor)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(made.ok, false);
  assert.equal(made.refusal?.code, 'FORBIDDEN');
  assert.match(made.refusal!.fix, /outside what you can edit\. Ask the owner\.$/u);
  /* NOTHING WAS WRITTEN: no row, and no number spent on it. */
  assert.equal(f.api.kernel.count('tasks', { field: 'name', is: 'On Loom' } as never), 0);
  const inside = (await ask(h, 'create', { register: 'tasks', fields: { name: 'On Kiln', thing: f.built.ids.kiln } }, contractor)) as { ok: boolean; value?: { seq: number } };
  assert.ok(inside.ok, JSON.stringify(inside));
  assert.equal(inside.value?.seq, held + 1);

  /* A GATE FIELD: the contractor may not move a Kiln task, and is told who may. */
  const kiln = f.rows.get('t-kiln-todo')!;
  const moved = (await ask(h, 'update', { register: 'tasks', seq: kiln.seq, patch: { thing: f.built.ids.loom } }, contractor)) as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(moved.ok, false);
  assert.deepEqual(moved.refusal, { code: 'FORBIDDEN', fix: 'Only the owner or an Admin can change Project on a shared task.', at: 'thing' });
  /* AND THE PROJECT SENT BACK AS IT IS IS NO CHANGE. */
  assert.ok(((await ask(h, 'update', { register: 'tasks', seq: kiln.seq, patch: { thing: f.built.ids.kiln, notes: 'glazed' } }, contractor)) as { ok: boolean }).ok);
  /* A WHOLE-LIST WRITER MOVES IT. */
  assert.ok(((await ask(h, 'update', { register: 'tasks', seq: kiln.seq, patch: { thing: f.built.ids.loom } }, f.sam())) as { ok: boolean }).ok);
});

test('the post-image is checked in the kernel: a move out of the rule unwinds with the owner named', async () => {
  const f = await build();
  /* NAMED OWNER, AND A WRITER WHOSE RULE IS ON THE STAGE: moving a task out of Review is a move out of her rule. */
  f.sql.exec("UPDATE person SET name = 'Sam' WHERE id = ?", 'p_ada');
  const kiln = f.rows.get('t-kiln-review')!;
  const rule = { field: 'stage', is: 'review' };
  const out = f.api.kernel.update('tasks', `tasks#${kiln.seq}`, { stage: 'done' } as never, { actor: 'p_x', within: rule as never });
  assert.deepEqual(out, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'That would move it out of what you can edit. Ask Sam.', at: 'patch' } });
  const row = f.api.kernel.get(`tasks#${kiln.seq}`)!;
  assert.equal(row.fields.stage, 'review');
  assert.equal(row.version, 1);
  /* A ROW OUTSIDE IT BEFORE THE WRITE IS ONE THAT IS NOT THERE. */
  const loom = f.rows.get('t-loom-todo')!;
  assert.deepEqual(f.api.kernel.update('tasks', `tasks#${loom.seq}`, { notes: 'x' } as never, { actor: 'p_x', within: rule as never }), {
    ok: false,
    refusal: { code: 'VALUE_MALFORMED', fix: `There is no row tasks#${loom.seq} in tasks.`, at: 'id' },
  });
});

test("a share's narrower write rule holds the write, and the fields any share's condition reads are gate fields", async () => {
  /* LEE VIEWS EVERY TASK AND EDITS KILN'S; RIA VIEWS THE TASKS IN REVIEW, so the stage decides what Ria sees. */
  const lee: Shape = {
    id: 'mixed',
    name: 'Lee',
    person: 'p_lee',
    shares: (b) => [
      { what: { lists: ['tasks'] }, can: 'view' },
      { what: { project: b.ids.kiln, lists: ['tasks'] }, can: 'edit' },
    ],
    sees: (r) => r.list === 'tasks' || r.key === 'kiln',
  };
  const ria: Shape = { id: 'review', name: 'Ria', person: 'p_ria', shares: () => [{ what: { list: 'tasks', where: { field: 'stage', is: 'review' } }, can: 'view' }], sees: (r) => r.list === 'tasks' && r.stage === 'review' };
  const f = await build({ shapes: [lee, ria] });
  const h = handlers(f);
  const ctx = personCtx(f.api, 'p_lee');
  assert.ok(ctx.writes?.tasks, 'the lens hands her a write rule narrower than her read');
  assert.equal(ctx.wheres?.tasks, undefined);
  type Out = { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  const loom = f.rows.get('t-loom-todo')!;
  const kiln = f.rows.get('t-kiln-todo')!;
  /* A LOOM TASK SHE READS IS ONE SHE MAY NOT WRITE, answered as a row that is not there. */
  const edit = (await ask(h, 'update', { register: 'tasks', seq: loom.seq, patch: { notes: 'mine' } }, ctx)) as Out;
  const none = (await ask(h, 'update', { register: 'tasks', seq: 999, patch: { notes: 'mine' } }, ctx)) as Out;
  assert.equal(edit.ok, false);
  assert.equal(JSON.stringify(edit).replaceAll(`TK${loom.seq}`, 'TK999').replaceAll(`tasks#${loom.seq}`, 'tasks#999'), JSON.stringify(none));
  assert.equal(((await ask(h, 'log', { register: 'tasks', seq: loom.seq, note: 'Seen.' }, ctx)) as Out).ok, false);
  /* AN ADD ON LOOM IS UNDONE IN THE KERNEL; ONE ON KILN LANDS. */
  const made = (await ask(h, 'create', { register: 'tasks', fields: { name: 'On Loom', thing: f.built.ids.loom } }, ctx)) as Out;
  assert.equal(made.refusal?.code, 'FORBIDDEN');
  assert.ok(((await ask(h, 'create', { register: 'tasks', fields: { name: 'On Kiln', thing: f.built.ids.kiln } }, ctx)) as Out).ok);
  /* SHE EDITS A KILN TASK, BUT NOT ITS PROJECT (the project share's scope field) NOR ITS STAGE (Ria's condition). */
  assert.ok(((await ask(h, 'update', { register: 'tasks', seq: kiln.seq, patch: { notes: 'glazed' } }, ctx)) as Out).ok);
  const moved = (await ask(h, 'update', { register: 'tasks', seq: kiln.seq, patch: { thing: f.built.ids.loom } }, ctx)) as Out;
  assert.deepEqual(moved.refusal, { code: 'FORBIDDEN', fix: 'Only the owner or an Admin can change Project on a shared task.', at: 'thing' });
  const staged = (await ask(h, 'update', { register: 'tasks', seq: kiln.seq, patch: { stage: 'review' } }, ctx)) as Out;
  assert.equal(staged.refusal?.at, 'stage');
  assert.deepEqual(f.api.kernel.gateFields('tasks'), ['stage', 'thing']);
  /* THE OWNER, WHO WRITES THE WHOLE LIST, IS HELD BY NONE OF IT. */
  assert.ok(((await ask(h, 'update', { register: 'tasks', seq: kiln.seq, patch: { stage: 'review' } }, f.owner)) as Out).ok);
});

test('meet is held to the row: a match outside her rule is never named, and no second person is made under its key', async () => {
  const kept: Shape = {
    id: 'priya-only',
    name: 'Pia',
    person: 'p_pia',
    invite: { registers: { people: 'write' }, wheres: () => ({ people: { field: 'email', is: 'priya@example.com' } }) },
    sees: (r) => r.list === 'people' && r.key === 'priya',
    narrowed: true,
  };
  const f = await build({ shapes: [kept] });
  const ctx = personCtx(f.api, 'p_pia');
  const omar = f.rows.get('omar')!;
  const people = () => f.api.kernel.count('people');
  const before = people();
  const events = () => f.sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')!.n;
  const was = events();
  const out = (await f.api.meet({ name: 'Omar', email: 'omar@example.com', where: 'the studio' } as never, ctx)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.deepEqual({ ok: out.ok, code: out.refusal?.code, fix: out.refusal?.fix }, { ok: false, code: 'FORBIDDEN', fix: "That can't be added here. Ask the owner." });
  assert.ok(!JSON.stringify(out).includes(omar.canary.word) && !JSON.stringify(out).includes(omar.id), 'his name and id are not handed back');
  assert.equal(people(), before, 'no second Omar');
  assert.equal(events(), was, 'nothing is written');
  /* PRIYA, INSIDE HER RULE, IS MET AND NAMED; SOMEBODY NEW IS ADDED. */
  const priya = (await f.api.meet({ email: 'priya@example.com', where: 'the studio' } as never, ctx)) as { ok: boolean; value?: { row: { name: string } | null; created: boolean } };
  assert.ok(priya.ok && priya.value?.row?.name.startsWith('Priya'), JSON.stringify(priya));
  const fresh = (await f.api.meet({ name: 'Nia Brook', email: 'nia@example.com', where: 'the studio' } as never, ctx)) as { ok: boolean; value?: { created: boolean } };
  assert.ok(fresh.ok && fresh.value?.created, JSON.stringify(fresh));
  /* AND THE OWNER, WHO READS EVERYBODY, MEETS OMAR AS BEFORE. */
  const own = (await f.api.meet({ email: 'omar@example.com', where: 'the studio' } as never, f.owner)) as { ok: boolean; value?: { row: { id: string } | null; created: boolean } };
  assert.ok(own.ok && own.value?.created === false && own.value.row !== null, JSON.stringify(own));
});

test("a unique value another row holds out of the writer's sight is refused without naming it", async () => {
  const f = await build();
  const decl = f.api.kernel.register('notes')!;
  okOf(await f.api.kernel.install([{ id: 'register.notes', kind: 'register', body: { ...decl, fields: decl.fields.map((x) => (x.id === 'what' ? { ...x, unique: true } : x)) } } as never]));
  const hidden = f.api.kernel.get(`notes#${f.rows.get('n-sam')!.seq}`)!;
  const open = f.api.kernel.get(`notes#${f.rows.get('n-open')!.seq}`)!;
  /* THE OWNER CANNOT SEE SAM'S PRIVATE NOTE, so the collision names no row. */
  const out = (await f.api.create({ register: 'notes', fields: { what: hidden.fields.what } as never }, f.owner)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.fix, "That can't be added here. Ask the owner.");
  /* ONE SHE CAN SEE IS NAMED, as before. */
  const seen = (await f.api.create({ register: 'notes', fields: { what: open.fields.what } as never }, f.owner)) as { ok: boolean; refusal?: { fix: string } };
  assert.equal(seen.ok, false);
  assert.match(seen.refusal!.fix, /notes#\d+ already has that what/u);
});

test('makePrivate asks who before which row, and only a role holder keeps a row private', async () => {
  const f = await build();
  const contractor = f.callers.find((c) => c.shape.id === 'contractor' && c.variant === 'person')!.ctx;
  const kiln = f.rows.get('t-kiln-todo')!;
  /* A GUEST, INVITED TO ONE LIST, IS REFUSED THE SAME FOR A ROW THERE AND FOR NO ROW. */
  const there = await f.api.makePrivate({ ref: `tasks#${kiln.seq}` }, contractor);
  const none = await f.api.makePrivate({ ref: 'tasks#999' }, contractor);
  assert.deepEqual(there, none);
  assert.equal((there as { refusal: { code: string } }).refusal.code, 'FORBIDDEN');
  /* A REPORT-ONLY KEY IS REFUSED BEFORE ANY ROW IS LOOKED UP. */
  f.sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_report', 'p_ada', 'h_report', 'write', ?, ?)", 'report:{"register":"money"}', new Date(NOW).toISOString());
  const report = { principal: { kind: 'token', id: 't_report', scope: 'write', person: 'p_ada', level: 'owner' } } as unknown as CallContext;
  const a = await f.api.makePrivate({ ref: `tasks#${kiln.seq}` }, report);
  const b = await f.api.makePrivate({ ref: 'tasks#999' }, report);
  assert.deepEqual(a, b);
  assert.match((a as { refusal: { fix: string } }).refusal.fix, /report key/u);
});

/* ── P5 ─────────────────────────────────────────────────────────────────── */

/** The fixture's truth about one stored row, read off the record's tables and not its answers. */
function infoOf(f: Fixture, row: Entry): RowInfo {
  const thing = row.fields.thing === f.built.ids.kiln ? 'kiln' : row.fields.thing === f.built.ids.loom ? 'loom' : null;
  const held = f.sql.one<{ person_id: string }>('SELECT person_id FROM entry_private WHERE entry_id = ?', row.id);
  const stage = row.fields.stage as RowInfo['stage'];
  return {
    key: row.id,
    list: row.register,
    id: row.id,
    seq: row.seq ?? -1,
    thing,
    ...(stage ? { stage } : {}),
    ...(held ? { privateBy: held.person_id } : {}),
    refs: [],
    canary: { label: row.id, word: '' },
    held: [],
  };
}

/** Whether a caller's grant writes this row already there: the shape's sight, less the rows private to somebody else. */
function writes(caller: Caller, info: RowInfo, f: Fixture): boolean {
  if (info.privateBy !== undefined && info.privateBy !== caller.shape.person) return false;
  return caller.shape.sees(info, f.built);
}

/** Whether a caller's grant adds this row: what it writes, and for an appender who reads nothing, any row of its list. */
function adds(caller: Caller, info: RowInfo, f: Fixture): boolean {
  if (caller.shape.id === 'adds') return info.list === 'money' && info.privateBy === undefined;
  return writes(caller, info, f);
}

/** The fields some grant's condition reads on each list, in the fixture: Project and the stage on tasks, and the number. */
const GATES: Record<string, string[]> = { tasks: ['thing', 'stage'] };

const okOf = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: unknown };
  assert.ok(x.ok, JSON.stringify(x));
  return x.value as T;
};

test('P5 random grantee writes are refused, or keep the row inside the writer\'s predicate before and after, and leave the gate fields alone', async () => {
  const f = await build();
  const writers = f.callers.filter((c) => c.shape.id !== 'owner');
  const lists = ['tasks', 'money', 'things', 'notes', 'people'];
  const broken: string[] = [];
  const batches = new Map<string, string[]>();
  const landed = new Map<string, number>();
  const rowsOf = (list: string): Entry[] => {
    const out = f.api.kernel.list({ register: list, includeDeleted: true, limit: 500 } as never);
    return out.ok ? out.value.rows : [];
  };
  const byId = (id: string): Entry | null => f.api.kernel.get(id, { includeDeleted: true });

  for (const shape of f.shapes.filter((s) => s.id !== 'owner')) {
    const rng = mulberry32(0x5eed + shape.id.length * 7919 + shape.id.charCodeAt(0));
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
    const callers = writers.filter((c) => c.shape.id === shape.id);
    for (let i = 0; i < FUZZ; i++) {
      const c = pick(callers);
      const list = pick(lists);
      const rows = rowsOf(list);
      const row = rows.length > 0 ? pick(rows) : null;
      const thing = pick([f.built.ids.kiln, f.built.ids.loom, null]);
      const stage = pick(['todo', 'review', 'done']);
      const op = pick(['create', 'update', 'update', 'delete', 'state', 'link', 'tag', 'log', 'undo', 'propose'] as const);
      const before = row === null || op === 'create' ? null : byId(row.id);
      const title = list === 'money' ? 'payee' : list === 'notes' ? 'what' : 'name';
      let out: { ok: boolean; value?: Record<string, unknown> } | undefined;
      const say = `${c.label} ${op} ${list}${row ? `#${row.seq}` : ''} (case ${i})`;
      try {
        switch (op) {
          case 'create': {
            const fields: Record<string, unknown> = { [title]: `Fuzz ${i}` };
            if (list === 'tasks' || list === 'money' || list === 'notes') if (thing !== null) fields.thing = thing;
            if (list === 'tasks') fields.stage = stage;
            out = (await f.api.create({ register: list, fields: fields as never }, c.ctx)) as typeof out;
            break;
          }
          case 'update':
            if (!row) continue;
            out = (await f.api.update({ register: list, seq: row.seq!, patch: { [title === 'name' && list !== 'tasks' ? 'name' : title]: `Edited ${i}` } as never }, c.ctx)) as typeof out;
            break;
          case 'delete':
            if (!row) continue;
            out = (await f.api.update({ register: list, seq: row.seq!, patch: { deleted_at: row.deleted_at ? null : new Date(NOW).toISOString() } as never }, c.ctx)) as typeof out;
            break;
          case 'state':
            if (!row || list !== 'tasks') continue;
            out = (await f.api.update({ register: list, seq: row.seq!, patch: { stage } as never }, c.ctx)) as typeof out;
            break;
          case 'link':
            if (!row || !['tasks', 'money', 'notes'].includes(list)) continue;
            out = (await f.api.update({ register: list, seq: row.seq!, patch: { thing } as never }, c.ctx)) as typeof out;
            break;
          case 'tag':
            if (!row) continue;
            out = (await f.api.update({ register: list, seq: row.seq!, patch: { tags: [`t${i % 3}`] } as never }, c.ctx)) as typeof out;
            break;
          case 'log':
            if (!row) continue;
            out = (await f.api.log({ register: list, seq: row.seq!, note: `Seen ${i}.` }, c.ctx)) as typeof out;
            break;
          case 'undo': {
            const mine = batches.get(c.label) ?? [];
            if (mine.length === 0) continue;
            const batch = pick(mine);
            const touched = f.sql.all<{ target: string }>("SELECT DISTINCT target FROM event WHERE batch = ? AND target LIKE 'entry:%'", batch).map((t) => byId(t.target.slice(6))).filter((x): x is Entry => x !== null);
            const was = new Map(touched.map((t) => [t.id, t]));
            out = (await f.api.undoOwn({ batch }, c.ctx)) as typeof out;
            if (out?.ok)
              for (const t of was.values()) {
                const now = byId(t.id)!;
                if (!writes(c, infoOf(f, t), f) || !writes(c, infoOf(f, now), f)) broken.push(`${say}: undid a write on a row outside its predicate`);
              }
            continue;
          }
          case 'propose':
            if (!row) continue;
            out = (await f.api.propose({ question: `Close this ${i}?`, body_kind: 'rowset', body: { register: list, rows: [{ at: `${list}#${row.seq}`, version: row.version, patch: { [title]: `Proposed ${i}` } }] } } as never, c.ctx)) as typeof out;
            if (out?.ok && before && !writes(c, infoOf(f, before), f)) broken.push(`${say}: proposed about a row out of its sight`);
            continue;
        }
      } catch (cause) {
        broken.push(`${say} threw ${String((cause as Error)?.message ?? cause)}`);
        continue;
      }
      if (!out?.ok) continue;
      const batch = out.value?.batch;
      if (typeof batch === 'string') batches.set(c.label, [...(batches.get(c.label) ?? []), batch]);
      const id = op === 'create' ? (out.value?.id as string | undefined) : row?.id;
      /* A WRITE ON A ROW TURNED INTO A QUESTION (an agent asking below its rung) wrote no row: nothing to hold. */
      if (out.value?.asked !== undefined || out.value?.suggestion !== undefined || id === undefined) continue;
      const after = byId(id);
      if (after === null) continue;
      if (before !== null && !writes(c, infoOf(f, before), f)) broken.push(`${say}: wrote a row outside its predicate before the write`);
      if (op !== 'log' && !(op === 'create' ? adds : writes)(c, infoOf(f, after), f)) broken.push(`${say}: left the row outside its predicate`);
      landed.set(shape.id, (landed.get(shape.id) ?? 0) + 1);
      const conditional = c.ctx.wheres !== undefined && Object.hasOwn(c.ctx.wheres, list);
      if (conditional && before !== null)
        for (const g of GATES[list] ?? [])
          if (JSON.stringify(before.fields[g] ?? null) !== JSON.stringify(after.fields[g] ?? null)) broken.push(`${say}: changed the gate field ${g}`);
    }
  }
  assert.deepEqual(broken.slice(0, 12), [], `${broken.length} write(s) left the writer's predicate`);
  /* AND IT IS NOT VACUOUS: every shape that writes landed some, the narrowed contractor among them. */
  for (const id of ['contractor', 'assistant', 'maker', 'adds']) assert.ok((landed.get(id) ?? 0) > 0, `${id} landed no write in ${FUZZ} cases`);
});

test('P5 is not vacuous: the narrowed writer and Sam each land writes', async () => {
  const f = await build();
  const contractor = f.callers.find((c) => c.shape.id === 'contractor' && c.variant === 'person')!.ctx;
  const kiln = f.rows.get('t-kiln-todo')!;
  okOf(await f.api.update({ register: 'tasks', seq: kiln.seq, patch: { notes: 'fired' } as never }, contractor));
  okOf(await f.api.log({ register: 'tasks', seq: kiln.seq, note: 'Fired.' }, contractor));
  okOf(await f.api.update({ register: 'tasks', seq: f.rows.get('t-sam-kiln')!.seq, patch: { notes: 'still mine' } as never }, f.sam()));
  assert.equal(SAM, 'p_sam');
});
