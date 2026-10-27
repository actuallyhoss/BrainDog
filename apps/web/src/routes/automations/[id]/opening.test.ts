/**
 * An automation's page says it is drawn only once it is.
 *
 * MEASURED BEFORE THIS: at 390 dark the look caught the page blank but for the tab bar, marked ready at 0.8 s. The page
 * opened its one call, closed it when the list of automations came back, and only then asked for the automation itself.
 * With no call out, the screen counts as settled (`settled` in `lib/ui/screen.svelte.ts`), so it said ready over a page
 * still `reading`, which draws nothing. Read as text, since the page cannot be mounted under `node --test`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

test('THE CALL IS CLOSED ONCE, AFTER THE WHOLE OPENING, never between the list and the automation', () => {
  const closes = [...PAGE.matchAll(/\bclosed\(/gu)];
  assert.equal(closes.length, 1, 'the call is closed in more than one place');
  const load = /async function load\(want: string\) \{([\s\S]*?)\n {2}\}/u.exec(PAGE)?.[1] ?? '';
  assert.match(load, /try \{\s*ok = await openOne\(want\);\s*\} finally \{\s*closed\(ok, at\);\s*\}/u, 'the call is not held open for the whole opening');
  const opening = /async function openOne\(want: string\): Promise<boolean> \{([\s\S]*?)\n {2}\}/u.exec(PAGE)?.[1] ?? '';
  assert.match(opening, /source\.automation\(want\)/u, 'the opening does not read the automation itself');
  assert.doesNotMatch(opening, /\bclosed\(/u);
});

test('UNDO AND REDO ARE DRAWN ONLY WHEN THERE IS A STEP TO TAKE BACK OR PUT BACK', () => {
  assert.match(PAGE, /\{#if flow\.canUndo \|\| flow\.canRedo\}\s*<Button disabled=\{!flow\.canUndo\}[^>]*>\{copy\.undo\}<\/Button>\s*<Button disabled=\{!flow\.canRedo\}[^>]*>\{copy\.redo\}<\/Button>\s*\{\/if\}/u);
});
