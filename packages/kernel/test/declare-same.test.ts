/**
 * A list's `same:`: what makes two of its rows the same thing, checked whole at install. Each fault is one
 * sentence naming the part, at the part; a good rule installs beside the list of projects it is within.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

const FIELDS = [
  { id: 'name', type: 'text', required: true },
  { id: 'body', type: 'document' },
  { id: 'old_name', type: 'text', retired: true },
  { id: 'owner', type: 'ref', to: 'things' },
  { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } },
];

const skills = (same: unknown, fields: unknown[] = FIELDS, extra: Record<string, unknown> = {}): Declaration => ({
  id: 'register.skills',
  kind: 'register',
  body: { id: 'skills', name: 'Skills', title: 'name', fields, same, ...extra } as never,
});

const refused = (same: unknown, fields?: unknown[], extra?: Record<string, unknown>) => validateDeclaration(skills(same, fields, extra));

test('A GOOD RULE PASSES: its text fields, within its scope or a link, by text or exact, keeping any of three', () => {
  assert.equal(refused({ fields: ['name'], within: 'project', fold: 'text' }), null);
  assert.equal(refused({ fields: ['name'], within: 'owner', fold: 'exact', keep: 'latest' }), null);
  assert.equal(refused({ fields: ['name'], fold: 'text', keep: 'oldest' }), null);
  const sealed = [...FIELDS, { id: 'value', type: 'secret' }];
  assert.equal(refused({ fields: ['name'], fold: 'text', keep: 'sealed' }, sealed), null);
});

test('A RULE THAT IS NO BODY, OR HAS A PART THERE IS NO SUCH, IS REFUSED AT same', () => {
  for (const same of ['name', ['name'], null, { fields: ['name'], fold: 'text', match: 'all' }]) {
    const r = refused(same);
    assert.equal(r?.code, 'DECLARATION_INVALID', JSON.stringify(same));
    assert.equal(r?.at, 'same');
    assert.match(r!.fix, /^skills says what makes two of its rows the same\. Say it as \{ fields/u);
    assert.deepEqual(r?.allowed, ['fields', 'within', 'fold', 'keep']);
  }
});

test('EVERY FIELD IT NAMES IS A LIVE TEXT FIELD OF THE LIST, named once', () => {
  const at = (fields: unknown) => refused({ fields, fold: 'text' });
  for (const fields of [[], 'name', [7], undefined]) {
    const r = at(fields);
    assert.equal(r?.code, 'DECLARATION_INVALID');
    assert.equal(r?.at, 'same.fields');
    assert.deepEqual(r?.allowed, ['name'], 'the live text fields, and not the retired one');
  }
  const missing = at(['name', 'colour']);
  assert.equal(missing?.code, 'FIELD_UNKNOWN');
  assert.equal(missing?.at, 'same.fields[1]');
  assert.equal(missing?.fix, "skills's same names colour, and skills has no such field.");
  const retired = at(['old_name']);
  assert.equal(retired?.at, 'same.fields[0]');
  assert.match(retired!.fix, /old_name, which is retired/u);
  const doc = at(['body']);
  assert.equal(doc?.code, 'DECLARATION_INVALID');
  assert.equal(doc?.fix, "skills's same names body, which is a document, and two rows are the same by their text fields.");
  const twice = at(['name', 'name']);
  assert.equal(twice?.at, 'same.fields[1]');
  assert.match(twice!.fix, /names name twice/u);
});

test('WITHIN IS THE LIST’S SCOPE OR ONE OF ITS LINKS, never a text', () => {
  for (const within of ['name', 'colour', 7, '']) {
    const r = refused({ fields: ['name'], within, fold: 'text' });
    assert.equal(r?.code, 'DECLARATION_INVALID', String(within));
    assert.equal(r?.at, 'same.within');
    assert.deepEqual(r?.allowed, ['owner', 'project']);
    assert.match(r!.fix, /that is skills's scope or one of its links, such as project, or left out\.$/u);
  }
});

test('FOLD IS text OR exact, AND KEEP IS oldest, latest OR sealed', () => {
  for (const fold of [undefined, 'loose', 'TEXT']) {
    const r = refused({ fields: ['name'], fold });
    assert.equal(r?.code, 'ENUM_VALUE_UNKNOWN', String(fold));
    assert.equal(r?.at, 'same.fold');
    assert.deepEqual(r?.allowed, ['text', 'exact']);
  }
  const keep = refused({ fields: ['name'], fold: 'text', keep: 'newest' });
  assert.equal(keep?.code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(keep?.at, 'same.keep');
  assert.equal(keep?.fix, "skills's same keeps the oldest, the latest or the sealed one of two rows, and \"newest\" is none of them.");
});

test('SEALED IS ONLY FOR A LIST WITH A SEALED FIELD, and a retired one is none', () => {
  const r = refused({ fields: ['name'], fold: 'text', keep: 'sealed' });
  assert.equal(r?.code, 'DECLARATION_INVALID');
  assert.equal(r?.at, 'same.keep');
  assert.equal(r?.fix, "skills's same keeps the sealed one of two rows, and skills has no secret or file field to seal a value in.");
  const gone = refused({ fields: ['name'], fold: 'text', keep: 'sealed' }, [...FIELDS, { id: 'value', type: 'secret', retired: true }]);
  assert.equal(gone?.at, 'same.keep');
  assert.equal(refused({ fields: ['name'], fold: 'text', keep: 'sealed' }, [...FIELDS, { id: 'scan', type: 'file' }]), null);
});

test('A LIST THAT ALREADY KEEPS ITS OWN KEYS DOES NOT DECLARE same', () => {
  const r = refused({ fields: ['name'], fold: 'text' }, [{ id: 'name', type: 'text' }, { id: 'repos', type: 'list', of: 'text' }], { scopes: { repos: 'repos' } });
  assert.equal(r?.code, 'DECLARATION_INVALID');
  assert.equal(r?.at, 'same');
  assert.match(r!.fix, /^skills declares scopes:, which already says when two of its rows are one/u);
});

test('A GOOD RULE INSTALLS, beside the projects it is within', async () => {
  const k = await openRecord(openSqlite(), fixedClock(Date.UTC(2026, 9, 14, 12)));
  const said = (r: unknown) => r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  const done = said(await k.install([PROJECTS, skills({ fields: ['name'], within: 'project', fold: 'text', keep: 'oldest' })]));
  assert.ok(done.ok, `${done.refusal?.code}: ${done.refusal?.fix}`);
  const wrong = said(await k.install([skills({ fields: ['name'], within: 'project', fold: 'loose' })]));
  assert.equal(wrong.ok, false);
  assert.equal(wrong.refusal?.at, 'same.fold');
});
