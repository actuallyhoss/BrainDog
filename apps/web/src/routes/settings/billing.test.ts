/**
 * What Settings > Billing says, held to the host that answered rather than to the build.
 *
 * On a live Cloud record Billing said "This record
 * runs on your own machine." `DEPLOYMENT.kind`, the sample's, followed a build flag that was empty in every shipped
 * bundle, so it read `self-host` on the Cloud build and on every production screen. It was a fact about the sample, and there is no sample now for it to speak for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { copy } from '../../lib/copy.ts';
import { estimateOf, type CallOut } from '../../lib/record/actions.ts';
import { billingLine, hostedHere, words } from './billing.ts';

test('a live record that has not said it is a self-host is told nothing is charged, and nothing else', () => {
  for (const mintsMail of [true, null]) assert.equal(billingLine({ mintsMail }), words.notChargedYet, `mail door ${mintsMail}`);
  assert.equal(words.notChargedYet, 'BrainDog does not charge for this record yet.');
  /* `billingCloud` CLAIMS A PAYMENT THAT DOES NOT EXIST: nothing on the Cloud takes one yet. */
  assert.doesNotMatch(words.notChargedYet, /payment|up to date|lapse|your own machine/iu);
});

test('a live self-host, which said so by having no mail door, keeps its own sentence', () => {
  /* `mintsMail` IS false ONLY ON A 404 `ROUTE_UNKNOWN`, which the self-host's `serveApi` answers and the Worker never does. */
  assert.equal(billingLine({ mintsMail: false }), copy.billingSelfHost);
});

test('a host that says it is a self-host is one, before anybody has asked its mail door', () => {
  /* `mintsMail` IS `null` UNTIL THE DOOR ANSWERS, and a live self-host reached straight at Billing was told the Cloud's
     default for as long as that took. `boot` now carries the host's own word, and the inference is only a fallback. */
  assert.equal(billingLine({ host: 'self-host', mintsMail: null }), copy.billingSelfHost);
  /* AND THE HOST'S WORD WINS OVER THE INFERENCE: a Cloud host is not a self-host because one read of its mail door failed. */
  assert.equal(billingLine({ host: 'cloud', mintsMail: false }), words.notChargedYet);
});

test('a shell with no record behind it is told what is true on both hosts, and never that a payment is up to date', () => {
  /* MEASURED BEFORE THIS CHANGE: a shell that was not live was answered from `sample`, and with no `sample` to hand
     that arm fell to "Payment is up to date", on a screen with no record and no payment behind it. That sentence is
     gone from `copy.ts`. A refused shell names no host and Billing never asks its mail door, so both halves arrive
     empty. */
  assert.equal(billingLine({ mintsMail: null }), words.notChargedYet);
  assert.doesNotMatch(billingLine({ mintsMail: null }), /up to date/iu);
});

/** The page without its comments, so a comment quoting the defect cannot fail or pass a check. */
const PAGE = readFileSync(new URL('./[area]/areas/Billing.svelte', import.meta.url), 'utf8')
  .replaceAll(/<!--[\s\S]*?-->/gu, '')
  .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

test('and the screen asks the host that answered, and never the build', () => {
  assert.doesNotMatch(PAGE, /DEPLOYMENT/u, 'billing still follows the build and not the host');
  assert.match(PAGE, /billingLine\(\{ host: shell\.host, mintsMail: mintsHere \}\)/u);
});

test('and Billing asks the mail door itself, or a self-host reached straight at Billing never says what it is', () => {
  /* WITH THE BILLING EFFECT DELETED, EVERY TEST ABOVE STAYED GREEN. `mintsHere` is otherwise
     asked only by the ingest area, so a self-host whose owner opened `/settings/billing` first kept
     `null`, and `billingLine` gave it the Cloud's default for as long as the screen was open. */
  const page = readFileSync(new URL('./[area]/areas/Billing.svelte', import.meta.url), 'utf8');
  assert.match(
    page,
    /if \(!shell\.live\) return;\s*untrack\(\(\) => \{[^}]*askMailDoor\(\)/u,
    'Billing reads `mintsHere` and nothing on Billing ever asks for it',
  );
});

test('billing.ts reads nothing from the fixture module, which is the sample and nothing else', () => {
  /* `DEPLOYMENT` WAS THE LAST THING IT READ THERE, and it is the sample's variant. This file was one of
     the thirty shipped importers of `data.ts`; that module has since moved to `fixtures/sample.ts`, which the
     `no-fixtures` gate keeps out of every route. */
  const source = readFileSync(new URL('./billing.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from '[^']*record\/data\.ts'/u, 'billing.ts still imports the sample');
  assert.doesNotMatch(source.replaceAll(/\/\*[\s\S]*?\*\//gu, ''), /\bDEPLOYMENT\b/u);
});

/*
 * WHETHER THIS RECORD'S CALLS ARE COUNTED AGAINST AN ALLOWANCE, which six `<CallsOut hosted=...>` props decided from the
 * build. On the Cloud bundle `DEPLOYMENT.kind` reads `self-host`,
 * so every estimate said "with no monthly limit on this record" while the Worker holds a hosted record's runs at 15,000.
 */

test('a live record is hosted exactly when its host said cloud', () => {
  assert.equal(hostedHere({ live: true, host: 'cloud' }), true);
  assert.equal(hostedHere({ live: true, host: 'self-host' }), false);
});

test('a live record whose host said nothing is not hosted, because only a self-host older than the field sends none', () => {
  assert.equal(hostedHere({ live: true }), false);
  assert.equal(hostedHere({ live: true, host: undefined }), false);
});

test('a shell with no record is not hosted, and the build it was made as has no say in it', () => {
  /* THE PLAIN CHECK, and it passed before the change as well: under `node --test` there is no
     `__BRAINDOG_VARIANT__`, so the default argument read `self-host` and answered false by accident. */
  assert.equal(hostedHere({ live: false, host: undefined }), false);
  /* SO THE BUILD IS HANDED `cloud` OUTRIGHT, which is what the Cloud variant's gate build did: before this change a shell
     with no record answered true, and every `<CallsOut>` on it counted calls against an allowance nobody holds. */
  const withBuild = hostedHere as (shell: { live: boolean; host?: 'cloud' | 'self-host' }, build?: string) => boolean;
  assert.equal(withBuild({ live: false }, 'cloud'), false, 'the build still decides a shell with no record');
  /* A HOST ON A SHELL THAT IS NOT LIVE IS NOT A HOST THAT ANSWERED. */
  assert.equal(hostedHere({ live: false, host: 'cloud' }), false);
});

test('and on the Cloud an hourly pull is counted against the allowance, not told it has no limit', () => {
  const hourly: CallOut[] = [{ ingest: 'pull', channel: 'pull', host: 'api.example.com', every: '1h', key: null, sends: null }];
  const said = estimateOf(hourly, hostedHere({ live: true, host: 'cloud' }));
  assert.ok(said, 'an hourly call has an estimate');
  assert.doesNotMatch(said, /no monthly limit/u);
  /* THE FIGURE IS THE DIRECTORY'S NOW, read from its answer; with none read, the runs are said to be counted. */
  assert.match(said, /monthly allowance/u);
});
