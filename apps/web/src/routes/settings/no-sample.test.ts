/**
 * Settings draws a real record or a refusal, and nothing from the sample.
 *
 * WHAT WAS THERE, READ AT f5145fa0. Eighteen lines of `settings/[area]/+page.svelte` branched on an
 * area's rows having come `from: 'sample'` (agents, people, backups), and ten fixture constants
 * reached the screen through `api.ts`: machines and tokens nobody connected, colleagues nobody
 * invited, thirty backups nobody took, passkeys nobody made, connectors that were never set up and a
 * signing key no keypair ever produced.
 *
 * A TEXT TEST OVER MARKUP, for the reason `levels.test.ts` gives: these are `{#if}` arms in a
 * `.svelte` file and this tree has no component test. Comments are stripped first, so a comment
 * that says what the sample did cannot fail or pass a check.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = new URL('./[area]/', import.meta.url);
const strip = (text: string) => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
/* EVERY FILE SETTINGS IS DRAWN FROM since the split into one component per area. */
const FILES = ['+page.svelte', 'SettingsIndex.svelte', 'settings-state.svelte.ts', ...readdirSync(new URL('areas/', DIR)).map((f) => `areas/${f}`)];
const PAGE = FILES.map((f) => strip(readFileSync(new URL(f, DIR), 'utf8'))).join('\n');

/** The sample's fixture constants, every one of which is the sample's and none of which a record answers. */
const FIXTURES = [
  'AUTH_METHODS', 'DEPLOYMENT', 'DEVICES', 'PASSKEYS', 'PEOPLE_ACCESS',
  'SIGNING_KEY', 'SNAPSHOTS', 'SNAPSHOTS_KEPT', 'TOKENS', 'SOURCES',
];

test('the screen reads none of the sample fixtures', () => {
  for (const name of FIXTURES)
    assert.doesNotMatch(PAGE, new RegExp(`\\b${name}\\b`, 'u'), `Settings still reads ${name}, which is the sample's`);
  /* AND NOT THROUGH THE HELPERS THAT DRESSED TWO OF THEM AS A RECORD'S ROWS either. */
  assert.doesNotMatch(PAGE, /\bsample(Machines|Tokens)\b/u);
});

test('no area keeps a sample state to fall back on', () => {
  /* EVERY `*From` WAS FOUR OR FIVE STATES, and `sample` was the one no record ever answers. */
  assert.doesNotMatch(PAGE, /'sample'/u, 'an area still has a sample arm');
  assert.doesNotMatch(PAGE, /\b(agents|people|copies)Now\(\)/u, "an area still dates its rows by the sample's NOW");
});

test('and nothing on it says the demo sentence', () => {
  /* `copy.notOnDemo` STAYS IN copy.ts FOR NOW, because flow/source.ts and actions.ts still render it, and
     Settings renders it nowhere. `mockNotice` was the sample's footer: "Nothing you do here is saved yet." */
  assert.doesNotMatch(PAGE, /copy\.notOnDemo\b/u);
  assert.doesNotMatch(PAGE, /copy\.mockNotice(Some)?\b/u);
});

test('the signing key is said to be out of reach on every shell, because the only key this screen ever drew was invented', () => {
  const arm = strip(readFileSync(new URL('areas/Export.svelte', DIR), 'utf8'));
  assert.match(arm, /<Section title=\{copy\.theSignature\}>\s*<StateRow icon="key" title=\{words\.notHereYet\} line=\{copy\.theSignatureNotHere\} \/>\s*<\/Section>/u);
});
