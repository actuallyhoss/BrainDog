/**
 * The command's build, read off every call (batch 37): `x-braindog-cli` is a date or `dev` and a commit, kept when
 * it has that shape and dropped when it does not, on the headers and over `/mcp`'s `_meta.session` alike.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HINTS, hintsOf, sessionOf } from '../src/session.ts';

const said = (cli: string) => sessionOf(new Headers({ 'x-braindog-cli': cli, 'x-braindog-session': 'S4' }));

test('THE HEADER IS x-braindog-cli', () => {
  assert.equal(HINTS.cli.header, 'x-braindog-cli');
});

test('A GOOD BUILD IS KEPT: a dated build and a dev build, short or full commit', () => {
  for (const cli of ['2026.10.09+abc1234', 'dev+0123456789abcdef0123456789abcdef01234567', 'dev+deadbee']) {
    assert.deepEqual(said(cli), { spoken: 'S4', cli });
    assert.deepEqual(hintsOf({ cli }), { cli });
  }
});

test('A BAD BUILD IS DROPPED, and the call keeps its other hints', () => {
  for (const cli of ['2026.10.09', '2026-10-09+abc1234', 'beta+abc1234', 'dev+ABC1234', 'dev+abc12', '2026.10.09+abc1234\x07', `dev+${'a'.repeat(41)}`]) {
    assert.deepEqual(said(cli), { spoken: 'S4' }, cli);
    assert.deepEqual(hintsOf({ cli }), {}, cli);
  }
  assert.deepEqual(hintsOf({ cli: 20261009 }), {});
});

/* COMMITS SINCE THE HANDOFF (record-card, batch 40): `x-braindog-ahead` reaches the record as the count it was sent, for
   the card's "12 commits since", and anything but a whole number from 0 to 9,999 is dropped. */
test('THE COUNT OF COMMITS SINCE THE HANDOFF IS KEPT AS SENT, and anything else is dropped', () => {
  const ahead = (n: string) => sessionOf(new Headers({ 'x-braindog-ahead': n })).ahead;
  assert.equal(HINTS.ahead.header, 'x-braindog-ahead');
  assert.equal(ahead('0'), '0');
  assert.equal(ahead('12'), '12');
  assert.equal(ahead('9999'), '9999');
  for (const bad of ['10000', '-1', '012', '1.5', 'twelve', '', '+5', '1e3', '0x1f', '12a']) assert.equal(ahead(bad), undefined, bad);
});

/* WHO THE RECENT COMMITS WERE BY (`x-braindog-authors`): kept as printable text, up to 1,024 characters (the commits' subjects ride it after the authors), so the record
   can meet the people in a project's commits and read what they say is done. */
test('THE AUTHORS OF RECENT COMMITS ARE KEPT AS SENT, and text that cannot ride a header is dropped', () => {
  const authors = (v: string) => sessionOf(new Headers({ 'x-braindog-authors': v })).authors;
  assert.equal(HINTS.authors.header, 'x-braindog-authors');
  assert.equal(authors('Ada Lin <ada@example.com>, Bo <bo@kiln.example>'), 'Ada Lin <ada@example.com>, Bo <bo@kiln.example>');
  assert.equal(authors('x'.repeat(1024)), 'x'.repeat(1024));
  assert.equal(authors('x'.repeat(1025)), undefined);
});

/* THE PROFILE A RUN IS UNDER (migration 44): `x-braindog-profile` reaches the record as the run's `seat`, a short name
   and never a path, and anything else is dropped with the call's other hints kept. */
test('THE PROFILE IS KEPT AS A SHORT NAME, and a path, a long name or `..` is dropped', () => {
  const seat = (v: string) => sessionOf(new Headers({ 'x-braindog-profile': v, 'x-braindog-session': 'S4' }));
  assert.equal(HINTS.seat.header, 'x-braindog-profile');
  for (const name of ['default', 'harbour', 'work.2', 'a_b-c', 'x'.repeat(64)]) {
    assert.deepEqual(seat(name), { spoken: 'S4', seat: name }, name);
    assert.deepEqual(hintsOf({ seat: name }), { seat: name }, name);
  }
  for (const bad of ['x'.repeat(65), '/Users/ada/.claude-harbour', '~/.claude', '.claude', 'a..b', '-flag', 'two words'])
    assert.deepEqual(seat(bad), { spoken: 'S4' }, bad);
  assert.deepEqual(hintsOf({ seat: 7 }), {});
});
