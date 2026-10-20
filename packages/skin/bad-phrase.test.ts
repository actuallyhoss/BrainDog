/**
 * The red phrase, held to what `tokens.css` says about late.
 *
 * `{{bad:...}}` is the one inline form that draws red, and the renderer draws it as `<span class="bad">`. The skin
 * owns how that reads, and three things hold it:
 *
 * IT IS THE DEEPER RED, BY ITS TOKEN. Late and needs-you are `--red`, a step deeper than the working accent
 * (DIRECTION §42), and `--red` is that red solved for words. The phrase is words, so it reads one of the two
 * and never `--red-fill`, which says "chosen" and "go".
 *
 * NO COLOUR IS SPELLED OUT. A hex, an `rgb()` or a colour word here is a red no palette can move.
 *
 * COLOUR IS NEVER ALONE. Working and late are both red now, so the phrase carries a weight or an underline as well,
 * and reads as marked to someone who cannot tell the two reds apart.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const here = new URL('./', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, here), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');

/** Every rule whose selector list names `.bad` on its own, as its declarations. */
function bad(css: string): Map<string, string>[] {
  const out: Map<string, string>[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    const selectors = m[1]!.split(',').map((s) => s.trim());
    if (!selectors.includes('.bad')) continue;
    const decls = new Map<string, string>();
    for (const line of m[2]!.split(';')) {
      const at = line.indexOf(':');
      if (at > 0) decls.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
    }
    out.push(decls);
  }
  return out;
}

const LATE = ['--red'];
const LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(|\b(?:red|crimson|firebrick|maroon|tomato)\b/iu;

test('blocks.css holds one rule for the red phrase', () => {
  assert.equal(bad(read('blocks.css')).length, 1, 'blocks.css has no single `.bad` rule');
});

test('the red phrase is the deeper red of tokens.css, by its token', () => {
  const tokens = read('tokens.css');
  const [rule] = bad(read('blocks.css'));
  assert.ok(rule, 'blocks.css has no `.bad` rule');
  const colour = rule.get('color') ?? '';
  const name = /^var\((--[\w-]+)\)$/u.exec(colour)?.[1];
  assert.ok(name && LATE.includes(name), `the phrase's colour is ${colour || 'not set'}, not the late red`);
  assert.match(tokens, new RegExp(`${name}\\b`, 'u'), `tokens.css does not know ${name}`);
});

test('the red phrase spells out no colour', () => {
  const [rule] = bad(read('blocks.css'));
  assert.ok(rule, 'blocks.css has no `.bad` rule');
  for (const [prop, value] of rule) {
    /* A token's own name is not a literal: `var(--red)` names the token, so it is set aside before the check. */
    assert.doesNotMatch(value.replace(/var\(--[\w-]+\)/gu, ''), LITERAL, `.bad writes ${prop}: ${value}`);
    assert.doesNotMatch(value, /var\(--red-fill/u, `.bad reads the working accent in ${prop}`);
  }
});

test('the red phrase carries a mark that is not colour', () => {
  const [rule] = bad(read('blocks.css'));
  assert.ok(rule, 'blocks.css has no `.bad` rule');
  const weight = Number(rule.get('font-weight') ?? 0);
  const line = rule.get('text-decoration-line') ?? rule.get('text-decoration') ?? '';
  assert.ok(weight >= 600 || /\bunderline\b/u.test(line), 'the phrase is told from its sentence by colour alone');
});
