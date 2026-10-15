/**
 * After an import, version 2 (REC-C17 step 3): a project whose heading names a glyph no host draws is offered the
 * nearest glyph a host draws, as a part of the same arrangement, and its mark is cleared only where none is near.
 * Version 1, which only cleared it, is kept in `was`, so a record still holding it untouched is offered the new text.
 *
 * THE GLYPHS ARE THE ONES `braindog:grammar/page` ALREADY HANDS (`packages/record/src/grammar.ts`, `glyphs`), read here
 * from the source as `agents-skills.test.ts` reads the tools, so the seed does not reach up into the record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AGENTS_SKILLS } from '../src/packs/agents-skills.ts';
import { seedCatalogue } from '../src/usecases/catalogue.ts';

const text = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const skill = () => {
  const s = AGENTS_SKILLS.find((x) => x.name === 'after-an-import');
  assert.ok(s, 'the agents add-on ships no After an import');
  return s;
};

/** The census step of a text: the one line that names `glyphs_unknown`. */
const censusLine = (body: string) => {
  const lines = body.split('\n').filter((l) => l.includes('glyphs_unknown'));
  assert.equal(lines.length, 1, 'the census step is one line');
  return lines[0]!;
};

test('VERSION 2, with version 1 kept as it shipped', () => {
  const s = skill();
  assert.equal(s.rev, 2);
  assert.equal(s.was?.length, 1);
  assert.match(censusLine(s.was![0]!), /has its mark cleared\.$/u, 'version 1 is not the text that only cleared the mark');
  assert.notEqual(s.body, s.was![0]);
});

test('THE NEAREST GLYPH IS A PART OF THE SAME ARRANGEMENT, and a mark is cleared only where none is near', () => {
  const line = censusLine(skill().body);
  assert.match(line, /read `braindog:grammar\/page`/u);
  assert.match(line, /Put in the same arrangement, as a part, the nearest glyph a host draws/u);
  assert.match(line, /Clear the mark only where no glyph there is near/u);
  assert.doesNotMatch(line, /has its mark cleared/u);
});

test('ONLY THE CENSUS STEP CHANGED: every other line of version 1 is in version 2, in order', () => {
  const s = skill();
  const rest = (body: string) => body.split('\n').filter((l) => !l.includes('glyphs_unknown'));
  assert.deepEqual(rest(s.body), rest(s.was![0]!));
});

test('THE RESOURCE IT READS HANDS THE GLYPHS: grammar/page is served, and its grammar carries them', () => {
  assert.match(text('mcp/src/index.ts'), /resource\('grammar\/page'/u);
  assert.match(text('record/src/grammar.ts'), /\.\.\.\(GLYPHS \? \{ glyphs: GLYPHS \} : \{\}\)/u);
});

test('THE CATALOGUE OFFERS VERSION 2 with the agents add-on', () => {
  const agents = seedCatalogue().find((e) => e.id === 'agents');
  const shipped = agents?.skills?.find((x) => x.name === 'after-an-import');
  assert.equal(shipped?.rev, 2);
  assert.equal(shipped?.body, skill().body);
});
