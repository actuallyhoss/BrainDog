/**
 * THE TYPES THE BROWSER CAN NAME, HELD AGAINST THE ONES ITS OWN REGISTERS DECLARE.
 *
 * `FieldType` in `schema.ts` was a TypeScript union and nothing else, so it could not be held
 * against anything: the one place the browser writes down what a field may be was unreadable by any
 * test, and a type missing from it cost nothing until a cast was needed. Two were written:
 * `blocks.ts` has `(f.type as string) !== 'list'` and the row form has `(f.type as string) ===
 * 'list'`, and a cast that launders a missing member is how a whole type goes unhandled quietly.
 *
 * MEASURED OVER THE MIRROR'S OWN REGISTERS, the union was short by three of the fifteen types in
 * use: eleven `list` fields over five registers (`things.repos`, `things.folders`,
 * `people.handles`, `people.met`, `tools.args`, `tools.needs`, `tools.hosts`, `session.tried` and
 * `session.notes` as `list<text>`, `people.projects` and `skills.because` as `list<ref>`), plus
 * `skills.source` as `url` and `people.email` as `email`. Every one of them is drawn on a screen
 * this product ships.
 *
 * SO THE LIST IS AN ARRAY AND THE UNION IS DERIVED FROM IT, which is what `LEVELS`, `REACHES`,
 * `SCOPES` and `CREDENTIAL_KINDS` in the same file already do, for the sentence that file states
 * twice: a closed list typed as `string` is a closed list nothing closes. A union is the same
 * failure one step further on, because it closes nothing that a cast cannot open.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIELD_TYPES as RECORD_TYPES } from '@braindog/kernel';

import { REGISTERS } from './data.ts';
import { FIELD_TYPES, type FieldDecl } from './schema.ts';

/** The declaration as the literal in `@braindog/seed` writes it, which is what the mirror holds. */
type Declared = { id: string; type: string; of?: string; to?: string };

const fieldsOf = (register: unknown): readonly Declared[] => (register as { fields?: readonly Declared[] }).fields ?? [];

const declared = (): { at: string; field: Declared }[] =>
  Object.entries(REGISTERS).flatMap(([id, register]) => fieldsOf(register).map((field) => ({ at: `${id}.${field.id}`, field })));

test('EVERY TYPE THE MIRROR’S OWN REGISTERS DECLARE IS ONE THE BROWSER CAN NAME', () => {
  const named: readonly string[] = FIELD_TYPES;
  const unnameable = declared().filter(({ field }) => !named.includes(field.type));
  assert.deepEqual(
    unnameable.map(({ at, field }) => `${at}: ${field.type}`),
    [],
    'the browser draws these fields and its own FieldType cannot say what they are',
  );
});

test('AND EVERY TYPE IT CAN NAME IS ONE THE RECORD ADMITS, so the mirror invents none', () => {
  /* `04 §5`'s worked refusal is `type: 'currency'`, FIELD_TYPE_UNKNOWN, "did you mean 'money'?".
     The record's list is the authority and this one is a subset of it: a type here that the record
     would refuse is a form control and a renderer built for a field nobody can ever install. */
  const admitted: readonly string[] = RECORD_TYPES;
  assert.deepEqual(FIELD_TYPES.filter((t) => !admitted.includes(t)), []);
});

test('A LIST CARRIES ITS ELEMENT TYPE, and a list of lists is not a shape', () => {
  /**
   * `of` WAS NOT ON `FieldDecl` EITHER, so the eleven list fields above were half-declared in the
   * browser: `list` says there are several values and `of` says what one of them is, and a renderer
   * with only the first has to guess between a row of links and a row of words.
   *
   * `list<ref>` IS WHY `to` IS NOT `ref`-ONLY. `people.projects` and `skills.because` point at a
   * register and are lists, and `blocks.ts` reads exactly that pair to draw a list of links.
   */
  /* THE MIRROR'S OWN TYPE HAS TO HOLD ONE, which is the half no assertion can reach: this line is
     read by `tsc` and not by the runner, and before `list` and `of` were added it was two errors. */
  const projects: FieldDecl = { id: 'projects', type: 'list', of: 'ref', to: 'things' };
  assert.equal(projects.of, 'ref');

  const lists = declared().filter(({ field }) => field.type === 'list');
  assert.equal(lists.length, 11, 'the mirror declares eleven list fields');
  for (const { at, field } of lists) {
    assert.ok(field.of !== undefined, `${at} is a list of nothing`);
    assert.notEqual(field.of, 'list', `${at} is a list of lists`);
    assert.ok((FIELD_TYPES as readonly string[]).includes(String(field.of)), `${at} holds ${String(field.of)}, which the browser cannot name`);
    if (field.of === 'ref') assert.ok(field.to !== undefined, `${at} is a list of links to nowhere`);
  }
});
