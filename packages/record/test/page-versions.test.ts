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
