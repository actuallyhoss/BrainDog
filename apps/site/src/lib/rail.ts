/**
 * The glyph the app's rail draws beside each name band 0001's miniature rail names.
 *
 * READ OFF THE SEED, NOT CHOSEN. Every one of these is the `icon:` the page or list is declared
 * with in `packages/seed`, found by walking each use case the way `test/content.test.ts` walks it
 * for names, and `arrange.test.ts` walks it again on every run. The first name in every case is that
 * case's Home page and draws `home`, and that took a measurement to get right for the Solo founder:
 * its Home is titled `Overview`, and Work installs a second page called Overview that draws a
 * ticked box. The first walk of the seed let the module's glyph win and drew the founder's front
 * page as a task list. The use case's own declaration is the one the app puts at the top of the
 * rail, so it is read last and wins. Its `Money` is the `obligations` register and draws a
 * receipt, not a note, which is the other one an eye would have picked wrong.
 *
 * NOT IN `copy.ts`, because nothing here is a word a reader sees. It is keyed by the words that
 * are, so a name added to a case's `holds` without a line here fails the test instead of drawing
 * a row with no glyph.
 */

import type { IconName } from './icons.ts';

export const RAIL: Readonly<Record<string, IconName>> = {
  /* Personal */
  'Day to day': 'home',
  Spending: 'tag',
  Goals: 'star',
  Bills: 'obligation',
  Accounts: 'money',
  Budget: 'tag',
  'Savings goals': 'star',
  Log: 'check',
  'Put by': 'money',
  Projects: 'thing',
  /* Student */
  Today: 'home',
  Studies: 'board',
  Courses: 'doc',
  Assignments: 'task',
  'Study sessions': 'calendar',
  /* Solo founder */
  Overview: 'home',
  Dashboard: 'observe',
  Organisations: 'grid',
  Datapoints: 'observe',
  Money: 'obligation',
  People: 'people',
  Tasks: 'task',
  /* Team */
  Team: 'home',
  Cycles: 'rows',
  'Agent work': 'session',
  Board: 'board',
  Tickets: 'task',
  'Cycle plan': 'rows',
  Teammates: 'people',
  /* New project */
  'Your project': 'home',
  Guide: 'star',
  Milestones: 'star',
  Steps: 'task',
  Choices: 'decide',
  Resources: 'link',
};
