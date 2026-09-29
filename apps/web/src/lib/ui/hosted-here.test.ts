/**
 * Every `<CallsOut>` asks the host whether this record's calls are counted, and none of them asks the build.
 *
 * THE HOST WAS READ ON ONE SITE OF SEVEN. `boot` gave the shell a
 * `host` and Billing read it, while five `<CallsOut>` props passed `hosted={DEPLOYMENT.kind !== 'self-host'}` and the
 * automation builder passed `hosted={false}`. `DEPLOYMENT.kind` is the sample's variant and reads `self-host` in the
 * bundle production serves, so on the Cloud `estimateOf` answered `installWords.noLimit`, "with no monthly limit on this
 * record", on the Packs diff, a shared plan, the Settings plan, the Decide gate and the builder, while the Worker holds a
 * hosted record's runs at 15,000 a month. `hostedHere` in `routes/settings/billing.ts` is the one answer, and its own
 * cases are run in `billing.test.ts`.
 *
 * HELD BY READING THE SOURCE, as `enum-label-sites.test.ts` is, because a Svelte component does not mount under
 * `node --test`. The sweep walks every `.svelte` file under `src`, so a seventh site is held the day it is written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');

function svelteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const at = join(dir, e.name);
    if (e.isDirectory()) return svelteFiles(at);
    return e.name.endsWith('.svelte') ? [at] : [];
  });
}

/*
 * Every `<CallsOut ... />` tag in the tree, with where it is. The component's own file declares it and is not a site.
 *
 * TO THE `/>` AND NOT TO THE FIRST `>`. The first draft of this sweep read `[^>]*`, and Shared plan's tag passes
 * `plan.packs.flatMap((p) => p.calls)`, so its tag ended at the arrow and its `hosted=` was never read: the check that
 * every site asks `hostedHere` failed on that file with the fix in place. Every site is self-closing, and the first
 * test below turns red if one stops being, since its match would then run on into the next tag.
 */
const SITES = svelteFiles(SRC)
  .filter((f) => !f.endsWith('CallsOut.svelte'))
  .flatMap((f) => {
    const text = readFileSync(f, 'utf8').replaceAll(/<!--[\s\S]*?-->/gu, '');
    return [...text.matchAll(/<CallsOut\b[\s\S]*?\/>/gu)].map((m) => ({ file: relative(SRC, f).replaceAll('\\', '/'), tag: m[0] }));
  });

test('THE THREE SITES ARE STILL THERE, so a sweep that finds none has not passed by finding none', () => {
  assert.equal(SITES.length, 3, SITES.map((s) => s.file).join('\n'));
  for (const { file, tag } of SITES) assert.ok(!tag.slice(1).includes('<'), `${file} has a CallsOut tag that is not self-closing`);
});

test('no `<CallsOut>` decides hosting from the build or from a constant', () => {
  for (const { file, tag } of SITES) {
    assert.doesNotMatch(tag, /hosted=\{DEPLOYMENT\.kind/u, `${file} decides hosting from the build: ${tag}`);
    assert.doesNotMatch(tag, /hosted=\{(?:false|true)\}/u, `${file} decides hosting from a constant: ${tag}`);
  }
});

test('and every one of them asks `hostedHere`, which reads the host `boot` named', () => {
  for (const { file, tag } of SITES) assert.match(tag, /hosted=\{hostedHere\(/u, `${file} does not ask the host: ${tag}`);
});
