/**
 * A handover to a pack whose file does not declare what it was handed.
 *
 * THE RECEIVING PACK'S FIRST INSTALL READ THE HANDED LIST AS ITS OWN, AND DROPPED IT. `plan` hands a declaration on to a
 * pack that is not installed, and that pack's first install takes over what its file declares. A handed id its file
 * does not declare met the retire loop as the pack's own, so a probe (money-core 2.0.0 handing
 * `register.holdings` with one row to a `notes-pack` that declares only `jots`) measured:
 *
 *     notes-pack install:      WOULD_ORPHAN "notes-pack installs away register.holdings, and there are 1 rows in it. Move them first."
 *     money-core 2.1.0 back:   PROVIDES_CONFLICT "register.holdings belongs to notes-pack, and two packs cannot own one declaration."
 *
 * and with no rows the install went through and retired the list, with nothing in its plan saying where it came from.
 * The one way out was `uninstallPack` on a pack that was never installed, and neither sentence named it.
 *
 * REFUSED AT THE RECEIVER, NOT PREVENTED AT THE GIVER, and not kept with the giver. The giver's plan cannot tell: the
 * receiver is by definition not installed, so its file is nowhere in `Installed`, which carries live rows and `pack` rows
 * and no manifest. Keeping the list with the giver until a receiver that declares it arrives would need the receiver's
 * plan to read the giver's `hands`, which `Installed` does not carry either, and the kernel reads the receiver's body as
 * the same version whenever it is byte for byte the handed one (as `bank-hsbc-eg`'s twelve are), so ownership would
 * never move. So the receiver's first install plans a handed id it does not declare as a conflict, and both refusals now
 * say the way out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Diff } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../seed/src/index.ts';
import { HOLDINGS_1_8_0, asMoneyCore180 } from '../../seed/test/money-core-earlier.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Body = Record<string, unknown>;
type Doc = { pack: string; version: string; declarations: Body[]; hands?: Record<string, string>; [k: string]: unknown };
type Api = Awaited<ReturnType<typeof createRecordApi>>;

/**
 * money-core at `version`, without `holdings` and handing it to `to`, or DECLARING it again when `to` is null.
 *
 * THE DECLARING ONE IS 1.8.0's DOCUMENT UNDER A LATER NUMBER, which was once simply the shipped file. Since
 * money-core 2.0.0 the shipped file has no `holdings`, so "the giver declaring it again" has to be built: `asMoneyCore180`
 * puts back the body 1.8.0 carried, byte for byte, and drops the handover of that one list.
 */
const moneyCore = (version: string, to: string | null): Doc => {
  const d = (to === null ? asMoneyCore180(firstPartyDocument('money-core')) : structuredClone(firstPartyDocument('money-core'))) as unknown as Doc;
  d.version = version;
  if (to === null) return d;
  d.declarations = d.declarations.filter((x) => x.register !== 'holdings');
  d.hands = { ...(d.hands ?? {}), 'register.holdings': to };
  return d;
};

/** A pack that has nothing to do with holdings: the probe's `notes-pack`, declaring one list of its own. */
const notesPack = (): Doc => ({
  pack: 'notes-pack',
  version: '1.0.0',
  summary: 'Notes.',
  author: 'Somebody',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'jots', name: 'Jots', title: 'what', fields: [{ id: 'what', type: 'text', required: true }], pack: 'notes-pack' }],
});

async function put(api: Api, doc: unknown): Promise<{ diff: Diff; out: Out }> {
  const diff = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  const out = (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
  return { diff, out };
}

/**
 * Every first-party pack installed with money-core AS 1.8.0, `rows` gold holdings written, and money-core 2.0.0 handing
 * the list to notes-pack.
 *
 * 1.8.0 FIRST BECAUSE IT IS THE LAST THAT DECLARES THE LIST: on today's money-core the record has no `holdings`, and all
 * four tests here went red at the `create` below, before notes-pack was ever planned.
 */
async function handed(rows: number) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 22, 12)) });
  for (const id of FIRST_PARTY) said((await put(api, id === 'money-core' ? asMoneyCore180(firstPartyDocument(id)) : firstPartyDocument(id))).out);
  const k = api.kernel;
  const ids: string[] = [];
  for (let i = 0; i < rows; i++) ids.push(said<{ id: string }>(k.create('holdings', { label: `Gold ${i}`, kind: 'gold', qty: 1, unit_cost: { amount: 480000, currency: 'EGP' } }, { actor: 'p_1' })).id);
  said((await put(api, moneyCore('2.0.0', 'notes-pack'))).out);
  assert.equal(live(k, 'register.holdings')?.pack_id, 'notes-pack', 'the handover itself is what handover.test.ts holds');
  return { sql, api, k, ids };
}

const live = (k: Api['kernel'], id: string) => k.declarations().find((d) => d.id === id);

test('A RECEIVER THAT DOES NOT DECLARE WHAT IT WAS HANDED is refused as a conflict naming the list and the way out, not WOULD_ORPHAN', async () => {
  const { sql, api, k } = await handed(1);
  const took = await put(api, notesPack());
  assert.deepEqual(took.diff.conflicts, [{ id: 'register.holdings', pack: 'notes-pack', handed: true }]);
  assert.deepEqual(took.diff.retires, [], 'the handed list is planned as the pack retiring its own');
  assert.equal(took.diff.orphans, 0);
  assert.equal(took.out.refusal?.code, 'PROVIDES_CONFLICT');
  assert.equal(
    took.out.refusal?.fix,
    'register.holdings was handed to notes-pack by the update of the pack that declared it, and notes-pack 1.0.0 does not declare it, so installing it would drop the list. Install a version of notes-pack that declares register.holdings, or remove notes-pack to let the pack that handed it declare it again.',
  );
  assert.equal(took.out.refusal?.at, 'register.holdings');
  assert.equal(live(k, 'register.holdings')?.pack_id, 'notes-pack');
  assert.equal(k.count('holdings'), 1);
  sql.close();
});

test('AN EMPTY HANDED LIST IS REFUSED THE SAME WAY, rather than retired by an install whose plan never said where it came from', async () => {
  /* HANDED WITH A ROW, THEN EMPTIED. The record names what it uses since (`installedState`'s `used`), so a list that is
     already empty when money-core stops declaring it is retired by that update and never handed at all
     (`seed/test/bank-pack.test.ts`). A list is empty under the receiver when its rows went after the handover. */
  const { sql, api, k, ids } = await handed(1);
  said(k.update('holdings', ids[0]!, { deleted_at: true }, { actor: 'p_1' }));
  assert.equal(k.count('holdings'), 0);
  const took = await put(api, notesPack());
  assert.deepEqual(took.diff.conflicts, [{ id: 'register.holdings', pack: 'notes-pack', handed: true }]);
  assert.deepEqual(took.diff.retires, []);
  assert.equal(took.out.refusal?.code, 'PROVIDES_CONFLICT');
  assert.ok(live(k, 'register.holdings'), 'the empty list was retired');
  sql.close();
});

test('THE GIVER DECLARING IT AGAIN IS TOLD THE HOLDER IS NOT INSTALLED, and removing the holder lets it, rows and all', async () => {
  const { sql, api, k, ids } = await handed(1);
  const was = JSON.stringify(k.get(ids[0]!));

  const back = await put(api, moneyCore('2.1.0', null));
  assert.equal(back.out.refusal?.code, 'PROVIDES_CONFLICT');
  assert.equal(
    back.out.refusal?.fix,
    "register.holdings belongs to notes-pack, and two packs cannot own one declaration. notes-pack is not installed: another pack's update handed register.holdings to it. Install notes-pack to take it over, or remove notes-pack to retire it, then install money-core.",
  );

  /* THE WAY OUT THE SENTENCE NAMES WORKS: the handed list is retired, its row kept, and money-core declares it again. */
  const gone = said<{ declarations: number; rows_kept: Record<string, number> }>(await api.uninstallPack({ id: 'notes-pack' } as never, owner));
  assert.deepEqual(gone, { pack: 'notes-pack', declarations: 1, rows_kept: { holdings: 1 } });
  said((await put(api, moneyCore('2.1.0', null))).out);
  assert.equal(live(k, 'register.holdings')?.pack_id, 'money-core');
  assert.equal(JSON.stringify(k.get(ids[0]!)), was, 'the row changed on the way back');
  sql.close();
});

test('A RECEIVER THAT DOES DECLARE IT still takes it over, and a later version that stops declaring it keeps it, rows and all', async () => {
  const { sql, api, k } = await handed(1);
  /* THE BODY AS IT WAS HANDED, 1.8.0's, and not the shipped holdings pack's. That one has no `gold`, the row here is gold,
     and a take-over that keeps a value the body lacks leaves the list the record's own (`handover.test.ts`), so the
     `pack_id` read below is null and says nothing about whether notes-pack took it. Measured with the shipped body in
     place: `actual: null, expected: 'notes-pack'`. */
  const doc = notesPack();
  doc.declarations.push({ ...structuredClone(HOLDINGS_1_8_0), pack: 'notes-pack' });
  const took = await put(api, doc);
  assert.deepEqual(took.diff.conflicts, []);
  assert.deepEqual(took.diff.adds.map((a) => [a.id, a.handed ?? false]), [['register.jots', false], ['register.holdings', true]]);
  said(took.out);
  assert.equal(live(k, 'register.holdings')?.pack_id, 'notes-pack');

  /* A VERSION OF IT WITHOUT THE LIST LEAVES IT WHERE IT IS. This was the ordinary retire, refused `WOULD_ORPHAN` for the
     row. The record now says what was handed (`Installed.handed`), and money-core's manifest still hands the list here,
     so the plan reads it as given to this pack and never retires it: the list stays live under notes-pack with its row,
     which is what the handover promised, and taking notes-pack out is what retires it. */
  const later = { ...notesPack(), version: '2.0.0' };
  const step = await put(api, later);
  assert.deepEqual(step.diff.conflicts, []);
  assert.deepEqual(step.diff.retires.filter((r) => r.id === 'register.holdings'), []);
  said(step.out);
  assert.equal(live(k, 'register.holdings')?.pack_id, 'notes-pack');
  assert.equal(k.count('holdings'), 1);
  sql.close();
});
