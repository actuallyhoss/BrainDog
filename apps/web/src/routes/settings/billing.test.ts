/**
 * What Settings > Billing says, held to the host that answered rather than to the build.
 *
 * `loop/research-first-sign-in.md` friction 5: on a live Cloud record Billing said "This record
 * runs on your own machine." `DEPLOYMENT.kind` in `data.ts` follows `__BRAINDOG_VARIANT__`, which is
 * `''` in every shipped bundle, so it reads `self-host` on the Cloud build and on every production
 * screen. It is a fact about the sample, and the sample is the only record it may speak for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { copy } from '../../lib/copy.ts';
import { estimateOf, type CallOut } from '../../lib/record/actions.ts';
import { billingLine, hostedHere, words } from './billing.ts';

test('a live record that has not said it is a self-host is told nothing is charged, and nothing else', () => {
  for (const mintsMail of [true, null])
    for (const sample of ['self-host', 'cloud'] as const) {
      const line = billingLine({ live: true, mintsMail, sample });
      assert.equal(line, words.notChargedYet, `live, mail door ${mintsMail}, build ${sample}`);
    }
  assert.equal(words.notChargedYet, 'BrainDog does not charge for this record yet.');
  /* `billingCloud` CLAIMS A PAYMENT THAT DOES NOT EXIST: nothing on the Cloud takes one yet. */
  assert.doesNotMatch(words.notChargedYet, /payment|up to date|lapse|your own machine/iu);
});

test('a live self-host, which said so by having no mail door, keeps its own sentence', () => {
  /* `mintsMail` IS false ONLY ON A 404 `ROUTE_UNKNOWN`, which the self-host's `serveApi` answers and the Worker never does. */
  assert.equal(billingLine({ live: true, mintsMail: false, sample: 'cloud' }), copy.billingSelfHost);
});

test('a host that says it is a self-host is one, before anybody has asked its mail door', () => {
  /* `mintsMail` IS `null` UNTIL THE DOOR ANSWERS, and a live self-host reached straight at Billing was told the Cloud's
     default for as long as that took. `boot` now carries the host's own word, and the inference is only a fallback. */
  assert.equal(billingLine({ live: true, host: 'self-host', mintsMail: null, sample: 'cloud' }), copy.billingSelfHost);
  /* AND THE HOST'S WORD WINS OVER THE INFERENCE: a Cloud host is not a self-host because one read of its mail door failed. */
  assert.equal(billingLine({ live: true, host: 'cloud', mintsMail: false, sample: 'self-host' }), words.notChargedYet);
});

test('the sample still says what the record it shows is, because that is the one thing the build knows', () => {
  assert.equal(billingLine({ live: false, mintsMail: null, sample: 'self-host' }), copy.billingSelfHost);
  assert.equal(billingLine({ live: false, mintsMail: true, sample: 'cloud' }), copy.billingCloud);
});

test('and the screen asks the shell whether this is a record before it believes the build', () => {
  const page = readFileSync(new URL('./[area]/+page.svelte', import.meta.url), 'utf8')
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '');
  const from = page.indexOf("area === 'billing'}");
  assert.ok(from >= 0, 'billing has no arm');
  const arm = page.slice(from, page.indexOf("{:else if area === '", from + 1));
  assert.doesNotMatch(arm, /DEPLOYMENT\.kind === 'self-host' \? copy\.billingSelfHost/u, 'billing still follows the build and not the host');
  assert.match(arm, /billingLine\(\{ live: shell\.live, host: shell\.host, mintsMail: mintsHere, sample: DEPLOYMENT\.kind \}\)/u);
});

test('and Billing asks the mail door itself, or a self-host reached straight at Billing never says what it is', () => {
  /* THE CHECKER DELETED THE BILLING EFFECT AND EVERY TEST ABOVE STAYED GREEN. `mintsHere` is otherwise
     asked only by the ingest area, so a self-host whose owner opened `/settings/billing` first kept
     `null`, and `billingLine` gave it the Cloud's default for as long as the screen was open. */
  const page = readFileSync(new URL('./[area]/+page.svelte', import.meta.url), 'utf8');
  assert.match(
    page,
    /if \(area !== 'billing' \|\| !shell\.live\) return;\s*untrack\(\(\) => \{[^}]*askMailDoor\(\)/u,
    'Billing reads `mintsHere` and nothing on Billing ever asks for it',
  );
});

/*
 * WHETHER THIS RECORD'S CALLS ARE COUNTED AGAINST AN ALLOWANCE, which six `<CallsOut hosted=...>` props decided from the
 * build (`loop/research-batch-forty-eight-audit.md` section 2). On the Cloud bundle `DEPLOYMENT.kind` reads `self-host`,
 * so every estimate said "with no monthly limit on this record" while the Worker holds a hosted record's runs at 15,000.
 */

test('a live record is hosted when its host said cloud, and the build has no say in it', () => {
  for (const sample of ['self-host', 'cloud'] as const) {
    assert.equal(hostedHere({ live: true, host: 'cloud' }, sample), true, `live cloud, build ${sample}`);
    assert.equal(hostedHere({ live: true, host: 'self-host' }, sample), false, `live self-host, build ${sample}`);
  }
});

test('a live record whose host said nothing is not hosted, because only a self-host older than the field sends none', () => {
  for (const sample of ['self-host', 'cloud'] as const) {
    assert.equal(hostedHere({ live: true }, sample), false, `live, no host, build ${sample}`);
    assert.equal(hostedHere({ live: true, host: undefined }, sample), false, `live, host undefined, build ${sample}`);
  }
});

test('the sample is hosted exactly when it was built as the Cloud variant', () => {
  assert.equal(hostedHere({ live: false }, 'cloud'), true);
  assert.equal(hostedHere({ live: false }, 'self-host'), false);
  /* A HOST ON A SHELL THAT IS NOT LIVE IS NOT A HOST THAT ANSWERED: the sample is only what it was built as. */
  assert.equal(hostedHere({ live: false, host: 'cloud' }, 'self-host'), false);
});

test('and on the Cloud an hourly pull is counted against the allowance, not told it has no limit', () => {
  const hourly: CallOut[] = [{ ingest: 'pull', channel: 'pull', host: 'api.example.com', every: '1h', key: null, sends: null }];
  const said = estimateOf(hourly, hostedHere({ live: true, host: 'cloud' }, 'self-host'));
  assert.ok(said, 'an hourly call has an estimate');
  assert.doesNotMatch(said, /no monthly limit/u);
  assert.match(said, /15,000/u);
});
