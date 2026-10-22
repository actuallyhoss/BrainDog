/**
 * What Slash noticed and what it asks, in the person's words: every rule in `noticeUsage` fires over one
 * reading, and not one sentence it says or question it files calls their things rows or lists.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { labelSetting, voiceSetting } from '@braindog/declare';

import { noticeUsage, type ListUse, type Offered, type PageUse, type Usage } from '../src/slash.ts';

const AT = '2026-10-02T09:00:00.000Z';
const OLD = '2026-01-02T09:00:00.000Z';

const listUse = (id: string, name: string, pack: string, added30: number, addedDays30: number): ListUse => ({
  id,
  name,
  pack,
  rows: added30,
  added30,
  addedDays30,
  writes90: added30,
  reads90: 0,
  agentWrites30: 0,
  declaredAt: OLD,
});
const pageUse = (slug: string, title: string, pack: string, registers: string[], opens30: number, openDays30: number): PageUse => ({
  slug,
  title,
  titled: true,
  pack,
  registers,
  opens30,
  openDays30,
  opens90: opens30,
  lastOpened: opens30 > 0 ? AT : null,
  declaredAt: OLD,
});

/** A reading in which every rule speaks: growth with no page, agents and nowhere to see them, a pack nobody touched, a
 *  page nobody opened, another use case taking most of what is added, a page title worth borrowing, and a skill missing. */
const USAGE: Usage = {
  at: AT,
  firstWrite: OLD,
  ageDays: 273,
  listening: { pages: true, lists: true },
  lists: [
    listUse('tasks', 'Tasks', 'work', 12, 3),
    listUse('logbook', 'Logbook', 'log', 6, 3),
    listUse('jottings', 'Jottings', 'notes', 0, 0),
    listUse('courses', 'Courses', 'usecase-study', 1, 1),
    listUse('plants', 'Plants', 'usecase-garden', 30, 6),
  ],
  pages: [
    pageUse('work', 'Tickets', 'work', ['tasks'], 6, 3),
    pageUse('notes', 'Notes', 'notes', ['jottings'], 0, 0),
    pageUse('garden', 'Garden', 'usecase-garden', ['plants'], 0, 0),
  ],
  agents: [{ actor: 'agent:claude', writes30: 12, days30: 3, lists: ['tasks'] }],
  packs: [
    { id: 'work', title: 'Work', on: true, usecase: false, since: OLD },
    { id: 'log', title: 'Log', on: true, usecase: false, since: OLD },
    { id: 'notes', title: 'Notes', on: true, usecase: false, since: OLD },
    { id: 'usecase-study', title: 'Study', on: true, usecase: true, since: OLD },
    { id: 'usecase-garden', title: 'Garden', on: true, usecase: true, since: OLD },
  ],
  speaking: 'usecase-study',
  writes: { all30: 15, agents30: 12, agents90: 12 },
  tone: {
    pack: 'usecase-study',
    settings: {
      /* STUDY RELABELS WORK'S TASKS ITSELF, so the page title is offered as their name (`relabelled` in `slash.ts`). */
      [labelSetting('tasks')]: { title: null, default: 'Assignments', value: null },
      [labelSetting('tasks:one')]: { title: null, default: 'assignment', value: null },
      [labelSetting('tasks:holds')]: { title: null, default: 'every assignment we know about', value: null },
      [voiceSetting('since_away')]: { title: null, default: 'Since you last looked', value: null },
    },
  },
  skills: [],
  /* THREE RUNS LEFT THE SAME STEPS FOR TRIAGE, so the skill Study names is offered with them (`stepsFrom`). */
  handoffs: ['S1', 'S2', 'S3'].map((run) => ({ run, text: 'Read the new ticket with `desk show --new` first.\nThen filed the triage with `desk file --triage`.' })),
};

const OFFERED: Offered[] = [
  { id: 'watch', kind: 'pack', title: 'Watch', modules: [], showsAgents: true },
  { id: 'usecase-study', kind: 'usecase', title: 'Study', modules: [], showsAgents: false, skills: [{ name: 'triage', trigger: 'when a ticket is opened' }] },
];

test('NOTHING SLASH NOTICES OR ASKS SAYS ROW OR LIST: every rule speaks, each in the person’s own words', () => {
  const { noticed, drafts, quiet } = noticeUsage(USAGE, OFFERED);
  /* EVERY RULE SPOKE, so the check below read each one's sentence. */
  assert.deepEqual([...new Set(noticed.map((n) => n.kind))].sort(), ['agents', 'grows', 'label', 'skills', 'unopened', 'untouched', 'voice']);
  assert.ok(drafts.length >= 8, `only ${drafts.length} drafts`);
  assert.equal(quiet, null);
  const said = [
    ...noticed.map((n) => n.text),
    ...drafts.map((d) => d.question),
    ...drafts.flatMap((d) => (Array.isArray(d.body.why) ? (d.body.why as string[]) : [])),
  ];
  for (const text of said) assert.doesNotMatch(text, /\brows?\b|\blists?\b/iu, text);
  /* AND A YOUNG RECORD'S QUIET LINE TOO. */
  for (const young of [{ ...USAGE, ageDays: 3 }, { ...USAGE, firstWrite: null }]) assert.doesNotMatch(noticeUsage(young, OFFERED).quiet ?? '', /\brows?\b|\blists?\b/iu);
});
