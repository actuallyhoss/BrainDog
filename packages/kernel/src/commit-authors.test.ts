import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { commitAuthors } from './commit-authors.ts';

describe('who a session says its recent commits were by', () => {
  it('reads names and addresses once each, in order', () => {
    assert.deepEqual(commitAuthors('Ada Lin <Ada@Example.com>, Bo <bo@kiln.example>, Ada L <ada@example.com>'), [
      { name: 'Ada Lin', email: 'ada@example.com' },
      { name: 'Bo', email: 'bo@kiln.example' },
    ]);
  });

  it('drops bots, no-reply and entries with no real address, and invents nothing', () => {
    assert.deepEqual(commitAuthors('dependabot[bot] <bot@x.example>, Cy <noreply@x.example>, Dee, Eli <eli>'), []);
    assert.deepEqual(commitAuthors(undefined), []);
  });

  it('keeps an author with no name as the address alone', () => {
    assert.deepEqual(commitAuthors('<fay@x.example>'), [{ email: 'fay@x.example' }]);
  });
});
