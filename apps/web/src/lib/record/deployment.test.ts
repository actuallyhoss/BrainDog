/**
 * The two hosts, and the half of every branch a single-record seed can never draw.
 *
 * `/settings/backups`, `/settings/billing` and the retention sentence all branch on
 * `DEPLOYMENT.kind`. The seed is one record on one host, so exactly one side of each branch renders
 * — and `DEPLOYMENT.kind` was `'self-host' as const`, which pinned the LITERAL TYPE and made the
 * other side statically unreachable. `svelte-check` says nothing about a branch that cannot be
 * taken, and `dead-copy` is a grep for `copy.<key>` across `src`, so a sentence inside a dead `{#if}`
 * counts as rendered.
 *
 * **Eight sentences shipped to the browser and drew nowhere**, including the *restore to a time*
 * control a commit was named for. A review found it by reading the built page rather than the
 * source, which is the only way that class of defect is visible: the code is there, the test greps
 * find it, and nothing puts it on a screen.
 *
 * So the branch is a real conditional now, and this file is the other half of the browser gates:
 * they measure the host the seed is on, and this asserts that the host it is not on has sentences
 * that exist, differ, and say the thing the documents place on that host. It is not a substitute for
 * rendering both — that is the seed-variant harness in the backlog — and it is what stops the unseen
 * half rotting in the meantime.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { copy } from '../copy.ts';
import { DEPLOYMENT, SNAPSHOTS, SNAPSHOTS_KEPT } from './data.ts';

const AREA = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'routes', 'settings', '[area]', '+page.svelte'),
  'utf8',
);

test('THE HOST IS A FACT ABOUT THE RECORD, NOT A COMPILE-TIME CONSTANT', () => {
  /* `as const` on the value is what made every Cloud branch unreachable. The union is the honest
     type: a record is on one host or the other, and the screens branch on which. */
  assert.ok(['self-host', 'cloud'].includes(DEPLOYMENT.kind));
  /* THE EXPORT LINE, not the file. A bare grep matches the paragraph above it explaining why the
     literal is gone — an assertion catching its own evidence, which this tree has now done twice. */
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'data.ts'), 'utf8');
  const line = /^export const DEPLOYMENT.*$/mu.exec(src)?.[0] ?? '';
  assert.ok(line, 'DEPLOYMENT is no longer a single-line export');
  assert.doesNotMatch(line, /as const/u, 'the host is pinned to a literal again');
  assert.match(line, /'self-host' \| 'cloud'/u);
});

test('every branch on the host has two sides, and they say different things', () => {
  /**
   * `33 §9`: a self-host *"has no PITR and does not serve `restore`: the path is `braindog import`
   * into a fresh record"*. `53 §5.5(a)` puts *restore to a time* on Cloud, in this area, by name. So
   * the two sides are not two wordings of one fact — they are two different products, and a screen
   * that showed one on both hosts would be lying to one of them.
   */
  const pairs: [string, string, string][] = [
    ['retention', copy.keptSelfHost(SNAPSHOTS_KEPT), copy.keptCloud(SNAPSHOTS_KEPT)],
    ['going back', copy.restoreSelfHost, copy.restoreCloud],
    ['billing', copy.billingSelfHost, copy.billingCloud],
  ];
  for (const [what, mine, theirs] of pairs) {
    assert.ok(mine.length > 20, `${what}: the self-host sentence is missing`);
    assert.ok(theirs.length > 20, `${what}: the Cloud sentence is missing`);
    assert.notEqual(mine, theirs, `${what}: one sentence is doing for both hosts`);
  }
});

test('AND THE CLOUD HALF SAYS WHAT `53 §5.5` PUTS THERE', () => {
  /* Unrendered on this seed, so nothing else can check it. Each of these is a sentence a person
     would read before pressing the most destructive control on the screen. */
  assert.match(copy.restoreCloud, /thirty days/iu, 'Cloud restores to any point in thirty days and the sentence does not say so');
  assert.match(copy.restoreTo, /restore/iu);
  assert.match(copy.findTheMoment, /moment|time/iu);
  /* `53 §5.5`: a bookmark restore rewinds the database, and its own rollback is another point in
     time. Both halves, because a control that says only the first is a control nobody presses and a
     control that says only the second is one they press too readily. */
  assert.match(copy.restoreLosesWhat, /after the moment you pick/iu);
  assert.match(copy.restoreBackHow, /thirty days/iu);
  /* And Cloud keeps thirty PLUS `latest` — `53 §4` — which the shared sentence used to hide. */
  assert.match(copy.keptCloud(SNAPSHOTS_KEPT), /latest/iu);
});

test('and the self-host half says what the record it is on actually does', () => {
  assert.match(copy.restoreSelfHost, /by hand|import/iu);
  assert.match(copy.keptSelfHost(SNAPSHOTS_KEPT), /this machine/iu);
  /* `49 §5.13`'s `GET /api/snapshots/:id`. A self-host's only way back is putting a copy back, so
     the copy has to be reachable — and Cloud's R2 prefix is not served to a browser, so the control
     belongs to one host and not the other. */
  assert.ok(copy.download.length > 2);
  assert.match(AREA, /DEPLOYMENT\.kind === 'self-host'[\s\S]{0,400}?copy\.download/u, 'the download is not on the self-host branch');
});

test('the screen branches on the host in every place the documents do', () => {
  /* Three: what is kept, going back, and billing. A fourth appearing without a sentence for the
     other side is the shape this file exists to catch. */
  const branches = [...AREA.matchAll(/DEPLOYMENT\.kind/gu)].length;
  assert.ok(branches >= 3, `only ${branches} host branches on a screen the documents split three ways`);
});

test('a night that kept nothing is not counted as a copy that is kept', () => {
  /* The heading read "What is kept · 4" over three copies and a row saying *nothing kept*. Counting
     the failure as a backup is the same class of error as hiding it, on the screen `12 §8` says
     exists because *"a backup that silently gave up is worse than none"*. */
  const kept = SNAPSHOTS.filter((s) => s.failed === null).length;
  assert.ok(kept < SNAPSHOTS.length, 'no night failed, so this proves nothing');
  assert.match(AREA, /count=\{SNAPSHOTS\.filter\(\(s\) => s\.failed === null\)\.length\}/u, 'the heading counts the failed night again');
});

test('and the delete field does not put the answer in the box', () => {
  /* The placeholder was `boot().index.slug` — the very string you must type, greyed inside the box
     you must type it into, beside a label that already shows it. A speed bump you can read off the
     control it is protecting is not one. */
  const at = AREA.indexOf('id="delete-slug"');
  assert.ok(at > 0, 'the delete field is gone');
  const field = AREA.slice(at, at + 400);
  assert.doesNotMatch(field, /placeholder=\{boot\(\)\.index\.slug\}/u, 'the placeholder is the answer again');
  /* The label still says it, because the person has to know what to type. */
  assert.match(AREA, /copy\.typeSlug\(boot\(\)\.index\.slug\)/u);
});
