/**
 * THE THINGS HERE TWICE AND THE ONE PRESS THAT FOLDS THEM (`twice-fold.ts`).
 *
 * On a list that says what makes two of its rows the same (`same:`), the list says how many are here twice in its own
 * name, shows exactly those under `?twice=1`, and one button files the question that folds them, which Decide asks.
 * The record is driven by a stand-in `call`, as `rowsHeldTwice` is in `list-twice.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { REGISTERS } from '../../../lib/record/fixtures/sample.ts';
import type { RegisterDecl } from '../../../lib/record/schema.ts';
import { foldAsk, keepWords, sameOf, thingWords, twiceLine } from './twice-fold.ts';

const route = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

/** A list of skills that says two of one name in one project are one skill, keeping what it declares. */
const skills = (keep?: string): RegisterDecl =>
  ({ ...REGISTERS.skills!, same: { fields: ['name'], within: 'project', fold: 'exact', ...(keep ? { keep } : {}) } }) as RegisterDecl;
const PEOPLE = { ...REGISTERS.people!, meets: { name: 'name' } } as RegisterDecl;

type Called = { ok: true; value: unknown } | { ok: false; refusal?: { code: string; fix: string } };

test('the press asks the record once and opens the question it answers on Decide', async () => {
  const calls: unknown[][] = [];
  const call = async (name: string, args: Record<string, unknown>): Promise<Called> => {
    calls.push([name, args]);
    return { ok: true, value: { question: '01JQ ASK/1' } };
  };
  const out = await foldAsk(call, 'skills');
  assert.deepEqual(calls, [['askFoldTwice', { register: 'skills' }]]);
  assert.deepEqual(out, { ok: true, href: `/decide/${encodeURIComponent('01JQ ASK/1')}` });
});

test("a refusal is handed back in the record's own words, and the button stays", async () => {
  const refusal = { code: 'FORBIDDEN', fix: 'Only a person can fold these. Ask the owner.' };
  const out = await foldAsk(async () => ({ ok: false, refusal }), 'skills');
  assert.deepEqual(out, { ok: false, said: refusal.fix, gone: false });
  /* An answer that carries no refusal still says something a person can act on. */
  const bare = await foldAsk(async () => ({ ok: false }), 'skills');
  assert.equal(bare.ok, false);
  assert.ok(!bare.ok && bare.said.length > 0 && !bare.gone);
});

test('a host built before the call takes the button away rather than refusing every press', async () => {
  for (const code of ['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD']) {
    const out = await foldAsk(async () => ({ ok: false, refusal: { code, fix: 'There is no method called askFoldTwice.' } }), 'skills');
    assert.equal(out.ok, false, code);
    /* Never the method's name in a sentence a person reads. */
    assert.ok(!out.ok && out.gone && !out.said.includes('askFoldTwice'), code);
  }
});

test('nothing left to fold opens nothing and says so', async () => {
  for (const value of [null, {}, { question: '' }, { question: 7 }]) {
    const out = await foldAsk(async () => ({ ok: true, value }), 'skills');
    assert.equal(out.ok, false, JSON.stringify(value));
  }
});

test('the button says which one of each is kept, by the list', () => {
  assert.equal(keepWords.oldest, 'Keep the oldest of each');
  assert.equal(keepWords.latest, 'Keep the newest of each');
  assert.equal(keepWords.sealed, 'Keep the one with the sealed value');
  assert.equal(thingWords(skills(), sameOf(skills())!.keep).keep, 'Keep the oldest of each', 'oldest is the default');
  assert.equal(thingWords(skills('latest'), sameOf(skills('latest'))!.keep).keep, 'Keep the newest of each');
  assert.equal(thingWords(skills('sealed'), sameOf(skills('sealed'))!.keep).keep, 'Keep the one with the sealed value');
  /* A word the screen does not know is the default, never a button with no label. */
  assert.equal(sameOf(skills('whatever'))?.keep, 'oldest');
});

test('the line says how many in the list own name, and nought says nothing', () => {
  assert.equal(twiceLine(skills(), 3), '3 skills are here twice');
  assert.equal(twiceLine(skills(), 1), '1 skill is here twice');
  for (const n of [0, -1, Number.NaN]) assert.equal(twiceLine(skills(), n), null, String(n));
});

test('a list that says no `same:`, the list of people, and a list still being read draw no line', () => {
  assert.equal(twiceLine(REGISTERS.tasks!, 3), null);
  assert.equal(twiceLine(PEOPLE, 3), null, 'people keep their own words');
  assert.equal(twiceLine({ ...PEOPLE, same: { fields: ['name'], fold: 'text' } } as RegisterDecl, 3), null, 'people keep their own words');
  assert.equal(twiceLine(undefined, 3), null);
  assert.equal(sameOf(REGISTERS.tasks!), null);
});

test('the words name the list, never people, and name the way out', () => {
  const said = thingWords({ ...skills(), name: 'Keys', one: 'key' } as RegisterDecl, 'sealed');
  assert.equal(said.showing, 'Showing the keys that are here twice');
  assert.equal(said.clear, 'Show all keys');
  assert.equal(said.none, 'No keys are here twice.');
  assert.ok(said.unsaved.includes(said.clear), 'the sentence names a button the line does not have');
  /* A name in capitals stays as it was typed. */
  assert.equal(thingWords({ ...skills(), name: 'API keys' } as RegisterDecl, 'oldest').clear, 'Show all API keys');
  for (const line of [...Object.values(said), twiceLine(skills(), 3)!]) {
    assert.doesNotMatch(line, /—/, line);
    assert.doesNotMatch(line, /\b(people|person|row|rows|entity|list item|seq)\b/i, line);
  }
});

test('the list screen draws the line, the link to the word and the one button', () => {
  assert.match(route, /from '\.\/twice-fold\.ts'/, 'the route does not read this file');
  assert.match(route, /data-held-twice-count/, 'no line over the list');
  assert.match(route, /data-held-twice-show href=\{twiceHref\}/, 'the line does not link to the word');
  assert.match(route, /p\.set\(TWICE, '1'\)/);
  assert.match(route, /data-held-twice-fold/, 'no button that folds them');
  assert.match(route, /foldAsk\(/);
  assert.match(route, /goto\(at\(out\.href\)\)/, 'the press does not open the question on Decide');
  /* The people's own words are still what a list of people reads. */
  for (const key of ['showing', 'clear', 'none', 'unsaved']) assert.match(route, new RegExp(`thingSaid\\?\\.${key} \\?\\? twiceWords\\.${key}`), key);
});
