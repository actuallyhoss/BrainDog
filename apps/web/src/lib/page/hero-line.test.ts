/**
 * A project's hero says the model's line when the record kept one (the thinking scope of 24 October): the lead note
 * comes with the line (`page-live.ts` `modelLine`), the page hands it to the shape (`modelLineOf`, `PageView.svelte`),
 * and the hero says it in place of its rules' line, marked on hover as written by BrainDog (`ProjectPart.svelte`).
 * Kept through the shape becoming declared blocks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../record/fixtures/fill.ts';
import { blockOf } from '../record/page-live.ts';
import { modelLineOf } from './project-page.ts';

const AT = Date.UTC(2026, 8, 15, 12);
const LEAD = { kind: 'note', lead: true, body: 'Kiln has {{project-open:Kiln}} open.', values: { 'project-open:Kiln': 4 }, rows: [], matched: 0, refusals: [] };
const SAID = 'Kiln is waiting on two reviews, and the licence call is next.';

test("THE LINE THE RECORD KEPT IS THE HERO'S, and the rules speak where it kept none", () => {
  const kept = blockOf({ ...LEAD, said: SAID } as never, new Map(), AT);
  assert.equal(modelLineOf([kept as never]), SAID);
  /* NO LINE KEPT, A BLANK ONE, OR A LEAD NOT DRAWN: the rules' line is the hero's. */
  assert.equal(modelLineOf([blockOf(LEAD as never, new Map(), AT) as never]), null);
  assert.equal(modelLineOf([blockOf({ ...LEAD, said: '  ' } as never, new Map(), AT) as never]), null);
  assert.equal(modelLineOf([{ ...(kept as object), kind: 'note', drawn: false } as never]), null);
  /* ONLY THE LEAD: a plain note with words is no line of the model's. */
  assert.equal(modelLineOf([{ kind: 'note', body: SAID, modelLine: true }]), null);
});

test('THE HERO SAYS IT FIRST, WITH WHO WROTE IT ON HOVER, and the page hands it to the shape', () => {
  const part = readFileSync(new URL('./ProjectPart.svelte', import.meta.url), 'utf8');
  const hero = part.slice(part.indexOf("{#if part === 'hero'}"));
  const line = hero.indexOf('{#if hold.modelLine}');
  /* UNDER THE HEADLINE SINCE the page of 27 October, which is a fact the rules say, in place of the rules' own lede. */
  const head = hero.indexOf('{facts.headline}');
  const rules = hero.indexOf('facts.lede');
  assert.ok(head > 0 && head < line && line < rules, "the model's line is said under the headline, before the rules' lede, in its place");
  assert.match(hero, /<p class="h-say own-dir" title=\{WROTE\}>\{hold\.modelLine\}<\/p>/u);
  assert.match(part, /const WROTE = 'Written by BrainDog from this project’s figures';/u);
  const view = readFileSync(new URL('./PageView.svelte', import.meta.url), 'utf8');
  assert.match(view, /const modelLine = \$derived\(modelLineOf\(live\?\.page\.blocks \?\? \[\]\)\);/u);
  assert.match(view, /hold\.modelLine = line;/u);
});
