/**
 * `checkPaths` (REC-A12 job 4): each `{{path}}` a document holds, once and in order, with whether the record has
 * anything by that name, read as a note block reads it. The importer asks it before it writes a document, so a path the
 * record cannot answer is written as text and named, never printed with its braces on a page.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal, type Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { CHECK_DOCUMENT_MOST, methods, type PathCheck } from '../src/methods/pages-census.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 3);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const narrow: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'owner' }, registers: ['projects'] };
const link: CallContext = { principal: { kind: 'share', id: 'sh_1' } } as unknown as CallContext;

const decl = (kind: string, id: string, body: unknown) => ({ id: `${kind}.${id}`, kind, body }) as never;
const DECLS = [
  decl('register', 'projects', { id: 'projects', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'lane', type: 'text' }, { id: 'note', type: 'document' }] }),
  decl('register', 'payroll', { id: 'payroll', name: 'Payroll', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
];

async function check() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  const refuse = (fix: string): Refusal => ({ code: 'FORBIDDEN', fix, at: 'principal' });
  const deps = {
    kernel: api.kernel,
    scoped: (ctx: CallContext) => (ctx.principal.kind === 'share' ? refuse('A link reads one page.') : null),
    readable: (ctx: CallContext, list: string) =>
      ctx.registers === undefined || ctx.registers === '*' || (ctx.registers as string[]).includes(list) ? null : refuse('Not one of yours.'),
    no,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  return { sql, read: methods(deps) };
}

const paths = (out: Result<{ paths: PathCheck[] }>): PathCheck[] => {
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.paths;
};

const DOCUMENT = [
  'We hold {{projects.count}} projects, paid {{payroll.count}} people,',
  'and the budget is {{kiln.budget}}. Again: {{projects.count}}.',
  'In code it is text: `{{in.code}}`. A typed form reads its path: {{money:payroll.count}}.',
].join('\n');

test('EACH PATH ONCE, IN THE ORDER IT READS, with whether it names something', async () => {
  const { sql, read } = await check();
  assert.deepEqual(paths(await read.checkPaths({ document: DOCUMENT }, owner)), [
    { path: 'projects.count', named: true },
    { path: 'payroll.count', named: true },
    { path: 'kiln.budget', named: false },
  ]);
  sql.close();
});

test('A PATH OVER A LIST THE CALLER MAY NOT READ names nothing to them, as a page would show it', async () => {
  const { sql, read } = await check();
  assert.deepEqual(paths(await read.checkPaths({ document: DOCUMENT }, narrow)), [
    { path: 'projects.count', named: true },
    { path: 'payroll.count', named: false },
    { path: 'kiln.budget', named: false },
  ]);
  sql.close();
});

test('A DOCUMENT WITH NO PATHS answers none, and a check writes nothing', async () => {
  const { sql, read } = await check();
  const changes = (): number => sql.one<{ n: number }>('SELECT total_changes() AS n')!.n;
  const before = changes();
  assert.deepEqual(paths(await read.checkPaths({ document: 'Plain words, and {{ not a path }}.' }, owner)), []);
  paths(await read.checkPaths({ document: DOCUMENT }, owner));
  assert.equal(changes(), before);
  sql.close();
});

test('WHAT IS NOT A DOCUMENT IS REFUSED in a sentence naming the field, and a link reads nothing', async () => {
  const { sql, read } = await check();
  const refusal = (out: Result<unknown>): Refusal | null => (out.ok || !('refusal' in out) ? null : out.refusal);
  const code = (out: Result<unknown>) => refusal(out)?.code ?? 'ok';
  const fix = (out: Result<unknown>) => refusal(out)?.fix ?? '';
  assert.equal(code(await read.checkPaths(undefined, owner)), 'REQUIRED_MISSING');
  assert.equal(code(await read.checkPaths({ document: 7 }, owner)), 'REQUIRED_MISSING');
  const extra = await read.checkPaths({ document: 'x', page: 'home' } as never, owner);
  assert.equal(code(extra), 'FIELD_UNKNOWN');
  assert.equal(code(await read.checkPaths({ document: 'x', register: 7 } as never, owner)), 'VALUE_MALFORMED');
  assert.equal(code(await read.checkPaths({ document: 'x', register: 'nosuch' }, owner)), 'REGISTER_UNKNOWN');
  const long = await read.checkPaths({ document: 'x'.repeat(CHECK_DOCUMENT_MOST + 1) }, owner);
  assert.equal(code(long), 'VALUE_MALFORMED');
  for (const out of [extra, long]) assert.doesNotMatch(fix(out), /—/u);
  assert.equal(code(await read.checkPaths({ document: DOCUMENT }, link)), 'FORBIDDEN');
  sql.close();
});

test('A TYPO IS NAMED AND A REAL FIELD PASSES: the list a document is written into names its own fields, as its page fills them', async () => {
  const { sql, read } = await check();
  const note = 'Kiln is in {{lane}}, named {{name}}. A typo: {{lnae}}. Across: {{projects.count}} and {{projcts.count}}.';
  assert.deepEqual(paths(await read.checkPaths({ document: note, register: 'projects' }, owner)), [
    { path: 'lane', named: true },
    { path: 'name', named: true },
    { path: 'lnae', named: false },
    { path: 'projects.count', named: true },
    { path: 'projcts.count', named: false },
  ]);
  /* WITHOUT THE LIST a bare field is a name nobody declared, so the importer would write it as text: it says so. */
  const bare = paths(await read.checkPaths({ document: note }, owner));
  assert.deepEqual(bare.filter((p) => p.named).map((p) => p.path), ['projects.count']);
  /* A LIST SHE MAY NOT READ IS REFUSED, and never said to exist or not. */
  const hidden = await read.checkPaths({ document: note, register: 'payroll' }, narrow);
  const unknown = await read.checkPaths({ document: note, register: 'nosuch' }, narrow);
  assert.ok(!hidden.ok && !unknown.ok && 'refusal' in hidden && 'refusal' in unknown);
  assert.deepEqual(hidden.refusal, unknown.refusal, 'a list she may not read and one nobody made answer alike');
  sql.close();
});
