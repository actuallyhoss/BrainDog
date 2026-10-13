/**
 * The hole row of a bar or gauge is marked by a quiet fill and never by a dashed box.
 *
 * A dashed line is a place to drop something (a drag target), and a hole is a place to type. This holds only that
 * the rule in `kinds/proportional.css` is still written that way; how it looks is a browser's to say.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./kinds/proportional.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every rule whose selector is exactly `selector`. */
const bodies = (selector: string): string[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.split(',').some((s) => s.trim() === selector)).map((m) => m[2]!);

test('the hole row rests on the field, with no dashed line and no border', () => {
  const rules = bodies('.prop-row[data-hole]');
  assert.ok(rules.length > 0, 'the rule is still written');
  const body = rules.join('\n');
  assert.match(body, /background:\s*var\(--field\)\s*;/);
  assert.doesNotMatch(body, /dashed/);
  for (const m of body.matchAll(/border(?:-[a-z-]+)?:\s*([^;]+);/g)) assert.equal(m[1]!.trim(), '0', `a border other than 0: ${m[0]}`);
});

test('no rule of the hole row draws a dashed line, hovered or not', () => {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (m[1]!.includes('[data-hole]')) assert.doesNotMatch(m[2]!, /dashed/, m[1]!.trim());
});
