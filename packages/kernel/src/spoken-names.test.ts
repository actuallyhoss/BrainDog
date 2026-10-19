import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nameSpokenIn } from './spoken-names.ts';

const names: Record<string, string> = { 'gadgets#8': 'Brass lever', 'gadgets#9': 'Tin whistle', S12: 'Mend the lamp' };
const nameOf = (s: string): string | null => names[s] ?? null;

test('a spoken id in a question is the row name', () => {
  assert.equal(nameSpokenIn('Change gadgets#8 to how it is set up?', nameOf), 'Change Brass lever to how it is set up?');
  assert.equal(nameSpokenIn('Mark gadgets#8 and gadgets#9 done?', nameOf), 'Mark Brass lever and Tin whistle done?');
});

test('a run number is its name', () => {
  assert.equal(nameSpokenIn('S12 left a step.', nameOf), 'Mend the lamp left a step.');
});

test('an id nothing answers to stays as written', () => {
  assert.equal(nameSpokenIn('Change gadgets#77 now? Also SG185.', nameOf), 'Change gadgets#77 now? Also SG185.');
});

test('a link or an anchor is left alone', () => {
  assert.equal(nameSpokenIn('See https://x.example/gadgets#8 now', nameOf), 'See https://x.example/gadgets#8 now');
});
