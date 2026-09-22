/**
 * The Shortcut's door stays open while HSBC Egypt's wordings move from money-core to `bank-hsbc-eg`
 * (`loop/research-batch-thirty-two-audit.md` §3).
 *
 * THE UPDATE SHUT IT, AND NOTHING IN THE PLAN SAID SO. Measured through `@braindog/record` on a record at money-core
 * 1.7.0 with a path token minted for `bank-from-out-sms`: `ingestVerify` answered the digest, the update to 1.8.0
 * retired the twelve, and from then until `bank-hsbc-eg` was installed it answered `null`, which the door turns into a
 * 404 before it reads a byte, so every text his iPhone posted was refused and not stored. After the pack it answered
 * `{ kind: 'none' }`, a token nobody had minted. The plan named twelve retires and never the pack that declares them.
 *
 * SO money-core HANDS THEM OVER rather than dropping them (`MONEY_CORE_HANDS`, and `hands` in `declare`). The plan's
 * retire lines name `bank-hsbc-eg`, the declarations are never retired, and the token minted before the update is
 * the token that opens the door after both steps.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createHash } from 'node:crypto';

import type { Diff } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, NOW, firstPartyDocument } from '../../seed/src/index.ts';
import { HSBC_EG_INGESTS, HSBC_EG_SMS_INGESTS, MONEY_CORE_HANDS, bankHsbcEgPack } from '../../seed/src/packs/bank-hsbc-eg.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Body = Record<string, unknown>;
type Doc = { pack: string; version: string; declarations: Body[]; hands?: Record<string, string> };
type Api = Awaited<ReturnType<typeof createRecordApi>>;

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** The twelve, spelled out for `bank-pack.test.ts`'s reason: a list read from the constant passes when both lose one. */
const HSBC = [
  'ingest.bank-card-used', 'ingest.bank-card-used-sms', 'ingest.bank-from-in', 'ingest.bank-from-in-sms',
  'ingest.bank-from-out', 'ingest.bank-from-out-sms', 'ingest.bank-from-unsure', 'ingest.bank-from-unsure-sms',
  'ingest.bank-ipn-in', 'ingest.bank-ipn-in-sms', 'ingest.bank-ipn-out', 'ingest.bank-ipn-out-sms',
];

/** money-core as 1.7.0 shipped it, built the way `bank-pack.test.ts` builds it: today's document with the twelve put back. */
const v170 = (): Doc => {
  const d = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  d.version = '1.7.0';
  delete d.hands;
  const hsbc = [...Object.values(HSBC_EG_INGESTS), ...Object.values(HSBC_EG_SMS_INGESTS)].map((i) => ({ ...structuredClone(i), pack: 'money-core' }));
  d.declarations = [...d.declarations.filter((x) => !HSBC.includes(`ingest.${String(x.ingest)}`)), ...(hsbc as unknown as Body[])];
  return d;
};

/** money-core 1.8.0 handing the twelve to `bank-hsbc-eg`. */
const v180 = (): Doc => ({ ...(structuredClone(firstPartyDocument('money-core')) as unknown as Doc), hands: { ...MONEY_CORE_HANDS } });

async function put(api: Api, doc: unknown): Promise<Diff> {
  const diff = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
  return diff;
}

test('MONEY_CORE_HANDS names exactly the twelve, each to bank-hsbc-eg', () => {
  assert.deepEqual(Object.keys(MONEY_CORE_HANDS).sort(), HSBC);
  assert.deepEqual([...new Set(Object.values(MONEY_CORE_HANDS))], ['bank-hsbc-eg']);
});

test('A TOKEN MINTED ON 1.7.0 OPENS THE DOOR AFTER THE UPDATE AND AFTER THE PACK, and the plan names the pack', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of FIRST_PARTY) await put(api, id === 'money-core' ? v170() : firstPartyDocument(id));
  const minted = said<{ token: string }>(await api.ingestMint({ ingest: 'bank-from-out-sms' }, owner));
  const door = { kind: 'path', sha256: sha256(minted.token) };
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), door);

  const update = await put(api, v180());
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), door, 'the door shut between the two steps');
  assert.deepEqual(update.conflicts, []);
  assert.equal(update.orphans, 0);
  assert.deepEqual(update.retires.map((r) => r.id).sort(), HSBC);
  /* ONLY THE DOOR WITH A TOKEN IS HANDED: the record names what it uses (`installedState`'s `used`), and the other eleven,
     which nothing here used, retire and come back fresh with the pack. */
  for (const r of update.retires)
    assert.equal(r.to, r.id === 'ingest.bank-from-out-sms' ? 'bank-hsbc-eg' : undefined, `${r.id} retires to the wrong place`);

  const bank = await put(api, bankHsbcEgPack());
  assert.deepEqual(bank.conflicts, []);
  assert.deepEqual(bank.adds.map((a) => a.id).sort(), HSBC);
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), door, 'the owner has to mint again');

  const owners = api.kernel.declarations().filter((d) => HSBC.includes(d.id)).map((d) => d.pack_id);
  assert.deepEqual([...new Set(owners)], ['bank-hsbc-eg']);
  assert.equal(owners.length, 12);
  assert.ok(api.kernel.packs().some((p) => p.id === 'bank-hsbc-eg' && p.version === '1.0.0'));
  sql.close();
});

test('A PATTERN THE OWNER CHANGED IS HIS, so it is not handed, and the pack is refused on it until he retires it', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of FIRST_PARTY) await put(api, id === 'money-core' ? v170() : firstPartyDocument(id));
  const k = api.kernel;
  const mine = k.declarations().find((d) => d.id === 'ingest.bank-ipn-in')!;
  const b = JSON.parse(mine.body) as Body & { skip: unknown[] };
  said(await api.setDeclaration({ body: { ingest: b.ingest, ...b, skip: [...b.skip, { when: { field: 'body', contains: 'test transfer' }, reason: 'Mine.' }] }, version: mine.version } as never, owner));

  const update = await put(api, v180());
  assert.deepEqual(update.retires.map((r) => r.id).sort(), HSBC.filter((id) => id !== 'ingest.bank-ipn-in'));
  assert.equal(k.declarations().find((d) => d.id === 'ingest.bank-ipn-in')?.pack_id, null);

  const bank = said<{ diff: Diff }>(await api.planPack({ doc: bankHsbcEgPack(), source: { kind: 'local' } } as never, owner)).diff;
  assert.deepEqual(bank.conflicts, [{ id: 'ingest.bank-ipn-in', pack: '(this record)' }]);
  sql.close();
});
