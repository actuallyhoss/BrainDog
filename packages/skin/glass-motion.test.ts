/**
 * The glass and the motion scale, held to what `tokens.css` and `a11y.css` say about them.
 *
 * ONE GLASS VALUE, AND SAFARI READS IT TOO. `--glass-blur` is the one blur the chrome may name, and it is `none` now,
 * so a `-webkit-backdrop-filter` written as a blur in so many words is the old defect: a blur no token can take away.
 * In the skin, the prefixed property is the token or `none`, and nothing else.
 *
 * ONE DECLARATION PER NAME PER RULE. `--d-panel-out` was written twice in a row; harmless while both said the same,
 * and the first one silently dead the day they did not.
 *
 * THE GLASS IS OPAQUE NOW (DIRECTION §39, "no glass"). No palette paints a see-through `--glass` or its saturation;
 * `base.css` paints `--glass` and `--glass-strong` as the tile, the ground's light is none and the board is one flat
 * colour, the glass's edge is one hairline, not a rim or a glow, and the blur is none. The names stay only for the
 * chrome that still reads them.
 *
 * REDUCED MOTION REWRITES THE WHOLE SCALE. Every step `tokens.css` writes as a time is written again under the query,
 * at no more than the 120ms fade, and every older name is written as a step, so it follows.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const here = new URL('./', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, here), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
const sheets = [
  ...readdirSync(here).filter((f) => f.endsWith('.css')),
  ...readdirSync(new URL('kinds/', here)).filter((f) => f.endsWith('.css')).map((f) => `kinds/${f}`),
];

/** The custom properties each rule declares, in source order, with the rule's selector. */
function rules(css: string): { selector: string; decls: [string, string][] }[] {
  const out: { selector: string; decls: [string, string][] }[] = [];
  const stack: { selector: string; decls: [string, string][] }[] = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') {
      stack.push({ selector: buf.trim(), decls: [] });
      buf = '';
    } else if (ch === '}' || ch === ';') {
      const m = /^\s*(--[\w-]+|-webkit-backdrop-filter)\s*:\s*([\s\S]*)$/u.exec(buf);
      if (m && stack.length > 0) stack.at(-1)!.decls.push([m[1]!, m[2]!.trim()]);
      buf = '';
      if (ch === '}') {
        const done = stack.pop();
        if (done) out.push(done);
      }
    } else buf += ch;
  }
  return out;
}

/** The body of the first block whose prelude matches, braces balanced. */
function block(css: string, prelude: RegExp): string {
  const m = prelude.exec(css);
  assert.ok(m, `no block matching ${prelude}`);
  let depth = 0;
  const start = css.indexOf('{', m.index);
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start + 1, i);
  }
  throw new Error(`unbalanced block at ${prelude}`);
}

test('no rule in the skin declares a custom property twice', () => {
  for (const sheet of sheets) {
    for (const { selector, decls } of rules(read(sheet))) {
      const seen = new Set<string>();
      for (const [name] of decls) {
        if (!name.startsWith('--')) continue;
        assert.ok(!seen.has(name), `${sheet}: ${selector} declares ${name} twice`);
        seen.add(name);
      }
    }
  }
});

test("Safari's spelling reads the glass token, or none, and never a literal blur", () => {
  for (const sheet of sheets) {
    for (const { selector, decls } of rules(read(sheet))) {
      for (const [name, value] of decls) {
        if (name !== '-webkit-backdrop-filter') continue;
        assert.match(value, /^(var\(--glass-blur\)|none)(\s*!important)?$/u, `${sheet}: ${selector} writes ${value}`);
      }
    }
  }
});

test('the glass blur is one token, and it is none, and less transparency keeps it none', () => {
  const tokens = rules(read('tokens.css')).flatMap((r) => r.decls).filter(([n]) => n === '--glass-blur');
  assert.equal(tokens.length, 1, 'tokens.css writes --glass-blur once');
  assert.equal(tokens[0]![1], 'none', 'the chrome still blurs what passes under it');

  /* No palette paints a see-through glass or a saturation for one: the glass is the tile, which `base.css` paints. */
  for (const sheet of ['house.css', 'alpha.css']) {
    const painted = rules(read(sheet)).filter((r) => r.decls.some(([n]) => n === '--glass' || n === '--glass-sat'));
    assert.deepEqual(painted.map((r) => r.selector), [], `${sheet} still paints glass`);
  }

  const less = block(read('a11y.css'), /@media \(prefers-reduced-transparency: reduce\)/u);
  assert.match(less, /--glass-blur:\s*none;/u);
  assert.match(less, /@supports \(-webkit-backdrop-filter: none\)\s*\{\s*\*\s*\{\s*-webkit-backdrop-filter: none !important;/u);
});

test('the glass is opaque: base paints it as the tile, the board is flat and the edge is a hairline', () => {
  const base = read('base.css');
  const html = rules(base).find((r) => r.selector === 'html');
  assert.ok(html, 'base.css has no html rule');
  const decl = new Map(html.decls);
  assert.equal(decl.get('--glass'), 'var(--tile)', 'the glass is not painted opaque');
  assert.equal(decl.get('--glass-strong'), 'var(--tile)', 'the strong glass is not painted opaque');
  assert.match(block(base, /(^|[\s}])body\s*\{/u), /background:\s*var\(--board\);/u, 'the body is not the flat board');

  const tokens = new Map(rules(read('tokens.css')).flatMap((r) => r.decls));
  assert.equal(tokens.get('--ground-light'), 'none', 'the ground still has a light on it');
  assert.match(tokens.get('--glass-edge') ?? '', /^0 0 0 1px var\(--[\w-]+\)$/u, 'the glass edge is more than one hairline');
});

test('reduced motion rewrites every step of the scale, and every older name is a step', () => {
  const root = rules(read('tokens.css')).flatMap((r) => r.decls).filter(([n]) => /^--d-/u.test(n));
  const steps = root.filter(([, v]) => /^\d+ms$/u.test(v));
  const named = root.filter(([, v]) => !/^\d+ms$/u.test(v));
  assert.ok(steps.length >= 9, 'the scale has its nine steps');
  for (const [n, v] of steps) assert.ok(Number.parseInt(v, 10) < 300, `${n} is ${v}, past 300ms`);
  const stepNames = new Set(steps.map(([n]) => n));
  for (const [n, v] of named) {
    const m = /^var\((--d-[\w-]+)\)$/u.exec(v);
    assert.ok(m && stepNames.has(m[1]!), `${n} is ${v}, not a step of the scale`);
  }

  const reduced = block(read('a11y.css'), /@media \(prefers-reduced-motion: reduce\)/u);
  const rewritten = new Map(rules(`x{${block(reduced, /:root\s*/u)}}`).flatMap((r) => r.decls));
  for (const name of stepNames) {
    const v = rewritten.get(name);
    assert.ok(v, `${name} is not rewritten under reduced motion`);
    assert.ok(Number.parseInt(v, 10) <= 120, `${name} is ${v} under reduced motion, longer than the fade`);
  }
  assert.match(reduced, /transition-property: opacity, visibility, display, overlay !important;/u);
  assert.match(reduced, /transition-duration: 120ms !important;/u);
});
