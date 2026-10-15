/**
 * A `when:` by who reads the page (PGS-A17 step 3): `{ reader: owner }`, one of four words or a list of them, so a block
 * can be shown to its owner alone, and a host that has not said who reads is sent no block that asks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';

import { validateDeclaration, type Declaration } from '../src/index.ts';
import { WHEN_READERS, whenTreeFault } from '../src/block-keys.ts';
import { readPage, whenLeaves, type BlockResult, type PageBlock, type PageDeps } from '../src/pages.ts';

const NOW = Date.UTC(2026, 9, 15, 12);

const WAITING = { metric: 'waiting', name: 'Waiting', source: 'register.asks', value: { count: 'id' }, format: 'int', window: '7d', compare: 'none' };

/** A page of a section held to `when`, a note under it, and a note in a section of its own after them. */
const blocks = (when: unknown): PageBlock[] =>
  [
    { kind: 'section', heading: 'Yours alone', when },
    { kind: 'note', body: 'Only under the section.' },
    { kind: 'section', heading: 'Everybody' },
    { kind: 'note', body: 'For every reader.' },
  ] as PageBlock[];

function depsOver(page: readonly PageBlock[], more: Partial<PageDeps> = {}, waiting = 3): PageDeps {
  return {
    pages: () => [{ page: 'desk', title: 'Desk', blocks: [...page] }],
    metric: (id) => (id === 'waiting' ? (WAITING as never) : null),
    read: (decl) => (decl.metric === 'waiting' ? ok({ value: waiting } as never) : no('METRIC_UNKNOWN', 'This test reads one figure.')),
    list: () => ok({ rows: [], matched: 0 }),
    schemaOf: () => null,
    titleOf: () => null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => null },
    ...more,
  };
}

const sent = (deps: PageDeps): string[] => {
  const read = readPage(deps, 'desk');
  assert.ok(read.ok, JSON.stringify(read));
  return read.value.blocks.filter((b: BlockResult) => b.drawn !== false).map((b) => b.heading ?? b.body ?? '');
};

const ALL = ['Yours alone', 'Only under the section.', 'Everybody', 'For every reader.'];
const REST = ['Everybody', 'For every reader.'];

test('A SECTION HELD TO ITS OWNER IS SENT TO THE OWNER, and not to a member', () => {
  const page = blocks({ reader: 'owner' });
  assert.deepEqual(sent(depsOver(page, { readerIs: 'owner' })), ALL);
  assert.deepEqual(sent(depsOver(page, { readerIs: 'member' })), REST);
  assert.deepEqual(sent(depsOver(page, { readerIs: 'link' })), REST);
  /* A list of words holds for any of them. */
  const two = blocks({ reader: ['owner', 'agent'] });
  assert.deepEqual(sent(depsOver(two, { readerIs: 'agent' })), ALL);
  assert.deepEqual(sent(depsOver(two, { readerIs: 'member' })), REST);
});

test('WITH NO READER SAID, A BLOCK THAT ASKS WHO READS IS NOT SENT', () => {
  const read = readPage(depsOver(blocks({ reader: 'owner' })), 'desk');
  assert.ok(read.ok);
  const [section, under] = read.value.blocks;
  assert.equal(section?.drawn, false);
  assert.equal(section?.why, 'when');
  assert.equal(under?.drawn, false);
  assert.deepEqual(under?.rows, []);
  assert.deepEqual(sent(depsOver(blocks({ reader: 'owner' }))), REST);
});

test('A READER OUTSIDE THE FOUR WORDS IS REFUSED, naming them, at install and by the tree check', () => {
  assert.deepEqual([...WHEN_READERS], ['owner', 'member', 'agent', 'link']);
  const said = whenTreeFault({ reader: 'guest' }, "page.desk.blocks[0]'s when");
  assert.equal(said, `page.desk.blocks[0]'s when says reader: "guest", and a reader is owner, member, agent or link.`);
  assert.match(whenTreeFault({ all: [{ metric: 'waiting', gt: 0 }, { reader: ['owner', 'guest'] }] }, 'when') ?? '', /all\[1\] says reader: "guest"/u);
  assert.match(whenTreeFault({ reader: [] }, 'when') ?? '', /names no reader/u);
  assert.match(whenTreeFault({ reader: 'owner', gt: 0 }, 'when') ?? '', /says reader and gt/u);
  assert.equal(whenTreeFault({ reader: 'owner' }, 'when'), null);

  const page = (when: unknown): Declaration => ({
    id: 'page.desk',
    kind: 'page',
    body: { page: 'desk', title: 'Desk', blocks: [{ kind: 'note', body: 'Said.', when }] } as Declaration['body'],
  });
  const refused = validateDeclaration(page({ reader: 'guest' }));
  assert.equal(refused?.code, 'DECLARATION_INVALID');
  assert.match(refused?.fix ?? '', /owner, member, agent or link/u);
  assert.equal(validateDeclaration(page({ reader: 'owner' })), null, 'the install admits a reader leaf');
  /* A reader word is never sent to the read as a figure to look up. */
  assert.deepEqual(whenLeaves({ all: [{ reader: 'owner' }, { metric: 'waiting', gt: 0 }] }), [{ metric: 'waiting', gt: 0 }]);
});

test('A READER INSIDE AN all: WITH A FIGURE HOLDS ONLY WHILE BOTH DO', () => {
  const page = blocks({ all: [{ reader: 'owner' }, { metric: 'waiting', gt: 0 }] });
  assert.deepEqual(sent(depsOver(page, { readerIs: 'owner' })), ALL);
  assert.deepEqual(sent(depsOver(page, { readerIs: 'owner' }, 0)), REST, 'nothing waits');
  assert.deepEqual(sent(depsOver(page, { readerIs: 'member' })), REST, 'not the owner');
  /* And in an any:, either holding is enough. */
  const either = blocks({ any: [{ reader: 'owner' }, { metric: 'waiting', gt: 0 }] });
  assert.deepEqual(sent(depsOver(either, { readerIs: 'member' })), ALL);
  assert.deepEqual(sent(depsOver(either, { readerIs: 'member' }, 0)), REST);
});
