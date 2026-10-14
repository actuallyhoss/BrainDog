/**
 * Whether a machine enrolled to run jobs is listening: heard inside 40 seconds it is, heard longer ago it says when, and
 * a machine never heard says nothing at all.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { anyListening, LISTEN_MS, listeningOf, words } from './jobs.ts';

const NOW = Date.parse('2026-03-04T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

const studio = { name: 'Studio tower', seen: ago(10_000) };
const attic = { name: 'Attic laptop', seen: ago(41_000) };
const shed = { name: 'Shed box', seen: null };

test('a machine heard 10 seconds ago is listening', () => {
  assert.deepEqual(listeningOf(studio, NOW), { listening: true, heard: null });
});

test('a machine heard 41 seconds ago is not listening, and says when it was last heard', () => {
  const out = listeningOf(attic, NOW);
  assert.equal(out.listening, false);
  assert.match(out.heard ?? '', /^Last heard /u);
});

test('a machine heard days ago says how many', () => {
  const garage = { name: 'Garage mini', seen: ago(3 * 86_400_000) };
  const out = listeningOf(garage, NOW);
  assert.equal(out.listening, false);
  assert.equal(out.heard, words.lastHeard('3d ago'));
});

test('a machine never heard says nothing heard', () => {
  assert.deepEqual(listeningOf(shed, NOW), { listening: false, heard: null });
});

test('the edge of listening is 40 seconds, and a stamp a little ahead of the clock is heard just now', () => {
  assert.equal(listeningOf({ seen: ago(LISTEN_MS) }, NOW).listening, true);
  assert.equal(listeningOf({ seen: ago(-5_000) }, NOW).listening, true);
  assert.equal(listeningOf({ seen: 'not a time' }, NOW).heard, null);
});

test('anyListening over two machines', () => {
  assert.equal(anyListening([attic, studio], NOW), true);
  assert.equal(anyListening([attic, shed], NOW), false);
  assert.equal(anyListening([], NOW), false);
});

test('the words carry no em dash', () => {
  for (const said of [words.listening, words.nobodyListening, words.lastHeard('3d ago')]) assert.ok(!said.includes('—'), said);
});
