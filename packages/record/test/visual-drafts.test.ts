/**
 * A visual's drafts at the record (DIRECTION §45, scope C15 to C17): a version handed in as a draft waits beside the kept
 * one and never replaces it in `visuals`; a person keeps it, throws it away, or asks the run that drew it to try again,
 * which that run's next `context` carries; and an undo puts a draft back as it was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type Context } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refused = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as Out;
  assert.equal(x.ok, false, `expected a refusal, got ${JSON.stringify(x.value)?.slice(0, 200)}`);
  return x.refusal!;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' }, credentialed: true };
const agent = (client = 'c-draw'): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'portage', agent: 'claude', client_id: client },
});

/** A page store in memory, with no pictures: these pages name none. */
function store() {
  const pages = new Map<string, Uint8Array>();
  return {
    putPage: async (hash: string, bytes: Uint8Array) => void pages.set(hash, Uint8Array.from(bytes)),
    getPage: async (hash: string) => pages.get(hash) ?? null,
    file: async () => null,
  };
}

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW + 60_000), visuals: store() });
  value(await installSeed(api.kernel));
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_seed', 'teo@vance-studio.example', 'Teodor')");
  const task = api.kernel.nameOf(value<{ id: string }>(await api.create({ register: 'tasks', fields: { what: 'Plan the launch week' } }, owner)).id)!;
  return { sql, api, task };
}

type Attached = { visual: string; version: number; batch: string | null; said: string; draft?: true };
type Listed = { id: string; version: number; kept: boolean; draft: { version: number; by: string } | null };
type Read = { version: number; kept: number | null; draft: number | null; page: string; versions: { version: number; draft: boolean }[] };

test('A DRAFT NEVER REPLACES THE KEPT VERSION in visuals: it waits beside it, marked, and the receipt says draft', async () => {
  const { api, task, sql } = await record();
  const drew = agent();
  const one = value<Attached>(await api.attachVisual({ on: task, page: '<h1>Week one</h1>', title: 'Launch week', draft: false }, drew));
  const two = value<Attached>(await api.attachVisual({ on: task, page: '<h1>Week one, tighter</h1>', title: 'Launch week', draft: true }, drew));
  assert.equal(two.draft, true);
  assert.match(two.said, /waits on .* as a draft/u);
  const [held] = value<{ visuals: Listed[] }>(await api.visuals({ on: task }, owner)).visuals;
  assert.deepEqual([held!.version, held!.kept, held!.draft?.version], [1, true, 2], 'it stands at version 1, with version 2 waiting');
  const read = value<Read>(await api.visual({ id: one.visual }, owner));
  assert.deepEqual([read.version, read.kept, read.draft, read.page], [2, 1, 2, '<h1>Week one, tighter</h1>'], 'opened, the draft is what shows');
  assert.deepEqual(read.versions.map((v) => v.draft), [false, true]);
  /* THE SAME DRAFT AGAIN WRITES NOTHING, and draft must be a yes or a no. */
  assert.equal(value<{ unchanged?: true }>(await api.attachVisual({ on: task, page: '<h1>Week one, tighter</h1>', title: 'Launch week', draft: true }, drew)).unchanged, true);
  assert.equal(refused(await api.attachVisual({ on: task, page: '<h1>x</h1>', title: 'Launch week', draft: 'yes' as never }, drew)).at, 'draft');
  sql.close();
});

test('KEEP MAKES IT STAND AT THE DRAFT, THROW AWAY LEAVES THE KEPT ONE, and only a person settles a draft', async () => {
  const { api, task, sql } = await record();
  const drew = agent();
  const one = value<Attached>(await api.attachVisual({ on: task, page: '<h1>A</h1>', title: 'Launch week', draft: false }, drew));
  value(await api.attachVisual({ on: task, page: '<h1>B</h1>', title: 'Launch week', draft: true }, drew));
  assert.equal(refused(await api.settleVisual({ id: one.visual, version: 2, as: 'keep' }, drew)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refused(await api.settleVisual({ id: one.visual, version: 1, as: 'keep' }, owner)).code, 'TRANSITION_ILLEGAL', 'version 1 is no draft');
  assert.equal(refused(await api.settleVisual({ id: one.visual, version: 2, as: 'maybe' as never }, owner)).code, 'ENUM_VALUE_UNKNOWN');

  const kept = value<{ kept: number; said: string; batch: string }>(await api.settleVisual({ id: one.visual, version: 2, as: 'keep' }, owner));
  assert.deepEqual([kept.kept, kept.said], [2, 'Kept version 2 of "Launch week".']);
  let [held] = value<{ visuals: Listed[] }>(await api.visuals({ on: task }, owner)).visuals;
  assert.deepEqual([held!.version, held!.draft], [2, null]);
  assert.equal(refused(await api.settleVisual({ id: one.visual, version: 2, as: 'keep' }, owner)).code, 'TRANSITION_ILLEGAL', 'kept once');

  value(await api.attachVisual({ on: task, page: '<h1>C</h1>', title: 'Launch week', draft: true }, drew));
  const thrown = value<{ kept: number; said: string; batch: string }>(await api.settleVisual({ id: one.visual, version: 3, as: 'throw' }, owner));
  assert.equal(thrown.said, 'Threw away version 3 of "Launch week". It stands at version 2.');
  [held] = value<{ visuals: Listed[] }>(await api.visuals({ on: task }, owner)).visuals;
  assert.deepEqual([held!.version, held!.draft], [2, null]);
  const read = value<Read>(await api.visual({ id: one.visual }, owner));
  assert.deepEqual(read.versions.map((v) => v.draft), [false, false, true], 'the thrown one stays in its history, marked');

  /* AND AN UNDO OF THE THROW AWAY PUTS THE DRAFT BACK TO WAIT. */
  const plan = value<{ hash: string; lines: string[] }>(await api.undo({ batch: thrown.batch, dry: true }, owner));
  assert.deepEqual(plan.lines, ['Puts the draft of the visual "Launch week" back.']);
  value(await api.undo({ batch: thrown.batch, hash: plan.hash }, owner));
  [held] = value<{ visuals: Listed[] }>(await api.visuals({ on: task }, owner)).visuals;
  assert.deepEqual([held!.version, held!.draft?.version], [2, 3]);
  sql.close();
});

test('A FIRST VERSION AS A DRAFT is listed by it, unkept, and undoing the write that drew it takes it away', async () => {
  const { api, task, sql } = await record();
  const drew = agent();
  const one = value<Attached>(await api.attachVisual({ on: task, page: '<h1>Only</h1>', title: 'Launch week', draft: true }, drew));
  const [held] = value<{ visuals: Listed[] }>(await api.visuals({ on: task }, owner)).visuals;
  assert.deepEqual([held!.version, held!.kept, held!.draft?.version], [1, false, 1]);
  value(await api.undoOwn({ batch: one.batch! }, drew));
  assert.deepEqual(value<{ visuals: Listed[] }>(await api.visuals({ on: task }, owner)).visuals, []);
  sql.close();
});

test('TRY AGAIN THROWS THE DRAFT AWAY AND ASKS THE RUN THAT DREW IT, whose next context carries "Draw ... again"', async () => {
  const { api, task, sql } = await record();
  const drew = agent();
  const run = value<{ spoken: string }>(await api.attach({ source: 'startup', doing: 'Drawing the week' }, drew)).spoken;
  const one = value<Attached>(await api.attachVisual({ on: task, page: '<h1>A</h1>', title: 'Launch week', draft: false }, drew));
  value(await api.attachVisual({ on: task, page: '<h1>B</h1>', title: 'Launch week', draft: true }, drew));

  const again = value<{ said: string; told: string; kept: number }>(await api.settleVisual({ id: one.visual, version: 2, as: 'again' }, owner));
  assert.equal(again.said, `Asked ${run} to draw "Launch week" again. The new version comes as a draft.`);
  assert.equal(again.kept, 1);
  const [held] = value<{ visuals: Listed[] }>(await api.visuals({ on: task }, owner)).visuals;
  assert.equal(held!.draft, null, 'the draft is thrown away');

  const context = value<Context>(await api.context({}, drew));
  const line = context.told?.find((i) => i.id === again.told)?.line ?? '';
  assert.match(line, /Draw "Launch week" again: version 2 on .* was not it\. Hand the new one in as a draft/u);

  /* ITS NEW VERSION ARRIVES AS A DRAFT, and waits. */
  const three = value<Attached>(await api.attachVisual({ on: task, page: '<h1>C</h1>', title: 'Launch week', draft: true, visual: one.visual }, drew));
  assert.equal(three.version, 3);
  assert.equal(value<{ visuals: Listed[] }>(await api.visuals({ on: task }, owner)).visuals[0]!.draft?.version, 3);

  /* A VERSION A PERSON DREW has nobody to ask. */
  const mine = value<Attached>(await api.attachVisual({ on: task, page: '<h1>Mine</h1>', title: 'My week' }, owner));
  assert.equal(refused(await api.settleVisual({ id: mine.visual, version: 1, as: 'again' }, owner)).code, 'TRANSITION_ILLEGAL');
  sql.close();
});

test("AN AGENT'S VERSION IS A DRAFT BY DEFAULT, and a person's own is kept as it comes", async () => {
  const { api, task, sql } = await record();
  const drew = agent();
  const one = value<Attached>(await api.attachVisual({ on: task, page: '<h1>Drawn</h1>', title: 'Launch week' }, drew));
  assert.equal(one.draft, true, 'an agent that says nothing hands a draft in');
  assert.match(one.said, /waits on .* as a draft/u);
  const [held] = value<{ visuals: Listed[] }>(await api.visuals({ on: task }, owner)).visuals;
  assert.deepEqual([held!.kept, held!.draft?.version], [false, 1]);
  /* ITS NEXT VERSION, unasked, waits too, and the one kept by Keep stays where it stands. */
  value(await api.settleVisual({ id: one.visual, version: 1, as: 'keep' }, owner));
  const two = value<Attached>(await api.attachVisual({ on: task, page: '<h1>Drawn again</h1>', title: 'Launch week' }, drew));
  assert.equal(two.draft, true);
  const [after] = value<{ visuals: Listed[] }>(await api.visuals({ on: task }, owner)).visuals;
  assert.deepEqual([after!.version, after!.draft?.version], [1, 2]);

  const mine = value<Attached>(await api.attachVisual({ on: task, page: '<h1>Mine</h1>', title: 'My week' }, owner));
  assert.equal(mine.draft, undefined, "a person's own version is kept");
  const mineHeld = value<{ visuals: Listed[] }>(await api.visuals({ on: task }, owner)).visuals.find((v) => v.id === mine.visual)!;
  assert.deepEqual([mineHeld.kept, mineHeld.draft], [true, null]);
  sql.close();
});
