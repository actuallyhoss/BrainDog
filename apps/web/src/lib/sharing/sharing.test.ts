/**
 * Settings > Sharing's lists, and what a guest is told (sharing plan slice 10): every share is drawn once, in Shared,
 * Waiting or Ended, grouped by who it is with and said by name, Stop asks in the house words, and the first-open line is
 * shown once a share.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { askedOf, SEE_AS_EVENT as SEE_AS_HEARD } from './see-as.svelte.ts';
import { sharesOf, stateOfShare } from './share-state.ts';
import { askSeeAs, askSheet, SEE_AS_EVENT, SHARED_EVENT, SHEET_EVENT, sharingSections, stateOf, stopWords, welcomeOf, welcomed, markWelcomed, type MyShare, type SharingRow } from './sharing.ts';

const NOW = Date.UTC(2026, 9, 20, 12);
const DAY = 86_400_000;
const at = (ms: number) => new Date(ms).toISOString();

let n = 0;
const row = (who: SharingRow['who'], who_name: string | null, more: Partial<SharingRow> = {}): SharingRow => ({
  id: `sh_${(n += 1)}`,
  sentence: `${who_name ?? who.id} can view tasks.`,
  effect: 'allow',
  who,
  who_name,
  subject: 'Kiln',
  what: { lists: ['tasks'] },
  can: 'view',
  caps: null,
  hide: null,
  when: { until: at(NOW + 30 * DAY) },
  parent_id: null,
  bundle: null,
  template: null,
  note: null,
  version: 1,
  made_by: 'p_1',
  made_at: at(NOW - DAY),
  ended_at: null,
  ...more,
});

test('each share is drawn once: live in Shared, an address in Waiting, stopped or run out in Ended', () => {
  const priya = { kind: 'person' as const, id: 'p_pri' };
  const live = row(priya, 'Priya');
  const waiting = row({ kind: 'email', id: 'lee@studio.co' }, 'lee@studio.co');
  const stopped = row(priya, 'Priya', { ended_at: at(NOW - 2 * DAY) });
  const ranOut = row(priya, 'Priya', { when: { until: at(NOW - DAY) } });
  const old = row(priya, 'Priya', { ended_at: at(NOW - 40 * DAY) });
  assert.equal(stateOf(live, NOW), 'live');
  assert.equal(stateOf(waiting, NOW), 'waiting');
  assert.equal(stateOf(stopped, NOW), 'ended');
  assert.equal(stateOf(ranOut, NOW), 'ended');

  const s = sharingSections([live, waiting, stopped, ranOut, old], NOW);
  assert.deepEqual(s.shared.map((b) => [b.name, b.rows.map((r) => r.id)]), [['Priya', [live.id]]]);
  assert.deepEqual(s.waiting.map((b) => [b.name, b.rows.map((r) => r.id)]), [['lee@studio.co', [waiting.id]]]);
  /* ENDED IS THE LAST 30 DAYS, the newest ended first: the one stopped 40 days ago is gone. */
  assert.deepEqual(s.ended.map((b) => b.rows.map((r) => r.id)), [[ranOut.id, stopped.id]]);
});

test('grouped by who it is with, groups first and then people, each by name and never by id', () => {
  const rows = [
    row({ kind: 'person', id: 'p_zed' }, 'Zed'),
    row({ kind: 'group', id: 'g_acc' }, 'Accountants'),
    row({ kind: 'person', id: 'p_ana' }, 'ana'),
    row({ kind: 'person', id: 'p_zed' }, 'Zed'),
    /* A PERSON THE RECORD CANNOT NAME IS SOMEONE, never their id. */
    row({ kind: 'person', id: 'p_01JZ8QK3F7R2M9V4XN6TCB5HAD' }, null),
  ];
  const { shared } = sharingSections(rows, NOW);
  assert.deepEqual(shared.map((b) => [b.kind, b.name, b.rows.length]), [
    ['group', 'Accountants', 1],
    ['person', 'ana', 1],
    ['person', 'Someone', 1],
    ['person', 'Zed', 2],
  ]);
  assert.ok(shared.every((b) => !b.name.includes('p_')), 'an id was drawn as a name');
});

test('Stop asks and answers in the house words (§3.5)', () => {
  const said = stopWords(row({ kind: 'person', id: 'p_pri' }, 'Priya'));
  assert.equal(said.ask, 'Stop sharing Kiln with Priya?');
  assert.equal(said.done, "Stopped. Priya can't see Kiln now.");
  assert.ok(![said.ask, said.done, said.label].some((t) => t.includes('—')), 'a long dash');
});

test('tapping a share asks the Share sheet by an event, with the share to change', () => {
  const sent: Event[] = [];
  const target = { dispatchEvent: (e: Event) => (sent.push(e), true) };
  const r = row({ kind: 'person', id: 'p_pri' }, 'Priya');
  assert.equal(askSheet({ share: r }, target), true);
  assert.equal(sent[0]?.type, SHEET_EVENT);
  assert.equal((sent[0] as CustomEvent<{ share: SharingRow }>).detail.share.id, r.id);
  assert.equal(askSheet({}, null), false, 'with no window there is nobody to ask');
});

test('See as from the page is the ask See as listens for, by the same name and the same shape', () => {
  const sent: Event[] = [];
  const target = { dispatchEvent: (e: Event) => (sent.push(e), true) };
  assert.equal(SEE_AS_EVENT, SEE_AS_HEARD);
  assert.equal(SHARED_EVENT, 'braindog:shared');
  assert.equal(askSeeAs({ person: 'p_pri', name: 'Priya' }, target), true);
  assert.equal(sent[0]?.type, SEE_AS_HEARD);
  assert.deepEqual(askedOf((sent[0] as CustomEvent<unknown>).detail), { id: 'p_pri', name: 'Priya' });
  assert.equal(askedOf({ person: '', name: 'Priya' }), null);
  assert.equal(askedOf(undefined), null);
});

test('a share tapped opens the sheet on what it holds, and saving it sends the same share back', () => {
  const r = {
    ...row({ kind: 'person', id: 'p_pri' }, 'Priya'),
    what: { lists: ['tasks'] },
    can: 'edit' as const,
    caps: { delete: false },
    hide: { tasks: ['rate'] },
    when: { until: '2099-12-01T23:59:59.000Z' },
  };
  const subject = { kind: 'held' as const, id: r.id, target: { lists: ['tasks'] }, name: 'Tasks' };
  const s = stateOfShare(r, subject);
  assert.deepEqual(s.with, { kind: 'person', id: 'p_pri', name: 'Priya' });
  assert.equal(s.can, 'edit');
  assert.equal(s.remove, false);
  assert.deepEqual(s.until, { kind: 'day', day: '2099-12-01' });
  const decls = { tasks: { name: 'Tasks', fields: [{ id: 'rate', type: 'money' }] } };
  assert.deepEqual(sharesOf(s, subject, Date.parse('2099-01-01'), decls), [
    { effect: 'allow', who: { kind: 'person', id: 'p_pri' }, what: { lists: ['tasks'] }, can: 'edit', caps: { delete: false }, hide: { tasks: ['rate'] }, when: { until: '2099-12-01T23:59:59.000Z' } },
  ]);
  /* A NEW SHARE FROM THE PAGE is of the whole record, or one list. */
  const rec = { kind: 'record' as const, name: 'this record' };
  const fresh = { ...stateOfShare(r, rec), what: { kind: 'all' as const } };
  assert.deepEqual(sharesOf(fresh, rec, Date.parse('2099-01-01'), decls)[0]?.what, { record: true });
  assert.deepEqual(sharesOf({ ...fresh, what: { kind: 'list', list: 'tasks' } }, rec, Date.parse('2099-01-01'), decls)[0]?.what, { lists: ['tasks'] });
});

test('the first-open line is shown once a share, the newest live one first', () => {
  const mine = (id: string, live = true): MyShare => ({ id, sentence: '', can: 'edit', until: null, onward: false, live, by: 'Ada', welcome: `Ada shared ${id} with you.` });
  const store = new Map<string, string>();
  const strings = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const all = [mine('a'), mine('b'), mine('c', false)];
  assert.equal(welcomeOf(all, welcomed('rec', strings))?.id, 'b');
  markWelcomed('rec', 'b', strings);
  assert.equal(welcomeOf(all, welcomed('rec', strings))?.id, 'a');
  markWelcomed('rec', 'a', strings);
  assert.equal(welcomeOf(all, welcomed('rec', strings)), null, 'an ended share was welcomed');
  /* ANOTHER RECORD IS ITS OWN LIST. */
  assert.equal(welcomeOf(all, welcomed('other', strings))?.id, 'b');
});
