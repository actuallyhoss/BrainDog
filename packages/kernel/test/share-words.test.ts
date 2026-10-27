/**
 * A share as one plain sentence: the plan's own sentences, names never ids, no em dashes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Share, Target } from '../src/lens.ts';
import { dayOf, sentenceOf, type ShareNames } from '../src/share-words.ts';
import { SHARE_TEMPLATES } from '../src/share-templates.ts';

const NOW = Date.UTC(2026, 9, 20, 12); // Tuesday 20 Oct 2026
const DAY = 86_400_000;
const at = (ms: number) => new Date(ms).toISOString();
const opts = { now: NOW };

const NAMES: ShareNames = {
  person: (id) => ({ p_priya: 'Priya', p_sam: 'Sam', p_lee: 'Lee', p_ana: 'Ana', p_omar: 'Omar' })[id],
  group: (id) => (id === 'g_acc' ? { name: 'Accountants', people: 2 } : id === 'g_one' ? { name: 'Night shift', people: 1 } : undefined),
  list: (id) => ({ tasks: 'tasks', notes: 'notes', bills: 'bills', payroll: 'Payroll' })[id],
  project: (id) => (id === 'r_kiln' ? 'Kiln' : undefined),
  row: (list, id) => (list === 'tasks' && id === 'r_42' ? 'Task 42' : undefined),
  view: (id) => (id === 'v_review' ? 'Review' : undefined),
};

const share = (who: string, what: Target, more: Partial<Share> = {}): Share => ({
  effect: 'allow',
  who: who.startsWith('g_') ? { kind: 'group', id: who } : { kind: 'person', id: who },
  what,
  can: 'view',
  ...more,
});
const say = (s: Share | Share[]) => sentenceOf(s, NAMES, opts);

test('THE PLAN SAYS THESE, and the sheet says them the same way', () => {
  assert.equal(say(share('p_priya', { project: 'r_kiln', lists: ['tasks'] }, { can: 'edit', when: { until: '2026-12-01T12:00:00.000Z' } })), 'Priya can edit tasks in Kiln until 1 Dec.');
  assert.equal(say(share('g_acc', { lists: { has: 'money' } })), 'Accountants (2 people) can view money lists.');
  assert.equal(
    say([share('p_lee', { record: true }, { can: 'edit' }), share('p_lee', { lists: { has: 'money' } }, { effect: 'deny' }), share('p_lee', { lists: { role: 'keys' } }, { effect: 'deny' })]),
    'Lee can edit everything except money and keys.',
  );
  assert.equal(
    say(share('p_ana', { list: 'tasks', where: { field: 'state', is: 'open' }, view: 'v_review' }, { can: 'comment', when: { hours: { days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' } } })),
    'Ana can comment on tasks in Review on weekdays 9 to 6.',
  );
  assert.equal(say(share('p_omar', { list: 'tasks', rows: ['r_42'] }, { when: { once: true } })), 'Omar can view Task 42 once, for a day.');
  assert.equal(say(share('p_priya', { lists: ['payroll'] }, { effect: 'deny' })), "Priya can't see Payroll.");
});

test('THE TEMPLATES, filled in as the sheet fills them, read as the plan writes them', () => {
  const t = (id: string) => SHARE_TEMPLATES.find((x) => x.id === id)!;
  const fill = (v: unknown): unknown =>
    v === '$project' ? 'r_kiln' : v === '$list' ? 'tasks' : v === '$row' ? 'r_42' : v === '$where' ? { field: 'state', is: 'open' }
      : Array.isArray(v) ? v.map(fill) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
  const made = (id: string, who: string, extra: (r: Record<string, unknown>) => Record<string, unknown> = (r) => r, days = t(id).days) =>
    t(id).rows.map((r) => extra({ ...r, who: { kind: 'person', id: who }, what: fill(r.what), ...(days ? { when: { until: at(NOW + days * DAY) } } : {}) })) as unknown as Share[];

  assert.equal(say(made('accountant', 'p_priya')), 'Priya can view money lists until 18 Jan. No keys.');
  assert.equal(say(made('contractor', 'p_sam')), 'Sam can edit everything in Kiln until 19 Nov. No money.');
  assert.equal(say(made('assistant', 'p_lee')), 'Lee can edit everything except money and keys.');
  assert.equal(say(made('reviewer', 'p_ana', (r) => ({ ...r, what: { ...(r.what as object), view: 'v_review' } }))), 'Ana can comment on tasks in Review until 3 Nov.');
  assert.equal(say(made('one-row', 'p_omar', (r) => r, 6)), 'Omar can view Task 42 until Monday.');
  assert.equal(say(made('one-row', 'p_omar')), 'Omar can view Task 42 until 27 Oct.');
});

test('days are said as a person says them', () => {
  assert.equal(dayOf(at(NOW + 2 * 3600_000), opts), 'today');
  assert.equal(dayOf(at(NOW + DAY), opts), 'tomorrow');
  assert.equal(dayOf(at(NOW + 4 * DAY), opts), 'Saturday');
  assert.equal(dayOf(at(NOW + 7 * DAY), opts), '27 Oct');
  assert.equal(dayOf(at(NOW + 90 * DAY), opts), '18 Jan');
  assert.equal(dayOf(at(NOW + 400 * DAY), opts), '24 Nov 2027');
  assert.equal(dayOf('2026-10-20T23:30:00.000Z', { now: NOW, tz: 'Europe/London' }), 'tomorrow', 'half past midnight in London');
});

test('the rest of the grammar: groups of one, emails, links, several lists, starts, hours, adding', () => {
  assert.equal(say(share('g_one', { lists: ['tasks', 'notes', 'bills'] })), 'Night shift (1 person) can view tasks, notes and bills.');
  assert.equal(say({ ...share('p_x', { record: true }), who: { kind: 'email', id: 'ana@example.com' } }), 'ana@example.com can view everything.');
  assert.equal(say({ ...share('p_x', { record: true }), who: { kind: 'link', id: 'l_1' } }), 'Anyone with the link can view everything.');
  assert.equal(say(share('p_sam', { project: 'r_kiln' }, { when: { from: at(NOW + 2 * DAY) } })), 'Sam can view everything in Kiln from Thursday.');
  assert.equal(say(share('p_sam', { lists: ['tasks'] }, { caps: { create: true } })), 'Sam can view and add to tasks.');
  assert.equal(say(share('p_sam', { lists: ['tasks'] }, { can: 'manage', when: { hours: { days: [0, 6], from: '10:30', to: '14:00' } } })), 'Sam can manage tasks at weekends 10:30 to 2.');
  assert.equal(say(share('p_sam', { lists: ['tasks'] }, { when: { hours: { days: [5, 1, 3], from: '08:00', to: '12:00' } } })), 'Sam can view tasks on Mon, Wed and Fri 8 to 12.');
  assert.equal(say(share('p_sam', { list: 'tasks', rows: ['r_1', 'r_2', 'r_3'] })), 'Sam can view 3 tasks.');
  assert.equal(say(share('p_sam', { list: 'tasks', where: { field: 'state', is: 'open' } })), 'Sam can view some tasks.');
  assert.equal(say([share('p_sam', { lists: ['tasks'] }, { effect: 'deny' }), share('p_sam', { lists: ['notes'] }, { effect: 'deny' })]), "Sam can't see tasks or notes.");
  assert.equal(say([]), 'Nothing is shared.');
});

test('NAMES, NEVER IDS, and no em dash, whatever the namer knows', () => {
  const ids = ['p_who', 'g_who', 'ghost', 'r_who', 'r_row', 'v_who'];
  const targets: Target[] = [
    { record: true },
    { lists: ['ghost'] },
    { lists: { role: 'meets' } },
    { project: 'r_who' },
    { project: 'r_who', lists: ['ghost'] },
    { list: 'ghost', rows: ['r_row'] },
    { list: 'ghost', where: { field: 'x', is: 'r_row' }, view: 'v_who' },
  ];
  for (const who of ['p_who', 'g_who'])
    for (const what of targets)
      for (const effect of ['allow', 'deny'] as const) {
        const s = sentenceOf(share(who, what, { effect, when: { until: at(NOW + 30 * DAY) } }), {}, opts);
        for (const id of ids) assert.ok(!s.includes(id), `${s} says ${id}`);
        assert.doesNotMatch(s, /\u2014|\u2013/, s);
        assert.match(s, /^[A-Z].*\.$/, s);
        assert.ok(s.length <= 120, `${s} is long for a phone`);
      }
});
