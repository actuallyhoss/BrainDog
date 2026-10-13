/**
 * A mark that names no glyph (REC-C17): the kernel's copy of the names a mark can be drawn by, the figure that counts
 * the rows wearing a word the set does not draw, and the rule that lets such a mark be written once more.
 *
 * WHAT WAS MEASURED BEFORE IT: 26 projects on a real record held the old system's icon name in `mark`, twelve of the 22
 * names drew nothing, and Projects showed the first letter of the icon's name. No figure could say how many, and
 * nothing said which marks may still be repaired.
 *
 * THE RENDERER IS READ BY ITS ADDRESS, never imported by name: the kernel depends on no renderer, and its `tsc` does not
 * follow a URL. `names.ts` and `aliases.ts` hold names and no paths and import types only, so they load here alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BUILT_IN_FIGURES, RECORD_MARKS, builtInFigure, readMarksUnknown } from '../src/built-in-figures.ts';
import { openRecord, type Declaration, type Reading } from '../src/index.ts';
import { MARK_GLYPHS, MARK_IS_FROZEN, MARK_IS_FROZEN_SAYS, isMarkGlyph, isUnknownMark, markFrozen } from '../src/marks.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('A MARK NAMES A GLYPH by the set\'s name or by a word real records use, and a control is no picture', () => {
  for (const name of ['rocket', 'gift', 'cake', 'shop', 'home', 'key', 'invoice', ' rocket ']) {
    assert.equal(isMarkGlyph(name), true, `${name} is drawn`);
    assert.equal(isUnknownMark(name), false, `${name} was counted`);
  }
  for (const name of ['koala', 'paw', 'sword', 'dice', 'Rocket', 'constructor', 'close', 'pencil']) {
    assert.equal(isMarkGlyph(name), false, `${name} is not drawn as a mark`);
    assert.equal(isUnknownMark(name), true, `${name} was not counted`);
  }
});

test('AN EMPTY MARK IS NOT AN UNKNOWN ONE: nothing was chosen, so there is nothing to repair', () => {
  for (const nothing of ['', '   ', null, undefined, 7, ['koala']]) {
    assert.equal(isUnknownMark(nothing), false);
    assert.equal(isMarkGlyph(nothing), false);
  }
});

test('THE KERNEL\'S COPY IS THE RENDERER\'S SET: every glyph name and every alias, and the two answer alike', async () => {
  const at = (file: string): string => new URL(`../../render/src/glyphs/${file}`, import.meta.url).href;
  const names = (await import(at('names.ts'))) as { GLYPH_NAMES: ReadonlySet<string>; isMark: (name: string) => boolean };
  const aliases = (await import(at('aliases.ts'))) as { ALIASES: Readonly<Record<string, string>> };
  const drawn = [...new Set([...names.GLYPH_NAMES, ...Object.keys(aliases.ALIASES)])].sort();
  assert.deepEqual([...MARK_GLYPHS].sort(), drawn, 'a glyph was added to one side and not the other');
  assert.equal(new Set(MARK_GLYPHS).size, MARK_GLYPHS.length, 'a name is listed twice');
  for (const name of [...drawn, 'koala', 'paw', 'Rocket', '', ' cake ']) {
    assert.equal(isMarkGlyph(name), names.isMark(name), `${name}: the record and the drawer disagree`);
  }
});

const list = (id: string, name: string, identity?: { mark: string }): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: {
    id,
    name,
    title: 'name',
    ...(identity ? { identity } : {}),
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'mark', type: 'text' },
      { id: 'badge', type: 'text' },
    ],
  } as never,
});

test('MARKS-UNKNOWN COUNTS THE ROWS OF EVERY LIST WITH AN IDENTITY whose mark names no glyph', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const decl = builtInFigure('marks-unknown');
  assert.ok(decl, 'no such figure');
  assert.equal(decl, BUILT_IN_FIGURES['marks-unknown']);
  assert.equal(decl.source, RECORD_MARKS);
  const read = () => value<Reading>(readMarksUnknown(sql, {}, decl));

  /* NOTHING, NEVER NOUGHT, on a record where no list marks its rows. */
  value(await k.install([list('notes', 'Notes')]));
  value(k.create('notes', { name: 'Loose', mark: 'koala' }, { actor: 'p_1' }));
  const none = read();
  assert.deepEqual([none.value, none.held, none.met], [null, 0, null]);

  /* A KNOWN GLYPH AND AN EMPTY MARK COUNT NOUGHT. */
  value(await k.install([list('things', 'Projects', { mark: 'mark' }), list('clients', 'Clients', { mark: 'badge' })]));
  const make = (register: string, fields: Record<string, unknown>) => value<{ id: string }>(k.create(register, fields, { actor: 'p_1' }));
  make('things', { name: 'BrainDog', mark: 'rocket' });
  make('things', { name: 'Bake', mark: 'cake' });
  make('things', { name: 'Kiln' });
  make('things', { name: 'Tallow', mark: '  ' });
  const clean = read();
  assert.deepEqual([clean.value, clean.held, clean.met], [0, 1, true]);

  /* A WORD THE SET DOES NOT DRAW IS COUNTED, on every such list, by the field that list names. */
  make('things', { name: 'Marsh', mark: 'koala' });
  make('things', { name: 'Portage', mark: 'paw' });
  make('clients', { name: 'Marlow', badge: 'sword', mark: 'rocket' });
  make('clients', { name: 'Fenn', badge: 'gift', mark: 'koala' });
  const gone = make('things', { name: 'Old', mark: 'dice' });
  assert.deepEqual([read().value, read().met], [4, false]);

  /* WHAT WAS DELETED IS NOT ON ANY PAGE, so it is not counted. */
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), gone.id);
  assert.equal(read().value, 3);
  sql.close();
});

test('A MARK THAT NAMES NO GLYPH MAY BE WRITTEN ONCE MORE, and one that names a glyph stays', () => {
  /* Nothing chosen yet, or a word that draws nothing: the write goes through. */
  for (const [held, next] of [[undefined, 'rocket'], [null, 'rocket'], ['', 'rocket'], ['koala', 'rocket'], ['koala', null], ['close', 'gift'], ['Rocket', 'rocket']] as const) {
    assert.equal(markFrozen(held, next), null, `${String(held)} to ${String(next)} was refused`);
  }
  /* A picture, once it names one, stays: another picture, a word, or clearing it are all refused. */
  for (const [held, next] of [['rocket', 'flag'], ['cake', 'gift'], ['rocket', 'koala'], ['rocket', null], ['rocket', '']] as const) {
    assert.deepEqual(markFrozen(held, next), { code: MARK_IS_FROZEN, fix: MARK_IS_FROZEN_SAYS }, `${held} to ${String(next)} went through`);
  }
  /* Sending back what is already there is no change, around any spaces. */
  assert.equal(markFrozen('rocket', 'rocket'), null);
  assert.equal(markFrozen('rocket', ' rocket '), null);
  /* So the repair happens once: after it the mark names a glyph, and is held like any other. */
  assert.equal(markFrozen('koala', 'rocket'), null);
  assert.notEqual(markFrozen('rocket', 'leaf'), null);
  assert.equal(MARK_IS_FROZEN, 'MARK_IS_FROZEN');
  assert.doesNotMatch(MARK_IS_FROZEN_SAYS, /row|entity|—/u);
});
