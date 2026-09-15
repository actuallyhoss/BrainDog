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
  /**
   * THE DECLARATION, not the file and not its first line.
   *
   * A bare grep matches the paragraph above it explaining why the literal is gone — an assertion
   * catching its own evidence. A single-LINE grep was the over-correction: the declaration became
   * multi-line in the same pass, so `as const` could go back on line two and this stayed green.
   * The check is the statement, from `export const DEPLOYMENT` to the `;` that ends it.
   */
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'data.ts'), 'utf8');
  const at = src.indexOf('export const DEPLOYMENT');
  assert.ok(at > 0, 'DEPLOYMENT is gone');
  const decl = src.slice(at, src.indexOf('};', at) + 2);
  assert.doesNotMatch(decl, /as const/u, 'the host is pinned to a literal again');
  assert.match(decl, /'self-host' \| 'cloud'/u);
  /* AND IT IS DERIVED FROM THE VARIANT, not hardcoded to either host — which is the mutation that
     silently kills the whole harness while every gate goes on printing "over four records". */
  assert.match(decl, /VARIANT === 'cloud' \? 'cloud' : 'self-host'/u, 'the host no longer follows the variant');
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
  /* `copyLines` IS THE LIST THE SCREEN DRAWS: the record's copies where there is a record, and these same
     `SNAPSHOTS` where there is not. The count follows the list, and still leaves out a night that kept nothing. */
  assert.match(AREA, /count=\{copyLines\.filter\(\(s\) => s\.failed === null\)\.length\}/u, 'the heading counts the failed night again');
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


/* ── the other records ────────────────────────────────────────────────── */

test('EVERY VARIANT IS BUILT AND MEASURED, OR IT IS A FILE NOBODY RUNS', () => {
  /**
   * Three findings needed three records: the Cloud half of every host branch, a record with nothing
   * connected (the two designed empty states on `/settings/agents`), and one with enough decided
   * questions for `/search` to cut a group that has no door.
   *
   * A variant that `data.ts` narrows on and no gate loads is worse than no variant — it looks like
   * coverage in a diff. So the three lists are held together: what the record branches on, what the
   * build script writes, and what the browser gates measure.
   */
  const data = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'data.ts'), 'utf8');
  const pkg = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'package.json'), 'utf8');
  const gates = ['layout', 'a11y'].map((g) =>
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'tools', 'gates', `${g}.mjs`), 'utf8'),
  );

  const named = [...data.matchAll(/VARIANT === '([a-z]+)'/gu)].map((m) => m[1]!);
  assert.ok(named.length >= 3, `the record branches on ${named.length} variants`);
  for (const v of new Set(named)) {
    assert.ok(pkg.includes(`'${v}'`), `\`${v}\` is a record nothing builds`);
    for (const [i, src] of gates.entries()) assert.ok(src.includes(`build-${v}`), `\`${v}\` is built and ${['layout', 'a11y'][i]} does not measure it`);
  }
});

test('and a variant build is a build, so no grep gate reads it as source', () => {
  /* The moment `build-cloud/` existed, `css-rules` reported fourteen colour literals in
     `Button.css` — the compiled form of rules that name only tokens. A built directory is built
     whatever record is inside it. */
  const lib = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'tools', 'gates', 'lib.mjs'), 'utf8');
  assert.match(lib, /name\.startsWith\('build-'\)/u, 'a variant build is read as source again');
});
