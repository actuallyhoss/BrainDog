/**
 * Two closed lists the core shipped are opened: `people.role` stops offering `registrar`, and `updates.by` stops naming
 * four agent vendors.
 *
 * WHY BOTH ARE HERE. The shell ships primitives and never one person's use case, and
 * a closed list is where a use case hides in plain sight. `registrar` is a role only a studio that holds domains has, and
 * the Personal use case already had to relabel it Agency to make it read. `claude`, `codex`, `cursor` and `you` were the
 * only authors an update could have, so a thread written by Gemini, by a teammate or by a script was refused
 * `ENUM_VALUE_UNKNOWN` at the write, measured below, while `tasks.agent` and `things.agent` beside it were already text.
 *
 * WHAT A RECORD THAT HELD THE OLD WORDS KEEPS. Taking a value off a list must not orphan a row written under it, so the
 * People test drives a record on 1.0.0 holding a `registrar` row through the update and reads the row back. Opening
 * `by` from `enum` to `text` is a widening (`packages/kernel/src/widen.ts`): every stored word is already valid text, so
 * the Work test writes a `claude` update under the closed list, updates, and reads it unchanged beside a `gemini` one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { Kernel } from '@braindog/kernel';

import { FIRST_PARTY, PEOPLE, firstPartyDocument } from '../src/index.ts';
import { put, record, value, type Body, type Doc } from './money-core-earlier.ts';

/* READ HERE AND NOT IMPORTED FROM `pack-versions.test.ts`, which exports the same object: importing a test file runs its
   tests in this one, and the version guard's failures would be reported twice under two names. */
const RELEASED_1_0_0 = JSON.parse(readFileSync(new URL('./fixtures/first-party-1.0.0.json', import.meta.url), 'utf8')) as Record<string, Doc>;

type Field = { id: string; type: string; values?: string[] };

const fieldOf = (doc: unknown, register: string, id: string): Field =>
  ((doc as Doc).declarations.find((d) => d.register === register)!.fields as Field[]).find((f) => f.id === id)!;

const liveField = (k: Kernel, register: string, id: string): Field =>
  (JSON.parse(k.declarations().find((d) => d.id === `register.${register}`)!.body) as { fields: Field[] }).fields.find((f) => f.id === id)!;

const OWNER = { actor: 'p_owner' };

test('PEOPLE OFFERS NO REGISTRAR, and the sample registry\'s contact is filed under `other`', () => {
  const role = fieldOf(firstPartyDocument('people'), 'people', 'role');
  assert.equal(role.type, 'enum');
  assert.ok(!role.values!.includes('registrar'), `People still ships ${role.values!.join(', ')}`);
  /* A CO-FOUNDER, A PARTNER AND STAFF ARE ROLES OF THEIR OWN SINCE People 4.5.0 and 4.6.0 (f7adcf8c7, 9dcce7ff2). */
  assert.deepEqual(role.values, ['client', 'contractor', 'accountant', 'collaborator', 'other', 'cofounder', 'partner', 'staff']);
  /* THE REGISTRY IS AN ORGANISATION SINCE People 3.0.0, and the person who answers its support mail is the `other`. */
  assert.equal(PEOPLE.find((p) => p.name === 'Lars Holm')?.role, 'other');
  assert.ok(PEOPLE.every((p) => p.role === null || p.role === undefined || role.values!.includes(String(p.role))), 'a sample row holds a role People no longer offers');
});

test('A RECORD ON PEOPLE 1.0.0 HOLDING A REGISTRAR ROW UPDATES AND KEEPS IT, and one with nobody in People does not', async () => {
  /* TWO RECORDS, THE SAME UPDATE. The plan lays a value back only where a row may hold it (`laidBack` in
     `packages/declare/src/index.ts`). THE SECOND RECORD HOLDS NO ROWS AT ALL, AND NOT ONE `other` ROW, because the host
     this package drives (`money-core-earlier.ts`) cannot count holders by value: measured with one `other` row, the plan
     kept `registrar` on the list's live count alone, which is what `laidBack` does without `Installed.holding`. The
     counted case, a row that holds some other word, is `packages/record`'s, whose host answers `holding`. */
  const on100 = async () => {
    const { k } = await record();
    await put(k, RELEASED_1_0_0.portfolio);
    await put(k, RELEASED_1_0_0.people);
    assert.ok(liveField(k, 'people', 'role').values!.includes('registrar'), 'People 1.0.0 as recorded did not offer registrar');
    return k;
  };

  const held = await on100();
  const id = value<{ id: string }>(held.create('people', { name: 'Nordhaven Registry', role: 'registrar' }, OWNER)).id;
  await put(held, firstPartyDocument('people'));
  assert.equal(held.get(id)?.fields.role, 'registrar', 'the row lost the role it was written under');
  assert.ok(liveField(held, 'people', 'role').values!.includes('registrar'), 'the record holding a registrar row lost the word its row reads');
  /* THE WORD IS KEPT FOR THE ROW, AND STILL WRITES: it is the record's own value now, so a second one lands too. */
  assert.ok(held.create('people', { name: 'Cove Domains', role: 'registrar' }, OWNER).ok);

  const clean = await on100();
  await put(clean, firstPartyDocument('people'));
  assert.ok(!liveField(clean, 'people', 'role').values!.includes('registrar'), 'a record that never wrote registrar was left holding it');
  const refused = clean.create('people', { name: 'Cove Domains', role: 'registrar' }, OWNER) as { ok: boolean; refusal?: { code: string } };
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal?.code, 'ENUM_VALUE_UNKNOWN');
});

test('AN UPDATE CAN BE BY ANYBODY: `by` is text, and an agent the core never heard of writes one', async () => {
  const by = fieldOf(firstPartyDocument('work'), 'updates', 'by');
  assert.equal(by.type, 'text', `updates.by is still ${by.type} over ${String(by.values)}`);
  assert.equal(by.values, undefined);

  const { k } = await record();
  for (const id of FIRST_PARTY) await put(k, firstPartyDocument(id, { seeds: [] }));
  const track = value<{ id: string }>(k.create('tracks', { name: 'Specimen page', state: 'open' }, OWNER)).id;
  const out = k.create('updates', { body: 'Drafted the copy.', health: 'on_track', track, by: 'gemini', at: '2026-09-24T09:00:00Z' }, OWNER);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(k.get(value<{ id: string }>(out).id)?.fields.by, 'gemini');
});

test('A RECORD WHOSE UPDATES WERE WRITTEN UNDER THE CLOSED LIST UPDATES AND READS EVERY ONE AS IT WAS', async () => {
  /* WORK AS 1.6.0 DECLARED `by`, rebuilt out of today's document with the four words put back. Nothing else in the
     document differs, so the update below moves exactly one field. */
  const closed = structuredClone(firstPartyDocument('work', { seeds: [] })) as Doc;
  const updates = closed.declarations.find((d) => d.register === 'updates')!;
  updates.fields = (updates.fields as Body[]).map((f) => (f.id === 'by' ? { id: 'by', type: 'enum', values: ['claude', 'codex', 'cursor', 'you'], index: true, required: true } : f));
  closed.version = '1.6.0';

  const { k } = await record();
  for (const id of FIRST_PARTY) await put(k, id === 'work' ? closed : firstPartyDocument(id, { seeds: [] }));
  assert.equal(liveField(k, 'updates', 'by').type, 'enum');
  const track = value<{ id: string }>(k.create('tracks', { name: 'Specimen page', state: 'open' }, OWNER)).id;
  const said = { body: 'Drafted the copy.', health: 'on_track', track, at: '2026-09-24T09:00:00Z' };
  const before = value<{ id: string }>(k.create('updates', { ...said, by: 'claude' }, OWNER)).id;
  const refused = k.create('updates', { ...said, by: 'gemini' }, OWNER) as { ok: boolean; refusal?: { code: string } };
  assert.equal(refused.refusal?.code, 'ENUM_VALUE_UNKNOWN', 'the closed list took a word it does not list, so this is not the record it claims to be');
  const was = JSON.stringify(k.get(before));

  const update = await put(k, firstPartyDocument('work', { seeds: [] }));
  assert.equal(update.orphans ?? 0, 0);
  assert.equal(liveField(k, 'updates', 'by').type, 'text');
  assert.equal(JSON.stringify(k.get(before)), was, 'the update rewrote a row written under the closed list');
  assert.ok(k.create('updates', { ...said, by: 'gemini' }, OWNER).ok);
});
