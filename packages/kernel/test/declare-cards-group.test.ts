/**
 * A `cards` block drawn in groups: `group`, a link, a choice or the state of its list (a `table` too), and `fold`, how many cards each group shows before
 * the rest fold. Checked where the page is installed, in a sentence that says what to change.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KEY_KINDS } from '../src/block-keys.ts';
import { validate, type Declaration, type Known } from '../src/declare.ts';
import type { Json } from '../src/coerce.ts';

const page = (block: Record<string, unknown>): Declaration => ({
  id: 'page.work',
  kind: 'page',
  body: { page: 'work', title: 'Work', blocks: [{ kind: 'cards', source: 'register.tasks', columns: [{ field: 'what' }], ...block }] } as never,
});

const KNOWN: Known = new Map<string, Record<string, Json>>([
  [
    'register.tasks',
    {
      id: 'tasks',
      fields: [
        { id: 'what', type: 'text' },
        { id: 'project', type: 'ref', to: 'projects' },
        { id: 'state', type: 'enum', values: ['open', 'done'] },
        { id: 'old_project', type: 'ref', to: 'projects', retired: true },
      ],
    },
  ],
]);

/** A list whose state is a field of its own name, held as text. */
const STATED: Known = new Map<string, Record<string, Json>>([
  ['register.tasks', { id: 'tasks', state: 'stage', fields: [{ id: 'what', type: 'text' }, { id: 'stage', type: 'text' }] }],
]);

const at = (d: Declaration, known?: Known) => {
  const r = validate(d, known);
  return r && [r.code, r.at];
};

test('CARDS GROUPED BY A LINK OF THEIR LIST INSTALL, folded or not', () => {
  assert.equal(validate(page({ group: 'project' }), KNOWN), null);
  assert.equal(validate(page({ group: 'project', fold: 5 }), KNOWN), null);
  assert.equal(validate(page({ group: 'project' })), null, 'with no record to ask, the shape is all that is checked');
});

test('CARDS AND A TABLE GROUPED BY A CHOICE OR BY THE STATE INSTALL TOO', () => {
  assert.equal(validate(page({ group: 'state' }), KNOWN), null, 'a choice');
  assert.equal(validate(page({ group: 'stage' }), STATED), null, 'the state, whatever its type');
  assert.equal(validate(page({ kind: 'table', group: 'project' }), KNOWN), null);
  assert.equal(validate(page({ kind: 'table', group: 'state' }), KNOWN), null);
  assert.deepEqual(at(page({ kind: 'table', group: 'what' }), KNOWN), ['DECLARATION_INVALID', 'blocks[0].group'], 'a table is checked as cards are');
});

test('A GROUP THAT IS NO LINK, CHOICE OR STATE OF THE LIST IS REFUSED, and the sentence names the ones it could be', () => {
  assert.deepEqual(at(page({ group: 'what' }), KNOWN), ['DECLARATION_INVALID', 'blocks[0].group']);
  const said = validate(page({ group: 'what' }), KNOWN)!;
  assert.match(said.fix, /a link to another list, a choice or the list's state/u);
  assert.match(said.fix, /project, state on tasks/u);
  assert.deepEqual(said.allowed, ['project', 'state']);
  assert.deepEqual(at(page({ group: 'client' }), KNOWN), ['FIELD_UNKNOWN', 'blocks[0].group']);
  assert.deepEqual(at(page({ group: 'old_project' }), KNOWN), ['FIELD_UNKNOWN', 'blocks[0].group'], 'a retired field groups nothing');
  assert.deepEqual(at(page({ group: 'Project' }), KNOWN), ['DECLARATION_INVALID', 'blocks[0].group']);
  assert.deepEqual(at(page({ group: 'project', source: 'actions' }), KNOWN), ['DECLARATION_INVALID', 'blocks[0].group'], 'cards over no list');
});

test('FOLD IS A COUNT OF CARDS FROM 1 TO 50, AND ONLY ON CARDS THAT GROUP', () => {
  assert.deepEqual(at(page({ group: 'project', fold: 0 }), KNOWN), ['OUT_OF_BOUNDS', 'blocks[0].fold']);
  assert.deepEqual(at(page({ group: 'project', fold: 2.5 }), KNOWN), ['OUT_OF_BOUNDS', 'blocks[0].fold']);
  assert.deepEqual(at(page({ group: 'project', fold: true }), KNOWN), ['OUT_OF_BOUNDS', 'blocks[0].fold']);
  assert.deepEqual(at(page({ fold: 3 }), KNOWN), ['DECLARATION_INVALID', 'blocks[0].fold']);
  /* A SECTION'S FOLD IS STILL A YES OR A NO, AND A TABLE STILL CARRIES NEITHER. */
  const section = (fold: unknown): Declaration => ({ id: 'page.work', kind: 'page', body: { page: 'work', title: 'Work', blocks: [{ kind: 'section', heading: 'Later', fold }] } as never });
  assert.equal(validate(section(true)), null);
  assert.deepEqual(at(section(3)), ['DECLARATION_INVALID', 'blocks[0]']);
  assert.notEqual(validate(page({ kind: 'lanes', group: 'project' }), KNOWN), null);
});

test('GROUP AND FOLD ARE NAMED WHERE EVERY KIND KEY IS (`KEY_KINDS`), so lanes carrying group hear where it belongs', () => {
  assert.deepEqual(KEY_KINDS.group, ['cards', 'table', 'feed']);
  assert.deepEqual(KEY_KINDS.fold, ['section', 'cards', 'feed']);
  const table = validate(page({ kind: 'lanes', group: 'project' }), KNOWN)!;
  assert.deepEqual([table.code, table.at], ['DECLARATION_INVALID', 'blocks[0].group']);
  assert.match(table.fix, /group: is read by cards, table and feed blocks, and a lanes block does nothing with it\. Draw these rows as cards or a table/u);
  const folded = validate(page({ kind: 'table', fold: 3 }), KNOWN)!;
  assert.match(folded.fix, /fold: is read by section, cards and feed blocks/u);
});
