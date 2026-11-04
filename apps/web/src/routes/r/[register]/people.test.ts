/**
 * A list of people read by the role it declares: grouped by organisation and folded below the most recent, where each
 * was seen, and what each is known by. Every case is a list written here, read on 6 October 2026.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry, Fields, RegisterDecl } from '../../../lib/record/schema.ts';
import { bandOf, folds, foldPeople, keySaid, knownOf, lastDayOf, meetsOf, orgFieldOf, orgRoleOf, orgSaid, roleFieldOf, seenOf, timesSaid, whoParts, whoSaid } from './folk.ts';

const TODAY = '2026-10-06';

const people = {
  id: 'contacts',
  name: 'Contacts',
  one: 'contact',
  title: 'name',
  mobile: ['name', 'role', 'org'],
  icon: 'people',
  meets: { name: 'name', email: 'email', keys: 'keys', handles: 'handles', org: 'org', projects: 'projects', met: 'met', merged_into: 'merged_into', in_touch: 'in_touch', self: 'self' },
  fields: [
    { id: 'name', type: 'text' },
    { id: 'role', type: 'enum', values: ['client', 'contractor'] },
    { id: 'email', type: 'email' },
    { id: 'keys', type: 'list', of: 'text' },
    { id: 'handles', type: 'list', of: 'text' },
    { id: 'org', type: 'ref', to: 'companies' },
    { id: 'projects', type: 'list', of: 'ref', to: 'things' },
    { id: 'met', type: 'list', of: 'text' },
    { id: 'merged_into', type: 'ref', to: 'contacts' },
    { id: 'in_touch', type: 'day' },
    { id: 'self', type: 'bool' },
  ],
} as unknown as RegisterDecl;

let seq = 0;
const row = (fields: Fields): Entry => ({ seq: ++seq, fields, version: 1, created: '2026-09-01T00:00:00Z', by: 'p_owner' });

test('THE ROLE IS READ OFF WHAT THE LIST DECLARES, whatever the list is called, and a part naming no field is no part', () => {
  const m = meetsOf(people);
  assert.equal(m?.org, 'org');
  assert.equal(m?.self, 'self');
  assert.deepEqual(orgFieldOf(people), { field: 'org', to: 'companies' });
  assert.equal(roleFieldOf(people), 'role', 'the first word on its card after the name, and never the organisation');

  const half = { ...people, meets: { name: 'name', org: 'gone' } } as unknown as RegisterDecl;
  assert.equal(meetsOf(half)?.org, undefined);
  assert.equal(orgFieldOf(half), null);

  const tasks = { ...people, meets: undefined } as unknown as RegisterDecl;
  assert.equal(meetsOf(tasks), null);
  assert.deepEqual(foldPeople([row({ name: 'A' })], tasks, TODAY), []);

  const orgs = { id: 'companies', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'kind', type: 'enum' }], org: { name: 'name', kind: 'kind' } } as unknown as RegisterDecl;
  assert.deepEqual(orgRoleOf(orgs), { name: 'name', kind: 'kind' });
  assert.equal(orgRoleOf(people), null);
});

test('LAST IN TOUCH IS THE DAY, OR FAILING IT THE NEWEST MET LINE, and nothing is never', () => {
  const m = meetsOf(people)!;
  assert.equal(lastDayOf({ in_touch: '2026-10-01', met: ['2026-10-03 · mail: Hi'] }, m), '2026-10-03');
  assert.equal(lastDayOf({ met: ['2026-08-27 · commit 8b1e4d0 in portage', '2026-09-02 · commit c47d19e in portage'] }, m), '2026-09-02');
  assert.equal(lastDayOf({}, m), null);
  assert.equal(bandOf('2026-10-01', TODAY), 'week');
  assert.equal(bandOf('2026-09-10', TODAY), 'month');
  assert.equal(bandOf('2026-05-01', TODAY), 'earlier');
  assert.equal(bandOf(null, TODAY), 'never');
});

test('TWENTY-FOUR COLLEAGUES OF ONE COMPANY ARE ONE LINE, where the most recent of them stands, folded below them', () => {
  seq = 0;
  const brightwell = Array.from({ length: 24 }, (_, i) => row({ name: `Colleague ${i}`, org: 7, in_touch: `2026-09-${String(10 + (i % 15)).padStart(2, '0')}` }));
  const teodor = row({ name: 'Teodor', org: 7, in_touch: '2026-10-05' });
  const jo = row({ name: 'Jo', in_touch: '2026-10-04' });
  const solo = row({ name: 'Ana', org: 9, in_touch: '2026-10-02' });
  const quiet = row({ name: 'Registry' });
  const merged = row({ name: 'teodor', org: 7, in_touch: '2026-10-06', merged_into: teodor.seq });
  const bands = foldPeople([...brightwell, jo, quiet, solo, merged, teodor], people, TODAY);

  assert.deepEqual(
    bands.map((b) => b.band),
    ['week', 'never'],
  );
  const week = bands[0]!.items;
  assert.deepEqual(
    week.map((i) => i.key),
    ['o7', `p${jo.seq}`, `p${solo.seq}`],
  );
  const group = week[0]!;
  assert.equal(group.kind, 'org');
  if (group.kind === 'org') {
    assert.equal(group.members.length, 25, 'the merged duplicate is left out');
    assert.equal(group.members[0]!.entry.fields.name, 'Teodor', 'the most recent leads the group');
    assert.equal(group.day, '2026-10-05');
    assert.ok(folds(group.members.length));
  }
  const ana = week[2]!;
  assert.equal(ana.kind === 'person' && ana.org, 9, 'one person at an organisation is a line of their own that still names it');
  assert.equal(bands[1]!.items[0]!.key, `p${quiet.seq}`);
  assert.equal(folds(3), false);
});

test('THE PERSON WHOSE RECORD IT IS IS MARKED, by the list saying so and never by who is reading', () => {
  seq = 0;
  const me = row({ name: 'Mara', self: true, in_touch: '2026-10-06' });
  const [band] = foldPeople([me], people, TODAY);
  const item = band!.items[0]!;
  assert.equal(item.kind === 'person' && item.member.self, true);
});

test('WHERE SOMEBODY WAS SEEN IS SAID IN PLACES, each once, newest first, with no hash or id in the words', () => {
  const seen = seenOf([
    '2026-07-01 · mail: Invoice 20261001',
    '2026-08-27 · commit 8b1e4d0 in portage',
    '2026-09-02 · commit c47d19e in git@github.com:kiln/portage.git',
    '2026-09-28 · mail: Renewal quote',
    '2026-09-29 · mail from halden.example',
    '2026-09-30 · asked about 01J9ZQ4M3V8K2N6P7R5T1W0XYZ in things#3',
    'no day at all',
  ]);
  assert.deepEqual(
    seen.map((s) => [s.where, s.times, s.last]),
    [
      ['Asked', 1, '2026-09-30'],
      ['Mail', 3, '2026-09-29'],
      ['Commits in portage', 2, '2026-09-02'],
      ['No day at all', 1, null],
    ],
  );
  assert.deepEqual(seen[1]!.about, ['halden.example', 'Renewal quote', 'Invoice 20261001'], 'a plain number is not an id');
  const day = (iso: string) => iso.slice(5);
  assert.equal(timesSaid(seen[2]!, day), 'Twice, last on 09-02');
  assert.equal(timesSaid({ times: 1, last: '2026-09-30' }, day), '09-30');
  assert.equal(timesSaid({ times: 4, last: null }, day), '4 times');
});

test('WHAT SOMEBODY IS KNOWN BY IS SAID BY KIND, each once, a repository by its name and never its host', () => {
  /* A KIND THE KERNEL NAMES CARRIES ITS `kind` (3048e2ed3), which picks the chip's mark and its link; any other has none. */
  assert.deepEqual(keySaid('github:jokonkwo'), { label: 'GitHub', value: 'jokonkwo', kind: 'github' });
  assert.deepEqual(keySaid('remote:github.com/kiln/portage'), { label: 'Repository', value: 'portage', kind: 'remote' });
  assert.deepEqual(keySaid('telegram:jo'), { label: 'Telegram', value: 'jo' });
  assert.equal(keySaid('github:'), null);
  assert.deepEqual(keySaid('phone:+447700900123'), { label: 'Phone', value: '+447700900123', kind: 'phone' }, 'a number is never taken for a hash');
  assert.deepEqual(keySaid('github:deadbee1'), { label: 'GitHub', value: 'deadbee1', kind: 'github' }, 'nor is a login');
  assert.deepEqual(keySaid('bank:chillout'), { label: 'Bank texts call it', value: 'chillout', kind: 'bank' });
  assert.deepEqual(keySaid('folder:/Users/mara/Developer/portage'), { label: 'Folder', value: 'portage', kind: 'folder' }, 'a folder by its name, never its path');
  assert.deepEqual(keySaid('constructor:x'), { label: 'Constructor', value: 'x' });
  assert.deepEqual(
    knownOf({ email: 'jo@okonkwo.example', keys: ['email:jo@okonkwo.example', 'github:jokonkwo'], handles: ['git:jokonkwo'] }, { email: 'email', keys: 'keys', handles: 'handles' }),
    [
      { label: 'Email', value: 'jo@okonkwo.example', kind: 'email' },
      { label: 'GitHub', value: 'jokonkwo', kind: 'github' },
      { label: 'Commits as', value: 'jokonkwo', kind: 'git' },
    ],
  );
  assert.deepEqual(
    knownOf({ domain: 'halden.example', keys: ['domain:halden.example', 'payee:HALDEN TYPE'], aliases: ['Halden'] }, { domain: 'domain', keys: 'keys', aliases: 'aliases' }),
    [
      { label: 'Website', value: 'halden.example', kind: 'domain' },
      { label: 'Bank texts call it', value: 'HALDEN TYPE', kind: 'payee' },
      { label: 'Also called', value: 'Halden' },
    ],
  );
});

test('WHO SOMEBODY IS IS ONE LINE, each part only when the row has it', () => {
  assert.equal(whoSaid({ role: 'Contractor', org: 'Brightwell', projects: ['Kiln', 'Portage'] }), 'Contractor at Brightwell, on Kiln and Portage.');
  assert.equal(whoSaid({ role: null, org: 'Brightwell', projects: [] }), 'At Brightwell.');
  assert.equal(whoSaid({ role: null, org: null, projects: ['Kiln'] }), 'On Kiln.');
  assert.equal(whoSaid({ role: null, org: null, projects: [] }), null);
  assert.equal(whoSaid({ role: 'Client', org: null, projects: ['A', 'B', 'C', 'D', 'E'] }), 'Client, on A, B, C and 2 more.');
  assert.deepEqual(whoParts({ role: 'Contractor', org: { name: 'Brightwell', href: '/r/orgs/3' }, projects: [{ name: 'Kiln', href: '/r/things/1' }] }), [
    { text: 'Contractor at ' },
    { text: 'Brightwell', href: '/r/orgs/3' },
    { text: ', on ' },
    { text: 'Kiln', href: '/r/things/1' },
    { text: '.' },
  ]);
  assert.equal(orgSaid({ kind: 'Client', people: 24, projects: 1 }), 'Client · 24 people · 1 project');
  assert.equal(orgSaid({ kind: null, people: 0, projects: 0 }), null);
});
