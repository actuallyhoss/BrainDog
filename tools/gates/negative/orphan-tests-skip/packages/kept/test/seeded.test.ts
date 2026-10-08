/* THE SEEDED FAULT: a skip that says nothing, so the run prints `# SKIP` and no reason. */
import test from 'node:test';

test.skip('a test that skips with no word', () => {});
