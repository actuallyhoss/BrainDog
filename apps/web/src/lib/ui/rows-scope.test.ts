/**
 * NO NEW SCREEN TAKES THE GLOBAL ROW.
 *
 * `rows.css` draws `.row` and `.line` for every page, so a screen that names a box of its own `row` or `line` gets the
 * ledger's row laid over it: the three leaks first-run measured (the made list on /start, the email row on sign-up,
 * the name row on an invite) were each a screen's own box drawn as a ledger line. The names stay (renaming thirty
 * files is churn nobody sees); the leaks are fixed where they are, and this holds the line: the route files that write
 * `row` or `line` as a class today are listed, and a route file not on the list that writes one is refused. A file
 * that stops writing one is free to; the list is a ceiling, not a roll call.
 *
 * A TEXT TEST OVER THE ROUTES, as `controls-segment.test.ts` is over a stylesheet.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTES = fileURLToPath(new URL('../../routes/', import.meta.url));

/** The route files that write the global `row` or `line` as a class on 20 October. */
const TODAY = new Set([
  'audit/+page.svelte',
  'automations/AutomationSentence.svelte',
  'automations/HubRows.svelte',
  'automations/[id]/+page.svelte',
  'decide/+page.svelte',
  'inbox/+page.svelte',
  'jobs/+page.svelte',
  'addons/Installed.svelte',
  'addons/Removed.svelte',
  'addons/[id]/Installed.svelte',
  'r/[register]/parts/ListPeople.svelte',
  /* THE ORGANISATIONS LIST (29 October) draws its rows as People does, the global tall line on purpose. */
  'r/[register]/parts/ListOrgs.svelte',
  /* THE LIST OF AGENT RUNS (4360c5ae6) is `rows.css`'s ledger on purpose too, as its own comment says. */
  'r/[register]/parts/ListRuns.svelte',
  'search/+page.svelte',
  'settings/[area]/areas/Appearance.svelte',
  'settings/[area]/areas/Backups.svelte',
  'settings/[area]/areas/Identity.svelte',
  'settings/[area]/areas/Navigation.svelte',
  'settings/[area]/areas/Pages.svelte',
  'settings/[area]/areas/Recovery.svelte',
  'settings/[area]/areas/Sessions.svelte',
  'slash/+page.svelte',
  'usage/+page.svelte',
  'keychain/+page.svelte',
]);

const svelte = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? svelte(join(dir, e.name)) : e.name.endsWith('.svelte') ? [join(dir, e.name)] : [],
  );

/** Every class a file writes in markup: a quoted `class="…"` and the strings of a `class={[…]}` list. */
const classes = (text: string): string[] => {
  const markup = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gu, '').replace(/<!--[\s\S]*?-->/gu, '');
  const quoted = [...markup.matchAll(/\bclass="([^"]*)"/gu)].flatMap((m) => m[1]!.replace(/\{[^}]*\}/gu, ' ').split(/\s+/u));
  const listed = [...markup.matchAll(/\bclass=\{\[([^\]]*)\]/gu)].flatMap((m) => [...m[1]!.matchAll(/'([^']*)'/gu)].flatMap((q) => q[1]!.split(/\s+/u)));
  return [...quoted, ...listed].filter(Boolean);
};

const writing = svelte(ROUTES)
  .filter((file) => classes(readFileSync(file, 'utf8')).some((c) => c === 'row' || c === 'line'))
  .map((file) => relative(ROUTES, file).replaceAll('\\', '/'))
  .sort();

test('no route file outside today’s list writes the global row or line', () => {
  const fresh = writing.filter((file) => !TODAY.has(file));
  assert.deepEqual(fresh, [], `these write \`row\` or \`line\` as a class and are not on the list; name the box for what it is: ${fresh.join(', ')}`);
});

test('and the reader can see it ran: today’s list is what it finds', () => {
  assert.ok(writing.length > 0, 'the walk found no route file at all writing a row, so it is not reading the routes');
  for (const file of writing) assert.ok(TODAY.has(file), file);
});
