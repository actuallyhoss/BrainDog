/**
 * The sentence under Settings' title: what it says from the faults, the engine, the vital signs, the copies and the
 * month's usage, that what is broken leads, and that it says nothing it did not read.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { aboutCopies, dayAgo, nightFailed, nightReason, daysLeft, engineLines, healthSaid, lastCopy, leadFault, modelName, nearest, plainSign, redSigns, unreadSigns, type Engine, type Fault, type Part, type Sign } from './health.ts';

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

/* ── The lines under Slash's sentence, said in Settings > Agents: who answered, the provider's words, a second model ── */

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
  assert.deepEqual(engineLines(twice, NOON), ['Needed a second model for 2 of 40 questions.']);
  assert.deepEqual(engineLines(withHealth('answering', { doubleShare: 0, doubleOf: { twice: 0, asks: 40 } }), NOON), []);
  assert.deepEqual(engineLines(withHealth('answering', { doubleShare: 1, doubleOf: { twice: 1, asks: 1 } }), NOON), ['Needed a second model for 1 of 1 question.']);
});

test('all three lines together, in order, and nothing at all from an older host or with no model', () => {
  const all = withHealth('not_answering', {
    answeredBy: { model: 'quill-2', at: local(9, 12) },
    lastWords: 'Upstream timed out.',
    doubleShare: 0.25,
    doubleOf: { twice: 1, asks: 4 },
  });
  assert.deepEqual(engineLines(all, NOON), ['Answered by quill-2 2 days ago.', 'The provider said: Upstream timed out.', 'Needed a second model for 1 of 4 questions.']);
  assert.deepEqual(engineLines(engine('not_answering', 'Slash’s model is not answering.'), NOON), [], 'an older host hands none of the fields');
  assert.deepEqual(engineLines(withHealth('off', { answeredBy: { model: 'quill-2', at: local(9, 14) } }), NOON), []);
  assert.deepEqual(engineLines(null, NOON), []);
  for (const line of engineLines(all, NOON)) assert.ok(!line.includes('—'), 'no em dash');
});

/* ── THE ONE SENTENCE: the worst thing, or nothing ─────────────────────────────────────────────────────────── */

test('THE WORST THING ONLY: a fault before a red check, before a missed night, before a meter, and one sentence each', () => {
  const all = healthSaid('missing', { ...MONTH, near: { key: 'runs', share: 0.914 } }, { faults: [MAIL, PAIRS], engine: DOWN, signs: signs('red', 'red'), signsAt: '/p/health' });
  assert.equal(text(all), 'BrainDog could not check for people who are here twice.');
  assert.deepEqual(needs(all), ['BrainDog could not check for people who are here twice.']);
  assert.equal(leadFault([MAIL, PAIRS])?.cause, 'outbox#infer.resolve');
  assert.equal(leadFault([]), null);
  assert.equal(text(healthSaid('missing', MONTH, { faults: [], signs: signs('red', 'red'), signsAt: '/p/health' })), 'One check needs a look. Open Health');
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
  assert.equal(text(healthSaid(null, null, { signs: named, signsAt: '/p/health' })), 'Last night’s copy did not run. Open Health');
  assert.deepEqual(needs(healthSaid(null, null, { signs: named })), ['Last night’s copy did not run.']);
  const backup: Sign = { sign: 'questions', state: 'red', said: 'Something went wrong, not a choice for you: The backup on 3 Sep did not run.' };
  const said = healthSaid(null, null, { signs: [backup], signsAt: '/p/health', backupsAt: '/settings/backups' });
  assert.equal(text(said), 'The backup on 3 Sep did not run. Backups');
  assert.deepEqual(links(said), ['/settings/backups']);
  assert.deepEqual(links(healthSaid('missing', null, { backupsAt: '/settings/backups' })), ['/settings/backups']);
  assert.deepEqual(links(healthSaid('in', null, { signs: signs('red'), signsAt: '/p/health', backupsAt: '/settings/backups' })), ['/p/health']);
  /* AJ3: a failure headed by its own words says them, not the follow-on, and opens its question. */
  const headed: Sign = { sign: 'questions', state: 'red', name: 'The backup on 3 Sep did not run', said: 'It waits on you in Needs you, with “Run it now” suggested.', to: '/decide/q1' };
  const lead = healthSaid(null, null, { signs: [headed], signsAt: '/p/health', backupsAt: '/settings/backups' });
  assert.equal(text(lead), 'The backup on 3 Sep did not run. Open it in Needs you');
  assert.deepEqual(links(lead), ['/decide/q1']);
  assert.equal(plainSign('Something went wrong, not a choice for you: The mail did not send.'), 'The mail did not send.');
  assert.ok(aboutCopies('The backup on 3 Sep did not run') && !aboutCopies('The mail did not send'));
  for (const one of [said, healthSaid(null, null, { faults: [PAIRS] })]) assert.doesNotMatch(text(one), /vital sign|and \d+ more|model/u);
});

/* A FAILED NIGHT, PLANTED AS THE KERNEL KEEPS ONE (`copyFailed`): a fault under `night#export.night`, never a question. */
const NIGHT: Fault = {
  cause: 'night#export.night',
  said: 'BrainDog could not save its nightly copy. It tries again tonight.',
  count: 3,
  since: '2026-09-27T03:17:00Z',
  last: '2026-09-29T03:17:00Z',
};

test('BACKUPS SAYS WHY A NIGHT FAILED, in plain words, with how long it has been failing', () => {
  /* ON THE CLOUD NO ERROR REACHES THE READER: the reason is that it is ours to fix, and it was told. */
  assert.deepEqual(nightFailed([PAIRS, NIGHT], NOW), {
    said: 'BrainDog could not save its nightly copy.',
    why: 'We were told when it failed, and fixing it is ours. It has failed 3 times, first 2 days ago, last today.',
  });
  /* ON A SELF-HOST THE OWNER'S ERROR IS READ FOR ITS REASON, AND NEVER SAID: no path, key or byte count. */
  const self = nightFailed([{ ...NIGHT, count: 1, since: NIGHT.last, error: 'the dump ended 12 bytes short of the 4096 it counted' }], NOW);
  assert.equal(self?.why, 'The copy came out incomplete, so it was not kept. It failed today.');
  const reasons: [string, string][] = [
    ['The nightly copy did not run: this deployment has no BLOBS binding, so there is nowhere to put one.', 'This server has no place set up to keep copies.'],
    ['the record would not export: schema refused', 'Your BrainDog could not be read out for the copy.'],
    ['Durable Object is overloaded', 'Your BrainDog was too busy to be copied at the time.'],
    ['ENOSPC at /var/lib/braindog/snapshots/the-studio', 'Something went wrong while it was being saved.'],
  ];
  for (const [error, said] of reasons) {
    assert.equal(nightReason(error), said);
    assert.doesNotMatch(said, /[#`{}/\\]|\d/u);
  }
  /* THE RECORD'S OWN PLAIN REASON COMES FIRST, on every host (`why`, the kernel's `nightWhy`), so the Cloud says it too. */
  const told = nightFailed([{ ...NIGHT, count: 1, since: NIGHT.last, why: 'Your BrainDog was too large to copy in one piece.' }], NOW);
  assert.equal(told?.why, 'Your BrainDog was too large to copy in one piece. It failed today.');
  /* NO NIGHT FAULT, NO LINE: any other fault is the index's to say, not Backups'. */
  assert.equal(nightFailed([PAIRS, MAIL], NOW), null);
  assert.equal(nightFailed(null, NOW), null);
  /* AND BACKUPS DRAWS IT, first in what is kept, from the owner's read of the faults. */
  const backups = readFileSync(new URL('./areas/Backups.svelte', import.meta.url), 'utf8');
  assert.match(backups, /nightFailed\(nightFaults, Date\.now\(\)\)/u);
  assert.match(backups, /call<\{ faults: Fault\[\] \}>\('faults'\)/u);
  assert.match(backups, /<StateRow [^>]*title=\{failedNight\.said\} line=\{failedNight\.why\}/u);
});

test('AN OLD EXCHANGE RATE LINKS TO THE SWITCH THAT KEEPS RATES CURRENT', async () => {
  const { healthSaid } = await import('./health.ts');
  const parts = healthSaid('ok' as never, {} as never, { signs: [{ sign: 'rate-age', state: 'red', said: 'The newest exchange rate is 28 days old. A feed would keep them current.' }], signsAt: '/p/health' });
  assert.deepEqual(parts?.at(-1), { text: 'Keep rates current', href: '/plugins/money-core#keep-rates' });
});
