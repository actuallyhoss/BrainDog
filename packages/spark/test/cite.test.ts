/**
 * `cite`, and the shape a triage group is formed on.
 *
 * THE ROWS HERE ARE `46 §9`'S TABLE, case for case. It is the one table in that specification that
 * is written as input and expected output rather than as prose, because the rule it describes is
 * the product's whole claim about figures: a number in front of a person has a row behind it, or
 * it does not appear.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf, refused } from '@braindog/ports';

import { citable, cite, shapeOf, tokens } from '../src/index.ts';
import { INDEX, ROWS } from './double.ts';
import type { RawPayload } from '../src/index.ts';

const ALLOWED = citable({ rows: ROWS, index: INDEX, budget: { used: 0, limit: 6000 } });

const at = (text: string): string | undefined => {
  const out = cite(text, ALLOWED);
  return refused(out) ? out.refusal.at : undefined;
};

test('citable reads the money and the days off the rows, by the index type and not by shape', () => {
  assert.equal(ALLOWED.spoken.has('obligations#7'), true);
  assert.equal(ALLOWED.paths.has('obligations#7.amount'), true);
  assert.deepEqual([...ALLOWED.money].sort(), ['120000 EGP', '500500 EGP']);
  assert.deepEqual([...ALLOWED.days].sort(), ['2026-11-04', '2026-11-18', '2026-12-01']);
});

test('two refs are two citations, in the order they appear', () => {
  const out = cite('Move the two that renew first: {{ref:domains#4}} and {{ref:obligations#8}}.', ALLOWED);
  assert.equal(out.ok, true);
  assert.deepEqual(out.ok ? out.value.citations : [], ['domains#4', 'obligations#8']);
});

test('a digit outside braces is refused, and the span says which one', () => {
  const out = cite('about 40% of renewals', ALLOWED);
  assert.equal(codeOf(out), 'PROPOSAL_UNCITED');
  assert.equal(at('about 40% of renewals'), 'about 40%');
});

test('a path that is in the projection cites the row it names', () => {
  const out = cite('Due: {{obligations#7.amount}}', ALLOWED);
  assert.deepEqual(out.ok ? out.value.citations : [], ['obligations#7']);
});

test('a path for a row that is not in the projection is refused', () => {
  const out = cite('Due: {{obligations#9.amount}}', ALLOWED);
  assert.equal(codeOf(out), 'PROPOSAL_UNCITED');
  assert.equal(at('Due: {{obligations#9.amount}}'), '{{obligations#9.amount}}');
});

test('a quoted amount stands only when a row holds exactly it', () => {
  assert.equal(cite('{{money:500500 EGP}}', ALLOWED).ok, true);
  assert.equal(codeOf(cite('{{money:500600 EGP}}', ALLOWED)), 'PROPOSAL_UNCITED');
  assert.equal(codeOf(cite('{{money:500500 USD}}', ALLOWED)), 'PROPOSAL_UNCITED');
});

test('a quoted day stands only when a row holds it', () => {
  assert.equal(cite('Due {{day:2026-11-04}}', ALLOWED).ok, true);
  assert.equal(codeOf(cite('Due {{until:2026-12-25}}', ALLOWED)), 'PROPOSAL_UNCITED');
});

test('a computed figure is a metric path or nothing: a literal pct or quantity is always refused', () => {
  assert.equal(codeOf(cite('{{pct:-46.3}}', ALLOWED)), 'PROPOSAL_UNCITED');
  assert.equal(codeOf(cite('{{quantity:3 days}}', ALLOWED)), 'PROPOSAL_UNCITED');
});

test('a ninth typed kind is refused: 34 §2.3 lists eight', () => {
  assert.equal(codeOf(cite('{{rows:14}}', ALLOWED)), 'PROPOSAL_UNCITED');
});

test('a digit inside a code span is not a figure', () => {
  assert.equal(cite('`v2` shipped', ALLOWED).ok, true);
});

test('a typed kind may take a path, and the row it names is cited', () => {
  const out = cite('Pay {{money:obligations#7.amount}} by {{day:obligations#7.due}}.', ALLOWED);
  assert.deepEqual(out.ok ? out.value.citations : [], ['obligations#7']);
});

/**
 * The property, as a loop over a seeded generator rather than under `fast-check`.
 *
 * `46 §11` ASKS FOR `fast-check` AND IT IS NOT INSTALLED IN THIS WORKSPACE. Adding a devDependency
 * means a lockfile write, which is not this change's to make while nine other agents hold the same
 * tree. What is lost is shrinking, which matters when a failure has to be reduced to a minimal
 * case; what is kept is the property itself and a seed that reproduces any failure exactly. The
 * committed-seed directory of `46 §3` arrives with the library.
 */
test('property: any text with an ASCII digit outside braces and code spans is refused', () => {
  let seed = 20260920;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const words = ['due', 'soon', 'renewals', 'about', 'the', 'rent', 'and', 'within'];
  for (let i = 0; i < 500; i++) {
    const parts: string[] = [];
    const n = 1 + Math.floor(next() * 6);
    for (let w = 0; w < n; w++) parts.push(words[Math.floor(next() * words.length)] ?? 'due');
    const digit = String(Math.floor(next() * 1000));
    parts.splice(Math.floor(next() * (parts.length + 1)), 0, digit);
    /* A legitimate figure and a code span in the same sentence, so the property is about the loose
       digit and not about the absence of the other two forms. */
    const text = `{{ref:obligations#7}} ${parts.join(' ')} \`x1\``;
    assert.equal(codeOf(cite(text, ALLOWED)), 'PROPOSAL_UNCITED', `seed ${seed} text ${text}`);
  }
});

const raw = (over: Partial<RawPayload>): RawPayload => ({
  id: 'inbox_raw#212',
  channel: 'email',
  ts: '2026-11-14T08:00:00Z',
  from: 'alerts@HSBC.com.eg',
  subject: 'HSBC: You have received EGP 5,005.00 from ACME',
  body: 'body',
  ...over,
});

test('three payloads differing only in their digits are one shape', () => {
  const a = shapeOf(raw({}));
  const b = shapeOf(raw({ subject: 'HSBC: You have received EGP 1,200.50 from ACME' }));
  const c = shapeOf(raw({ subject: 'HSBC: You have received EGP 99.00 from ACME' }));
  assert.equal(a, b);
  assert.equal(b, c);
  /* `#.#` AND NOT `#,#.#`: `46 §9`'s triage row prints the latter, and its own next clause asks for
     one shape over three payloads differing only in their digits, which no mask can give while a
     thousands separator survives. The grouping wins; the printed example is the part that is wrong. */
  assert.equal(a, 'email|hsbc.com.eg|HSBC: You have received EGP #.# from ACME');
});

test('the shape carries the sender domain, lower-cased, and the channel', () => {
  assert.notEqual(shapeOf(raw({})), shapeOf(raw({ from: 'alerts@cib.com.eg' })));
  assert.notEqual(shapeOf(raw({})), shapeOf(raw({ channel: 'webhook' })));
  assert.equal(shapeOf(raw({ from: null })).startsWith('email||'), true);
});

test('the subject is cut at 64 bytes, on a character and not in the middle of one', () => {
  const shape = shapeOf(raw({ subject: 'م'.repeat(40) }));
  const subject = shape.split('|')[2] ?? '';
  assert.equal(subject.length, 32);
  assert.equal(tokens('م'.repeat(40)), Math.ceil(80 / 3));
});
