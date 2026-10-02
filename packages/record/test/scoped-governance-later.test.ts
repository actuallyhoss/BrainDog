/**
 * The questions put off and the ones answered are read across the whole record, as the open ones are: a member invited
 * to Jobs alone is refused both blocks with the one sentence, and the owner is drawn them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const list = (id: string, name: string) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
});

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const ASKED = 'The questions asked across this BrainDog are shown to people who can read all of it.';

test('A QUESTION PUT OFF OR ANSWERED IS FOR WHOEVER READS EVERY LIST', async () => {
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
          { kind: 'queue', heading: 'Later', source: 'governance.later' },
          { kind: 'table', heading: 'Decided', source: 'governance.decided', columns: [{ field: 'question' }] },
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
  assert.deepEqual(await fixes(wren), [[], [ASKED], [ASKED]]);
  assert.deepEqual(await fixes(owner), [[], [], []]);
});
