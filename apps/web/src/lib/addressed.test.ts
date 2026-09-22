/**
 * The links another package draws inside the app's `<main>` are put under the app too (`lib/addressed.ts`).
 *
 * `braindog-render` draws a queue's "N more", a table row, a capture line's list and a `[label](/r/x)` note as plain
 * `<a href="/…">` from the record's own cells. Under `paths.base = '/app'` each of those is outside the app, so a press
 * loads `brain.dog/decide`, which is the marketing site's 404. The fake below is the three DOM calls the fix makes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readdress } from './addressed.ts';

const anchors = (...hrefs: string[]) => {
  const held = hrefs.map((h) => ({ href: h, getAttribute: () => h as string | null, setAttribute(_: string, v: string) { this.href = v; } }));
  for (const a of held) a.getAttribute = () => a.href;
  return { held, root: { querySelectorAll: () => held } };
};

test('A ROOT PATH DRAWN BY ANOTHER PACKAGE IS PUT UNDER THE APP, and anything already addressed is left alone', () => {
  const was = globalThis.location;
  Object.defineProperty(globalThis, 'location', { value: { pathname: '/app/acme/p/agents' }, configurable: true, writable: true });
  try {
    const { held, root } = anchors('/decide', '/r/tasks/3', '/app/acme/inbox', 'https://example.com/x', '#b-2');
    readdress(root as unknown as ParentNode);
    assert.deepEqual(held.map((a) => a.href), ['/app/acme/decide', '/app/acme/r/tasks/3', '/app/acme/inbox', 'https://example.com/x', '#b-2']);
  } finally {
    Object.defineProperty(globalThis, 'location', { value: was, configurable: true, writable: true });
  }
});
