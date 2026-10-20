/**
 * The question page as the 20 October walk of his record found it: an older question with no title, "Add … to Tasks?"
 * with nothing under it, and diffs that said `01M3MV…`, `things#23,things#28` and "A project" where the rows have names.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { askedOf, heldBy, plainOf, refsOf, type Governor } from '../../../lib/record/governance.ts';
import { createsOf, updatesOf } from './changes.ts';

const registers = {
  tasks: {
    title: 'what',
    fields: [
      { id: 'what', type: 'text', label: 'Description' },
      { id: 'state', type: 'enum', label: 'Status', labels: { open: 'Open' } },
      { id: 'thing', type: 'ref', to: 'things', label: 'Project' },
      { id: 'by', type: 'day', label: 'Due' },
    ],
  },
  people: {
    title: 'name',
    fields: [
      { id: 'name', type: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', label: 'Met in' },
      { id: 'note', type: 'text', label: 'Note' },
    ],
  },
  things: { title: 'name', fields: [{ id: 'name', type: 'text' }] },
};

const PRISM = '01M3MVSXC7CQRV4F1ATNTD2196';
const names = { [PRISM]: 'Prism', 'things#23': 'Larkspur', 'things#28': 'Kiln' };

test('AN OLDER QUESTION KEEPS ITS WORDS: boot names only the newest, so the row itself is read next', () => {
  const asked = new Map([['SG200', 'Mark Ship it done?']]);
  assert.equal(askedOf(asked, { id: 'SG200', question: 'ignored' }), 'Mark Ship it done?');
  assert.equal(askedOf(asked, { id: 'SG76', question: 'Add datapoint-reporter to Skills?' }), 'Add datapoint-reporter to Skills?');
  assert.equal(askedOf(asked, { id: 'SG77' }), undefined);
});

test('A NEW ROW IS DRAWN FIELD BY FIELD under its title, with its project by name', () => {
  const body = { register: 'tasks', rows: [{ what: 'Send Jennifer the Crumb Pass refund email', state: 'open', thing: PRISM, by: '' }] };
  const [row, ...rest] = createsOf(body, registers, plainOf(registers, names));
  assert.equal(rest.length, 0);
  assert.equal(row!.title, 'Send Jennifer the Crumb Pass refund email');
  assert.equal(row!.added, true);
  assert.deepEqual(
    row!.changes.map((c) => (c.long ? [c.label] : [c.label, c.before, c.after])),
    [
      ['Status', null, 'Open'],
      ['Project', null, 'Prism'],
    ],
  );
});

test('AN UPDATE IS NOT A CREATE: createsOf leaves rows with an `at` to updatesOf', () => {
  assert.deepEqual(createsOf({ register: 'tasks', rows: [{ at: 'tasks#1', patch: { state: 'done' } }] }, registers, plainOf(registers)), []);
});

test('A LIST OF REFS IS SAID BY NAMES, never "things#23,things#28", and an id nothing names is never drawn', () => {
  const show = plainOf(registers, names);
  assert.equal(show('people', 'projects', ['things#23', 'things#28']), 'Larkspur, Kiln');
  assert.equal(show('people', 'projects', [PRISM]), 'Prism');
  assert.equal(show('tasks', 'thing', '01M3MVSXC7CQRV4F1ATNTD2199'), 'A row you cannot open');
  assert.equal(show('people', 'note', 'Also met in things#23.'), 'Also met in Larkspur.');
  const [u] = updatesOf(
    { register: 'people', rows: [{ at: 'people#4', patch: { projects: ['things#23', 'things#28'] } }] },
    registers,
    { people: [{ seq: 4, version: 1, fields: { name: 'Priya', projects: ['things#23'] } }] },
    show,
  );
  assert.deepEqual(u!.changes.map((c) => (c.long ? null : [c.before, c.after])), [['Larkspur', 'Larkspur, Kiln']]);
});

test('THE REFS A QUESTION NAMES are read once each, from patches, the rows as they are, creates and text', () => {
  const refs = refsOf(
    [
      { register: 'people', rows: [{ at: 'people#4', patch: { projects: ['things#23', 'things#28'], note: 'see things#30' } }] },
      { register: 'tasks', rows: [{ what: 'x', thing: PRISM }] },
    ],
    registers,
    { people: [{ seq: 4, version: 1, fields: { projects: ['things#21'] } }] },
  );
  assert.deepEqual(refs.sort(), [PRISM, 'things#21', 'things#23', 'things#28', 'things#30'].sort());
});

test('HELD BY NAMES EVERY REF from the row it points at, in that list own title field', async () => {
  const rows: Record<string, { register: string; seq: number; version: number; fields: Record<string, unknown> }> = {
    [PRISM]: { register: 'things', seq: 9, version: 1, fields: { name: 'Prism' } },
  };
  const client: Governor = {
    boot: async () => ({ ok: true, value: {} }),
    governance: async () => ({ ok: true, value: null }),
    schema: async (r) => ({ ok: true, value: registers[r as keyof typeof registers] }),
    get: async () => ({ ok: false, refusal: { code: 'REF_UNKNOWN', fix: '' } }),
    call: async (_name, args) => {
      const got = rows[String(args?.spoken)];
      return got ? { ok: true, value: got } : { ok: false, refusal: { code: 'REF_UNKNOWN', fix: '' } };
    },
  };
  const held = await heldBy(client, [{ register: 'tasks', rows: [{ what: 'x', thing: PRISM }] }], { names: true });
  assert.deepEqual(held.names, { [PRISM]: 'Prism' });
});
