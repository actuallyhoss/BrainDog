import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askedIn, entryHref, holdLine, keyInFocus, slashLine, takeLine, withoutEntry } from './slash-entry.ts';

test('a line that opens with make or change is read, others are left alone', () => {
  assert.deepEqual(slashLine('Make payroll as a calendar'), { verb: 'make', line: 'payroll as a calendar' });
  assert.deepEqual(slashLine('  change only this month '), { verb: 'change', line: 'only this month' });
  assert.equal(slashLine('make'), null);
  assert.equal(slashLine('makeshift tasks'), null);
});

test('a make with no page goes to Today and a change needs a page', () => {
  const make = slashLine('make open tasks as a board')!;
  assert.equal(entryHref(make, null), '/?make=open%20tasks%20as%20a%20board');
  assert.equal(entryHref(make, '/p/work'), '/p/work?make=open%20tasks%20as%20a%20board');
  assert.equal(entryHref(slashLine('change top 5')!, null), null);
  assert.equal(entryHref(slashLine('change top 5')!, '/p/work'), '/p/work?change=top%205');
});

test('the address gives the line once and is cleaned after', () => {
  assert.deepEqual(askedIn('?src=1&make=a%20b'), { verb: 'make', line: 'a b' });
  assert.equal(askedIn('?src=1'), null);
  assert.equal(withoutEntry({ pathname: '/p/x', search: '?src=1&change=top%205', hash: '#h' }), '/p/x?src=1#h');
});

test('the block in focus is the slot around the focused element', () => {
  const slot = { getAttribute: (n: string) => (n === 'data-key' ? 'k7' : null) };
  assert.equal(keyInFocus({ closest: () => slot }), 'k7');
  assert.equal(keyInFocus({ closest: () => null }), null);
  assert.equal(keyInFocus(null), null);
});

test('a held line is given once', () => {
  holdLine('newest first');
  assert.equal(takeLine(), 'newest first');
  assert.equal(takeLine(), '');
});
