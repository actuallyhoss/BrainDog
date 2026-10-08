/* THE SEEDED FAULT: run only by a workflow line under `if: false`, which never runs. */
import test from 'node:test';

test('a test no run reaches', () => {});
