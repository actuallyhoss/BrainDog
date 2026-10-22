/**
 * What the model is told matches the rules the record holds (ENG-A14, ENG-A07, ENG-B14): a script Slash writes sends no
 * key ("F8 Slash scripts proposal-only no vault keys", H.735), the one example page is an invented one and never a real
 * project's, a figure is always written as the path it was handed ("Spark may not type a number. It may only name a
 * path.", HD.563), and a page is never offered for a thing that already has one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calmFaults } from '@braindog/record';
import { isMarkGlyph } from '@braindog/kernel';

import { GOOD_PAGE, SLASH_COMPOSE_INSTRUCTIONS, SLASH_HEADLINE_INSTRUCTIONS, SLASH_INSTRUCTIONS } from '../src/slash.ts';
import { keysFor, PAGE_KEYS } from '../../kernel/src/block-keys.ts';

const lines = SLASH_INSTRUCTIONS.split('\n');
const scriptLine = lines.find((l) => l.startsWith('A script is code'));

test('NO WORD OF ONE RECORD\'S PROJECT: neither the instructions nor the example page say bake, in any case', () => {
  for (const [name, text] of [
    ['SLASH_INSTRUCTIONS', SLASH_INSTRUCTIONS],
    ['SLASH_COMPOSE_INSTRUCTIONS', SLASH_COMPOSE_INSTRUCTIONS],
    ['GOOD_PAGE', JSON.stringify(GOOD_PAGE)],
  ] as const)
    assert.ok(!/bake/iu.test(text), `${name} names one record's project`);
});

test('A SCRIPT SLASH WRITES SENDS NO KEY: its header shows keys: [], and nothing teaches a key by its label', () => {
  assert.ok(scriptLine !== undefined, 'the instructions still say what a script is');
  const header = JSON.parse(scriptLine.slice(scriptLine.indexOf('{"id":"script.'), scriptLine.indexOf('}}, and no other key') + 2)) as {
    body: { keys: unknown; egress: unknown; runs: unknown };
  };
  assert.deepEqual(header.body.keys, []);
  assert.ok(scriptLine.includes('A script you write sends no key: keys is always empty.'));
  assert.ok(!/by its label/iu.test(SLASH_INSTRUCTIONS), 'a sentence still teaches a key by its label');
  assert.ok(!SLASH_INSTRUCTIONS.includes('<key label>'), 'an example still sends a key');
  assert.ok(!/"key":/u.test(scriptLine), 'ctx.fetch is still shown with a key');
  /* EVERY OTHER SCRIPT RULE IS AS IT WAS. */
  for (const kept of ['egress is every https origin it fetches from', 'never under 15m', 'reads stays empty when it fetches', 'ctx.write("<list id>"', 'nothing runs until they accept'])
    assert.ok(scriptLine.includes(kept), kept);
});

test('THE TWO NEW LINES ARE SAID: a figure is its path, and a page is never offered twice', () => {
  assert.ok(SLASH_COMPOSE_INSTRUCTIONS.split('\n').includes('Write a figure as the {{path}} you were handed, never as digits.'));
  assert.equal(SLASH_HEADLINE_INSTRUCTIONS, SLASH_COMPOSE_INSTRUCTIONS);
  assert.ok(lines.includes('Never offer a page for something that already has one: usage.pages lists what has a page.'));
  assert.ok(!/[—]/u.test(SLASH_INSTRUCTIONS) && !/[—]/u.test(SLASH_COMPOSE_INSTRUCTIONS), 'an em dash in what the model is told');
});

test('THE GOOD PAGE IS THE ONE SENT, and every key on it is one the kernel reads and the record\'s page bar passes', () => {
  const line = lines.find((l) => l.startsWith('A good page'))!;
  assert.deepEqual(JSON.parse(line.slice(line.indexOf('{"id"'))), GOOD_PAGE);
  assert.equal(GOOD_PAGE.id, `page.${GOOD_PAGE.body.page}`);
  for (const key of Object.keys(GOOD_PAGE.body)) assert.ok(PAGE_KEYS.has(key), `page key ${key}`);
  const blocks = GOOD_PAGE.body.blocks as readonly Record<string, unknown>[];
  for (const b of blocks) {
    const known = new Set(keysFor(String(b.kind)));
    for (const key of Object.keys(b)) assert.ok(known.has(key), `${String(b.kind)} reads no ${key}`);
    if (b.icon !== undefined) assert.ok(isMarkGlyph(b.icon), `${String(b.icon)} is no glyph`);
  }
  /* EVERY FIGURE IN ITS LEAD IS A PATH, never a digit. */
  assert.match(String(blocks[0]!.body), /^\{\{firings-open\}\} [^0-9]*\{\{firings-due-week\}\}[^0-9]*$/u);
  assert.deepEqual(calmFaults([{ id: GOOD_PAGE.id, blocks }]), []);
});
