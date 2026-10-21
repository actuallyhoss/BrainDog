/**
 * A stale key number's fix (`stale-fix.ts`): one an agent keeps asks that agent, in plain words saying which number,
 * where and since when, scoped to its project; one nobody's agent keeps adds a reading, written under its measure on
 * its project now, money in minor units; and the readings list is found by its shape on the seed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS } from '@braindog/seed';

import { kpis as words } from '../copy/kpis.ts';
import { agentOf, daySaid, lastOf, projectFieldOf, readingListIn, readingOf, staleFixOf, type StaleKpi } from './stale-fix.ts';

const NOW = Date.UTC(2026, 9, 21, 12);
const OWNER = { tell: true, add: true };

const studios: StaleKpi = {
  name: 'Studios licensed',
  owner: 'claude',
  project: 'Kiln',
  spoken: 'things#1',
  points: [{ at: '2026-09-23T09:00:00.000Z' }, { at: '2026-09-30T09:00:00.000Z' }, { at: '2026-09-16T09:00:00.000Z' }],
};

test('AN AGENT KEEPS IT: "Ask Claude to report it" files an instruction to Claude on Kiln, saying which number and since when', () => {
  const fix = staleFixOf(studios, OWNER, { now: NOW });
  assert.ok(fix && fix.kind === 'ask');
  assert.equal(fix.label, 'Ask Claude to report it');
  assert.deepEqual(fix.args, {
    said: 'Please report Studios licensed on Kiln. The last reading was on 30 Sep.',
    to: 'agent',
    to_agent: 'claude',
    when: 'now',
    project: 'things#1',
  });
  assert.equal(words.kpiAsked(fix.agent, fix.name), 'Asked Claude to report Studios licensed.');
  /* NOTHING CAME IN YET, and the project by name when its handle is not known. */
  const none = staleFixOf({ ...studios, spoken: undefined, points: [] }, OWNER, { now: NOW });
  assert.ok(none && none.kind === 'ask');
  assert.equal(none.args.said, 'Please report Studios licensed on Kiln. It has no reading yet.');
  assert.equal(none.args.project, 'Kiln');
});

test('THE OWNER IS READ AS A PERSON WRITES IT: a kind, a name or the app; a person or a feed is no agent', () => {
  assert.equal(agentOf('claude'), 'claude');
  assert.equal(agentOf('Claude'), 'claude');
  assert.equal(agentOf('Claude Code'), 'claude');
  assert.equal(agentOf('agent:codex'), 'codex');
  assert.equal(agentOf(' Cursor '), 'cursor');
  assert.equal(agentOf('Sam'), null);
  assert.equal(agentOf('live-feed'), null);
  assert.equal(agentOf(''), null);
  assert.equal(agentOf(undefined), null);
});

test('NO AGENT KEEPS IT, OR THIS PERSON TELLS NO AGENT: "Add a reading"; neither, nothing to press', () => {
  const specimen: StaleKpi = { name: 'Specimen downloads', project: 'Kiln', spoken: 'things#1', points: [{ at: '2026-09-30T09:00:00.000Z' }] };
  assert.deepEqual(staleFixOf(specimen, OWNER, { now: NOW }), { kind: 'add', label: 'Add a reading' });
  assert.deepEqual(staleFixOf({ ...specimen, owner: 'Sam' }, OWNER, { now: NOW }), { kind: 'add', label: 'Add a reading' });
  assert.deepEqual(staleFixOf(studios, { tell: false, add: true }, { now: NOW }), { kind: 'add', label: 'Add a reading' });
  assert.equal(staleFixOf(specimen, { tell: true, add: false }, { now: NOW }), null);
});

test('THE DAY AS A PERSON SAYS IT, the year only when it is not this one; the newest point whatever the order', () => {
  assert.equal(daySaid('2026-09-30T09:00:00.000Z', NOW), '30 Sep');
  assert.equal(daySaid('2025-12-02', NOW), '2 Dec 2025');
  assert.equal(lastOf(studios.points), '2026-09-30T09:00:00.000Z');
  assert.equal(lastOf([]), null);
  for (const said of [words.kpiAskSaid('Players', 'Crumb.gg', '2 Oct'), words.kpiAskAgent('Claude'), words.kpiAddReading]) assert.ok(!said.includes('—'), said);
});

test('THE READINGS LIST IS FOUND BY ITS SHAPE on the seed, and its link to the projects', () => {
  const projects = (REGISTERS.kpis!.fields.find((f) => f.id === 'thing') as { to?: string }).to ?? null;
  const list = readingListIn(REGISTERS as never, projects);
  assert.ok(list !== null);
  assert.equal(REGISTERS[list]!.name, 'Numbers');
  assert.equal(projectFieldOf(REGISTERS[list]!.fields as never, projects), 'thing');
  assert.equal(readingListIn({ kpis: REGISTERS.kpis! } as never, projects), null, 'the key numbers are no list of readings');
});

test('A READING IS WRITTEN under its measure, on its project, now: a plain value with its unit, or money in minor units', () => {
  const at = { project: 1, field: 'thing', now: NOW, sources: ['reported', 'polled', 'typed', 'example'], amount: true };
  assert.deepEqual(readingOf({ name: 'Specimen downloads', measure: 'Specimen downloads', unit: 'downloads' }, '1,240', at), {
    ok: true,
    fields: { name: 'Specimen downloads', thing: 1, value: 1240, unit: 'downloads', at: new Date(NOW).toISOString(), source: 'typed' },
  });
  assert.deepEqual(readingOf({ name: 'Revenue a month', unit: 'GBP' }, '2,300.50', at), {
    ok: true,
    fields: { name: 'Revenue a month', thing: 1, amount: { amount: 230_050, currency: 'GBP' }, at: new Date(NOW).toISOString(), source: 'typed' },
  });
  assert.deepEqual(readingOf({ name: 'Players' }, '', at), { ok: false, fault: 'Type the value.' });
  assert.deepEqual(readingOf({ name: 'Players' }, 'lots', at), { ok: false, fault: words.kpiNotDigits('lots') });
  /* A LIST THAT SAYS NO SOURCE IS SENT NONE. */
  const plain = readingOf({ name: 'Players' }, '12', { ...at, sources: undefined });
  assert.ok(plain.ok && !('source' in plain.fields));
});
