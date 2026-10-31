/**
 * The projects this tab has drawn, by the address each opens on and by its row, so a project's page opens in its own
 * shape before the record answers (`known-project.ts`). Every name is made up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { forgetProjects, knownProject, knownRow, knowProjects, projectsPlace } from './known-project.ts';

const BASE = 'https://brain.example/r/harbourview';
const lanternfish = { key: 'things#3', href: '/p/lanternfish', name: 'Lanternfish', mark: 'L', hue: 210, lane: 'building' };

test('A PROJECT DRAWN IS KNOWN BY ITS PAGE AND ITS ROW, on its own record only, with the place its page goes back to', () => {
  forgetProjects();
  assert.equal(knownProject(BASE, '/p/lanternfish'), null);
  knowProjects(BASE, [lanternfish, { ...lanternfish, key: 'things#4', href: '/p/blank', name: '  ' }], '/p/projects');
  assert.deepEqual(knownProject(BASE, '/p/lanternfish'), { name: 'Lanternfish', mark: 'L', hue: 210, lane: 'building', list: 'things' });
  assert.deepEqual(knownRow(BASE, 'things#3'), knownProject(BASE, '/p/lanternfish'));
  assert.equal(knownProject(BASE, '/p/blank'), null, 'a project with no name was kept');
  assert.equal(knownProject('https://brain.example/r/copperleaf', '/p/lanternfish'), null, 'another record drew this one');
  assert.equal(projectsPlace(BASE), '/p/projects');

  /* A LATER DRAWING WINS, and one that names no place keeps the place it had. */
  knowProjects(BASE, [{ ...lanternfish, lane: 'earning', hue: null }]);
  assert.equal(knownProject(BASE, '/p/lanternfish')?.lane, 'earning');
  assert.equal(knownProject(BASE, '/p/lanternfish')?.hue, null);
  assert.equal(projectsPlace(BASE), '/p/projects');
  forgetProjects();
  assert.equal(knownRow(BASE, 'things#3'), null);
});
