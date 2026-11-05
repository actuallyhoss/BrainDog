/**
 * `InlineOptions.links`: where only links away are drawn (a shared page, review 30 Oct, R10), a path into the record is
 * drawn as its words, in prose, in a cell, in a `link` list and in a queue's "N more", and a link that leaves the record
 * stays one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { drawnLink, inline, text } from './inline.ts';
import { toHTML } from './html.ts';
import { linkPlan } from './links.ts';
import { queuePlan } from './queue.ts';
import type { Block } from './index.ts';

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

/* Q2 (second review of 30 October): a `queue` fence's "N more" row still linked its path into the record on a shared page. */
test('a queue\'s "N more" is said and not linked where only links away are drawn, in the plan and in the mirror', () => {
  const rows = [{ cells: ['q', 's1', 'Claude', 'now', 'Which?', ''] }, { cells: ['opt', 's1', 'a', 'A', '', ''] }, { cells: ['more', '3', '/r/suggestion'] }];
  const away = queuePlan(rows, { links: 'away' });
  assert.equal(away.more, 3, 'the count is still said');
  assert.equal(away.moreHref, null);
  assert.equal(queuePlan(rows).moreHref, '/r/suggestion', 'without the option the path is drawn as before');

  const block: Block = { type: 'block', kind: 'queue', raw: '', start: 0, end: 0, rows };
  const html = toHTML([block], { links: 'away' });
  assert.ok(!html.includes('href="/r/suggestion"'), html);
  assert.match(html, /<p class="queue-more">/u);
  assert.match(toHTML([block]), /<a class="queue-more" href="\/r\/suggestion">/u);
});

test('WORDS THAT READ AS ANOTHER ADDRESS ARE DRAWN AS WHERE THE LINK GOES, so a record\'s text cannot promise one host and send a press to another', async () => {
  const { linkMisleads } = await import('./inline.ts');
  const shown = (t: string) => {
    const [link] = inline(t);
    assert.equal(link?.type, 'link');
    return (link as { body: { text?: string }[] }).body[0]?.text;
  };
  for (const [words, to] of [
    ['https://yourbank.com', 'https://evil.example/?d=secret'],
    ['yourbank.com', 'https://evil.example/'],
    ['www.yourbank.com/login', 'https://yourbank.com.evil.example/'],
    ['pаypal.com', 'https://paypal.com/'], // a Cyrillic а: a different host, whatever it looks like
    ['ceo@yourbank.com', 'mailto:someone@evil.example'],
  ] as const) {
    assert.equal(linkMisleads(words, to), true, words);
    assert.equal(shown(`[${words}](${to})`), to, words);
  }
  for (const [words, to] of [
    ['the plan', 'https://example.com/'],
    ['Renew now', 'https://example.com/'],
    ['example.com', 'https://example.com/x'],
    ['www.example.com', 'https://example.com/'],
    ['example.com', 'https://docs.example.com/'],
    ['https://docs.example.com/a', 'https://example.com/'],
    ['report.pdf', 'https://files.example/report.pdf'],
    ['ada@example.com', 'mailto:Ada@example.com?subject=hi'],
    ['v1.2', 'https://example.com/'],
  ] as const) assert.equal(linkMisleads(words, to), false, words);
  assert.equal(shown('[the plan](https://example.com/)'), 'the plan');
});
