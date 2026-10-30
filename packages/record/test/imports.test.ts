/**
 * `imports` and `importAdopt`, the door to every import made into the record and the owner's word on each (ENG-A13,
 * `src/methods/imports.ts`). The method file is asked directly, over a real record holding one import, with guards that
 * refuse as the record's do, so it holds before the integrator wires it into `methods/index.ts`.
 *
 * WHO: `imports` is the owner's over the whole record, as `trust` is; `importAdopt` is his press in a browser, never a
 * token. WHAT: the press keeps his word and files nothing on Decide; an unknown run is refused with its fix.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal, type Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, type FoundImport, type Imports } from '../src/methods/imports.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { PROJECTS } from '../../../fixtures/names.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' } };
const narrow: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, registers: ['errands'] };
const token: CallContext = { principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' }, session: { agent: 'claude' } };
const memberToken: CallContext = { principal: { kind: 'token', id: 't_m', scope: 'read', person: 'p_2', level: 'read' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refusal = (out: Result<unknown>): Refusal => {
  assert.equal(out.ok, false, 'refused');
  return (out as { refusal: Refusal }).refusal;
};

/** A real record holding one import of two rows, and the method file over it with guards that refuse as the record's. */
async function door() {
  const sql = openSqlite();
  const clock = { now: () => NOW };
  const api = await createRecordApi({ sql, clock: clock as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF', slug: 'copperleaf', name: PROJECTS[1], tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([{ id: 'register.errands', kind: 'register', body: { id: 'errands', name: 'Errands', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never }]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_import', 'p_1', 'h_i', 'write', 'Import', '2026-10-01T00:00:00.000Z')");
  sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES ('t_import', 'errands:add', 'tell', 0, '2026-10-01T00:00:00.000Z')");
  const importing: CallContext = { principal: { kind: 'token', id: 't_import', scope: 'write', person: 'p_1', level: 'owner' }, session: { client_id: 'braindog-import-77aa', agent: 'other' } };
  for (const name of ['Post the parcel', 'Return the books']) value(await api.create({ register: 'errands', fields: { name } }, importing));
  const deps = {
    kernel: api.kernel,
    sql,
    clock,
    no,
    scoped: (ctx: CallContext) => (ctx.principal.kind === 'share' ? { code: 'FORBIDDEN', fix: 'A link reads one page.', at: 'principal' } : null),
    admin: (ctx: CallContext, reads?: string) =>
      ctx.principal.kind === 'token'
        ? { code: 'NEEDS_BROWSER_SESSION', fix: `Open this from the app; a token cannot ${reads}.`, at: 'principal' }
        : ctx.principal.kind === 'person' && ctx.principal.level !== 'owner'
          ? { code: 'FORBIDDEN', fix: 'Only the owner can do this.', at: 'principal' }
          : null,
    tail: async <T>(out: T) => out,
  } as unknown as RecordDeps;
  const open = (): number => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")!.n;
  return { api: methods(deps), sql, open };
}

test('THE OWNER READS EVERY IMPORT AND WHAT IT BROUGHT IN, and his own grant over the whole record does too', async () => {
  const { api } = await door();
  for (const who of [owner, token]) {
    const said = value<Imports>(await api.imports({}, who));
    assert.equal(said.imports.length, 1);
    assert.deepEqual(said.imports[0]!.lists, [{ list: 'Errands', rows: 2 }]);
    assert.equal(said.imports[0]!.adopted, null);
    assert.doesNotMatch(JSON.stringify(said), /t_import|braindog-import|01[0-9A-Z]{24}/u, 'no grant, client id or row id');
  }
});

test('A MEMBER, A MEMBER\'S TOKEN AND A CALLER HELD TO PART OF THE RECORD ARE REFUSED IN ONE SENTENCE EACH', async () => {
  const { api } = await door();
  for (const who of [member, memberToken]) {
    const r = refusal(await api.imports({}, who));
    assert.equal(r.code, 'FORBIDDEN');
    assert.equal(r.fix, 'What was imported is for the owner of this BrainDog to read, so nothing was read.');
  }
  const r = refusal(await api.imports({}, narrow));
  assert.equal(r.fix, 'What was imported is about the whole record, and this caller is held to part of it.');
  assert.equal(refusal(await api.importAdopt({ run: 'S1', yes: true }, narrow)).code, 'FORBIDDEN');
});

test('THE OWNER\'S PRESS ADOPTS AN IMPORT, AND TAKES IT BACK, filing nothing on Decide', async () => {
  const { api, open } = await door();
  const run = value<Imports>(await api.imports({}, owner)).imports[0]!.run;
  const before = open();
  const mine = value<FoundImport>(await api.importAdopt({ run, yes: true }, owner));
  assert.equal(mine.adopted, true);
  assert.equal(mine.rows, 2, 'answered as imports says it');
  assert.equal(value<Imports>(await api.imports({}, owner)).imports[0]!.adopted, true);
  assert.equal(value<FoundImport>(await api.importAdopt({ run: run.toLowerCase(), yes: false }, owner)).adopted, false, 'a run said in lower case is the same run');
  assert.equal(open(), before, 'no question was filed');
});

test('A TOKEN OR A MEMBER CANNOT PRESS IT', async () => {
  const { api } = await door();
  const run = value<Imports>(await api.imports({}, owner)).imports[0]!.run;
  const t = refusal(await api.importAdopt({ run, yes: true }, token));
  assert.equal(t.code, 'NEEDS_BROWSER_SESSION');
  assert.equal(t.fix, 'Open this from the app; a token cannot say whether an import is your own.');
  assert.equal(refusal(await api.importAdopt({ run, yes: true }, member)).code, 'FORBIDDEN');
  assert.equal(value<Imports>(await api.imports({}, owner)).imports[0]!.adopted, null, 'nothing was kept');
});

test('AN UNKNOWN RUN IS REFUSED WITH ITS FIX, and so is a call that does not say yes or no', async () => {
  const { api } = await door();
  const r = refusal(await api.importAdopt({ run: 'S99', yes: true }, owner));
  assert.equal(r.code, 'VALUE_MALFORMED');
  assert.equal(r.fix, 'No import here is S99. Nothing was changed.');
  assert.equal(r.at, 'run');
  assert.equal(refusal(await api.importAdopt({ run: 'S1' }, owner)).at, 'yes');
  assert.equal(refusal(await api.importAdopt({ yes: true }, owner)).at, 'run');
  assert.equal(refusal(await api.importAdopt({ run: 'S1', yes: true, why: 'x' } as never, owner)).code, 'FIELD_UNKNOWN');
});
