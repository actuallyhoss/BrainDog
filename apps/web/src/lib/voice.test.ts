/**
 * The voice a record speaks in (`loop/research-spark.md` §2.2): its keys are the format's, each replaces a
 * line the house voice already has, and a key left out reads the house line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { USE_CASES, VOICE_KEYS, voiceOf as voiceOfPack } from '@braindog/seed/usecases';

import { copy } from './copy.ts';
import { VOICE_LINES, lineOf, speaking, voiceOf } from './voice.ts';

test('THE DISPLAY READS EVERY KEY THE FORMAT ALLOWS, and no other', () => {
  assert.deepEqual(Object.keys(VOICE_LINES).sort(), [...VOICE_KEYS].sort());
});

test('A KEY LEFT OUT READS THE HOUSE VOICE, so the sample loses nothing', () => {
  const house = new Set<unknown>(Object.values(copy));
  for (const key of VOICE_KEYS) {
    assert.ok(house.has(VOICE_LINES[key]), `${key} replaces a line copy.ts holds`);
    assert.equal(lineOf({}, key), VOICE_LINES[key]);
  }
  assert.equal(lineOf({ home: 'Today' }, 'home'), 'Today');
  assert.equal(lineOf({ home: 'Today' }, 'inbox'), copy.inbox);
});

test('THE VOICE IS READ FROM SETTINGS THE SAME WAY THE FORMAT WRITES THEM', () => {
  const values = { voice_home: 'Today', voice_needs_you: 'Coming up', voice_lists: '  ', other: 'x', voice_inbox: 4 };
  assert.deepEqual(voiceOf(values), voiceOfPack(values));
  for (const u of USE_CASES) {
    const settings = Object.fromEntries(Object.entries(u.voice).map(([k, v]) => [`voice_${k}`, v]));
    assert.deepEqual(voiceOf(settings), u.voice, u.usecase);
  }
});

test('THE STARTER USE CASES SPEAK DIFFERENTLY FROM EACH OTHER AND FROM THE HOUSE', () => {
  const homes = USE_CASES.map((u) => lineOf(u.voice, 'home'));
  assert.equal(new Set(homes.filter((h) => h !== copy.home)).size, USE_CASES.filter((u) => u.voice.home).length);
});

test('THE VOICE COMES FROM THE FIRST USE-CASE PACK SWITCHED ON', () => {
  assert.equal(speaking([{ id: 'people', disabled_at: null }]), null);
  assert.equal(speaking([{ id: 'usecase-student', disabled_at: '2026-09-17' }, { id: 'usecase-founder', disabled_at: null }]), 'usecase-founder');
});
