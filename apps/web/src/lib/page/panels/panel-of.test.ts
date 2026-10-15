/**
 * A host panel is chosen by the name a section gives it, and by nothing else (`panel-of.ts`).
 *
 * WHAT WAS WRONG BEFORE THIS FILE. The page reader drew Resume and the report key under a section whose heading was the
 * exact English "Runs on", so renaming the section took both away with no word said. These cases hold the rule: the
 * key wins, a key naming no panel draws none, and a heading is never read, since every first-party section names its
 * panel.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PANELS, PANEL_WHO, panelOf } from './panel-of.ts';
import { PANEL_LOADERS, panelNeeds } from './index.ts';

/* THE TWO HEADINGS THE READER ONCE MATCHED, written out here so a case holds them to drawing nothing. */
const RUNS_ON = 'Runs on';
const SEND_NUMBERS = 'Send numbers here';

test('A SECTION THAT NAMES ITS PANEL GETS THAT PANEL, whatever its heading says', () => {
  assert.equal(panelOf({ kind: 'section', heading: 'What this project runs on', panel: 'actions' } as never), 'actions');
  assert.equal(panelOf({ kind: 'section', heading: 'Numbers', panel: 'reporting' } as never), 'reporting');
  assert.equal(panelOf({ kind: 'section', heading: 'What it did', panel: 'run' } as never), 'run', "a run's page names its own panel");
  assert.equal(panelOf({ kind: 'section', heading: 'Where it was seen', panel: 'seen' } as never), 'seen', 'where the record met the row');
  /* RENAMED, AND THE PANEL STAYS: the defect this replaces. */
  assert.equal(panelOf({ kind: 'section', heading: 'Scheduled', panel: 'actions' } as never), 'actions');
});

test('A NAME THAT IS NO PANEL DRAWS NONE, and the heading is not read in its place', () => {
  assert.equal(panelOf({ kind: 'section', heading: RUNS_ON, panel: 'constructor' } as never), null);
  assert.equal(panelOf({ kind: 'section', heading: RUNS_ON, panel: 3 } as never), null);
});

test('A SECTION THAT NAMES NO PANEL DRAWS NONE, even under a heading the reader once matched', () => {
  assert.equal(panelOf({ kind: 'section', heading: RUNS_ON }), null);
  assert.equal(panelOf({ kind: 'section', heading: SEND_NUMBERS }), null);
  assert.equal(panelOf({ kind: 'section', heading: 'Keys' }), null);
  assert.equal(panelOf({ kind: 'section' }), null);
});

test('ONLY A SECTION CARRIES A PANEL, so a table headed like one is still a table', () => {
  assert.equal(panelOf({ kind: 'table', heading: RUNS_ON, panel: 'actions' } as never), null);
  assert.equal(panelOf({ kind: 'note', panel: 'actions' } as never), null);
});

/* THE KERNEL'S TABLE (`kinds/words.ts`), read through the kernel's own door. */
const kernel = () => import('@braindog/kernel');

test("THE WEB'S LIST IS THE KERNEL'S, in its order, and says what each panel is about and who it is for", async () => {
  const { PANEL_TABLE, PANELS: KERNEL } = await kernel();
  assert.deepEqual([...PANELS], [...KERNEL]);
  for (const name of PANELS) {
    assert.equal(PANEL_WHO[name].needs, PANEL_TABLE[name].needs, `${name} is about the same thing on both sides`);
    assert.equal(PANEL_WHO[name].level, PANEL_TABLE[name].level, `${name} is drawn for the same people on both sides`);
  }
});

test('EVERY PANEL THE KERNEL LISTS HAS A LOADER AND A LINE THAT SAYS WHAT IT IS', async () => {
  const { PANEL_TABLE, PANELS: KERNEL } = await kernel();
  for (const name of KERNEL) {
    assert.equal(typeof PANEL_LOADERS[name], 'function', `${name} has a loader`);
    assert.ok(PANEL_TABLE[name].says.trim().length > 0, `${name} says what it is`);
    assert.equal(panelNeeds(name), PANEL_TABLE[name].needs);
  }
  assert.deepEqual(Object.keys(PANEL_LOADERS), [...KERNEL], 'and no loader for a panel the kernel does not list');
});

test('THE LOOK EDITOR IS NAMED BY A SECTION ON ANY PAGE, and needs no row', () => {
  assert.equal(panelOf({ kind: 'section', heading: 'How the studio looks', panel: 'look-editor' } as never), 'look-editor');
  assert.equal(panelOf({ kind: 'section', heading: 'The model', panel: 'slash-model' } as never), 'slash-model');
  assert.equal(panelNeeds('look-editor'), 'none');
  assert.equal(panelNeeds('actions'), 'row');
});

/* THE FOUR PANELS OF PGS-A17 JOB 3, each an existing screen: who they are drawn for is the kernel's word. */
const FOUR = { trust: 'owner', 'slash-reads': 'owner', 'my-keys': 'read', 'new-action': 'owner' } as const;

test('THE LADDER OF TRUST, WHAT SLASH READS, YOUR OWN KEYS AND A NEW ACTION STAND ON ANY PAGE, each for its reader', async () => {
  const { PANEL_TABLE } = await kernel();
  for (const [name, level] of Object.entries(FOUR) as [keyof typeof FOUR, string][]) {
    assert.ok((PANELS as readonly string[]).includes(name), `${name} is a panel`);
    assert.equal(panelNeeds(name), 'none', `${name} needs no row`);
    assert.equal(PANEL_WHO[name].level, level, `${name} is drawn for ${level}`);
    assert.equal(PANEL_TABLE[name].level, level);
    assert.ok(!PANEL_TABLE[name].says.includes('—'), `${name} says a plain line`);
  }
  assert.equal(panelOf({ kind: 'section', heading: 'Who acts alone', panel: 'trust' } as never), 'trust');
  assert.equal(panelOf({ kind: 'section', heading: 'Make one', panel: 'new-action' } as never), 'new-action');
  assert.equal(PANEL_TABLE['my-keys'].says, 'Your own keys to this record');
});

/* THE FILES BEHIND THE LOADERS, read as text: Node cannot load a Svelte component, and the rule is in what it calls. */
const source = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const MY_TOKENS = '../../../routes/settings/[area]/areas/MyTokens.svelte';

test("YOUR OWN KEYS NEVER DRAW ANOTHER PERSON'S KEY: the panel calls only the caller's own key methods", () => {
  const index = source('./index.ts');
  assert.match(index, /'my-keys': \(\) => import\('\.\.\/\.\.\/\.\.\/routes\/settings\/\[area\]\/areas\/MyTokens\.svelte'\)/u);
  const screen = source(MY_TOKENS);
  const calls = [...screen.matchAll(/clientOf\(\)\.(\w+)\(/gu)].map((m) => m[1]);
  assert.ok(calls.includes('ownTokens'), 'it lists the reader\'s own keys');
  for (const call of calls) assert.ok(['ownTokens', 'createOwnToken', 'revokeOwnToken'].includes(call!), `${call} is the caller's own`);
  /* THE OWNER'S CALLS, which answer every person's keys, are never made here. */
  assert.doesNotMatch(screen, /\blistTokens\b|\.revokeToken\(|\.createToken\(/u);
});

test('THE NEW ACTION PANEL IS ONE BUTTON OVER THE EXISTING SHEET, for the owner alone', () => {
  const panel = source('./NewActionPanel.svelte');
  assert.match(panel, /import NewAction from '\$lib\/ui\/NewAction\.svelte'/u, 'the sheet is mounted, not rewritten');
  assert.match(panel, /<NewAction \{open\} kind="action" onclose=/u, 'handed what the hub hands it');
  assert.match(panel, /\{#if owner\}/u, 'nothing is drawn for anyone but the owner');
  assert.equal((panel.match(/<Button\b/gu) ?? []).length, 1, 'one button');
  assert.doesNotMatch(panel, /<h[1-6]\b/u, 'the section gives the heading');
});
