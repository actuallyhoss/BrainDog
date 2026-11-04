/**
 * The voice a record speaks in: its keys are the format's, each replaces a
 * line the house voice already has, and a key left out reads the house line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { USE_CASES, VOICE_KEYS, labelsOf as labelsOfPack, voiceOf as voiceOfPack } from '@braindog/seed/usecases';
import { labelSetting as labelSettingOfPack, speakingPack as speakingPackOf, useCasePack, voiceWhenAdding as voiceWhenAddingPack, voiceWrites as voiceWritesOf } from '@braindog/declare';
import { homePageOf as homeOfPack } from '@braindog/seed/usecases/install';

import { copy } from './copy.ts';
import { penWords } from './design/words.ts';
import { words as homeWords } from './home/words.ts';
import { VOICE_LINES, homePageOf, homeSlugOf, labelSetting, labelsOf, voiceWhenAdding, voiceWrites, lineOf, listNamed, relabel, relabelAll, speaking, voiceOf } from './voice.ts';

test('THE DISPLAY READS EVERY KEY THE FORMAT ALLOWS, and no other', () => {
  assert.deepEqual(Object.keys(VOICE_LINES).sort(), [...VOICE_KEYS].sort());
});

test('A KEY LEFT OUT READS THE HOUSE VOICE, so the sample loses nothing', () => {
  const house = new Set<unknown>([...Object.values(copy), ...Object.values(homeWords), ...Object.values(penWords)]);
  for (const key of VOICE_KEYS) {
    assert.ok(house.has(VOICE_LINES[key]), `${key} replaces a line the house voice holds`);
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
  const homes = USE_CASES.filter((u) => u.voice.home).map((u) => lineOf(u.voice, 'home'));
  /* ALL BUT ONE WORD: Student and, since founder 2.6.0, Solo founder both call Home Today, which is what the rail and
     the page already said of each. Every other use case that names Home has a word of its own. The house says Today
     as well now, so those three are the ones that differ from it. */
  assert.equal(new Set(homes).size, homes.length - 1);
  assert.deepEqual(homes.filter((h, i) => homes.indexOf(h) !== i), ['Today']);
  assert.equal(homes.filter((h) => h !== copy.home).length, 3);
});

test('THE VOICE COMES FROM THE FIRST USE-CASE PACK SWITCHED ON', () => {
  assert.equal(speaking([{ id: 'people', disabled_at: null }]), null);
  assert.equal(speaking([{ id: 'usecase-student', disabled_at: '2026-09-17' }, { id: 'usecase-founder', disabled_at: null }]), 'usecase-founder');
});

test('LABELS ARE READ FROM SETTINGS THE SAME WAY THE FORMAT WRITES THEM', () => {
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
  for (const u of USE_CASES) {
    const pack = useCasePack(u);
    const config = (pack?.config ?? {}) as Record<string, { label?: string; default?: unknown }>;
    const settings = Object.fromEntries(Object.entries(u.labels).map(([k, v]) => [labelSetting(k), v]));
    for (const setting of Object.keys(settings)) assert.equal(labelSettingOfPack(Object.keys(u.labels).find((k) => labelSetting(k) === setting)!), setting);
    assert.deepEqual(labelsOf(settings, config), u.labels, u.usecase);
    assert.deepEqual(labelsOf(settings, config), labelsOfPack(settings, config), u.usecase);
  }
});

test('A LABEL IS DRAWN OVER THE DECLARATION, AND A KEY LEFT OUT READS THE DECLARATION', () => {
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

test('WHAT ADDING A USE CASE DOES TO THE VOICE is the rule the format keeps', () => {
  const cases: [{ id: string; disabled_at: string | null }[], string][] = [
    [[], 'student'],
    [[{ id: 'usecase-personal', disabled_at: null }], 'student'],
    [[{ id: 'usecase-student', disabled_at: null }], 'personal'],
    [[{ id: 'usecase-team', disabled_at: '2026-09-17' }, { id: 'usecase-guide', disabled_at: null }], 'founder'],
    [[{ id: 'usecase-student', disabled_at: null }], 'usecase-team'],
  ];
  for (const [packs, id] of cases) assert.equal(voiceWhenAdding(packs, id), voiceWhenAddingPack(packs, id), `${id} over ${JSON.stringify(packs)}`);
  assert.equal(voiceWhenAdding([{ id: 'usecase-personal', disabled_at: null }], 'student'), 'beside');
});

test('A USE CASE CHOSEN TO SPEAK SPEAKS, and one chosen not to is passed over, by the rule the format keeps', () => {
  const cases: { id: string; disabled_at: string | null; speaks?: boolean | null }[][] = [
    [{ id: 'usecase-personal', disabled_at: null, speaks: false }, { id: 'usecase-student', disabled_at: null }],
    [{ id: 'usecase-personal', disabled_at: null }, { id: 'usecase-student', disabled_at: null, speaks: true }],
    [{ id: 'usecase-personal', disabled_at: null, speaks: false }, { id: 'usecase-student', disabled_at: null, speaks: false }],
    [{ id: 'usecase-personal', disabled_at: null, speaks: true }, { id: 'usecase-student', disabled_at: null, speaks: true }],
    [{ id: 'usecase-personal', disabled_at: '2026-09-17', speaks: true }, { id: 'usecase-student', disabled_at: null }],
  ];
  for (const packs of cases) assert.equal(speaking(packs), speakingPackOf(packs), JSON.stringify(packs));
  assert.deepEqual(cases.map((c) => speaking(c)), ['usecase-student', 'usecase-student', 'usecase-personal', 'usecase-personal', 'usecase-student']);
  assert.equal(voiceWhenAdding(cases[0]!, 'guide'), voiceWhenAddingPack(cases[0]!, 'guide'));
});

test('HOME ASKS ONLY FOR A PAGE THE RECORD HOLDS: the use case\'s, else the house one, else none', () => {
  assert.equal(homeSlugOf('home-student', ['home-student', 'home', 'studies']), 'home-student');
  assert.equal(homeSlugOf('home-reading-club', ['meetings', 'home']), 'home', 'a use case with no Home page was asked for one');
  assert.equal(homeSlugOf('home-reading-club', ['meetings']), null);
  assert.equal(homeSlugOf(null, ['home']), 'home');
  assert.equal(homeSlugOf(null, []), null);
});

test('THE VOICE WRITES MAKE ONE USE CASE SPEAK AND EVERY OTHER ONE ON NOT, as the format writes them', () => {
  const cases: [{ id: string; disabled_at: string | null; speaks?: boolean | null }[], string][] = [
    [[{ id: 'usecase-personal', disabled_at: null }, { id: 'usecase-student', disabled_at: null, speaks: true }, { id: 'usecase-team', disabled_at: null }], 'usecase-student'],
    [[{ id: 'usecase-personal', disabled_at: null, speaks: false }, { id: 'usecase-student', disabled_at: '2026-09-17', speaks: true }, { id: 'usecase-team', disabled_at: null }], 'usecase-team'],
    [[{ id: 'usecase-personal', disabled_at: null }], 'usecase-personal'],
    [[{ id: 'usecase-personal', disabled_at: null }, { id: 'usecase-student', disabled_at: null }], 'usecase-guide'],
  ];
  for (const [packs, speaker] of cases) assert.deepEqual(voiceWrites(packs, speaker), voiceWritesOf(packs, speaker), speaker);
  assert.deepEqual(voiceWrites(cases[0]![0], 'usecase-student'), [{ id: 'usecase-personal', speaks: false }, { id: 'usecase-team', speaks: false }]);
  assert.deepEqual(voiceWrites(cases[2]![0], 'usecase-personal'), [], 'one alone speaks whatever it holds');
  assert.deepEqual(voiceWrites(cases[3]![0], 'usecase-guide'), [], 'a use case that is not on is never made to speak');
  /* UNASKED, a use case chosen to speak keeps the voice whichever id sorts first. */
  const chosen = [{ id: 'usecase-student', disabled_at: null, speaks: true }];
  assert.equal(voiceWhenAdding(chosen, 'personal'), 'beside');
  assert.equal(voiceWhenAddingPack(chosen, 'personal'), 'beside');
});
