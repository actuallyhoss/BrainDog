import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SCALE_CSS } from './scale.ts';

const sheet = readFileSync(new URL('../../skin/tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
const declared = [...SCALE_CSS.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gu)];

test('every step the book lists is a step the sheet draws, at the same size', () => {
  assert.ok(declared.length > 20);
  for (const [, name, value] of declared) {
    assert.match(sheet, new RegExp(`${name}:\\s*${value!.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')};`), `${name} is ${value} in the sheet`);
  }
});
