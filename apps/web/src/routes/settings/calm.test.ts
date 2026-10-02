/**
 * Settings, calm (DIRECTION §35): one hint a section, where a choice is kept said once, the ways in reading as titles
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
  assert.equal(nav.match(/copy\.perPerson/gu)?.length, 1, 'perPerson is said more than once');
  assert.equal(nav.match(/copy\.perDevice/gu)?.length, 1, 'perDevice is said more than once');
  assert.match(page, /const KEEPS = new Set\(\['appearance', 'keyboard'\]\)/u);
});

test('each Navigation section draws at most one hint', () => {
  const nav = markup('Navigation');
  for (const section of nav.split(/<Section\b/u).slice(1)) {
    const body = section.slice(0, section.indexOf('</Section>'));
    /* THE SHAPE'S TWO HINTS ARE ONE A WIDTH: the picker's on a wide screen, the phone's one sentence on a phone. */
    const hints = (body.match(/<p class="hint(?![^"]*phone-only)/gu) ?? []).length;
    assert.ok(hints <= 1, `a section draws ${hints} hints: ${body.slice(0, 80)}`);
  }
});

test("the Agents area's ways in show their hints on hover or focus under a pointer, and always under a thumb", () => {
  const agents = area('Agents');
  assert.match(agents, /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.door > \.hint \{\s*opacity: 0;/u);
  assert.match(agents, /\.door:hover > \.hint,\s*\.door:focus-within > \.hint \{\s*opacity: 1;/u);
  /* THE INBOX SWITCH'S SENTENCE IS ITS VISIBLE LABEL, inside a `.setting-row`, so it is never one of the hints hidden. */
  assert.match(markup('Agents'), /<div class="setting-row">\s*<p class="hint">\{copy\.connectInboxHint\}<\/p>/u);
});

test('Export and What comes in name the things a person keeps, not rows', () => {
  for (const name of ['Export', 'Ingest']) {
    const said = [...area(name).matchAll(/'([^'\n]*)'|`([^`\n]*)`/gu)].map((m) => m[1] ?? m[2] ?? '');
    for (const s of said) if (/\s/u.test(s)) assert.doesNotMatch(s, /\brows?\b/iu, `${name} says "${s}"`);
  }
});
