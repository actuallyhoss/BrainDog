/* THE SEEDED FAULT, THIRD NAME: a test called `-test.mjs`, which Node's own `--test` looks for and nothing here runs. */
import test from 'node:test';

test('a dash-test nothing runs', () => {});
