/**
 * What Decide shows the owner for a declaration an update hands to another pack (`loop/research-batch-thirty-four-audit.md`
 * §8, the presenter half).
 *
 * `plan` CARRIES `to` AND THE ARRANGER DROPPED IT. `diff.retires` names the pack a handed declaration goes to, and the
 * plan an arrangement files for Decide copied each retire as `{ id, rows }` and nothing else, so a door money-core hands
 * to `bank-hsbc-eg` and keeps live was filed exactly as a door it retires. The owner approving the update read "retires"
 * for a door that goes on answering his Shortcut, under a pack he never chose.
 *
 * Driven as the audit measured it: every first-party pack in, money-core at 1.7.0 with the twelve HSBC Egypt doors its
 * own, a token minted for one of them, then money-core's current document proposed as an update by an agent. The record
 * names what it uses (`handover-used.test.ts`), so the door with the token is handed, and with it `bank-from-out-sms`,
 * the door that pattern names (`door-follows-patterns.test.ts`). Ten retire.
 */

/** The door his Shortcut posts to, and the door it names through `door:`, which goes where it goes. */
const HANDED = ['ingest.bank-from-out-sms', 'ingest.bank-ipn-in-sms'];

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import type { CatalogueEntry } from '../../record/src/arrange.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, NOW, bankHsbcEgPack, firstPartyDocument } from '../../seed/src/index.ts';
import { HSBC_EG_INGESTS, HSBC_EG_SMS_INGESTS } from '../../seed/src/packs/bank-hsbc-eg.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_owner', level: 'owner' } };

type Body = Record<string, unknown>;
type Doc = { pack: string; version: string; declarations: Body[] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const HSBC = [...Object.values(HSBC_EG_INGESTS), ...Object.values(HSBC_EG_SMS_INGESTS)].map((i) => `ingest.${(i as { ingest: string }).ingest}`);

/** money-core as 1.7.0 shipped it, the twelve its own, as `record/test/handover-used.test.ts` builds it. */
const v170 = (): Doc => {
  const d = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  d.version = '1.7.0';
  delete (d as { hands?: unknown }).hands;
  const hsbc = [...Object.values(HSBC_EG_INGESTS), ...Object.values(HSBC_EG_SMS_INGESTS)].map((i) => ({ ...structuredClone(i), pack: 'money-core' }));
  d.declarations = [...d.declarations.filter((x) => !HSBC.includes(`ingest.${String(x.ingest)}`)), ...(hsbc as unknown as Body[])];
  return d;
};

/** The host's catalogue, offering money-core at the version the seed builds now, and the pack it hands to. */
const CATALOGUE: CatalogueEntry[] = [
  { id: 'money-core', kind: 'pack', title: 'Money', summary: 'Money.', modules: [], doc: () => firstPartyDocument('money-core') as unknown as Body },
  { id: 'bank-hsbc-eg', kind: 'pack', title: 'HSBC Egypt', summary: 'HSBC Egypt.', modules: ['money-core'], doc: () => bankHsbcEgPack() },
];

/** A record at money-core 1.7.0 with one HSBC door holding a token, as the audit's `hands.mts phantom` drew it. */
async function recordAt170() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), catalogue: CATALOGUE });
  for (const id of FIRST_PARTY) {
    const doc = id === 'money-core' ? v170() : firstPartyDocument(id);
    const { diff } = value<{ diff: { planHash: string; approve?: string[] } }>(await api.planPack({ doc }, owner));
    value(await api.installPack({ doc, planHash: diff.planHash, approve: diff.approve } as never, owner));
  }
  /* A DOOR HIS SHORTCUT POSTS TO, so the update hands it on rather than retiring it. */
  value(await api.ingestMint({ ingest: 'bank-ipn-in-sms' }, owner));
  return { sql, api };
}

const accept = (id: string) => ({ id, decide: { option: 'accept', reason: 'yes' } });

test('DECIDE IS FILED THE HANDED DOOR WITH THE PACK IT GOES TO, and the doors that retire without one', async () => {
  const { sql, api } = await recordAt170();
  const filed = value<{ id: string }>(await api.propose({ question: 'Newer Money?', body_kind: 'pack', body: { install: 'money-core' } } as never, agent));
  const row = value<{ body: { plan: { pack: string; retires?: { id: string; rows: number; to?: string; to_name?: string }[] }[] } }>(await api.governance({ id: filed.id }, owner));
  const money = row.body.plan.find((p) => p.pack === 'money-core');
  assert.ok(money, JSON.stringify(row.body.plan));
  const hsbc = (money.retires ?? []).filter((r) => HSBC.includes(r.id));
  assert.equal(hsbc.length, 12, JSON.stringify(money.retires));
  assert.deepEqual(
    hsbc.filter((r) => r.to !== undefined),
    HANDED.map((id) => ({ id, rows: 0, to: 'bank-hsbc-eg', to_name: 'HSBC Egypt' })),
    'a handed door was filed as a retire',
  );
  assert.equal(hsbc.filter((r) => r.to === undefined).length, 10, 'a door nobody used was filed as handed');
  sql.close();
});

/*
 * AND AFTER IT IS ACCEPTED, THE PACK HOLDING THE DOOR IS NOT INSTALLED, and the arrangement said it was. `packStates` reads
 * a pack by its live declarations, so `bank-hsbc-eg` came back on, with no version, the one door under it; the overview
 * listed it among the packs and left it out of what is on offer, and a proposal to install it was refused
 * `TRANSITION_ILLEGAL` "bank-hsbc-eg is already installed and on, at its version". Measured on this record before the
 * arranger read a handover: the owner could neither be offered the pack nor install it through Decide.
 */
test('A PACK HANDED A DOOR AND NEVER INSTALLED IS SAID AS HANDED, OFFERED, AND INSTALLS through Decide over the door it holds', async () => {
  const { sql, api } = await recordAt170();
  const update = value<{ id: string }>(await api.propose({ question: 'Newer Money?', body_kind: 'pack', body: { install: 'money-core' } } as never, agent));
  value(await api.decide(accept(update.id), owner));

  /* THE KERNEL SAYS SO ITSELF, so no reader of `packStates` has to work it out from the declarations again. */
  const handedIn = () => api.kernel.packStates().filter((p) => p.handed === true).map((p) => p.id);
  assert.deepEqual(handedIn(), ['bank-hsbc-eg']);
  const seen = value<{ packs: { id: string; handed?: true }[]; offer: { id: string }[] }>(await api.arrangement({}, agent));
  assert.deepEqual(seen.packs.find((p) => p.id === 'bank-hsbc-eg'), { id: 'bank-hsbc-eg', handed: true });
  assert.ok(seen.offer.some((e) => e.id === 'bank-hsbc-eg'), 'a pack never installed was not offered');

  const filed = value<{ id: string }>(await api.propose({ question: 'HSBC Egypt?', body_kind: 'pack', body: { install: 'bank-hsbc-eg' } } as never, agent));
  const row = value<{ body: { plan: { pack: string; from?: string; adds: string[] }[] } }>(await api.governance({ id: filed.id }, owner));
  const hsbc = row.body.plan.find((p) => p.pack === 'bank-hsbc-eg');
  assert.ok(hsbc && hsbc.from === undefined && hsbc.adds.includes('ingest.bank-ipn-in-sms'), JSON.stringify(row.body.plan));
  value(await api.decide(accept(filed.id), owner));
  assert.equal(api.kernel.packs().find((p) => p.id === 'bank-hsbc-eg')?.version !== undefined, true, 'the pack has no row after its install');
  assert.deepEqual(handedIn(), []);
  const after = value<{ packs: { id: string; handed?: true }[] }>(await api.arrangement({}, agent));
  assert.equal(after.packs.find((p) => p.id === 'bank-hsbc-eg')?.handed, undefined);
  sql.close();
});

/*
 * AND IT CAN STILL BE TURNED OFF. Reading a handed pack as not installed first took this away as well: `{"disable":
 * "bank-hsbc-eg"}` was refused `DECLARATION_UNKNOWN` "not installed here, so it cannot be turned off", where before the
 * arranger read handovers the same proposal was filed, accepted, and the door went off. The door is live and answering
 * the owner's Shortcut, so turning it off is the one thing Decide must keep offering while the pack is not installed.
 */
test('A HANDED PACK CAN STILL BE TURNED OFF through Decide, which stops the door it holds', async () => {
  const { sql, api } = await recordAt170();
  const update = value<{ id: string }>(await api.propose({ question: 'Newer Money?', body_kind: 'pack', body: { install: 'money-core' } } as never, agent));
  value(await api.decide(accept(update.id), owner));

  const off = value<{ id: string }>(await api.propose({ question: 'HSBC Egypt off?', body_kind: 'pack', body: { disable: 'bank-hsbc-eg' } } as never, agent));
  value(await api.decide(accept(off.id), owner));
  assert.notEqual(api.kernel.packStates().find((p) => p.id === 'bank-hsbc-eg')?.disabled_at ?? null, null, 'the handed door is still on');
  assert.equal(api.kernel.declarations().some((x) => x.id === 'ingest.bank-ipn-in-sms'), false, 'the handed door is still live');
  sql.close();
});

/*
 * AND THE USE-CASE PLANNER SAID THE SAME DOOR AS RETIRED. `usecase.ts` copied `diff.retires` as ids, dropping `to`, so a
 * use case built on money-core, planned on this record, listed the door his Shortcut posts to among what the update takes
 * away. Measured red first: `retires` held `ingest.bank-ipn-in-sms` and nothing said where it went.
 */
test('A USE CASE PLANNED OVER THE UPDATE NAMES THE HANDED DOOR APART, with the pack it goes to', async () => {
  const { sql, api } = await recordAt170();
  const file = { usecase: 'money-look', version: '1.0.0', title: 'Money look', summary: 's', author: 'a', license: 'MIT', audience: 'other', tone: 't', modules: ['money-core'] };
  const planned = value<{ packs: { id: string; retires: string[]; hands?: { id: string; to: string }[] }[] }>(
    await api.planUseCase({ doc: file, modules: { 'money-core': firstPartyDocument('money-core') } }, owner),
  );
  const money = planned.packs.find((p) => p.id === 'money-core');
  assert.ok(money, JSON.stringify(planned.packs.map((p) => p.id)));
  assert.deepEqual(money.hands, HANDED.map((id) => ({ id, to: 'bank-hsbc-eg' })));
  for (const id of HANDED) assert.equal(money.retires.includes(id), false, `${id}, handed, was said as retired`);
  assert.equal(money.retires.filter((r) => HSBC.includes(r)).length, 10);
  sql.close();
});
