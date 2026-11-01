/**
 * The glass and the motion scale, held to what `tokens.css` and `a11y.css` say about them.
 *
 * NO GLASS AT ALL (SPEC 1.9, wave 4). No sheet in the skin blurs what is behind it, in either spelling, and none names
 * a glass token: anything that floats is the opaque tile with a 1px `--rule-strong` edge.
 *
 * ONE DECLARATION PER NAME PER RULE. `--d-panel-out` was written twice in a row; harmless while both said the same,
 * and the first one silently dead the day they did not.
 *
 * THE BOARD IS ONE FLAT COLOUR: the body is `--board`, and nothing lights the ground.
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
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]*)$/u.exec(buf);
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

test('no sheet in the skin blurs what is behind it or names a glass', () => {
  for (const sheet of sheets) {
    const css = read(sheet);
    assert.doesNotMatch(css, /backdrop-filter/u, `${sheet} still blurs what is behind it`);
    assert.doesNotMatch(css, /--glass|--ground-light|--ground-glow/u, `${sheet} still names the glass`);
  }
});

test('the board is flat: the body is the board and nothing else', () => {
  assert.match(block(read('base.css'), /(^|[\s}])body\s*\{/u), /background:\s*var\(--board\);/u, 'the body is not the flat board');
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

test('the record forming has its own five steps, each under half a second, and each a fade or nothing under reduced motion', () => {
  const root = new Map(rules(read('tokens.css')).flatMap((r) => r.decls).filter(([n]) => /^--form-/u.test(n)));
  const names = ['--form-in', '--form-out', '--form-settle', '--form-count', '--form-gap'];
  for (const n of names) {
    const v = root.get(n);
    assert.ok(v && /^\d+ms$/u.test(v), `${n} is a millisecond step`);
    assert.ok(Number.parseInt(v, 10) <= 420, `${n} is ${v}, past 420ms`);
  }
  assert.match(read('tokens.css'), /--ease-spring: linear\(/u, 'the spring is a linear() curve');
  const reduced = block(read('a11y.css'), /@media \(prefers-reduced-motion: reduce\)/u);
  const rewritten = new Map(rules(`x{${block(reduced, /:root\s*/u)}}`).flatMap((r) => r.decls));
  for (const n of names) {
    const v = rewritten.get(n);
    assert.ok(v, `${n} is not rewritten under reduced motion`);
    assert.ok(Number.parseInt(v, 10) <= 120, `${n} is ${v} under reduced motion, longer than the fade`);
  }
});
