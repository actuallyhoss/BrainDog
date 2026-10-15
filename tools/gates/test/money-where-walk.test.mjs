/**
 * Money's Where it went walk, its pure half and its planted fault (PGS-C20's guard).
 *
 *   node --test tools/gates/test/money-where-walk.test.mjs
 *
 * WHY THE JUDGE IS ASKED WITHOUT A BROWSER. The walk opens Money in a real browser, and a browser gate that cannot go
 * red is a gate that passes a heading that never opens. So what it read is handed to one pure `judge(seen)`, each promise
 * is taken away here in turn, and the planted reading `self-test` runs it with is held to the words self-test names.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { HEADING, PLANT, UNDER, WIDTHS, handed, judge, planted, seeded, walkedTrue } from '../walks/money-where.walk.mjs';

const gates = join(import.meta.dirname, '..');

/** A walk that saw everything PGS-C20 promises, at one width: the heading, shut, then open on both blocks. */
const good = (width) => ({
  width,
  heading: true,
  before: Object.fromEntries(UNDER.map((h) => [h, false])),
  after: Object.fromEntries(UNDER.map((h) => [h, true])),
});

test('a walk that saw it all is green, and each promise taken away is red in its own words', () => {
  for (const width of WIDTHS) {
    assert.deepEqual(judge(good(width)), []);
    assert.match(judge({ ...good(width), heading: false })[0], new RegExp(`^${width}: Money draws no heading "${HEADING}"`, 'u'));
    const open = { ...good(width), before: Object.fromEntries(UNDER.map((h) => [h, true])) };
    assert.equal(judge(open).filter((f) => f.includes('the heading is not folded')).length, UNDER.length);
  }
});

test('the seed is read from BRAINDOG_GATE_SEED alone, by its own name, among others joined by commas', () => {
  const was = process.env.BRAINDOG_GATE_SEED;
  try {
    delete process.env.BRAINDOG_GATE_SEED;
    assert.equal(seeded(), false, 'no variable, no seed');
    process.env.BRAINDOG_GATE_SEED = 'row-drawer, money-where';
    assert.equal(seeded(), true, 'one of several, as a11y reads them');
  } finally {
    if (was === undefined) delete process.env.BRAINDOG_GATE_SEED;
    else process.env.BRAINDOG_GATE_SEED = was;
  }
  for (const other of [undefined, '', 'row-drawer', 'money', 'where']) assert.equal(seeded(other), false, `${JSON.stringify(other)} is not this walk's seed`);
});

test('the planted reading turns a green walk red, in the words self-test names, and changes nothing else', async () => {
  const { BROWSER } = await import('../self-test.mjs');
  const c = BROWSER.find((b) => b.gate === 'money-where');
  assert.ok(c, 'no money-where case in BROWSER');
  const walk = readFileSync(join(gates, c.file), 'utf8');
  for (const n of [c.names].flat()) assert.ok(walk.includes(n), `the walk never says "${n}"`);
  for (const width of WIDTHS) {
    const seen = good(width);
    assert.ok(walkedTrue(seen));
    const findings = judge(planted(seen));
    assert.equal(findings.length, UNDER.length, findings.join(' | '));
    assert.ok(findings.every((f) => f.includes([c.names].flat()[0])), findings.join(' | '));
    const { after: _a, ...rest } = planted(seen);
    const { after: _b, ...was } = seen;
    assert.deepEqual(rest, was);
    assert.equal(handed(seen, false), seen, 'an unseeded run hands the judge what it read, itself');
  }
  assert.doesNotMatch(PLANT, /[—–]/u);
});
