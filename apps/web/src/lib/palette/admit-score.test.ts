/**
 * THE PALETTE FINDS A PLACE BY THE WORD A PERSON USES (EXP-D13). `scoreOf` ranks a hit by how sure it is, `ranked`
 * draws the best first inside each group, and an alias is the last resort, never ahead of a name. Every command here
 * that is not a shipped one is invented inline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../record/fixtures/fill.ts';
import { COMMANDS, admits, commands, ranked, scoreOf, type Command } from './admit.ts';

const live = { undoable: true, creation: null };
const row = (id: string, title: string, aliases?: string[], group = 'Go to'): Command => ({
  id,
  title,
  href: `/${id}`,
  group,
  icon: 'arrow',
  ...(aliases ? { aliases } : {}),
});
const ids = (list: { id: string }[]) => list.map((c) => c.id);

test('"mail" ranks Inbox first, "keys" the Keychain and "questions" Needs you', () => {
  for (const [typed, want] of [['mail', 'c-inbox'], ['secrets', 'c-keychain'], ['keys', 'c-keychain'], ['questions', 'c-decide']] as const)
    assert.equal(ranked(commands(live), typed)[0]?.id, want, `"${typed}" did not lead with ${want}`);
});

test('the scores are exact, prefix, word start, middle of the name, then an alias', () => {
  const c = row('lantern', 'Lantern room', ['glow']);
  assert.equal(scoreOf(c, 'lantern room'), 5);
  assert.equal(scoreOf(c, 'LANTERN  Room!'), 5, 'case and spacing change the score');
  assert.equal(scoreOf(c, 'lant'), 4);
  assert.equal(scoreOf(c, 'roo'), 3);
  assert.equal(scoreOf(c, 'ntern'), 2);
  assert.equal(scoreOf(c, 'gl'), 1);
  assert.equal(scoreOf(c, 'otter'), null);
  assert.equal(scoreOf(c, 'nt'), null, 'two letters in the middle of a word found a name');
  assert.equal(scoreOf(c, '?'), null);
});

test('"set" ranks Settings over a command whose word only holds it', () => {
  const list = [row('reset-dial', 'Reset dial'), ...COMMANDS.filter((c) => c.id === 'c-settings')];
  assert.deepEqual(ids(ranked(list, 'set')), ['c-settings', 'reset-dial']);
});

test('an alias never outranks a title prefix, nor any hit on a name', () => {
  const list = [row('quill', 'Quill desk', ['harbour']), row('harbour', 'Harbourside'), row('bay', 'Old harbour')];
  assert.deepEqual(ids(ranked(list, 'harbour')), ['harbour', 'bay', 'quill']);
  /* And on the shipped list: whatever a shipped alias finds by its name comes before the command that only has it. */
  for (const c of COMMANDS)
    for (const a of c.aliases ?? []) {
      const order = ranked(COMMANDS, a);
      const mine = order.findIndex((o) => o.id === c.id);
      for (const [at, o] of order.entries())
        if (o.score > 1 && o.group === c.group) assert.ok(at < mine, `"${a}" put ${c.id} ahead of ${o.id}, which it names`);
    }
});

test('a tie keeps the declared order, and the groups keep theirs', () => {
  const list = [row('one', 'Kettle one'), row('act', 'Kettle act', [], 'Actions'), row('two', 'Kettle two'), row('kettle', 'Kettle')];
  assert.deepEqual(ids(ranked(list, 'kett')), ['one', 'two', 'kettle', 'act']);
  assert.deepEqual(ids(ranked(list, 'kettle')), ['kettle', 'one', 'two', 'act']);
});

test('nothing typed answers every command in the declared order; a typed mark answers none', () => {
  /* The shipped list is declared a group at a time, so with nothing typed its order is the declared one. */
  const list = commands(live);
  assert.deepEqual(ids(ranked(list, '  ')), ids(list));
  assert.ok(ranked(list, '').every((c) => c.score === 0));
  assert.deepEqual(ranked(list, '·'), []);
});

test('every shipped alias passes admits(), is a plain word, and there are at most six a command', () => {
  for (const c of COMMANDS) {
    assert.equal(admits(c), null, `${c.id} is refused: ${admits(c)}`);
    assert.ok((c.aliases?.length ?? 0) <= 6, `${c.id} has more than six aliases`);
    for (const a of c.aliases ?? []) assert.match(a, /^[a-z]+( [a-z]+)*$/u, `${c.id}'s "${a}" is not a plain word`);
  }
  assert.ok(COMMANDS.filter((c) => c.aliases?.length).length >= 10, 'most commands carry no alias');
});

test('admits() refuses an alias that is empty, too long, not plain, one too many, or another command\'s name', () => {
  const good = row('fixture', 'Open the lantern');
  assert.equal(admits({ ...good, aliases: ['glow'] }), null);
  for (const aliases of [[''], ['a'.repeat(25)], ['Glow'], ['glow!'], ['one', 'two', 'three', 'four', 'five', 'six', 'seven'], ['inbox'], ['sign in']])
    assert.equal(admits({ ...good, aliases }), 'alias', `${JSON.stringify(aliases)} was admitted`);
  assert.equal(admits({ ...good, aliases: ['a'.repeat(24)] }), null, 'twenty-four letters is refused');
  const own = COMMANDS.find((c) => c.id === 'c-inbox')!;
  assert.equal(admits({ ...own, aliases: ['inbox'] }), null, 'a command is refused for its own name');
});
