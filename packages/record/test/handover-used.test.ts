/**
 * The record says which doors it has put to work, so money-core's update hands on only those
 * (`loop/research-batch-thirty-four-audit.md` §8, the record's half).
 *
 * `plan` learned to hand a `hands` entry only when the record uses it (`Installed.used`), and a caller that says nothing
 * gets everything handed as before. The record said nothing, so on every real record money-core 1.8.0 still handed all
 * twelve HSBC Egypt doors to `bank-hsbc-eg`, a pack the owner never chose. `installedState` now names every ingest that
 * has filed an arrival (`ingest_receipt`) and every webhook door that holds a token (`heldDigest`), and, since audit
 * thirty-six's finding 2, every door that has claimed an arrival at all, which is a door whose lines wait in review.
 *
 * THE UPDATE PLANNED IS money-core WITH THE `hands` IT SHIPPED FROM 1.8.0 UNTIL 2.4.0 STOPPED NAMING OTHER PACKS
 * (`seed/test/pack-files.ts`), because what this holds is the record's half of a handover, and today's document hands
 * nothing to be halved.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, NOW, firstPartyDocument } from '../../seed/src/index.ts';
import { HSBC_EG_INGESTS, HSBC_EG_SMS_INGESTS, handingAsShipped } from '../../seed/test/pack-files.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

type Body = Record<string, unknown>;
type Doc = { pack: string; version: string; declarations: Body[] };
type Retire = { id: string; to?: string };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const HSBC = [...Object.values(HSBC_EG_INGESTS), ...Object.values(HSBC_EG_SMS_INGESTS)].map((i) => `ingest.${(i as { ingest: string }).ingest}`);

/** money-core as 1.7.0 shipped it, the twelve its own, as `seed/test/bank-pack.test.ts` builds it. */
const v170 = (): Doc => {
  const d = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  d.version = '1.7.0';
  delete (d as { hands?: unknown }).hands;
  const hsbc = [...Object.values(HSBC_EG_INGESTS), ...Object.values(HSBC_EG_SMS_INGESTS)].map((i) => ({ ...structuredClone(i), pack: 'money-core' }));
  d.declarations = [...d.declarations.filter((x) => !HSBC.includes(`ingest.${String(x.ingest)}`)), ...(hsbc as unknown as Body[])];
  return d;
};

test('THE RECORD NAMES WHAT IT USES, SO THE UPDATE HANDS A DOOR THAT FILED A ROW, A DOOR WITH A TOKEN AND THE DOOR THAT ONE NAMES, and retires the other nine', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  type Planned = { diff: { planHash: string; approve?: string[]; retires: Retire[] } };
  const put = async (doc: unknown) => {
    const { diff } = value<Planned>(await api.planPack({ doc }, owner));
    value(await api.installPack({ doc, planHash: diff.planHash, approve: diff.approve } as never, owner));
  };
  for (const id of FIRST_PARTY) await put(id === 'money-core' ? v170() : firstPartyDocument(id));

  /* A PATTERN THAT FILED A ROW: the account the line names, so the arrival files one rather than waiting in review. */
  value(api.kernel.create('accounts', { name: 'Cairo credit card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, as_of: '2026-08-01', liquid: false, last4: '9052' }, { actor: 'p_seed' }));
  const out = value<{ ingest: string | null; state: string; reason?: string }>(
    api.kernel.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'HSBC' }, body: 'Your Credit Card ending with *** 9052 has been used for EGP 1,284.50 on 14/08/2026 at CEDAR LANE BAKERY. Your available limit is EGP 23,715.50', sha256: 'handover-used-1' }),
  );
  assert.deepEqual([out.ingest, out.state], ['bank-card-used', 'matched'], out.reason);
  /* AND A DOOR HIS SHORTCUT POSTS TO: a webhook twin with a token minted for it. */
  value(await api.ingestMint({ ingest: 'bank-ipn-in-sms' }, owner));

  const { diff } = value<Planned>(await api.planPack({ doc: handingAsShipped(firstPartyDocument('money-core')) }, owner));
  const hsbc = diff.retires.filter((r) => HSBC.includes(r.id));
  /* `bank-from-out-sms` IS HANDED FOR `bank-ipn-in-sms`, which names it through `door:` and goes to the same pack
     (`declare/test/door-follows-patterns.test.ts`). It filed nothing and holds no token. */
  assert.deepEqual(hsbc.filter((r) => r.to !== undefined).map((r) => [r.id, r.to]).sort(), [
    ['ingest.bank-card-used', 'bank-hsbc-eg'],
    ['ingest.bank-from-out-sms', 'bank-hsbc-eg'],
    ['ingest.bank-ipn-in-sms', 'bank-hsbc-eg'],
  ]);
  assert.equal(hsbc.filter((r) => r.to === undefined).length, 9, 'a door nobody used was handed');
  sql.close();
});

test('A DOOR WHOSE ARRIVALS WAIT IN REVIEW IS A DOOR IN USE, so bank-from-unsure is handed and not retired (audit thirty-six, finding 2)', async () => {
  /* THE CASE ABOVE PUTS THE ACCOUNT ON FILE SO THE LINE FILES A ROW, which is exactly the one that passed. Measured on
     the record as it stood: `bank-from-unsure` files at `needs-review` by design, so it leaves a suggestion and never an
     `ingest_receipt`, and the plan retired it with the other eleven; after money-core 1.8.0 installed, the next such
     line arrived `untriaged`, claimed by nothing. The claim itself is an event signed `ingest:bank-from-unsure`. */
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  type Planned = { diff: { planHash: string; approve?: string[]; retires: Retire[] } };
  const put = async (doc: unknown) => {
    const { diff } = value<Planned>(await api.planPack({ doc }, owner));
    value(await api.installPack({ doc, planHash: diff.planHash, approve: diff.approve } as never, owner));
  };
  for (const id of FIRST_PARTY) await put(id === 'money-core' ? v170() : firstPartyDocument(id));

  value(api.kernel.create('accounts', { name: 'Cairo current account', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: '2026-08-01', liquid: true, last4: '846' }, { actor: 'p_seed' }));
  const out = value<{ ingest: string | null; state: string; reason?: string }>(
    api.kernel.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'HSBC' }, body: 'From HSBC: 01AUG26 Transfer from NADIA FARID to 310-527***-846 EGP 418.62 - Your available balance is EGP 33,540.25', sha256: 'handover-used-review' }),
  );
  assert.deepEqual([out.ingest, out.state], ['bank-from-unsure', 'review'], out.reason);
  assert.equal(sql.all('SELECT ingest_id FROM ingest_receipt').length, 0, 'the line filed a row, so this is the case above');

  const { diff } = value<Planned>(await api.planPack({ doc: handingAsShipped(firstPartyDocument('money-core')) }, owner));
  const handed = diff.retires.filter((r) => HSBC.includes(r.id) && r.to !== undefined).map((r) => [r.id, r.to]);
  assert.deepEqual(handed, [['ingest.bank-from-unsure', 'bank-hsbc-eg']]);
  sql.close();
});
