/**
 * The held-pack refusal, asked through `@braindog/record` as the web, the CLI and the MCP ask it
 * (`loop/research-batch-forty-two-audit.md` finding 1, `loop/research-shell-next.md` M4).
 *
 * `f507cff5` TAUGHT `plan` TO REFUSE AN UPDATE THAT STRANDS A HELD PACK, and proved it on an `Installed` its test built
 * by hand from the `pack` rows' manifests. The record builds its `Installed` from `kernel.packs()`, which answered an id
 * and a version and no `requires`, so `dependents` was always empty here. Measured by the audit through `planPack` and
 * `installPack` as the owner: money-core 2.0.0 over `bank-hsbc-eg` 1.0.0 on `^1.8.0` planned `dependents: []` and
 * answered INSTALLED, the stranded record the commit was written to prevent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../seed/src/index.ts';
import { bankHsbcEgFile as bankHsbcEgPack } from '../../seed/test/pack-files.ts';
import { asMoneyCore180, asMoneyCore200 } from '../../seed/test/money-core-earlier.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
type Planned = { diff: { planHash: string; approve?: unknown; dependents: unknown[] } };

test('money-core 2.0.0 OVER bank-hsbc-eg 1.0.0 ON ^1.8.0 IS PLANNED WITH ITS DEPENDENT AND REFUSED, through planPack and installPack', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 23, 12)) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  const put = async (doc: unknown): Promise<{ diff: Planned['diff']; out: Out }> => {
    const planned = (await api.planPack({ doc } as never, owner)) as Out;
    assert.ok(planned.ok, JSON.stringify(planned.refusal));
    const { diff } = planned.value as Planned;
    return { diff, out: (await api.installPack({ doc, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out };
  };
  for (const id of FIRST_PARTY) {
    const { out } = await put(id === 'money-core' ? asMoneyCore180(firstPartyDocument(id)) : firstPartyDocument(id));
    assert.ok(out.ok, `${id}: ${JSON.stringify(out.refusal)}`);
  }
  const bank = await put({ ...bankHsbcEgPack(), version: '1.0.0', requires: { format: 1, primitives: 1, packs: { 'money-core': '^1.8.0' } } });
  assert.ok(bank.out.ok, JSON.stringify(bank.out.refusal));

  const { diff, out } = await put(asMoneyCore200(firstPartyDocument('money-core')));
  assert.deepEqual(diff.dependents, [{ id: 'bank-hsbc-eg', version: '1.0.0', range: '^1.8.0', ok: false, was: true }], 'planPack named no dependent');
  assert.equal(out.ok, false, 'installPack put money-core 2.0.0 under a pack that asks for ^1.8.0');
  assert.equal(out.refusal?.code, 'PACK_REQUIRED');
  assert.equal(api.kernel.packs().find((p) => p.id === 'money-core')?.version, '1.8.0');
  sql.close();
});
