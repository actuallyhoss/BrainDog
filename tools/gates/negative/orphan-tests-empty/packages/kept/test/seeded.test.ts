/* THE SEEDED FAULT: a helper named as a test. The script runs it, Node prints it as a file that passed, and it
   registers nothing. A comment that says test('like this') is prose, and does not count as a call, and nor does a
   regular expression's own `.test(`. */
import assert from 'node:assert/strict';

export const twice = (n: number): number => n * 2;
export const sure = (n: number): void => assert.equal(twice(n), n + n);
export const even = (s: string): boolean => /^\d*[02468]$/u.test(s);
