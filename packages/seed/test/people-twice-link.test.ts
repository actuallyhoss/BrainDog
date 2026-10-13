/**
 * The note over somebody held twice gives something to press (audit 69, finding 3): it said how many and stopped, so
 * the person read a number and had nowhere to go.
 *
 * THE PEOPLE HELD TWICE, AND NOT THE WHOLE LIST (audit 74, claim 4): the link opened everyone in order of name and told
 * the reader to look for the same person listed twice, which is the work the record had already done. The list of
 * people now opens at them alone, by the word `twice` in its address (`apps/web/src/lib/record/`), so the note says
 * "See them" and leaves the looking out. The last test here holds the address down.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel, type PageResult } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { inline, text, type Inline } from '../../render/src/inline.ts';
import { NOW, PAGES, REGISTERS, installSeed } from '../src/index.ts';

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (sql, ...params) => {
      if (params.length === 0) db.exec(sql);
      else db.prepare(sql).run(...(params as never[]));
    },
    all: <T = Row>(sql: string, ...params: Param[]) => db.prepare(sql).all(...(params as never[])) as T[],
    one: <T = Row>(sql: string, ...params: Param[]) => db.prepare(sql).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

type Note = PageResult['blocks'][number] & { body?: string; when?: unknown };
const noteOn = (k: Kernel): Note | undefined => {
  const out = k.page('people');
  assert.ok(out.ok, sayOf(out));
  return (out.value.blocks as Note[]).find((b) => b.kind === 'note' && String(b.body).includes('{{held-twice}}'));
};
/** Every link a line of prose holds, at any depth. */
const linksOf = (nodes: Inline[]): Extract<Inline, { type: 'link' }>[] =>
  nodes.flatMap((n) => (n.type === 'link' ? [n, ...linksOf(n.body)] : 'body' in n ? linksOf(n.body) : []));
/** The note as the page draws it, with the figure read as `count`. */
const drawn = (body: string, count: number): Inline[] => inline(body, { resolve: (path) => (path === 'held-twice' ? String(count) : null) });

/** Two of one name, neither with an address: the plain rule's pair. */
const holdTwice = (k: Kernel): void => {
  for (let i = 0; i < 2; i++) {
    const made = k.create('people', { name: 'Odile Farrow' }, { actor: 'p_1' });
    assert.ok(made.ok, sayOf(made));
  }
};

test('SOMEBODY HELD TWICE CAN BE PRESSED: the note links the list of people, at the ones held twice', async () => {
  const k = await seeded();
  holdTwice(k);
  const note = noteOn(k);
  assert.ok(note, 'People says nothing of somebody held twice');
  assert.notEqual(note.drawn, false);

  const nodes = drawn(String(note.body), 1);
  const links = linksOf(nodes);
  assert.equal(links.length, 1, `one thing to press, and the note holds ${links.length}`);
  const at = new URL(links[0]!.href, 'https://record.example');
  /* THE LIST OF PEOPLE, where a person is merged or deleted, narrowed to the ones the note counted. */
  assert.equal(at.pathname, '/r/people');
  assert.ok(REGISTERS.people, 'the seed holds no list at that address');
  assert.equal(at.searchParams.get('twice'), '1');
  /* THE WORDS ON THE LINK SAY WHAT IT SHOWS, never "here" or "this". */
  assert.equal(text(links[0]!.body), 'See them');
  assert.doesNotMatch(text(links[0]!.body), /^(?:here|this|click)\b/iu);
});

test('THE NOTE STILL READS AS ONE PLAIN LINE: the count first, no id, no dash, no promise of a question', async () => {
  const k = await seeded();
  holdTwice(k);
  const said = text(drawn(String(noteOn(k)!.body), 1));
  assert.match(said, /^People who may be on this record twice: 1\b/u);
  assert.doesNotMatch(said, /people#|#\d|\b[0-9A-HJKMNP-TV-Z]{26}\b|—|\/r\/|Decide/u);
  /* NOTHING LEFT UNREAD: no token the drawer could not resolve, so no dotted text on the page. */
  assert.ok(drawn(String(noteOn(k)!.body), 1).every((n) => n.type !== 'unresolved'));
});

test('NOBODY HELD TWICE: no note and so no link, as before', async () => {
  const k = await seeded();
  assert.equal(noteOn(k)?.drawn, false, 'the note is drawn at nought');
  const declared = (PAGES.people!.blocks as unknown as Note[]).filter((b) => b.kind === 'note' && String(b.body).includes('{{held-twice}}'));
  assert.equal(declared.length, 1);
  assert.deepEqual(declared[0]!.when, { metric: 'held-twice', gt: 0 });
});

test('THE LINK NARROWS BY THE ONE WORD `twice`, and the note no longer sets the reader looking', () => {
  const [note] = (PAGES.people!.blocks as unknown as Note[]).filter((b) => b.kind === 'note' && String(b.body).includes('{{held-twice}}'));
  const [link] = linksOf(drawn(String(note!.body), 2));
  assert.ok(link);
  assert.equal(link.href, '/r/people?twice=1');
  const at = new URL(link.href, 'https://record.example');
  /* NOTHING ELSE NARROWS IT: an `f=` chip or a `q` beside the word would hide one of a pair and show the other. */
  assert.deepEqual([...at.searchParams.keys()], ['twice']);
  /* THE LIST SHOWS THEM, so the words that sent the reader down everyone's names are gone. */
  const said = text(drawn(String(note!.body), 2));
  assert.equal(said, 'People who may be on this record twice: 2. See them.');
  assert.doesNotMatch(said, /same person|by name|look for/iu);
});
