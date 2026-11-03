/**
 * The kinds of block a page draws, as an agent is handed them (`packages/record/src/grammar.ts`, `kinds` and `kind/<name>`).
 *
 * THE GRAMMAR LISTED THE KINDS BY NAME AND NOTHING MORE, so what a kind is for, its cells and its forms reached no agent
 * and `spec`, the block a page reaches for most, was the workhorse in a code comment only. The short form is
 * every kind with its line and is read in a turn, so it is held at or under 8 KB; the long form is one kind whole.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KINDS, kindsFor, type Kind } from 'braindog-render';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { grammarOf, kindWhole, KINDS_SHORT } from '../src/grammar.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const AGENT: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown) => {
  const x = r as Out;
  assert.equal(x.ok, false, JSON.stringify(x));
  return x.refusal!;
};

const kinds = Object.keys(KINDS) as Kind[];
type Short = { reach_for: string[]; kinds: Record<string, string>; one_kind: string };

test('THE SHORT FORM HAS EVERY KIND WITH ITS LINE, spec reads as the one to reach for most, and it fits in 8 KB', () => {
  const short = value<Short>(grammarOf('kinds'));
  assert.equal(short, KINDS_SHORT);
  assert.deepEqual(Object.keys(short.kinds).sort(), [...kinds].sort(), 'a kind with no line is a kind no agent is told about');
  for (const kind of kinds) assert.ok(short.kinds[kind]!.length > 0, `${kind} has no line`);
  assert.match(short.kinds.spec!, /^the block to reach for most: a name, a value, a note\./u);
  assert.equal(short.reach_for.length, 10);
  const bytes = Buffer.byteLength(JSON.stringify(short));
  assert.ok(bytes <= 8192, `the short form is ${bytes} bytes, past the 8 KB a turn reads: move what does not fit into kind/<name>`);
});

test('THE LONG FORM IS ONE KIND WHOLE, ASKED BY NAME, and a name that is not a kind is refused in words', () => {
  for (const kind of kinds) {
    const whole = value<Record<string, unknown>>(grammarOf(`kind/${kind}`));
    assert.equal(whole.kind, kind);
    assert.equal(whole.line, KINDS_SHORT.kinds[kind]);
    /* AND WHAT A BLOCK OF THAT KIND MAY BE CHANGED TO (`kindsFor`, block-menu-change-to-101). */
    assert.deepEqual(whole, { ...(kindWhole(kind) as object), becomes: kindsFor(kind, []) });
  }
  assert.deepEqual(value<{ forms: string[] }>(grammarOf('kind/progress')).forms, ['budget', 'range']);
  assert.equal(value<{ on_a_page_only: boolean }>(grammarOf('kind/table')).on_a_page_only, true);
  assert.match(String(value<{ over_a_list: string }>(grammarOf('kind/calendar')).over_a_list), /columns \[title field, day or instant field\]/u);
  const wrong = refusal(grammarOf('kind/donut'));
  assert.equal(wrong.code, 'ENUM_VALUE_UNKNOWN');
  assert.match(wrong.fix, /no kind of block called donut\. Read grammar kinds/u);
  assert.ok(wrong.allowed?.includes('kind/spec'));
  assert.match(refusal(grammarOf('yaml')).fix, /or pack, or kind\/<name> for one kind whole\./u);
});

test('THE PAGE GRAMMAR STILL LISTS THE KINDS BY NAME, and points at the kinds grammar for what each is for', () => {
  const page = value<{ block: { kind: string[] }; which_kind: string }>(grammarOf('page'));
  assert.deepEqual(page.block.kind, kinds);
  assert.match(page.which_kind, /grammar kinds/u);
});

test('NOTHING AN AGENT READS OF THE KINDS CALLS AN ENTRY A ROW, NAMES AN ID OR CARRIES AN EM DASH', () => {
  const said = JSON.stringify([KINDS_SHORT, ...kinds.map(kindWhole)]);
  assert.doesNotMatch(said, /\brows?\b/iu);
  assert.doesNotMatch(said, /—/u);
});

test('AN AGENT READS BOTH THROUGH THE ARRANGEMENT, as it reads every other grammar', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 8, 1, 9)) });
  assert.equal(value(await api.arrangement({ grammar: 'kinds' }, AGENT)), KINDS_SHORT);
  assert.equal(value<{ kind: string }>(await api.arrangement({ grammar: 'kind/spec' }, AGENT)).kind, 'spec');
  assert.equal(refusal(await api.arrangement({ grammar: 'kind/donut' }, AGENT)).code, 'ENUM_VALUE_UNKNOWN');
});
