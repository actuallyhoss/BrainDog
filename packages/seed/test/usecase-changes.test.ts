/**
 * Every built-in use case's current version has a note a person reads where the update is offered
 * (`src/usecases/changes.ts`). Before it, the update sheet for each of them said nothing of what changed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { USE_CASES } from '../src/usecases/index.ts';
import { USE_CASE_CHANGES } from '../src/usecases/share.ts';

const parts = (v: string): number[] => v.split('.').map(Number);
const newer = (a: string, b: string): boolean => {
  const [x, y] = [parts(a), parts(b)];
  return x[0]! - y[0]! > 0 || (x[0] === y[0] && (x[1]! - y[1]! > 0 || (x[1] === y[1] && x[2]! > y[2]!)));
};

test('every use case\'s current version has a note', () => {
  for (const u of USE_CASES) {
    const notes = USE_CASE_CHANGES[u.usecase] ?? [];
    assert.equal(notes[0]?.version, u.version, `${u.title} is at ${u.version} and its newest note is for ${String(notes[0]?.version)}`);
  }
});

test('notes are newest first, one per version, and name no use case this build does not ship', () => {
  const shipped = new Set(USE_CASES.map((u) => u.usecase));
  for (const [id, notes] of Object.entries(USE_CASE_CHANGES)) {
    assert.ok(shipped.has(id), `${id} has notes and is not a use case here`);
    for (let i = 1; i < notes.length; i++) assert.ok(newer(notes[i - 1]!.version, notes[i]!.version), `${id}: ${notes[i - 1]!.version} before ${notes[i]!.version}`);
  }
});

test('a note reads as a person reads it: short, no ids, no em dash, no "row"', () => {
  for (const [id, notes] of Object.entries(USE_CASE_CHANGES)) {
    for (const n of notes) {
      const at = `${id} ${n.version}`;
      assert.ok(n.notes.trim().length > 0 && n.notes.length <= 500, `${at} is empty or over 500 characters`);
      assert.doesNotMatch(n.notes, /—/u, `${at} has an em dash`);
      assert.doesNotMatch(n.notes, /\b(rows?|entity|list item)\b/iu, `${at} says a word a person does not use`);
      assert.doesNotMatch(n.notes, /`|\b(register|page|metric|sessions?)\.[a-z]|\b[a-z]+#\d|\b[0-9A-HJKMNP-TV-Z]{26}\b/u, `${at} has an id in it`);
      assert.doesNotMatch(n.notes, /DIRECTION|§/u, `${at} cites a document`);
    }
  }
});
