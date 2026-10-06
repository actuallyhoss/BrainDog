/**
 * A list that leaves one pack for another with its rows.
 *
 * EITHER ORDER WAS REFUSED, AND "MOVE THEM FIRST" HAD NOWHERE TO MOVE THEM TO. Driven through `createRecordApi` with
 * every first-party pack installed and one `holdings` row written, before `hands` existed:
 *
 *     holdings 1.0.0, declaring register.holdings    PROVIDES_CONFLICT  "register.holdings belongs to money-core"
 *     money-core 2.0.0, without register.holdings    WOULD_ORPHAN       "... there are 1 rows in it. Move them first."
 *
 * money-core cannot let go of a list that holds rows and no other pack can take it while money-core holds it, so every
 * list §22 wants out of a first-party pack (`holdings` first) was stuck where it was.
 *
 * SO THE OLD PACK'S NEXT VERSION SAYS WHERE THE LIST GOES, as `hands: { 'register.holdings': 'holdings' }`, and its
 * install gives the declaration to that pack instead of retiring it: the kernel row's pack changes and nothing else
 * does. The receiving pack's install then takes over what is already its own, and anything the record's list holds that
 * the receiving body lacks (here the value `gold`, which a row is written under) stays as the record's own addition,
 * the way `plan-additive.test.ts` keeps `lane.sold`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, type Diff } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument } from '../../seed/src/index.ts';
import { holdings100 as shippedHoldings } from '../../seed/test/pack-files.ts';
import { asMoneyCore180 } from '../../seed/test/money-core-earlier.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Body = Record<string, unknown>;
type Field = { id: string; type: string; values?: string[]; [k: string]: unknown };
type Doc = { pack: string; version: string; declarations: Body[]; hands?: Record<string, string>; [k: string]: unknown };
type Api = Awaited<ReturnType<typeof createRecordApi>>;

/**
 * money-core as it ships (without `holdings` since 2.0.0), handing the list to `to` when there is one and to nobody when not.
 *
 * FROM THE SHIPPED DOCUMENT AND NOT A RE-VERSIONED COPY OF IT. This once took money-core 1.8.0, dropped the
 * list and called the result 2.0.0; now the shipped 2.0.0 is that document, handing `register.holdings` to
 * `holdings`. Since money-core stopped naming other packs it hands nothing else, so the one entry
 * this file varies is the whole of `hands`.
 *
 * READ AGAIN AT 3.0.0: 3.0.0 still declares no `holdings` and hands nothing, and the `holdings` pack asks for
 * money-core `>=2.0.0`, which 3.0.0 is. So a record on 1.8.0 updating straight to 3.0.0 takes the same step 2.0.0 was.
 */
const moneyCore = (to: string | null): Doc => {
  const d = structuredClone(firstPartyDocument('money-core')) as unknown as Doc;
  assert.equal(d.version.split('.')[0], '3', 'money-core left 3.x, so the list it hands is worth reading again');
  assert.deepEqual(Object.keys(d.hands ?? {}), [], 'money-core hands a list of its own again, so what this file varies is not the whole of it');
  assert.ok(!d.declarations.some((x) => x.register === 'holdings'), 'money-core declares holdings again, so nothing here is a handover');
  const { 'register.holdings': _shipped, ...rest } = d.hands ?? {};
  d.hands = to === null ? rest : { ...rest, 'register.holdings': to };
  return d;
};

/**
 * The `holdings` pack as it shipped at 1.0.0 (`packs/holdings/holdings-1.0.0.json`), under another id or with other `requires` when a
 * guard below needs one. Its kinds carry no `gold`, since gold is not one of the shipped values, and `commodity` in
 * its place.
 *
 * THE PACK THAT SHIPS, NOT A BODY CUT OUT OF money-core. This used to clone money-core's list and strip `gold` by hand,
 * which proved the handover for a pack nobody ships. Built from `shippedHoldings()`, the first two tests below are the
 * update a record on money-core 1.8.0 actually takes.
 */
const holdingsPack = (id = 'holdings', requires?: Record<string, string>): Doc => {
  const d = structuredClone(shippedHoldings()) as unknown as Doc & { requires: { packs: Record<string, string> } };
  d.pack = id;
  for (const body of d.declarations) body.pack = id;
  if (requires !== undefined) d.requires = { ...d.requires, packs: requires };
  return d;
};

async function planned(api: Api, doc: unknown): Promise<Diff> {
  return said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
}

async function put(api: Api, doc: unknown): Promise<{ diff: Diff; out: Out }> {
  const diff = await planned(api, doc);
  const out = (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
  return { diff, out };
}

/**
 * Every first-party pack installed through the record, money-core AS 1.8.0, and one row of gold in `holdings`.
 *
 * 1.8.0 BECAUSE IT IS THE LAST money-core THAT DECLARES THE LIST. With today's documents the record has no `holdings` at
 * all, the `create` below is refused, and every test in this file went red at that line, before any
 * handover was tried. `asMoneyCore180` rebuilds 1.8.0 byte for byte (`seed/test/money-core-major.test.ts` holds its
 * fingerprint to the recorded one).
 */
async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 22, 12)) });
  for (const id of FIRST_PARTY) said((await put(api, id === 'money-core' ? asMoneyCore180(firstPartyDocument(id)) : firstPartyDocument(id))).out);
  const k = api.kernel;
  const row = said<{ id: string }>(k.create('holdings', { label: 'Gold 24c', kind: 'gold', qty: 10, unit_cost: { amount: 4120000, currency: 'EGP' } }, { actor: 'p_1' }));
  return { sql, api, k, row };
}

const live = (k: Api['kernel'], id: string) => k.declarations().find((d) => d.id === id);
const kinds = (k: Api['kernel']): string[] =>
  ((JSON.parse(live(k, 'register.holdings')!.body) as { fields: Field[] }).fields.find((f) => f.id === 'kind')?.values ?? []) as string[];

test('money-core HANDS holdings to a pack of its own, which takes it with the row, its id and its history untouched', async () => {
  const { sql, api, k, row } = await record();
  const was = JSON.stringify(k.get(row.id));
  const history = JSON.stringify(k.history(row.id));

  const step = await put(api, moneyCore('holdings'));
  said(step.out);
  /* NAMED IN THE PLAN, NOT ORPHANED BY IT. The retire line says where the list goes, which is what the owner reads. */
  assert.deepEqual(step.diff.retires.map(({ id, rows, to }) => ({ id, rows, to })), [{ id: 'register.holdings', rows: 1, to: 'holdings' }]);
  assert.equal(step.diff.orphans, 0);
  assert.equal(live(k, 'register.holdings')?.pack_id, 'holdings', 'the list is still money-core’s, or was retired');
  assert.equal(JSON.stringify(k.get(row.id)), was);

  const take = await put(api, holdingsPack());
  assert.deepEqual(take.diff.conflicts, []);
  assert.deepEqual(take.diff.adds.map((a) => [a.id, a.handed]), [['register.holdings', true]]);
  /* THE RECORD'S OWN VALUE STAYS: a row is written under `gold`, and the pack that takes the list does not ship it. */
  assert.deepEqual(take.diff.kept.map((x) => [x.id, x.adds]), [['register.holdings', ['kind.gold']]]);
  said(take.out);

  assert.deepEqual(kinds(k), ['certificate', 'policy', 'commodity', 'other', 'gold']);
  assert.equal(live(k, 'register.holdings')?.pack_id, null, 'the additions are the record’s own, as plan-additive keeps them');
  assert.deepEqual(k.detached().filter((d) => d.id === 'register.holdings').map((d) => d.was), ['holdings']);
  assert.deepEqual(
    k.packs().filter((p) => p.id === 'holdings' || p.id === 'money-core').map((p) => ({ id: p.id, version: p.version })),
    [{ id: 'holdings', version: '1.0.0' }, { id: 'money-core', version: FIRST_PARTY_VERSIONS['money-core'] }],
  );
  assert.equal(JSON.stringify(k.get(row.id)), was, 'the row moved');
  assert.equal(JSON.stringify(k.history(row.id)), history, 'the row’s history was touched');
  said(k.create('holdings', { label: 'Gold 21c', kind: 'gold', qty: 1, unit_cost: { amount: 480000, currency: 'EGP' } }, { actor: 'p_1' }));
  sql.close();
});

test('THE OTHER ORDER IS REFUSED, and the refusal names the update that has to come first; then it ends the same', async () => {
  const { sql, api, k } = await record();
  const early = await put(api, holdingsPack());
  assert.deepEqual(early.diff.conflicts, [{ id: 'register.holdings', pack: 'money-core' }]);
  assert.equal(early.out.refusal?.code, 'PROVIDES_CONFLICT');
  assert.match(early.out.refusal?.fix ?? '', /money-core 1\.8\.0, and holdings needs money-core >=2\.0\.0/u);
  assert.match(early.out.refusal?.fix ?? '', /Update money-core first/u);

  said((await put(api, moneyCore('holdings'))).out);
  said((await put(api, holdingsPack())).out);
  assert.deepEqual(kinds(k), ['certificate', 'policy', 'commodity', 'other', 'gold']);
  assert.deepEqual(k.detached().filter((d) => d.id === 'register.holdings').map((d) => d.was), ['holdings']);
  sql.close();
});

test('GUARDS: a drop without hands still orphans, and a pack hands did not name still conflicts', async () => {
  const { sql, api } = await record();
  const dropped = await put(api, moneyCore(null));
  assert.equal(dropped.out.refusal?.code, 'WOULD_ORPHAN');
  assert.equal(dropped.diff.orphans, 1);

  /* A PACK THAT DOES NOT ASK FOR THE STEP gets the sentence it always got. */
  const stranger = await put(api, holdingsPack('holdings', {}));
  assert.equal(stranger.out.refusal?.code, 'PROVIDES_CONFLICT');
  assert.equal(stranger.out.refusal?.fix, 'register.holdings belongs to money-core, and two packs cannot own one declaration.');

  said((await put(api, moneyCore('holdings'))).out);
  const other = await put(api, holdingsPack('vault-list', {}));
  assert.deepEqual(other.diff.conflicts, [{ id: 'register.holdings', pack: 'holdings' }]);
  assert.equal(other.out.refusal?.code, 'PROVIDES_CONFLICT');
  sql.close();
});

/**
 * A HANDOVER TO A PACK THE RECORD ALREADY HAS WAS A LIST THAT PACK COULD NEVER LET GO OF. Measured:
 * money-core 2.0.0 handing `register.holdings` to `work`, which is installed and does not declare it,
 * went through, and from then on every update of `work`, and a reinstall of the same file, was `WOULD_ORPHAN`
 * ("work upgrades away register.holdings"), because the list now sat under a pack whose own file never named it.
 *
 * THE RECORD NOW SAYS WHAT WAS HANDED (`Installed.handed`, read off the installed manifests), so the handover goes
 * through with the row, and `work`'s own updates leave the list it was handed where it is. A caller that cannot say
 * still gets the retire, and `hands-installed.test.ts` holds that half on the kernel.
 */
test('A HANDOVER TO AN INSTALLED PACK GOES THROUGH WITH ITS ROW, and that pack still updates', async () => {
  const { sql, api, k } = await record();
  const step = await put(api, moneyCore('work'));
  assert.deepEqual(step.diff.retires.map(({ id, rows, to }) => ({ id, rows, to })), [{ id: 'register.holdings', rows: 1, to: 'work' }]);
  said(step.out);
  assert.equal(live(k, 'register.holdings')?.pack_id, 'work');
  const again = await put(api, firstPartyDocument('work'));
  said(again.out);
  assert.deepEqual(again.diff.retires, [], 'work retired the list it was handed');
  assert.equal(live(k, 'register.holdings')?.pack_id, 'work');
  assert.equal(k.count('holdings'), 1);
  sql.close();
});

test('A LIST HANDED OVER HAS HAD ITS EXAMPLES, so the pack that takes it plants none', async () => {
  const { sql, api, k } = await record();
  said((await put(api, moneyCore('holdings'))).out);
  const doc = { ...holdingsPack(), seeds: [{ register: 'holdings', fields: { label: 'Example bond', kind: 'certificate', qty: 1 } }] };
  const take = await put(api, doc);
  assert.equal(take.diff.seeds.count, 0);
  said(take.out);
  assert.equal(k.count('holdings'), 1);
  sql.close();
});

test('A PACK CANNOT HAND WHAT IT STILL DECLARES, hand to itself, or hand something that is not a declaration id', async () => {
  const base = holdingsPack('holdings', {});
  const refused = async (hands: unknown, at: string) => {
    const r = (await normalise({ ...base, hands })) as Out;
    assert.equal(r.refusal?.code, 'PACK_MALFORMED', JSON.stringify(hands));
    assert.equal(r.refusal?.at, at);
  };
  await refused({ 'register.holdings': 'elsewhere' }, 'hands.register.holdings');
  await refused({ 'register.gone': 'holdings' }, 'hands.register.gone');
  await refused({ 'holdings': 'elsewhere' }, 'hands.holdings');
  await refused({ 'register.gone': 'Not A Pack' }, 'hands.register.gone');
  await refused(['register.gone'], 'hands');

  /* AND WHAT IT HANDS IS PART OF THE FILE, so two documents that hand differently are two checksums. */
  const plain = said<{ checksum: string }>(await normalise(base));
  const handing = said<{ checksum: string; manifest: { hands?: Record<string, string> } }>(await normalise({ ...base, hands: { 'register.gone': 'elsewhere' } }));
  assert.notEqual(plain.checksum, handing.checksum);
  assert.deepEqual(handing.manifest.hands, { 'register.gone': 'elsewhere' });
});
