/**
 * A page the owner changed takes the words an update changed, and nothing else (`reworded.ts`, UP1). Invented pages only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { relisted, reworded } from '../src/reworded.ts';

const note = (body: string) => ({ kind: 'note', body });
const table = (heading: string, empty: string) => ({ kind: 'table', heading, empty, source: 'register.put_by', columns: [{ field: 'what', label: 'What' }] });

const START = { page: 'goals', title: 'Goals', blocks: [note('{{saved}} put by so far'), table('Put by lately', 'Nothing put by yet.')] };
const NEXT = { page: 'goals', title: 'Goals', blocks: [note('{{saved}} saved so far'), { kind: 'capture', heading: 'Add a goal', register: 'goals' }, table('Saved lately', 'Nothing saved yet.')] };

test('a page with its blocks moved takes the new words and keeps its order', () => {
  const mine = { ...START, blocks: [START.blocks[1]!, START.blocks[0]!] };
  assert.deepEqual(reworded(START, mine, NEXT)?.body, { ...START, blocks: [table('Saved lately', 'Nothing saved yet.'), note('{{saved}} saved so far')] });
});

test('a word the owner typed stays theirs', () => {
  const mine = { ...START, blocks: [START.blocks[0]!, table('My savings', 'Nothing put by yet.')] };
  assert.deepEqual(reworded(START, mine, NEXT), { body: { ...START, blocks: [note('{{saved}} saved so far'), table('My savings', 'Nothing saved yet.')] }, words: ['{{saved}} saved so far', 'Nothing saved yet.'] });
});

test('nothing but words moves: an id or a list read is never changed, and no word to carry is null', () => {
  const next = { ...START, blocks: [START.blocks[0]!, { ...table('Put by lately', 'Nothing put by yet.'), source: 'register.saved' }] };
  assert.equal(reworded(START, START, next), null);
  assert.equal(reworded(START, { ...START, blocks: [note('Mine'), table('Mine too', 'Mine as well')] }, NEXT), null);
});

/* RH2: BY PLACE, NEVER BY TEXT. People's pages have two "Name" columns; an update renaming one renamed both. */
const people = (a: string, b: string, heading = 'Everyone') => ({
  page: 'people',
  title: 'People',
  blocks: [
    { kind: 'table', heading, source: 'register.people', columns: [{ field: 'name', label: a }, { field: 'role', label: 'Role' }] },
    { kind: 'table', heading: 'Teams', source: 'register.teams', columns: [{ field: 'name', label: b }] },
  ],
});

test('one Name the update renames and one it keeps: only the renamed one changes', () => {
  const start = people('Name', 'Name');
  const next = people('Who', 'Name');
  const mine = { ...start, blocks: [start.blocks[1]!, start.blocks[0]!] };
  assert.deepEqual(reworded(start, mine, next)?.body, { ...start, blocks: [start.blocks[1]!, people('Who', 'Name').blocks[0]!] });
});

test('a word he typed that equals the old word somewhere else is his, and stays', () => {
  const start = people('Cycle', 'Name');
  const next = people('Sprint', 'Name');
  const mine = { ...start, blocks: [...start.blocks, note('Cycle')], title: 'Cycle' };
  const out = reworded(start, mine, next)?.body as { title: string; blocks: { columns?: { label: string }[] }[] };
  assert.equal(out.title, 'Cycle');
  assert.deepEqual(out.blocks[2], note('Cycle'));
  assert.equal(out.blocks[0]!.columns![0]!.label, 'Sprint');
});

/* RH8: WHERE THE UPDATE PUTS THE PAGE ON THE RAIL carries as its words do, only where the page still has the old place. */
test('a page still at the pack’s old place on the rail takes the new one, and one he moved stays', () => {
  const start = { ...START, nav: { section: 'Dashboard', order: 10, place: 20 } };
  const next = { ...START, nav: { section: 'Dashboard', order: 10, place: 70 } };
  const moved = { ...start, blocks: [START.blocks[1]!, START.blocks[0]!] };
  assert.deepEqual(reworded(start, moved, next), { body: { ...moved, nav: { section: 'Dashboard', order: 10, place: 70 } }, words: [], rail: true });
  assert.equal(reworded(start, { ...moved, nav: { section: 'Dashboard', order: 10, place: 5 } }, next), null);
});

/* RH3: A LIST CHANGED ONLY IN WORDS. */
const LIST = { register: 'cycles', name: 'Cycles', one: 'cycle', title: 'name', fields: [{ id: 'name', label: 'Cycle', type: 'text' }, { id: 'state', label: 'Status', type: 'enum', values: ['open', 'done'], labels: { open: 'Open', done: 'Done' } }] };
const SPRINTS = { ...LIST, name: 'Sprints', one: 'sprint', fields: [{ ...LIST.fields[0]!, label: 'Sprint' }, LIST.fields[1]!] };

test('a list he renamed takes the field label the update changed, and keeps his name', () => {
  const mine = { ...LIST, name: 'Our cycles', fields: [...LIST.fields, { id: 'goal', label: 'Goal', type: 'text' }] };
  assert.deepEqual(relisted(LIST, mine, SPRINTS), { body: { ...mine, one: 'sprint', fields: [{ ...LIST.fields[0]!, label: 'Sprint' }, LIST.fields[1]!, mine.fields[2]!] }, words: ['sprint', 'Sprint'] });
});

test('an update that changes more of a list than its words is not carried, and title is never a word', () => {
  assert.equal(relisted(LIST, LIST, { ...SPRINTS, fields: [...SPRINTS.fields, { id: 'ends', type: 'day' }] }), null);
  assert.equal(relisted(LIST, LIST, { ...LIST, title: 'state' }), null);
  assert.deepEqual(relisted(LIST, { ...LIST, name: 'Mine', one: 'mine', fields: [{ ...LIST.fields[0]!, label: 'Mine' }, LIST.fields[1]!] }, SPRINTS), { body: null, words: [] });
});

/*
 * RJ1: LOOK-ALIKE PARTS ARE LINED UP BY WHICH PART EACH IS, NEVER BY POSITION, AND A LINK'S TARGET IS NEVER A WORD.
 * The link block names itself (`key`), so it is the same block whatever its rows; its rows are the look-alikes.
 */
const row = (words: string, to: string, says: string) => ({ cells: [words, to, says] });
const SEND = row('Send numbers from a project', '/automations?new=door', 'A project posts each number here');
const WATCH = row('Watch a number', '/automations?new=action', 'BrainDog asks an address for one number');
const LIVE = row('Watch a live number', '/packs/browse?q=polls', 'Add-ons that read a live number for you');
const CONNECT = row('Connect a bank', '/settings/connections', 'Your bank sends its numbers each day');
const home = (heading: string, rows: { cells: string[] }[]) => ({
  page: 'home',
  title: 'Founder overview',
  blocks: [note('{{runway}} of runway'), { kind: 'link', key: 'bring-in', heading, icon: 'send', authored: rows }],
});
const arranged = (page: ReturnType<typeof home>) => ({ ...page, blocks: [page.blocks[1]!, page.blocks[0]!] });
const rowsOf = (body: unknown) => ((body as { blocks: { authored?: unknown }[] }).blocks[0] as { authored?: unknown }).authored;

test('an update that drops a row leaves each of his rows its own words and its own link', () => {
  const start = home('Bring your numbers in', [SEND, WATCH, LIVE]);
  const out = reworded(start, arranged(start), home('Bring your figures in', [SEND, LIVE]));
  assert.deepEqual(rowsOf(out?.body), [SEND, WATCH, LIVE]);
  assert.deepEqual(out?.words, ['Bring your figures in']);
});

test('an update that puts a row first leaves every row of his as it was', () => {
  const start = home('Bring your numbers in', [SEND, WATCH, LIVE]);
  const out = reworded(start, arranged(start), home('Bring your figures in', [CONNECT, SEND, WATCH, LIVE]));
  assert.deepEqual(rowsOf(out?.body), [SEND, WATCH, LIVE]);
});

test('look-alike rows with nothing to tell them apart are left alone when the update rewords and drops one', () => {
  const plain = (a: string) => ({ cells: [a, 'and', 'more'] });
  const start = home('Bring your numbers in', [plain('One'), plain('Two'), plain('Three')]);
  assert.equal(reworded(start, arranged(start), home('Bring your numbers in', [plain('Uno'), plain('Three')])), null);
  const out = reworded(start, arranged(start), home('Bring your figures in', [plain('Two'), plain('Three'), plain('Four')]));
  assert.deepEqual(rowsOf(out?.body), [plain('One'), plain('Two'), plain('Three')]);
});

test('a row the update reworded in place takes its words, and a link target is never carried', () => {
  const start = home('Bring your numbers in', [SEND, WATCH]);
  const asked = row('Ask for a number', '/automations?new=action', 'BrainDog asks an address for one number');
  assert.deepEqual(rowsOf(reworded(start, arranged(start), home('Bring your numbers in', [SEND, asked]))?.body), [SEND, asked]);
  const elsewhere = row('Watch a number', '/automations?new=watch', 'BrainDog asks an address for one number');
  assert.equal(reworded(start, arranged(start), home('Bring your numbers in', [SEND, elsewhere])), null);
});

test('a sentence whose condition changed while a twin took its place is not taken for the twin', () => {
  const says = (items: { when: string; body: string }[]) => ({ page: 'home', title: 'Home', blocks: [note('Hello'), { kind: 'headline', key: 'lasts', says: items }] });
  const start = says([{ when: 'bills>0', body: 'Lasts the year' }]);
  const next = says([{ when: 'bills>0&cash>0', body: 'Lasts the year' }, { when: 'bills>0', body: 'Add a bill to see how long it lasts' }]);
  assert.equal(reworded(start, { ...start, blocks: [start.blocks[1]!, start.blocks[0]!] }, next), null);
});
