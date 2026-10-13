/**
 * A built-in use case's listing carries what each version changed, so an update offered to a record on an older version
 * says what it brings. `listingsOf` passed an empty list for every use case, and the update sheet read no note.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { USE_CASE_CHANGES } from '@braindog/seed/usecases/share';

import { firstPartyUpdates } from '../../routes/decide/improved.ts';
import { listingsOf } from './listing.ts';
import { sheetOf } from './plan.ts';
import type { PackState } from '../record/packs.ts';

const listings = listingsOf({ kennel: null, counts: null });
const usecase = (id: string) => listings.find((l) => l.kind === 'usecase' && l.id === id);

test('every built-in use case\'s newest version carries its note', () => {
  for (const l of listings.filter((x) => x.kind === 'usecase' && x.source === 'bundled')) {
    const newest = l.versions.find((v) => v.version === l.latest);
    assert.equal(newest?.notes, USE_CASE_CHANGES[l.id]?.[0]?.notes, `${l.title} at ${l.latest}`);
    assert.ok(typeof newest?.notes === 'string' && newest.notes.length > 0, `${l.title} at ${l.latest} says nothing`);
  }
});

test('the versions are the noted ones, newest first, and only the oldest has no step before it', () => {
  const founder = usecase('founder');
  assert.ok(founder);
  assert.deepEqual(founder.versions.map((v) => v.version), (USE_CASE_CHANGES.founder ?? []).map((n) => n.version));
  assert.deepEqual(founder.versions.map((v) => v.bump === null), founder.versions.map((_, i, all) => i === all.length - 1));
});

test('a record on an older Solo founder is offered the update with the note of each version since', () => {
  const notes = USE_CASE_CHANGES.founder ?? [];
  assert.ok(notes.length >= 2, 'the founder has two versions noted');
  const older = notes[notes.length - 1]!.version;
  const held: PackState[] = [{ id: 'usecase-founder', version: '2.3.0', disabled_at: null, registers: [] }];
  const update = firstPartyUpdates(held).find((u) => u.id === 'founder');
  assert.ok(update, 'an update is offered');
  assert.equal(update.from, '2.3.0');
  assert.deepEqual(update.notes, notes.map((n) => n.notes), `every note from ${older} to the newest`);
  /* ONE VERSION BEHIND READS ONLY THE NEWEST NOTE. */
  const behind = firstPartyUpdates([{ ...held[0]!, version: notes[1]!.version }]).find((u) => u.id === 'founder');
  assert.deepEqual(behind?.notes, [notes[0]!.notes]);
});

/* THE PLAN SHEET SAYS A CALL OUT AS THE KERNEL'S SENTENCE, and never as the record's own `CALLS OUT` line. */
const stripe = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ingest: 'ingest.stripe-charges',
  channel: 'pull',
  host: 'api.stripe.com',
  every: '1h',
  trigger: 'schedule',
  per_day: null,
  grant: 'stripe',
  line: 'CALLS OUT api.stripe.com \u00b7 every 1h \u00b7 grant "stripe"',
  change: 'new',
  ...over,
});
const callsOf = (calls: unknown[]) => {
  const sheet = sheetOf({ pack: { id: 'stripe', title: 'Stripe', version: '1.0.0' }, planHash: 'h', calls_out: calls }, (id) => id);
  assert.ok(sheet, 'the plan is read');
  return sheet.parts.flatMap((p) => p.calls);
};

test('a Stripe-shaped call is said as a sentence naming the key and the host, with its parts kept', () => {
  const [call] = callsOf([stripe()]);
  assert.ok(call);
  assert.equal(call.line, "Sends your key 'stripe' to api.stripe.com every hour.");
  assert.deepEqual(
    { host: call.host, every: call.every, trigger: call.trigger, per_day: call.per_day, grant: call.grant, change: call.change },
    { host: 'api.stripe.com', every: '1h', trigger: 'schedule', per_day: null, grant: 'stripe', change: 'new' },
  );
});

test('a call the record already runs unchanged is the same sentence, and one a rule runs says so', () => {
  const [same, ruled] = callsOf([stripe({ change: 'same' }), stripe({ trigger: 'both', per_day: 20 })]);
  assert.equal(same?.change, 'same');
  assert.equal(same?.line, "Sends your key 'stripe' to api.stripe.com every hour.");
  assert.equal(ruled?.per_day, 20);
  assert.match(ruled?.line ?? '', /^Sends your key 'stripe' to api\.stripe\.com every hour, and up to 20 times a day when a rule runs it\.$/u);
  for (const c of [same, ruled]) assert.doesNotMatch(c?.line ?? '', /CALLS OUT|grant "|\u00b7/u);
});
