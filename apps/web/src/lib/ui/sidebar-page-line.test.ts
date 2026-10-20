/**
 * The rail's line that makes a page (`Sidebar.svelte`, PGS-C30): what it says to whoever owns the record and to
 * anybody else, which place holds it, and where the markup draws it.
 *
 * The two functions live in the component's module script, which Node cannot import, so this reads the lines between
 * the component's `page-line` marks, strips their types and runs them: the code under test is the code that ships.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pageWords } from '../record/page-new.ts';

type Kit = {
  pageLine: (owner: boolean, words: { newPage: string; suggestPage: string }) => string;
  holdsPages: (item: { key: string; label: string }, section: string) => boolean;
};

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Sidebar.svelte'), 'utf8');
const cut = /page-line:start[^\n]*\n([\s\S]*?)\n[^\n]*page-line:end/.exec(SOURCE);
assert.ok(cut, 'Sidebar.svelte keeps its page-line marks');
const js = stripTypeScriptTypes(cut[1]!).replace(/^(\s*)export /gm, '$1');
const { pageLine, holdsPages } = new Function(`${js}\nreturn { pageLine, holdsPages };`)() as Kit;

test('an owner reads New page, anybody else Suggest a page', () => {
  assert.equal(pageLine(true, pageWords), 'New page');
  assert.equal(pageLine(false, pageWords), 'Suggest a page');
});

test('only the Pages place holds the line', () => {
  assert.equal(holdsPages({ key: 'section:Pages', label: 'Pages' }, 'Pages'), true);
  assert.equal(holdsPages({ key: 'section:Projects', label: 'Projects' }, 'Pages'), false);
  assert.equal(holdsPages({ key: 'today', label: 'Pages' }, 'Pages'), false);
  assert.equal(holdsPages({ key: 'work', label: 'Work' }, 'Pages'), false);
});

test('the line is drawn under a place in both lists, after its views, and nowhere else', () => {
  assert.equal((SOURCE.match(/\{@render pageLineOf\(item\)\}/g) ?? []).length, 2);
  assert.equal((SOURCE.match(/\{@render viewsOf\(item\)\}\s*\{@render pageLineOf\(item\)\}/g) ?? []).length, 2);
  /* THE CALL IS LOADED ON ENTER, so the rail carries its words and not the client behind them. */
  assert.match(SOURCE, /await import\('\.\.\/record\/page-new\.ts'\)/);
  assert.match(SOURCE, /const \{[^}]*\bnewPage\b[^}]*\} = made;/);
});

test('the rail keeps what it had', () => {
  assert.match(SOURCE, /data-label=\{words\.newList\}/);
  assert.match(SOURCE, /\{#each things as \[section, list\] \(section\)\}/);
});

test('the heading of its own is drawn only on a rail with no Pages place', () => {
  assert.match(SOURCE, /\{#if !icons && !pagesPlaced\}\s*<section class="part" data-pages-heading>/);
  assert.equal((SOURCE.match(/\{@render pageLineDrawn\(true\)\}/g) ?? []).length, 1);
  assert.equal((SOURCE.match(/\{@render pageLineDrawn\(false\)\}/g) ?? []).length, 1);
});
