/**
 * A `change` Slash drafted from one reading lands against that reading, so a change that landed while the model was
 * thinking is not undone by accepting Slash's.
 *
 * THE DRAFT CARRIES THE VERSION IT WAS DRAWN AT. The kernel keeps a proposer's `from_version` when it names a version that
 * has been live, and stamps the version live AT FILING when it is absent (`packages/kernel/src/govern.ts`, `propose`).
 * Slash sent none: `fromModel` passed the model's body through with whatever it wrote, and the model is handed a reading
 * with no versions in it, so every Slash change was stamped at filing. A model drafting a whole Rates from the reading
 * at v1, while another change took Rates to v2, was stamped v2, and accepting it installed v1's fields over v2's.
 *
 * IT LIVES IN `packages/host/test` FOR NOW, and the host already reaches the
 * record by relative path, as `slash-status-final.test.ts` reaches the Slash package. It belongs beside
 * `packages/record/test/slash-change.test.ts`, and can move there unchanged apart from the two import paths.
 *
 * RED BEFORE THE REPAIR, MEASURED with `drawnVersions` in and `fromModel` not yet reading it: three tests,
 * all three fail. Case 1's accept installed the stale body, leaving Rates as `what, price, unit` with `source` gone; case 2
 * found the model's own guess, 2, kept as the draft's `from_version`; case 3, through `slashPropose`, failed as case 1 did.
 * After it, all three pass: `slashFile` in `packages/record/src/index.ts` passes `drawnVersions` to `fromModel`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type SlashModel } from '../../record/src/index.ts';
import { drawnVersions, fromModel } from '../../record/src/slash.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 23, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const WHAT = { id: 'what', type: 'text', required: true };
const PRICE = { id: 'price', type: 'decimal' };
const rates = (...more: Record<string, unknown>[]) => ({
  id: 'register.rates',
  kind: 'register' as const,
  body: { id: 'rates', name: 'Rates', title: 'what', fields: [WHAT, PRICE, ...more] } as never,
});

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string }; conflict?: { version?: number } };

/** A record past Slash's fortnight of watching, holding Rates at v1. */
async function record(model?: SlashModel) {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 30 * DAY);
  const api = await createRecordApi({ sql, clock, ...(model === undefined ? {} : { slashModel: model }) });
  assert.ok((await api.kernel.install([rates()])).ok);
  assert.ok(api.kernel.create('rates', { what: 'Gold, by hand', price: 2400 }, { actor: 'p_owner' }).ok);
  clock.set(NOW);
  const live = () => {
    const decl = api.kernel.declarations().find((d) => d.id === 'register.rates')!;
    return { version: decl.version, fields: (JSON.parse(decl.body) as { fields: { id: string }[] }).fields.map((f) => f.id) };
  };
  const accept = async (id: string): Promise<Out> => (await api.decide({ id, decide: { option: 'accept', reason: 'useful' } }, owner)) as Out;
  /** Another change landing: `source` added to Rates, taking it to v2. */
  const land = async () => assert.ok((await api.kernel.install([rates({ id: 'source', type: 'text' })])).ok);
  return { sql, api, live, accept, land };
}

/** The model's answer: the whole of Rates as it read it at v1, with `unit` added, and a guess at the version. */
const ANSWER = {
  drafts: [
    {
      question: 'Say what unit each rate is in?',
      body_kind: 'change',
      body: { to: rates({ id: 'unit', type: 'text' }), from_version: 2 },
    },
  ],
};

test('(1) A CHANGE DRAWN AT v1 AND FILED AFTER RATES REACHED v2 IS REFUSED AT ACCEPT, and the change between survives', async () => {
  const { sql, api, live, accept, land } = await record();
  try {
    const drawn = drawnVersions(sql);
    await land();
    assert.equal(live().version, 2);

    const got = fromModel(ANSWER, 'test model', 3, drawn);
    assert.deepEqual(got.dropped, []);
    const put = api.kernel.propose({ question: got.drafts[0]!.question, body_kind: 'change', body: got.drafts[0]!.body } as never, 'slash');
    assert.ok(put.ok, JSON.stringify(put));

    const out = await accept(put.value.id);
    assert.equal(out.ok, false, `the stale body installed: ${live().fields.join(', ')}`);
    assert.equal(out.conflict?.version, 2, JSON.stringify(out));
    assert.deepEqual(live().fields, ['what', 'price', 'source']);
  } finally {
    sql.close();
  }
});

test('(2) THE VERSION IS THE READING\'S AND NEVER THE MODEL\'S GUESS, and a bundle names every member, 0 for one not yet declared', async () => {
  const { sql, land } = await record();
  try {
    const drawn = drawnVersions(sql);
    await land();

    const one = fromModel(ANSWER, 'test model', 3, drawn);
    assert.equal(one.drafts[0]!.body.from_version, 1, 'the model wrote 2, the version live at filing, and that was kept');

    const notes = { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [WHAT] } };
    const bundle = fromModel(
      { drafts: [{ question: 'Add notes beside the unit?', body_kind: 'change', body: { declaration_id: 'register.rates', to: { declarations: [rates({ id: 'unit', type: 'text' }), notes] } } }] },
      'test model',
      3,
      drawn,
    );
    assert.deepEqual(bundle.drafts[0]!.body.from_version, { 'register.rates': 1, 'register.notes': 0 });
  } finally {
    sql.close();
  }
});

test(
  '(3) THROUGH slashPropose: a change that landed while the model was drafting is not undone by accepting Slash\'s',
  async () => {
    let landing: (() => Promise<void>) | undefined;
    const model: SlashModel = {
      name: 'test model',
      draft: async () => {
        await landing?.();
        return ANSWER;
      },
    };
    const { sql, api, live, accept, land } = await record(model);
    try {
      landing = land;
      const filed = (await api.slashPropose({}, owner)) as Out;
      assert.ok(filed.ok, JSON.stringify(filed));
      const [first] = (filed.value as { filed: { id: string }[] }).filed;
      assert.ok(first, JSON.stringify(filed.value));
      assert.equal(live().version, 2);

      const out = await accept(first.id);
      assert.equal(out.ok, false, `the stale body installed: ${live().fields.join(', ')}`);
      assert.deepEqual(live().fields, ['what', 'price', 'source']);
    } finally {
      sql.close();
    }
  },
);
