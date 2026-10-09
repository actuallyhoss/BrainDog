/**
 * The sentence under Settings' title: what it says from the faults, the engine, the vital signs, the copies and the
 * month's usage, that what is broken leads, and that it says nothing it did not read.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { daysLeft, healthSaid, lastCopy, leadFault, nearest, redSigns, unreadSigns, type Engine, type Fault, type Part, type Sign } from './health.ts';

const text = (parts: Part[] | null): string => (parts ?? []).map((p) => p.text).join('');
const needs = (parts: Part[] | null): string[] => (parts ?? []).filter((p) => p.needs).map((p) => p.text);

const links = (parts: Part[] | null): string[] => (parts ?? []).filter((p) => p.href).map((p) => p.href!);

const NOW = Date.parse('2026-09-29T09:00:00Z');
const MONTH = { resets: '1 October', near: null, daysLeft: 2 };

const fault = (cause: string, said: string, since: string): Fault => ({ cause, said, count: 8, since, last: '2026-09-29T03:00:00Z' });
const PAIRS = fault('outbox#infer.resolve', 'BrainDog could not check for people who are here twice. It tries again tonight.', '2026-09-26T03:00:00Z');
const MAIL = fault('outbox#notify.mail', 'BrainDog could not send a mail.', '2026-09-28T03:00:00Z');

const engine = (state: Engine['health']['state'], text: string, whose: Engine['said']['whose'] = null): Engine => ({ health: { state }, said: { text, whose } });
const DOWN = engine('not_answering', 'Slash’s model has not answered since 6 October. That is ours to fix. Until it is back, BrainDog works from its rules.', 'ours');
const UP = engine('answering', 'Slash’s model answered 3 hours ago.');

const signs = (...states: Sign['state'][]): Sign[] => states.map((state, i) => ({ sign: `s${i}`, state }));

test('all healthy names every fact and marks nothing, and only once the faults were read as none', () => {
  const said = healthSaid('in', { resets: '1 October', near: null, daysLeft: 2 }, { faults: [] });
  assert.equal(text(said), 'All healthy: last night’s copy is in, nothing runs out before 1 October, and nothing is broken.');
  assert.deepEqual(needs(said), []);
  assert.equal(text(healthSaid('in', { resets: '1 October', near: null, daysLeft: 2 })), 'Last night’s copy is in, and nothing runs out before 1 October.');
});

test('a missed night is the phrase that needs him, and the rest is still said', () => {
  const said = healthSaid('missing', { resets: '1 October', near: null, daysLeft: 2 });
  assert.equal(text(said), 'No copy last night, and nothing runs out before 1 October.');
  assert.deepEqual(needs(said), ['No copy last night']);
});

test('a meter near its limit is named with its share and the days left', () => {
  const said = healthSaid('in', { resets: '1 October', near: { key: 'runs', share: 0.914 }, daysLeft: 2 });
  assert.equal(text(said), 'Runs are at 91%, 2 days to go, and last night’s copy is in.');
  assert.deepEqual(needs(said), ['Runs are at 91%, 2 days to go']);
});

test('both at once are both marked', () => {
  const said = healthSaid('missing', { resets: '1 October', near: { key: 'bytes', share: 1 }, daysLeft: 2 });
  assert.equal(text(said), 'No copy last night, and fetched data is used up until 1 October.');
  assert.equal(needs(said).length, 2);
});

test('nothing read is no sentence, and one half read is that half alone', () => {
  assert.equal(healthSaid(null, null), null);
  assert.equal(text(healthSaid('in', null)), 'Last night’s copy is in.');
  assert.equal(text(healthSaid(null, { resets: '1 October', near: null, daysLeft: 2 })), 'Nothing runs out before 1 October.');
});

test('last night is the newest copy, and no copies is nothing to judge by', () => {
  assert.equal(lastCopy(['2026-09-29T03:00:00Z', '2026-09-20T03:00:00Z'], NOW), 'in');
  assert.equal(lastCopy(['2026-09-26T03:00:00Z'], NOW), 'missing');
  assert.equal(lastCopy([], NOW), null);
  assert.equal(lastCopy(['not a date'], NOW), null);
});

test('only a meter at the notice line or past it is near', () => {
  assert.equal(nearest([{ key: 'runs', share: 0.5 }, { key: 'requests', share: 0.79 }]), null);
  assert.deepEqual(nearest([{ key: 'runs', share: 0.5 }, { key: 'ms', share: 0.85 }]), { key: 'ms', share: 0.85 });
  assert.equal(nearest([]), null);
});

test('the days left count today', () => {
  assert.equal(daysLeft(NOW), 2);
  assert.equal(daysLeft(Date.parse('2026-02-01T00:00:00Z')), 28);
  assert.equal(daysLeft(Date.parse('2026-09-30T23:00:00Z')), 1);
});

test('an open fault leads, before the engine, the signs and the copy, and the healthy parts are still said after it', () => {
  const said = healthSaid('in', MONTH, { faults: [PAIRS], engine: DOWN, signs: signs('red', 'green'), signsAt: '/settings' });
  assert.equal(
    text(said),
    'One thing is not working: BrainDog could not check for people who are here twice. It tries again tonight. ' +
      'Slash’s model has not answered since 6 October. That is ours to fix. Until it is back, BrainDog works from its rules. ' +
      'One vital sign needs a look. Last night’s copy is in, and nothing runs out before 1 October.',
  );
  assert.deepEqual(needs(said), ['One thing is not working', 'Slash’s model has not answered since 6 October.', 'One vital sign needs a look']);
  assert.ok(!text(said).includes('All healthy'));
});

test('several faults are counted, and the one broken longest is said and retried', () => {
  const said = healthSaid(null, null, { faults: [MAIL, PAIRS] });
  assert.equal(text(said), '2 things are not working: BrainDog could not check for people who are here twice. It tries again tonight. And one more.');
  assert.equal(leadFault([MAIL, PAIRS])?.cause, 'outbox#infer.resolve');
  assert.equal(leadFault([]), null);
});

test('no faults read as none is part of all healthy; a fault is never beside it', () => {
  assert.equal(text(healthSaid('in', null, { faults: [] })), 'All healthy: last night’s copy is in, and nothing is broken.');
  assert.ok(!text(healthSaid('in', null, { faults: [PAIRS] })).includes('All healthy'));
});

test('an engine that does not answer is said and marked; one that answers joins all healthy', () => {
  const down = healthSaid('in', null, { engine: DOWN });
  assert.equal(needs(down)[0], 'Slash’s model has not answered since 6 October.');
  assert.ok(text(down).endsWith('Last night’s copy is in.'));
  const key = healthSaid(null, null, { engine: engine('key_closed', 'Your own key for Slash has not opened since 6 October. Open it in the vault, or switch to the included model.', 'yours') });
  assert.deepEqual(needs(key), ['Your own key for Slash has not opened since 6 October.']);
  assert.equal(
    text(healthSaid('in', MONTH, { faults: [], engine: UP })),
    'All healthy: Slash’s model answered 3 hours ago, last night’s copy is in, nothing runs out before 1 October, and nothing is broken.',
  );
  assert.equal(text(healthSaid('in', MONTH, { faults: [], engine: engine('not_answering', '') })).startsWith('Slash’s model is not answering.'), true);
  assert.ok(!text(healthSaid('in', MONTH, { faults: [], engine: engine('not_answering', '') })).includes('All healthy'));
  assert.equal(healthSaid(null, null, { engine: engine('off', 'Slash has no model on this host, so BrainDog works from its rules.') }), null);
});

test('red signs are a count that links to where the signs are shown; all green joins all healthy', () => {
  const said = healthSaid('in', null, { signs: signs('red', 'red', 'green'), signsAt: '/p/health' });
  assert.deepEqual(needs(said), ['2 vital signs need a look']);
  assert.deepEqual(links(said), ['/p/health']);
  assert.deepEqual(links(healthSaid(null, null, { signs: signs('red') })), []);
  assert.equal(text(healthSaid(null, null, { faults: [], signs: signs('green', 'green') })), 'All healthy: nothing is broken.');
  assert.equal(healthSaid(null, null, { signs: signs('green', 'green') }), null);
  assert.equal(redSigns(signs('red', 'none', 'red')), 2);
});

test('a method the record does not have says nothing, and never healthy', () => {
  assert.equal(healthSaid(null, null, { faults: null, engine: null, signs: null }), null);
  assert.equal(redSigns(null), null);
  assert.equal(text(healthSaid('missing', null, { faults: null, engine: null })), 'No copy last night.');
  /* A member the record refuses the faults to, or a read that dropped: the good parts, never "All healthy". */
  assert.equal(text(healthSaid('in', MONTH, { faults: null, engine: UP })), 'Slash’s model answered 3 hours ago, last night’s copy is in, and nothing runs out before 1 October.');
});

test('a missed copy after a fault is its own marked sentence', () => {
  const said = healthSaid('missing', MONTH, { faults: [MAIL] });
  assert.equal(text(said), 'One thing is not working: BrainDog could not send a mail. No copy last night, and nothing runs out before 1 October.');
  assert.deepEqual(needs(said), ['One thing is not working', 'No copy last night']);
});

test('every sign unread is said as unread, never all healthy', () => {
  const said = healthSaid('in', MONTH, { faults: [], signs: signs('none', 'none', 'none'), signsAt: '/p/health' });
  assert.equal(text(said), 'Last night’s copy is in, nothing runs out before 1 October, and nothing is broken. 3 vital signs have not been read yet.');
  assert.doesNotMatch(text(said), /healthy/u);
  assert.deepEqual(needs(said), [], 'unread is not wrong yet, so nothing is marked');
  assert.deepEqual(links(said), ['/p/health']);
  assert.equal(text(healthSaid(null, null, { signs: signs('none', 'none') })), '2 vital signs have not been read yet.');
  assert.equal(unreadSigns(signs('none', 'red', 'none')), 2);
  assert.equal(unreadSigns(null), null);
});

test('one green and the rest unread is never all healthy, and the unread are counted', () => {
  const said = healthSaid(null, null, { faults: [], signs: signs('green', 'none', 'none', 'none') });
  assert.equal(text(said), 'Nothing is broken. 3 vital signs have not been read yet.');
  assert.doesNotMatch(text(said), /healthy/u);
  assert.equal(text(healthSaid(null, null, { faults: [], signs: signs('green', 'none') })), 'Nothing is broken. One vital sign has not been read yet.');
});

test('one red with the rest unread: red leads and is marked, and the unread are said after it', () => {
  const said = healthSaid('in', null, { faults: [], signs: signs('red', 'none', 'none'), signsAt: '/p/health' });
  assert.equal(text(said), 'One vital sign needs a look. Last night’s copy is in. 2 vital signs have not been read yet.');
  assert.deepEqual(needs(said), ['One vital sign needs a look']);
  assert.deepEqual(links(said), ['/p/health', '/p/health']);
  assert.doesNotMatch(text(said), /healthy/u);
});
