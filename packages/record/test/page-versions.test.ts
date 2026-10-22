/**
 * A page's earlier versions, read (`pageVersions`, PGS-A07 job 4).
 *
 * The kernel keeps every version of a page's declaration, and the app could show only the body before the last Apply.
 * The read lists them newest first, each with who applied it and when, and says a person by name: no person id, no
 * declaration id.
 *
 * IT IS CALLED ON THE RECORD ONCE THE RECORD REGISTERS IT (`methods/index.ts`), and until then built here from the
 * record's own kernel and a guard that passes a caller who reads, so the same tests hold either side of that line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, type PageVersion, type PageVersions } from '../src/methods/page-versions.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { SOURCE_MODULES } from '../../kernel/src/sources/index.ts';

const ada: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const bo: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'owner' } };
const reader: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' } };

const body = (...notes: string[]) => ({ page: 'plans', title: 'Plans', blocks: notes.map((n) => ({ kind: 'note', body: n })) });

type Read = (args: unknown, ctx: CallContext) => Promise<{ ok: true; value: PageVersions } | { ok: false; refusal: Refusal }>;

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 17, 12)) });
  for (const [id, name] of [['p_1', 'Ada'], ['p_2', 'Bo'], ['p_3', 'Cy']] as const) {
    sql.exec('INSERT OR IGNORE INTO person (id, email, name) VALUES (?, ?, ?)', id, `${name.toLowerCase()}@example.test`, name);
    sql.exec('UPDATE person SET name = ? WHERE id = ?', name, id);
  }
  const registered = (api as unknown as { pageVersions?: Read }).pageVersions;
  const reads = (ctx: CallContext): Refusal | null => {
    const level = (ctx.principal as { level?: string | null }).level;
    return level === 'owner' || level === 'decide' || level === 'write' || level === 'read' ? null : { code: 'FORBIDDEN', fix: 'This needs a caller who reads the record.' };
  };
  const built = methods({ kernel: api.kernel, sql, guard: reads, readable: reads, no } as never).pageVersions as Read;
  const read: Read = registered ? (args, ctx) => registered.call(api, args, ctx) : built;
  return { api, sql, read };
}

const listed = async (read: Read, args: unknown, ctx: CallContext): Promise<PageVersions> => {
  const out = await read(args, ctx);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};

/** Everything a version says but the declaration's own text, which is the page's source and holds what its author wrote. */
const said = (versions: PageVersion[]): string => JSON.stringify(versions.map(({ body: _body, ...rest }) => rest));

test('TWO APPLIES OF ONE PAGE LIST THREE VERSIONS, newest first, each with who and when and no id', async () => {
  const { api, sql, read } = await record();
  assert.ok((await api.setDeclaration({ body: body('a') }, ada)).ok);
  assert.ok((await api.setDeclaration({ body: body('a', 'b'), version: 1 }, bo)).ok);
  assert.ok((await api.setDeclaration({ body: body('b', 'a'), version: 2 }, ada)).ok);

  const out = await listed(read, { page: 'plans' }, ada);
  assert.equal(out.page, 'plans');
  assert.equal(out.title, 'Plans');
  assert.deepEqual(out.versions.map((v) => v.version), [3, 2, 1]);
  assert.deepEqual(out.versions.map((v) => v.by), ['Ada', 'Bo', 'Ada']);
  assert.deepEqual(out.versions.map((v) => v.live), [true, false, false]);
  for (const v of out.versions) assert.match(v.at, /^2026-09-17T12:00:00/, `version ${v.version} says no time`);
  assert.deepEqual(out.versions.map((v) => (v.body.blocks as { body: string }[]).map((b) => b.body)), [['b', 'a'], ['a', 'b'], ['a']]);
  assert.doesNotMatch(said(out.versions), /p_[0-9]|page\.plans|[0-9A-HJKMNP-TV-Z]{26}/, 'a version carries an id');
  sql.close();
});

test('A PAGE NEVER CHANGED LISTS ONE, and somebody who only reads the record is shown it too', async () => {
  const { api, sql, read } = await record();
  assert.ok((await api.setDeclaration({ body: body('a') }, ada)).ok);

  const out = await listed(read, { page: 'plans' }, reader);
  assert.deepEqual(out.versions.map((v) => [v.version, v.by, v.live]), [[1, 'Ada', true]]);
  /* Asked for by the name a declaration goes by, as `arrangement({ page })` takes it. */
  assert.deepEqual((await listed(read, { page: 'page.plans' }, ada)).versions.length, 1);
  sql.close();
});

test('A PAGE WHOSE NAME IS NOT ITS ADDRESS (an underscore) is read at its address', async () => {
  const { api, sql, read } = await record();
  assert.ok((await api.setDeclaration({ body: { ...body('a'), page: 'my_plans' } }, ada)).ok);
  assert.ok((await api.setDeclaration({ body: { ...body('a', 'b'), page: 'my_plans' }, version: 1 }, ada)).ok);

  const out = await listed(read, { page: 'my-plans' }, ada);
  assert.deepEqual(out.versions.map((v) => v.version), [2, 1]);
  sql.close();
});

test('AN UNKNOWN PAGE IS REFUSED BY THE NAME ASKED, and so is a call that names none or says a key it does not take', async () => {
  const { api, sql, read } = await record();
  assert.ok((await api.setDeclaration({ body: body('a') }, ada)).ok);

  const missing = await read({ page: 'holidays' }, ada);
  assert.ok(!missing.ok);
  assert.equal(missing.refusal.code, 'PAGE_UNKNOWN');
  assert.match(missing.refusal.fix, /holidays/);
  assert.match(missing.refusal.fix, /plans/, 'the refusal does not say which pages there are');
  assert.equal(missing.refusal.at, 'page');

  const unnamed = await read({}, ada);
  assert.equal(!unnamed.ok && unnamed.refusal.code, 'REQUIRED_MISSING');
  const extra = await read({ page: 'plans', version: 2 }, ada);
  assert.equal(!extra.ok && extra.refusal.code, 'FIELD_UNKNOWN');
  sql.close();
});

/* ── a version is cut to the lists its reader may read (audit 61, claim 7) ── */

const list = (id: string, name: string) => ({ register: id, name, title: 'name', fields: [{ id: 'name', type: 'text' }] });
const over = (...blocks: Record<string, unknown>[]) => ({ page: 'desk', title: 'Desk', blocks });
const table = (id: string) => ({ kind: 'table', source: `register.${id}` });
/** Somebody invited to Notes alone. */
const noteReader: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['notes'] };

/** A Desk page that read Notes and Salaries, then Notes alone: its older version names a list its newer one does not. */
async function desk() {
  const made = await record();
  for (const l of [list('notes', 'Notes'), list('salaries', 'Salaries')]) {
    const out = await made.api.setDeclaration({ body: l }, ada);
    assert.ok(out.ok, JSON.stringify(out));
  }
  const first = await made.api.setDeclaration({ body: over(table('notes'), table('salaries'), { kind: 'note', body: 'Raise the salaries in May.' }, { kind: 'note', body: 'hello' }) }, ada);
  assert.ok(first.ok, JSON.stringify(first));
  const second = await made.api.setDeclaration({ body: over(table('notes'), { kind: 'note', body: 'hello' }), version: 1 }, ada);
  assert.ok(second.ok, JSON.stringify(second));
  return made;
}

test('AN OLDER VERSION IS CUT TO THE LISTS ITS READER MAY READ, said as a count, and nothing left names the others', async () => {
  const { sql, read } = await desk();

  const out = await listed(read, { page: 'desk' }, noteReader);
  assert.deepEqual(out.versions.map((v) => v.version), [2, 1]);
  const [now, older] = out.versions as [PageVersion, PageVersion];
  /* Today's version reads Notes alone, so it is whole and says no cut. */
  assert.equal(now.cut, undefined);
  assert.equal((now.body.blocks as unknown[]).length, 2);
  /* The older one loses the table over Salaries and the note that names them, and says two were left out. */
  assert.equal(older.cut, 2);
  assert.deepEqual(older.body.blocks, [table('notes'), { kind: 'note', body: 'hello' }]);
  assert.doesNotMatch(JSON.stringify(out), /salar/i, 'the answer names a list its reader may not read');
  sql.close();
});

test('SOMEBODY WHO READS EVERY LIST IS GIVEN EACH VERSION WHOLE, with no cut said', async () => {
  const { sql, read } = await desk();

  const out = await listed(read, { page: 'desk' }, reader);
  const older = out.versions[1]!;
  assert.equal(older.cut, undefined);
  assert.equal((older.body.blocks as unknown[]).length, 4);
  assert.match(JSON.stringify(older.body), /register\.salaries/);
  assert.ok(out.versions.every((v) => v.cut === undefined));
  sql.close();
});

test('A VERSION OVER A LIST SINCE TAKEN OUT is whole for who reads everything and cut for who does not', async () => {
  const { api, sql, read } = await desk();
  const gone = await api.retireDeclaration({ id: 'register.salaries' }, ada);
  assert.ok(gone.ok, JSON.stringify(gone));
  assert.equal(api.kernel.register('salaries'), undefined);

  const whole = (await listed(read, { page: 'desk' }, ada)).versions[1]!;
  assert.equal(whole.cut, undefined);
  assert.equal((whole.body.blocks as unknown[]).length, 4);
  const cut = await listed(read, { page: 'desk' }, noteReader);
  assert.equal(cut.versions[1]!.cut, 2);
  assert.doesNotMatch(JSON.stringify(cut), /salar/i);
  sql.close();
});

test('A VERSION MADE FOR EACH ROW OF A HIDDEN LIST keeps none of its blocks, and one that names a row of it loses that block', async () => {
  const { api, sql, read } = await desk();
  const about = { ...over({ kind: 'note', body: '{{name}}' }, table('notes')), for: { register: 'salaries' }, requires: ['register.salaries', 'register.notes'] };
  const templated = await api.setDeclaration({ body: about, version: 2 }, ada);
  assert.ok(templated.ok, JSON.stringify(templated));
  const spoken = await api.setDeclaration({ body: over(table('notes'), { kind: 'note', body: 'Ask about salaries#1 first.' }), version: 3 }, ada);
  assert.ok(spoken.ok, JSON.stringify(spoken));

  const out = await listed(read, { page: 'desk' }, noteReader);
  const [four, three] = out.versions as [PageVersion, PageVersion];
  assert.equal(four.cut, 1);
  assert.deepEqual(four.body.blocks, [table('notes')]);
  assert.deepEqual(three.body.blocks, []);
  assert.equal(three.body.for, undefined);
  assert.equal(three.body.requires, undefined);
  assert.equal(three.cut, 4);
  assert.doesNotMatch(JSON.stringify(out), /salar/i);
  sql.close();
});

test('PUT BACK APPLIES A VERSION AS IT WAS ANSWERED, and against a page changed meanwhile it is refused by name', async () => {
  const { api, sql, read } = await record();
  assert.ok((await api.setDeclaration({ body: body('a') }, ada)).ok);
  assert.ok((await api.setDeclaration({ body: body('a', 'b'), version: 1 }, ada)).ok);
  /* Ada opens the source view at version 2 and reads History. Bo applies version 3 before she presses Put back. */
  const held = await listed(read, { page: 'plans' }, ada);
  for (const v of held.versions) assert.equal(Object.keys(v.body)[0], 'page', 'a body does not begin with its kind, so applying it is refused');
  assert.ok((await api.setDeclaration({ body: body('c'), version: 2 }, bo)).ok);

  /* Put back is `apply(thatVersion.body, the version the box was read at)` (`SourceView.svelte` `putBackTo`). */
  const back = (await api.setDeclaration({ body: held.versions[1]!.body, version: held.versions[0]!.version }, ada)) as {
    ok: boolean;
    conflict?: { version: number; current: { body: { page?: string; title?: string; blocks: { body: string }[] } } };
  };
  assert.ok(!back.ok, 'a put back over a page changed meanwhile was written');
  /* Refused as a conflict that names the page and hands back what it holds now, at the version it holds it. */
  assert.ok(back.conflict, JSON.stringify(back));
  assert.equal(back.conflict.version, 3);
  assert.equal(back.conflict.current.body.page, 'plans');
  assert.equal(back.conflict.current.body.title, 'Plans');
  assert.deepEqual(back.conflict.current.body.blocks.map((b) => b.body), ['c']);

  const after = await listed(read, { page: 'plans' }, ada);
  assert.deepEqual(after.versions.map((v) => v.version), [3, 2, 1]);
  assert.deepEqual((after.versions[0]!.body.blocks as { body: string }[]).map((b) => b.body), ['c']);

  /* And against the version the page is at now, the same body is written: version 4 says what version 1 said. */
  const again = await api.setDeclaration({ body: after.versions[2]!.body, version: 3 }, ada);
  assert.ok(again.ok, JSON.stringify(again));
  const last = await listed(read, { page: 'plans' }, ada);
  assert.deepEqual(last.versions.map((v) => v.version), [4, 3, 2, 1]);
  assert.deepEqual(last.versions[0]!.body, last.versions[3]!.body);
  sql.close();
});

/* ── a block over a figure the record no longer holds (audit 64, claim 2) ── */

const payroll = { metric: 'payroll-total', name: 'Payroll total', source: 'register.salaries', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' };
const stat = (metric: string) => ({ kind: 'stat', cells: [{ metric }] });

/** The Desk at version 3 drew a figure over Salaries, version 4 drew it no more, and then the figure was taken out. */
async function retiredFigure(third: Record<string, unknown>[] = [table('notes'), stat('payroll-total')]) {
  const made = await desk();
  const figure = await made.api.setDeclaration({ body: payroll as never }, ada);
  assert.ok(figure.ok, JSON.stringify(figure));
  const drew = await made.api.setDeclaration({ body: over(...third), version: 2 }, ada);
  assert.ok(drew.ok, JSON.stringify(drew));
  /* While the figure is there the kernel names its list, so the stat is cut for the Notes reader as a table is. */
  const before = (await listed(made.read, { page: 'desk' }, noteReader)).versions[0]!;
  assert.ok((before.cut ?? 0) > 0, 'a block over a figure of a hidden list was shown while the figure was there');
  const without = await made.api.setDeclaration({ body: over(table('notes')), version: 3 }, ada);
  assert.ok(without.ok, JSON.stringify(without));
  const gone = await made.api.retireDeclaration({ id: 'metric.payroll-total' }, ada);
  assert.ok(gone.ok, JSON.stringify(gone));
  return made;
}

test('A STAT OVER A FIGURE SINCE TAKEN OUT, ON A HIDDEN LIST, IS CUT for a reader who does not read every list', async () => {
  const { sql, read } = await retiredFigure();

  const out = await listed(read, { page: 'desk' }, noteReader);
  assert.deepEqual(out.versions.map((v) => v.version), [4, 3, 2, 1]);
  const third = out.versions[1]!;
  assert.ok((third.cut ?? 0) > 0, 'a stat over a figure the record no longer holds came back whole');
  assert.equal(third.cut, 1);
  assert.deepEqual(third.body.blocks, [table('notes')]);
  assert.doesNotMatch(JSON.stringify(out), /payroll|salar/i, 'the answer names a figure of a list its reader may not read');
  /* The version that never drew it is whole. */
  assert.equal(out.versions[0]!.cut, undefined);

  /* And somebody who reads every list is given the stat as it was written. */
  const whole = (await listed(read, { page: 'desk' }, ada)).versions[1]!;
  assert.equal(whole.cut, undefined);
  assert.deepEqual(whole.body.blocks, [table('notes'), stat('payroll-total')]);
  sql.close();
});

test('A FIGURE SINCE TAKEN OUT IS CUT WHEREVER A BLOCK READS IT: a hole in a sentence, how far it moved, a line that draws when it crosses', async () => {
  const shapes: Record<string, unknown>[] = [
    table('notes'),
    { kind: 'note', body: 'We pay {{payroll-total}} people.' },
    { kind: 'note', body: 'Up by {{payroll-total.change}}.' },
    { kind: 'note', body: 'hello', when: { metric: 'payroll-total', gte: 1 } },
    { kind: 'note', body: 'The payroll-total figure is on the Money page.' },
  ];
  const { sql, read } = await retiredFigure(shapes);

  const third = (await listed(read, { page: 'desk' }, noteReader)).versions[1]!;
  /* The three that read the figure go. The note that only says its name in a sentence reads nothing and stays. */
  assert.equal(third.cut, 3);
  assert.deepEqual(third.body.blocks, [shapes[0], shapes[4]]);
  sql.close();
});

test('A FIGURE THAT IS STILL THERE, OVER A LIST ITS READER MAY READ, cuts nothing', async () => {
  const made = await desk();
  const count = await made.api.setDeclaration({ body: { ...payroll, metric: 'notes-count', name: 'Notes', source: 'register.notes' } as never }, ada);
  assert.ok(count.ok, JSON.stringify(count));
  const drew = await made.api.setDeclaration({ body: over(table('notes'), stat('notes-count')), version: 2 }, ada);
  assert.ok(drew.ok, JSON.stringify(drew));

  const now = (await listed(made.read, { page: 'desk' }, noteReader)).versions[0]!;
  assert.equal(now.cut, undefined);
  assert.equal((now.body.blocks as unknown[]).length, 2);
  made.sql.close();
});

test('A BLOCK OVER A SOURCE THIS BUILD NO LONGER KNOWS IS CUT for a reader who does not read every list', async () => {
  const made = await desk();
  /* A part of the code that answered by name when the version was written, and is gone when it is read. */
  SOURCE_MODULES.weather = { read: (_deps, _block, base) => ({ ...base, matched: 0 }) };
  try {
    const drew = await made.api.setDeclaration({ body: over(table('notes'), { kind: 'table', source: 'weather' }), version: 2 }, ada);
    assert.ok(drew.ok, JSON.stringify(drew));
  } finally {
    delete SOURCE_MODULES.weather;
  }

  const now = (await listed(made.read, { page: 'desk' }, noteReader)).versions[0]!;
  assert.equal(now.cut, 1, 'a block over a source nobody can read any more came back whole');
  assert.deepEqual(now.body.blocks, [table('notes')]);
  /* And somebody who reads every list is given it as it was written. */
  const whole = (await listed(made.read, { page: 'desk' }, ada)).versions[0]!;
  assert.equal(whole.cut, undefined);
  assert.equal((whole.body.blocks as unknown[]).length, 2);
  made.sql.close();
});

test('AN AGENT\'S KIND UNDER A VERSION IS SAID ONLY TO WHOEVER READS THE RUNS: "An agent" to anybody else', async () => {
  const { api, sql, read } = await record();
  assert.ok((await api.setDeclaration({ body: body('a') }, ada)).ok);
  /* THE LINE SIGNED AS AN AGENT, its kind in its name, as an agent's apply signs one. */
  sql.exec("UPDATE event SET actor = 'agent:claude-code' WHERE kind = 'declare' AND target = 'declaration:page.plans'");
  assert.deepEqual((await listed(read, { page: 'plans' }, ada)).versions.map((v) => v.by), ['Claude code']);
  for (const ctx of [reader, noteReader]) assert.deepEqual((await listed(read, { page: 'plans' }, ctx)).versions.map((v) => v.by), ['An agent']);
  sql.close();
});
