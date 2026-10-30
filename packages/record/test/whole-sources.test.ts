/**
 * ONE LIST OF WHAT READS ACROSS THE WHOLE RECORD (sec-follow M1). The kernel's `sourceReadsWhole` is what the record holds back
 * from a member who does not read all of it and what a shared link never draws, so a source marked `whole` is held from
 * both the day it is added. The record kept its own set beside the share's, and it lacked `governance.apart`, `kpis`,
 * `scripts` and `actions.blocking`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sourceReadsWhole, wholeSources } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { shareDraws } from '../src/methods/shares.ts';
import { HOST_SOURCES } from '../src/sources/index.ts';
import { SOURCE_MODULES } from '../../kernel/src/sources/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

test('EVERY SOURCE MARKED WHOLE IS ON THE ONE LIST, AND NO LINK DRAWS ONE', () => {
  for (const [name, module] of Object.entries(SOURCE_MODULES)) assert.equal(sourceReadsWhole(name), module.whole === true, name);
  for (const name of wholeSources()) assert.equal(shareDraws(name), false, name);
  for (const name of ['governance.apart', 'kpis', 'scripts', 'actions.blocking', 'activity', 'exceptions', 'usage.days']) assert.ok(wholeSources().includes(name), name);
  /* A LIST, A FIGURE AND NOTHING ARE NEVER ONE; a host source is one only by its own mark, asked where the caller has it. */
  for (const name of ['register.jobs', 'metric.owed', '', undefined, null, 'nosuch']) assert.equal(sourceReadsWhole(name), false, String(name));
  assert.equal(sourceReadsWhole('pages', (n) => (n === 'pages' ? { whole: true } : undefined)), true);
  assert.equal(sourceReadsWhole('lists', () => ({})), false);
  assert.ok(Object.hasOwn(HOST_SOURCES, 'pages'));
});

const list = (id: string, name: string) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
});

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const ASKED = 'The questions asked across this BrainDog are shown to people who can read all of it.';

test('THE QUESTIONS SET APART ARE HELD FROM A MEMBER AS THE OPEN ONES ARE, by the one list', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 9, 2, 12)) });
  assert.ok((await api.kernel.install([list('jobs', 'Jobs'), list('notes', 'Notes')])).ok);
  const set = await api.setDeclaration(
    {
      body: {
        page: 'decide',
        title: 'Decide',
        requires: ['register.jobs'],
        blocks: [
          { kind: 'table', heading: 'Jobs', source: 'register.jobs', columns: [{ field: 'what' }] },
          { kind: 'queue', heading: 'Apart', source: 'governance.apart' },
        ],
      },
    },
    owner,
  );
  assert.ok(set.ok, JSON.stringify(set));
  assert.ok((await api.invite({ person: 'p_2', name: 'Wren', registers: { jobs: 'read' } } as never, owner)).ok);
  const held = api.kernel.access('p_2')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, registers: held.registers ?? '*', levels: held.levels };

  const fixes = async (ctx: CallContext) => {
    const out = (await api.page({ slug: 'decide' }, ctx)) as { ok: boolean; value: { blocks: { refusals?: { fix: string }[] }[] } };
    assert.ok(out.ok, JSON.stringify(out));
    return out.value.blocks.map((b) => (b.refusals ?? []).map((r) => r.fix));
  };
  assert.deepEqual(await fixes(wren), [[], [ASKED]]);
  assert.deepEqual(await fixes(owner), [[], []]);
});
