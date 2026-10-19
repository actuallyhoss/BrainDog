/**
 * An add-on that gives the record's agents a skill: the file says it with its text, the door reads it whole or refuses
 * it by name, the text is in the checksum, and the catalogue lists the skill's name on its reach. The add-ons are invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, readPackSkills } from '../src/index.ts';
import { reachOf, readCatalogueFile } from '../src/catalogue.ts';

const SKILL = { name: 'weekly-tidy', trigger: 'On a Friday, when the week\'s jobs are done.', what: 'Closes out the week.', body: '1. List what is still open.\n2. Ask which to carry over.' };

const DOC = (skills?: unknown): Record<string, unknown> => ({
  pack: 'tidy-week',
  version: '1.0.0',
  summary: 'A made-up add-on that tidies a week.',
  author: 'Test Author',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: {} },
  declarations: [{ register: 'jobs', name: 'Jobs', one: 'job', title: 'what', fields: [{ id: 'what', type: 'text' }] }],
  ...(skills === undefined ? {} : { skills }),
});

test('a skill with its steps is read whole and kept on the manifest', async () => {
  const read = await normalise(DOC([SKILL]), { kind: 'local' });
  assert.ok(read.ok, JSON.stringify(read));
  assert.deepEqual(read.value.manifest.skills, [SKILL]);
});

test('the steps are in the checksum, so a changed skill is a changed add-on', async () => {
  const a = await normalise(DOC([SKILL]), { kind: 'local' });
  const b = await normalise(DOC([{ ...SKILL, body: 'Do something else.' }]), { kind: 'local' });
  const none = await normalise(DOC(), { kind: 'local' });
  assert.ok(a.ok && b.ok && none.ok);
  assert.notEqual(a.value.checksum, b.value.checksum);
  assert.notEqual(a.value.checksum, none.value.checksum);
  assert.equal(none.value.manifest.skills, undefined);
});

test('a skill is refused by what is wrong with it, at the place it is wrong', () => {
  const at = (raw: unknown): string | undefined => {
    const out = readPackSkills(raw);
    return out.ok ? undefined : out.refusal.at;
  };
  assert.equal(at('no'), 'skills');
  assert.equal(at([{ ...SKILL, name: 'Weekly Tidy' }]), 'skills.0.name');
  assert.equal(at([{ ...SKILL, trigger: '' }]), 'skills.0.trigger');
  assert.equal(at([{ ...SKILL, body: '' }]), 'skills.0.body');
  assert.equal(at([{ ...SKILL, extra: 1 }]), 'skills.0');
  assert.equal(at([SKILL, SKILL]), 'skills.1.name');
  assert.equal(at(Array.from({ length: 9 }, (_, i) => ({ ...SKILL, name: `s${i}` }))), 'skills');
  assert.equal(at([{ ...SKILL, body: `Send it with sk_live_${'a1b2c3d4'.repeat(4)} please.` }]), 'skills.0.body');
});

test('the store lists the skill by name on what the add-on reaches', async () => {
  const text = JSON.stringify(DOC([SKILL]));
  const read = await readCatalogueFile(text, { kind: 'kennel' });
  assert.ok(read.ok, JSON.stringify(read));
  assert.deepEqual(reachOf(read.value).skills, ['weekly-tidy']);
});
