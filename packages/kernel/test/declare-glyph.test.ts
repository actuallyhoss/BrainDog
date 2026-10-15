/**
 * An icon is a glyph the renderer has (`glyph-names.ts`): a block's icon or a page's nav icon that names none is refused
 * at install with the nearest names it has, and one it has installs. Invented page and block names throughout.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateDeclaration, type Declaration } from '../src/index.ts';

const page = (block: Record<string, unknown>, nav?: Record<string, unknown>): Declaration =>
  ({
    id: 'page.harbour',
    kind: 'page',
    body: { page: 'harbour', title: 'Harbour', ...(nav ? { nav } : {}), blocks: [{ kind: 'note', body: 'Tide tables.', ...block }] },
  }) as never;

test('A BLOCK ICON THAT NAMES NO GLYPH IS REFUSED WITH THE NEAREST, and one the renderer has installs', () => {
  const wrong = validateDeclaration(page({ icon: 'rokcet' }));
  assert.equal(wrong?.code, 'GLYPH_UNKNOWN');
  assert.equal(wrong?.allowed?.[0], 'rocket');
  assert.equal(wrong?.at, 'blocks[0].icon');
  assert.equal(validateDeclaration(page({ icon: 'invoice' })), null);
});

test('A NAV ICON IS CHECKED AS A BLOCK ICON IS, its shape and then its name', () => {
  const nav = { section: 'Places', order: 1 };
  assert.equal(validateDeclaration(page({}, { ...nav, icon: 'Rocket!' }))?.code, 'DECLARATION_INVALID');
  const wrong = validateDeclaration(page({}, { ...nav, icon: 'rokcet' }));
  assert.equal(wrong?.code, 'GLYPH_UNKNOWN');
  assert.equal(wrong?.at, 'nav.icon');
  assert.equal(wrong?.allowed?.[0], 'rocket');
  assert.equal(validateDeclaration(page({}, { ...nav, icon: 'invoice' })), null);
});
