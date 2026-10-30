/**
 * SEC2 (security review of 30 Oct): WHAT A LINK MAY DRAW IS A LIST OF WHAT IS KEPT, and every source and kind the kernel
 * knows is on one side of it by a decision, never by being forgotten.
 *
 * The share's list of what it held back had drifted from the record's own: it lacked `exceptions`, `usage.*` and `pages`,
 * and neither list had `handoffs.open`, `deadlines`, `actions.blocking`, `runs_on`, `scripts`, `kpis` or
 * `governance.apart`. A page with a table over `handoffs.open` sent an agent's next step ("Fire Sam on Friday; payroll
 * file is in HR") and a row title from `hr` the page never shows; `usage.days` sent run bars; `deadlines` sent every
 * list's rows and states. Now a source is sent only when it is a list, a figure, or one `SHARE_SOURCES` names, and the
 * walk below fails the day a source is added without anybody deciding.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods as shareMethods, SHARE_KINDS, SHARE_SOURCES, shareDraws, shareKind, type SharedPage } from '../src/methods/shares.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { SOURCE_MODULES } from '../../kernel/src/sources/index.ts';
import { BLOCK_KIND_MODULES } from '../../kernel/src/kinds/index.ts';
import { OWNER } from '../../../fixtures/names.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

test('SEC2: EVERY COMPUTED SOURCE IS HELD BACK FROM A LINK UNLESS SHARE_SOURCES NAMES IT', () => {
  for (const name of Object.keys(SOURCE_MODULES)) assert.equal(shareDraws(name), SHARE_SOURCES.has(name), name);
  for (const name of SHARE_SOURCES) {
    assert.ok(Object.hasOwn(SOURCE_MODULES, name), `${name} is no source the kernel knows`);
    /* A SOURCE THAT READS THE WHOLE RECORD, OR SAYS SOMETHING OF EVERY LIST, IS NEVER ONE A LINK MAY DRAW. */
    assert.equal(SOURCE_MODULES[name]!.whole, undefined, name);
    assert.equal(SOURCE_MODULES[name]!.everyList, undefined, name);
  }
  /* A LIST, A FIGURE, AND A BLOCK WITH NO SOURCE ARE DRAWN; A HOST'S OWN SOURCE AND ANOTHER BLOCK'S ANSWER ARE NOT. */
  for (const yes of [undefined, '', 'register.invoices', 'metric.owed-total']) assert.equal(shareDraws(yes), true, String(yes));
  for (const nope of ['pages', 'lists', 'block.1', 'handoffs.open', 'deadlines', 'usage.days', 'something.new']) assert.equal(shareDraws(nope), false, nope);
});

test('SEC2: EVERY KIND THAT READS ITSELF IS ON ONE SIDE BY A DECISION, and the ones that write or read across are off', () => {
  const off = new Set(['link', 'form', 'project']);
  for (const kind of Object.keys(BLOCK_KIND_MODULES)) assert.equal(shareKind(kind), !off.has(kind), kind);
  for (const kind of ['capture', 'inputs', 'form', 'link', 'feed', 'queue', 'agents', 'diff', 'project', 'something-new']) assert.equal(shareKind(kind), false, kind);
  for (const kind of SHARE_KINDS) assert.equal(shareKind(kind), true, kind);
});

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const link = (id: string, slug: string): CallContext => ({ principal: { kind: 'share', id, slug } });
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const BILLS = {
  id: 'register.bills',
  kind: 'register',
  body: { id: 'bills', name: 'Bills', title: 'payee', fields: [{ id: 'payee', type: 'text', required: true }, { id: 'due', type: 'day', deadline: true }] },
} as never;
const HR = {
  id: 'register.hr',
  kind: 'register',
  body: { id: 'hr', name: 'HR', title: 'subject', fields: [{ id: 'subject', type: 'text', required: true }, { id: 'due', type: 'day', deadline: true }] },
} as never;
const PAGE = {
  id: 'page.bills',
  kind: 'page',
  body: {
    page: 'bills',
    title: 'Bills',
    requires: ['register.bills'],
    blocks: [
      { kind: 'table', source: 'register.bills', columns: [{ field: 'payee' }] },
      { kind: 'table', source: 'deadlines', heading: 'Coming up' },
      { kind: 'table', source: 'handoffs.open', heading: 'Handed over' },
      { kind: 'bar', source: 'usage.days', heading: 'Runs' },
      { kind: 'table', source: 'exceptions', heading: 'Exceptions' },
    ],
  },
} as never;

test('SEC2: A PAGE OVER BILLS SENDS ITS BILLS, AND NOTHING OF HR THROUGH A SOURCE THAT READS ACROSS THE LISTS', async () => {
  const sql = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 9, 30, 12));
  const api = await createRecordApi({ sql, clock });
  sql.exec("INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'en-GB', 'UTC', 1, '2026-10-01T00:00:00.000Z')");
  value(await api.kernel.install([BILLS, HR, PAGE]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  value(api.kernel.create('bills', { payee: 'Power company', due: '2026-11-02' }, { actor: 'p_owner' }));
  value(api.kernel.create('hr', { subject: 'Severance for Sam', due: '2026-11-01' }, { actor: 'p_owner' }));
  const direct = shareMethods({ kernel: api.kernel, sql, clock, no, tail: async <T>(o: T) => o, scoped: () => null, admin: () => null, shares: () => ({ can: true }) } as unknown as RecordDeps);
  const { id } = value<{ id: string }>(await direct.openShare({ slug: 'bills' }, owner));
  const shown = value<SharedPage>(await api.sharedPage(undefined, link(id, 'bills')));
  assert.equal(shown.blocks.length, 1, 'a block over a source that reads across the record reached the link');
  const said = JSON.stringify(shown);
  assert.match(said, /Power company/u);
  assert.doesNotMatch(said, /Severance/u);
  sql.close();
});
