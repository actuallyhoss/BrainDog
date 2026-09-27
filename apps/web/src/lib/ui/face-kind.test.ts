/**
 * `Face`'s decisions, read from `face.ts`: the kind it falls back to for a name alone, and a person's hue.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { actor } from '../record/names.ts';
import { faceKindOf, hueFor } from './face.ts';

test('a name alone draws the face of the actor `names.ts` would have said it for', () => {
  for (const by of ['slash', 'system', 'agent:claude', 'codex', 'S12', 'rule.invoice-late']) {
    const said = actor(by);
    assert.equal(faceKindOf(said.name), said.kind, `${by} is drawn as ${faceKindOf(said.name)}`);
  }
});

test('a rule the product does not ship keeps its glyph once `actor` has said its name', () => {
  for (const by of ['rule.reply', 'rule:renewal', 'ingest:mercury-feed']) {
    const said = actor(by);
    assert.equal(faceKindOf(said.name), said.kind, `${by}, said "${said.name}", is drawn as ${faceKindOf(said.name)}`);
  }
});

test('a person keeps a monogram, even after `actor` has said their name', () => {
  actor('p_01M1KJ7RG0TYYA0AX15QPGJJ4', null, new Map([['p_01M1KJ7RG0TYYA0AX15QPGJJ4', 'Mara Ellis']]));
  assert.equal(faceKindOf('Mara Ellis'), 'person');
});

test('anything else is a person, including a person whose name happens to end in "rule"', () => {
  assert.equal(faceKindOf('Ada Lovelace'), 'person');
  assert.equal(faceKindOf('Hal Rule'), 'person');
  assert.equal(faceKindOf('Someone on this record'), 'person');
});

test('a person keeps one hue, one of twelve thirty degrees apart', () => {
  const hue = hueFor('p_01M1KJ7RG0TYYA0AX15QPGJJ4');
  assert.equal(hueFor('p_01M1KJ7RG0TYYA0AX15QPGJJ4'), hue);
  for (const key of ['', 'Ada', 'Bea', 'de Vries', 'p_seed', '名前']) {
    const h = hueFor(key);
    assert.ok(Number.isInteger(h) && h >= 0 && h < 360 && h % 30 === 0, `${key} took the hue ${h}`);
  }
  const spread = new Set(['Ada', 'Bea', 'Cal', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lu'].map(hueFor));
  assert.ok(spread.size > 1, 'every name took the same hue');
});
