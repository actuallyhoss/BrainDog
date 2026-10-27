/**
 * The Add menu offers every kind the renderer draws, or says why not.
 *
 * THE MENU OFFERED NINETEEN OF FORTY KINDS, and the other twenty-one went without a word: a person building a page
 * could not add a form, a strip of weeks, a heat map, a ring, a split, cards, a feed or lanes. This holds every kind of
 * the renderer's table to one of two answers, offered (`BINDABLE`) or a reason in plain words (`NOT_OFFERED`), so a
 * kind added to the renderer and to neither fails here.
 *
 * Invented lists only, written into `held.ts` for each test and taken out after it, as a live tab's record would be.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KINDS } from 'braindog-render';

import * as held from './held.ts';
import { BINDABLE, NOT_OFFERED, bindableFor, notOfferedFor, notOfferedLine, seedBlock, seedStrip, STRIP_WEEKS } from './seed.ts';
import { formOfAnswer } from '../page/kinds/form.ts';
import type { RegisterDecl } from './schema.ts';

/** Chores, with a date, a choice, a number and a link: every new kind has a field to stand on. */
const CHORES: RegisterDecl = {
  id: 'chores',
  name: 'Chores',
  one: 'Chore',
  title: 'what',
  mobile: ['what', 'due', 'state'],
  fields: [
    { id: 'what', type: 'text', label: 'What' },
    { id: 'due', type: 'day', label: 'Due' },
    { id: 'state', type: 'enum', values: ['open', 'done'], label: 'State' },
    { id: 'hours', type: 'decimal', label: 'Hours' },
    { id: 'helper', type: 'ref', label: 'Helper' },
    { id: 'pin', type: 'secret', label: 'Door code' },
  ],
};

/** Recipes, with no date and no number. */
const RECIPES: RegisterDecl = {
  id: 'recipes',
  name: 'Recipes',
  one: 'Recipe',
  title: 'name',
  mobile: ['name', 'cuisine', 'method'],
  fields: [
    { id: 'name', type: 'text', label: 'Name' },
    { id: 'cuisine', type: 'enum', values: ['soup', 'bread'], label: 'Cuisine' },
    { id: 'method', type: 'document', label: 'Method' },
  ],
};

function withLists(run: () => void): void {
  held.REGISTERS.chores = CHORES;
  held.REGISTERS.recipes = RECIPES;
  try {
    run();
  } finally {
    delete held.REGISTERS.chores;
    delete held.REGISTERS.recipes;
  }
}

test("every kind the renderer draws is offered or has a reason it is not, and never both", () => {
  const kinds = Object.keys(KINDS);
  assert.ok(kinds.length >= 40, 'the renderer names fewer kinds than it did, so this test proves less');
  for (const kind of kinds) {
    const offered = BINDABLE.includes(kind);
    const reason = NOT_OFFERED[kind];
    assert.ok(offered || reason, `${kind} is neither offered nor given a reason`);
    assert.ok(!(offered && reason), `${kind} is offered and also given a reason it is not`);
  }
  for (const kind of [...BINDABLE, ...Object.keys(NOT_OFFERED)]) assert.ok(Object.hasOwn(KINDS, kind), `${kind} is no kind the renderer draws`);
  for (const [kind, why] of Object.entries(NOT_OFFERED)) {
    assert.ok(why.trim().length > 0, `${kind}'s reason is empty`);
    assert.doesNotMatch(why, /—|\brow\b|list item|entity/u, `${kind}'s reason uses a word the house keeps off the screen`);
  }
});

test('the kinds the menu never offered are offered over a list that has their fields', () => {
  withLists(() => {
    const offered = bindableFor('chores');
    for (const kind of ['form', 'calendar', 'heat', 'ring', 'split', 'cards', 'feed', 'lanes'])
      assert.ok(offered.includes(kind), `${kind} is not offered over chores`);
    assert.equal(seedBlock('heat', 'chores')?.columns?.[0]?.field, 'due', 'a heat does not lead with the day');
    assert.equal(seedBlock('ring', 'chores')?.limit, 5, 'a ring is seeded past the five parts it draws');
    assert.deepEqual(seedBlock('lanes', 'chores')?.columns?.map((c) => c.field), ['what', 'due'], 'lanes took words for an end');
    const cards = seedBlock('cards', 'chores');
    assert.deepEqual(cards?.columns?.map((c) => c.as), ['title', 'fact', 'fact', 'fact']);
    const feed = seedBlock('feed', 'chores');
    assert.equal(feed?.source, 'activity');
    assert.equal(feed?.where, 'list is chores');
    for (const kind of offered)
      for (const column of seedBlock(kind, 'chores')?.columns ?? []) assert.notEqual(column.field, 'pin', `${kind} seeded the door code`);
  });
});

test('on a list with a date the strip of weeks and the form are offered', () => {
  withLists(() => {
    const strip = seedStrip('chores');
    assert.ok(strip, 'no strip over a list with a date');
    assert.equal(strip.kind, 'calendar');
    assert.equal(strip.weeks, STRIP_WEEKS);
    assert.equal(strip.weeks, 5);
    assert.equal(strip.heading, 'Next five weeks');
    assert.equal(strip.source, 'register.chores');

    const form = seedBlock('form', 'chores') as Record<string, unknown> | null;
    assert.ok(form, 'no form over chores');
    assert.equal(form.kind, 'form');
    assert.equal(form.verb, 'row.create');
    assert.equal(form.register, 'chores');
    assert.equal(form.submit, 'Add');
    /* THE KEYS A FORM REFUSES, since it reads no row (`packages/kernel/src/kinds/form.ts` `UNREAD_HERE`). */
    for (const key of ['source', 'columns', 'limit', 'where', 'authored']) assert.equal(form[key], undefined, `a form was seeded with ${key}:`);
    const fields = form.fields as { id: string; label: string; type: string; required?: boolean }[];
    assert.equal(fields[0]?.id, 'what', 'the form does not ask the name first');
    assert.equal(fields[0]?.required, true);
    assert.ok(fields.length <= 4);
    assert.ok(!fields.some((f) => f.id === 'pin'), 'the form asks for the door code');
    for (const f of fields) {
      assert.ok(CHORES.fields.some((d) => d.id === f.id), `${f.id} is no field of chores`);
      assert.ok(['text', 'long', 'number', 'money', 'date', 'choice', 'bool'].includes(f.type), `${f.id} is asked as ${f.type}`);
      assert.ok(new TextEncoder().encode(f.label).length <= 40, `${f.id}'s label is longer than a form holds`);
    }
    assert.deepEqual(fields.map((f) => f.type), ['text', 'date', 'choice', 'number']);
    /* AND THE TILE IS DRAWN BY THE FORM'S OWN READING OF AN ANSWER, which keeps it. */
    const spec = formOfAnswer({ form });
    assert.ok(spec, 'the form drawer would draw this seed as nothing');
    assert.equal((spec.fields as unknown[]).length, fields.length);
  });
});

test('on a list with no date there is no strip, and the menu says why in one line', () => {
  withLists(() => {
    assert.equal(seedStrip('recipes'), null, 'a strip of weeks over a list with no date');
    const offered = bindableFor('recipes');
    for (const kind of ['calendar', 'heat', 'lanes', 'ring', 'split']) assert.ok(!offered.includes(kind), `${kind} is offered over recipes`);
    for (const kind of ['form', 'feed', 'cards', 'table']) assert.ok(offered.includes(kind), `${kind} was withdrawn from recipes`);

    const lacking = notOfferedFor('recipes');
    assert.equal(lacking.find((l) => l.kind === 'heat')?.lacks, 'a date');
    assert.equal(lacking.find((l) => l.kind === 'ring')?.lacks, 'a number');
    assert.ok(!lacking.some((l) => offered.includes(l.kind)), 'a kind is offered and said to be missing');
    assert.ok(!lacking.some((l) => l.kind === 'link'), 'links are offered written out, so they are not missing');

    const line = notOfferedLine('recipes', (kind) => kind.toUpperCase());
    assert.ok(line, 'the menu says nothing of what recipes cannot fill');
    assert.match(line, /^Not offered for Recipes: /u);
    assert.match(line, /HEAT/u);
    assert.match(line, /need a date/u);
    assert.match(line, /need a number/u);
    assert.doesNotMatch(line, /\n|—/u, 'the line is more than one line, or has a dash in it');
  });
});

test('a list nobody declared seeds nothing new and says nothing', () => {
  assert.equal(seedStrip('nowhere'), null);
  assert.equal(seedBlock('form', 'nowhere'), null);
  assert.equal(seedBlock('feed', 'nowhere'), null);
  assert.equal(notOfferedLine('nowhere', (k) => k), null);
});
