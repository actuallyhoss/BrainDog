/**
 * THE ADD-ON SOURCE (ENG-B20 job 1, `packages/record/src/reach.ts` `addonOffers`). Every catalogue entry here is
 * invented: an add-on is offered for what the record already holds, in one sentence with the count and the day it rests
 * on, by the catalogue's own title, and never by its id or a list's handle.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANKS, DOMAINS } from '../../../fixtures/names.ts';
import { LAPSE_DAYS, TIER } from '../src/design-agent.ts';
import type { Held } from '../src/design-agent.ts';
import { addonOffers, reachEntryOf, reachQueue, shapeFits } from '../src/reach.ts';
import type { AddonSignals, ReachCatalogueEntry } from '../src/reach.ts';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const DAY = 86_400_000;

/** A rates feed that runs once a day into the list whose role is the rates', and a bank feed that needs a key. */
const FEED: ReachCatalogueEntry = { id: 'dawn-rates-feed', title: 'Dawn rates', keeps: [{ list: 'xr_role', everyMs: DAY }], shapes: [], needsKey: false };
const BANK: ReachCatalogueEntry = {
  id: 'harbourline-alerts',
  title: `${BANKS[0]} alerts`,
  keeps: [],
  shapes: [`email:@${DOMAINS[0]}`],
  needsKey: false,
};

/** A record holding six figures converted on rates three weeks old. */
const signals = (over: Partial<AddonSignals> = {}): AddonSignals => ({
  catalogue: [FEED, BANK],
  installed: [],
  lists: [{ list: 'xr', role: 'xr_role', name: 'Rates', newest: '2026-09-28', rows: 31 }],
  figures: Array.from({ length: 6 }, (_, i) => ({ id: `fig_${i}`, reads: 'xr', oldest: '2026-09-28' })),
  arrivals: [],
  ...over,
});

test('SIX FIGURES ON RATES THREE WEEKS OLD AND A FEED IN THE CATALOGUE: one offer naming it, with the count and the day', () => {
  const offers = addonOffers(signals(), NOW);
  assert.equal(offers.length, 1, JSON.stringify(offers));
  const [o] = offers;
  assert.equal(o!.title, 'Turn on Dawn rates?');
  assert.equal(o!.why, '6 figures here use rates from 28 September.');
  assert.deepEqual(o!.change, { kind: 'install', pack: 'dawn-rates-feed' });
  assert.equal(o!.key, 'addon:dawn-rates-feed');
  assert.equal(o!.basis, 'figures:2026-09-28@6');
  assert.equal(o!.lapses, new Date(NOW + LAPSE_DAYS * DAY).toISOString().slice(0, 10));
  assert.ok(o!.rank > TIER.block && o!.rank < TIER.page, String(o!.rank));
  /* NAMES, NEVER IDS: neither the add-on's id nor the list's handle is in a word a person reads. */
  for (const said of [o!.title, o!.why]) assert.doesNotMatch(said, /dawn-rates-feed|xr_role|\bxr\b|fig_/u);
});

test('WITH THE FEED INSTALLED, NONE; and none while the rates are fresh', () => {
  assert.deepEqual(addonOffers(signals({ installed: ['dawn-rates-feed'] }), NOW), []);
  /* ANOTHER INSTALLED ADD-ON THAT KEEPS THE SAME LIST fills it too, so no second feed is offered. */
  const other: ReachCatalogueEntry = { ...FEED, id: 'dusk-rates-feed', title: 'Dusk rates' };
  assert.deepEqual(addonOffers(signals({ catalogue: [FEED, other], installed: ['dusk-rates-feed'] }), NOW), []);
  const fresh = signals({ lists: [{ list: 'xr', role: 'xr_role', name: 'Rates', newest: '2026-10-19', rows: 31 }], figures: [{ id: 'f', reads: 'xr', oldest: '2026-10-19' }] });
  assert.deepEqual(addonOffers(fresh, NOW), []);
});

test('AN ADD-ON WHOSE SHAPE NO ARRIVAL HOLDS, NONE; three that wait at a door it reads, one offer', () => {
  const quiet = signals({ figures: [], arrivals: [{ shape: `email:alerts@${DOMAINS[1]}`, waiting: 9 }] });
  assert.deepEqual(addonOffers(quiet, NOW).filter((o) => o.key === 'addon:harbourline-alerts'), []);
  const two = signals({ figures: [], arrivals: [{ shape: `email:alerts@${DOMAINS[0]}`, waiting: 2 }] });
  assert.deepEqual(addonOffers(two, NOW).filter((o) => o.key === 'addon:harbourline-alerts'), []);
  const three = signals({ figures: [], arrivals: [{ shape: `email:alerts@${DOMAINS[0]}`, waiting: 3, since: '2026-10-12' }] });
  const [o] = addonOffers(three, NOW).filter((x) => x.key === 'addon:harbourline-alerts');
  assert.ok(o, 'three arrivals of its shape earned no offer');
  assert.equal(o.why, '3 messages that came in since 12 October wait with nothing to read them.');
  assert.equal(o.title, `Turn on ${BANKS[0]} alerts?`);
});

test('THREE OFFERS ALREADY WAITING: none new, through the same gate and cap', () => {
  const open: Held[] = [1, 2, 3].map((i) => ({ key: `page:list${i}`, class: 'arrange', rank: TIER.page + i, basis: 'named', lapses: '2026-10-30' }));
  const q = reachQueue(addonOffers(signals(), NOW), open, [], NOW);
  assert.deepEqual(q.fresh, []);
  assert.equal(q.waiting.length, 3);
  /* AND ONE TURNED DOWN IS NOT MADE AGAIN on the same day and count. */
  const down = reachQueue(addonOffers(signals(), NOW), [], [{ key: 'addon:dawn-rates-feed', basis: 'figures:2026-09-28@6' }], NOW);
  assert.deepEqual(down.fresh, []);
  const empty = reachQueue(addonOffers(signals(), NOW), [], [], NOW);
  assert.equal(empty.fresh.length, 1);
  assert.equal(empty.fresh[0]!.change.kind, 'install');
});

test('A KEY IS SAID IN THE SENTENCE, and one feed is offered for a list two would keep, the keyless first', () => {
  const keyed: ReachCatalogueEntry = { ...FEED, id: 'keyed-rates', title: 'Keyed rates', keeps: [{ list: 'xr_role', everyMs: 3_600_000 }], needsKey: true };
  const both = addonOffers(signals({ catalogue: [keyed, FEED] }), NOW);
  assert.deepEqual(
    both.map((o) => o.key),
    ['addon:dawn-rates-feed'],
  );
  const alone = addonOffers(signals({ catalogue: [keyed] }), NOW);
  assert.equal(alone[0]!.why, '6 figures here use rates from 28 September, and Keyed rates needs your key.');
});

test('A LIST NOTHING FILLS, a week stale, is offered for; an empty one is not', () => {
  const held = signals({ figures: [], lists: [{ list: 'xr', role: 'xr_role', name: 'Rates', newest: '2026-09-28', rows: 31 }] });
  const [o] = addonOffers(held, NOW);
  assert.equal(o!.why, 'Rates holds 31 entries, the newest from 28 September, and nothing keeps it current.');
  assert.ok(o!.rank < addonOffers(signals(), NOW)[0]!.rank, 'a list nobody reads outranked figures that rest on it');
  assert.deepEqual(addonOffers(signals({ figures: [], lists: [{ list: 'xr', role: 'xr_role', name: 'Rates', newest: null, rows: 0 }] }), NOW), []);
});

test('A PACK DOCUMENT READS AS WHAT IT KEEPS: a script on its setting, a poll on its clock, a door by its shapes', () => {
  const doc = {
    config: { every: { type: 'enum', default: '6h' }, grant: { type: 'text', default: `${BANKS[1]} (read only)` } },
    declarations: [
      { script: 'ledger', runs: { every: '{{config:every}}' }, keys: ['{{config:grant}}'], reads: ['accounts'], writes: ['accounts', 'transactions'] },
      { ingest: 'rates_poll', channel: 'poll', every: '1d', writes: { register: 'xr_role' } },
      { ingest: 'card_out', channel: 'email', from: `@${DOMAINS[2]}`, writes: { register: 'transactions' } },
      'not a declaration',
    ],
  };
  const entry = reachEntryOf({ id: 'cedar-feed', title: `${BANKS[1]} feed` }, doc);
  assert.deepEqual(entry, {
    id: 'cedar-feed',
    title: `${BANKS[1]} feed`,
    keeps: [
      { list: 'accounts', everyMs: 6 * 3_600_000 },
      { list: 'transactions', everyMs: 6 * 3_600_000 },
      { list: 'xr_role', everyMs: DAY },
    ],
    shapes: [`email:@${DOMAINS[2]}`],
    needsKey: true,
  });
  assert.deepEqual(reachEntryOf({ id: 'x', title: 'X' }, null), { id: 'x', title: 'X', keeps: [], shapes: [], needsKey: false });
  assert.ok(shapeFits(`email:@${DOMAINS[2]}`, `email:card@${DOMAINS[2]}`));
  assert.ok(!shapeFits(`email:@${DOMAINS[2]}`, `webhook:card@${DOMAINS[2]}`));
});

test('IT IS PURE: the same signals answer the same offers, and the signals are not changed', () => {
  const s = signals({ arrivals: [{ shape: `email:alerts@${DOMAINS[0]}`, waiting: 4 }] });
  const before = JSON.stringify(s);
  assert.deepEqual(addonOffers(s, NOW), addonOffers(s, NOW));
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(
    addonOffers(s, NOW).map((o) => o.key),
    ['addon:dawn-rates-feed', 'addon:harbourline-alerts'],
  );
});
