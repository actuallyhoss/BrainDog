/**
 * The sentence under Settings' title: what it says from the faults, the engine, the vital signs, the copies and the
 * month's usage, that what is broken leads, and that it says nothing it did not read.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aboutCopies, dayAgo, daysLeft, engineLines, healthSaid, lastCopy, leadFault, modelName, nearest, plainSign, redSigns, unreadSigns, type Engine, type Fault, type Part, type Sign } from './health.ts';

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

/* ── The lines under Slash's sentence (ENG-A05, ENG-A06), said in Settings > Agents: who answered, the provider's words, a second model ── */

/** Noon on 14 October in the reader's own zone, so "today" and "yesterday" are the reader's days wherever this runs. */
const NOON = new Date(2026, 9, 14, 12).getTime();
const local = (month: number, day: number, hour = 9): string => new Date(2026, month, day, hour).toISOString();
const withHealth = (state: Engine['health']['state'], more: Partial<Engine['health']>): Engine => ({ health: { state, ...more }, said: { text: '', whose: null } });

test('the model that answered last is named, by its own name and the reader’s day, never a timestamp or a path', () => {
  const e = withHealth('answering', { answeredBy: { model: '@cf/acme-labs/quill-2-fast', at: local(9, 14) } });
  assert.deepEqual(engineLines(e, NOON), ['Answered by quill-2-fast today.']);
  assert.deepEqual(engineLines(withHealth('answering', { answeredBy: { model: 'quill-2', at: local(9, 13, 23) } }), NOON), ['Answered by quill-2 yesterday.']);
  assert.equal(dayAgo(local(9, 9), NOON), '5 days ago');
  assert.equal(dayAgo(local(7, 2), NOON), 'on 2 Aug');
  assert.equal(modelName('@cf/acme-labs/quill-2-fast'), 'quill-2-fast');
  assert.ok(!engineLines(e, NOON).join(' ').match(/\d{4}-\d{2}-\d{2}|T\d{2}:|\//), 'no timestamp and no path');
});

test('under a failure the provider’s own words are said as the provider’s, and only under a failure', () => {
  const words = 'Daily request limit reached for this account.';
  assert.deepEqual(engineLines(withHealth('not_answering', { lastWords: words }), NOON), [`The provider said: ${words}`]);
  assert.deepEqual(engineLines(withHealth('key_closed', { lastWords: 'Invalid credentials.' }), NOON), ['Your key’s provider said: Invalid credentials.']);
  /* A failure the engine has recovered from is not one going on. */
  assert.deepEqual(engineLines(withHealth('answering', { lastWords: words }), NOON), []);
});

test('a second model is said with its counts once one was needed, and never at none', () => {
  const twice = withHealth('answering', { doubleShare: 0.05, doubleOf: { twice: 2, asks: 40 } });
  assert.deepEqual(engineLines(twice, NOON), ['Needed a second model for 2 of 40 asks.']);
  assert.deepEqual(engineLines(withHealth('answering', { doubleShare: 0, doubleOf: { twice: 0, asks: 40 } }), NOON), []);
  assert.deepEqual(engineLines(withHealth('answering', { doubleShare: 1, doubleOf: { twice: 1, asks: 1 } }), NOON), ['Needed a second model for 1 of 1 ask.']);
});

test('all three lines together, in order, and nothing at all from an older host or with no model', () => {
  const all = withHealth('not_answering', {
    answeredBy: { model: 'quill-2', at: local(9, 12) },
    lastWords: 'Upstream timed out.',
    doubleShare: 0.25,
    doubleOf: { twice: 1, asks: 4 },
  });
  assert.deepEqual(engineLines(all, NOON), ['Answered by quill-2 2 days ago.', 'The provider said: Upstream timed out.', 'Needed a second model for 1 of 4 asks.']);
  assert.deepEqual(engineLines(engine('not_answering', 'Slash’s model is not answering.'), NOON), [], 'an older host hands none of the fields');
  assert.deepEqual(engineLines(withHealth('off', { answeredBy: { model: 'quill-2', at: local(9, 14) } }), NOON), []);
  assert.deepEqual(engineLines(null, NOON), []);
  for (const line of engineLines(all, NOON)) assert.ok(!line.includes('—'), 'no em dash');
});

/* ── THE ONE SENTENCE (U-C7): the worst thing, or nothing ─────────────────────────────────────────────────────────── */

test('THE WORST THING ONLY: a fault before a red check, before a missed night, before a meter, and one sentence each', () => {
  const all = healthSaid('missing', { ...MONTH, near: { key: 'runs', share: 0.914 } }, { faults: [MAIL, PAIRS], engine: DOWN, signs: signs('red', 'red'), signsAt: '/p/health' });
  assert.equal(text(all), 'BrainDog could not check for people who are here twice.');
  assert.deepEqual(needs(all), ['BrainDog could not check for people who are here twice.']);
  assert.equal(leadFault([MAIL, PAIRS])?.cause, 'outbox#infer.resolve');
  assert.equal(leadFault([]), null);
  assert.equal(text(healthSaid('missing', MONTH, { faults: [], signs: signs('red', 'red'), signsAt: '/p/health' })), 'One check needs a look. Look');
  assert.equal(text(healthSaid('missing', { ...MONTH, near: { key: 'runs', share: 0.914 } }, { faults: [] })), 'No copy last night.');
  assert.equal(text(healthSaid('in', { ...MONTH, near: { key: 'runs', share: 0.914 } }, { faults: [] })), 'Runs are at 91%, 2 days to go.');
  assert.equal(text(healthSaid('in', { ...MONTH, near: { key: 'bytes', share: 1 } })), 'Fetched data is used up until 1 October.');
});

test('NOTHING WRONG IS NO LINE, and the model is never said here, up or down', () => {
  assert.equal(healthSaid('in', MONTH, { faults: [], engine: UP, signs: signs('green', 'none', 'none') }), null);
  assert.equal(healthSaid('in', MONTH, { faults: [], engine: DOWN }), null);
  assert.equal(healthSaid(null, null), null);
  assert.equal(healthSaid(null, null, { faults: null, engine: null, signs: null }), null);
  assert.equal(redSigns(signs('red', 'none', 'red')), 2);
  assert.equal(redSigns(null), null);
  assert.equal(unreadSigns(signs('none', 'red', 'none')), 2);
  assert.equal(unreadSigns(null), null);
});

test('A RED CHECK IS NAMED BY ITS OWN SENTENCE, with no count of the rest, and one about a copy links to Backups', () => {
  const named: Sign[] = [
    { sign: 'copies', state: 'red', said: 'Last night’s copy did not run.' },
    { sign: 'runs', state: 'red', said: 'A run stopped.' },
  ];
  assert.equal(text(healthSaid(null, null, { signs: named, signsAt: '/p/health' })), 'Last night’s copy did not run. Look');
  assert.deepEqual(needs(healthSaid(null, null, { signs: named })), ['Last night’s copy did not run.']);
  const backup: Sign = { sign: 'questions', state: 'red', said: 'Something went wrong, not a choice for you: The backup on 3 Sep did not run.' };
  const said = healthSaid(null, null, { signs: [backup], signsAt: '/p/health', backupsAt: '/settings/backups' });
  assert.equal(text(said), 'The backup on 3 Sep did not run. Backups');
  assert.deepEqual(links(said), ['/settings/backups']);
  assert.deepEqual(links(healthSaid('missing', null, { backupsAt: '/settings/backups' })), ['/settings/backups']);
  assert.deepEqual(links(healthSaid('in', null, { signs: signs('red'), signsAt: '/p/health', backupsAt: '/settings/backups' })), ['/p/health']);
  assert.equal(plainSign('Something went wrong, not a choice for you: The mail did not send.'), 'The mail did not send.');
  assert.ok(aboutCopies('The backup on 3 Sep did not run') && !aboutCopies('The mail did not send'));
  for (const one of [said, healthSaid(null, null, { faults: [PAIRS] })]) assert.doesNotMatch(text(one), /vital sign|and \d+ more|model/u);
});
