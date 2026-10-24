/**
 * A task's title as a short name and the rest quiet (E23): Work drew whole paragraphs as titles, six lines a task.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TITLE_HEAD_MOST, todoTitle } from './todo.ts';
import { parse, type Block } from './parse.ts';
import { toHTML } from './html.ts';

const LONG =
  'Review the Encore payout batch before Friday. Check the three refunds Stripe flagged, then write back to the two creators who asked where their money went and say when it lands.';

test('A LONG TITLE IS ITS FIRST CLAUSE, and the rest is kept, quiet, after it', () => {
  assert.deepEqual(todoTitle(LONG), {
    head: 'Review the Encore payout batch before Friday.',
    rest: 'Check the three refunds Stripe flagged, then write back to the two creators who asked where their money went and say when it lands.',
  });
  /* A SHORT TITLE IS LEFT WHOLE, whatever its stops. */
  assert.deepEqual(todoTitle('Ship it. Then rest.'), { head: 'Ship it. Then rest.', rest: '' });
  /* A FIRST CLAUSE PAST THE LIMIT IS CUT AT A SPACE before it. */
  const run = `${'word '.repeat(30)}end`;
  const { head, rest } = todoTitle(run);
  assert.ok(head.length <= TITLE_HEAD_MOST && !head.endsWith(' '), head);
  assert.equal(`${head} ${rest}`, run);
  /* A MARKED PHRASE OR A LINK IS NEVER SPLIT. */
  const marked = `{{bad:Late}} ${LONG}`;
  assert.deepEqual(todoTitle(marked), { head: marked, rest: '' });
});

test('BOTH RENDERERS DRAW THE REST IN ITS QUIET SPAN, and a short title as it was', () => {
  const [seg] = parse(`\`\`\`todo\n[ ] ${LONG}\n[ ] Short one\n\`\`\``);
  const html = toHTML([seg as Block]);
  assert.match(html, /<span class="item-words">Review the Encore payout batch before Friday\.<span class="item-title-rest"> Check the three/u);
  assert.match(html, /<span class="item-title">Short one<\/span>/u);
});
