/**
 * Settings, calm: one hint a section, where a choice is kept said once, the ways in reading as titles
 * until one is chosen, and the person's own words where the system's were.
 *
 * A TEXT TEST OVER MARKUP, for the reason `levels.test.ts` gives. Comments are stripped first, so a comment that says
 * what used to be there cannot fail or pass a check.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const strip = (text: string) => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
const area = (name: string) => strip(readFileSync(new URL(`./[area]/areas/${name}.svelte`, import.meta.url), 'utf8'));
const markup = (name: string) => area(name).slice(area(name).indexOf('</script>'));
const page = strip(readFileSync(new URL('./[area]/+page.svelte', import.meta.url), 'utf8'));

test('Navigation says where its choices are kept once, and no footer under it says otherwise', () => {
  const nav = markup('Navigation');
  /* SAID ONLY WHEN IT IS NEWS (settings lane, 3 Nov): kept for the person is what a page is, so only "this device" is said. */
  assert.equal(nav.match(/copy\.perPerson/gu)?.length ?? 0, 0, 'perPerson is said where nothing is unusual');
  assert.match(nav, /\{#if !navPrefs\.kept\}<p class="kept">\{copy\.perDevice\}<\/p>\{\/if\}/u, 'perDevice is not said once, and only on this device');
  assert.match(page, /const KEEPS = new Set\(\['keyboard'\]\)/u);
});

test('the two sentences about where a look is kept agree with the code, which keeps it in the record', () => {
  /* THE CODE: every look setting is sent to the record under a `look.*` key, and `whereKept` answers `record` once the
     record has it. So "on all your devices" is the true one, and no line may say "this device" under it. */
  const pref = strip(readFileSync(new URL('../../lib/pref.ts', import.meta.url), 'utf8'));
  for (const key of ['scheme', 'text', 'density', 'contrast', 'theme']) assert.match(pref, new RegExp(`${key}: 'look\\.`, 'u'), `${key} is not a key the record keeps`);
  assert.match(pref, /!follows\(\) \? 'device' : Object\.keys\(unsent\(\)\)\.length > 0 \? 'pending' : 'record'/u);
  const look = area('Appearance');
  /* AT THE CARD HEAD'S END SINCE 3 NOV (settings lane), in the record a person opens. */
  assert.match(look, /meta=\{kept === 'record' \? words\.hint : kept === 'pending' \? words\.hintPending : words\.hintDevice\}/u);
  assert.match(look, /hint: 'On all your devices'/u);
  /* NO FOOTER UNDER APPEARANCE SAYS OTHERWISE. Keyboard's switch is a cookie and is sent nowhere, so it keeps the line. */
  assert.doesNotMatch(/const KEEPS = new Set\(\[([^\]]*)\]\)/u.exec(page)?.[1] ?? "'appearance'", /appearance/u);
  assert.match(area('Keyboard'), /pref\.write\(\{ chars \}\)/u);
  const account = strip(readFileSync(new URL('../../lib/copy/account.ts', import.meta.url), 'utf8'));
  const line = /keptOnDevice: '([^']*)'/u.exec(account)?.[1] ?? '';
  assert.equal(line, 'These choices are kept on this device only.');
  assert.doesNotMatch(line, /settings above/u, 'the line still claims every setting on the screen');
});

test('the sub-nav draws "here" as the rail does: the chosen tint under the row (bfa6829fa) and the glyph in ink', () => {
  const index = strip(readFileSync(new URL('./[area]/SettingsIndex.svelte', import.meta.url), 'utf8'));
  const here = /\.area-row\[aria-current='page'\] \{([^}]*)\}/u.exec(index)?.[1] ?? '';
  assert.match(here, /background: var\(--chosen\);/u);
  assert.doesNotMatch(here, /--red-tint/u, 'the current area still wears the tinted wash');
  const glyph = /\.area-row\[aria-current='page'\] \.area-icon :global\(\.well\.well\) \{([^}]*)\}/u.exec(index)?.[1] ?? '';
  assert.match(glyph, /background: transparent;/u);
  /* INK, NOT RED (design pass 1 Nov, M27): Look B keeps red for what is wrong or late, never for what is chosen. */
  assert.match(glyph, /color: var\(--ink\);/u);
  assert.doesNotMatch(index, /tone=\{a\.id === current \? 'ink'/u, 'the current area still wears an ink well');
  /* A ROW IS 44 UNDER A THUMB. */
  assert.match(index, /@media \(pointer: coarse\) \{\s*\.area-row \{\s*min-block-size: var\(--tap\);/u);
});

test('each Navigation section draws at most one hint', () => {
  const nav = markup('Navigation');
  for (const section of nav.split(/<Tile\b/u).slice(1)) {
    const body = section.slice(0, section.indexOf('</Tile>'));
    /* THE SHAPE'S TWO HINTS ARE ONE A WIDTH: the picker's on a wide screen, the phone's one sentence on a phone. */
    const hints = (body.match(/<p class="hint(?![^"]*phone-only)/gu) ?? []).length;
    assert.ok(hints <= 1, `a section draws ${hints} hints: ${body.slice(0, 80)}`);
  }
});

test("the Agents area's ways in read as titles until one is chosen, and the chosen one's hint shows under its title", () => {
  /* THE WAYS IN ARE THE CONNECT SHEET'S (connect-sheet-89): Agents draws one button, and the sheet draws each way as its
     title alone, with its hint and its lines only in the one tile that is open. */
  assert.match(markup('Agents'), /<ConnectSheet\b/u);
  const sheet = strip(readFileSync(new URL('../../lib/agents/ConnectSheet.svelte', import.meta.url), 'utf8'));
  const drawn = sheet.slice(sheet.indexOf('</script>'));
  /* A WAY WITH STEPS NUMBERS THEM, AND ITS HINT IS SAID ONLY WHERE THERE ARE NONE (UI pass, 3 Nov). */
  assert.match(drawn, /<div class="way-body"[^>]*>[\s\S]*?\{#if stepped\.length === 0 && !t\.key\}<p class="hint">\{t\.hint\}<\/p>\{\/if\}/u);
  /* THE INBOX SWITCH HAS A TITLE AND ONE LINE, both seen, so it is never one of the hints hidden. */
  assert.match(drawn, /<span class="inbox-title">\{copy\.connectInbox\}<\/span>\s*<span class="inbox-line">\{connectWords\.inboxLine\}<\/span>/u);
});

test('Export and What comes in name the things a person keeps, not rows', () => {
  for (const name of ['Export', 'Ingest']) {
    const said = [...area(name).matchAll(/'([^'\n]*)'|`([^`\n]*)`/gu)].map((m) => m[1] ?? m[2] ?? '');
    for (const s of said) if (/\s/u.test(s)) assert.doesNotMatch(s, /\brows?\b/iu, `${name} says "${s}"`);
  }
});
