/**
 * How Today's reads end (review of 30 October, R6, R7, R8).
 *
 * R6, AS SEEN: on a phone a second read went out narrow and was trimmed; the window widened (or Edit was pressed) while
 * it was out, the effect that asks Today whole saw the read out and returned, and since `reading` was no rune nothing woke
 * it again: four widgets drew empty until the next version. The same from a phone's copy kept in memory drawn wide.
 * R7: a quiet read that failed kept the drawn page and still closed the screen as refused.
 * R8: a read whose component went mid-read held the route unsettled until its fetch came back.
 *
 * A TEXT TEST OVER THE PARTS, as `home-reads.test.ts` is: runes do not run under `node --test`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (at: string): string => readFileSync(new URL(at, import.meta.url), 'utf8');
const bare = (text: string): string => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/^\s*\/\/.*$/gmu, '');

const home = bare(source('./Home.svelte'));
const read = bare(source('../data/read.svelte.ts'));

test('R6: a read ending wakes the effect that asks Today whole, once for each answer drawn', () => {
  assert.match(home, /let reading = \$state\(false\);/u, '`reading` is a plain flag, so its end wakes nothing');
  const effect = home.slice(home.indexOf('if (!phoneOnly'), home.indexOf('if (!phoneOnly') + 400);
  assert.match(effect, /if \(reading\) return;/u);
  assert.match(effect, /if \(now === wholeAsked\) return;/u, 'a whole read that fails would be asked again on every end');
});

test('R6: a phone’s copy kept in memory is not drawn on a board wider than a phone', () => {
  assert.match(home, /isPhoneOnly\(kept\.got\) && !untrack\(\(\) => narrow\.current\) \? null : kept/u);
});

test('R7: a quiet read that fails over a drawn page closes the screen as drawn', () => {
  const kept = home.slice(home.indexOf("if (out?.from !== 'live' && !wasPartial && (was ||"), home.indexOf("if (out?.from !== 'live' && !wasPartial && (was ||") + 300);
  assert.match(kept, /readFailed = true;\s*ok = true;\s*return;/u);
});

test('R8: the token a question asked out loud opens is closed when its screen goes', () => {
  assert.match(read, /if \(asked !== null\) asks\.add\(asked\);/u);
  const teardown = read.slice(read.indexOf('gone = true;'), read.indexOf('gone = true;') + 300);
  assert.match(teardown, /for \(const at of asks\) closed\(true, at\);/u);
});
