/**
 * The four screens of brief A8 (`loop/research-no-sample.md`) that drew the seeded studio when no record answered, read
 * from their source, because this app has no DOM to open them in.
 *
 * WHAT EACH ONE DID (DIRECTION 26). The bind sheet offered the studio's pages under a `sampleSide` and toasted "nothing
 * was saved" for a block on one of them. Spark answered a shell that was not live with "This is the sample". The
 * spoken-id resolver sent `/SG5` and `/tasks#3` to the studio's question and row when the record said 401. The saved
 * view drew the studio's `VIEWS` over rows from `list`. None of them asked whether anybody was looking at a real record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

/* COMMENTS ARE LEFT OUT, so a paragraph saying where the sample used to be is not a read of it. */
const code = (path: string): string => source(path).replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gmu, '');

test('the bind sheet has two sides, the record and its refusal, and no sample side', () => {
  const sheet = code('../ui/BindBlock.svelte');
  assert.doesNotMatch(sheet, /\bsampleSide\b|'sample'/u);
  assert.doesNotMatch(sheet, /\bpages\(\)|\bREGISTERS\b/u, 'the sheet reads the seeded pages or lists again');
  assert.doesNotMatch(sheet, /\bonbind\(/u, 'the press still hands the sample answer to the screen');
  assert.match(sheet, /readBoot\(apiBase\(\)\)/u);
});

test('the saved view never hands the bind sheet a sample answer', () => {
  const view = code('../../routes/v/[view]/+page.svelte');
  assert.doesNotMatch(view, /\bonbind=/u);
  assert.doesNotMatch(view, /\bVIEWS\b|\bPAGES\b|\bNOW\b|'sample'/u);
});

test('Spark reads the record whatever the shell says, and has no sample phase', () => {
  const spark = code('../../routes/spark/+page.svelte');
  assert.doesNotMatch(spark, /'sample'|words\.sample/u);
  assert.doesNotMatch(spark, /page\.data\.live/u, 'Spark decides from the shell again instead of asking the record');
  assert.match(spark, /readSpark\(client\)/u);
});

test('a spoken id is resolved on the record or not at all, never in the sample', () => {
  const resolver = code('../../routes/[id]/+page.svelte');
  assert.doesNotMatch(resolver, /\bQUESTIONS\b|\bDECIDED\b|\bentry\(|\bsampled\b|\bnoRecord\b/u);
  /* AND A RECORD THAT COULD NOT BE ASKED IS NOT "Nothing answers to …": nothing was asked. Its sentence is drawn. */
  assert.match(resolver, /UNAUTHORIZED/u);
  assert.match(resolver, /UNREACHABLE/u);
});
