import { describe, expect, it } from 'vitest';

import { commitAuthors } from './commit-authors.ts';

describe('who a session says its recent commits were by', () => {
  it('reads names and addresses once each, in order', () => {
    expect(commitAuthors('Ada Lin <Ada@Example.com>, Bo <bo@kiln.example>, Ada L <ada@example.com>')).toEqual([
      { name: 'Ada Lin', email: 'ada@example.com' },
      { name: 'Bo', email: 'bo@kiln.example' },
    ]);
  });

  it('drops bots, no-reply and entries with no real address, and invents nothing', () => {
    expect(commitAuthors('dependabot[bot] <bot@x.example>, Cy <noreply@x.example>, Dee, Eli <eli>')).toEqual([]);
    expect(commitAuthors(undefined)).toEqual([]);
  });

  it('keeps an author with no name as the address alone', () => {
    expect(commitAuthors('<fay@x.example>')).toEqual([{ email: 'fay@x.example' }]);
  });
});
