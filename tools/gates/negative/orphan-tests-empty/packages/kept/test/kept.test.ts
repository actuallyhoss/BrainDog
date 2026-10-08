/* THE DECOYS: `it(` inside `describe(`, and a test that uses the helper beside it. Each registers a test. */
import { describe, it } from 'node:test';

import { sure } from './seeded.test.ts';

describe('the helper', () => {
  it('doubles', () => sure(2));
});
