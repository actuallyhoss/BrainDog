/**
 * A whole-body change lands against the version it was drawn from, not the one live when it was filed.
 *
 * Measured at `545c95f6`: `propose` stamped every whole-body change with the version live AT FILING and dropped
 * whatever the proposer wrote. That closed the race `schema-add.test.ts` draws (two changes filed from one reading
 * before either is accepted) and nothing else. An agent that read Projects at v1, spent its turn building the body, and
 * filed it after another change had taken the list to v2 was stamped v2, so the owner's accept installed it over v2 and
 * `domain` went, with both decisions reading "accept".
 *
 * The proposer is the only one who knows which reading its body came from, so its `from_version` is taken when it names
 * a version that has been live. One above the live version names a reading nobody could have made and is stamped with
 * the live one, which keeps that guard against a guess at what will be live at acceptance.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const FIELDS = [
  { id: 'name', type: 'text', required: true },
  { id: 'lane', type: 'enum', values: ['building', 'earning', 'parked'], required: true },
];

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', fields: FIELDS } as never,
};

/** The whole register as read at v1, with one more field. */
const plus = (field: Record<string, unknown>) => ({ ...THINGS, body: { ...(THINGS.body as object), fields: [...FIELDS, field] } });

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string }; conflict?: unknown };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([THINGS])).ok);
  const file = async (body: Record<string, unknown>): Promise<Out> =>
    (await api.propose({ question: 'Add this to Projects?', body_kind: 'change', body } as never, owner)) as Out;
  const accept = async (id: string): Promise<Out> => (await api.decide({ id, decide: { option: 'accept', reason: 'it is useful' } }, owner)) as Out;
  const live = () => {
    const decl = api.kernel.declarations().find((d) => d.id === 'register.things')!;
    return { version: decl.version, fields: (JSON.parse(decl.body) as { fields: { id: string }[] }).fields.map((f) => f.id) };
  };
  const status = (id: string) => sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id)!.status;
  const stored = (id: string) => JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', id)!.body) as Record<string, unknown>;
  return { sql, file, accept, live, status, stored };
}

const idOf = (out: Out): string => {
  assert.ok(out.ok, JSON.stringify(out));
  return (out.value as { id: string }).id;
};

test('A BODY DRAWN AT v1 AND FILED AFTER THE LIST REACHED v2 COMES BACK, and the change between survives', async () => {
  const { sql, file, accept, live, status, stored } = await record();
  assert.ok((await accept(idOf(await file({ declaration_id: 'register.things', from_version: 1, to: plus({ id: 'domain', type: 'url' }) })))).ok);
  assert.equal(live().version, 2);

  /* FILED NOW, DRAWN THEN. Before this, the stamp was 2 and the accept below installed `launched` over `domain`. No row
     holds a `domain` value, for the reason `schema-add.test.ts` gives: with one, `WOULD_ORPHAN` refuses on its own and
     this test would pass with no version at all. */
  const b = idOf(await file({ declaration_id: 'register.things', from_version: 1, to: plus({ id: 'launched', type: 'day' }) }));

  const second = await accept(b);
  assert.equal(second.ok, false, `the stale body installed: ${live().fields.join(', ')}`);
  assert.equal((second.conflict as { version?: number } | undefined)?.version, 2, JSON.stringify(second));
  assert.equal(status(b), 'open');
  assert.deepEqual(live().fields, ['name', 'lane', 'domain']);
  assert.equal(stored(b).from_version, 1, 'the proposer said which reading its body came from, and the record overwrote it');
  sql.close();
});

test('A VERSION ABOVE THE LIVE ONE, OR NONE, OR NULL, IS STAMPED WITH THE LIVE ONE; one that is not a version is refused', async () => {
  const { sql, file, stored } = await record();
  /* ABOVE IS A GUESS AT WHAT WILL BE LIVE WHEN THE OWNER PRESSES, which is the race `schema-add.test.ts` closed. */
  assert.equal(stored(idOf(await file({ declaration_id: 'register.things', from_version: 7, to: plus({ id: 'domain', type: 'url' }) }))).from_version, 1);
  assert.equal(stored(idOf(await file({ declaration_id: 'register.things', to: plus({ id: 'domain', type: 'url' }) }))).from_version, 1);
  assert.equal(stored(idOf(await file({ declaration_id: 'register.things', from_version: null, to: plus({ id: 'domain', type: 'url' }) }))).from_version, 1);
  /* NOT A VERSION IS NOT SILENTLY THE LIVE ONE. Stamped live, `"1"` would have been the very stamp this file exists to
     stop, applied to a proposer who had tried to say where its body came from. */
  for (const wrong of ['1', -1, 1.5]) {
    const out = await file({ declaration_id: 'register.things', from_version: wrong, to: plus({ id: 'domain', type: 'url' }) });
    assert.equal(out.ok, false, `from_version ${JSON.stringify(wrong)} was filed`);
    assert.equal(out.refusal?.code, 'VALUE_MALFORMED');
    assert.equal(out.refusal?.at, 'body.from_version');
  }
  sql.close();
});

test('AN ADDITION CARRIES NO VERSION, whatever it was sent with, because it is merged onto what is live at the press', async () => {
  const { sql, file, stored } = await record();
  const id = idOf(await file({ declaration_id: 'register.things', from_version: 1, to: { add: { fields: [{ id: 'domain', type: 'url' }] } } }));
  assert.equal('from_version' in stored(id), false);
  sql.close();
});

test('THE MCP propose DESCRIPTION SAYS A WHOLE BODY NAMES THE VERSION IT WAS READ AT', async () => {
  const { TOOLS } = await import('../../mcp/src/index.ts');
  const tool = TOOLS.find((t) => t.name === 'propose') ?? assert.fail('propose is not an MCP tool');
  const said = String((tool.input as { properties: { body: { description: string } } }).properties.body.description);
  assert.match(said, /from_version/, said);
});
