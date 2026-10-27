/**
 * The `form` kind: a page declares a few fields and a button that adds a row to a list, the install checks
 * the form, the read checks it against the list and types each field from it, and a reader who may not write is not
 * sent it. A form over `question.ask` names no list, and its fields are held to the verb's args.
 *
 * WHAT WAS MEASURED BEFORE IT: `kinds/` held calendar, embed, gallery, lanes, link, listed and words and no form, and
 * every form that wrote was a screen written by hand.
 *
 * EACH TEST DRIVES A REAL RECORD over `node:sqlite` for the install, and the page read is `readPage` over that record
 * with the reader's level said, as `row-actions-read.test.ts` reads it, since the record's own read says no level.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';
import type { Schema } from '@braindog/where';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { readPage, type BlockResult, type PageBlock, type PageDeps } from '../src/pages.ts';
import type { FormAnswer } from '../src/kinds/form.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);

/* AN INVENTED LIST OF ERRANDS, one field of each type a form writes. */
const ERRANDS: Declaration = {
  id: 'register.errands',
  kind: 'register',
  body: {
    id: 'errands',
    name: 'Errands',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'size', type: 'enum', values: ['small', 'large', 'other'] },
      { id: 'why', type: 'text' },
      { id: 'note', type: 'document' },
      { id: 'trips', type: 'int' },
      { id: 'cost', type: 'money' },
      { id: 'due', type: 'day' },
      { id: 'paid', type: 'bool' },
    ],
  } as never,
};

const FORM = {
  kind: 'form',
  heading: 'Add an errand',
  verb: 'row.create',
  register: 'errands',
  fields: [
    { id: 'what', label: 'What is it?', required: true },
    { id: 'size', label: 'How big?' },
    { id: 'why', label: 'Say more', show_when: { field: 'size', is: 'other' } },
    { id: 'note', label: 'Notes', type: 'text' },
    { id: 'trips', label: 'Trips' },
    { id: 'cost', label: 'What it costs' },
    { id: 'due', label: 'By when?' },
    { id: 'paid', label: 'Paid already?' },
  ],
  submit: 'Add it',
};

const pageOf = (...blocks: Record<string, unknown>[]): Declaration => ({
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', requires: ['register.errands'], blocks } as never,
});

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([ERRANDS])).ok);
  return k;
}

/** The refusal an install answered, or `null` when it installed. */
const refusalOf = (out: { ok: boolean }) =>
  !out.ok && 'refusal' in out ? (out as { refusal: { code: string; fix: string; at?: string; allowed?: readonly string[] } }).refusal : null;

/** A page read over the record, as a host that says who is reading reads it. */
function readOver(k: Kernel, block: Record<string, unknown>, more: Partial<PageDeps> = {}): FormAnswer {
  const schemaOf = (register: string): Schema | null => {
    const decl = k.register(register);
    return decl ? { register, fields: Object.fromEntries(decl.fields.map((f) => [f.id, f])) } : null;
  };
  const deps: PageDeps = {
    pages: () => [{ page: 'desk', title: 'Desk', blocks: [block as unknown as PageBlock] }],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: (q) => {
      const out = k.list({ register: q.register, ...(q.limit ? { limit: q.limit } : {}) });
      return out.ok ? ok({ rows: out.value.rows, matched: out.value.matched }) : out;
    },
    schemaOf,
    titleOf: (register) => k.register(register)?.title ?? null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf },
    ...more,
  };
  const read = readPage(deps, 'desk');
  assert.ok(read.ok, JSON.stringify(read));
  return read.value.blocks[0] as BlockResult as FormAnswer;
}

test('A PAGE WITH A FORM OVER row.create INSTALLS', async () => {
  const k = await record();
  assert.equal(refusalOf(await k.install([pageOf(FORM)])), null, 'a form over a list was refused at install');
  assert.equal(refusalOf(await k.install([pageOf({ ...FORM, after: 'desk' })])), null, 'after: a page was refused');
});

test('EACH WRONG FORM IS REFUSED AT INSTALL, with the fix', async () => {
  const k = await record();
  const thirteen = Array.from({ length: 13 }, (_, i) => ({ id: `f${i}`, label: `Field ${i}` }));
  const cases: [string, Record<string, unknown>, string, RegExp][] = [
    ['pref.set', { ...FORM, verb: 'pref.set' }, 'verb', /form over pref\.set is not built yet.*verb: row\.create.*verb: question\.ask/u],
    ['another verb', { ...FORM, verb: 'row.update' }, 'verb', /form over row\.update is not built yet/u],
    ['a word that is no verb', { ...FORM, verb: 'explode' }, 'verb', /"explode" is not a verb/u],
    ['13 fields', { ...FORM, fields: thirteen }, 'fields', /13 fields, and one holds at most 12/u],
    ['a duplicate id', { ...FORM, fields: [FORM.fields[0], { id: 'what', label: 'Again' }] }, 'fields[1].id', /a field above it already does/u],
    ['an unknown type', { ...FORM, fields: [{ id: 'what', label: 'What', type: 'colour' }] }, 'fields[0].type', /one of text, long, number, money, date, choice, bool/u],
    ['a 41-byte submit', { ...FORM, submit: 'x'.repeat(41) }, 'submit', /1 to 40 bytes, and this one is 41/u],
    ['show_when naming a later field', { ...FORM, fields: [{ id: 'why', label: 'Say more', show_when: { field: 'size', is: 'other' } }, FORM.fields[1]] }, 'fields[0].show_when.field', /no field above it fills in size/u],
    ['a field that repeats', { ...FORM, fields: [{ ...FORM.fields[0], repeat: { least: 1, most: 3 } }] }, 'fields[0].repeat', /does not take yet/u],
    ['a source', { ...FORM, source: 'register.errands' }, 'source', /reads nothing/u],
  ];
  for (const [what, block, at, fix] of cases) {
    const said = refusalOf(await k.install([pageOf(block)]));
    assert.ok(said, `${what} installed`);
    assert.match(said.fix, fix, `${what}: ${said.fix}`);
    assert.ok(said.at?.endsWith(at), `${what} was refused at ${said.at}, not ${at}`);
  }
  /* A LATER VERB IS SAID AS LATER, in the record's own code for it, and the one verb there is is offered. */
  const later = refusalOf(await k.install([pageOf({ ...FORM, verb: 'pref.set' })]));
  assert.equal(later?.code, 'NOT_IN_THIS_BUILD');
  assert.deepEqual(later?.allowed, ['row.create', 'question.ask']);
});

test('A MEMBER WHO MAY WRITE GETS THE FORM, each field typed from the list where the form gave none', async () => {
  const k = await record();
  const read = readOver(k, FORM, { level: 'write' });
  assert.deepEqual(read.refusals, []);
  assert.notEqual(read.drawn, false);
  assert.equal(read.form?.verb, 'row.create');
  assert.equal(read.form?.register, 'errands');
  assert.equal(read.form?.submit, 'Add it');
  assert.equal(read.form?.after, 'stay');
  assert.deepEqual(
    read.form?.fields.map((f) => [f.id, f.type, f.required]),
    [
      ['what', 'text', true],
      ['size', 'choice', false],
      ['why', 'text', false],
      ['note', 'text', false],
      ['trips', 'number', false],
      ['cost', 'money', false],
      ['due', 'date', false],
      ['paid', 'bool', false],
    ],
  );
  /* A CHOICE OFFERS THE LIST'S OWN VALUES, and a field shown by an answer above it says which. */
  assert.deepEqual(read.form?.fields[1]?.options, ['small', 'large', 'other']);
  assert.deepEqual(read.form?.fields[2]?.show_when, { field: 'size', is: 'other' });
  /* AND AN OWNER, above write, gets it too. */
  assert.equal(readOver(k, FORM, { level: 'owner' }).form?.fields.length, 8);
});

test('A READER AT READ IS NOT SENT THE FORM, and neither is one whose level was never said', async () => {
  const k = await record();
  for (const more of [{ level: 'read' }, {}] as Partial<PageDeps>[]) {
    const read = readOver(k, FORM, more);
    assert.equal(read.drawn, false);
    assert.equal(read.why, 'level');
    assert.equal(read.form, undefined, 'the fields were sent to a reader who may not write');
  }
});

test('AT READ THE LIST IS RIGHT ABOUT ITS FIELDS: one it lacks, a type it is not and an option it lacks are refused', async () => {
  const k = await record();
  const lacks = readOver(k, { ...FORM, fields: [FORM.fields[0], { id: 'colour', label: 'Colour' }] }, { level: 'write' });
  assert.equal(lacks.form, undefined);
  assert.equal(lacks.refusals[0]?.code, 'FIELD_UNKNOWN');
  assert.equal(lacks.refusals[0]?.at, 'fields[1].id');
  assert.match(lacks.refusals[0]?.fix ?? '', /errands has no field called colour/u);
  assert.ok(lacks.refusals[0]?.allowed?.includes('what'));

  const typed = readOver(k, { ...FORM, fields: [{ id: 'due', label: 'By when?', type: 'number' }] }, { level: 'write' });
  assert.equal(typed.refusals[0]?.at, 'fields[0].type');
  assert.deepEqual(typed.refusals[0]?.allowed, ['date']);

  const picked = readOver(k, { ...FORM, fields: [{ id: 'size', label: 'How big?', options: ['small', 'huge'] }] }, { level: 'write' });
  assert.equal(picked.refusals[0]?.at, 'fields[0].options');
  assert.match(picked.refusals[0]?.fix ?? '', /offers huge/u);

  const away = readOver(k, { ...FORM, after: 'nowhere' }, { level: 'write' });
  assert.match(away.refusals[0]?.fix ?? '', /no page called nowhere/u);

  /* A FORM INSTALLED BARE IS REFUSED WHEN IT IS READ, naming what it lacks. */
  const bare = readOver(k, { kind: 'form' }, { level: 'write' });
  assert.equal(bare.refusals[0]?.at, 'verb');
});

/* A FORM THAT PUTS A QUESTION TO THE OWNER: no list, and its fields are the verb's own args. */
const ASK = {
  kind: 'form',
  heading: 'Ask about the errands',
  verb: 'question.ask',
  fields: [
    { id: 'question', label: 'What should be decided?' },
    { id: 'why', label: 'Why ask now?' },
    { id: 'first', label: 'One answer' },
    { id: 'second', label: 'The other answer' },
  ],
  submit: 'Ask it',
};

test('A PAGE WITH A FORM OVER question.ask INSTALLS, naming no list, and a member who may write gets it', async () => {
  const k = await record();
  assert.equal(refusalOf(await k.install([pageOf(ASK)])), null, 'a form over question.ask was refused at install');
  /* WHY MAY BE LEFT OFF: the question and its two answers are what the verb needs. */
  const bare = { ...ASK, fields: ASK.fields.filter((f) => f.id !== 'why') };
  assert.equal(refusalOf(await k.install([pageOf(bare)])), null, 'a form with no why was refused');
  const read = readOver(k, ASK, { level: 'write' });
  assert.deepEqual(read.refusals, []);
  assert.notEqual(read.drawn, false);
  assert.equal(read.form?.verb, 'question.ask');
  assert.equal(read.form?.register, undefined, 'an ask names no list');
  assert.equal(read.form?.submit, 'Ask it');
  assert.deepEqual(
    read.form?.fields.map((f) => [f.id, f.type, f.required]),
    [
      ['question', 'text', true],
      ['why', 'long', false],
      ['first', 'text', true],
      ['second', 'text', true],
    ],
  );
  /* A READER WHO MAY NOT WRITE IS NOT SENT IT, as a form over a list is not. */
  const reader = readOver(k, ASK, { level: 'read' });
  assert.equal(reader.drawn, false);
  assert.equal(reader.form, undefined);
});

test('AN ASK FORM IS HELD TO THE VERB\'S ARGS: a field it does not send, a list, a number box and a missing answer are refused', async () => {
  const k = await record();
  const cases: [string, Record<string, unknown>, string, RegExp, (readonly string[])?][] = [
    ['a field it does not send', { ...ASK, fields: [...ASK.fields, { id: 'what', label: 'What is it?' }] }, 'fields[4].id', /fills in what, and question\.ask sends question, why, first, second/u, ['question', 'why', 'first', 'second']],
    ['a list', { ...ASK, register: 'errands' }, 'register', /writes into no list, so it names no register/u],
    ['a number box', { ...ASK, fields: [{ ...ASK.fields[0]!, type: 'number' }, ...ASK.fields.slice(1)] }, 'fields[0].type', /sends words, so it is asked as text or long/u, ['text', 'long']],
    ['options on an answer', { ...ASK, fields: [...ASK.fields.slice(0, 2), { ...ASK.fields[2]!, options: ['yes'] }, ASK.fields[3]] }, 'fields[2].options', /sends what is typed/u],
    ['no second answer', { ...ASK, fields: ASK.fields.slice(0, 3) }, 'fields', /asks question, first, second, and this one has no field for second/u, ['second']],
  ];
  for (const [what, block, at, fix, allowed] of cases) {
    const said = refusalOf(await k.install([pageOf(block)]));
    assert.ok(said, `${what} installed`);
    assert.match(said.fix, fix, `${what}: ${said.fix}`);
    assert.ok(said.at?.endsWith(at), `${what} was refused at ${said.at}, not ${at}`);
    if (allowed) assert.deepEqual(said.allowed, allowed, `${what} lists the fix`);
  }
  /* AND A FORM OVER A LIST STILL NAMES ITS LIST: one with none is refused when it is read. */
  const listless = readOver(k, { ...FORM, register: undefined }, { level: 'write' });
  assert.equal(listless.refusals[0]?.at, 'register');
});
