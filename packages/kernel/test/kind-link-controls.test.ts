/**
 * A link written out on a `link` block is refused at install when the renderer would not draw it as one, and a tab or a
 * line break inside it is one of those: the URL parser drops them, so `/\t/evil.example` reads as `//evil.example`,
 * another site wearing the shape of a path of this BrainDog.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { linkable } from '../src/kinds/link.ts';

test('A CONTROL CHARACTER ANYWHERE IN AN ADDRESS IS NO LINK', () => {
  for (const href of ['/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/\t\\evil.example', '/p/a\tb', 'https://ok.example/\u0000', '/\u007f/evil.example'])
    assert.equal(linkable(href), false, JSON.stringify(href));
});

test('THE ADDRESSES A PERSON WRITES ARE STILL LINKS', () => {
  for (const href of ['/p/handbook', '/r/tasks?sort=due', 'https://example.com/a b', 'mailto:ada@example.com', '#top', '  /p/handbook  '])
    assert.equal(linkable(href), true, href);
  for (const href of ['//evil.example', '/\\evil.example']) assert.equal(linkable(href), false, href);
});
