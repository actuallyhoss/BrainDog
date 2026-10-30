/**
 * `InlineOptions.links`: where only links away are drawn (a shared page, review 30 Oct, R10), a path into the record is
 * drawn as its words, in prose, in a cell and in a `link` list, and a link that leaves the record stays one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { drawnLink, inline, text } from './inline.ts';
import { linkPlan } from './links.ts';

test('a path into the record is its words where only links away are drawn, and a link away stays one', () => {
  const kept = inline('see [the **plan**](/r/things/1)', { links: 'away' });
  assert.equal(text(kept), 'see the plan');
  assert.ok(kept.every((n) => n.type !== 'link'));
  assert.ok(kept.some((n) => n.type === 'strong'), 'the words keep how they were written');
  assert.deepEqual(inline('[the site](https://example.com)', { links: 'away' }), [{ type: 'link', href: 'https://example.com', body: [{ type: 'text', text: 'the site' }] }]);
  assert.deepEqual(inline('[mail](mailto:a@example.com)', { links: 'away' })[0]?.type, 'link');
  /* AN ANCHOR IS NO LINK AWAY EITHER, and without the option every safe link is drawn as before. */
  assert.equal(drawnLink('#top', { links: 'away' }), null);
  assert.deepEqual(inline('[the plan](/r/things/1)'), [{ type: 'link', href: '/r/things/1', body: [{ type: 'text', text: 'the plan' }] }]);
});

test('a link list keeps its titles and drops only the addresses into the record', () => {
  const rows = [{ cells: ['Board', '/r/projects/2'] }, { cells: ['Docs', 'https://docs.example.com'] }];
  const away = linkPlan(rows, { links: 'away' });
  assert.deepEqual(
    away.map((l) => [l.title, l.href, l.inApp]),
    [
      ['Board', null, false],
      ['Docs', 'https://docs.example.com', false],
    ],
  );
  assert.equal(linkPlan(rows)[0]?.href, '/r/projects/2');
});
