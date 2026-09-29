/**
 * Every first-party pack's `hands` sends each pattern and the door it names to one pack
 * (`declare`'s `hands-names-door.test.ts` holds the rule).
 *
 * THE PLAN USED TO HAND A DOOR WITH ITS PATTERN WHATEVER `hands` SAID, so a `hands` that named the pattern and not its
 * door installed and nobody learned it was short a line. `installFault` now refuses one, at `hands.<pattern>`, and this
 * holds that no pack this build ships is that file. None hands anything since money-core 2.4.0 stopped naming other
 * packs (`money-core-names-no-pack.test.ts`), so the rule is also asked of money-core as it shipped from 1.8.0 to 2.4.0,
 * which is the one `hands` that ever reached a record: its twelve HSBC Egypt patterns went to `bank-hsbc-eg`, five of
 * them arriving through `door: bank-from-out-sms`, the sixth text pattern, and `holdings` went to its own pack. The
 * receiving packs are the files in `packs/` (`pack-files.ts`). The last test drops the door's line from that `hands`
 * and expects the refusal, so a check that refuses nothing cannot pass here.
 *
 * THE RECORD IS BUILT, NOT INSTALLED. A record on money-core 1.7.0 cannot be made from today's documents, so the plan is
 * asked of one that holds every pack at the version shipped, with each handed declaration still under the pack that
 * hands it and put to work (`used`), which is what makes the plan hand it rather than retire it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installFault, normalise, plan, type Installed, type Pack } from '@braindog/declare';

import { FIRST_PARTY, agentsPackDocument, firstPartyDocument } from '../src/index.ts';
import { bankHsbcEgFile, handingAsShipped, holdingsFile } from './pack-files.ts';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

type Doc = Record<string, unknown> & { hands?: Record<string, string> };
const DOCS: Doc[] = [...FIRST_PARTY.map((id) => firstPartyDocument(id) as Doc), bankHsbcEgFile(), holdingsFile(), agentsPackDocument()];

/** money-core with the `hands` it carried from 1.8.0 to 2.4.0. */
const handingMoney = (): Doc => handingAsShipped(firstPartyDocument('money-core') as Doc);

async function packsOf(docs: readonly Doc[]): Promise<Pack[]> {
  const out: Pack[] = [];
  for (const doc of docs) out.push(value<Pack>(await normalise(doc, { kind: 'local' })));
  return out;
}

/**
 * Every pack but the ones `giver` hands to, at the version shipped, and under `giver` what it hands, with the body the
 * receiving pack declares it with.
 */
function recordFor(giver: Pack, packs: readonly Pack[]): Installed {
  const hands = giver.manifest.hands ?? {};
  const receivers = new Set(Object.values(hands));
  const row = (id: string, kind: Installed['declarations'][number]['kind'], pack: string, body: string): Installed['declarations'][number] => ({
    id,
    version: 1,
    kind,
    pack_id: pack,
    body,
    checksum: id,
  });
  const declarations: Installed['declarations'] = [];
  for (const p of packs) if (!receivers.has(p.manifest.pack)) for (const d of p.declarations) declarations.push(row(d.id, d.kind, p.manifest.pack, d.canonical));
  for (const [id, to] of Object.entries(hands)) {
    const declared = packs.find((p) => p.manifest.pack === to)?.declarations.find((d) => d.id === id);
    assert.ok(declared, `${giver.manifest.pack} hands ${id} to ${to}, which does not declare it`);
    declarations.push(row(id, declared.kind, giver.manifest.pack, JSON.stringify({ ...declared.body, pack: giver.manifest.pack })));
  }
  return {
    format: 1,
    primitives: 1,
    record_version: 1,
    packs: packs.filter((p) => !receivers.has(p.manifest.pack)).map((p) => ({ id: p.manifest.pack, version: p.manifest.version, requires: p.manifest.requires.packs })),
    declarations,
    rows: {},
    used: Object.keys(hands),
  };
}

test('EVERY FIRST-PARTY PACK THAT HANDS A PATTERN ON HANDS ITS DOOR TO THE SAME PACK, and installFault refuses none', async () => {
  const packs = await packsOf(DOCS);
  const giving = packs.filter((p) => Object.keys(p.manifest.hands ?? {}).length > 0);
  assert.deepEqual(giving.map((p) => p.manifest.pack), [], 'the packs this build ships that hand anything on');
  const shipped = value<Pack>(await normalise(handingMoney(), { kind: 'local' }));
  let doors = 0;
  for (const giver of [...giving, shipped]) {
    const diff = await plan(giver, recordFor(giver, packs));
    const handed = Object.fromEntries(diff.retires.map((r) => [r.id, r.to ?? null]));
    for (const [id, to] of Object.entries(giver.manifest.hands ?? {})) assert.equal(handed[id], to, `${id} was not handed to ${to}`);
    doors += diff.retires.filter((r) => r.body !== undefined && typeof (JSON.parse(r.body) as { door?: unknown }).door === 'string').length;
    assert.equal(installFault(giver, diff), null, `${giver.manifest.pack}: ${JSON.stringify(installFault(giver, diff))}`);
  }
  /* FIVE OF THE TWELVE NAME A DOOR, so the rule was asked of a pattern and not passed over for want of one. */
  assert.equal(doors, 5);
});

test('money-core WITHOUT THE LINE FOR ITS SMS DOOR IS REFUSED at the hands of a pattern that arrives through it', async () => {
  const packs = await packsOf(DOCS);
  const doc = handingMoney();
  const { 'ingest.bank-from-out-sms': _door, ...short } = doc.hands!;
  const giver = value<Pack>(await normalise({ ...doc, hands: short }, { kind: 'local' }));
  const everything = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(giver, recordFor(everything, packs));
  const fault = installFault(giver, diff);
  assert.equal(fault?.code, 'DECLARATION_INVALID', JSON.stringify(fault));
  assert.match(fault?.at ?? '', /^hands\.ingest\.bank-[a-z-]+-sms$/u);
  assert.match(fault?.fix ?? '', /"ingest\.bank-from-out-sms": "bank-hsbc-eg"/u);
});
