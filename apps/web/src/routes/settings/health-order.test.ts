/**
 * SETTINGS › HEALTH SAYS WHAT IT FOUND WITHOUT WAITING ON THE LONG WALK (the audit of 25 October, Z36).
 *
 * WHAT WAS WRONG. Captured on his record at both widths and themes, Health still said "Reading the record for anything
 * to tidy." after the screen said it was drawn (`settings-health-390-light.png`). Its seven reads run one after another,
 * and the first was the walk of every page and note, 11 to 16 seconds on a record his size, so the six quick parts
 * waited behind it, and the screen claimed it was drawn before any part had answered.
 *
 * THE COMPONENT IS READ AS TEXT, as `segmented.test.ts` reads markup: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const health = readFileSync(new URL('./[area]/areas/Health.svelte', import.meta.url), 'utf8');

test('the walk of every page and note is asked last, after the six quick parts', () => {
  const walk = health.indexOf('m.textFaultsOnce(');
  for (const quick of ['m.readStale(', 'm.readMatched(', 'm.loadLearned(', 'm.loadNamedTwice(', 'm.loadHues(', 'm.loadImported(']) {
    const at = health.indexOf(quick);
    assert.ok(at > 0, `${quick} is not asked`);
    assert.ok(at < walk, `${quick} waits behind the long walk`);
  }
});

test('the screen is drawn only once a part has answered, and says nothing to tidy while the walk reads on', () => {
  assert.match(health, /let first: number \| null = opened\(\);/u, 'the screen claims it is drawn on the shell alone');
  assert.match(health, /closed\(true, first\);/u);
  assert.match(health, /\{#if !heard && !quick\}/u, 'the reading line stays up until the walk ends');
  assert.match(health, /\{:else if !any && !heard\}\s*<!--[^>]*-->\s*<Empty kind="cleared" title=\{words\.clear\} body=\{words\.clearBodyUnchecked\} \/>/u);
  assert.match(health, /words\.readingPages/u);
});
