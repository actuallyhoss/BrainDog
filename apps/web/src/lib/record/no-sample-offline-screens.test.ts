/**
 * The screens that drew the seeded studio, or said "nothing was
 * saved", when no record answered, read from their source because this app has no DOM to open them in.
 *
 * WHAT EACH ONE DID. The palette searched the studio's rows, listed its figures, its last changes and its
 * questions, and toasted "would be added" for a row it never sent. The record switcher toasted that another record
 * "would open". Add a field toasted that one "would be added to every row". A project's Runs on drew the studio's
 * actions at the studio's clock and resumed one in the tab. A run's page offered Stop, which stops nothing, and drew a
 * transcript under a refused shell. Usage counted the studio's month. The add-ons screens listed six packs nobody
 * installed, with a sentence saying so, a settings form in sterling and a Share note about "the sample".
 *
 * `Shell.live` IS NO WITNESS. The refused shell is built from `layoutOf`, which sets `live: true`, so already every
 * `!page.data.live` branch below was already unreachable; the refusal a screen draws is `data.refused`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

/* COMMENTS ARE LEFT OUT, so a paragraph saying where the sample used to be is not a read of it. */
const code = (path: string): string => source(path).replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gmu, '');

test('the palette searches, lists and adds on the record or not at all, never on the studio', () => {
  const palette = code('../palette/Palette.svelte');
  assert.doesNotMatch(palette, /\bAUDIT\b|\bQUESTIONS\b|\bNOW\b|\bmetric\(|\bentry\(|\bsearch\(parsed/u, 'the palette reads the studio again');
  assert.doesNotMatch(palette, /notWritten|createWords\.would/u, 'the add row says a row would be added and sends nothing');
  assert.doesNotMatch(palette, /listsOf\(/u, "the studio's lists are offered when no record answered");
});

test('the switcher, Add a field and Runs on say nothing of a write that did not happen', () => {
  assert.doesNotMatch(code('../shell/YouMenu.svelte'), /notWritten|otherRecord/u);
  const field = code('../ui/AddField.svelte');
  assert.doesNotMatch(field, /notWritten|fieldWords\.sample/u);
  assert.match(field, /\{:else if live\}/u, 'the Add a field button is drawn where nothing can be added');
  const runs = code('../page/panels/Actions.svelte');
  assert.doesNotMatch(runs, /\bNOW\b|\.sample\b|notWritten/u);
});

test("a run's page offers no Stop that stops nothing, and draws the shell's refusal", () => {
  const job = code('../../routes/jobs/[id]/+page.svelte');
  assert.doesNotMatch(job, /notWritten|runWouldStop|stopRun/u);
  assert.match(job, /data\.refused/u);
});

test('usage counts the record or says why not, and never the studio’s month', () => {
  assert.doesNotMatch(code('../../routes/usage/+page.svelte'), /\bNOW\b|'sample'/u);
});

test('the add-ons screens draw the record’s packs or its refusal, with no sample sentence', () => {
  for (const path of [
    '../../routes/addons/Installed.svelte',
    '../../routes/addons/[id]/Installed.svelte',
    '../../routes/plugins/share/+page.svelte',
    '../../routes/addons/InstallShared.svelte',
  ]) {
    const screen = code(path);
    assert.doesNotMatch(screen, /\.sample\b|notWritten|shareSampleNote|page\.data\.live|readAddress\(/u, path);
  }
});

test('the three sources hold no sample and no demo sentence', () => {
  for (const path of ['./packs.ts', './actions.ts', '../flow/source.ts']) {
    const module = code(path);
    assert.doesNotMatch(module, /from '(\.\.\/record|\.)\/data\.ts'|notOnDemo|ACTION_SAMPLE|SAMPLE_AUTOMATIONS|PACK_SETTINGS/u, path);
  }
});
