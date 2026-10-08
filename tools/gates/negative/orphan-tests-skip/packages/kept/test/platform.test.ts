/* THE DECOY THAT IS COUNTED: a skip by platform says its reason in its condition, and is printed with the count. */
import test from 'node:test';

test('only on Windows', { skip: process.platform !== 'win32' }, () => {});
