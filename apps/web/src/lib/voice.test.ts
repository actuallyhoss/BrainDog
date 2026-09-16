/**
 * The voice a record speaks in (`loop/research-spark.md` §2.2): its keys are the format's, each replaces a
 * line the house voice already has, and a key left out reads the house line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { USE_CASES, VOICE_KEYS, labelsOf as labelsOfPack, voiceOf as voiceOfPack } from '@braindog/seed/usecases';
import { homePageOf as homeOfPack } from '@braindog/seed/usecases/install';

import { copy } from './copy.ts';
import { VOICE_LINES, homePageOf, labelsOf, lineOf, listNamed, relabel, relabelAll, speaking, voiceOf } from './voice.ts';

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

test('LABELS ARE READ FROM SETTINGS THE SAME WAY THE FORMAT WRITES THEM (S8)', () => {
  const values = {
    label_tickets: 'Issues',
    label_people__role__collaborator: 'Teammate',
    label_people: ' ',
    label_x__Y: 'no',
    voice_home: 'Team',
    label_steps__state: 4,
    one_tickets: 'issue',
    holds_tickets: 'every issue the team has',
    one_: 'x',
  };
  assert.deepEqual(labelsOf(values), labelsOfPack(values));
  assert.deepEqual(labelsOf(values), { tickets: 'Issues', 'people.role.collaborator': 'Teammate', 'tickets:one': 'issue', 'tickets:holds': 'every issue the team has' });
  const settingOf = (k: string): string => (/:(one|holds)$/.test(k) ? `${k.split(':')[1]}_${k.split(':')[0]}` : `label_${k.split('.').join('__')}`);
  for (const u of USE_CASES) {
    const settings = Object.fromEntries(Object.entries(u.labels).map(([k, v]) => [settingOf(k), v]));
    assert.deepEqual(labelsOf(settings), u.labels, u.usecase);
  }
});

test('A LABEL IS DRAWN OVER THE DECLARATION, AND A KEY LEFT OUT READS THE DECLARATION (S8)', () => {
  const people = {
    id: 'people',
    name: 'People',
    fields: [
      { id: 'name', label: 'Name' },
      { id: 'role', values: ['client', 'collaborator'], labels: { client: 'Client' } },
    ],
  };
  assert.equal(relabel(people, {}), people);
  assert.equal(relabel(people, { tickets: 'Issues' }), people);
  const drawn = relabel(people, { people: 'Teammates', 'people.role': 'Part', 'people.role.collaborator': 'Teammate' });
  assert.equal(drawn.name, 'Teammates');
  assert.equal(drawn.fields[0], people.fields[0]);
  assert.deepEqual(drawn.fields[1], { id: 'role', values: ['client', 'collaborator'], label: 'Part', labels: { client: 'Client', collaborator: 'Teammate' } });
  assert.equal(people.name, 'People');
  assert.equal(listNamed({ people: 'Teammates' }, 'people', 'People'), 'Teammates');
  assert.equal(listNamed({ people: 'Teammates' }, 'tasks', 'Tasks'), 'Tasks');
});

test('A RENAMED LIST SAYS ONE OF ITS NEW NAME AND ITS OWN DESCRIPTION: "Issues" is not "New ticket"', () => {
  const tickets = { id: 'tickets', name: 'Tickets', one: 'ticket', holds: 'every piece of work the team has', fields: [] };
  assert.equal(relabel(tickets, { tickets: 'Tickets' }).one, 'ticket', 'a label that says the same name keeps the singular');
  const issues = relabel(tickets, { tickets: 'Issues' });
  assert.equal(issues.one, 'issue');
  assert.equal(issues.holds, tickets.holds);
  const said = relabel(tickets, { tickets: 'Issues', 'tickets:one': 'bug', 'tickets:holds': 'every bug we know about' });
  assert.deepEqual([said.name, said.one, said.holds], ['Issues', 'bug', 'every bug we know about']);
  assert.equal(relabel(tickets, { 'tickets:one': 'job' }).name, 'Tickets');
});

test("THE BUILD'S OWN LISTS ARE RELABELLED IN PLACE, and a label taken away puts the declaration's word back", () => {
  const table: Record<string, { id: string; name: string; one: string; fields: never[] }> = { people: { id: 'people', name: 'People', one: 'person', fields: [] } };
  relabelAll(table, { people: 'Teammates' });
  assert.deepEqual([table.people?.name, table.people?.one], ['Teammates', 'teammate']);
  relabelAll(table, {});
  assert.deepEqual([table.people?.name, table.people?.one], ['People', 'person']);
});

test("A USE CASE'S HOME IS THE PAGE THE SEED DECLARES FOR IT, by its pack's id", () => {
  for (const u of USE_CASES) assert.equal(homePageOf(`usecase-${u.usecase}`), homeOfPack(u.usecase));
  assert.equal(homePageOf('usecase-student'), 'home-student');
});
