/* THE DECOYS: a skip that says why, a condition on the platform with its words, and a skip a helper hands back. */
import test from 'node:test';

const when = (reason) => (reason ? { skip: reason } : {});

test('a skip with its reason', { skip: 'the fixture is not written yet' }, () => {});
test('a mode check', { skip: process.platform === 'win32' ? 'Windows keeps no file mode' : false }, () => {});
test('a helper skip', when(null), () => {});
