/**
 * A declared value as a form offers it: by the record's label for it, as a saved row already reads it.
 *
 * THE FORM READ NO LABEL. `RowForm.svelte` drew every enum option as `copy.valueWord(value)`, so a household's People
 * picker offered Client, Contractor, Accountant and Registrar where Personal's labels say Work contact, Hired help, Tax
 * and accounts and Agency, and a new bill was offered Client work and Premises where its saved row reads Pay and Home
 * (`api.ts` `display`, which does read `f.labels`). Measured on the held wave forty-six tree by `personal-picker.mts`.
 *
 * HELD BY READING THE FORM'S SOURCE, because a Svelte component does not mount under `node --test` and the browser gates
 * share ports with a full run. The source check names the two option sites and nothing else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { relabel, valueSaid } from '../voice.ts';

const FORM = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'RowForm.svelte'), 'utf8');

type Field = { id: string; type: string; values: string[]; labels?: Readonly<Record<string, string>> };
const PEOPLE: { id: string; name: string; fields: Field[] } = { id: 'people', name: 'People', fields: [{ id: 'role', type: 'enum', values: ['client', 'family', 'saas'] }] };

test('A VALUE IS OFFERED BY THE LABEL THE RECORD GIVES IT, and by its own word where it has none', () => {
  const role = relabel(PEOPLE, { 'people.role.client': 'Work contact' }).fields[0]!;
  assert.deepEqual(
    role.values.map((v) => valueSaid(role, v)),
    ['Work contact', 'Family', 'SaaS'],
  );
});

test('THE FORM DRAWS BOTH ITS ENUM CONTROLS THROUGH IT, the segmented one and the select', () => {
  assert.equal(FORM.includes('copy.valueWord(value)'), false, 'an option is still drawn without its label');
  assert.equal(FORM.match(/valueSaid\(f, value\)/gu)?.length, 2);
});
