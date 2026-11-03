/**
 * `g` then a letter, read from the rail (`goto.ts`). The page names are invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BINDINGS } from './bindings.ts';
import { chordOf, gotoOf, hrefOf, sayGoto, type Goto } from './goto.ts';

/** Where a letter goes in a list already read. */
const to = (list: readonly Goto[], key: string) => list.find((l) => l.key === key)?.href;

const LEARNT = { h: '/', d: '/decide', i: '/inbox', s: '/search', k: '/keychain', p: '/settings/plugins', ',': '/settings/appearance' };

test('the seven somebody learnt keep their letters, with or without the rail drawing them', () => {
  for (const rows of [[], [{ href: '/p/projects', name: 'Projects' }, { href: '/', name: 'Today' }]]) {
    const list = gotoOf(rows);
    for (const [key, href] of Object.entries(LEARNT)) assert.equal(to(list, key), href, `g ${key} no longer opens ${href}`);
  }
  /* Projects starts with a learnt letter, so it takes its next one and `g p` still opens Add-ons. */
  assert.equal(hrefOf([{ href: '/p/projects', name: 'Projects' }], 'r'), '/p/projects');
});

test('a rail with Money and Mail gives Money `m` and Mail `a`', () => {
  const list = gotoOf([
    { href: '/s/money', name: 'Money' },
    { href: '/p/mail', name: 'Mail' },
  ]);
  assert.equal(to(list, 'm'), '/s/money');
  assert.equal(to(list, 'a'), '/p/mail');
  assert.equal(hrefOf([{ href: '/s/money', name: 'Money' }], 'M'), '/s/money', 'a held Shift sent the letter nowhere');
});

test('a row that declares a letter gets it, before a name earlier in the rail can take it', () => {
  const list = gotoOf([
    { href: '/p/boxes', name: 'Xylo boxes' },
    { href: '/p/crates', name: 'Crates', key: 'x' },
  ]);
  assert.equal(to(list, 'x'), '/p/crates');
  assert.equal(to(list, 'y'), '/p/boxes');
});

test('a clash never gives one letter twice, and a row with no free letter gets none', () => {
  const list = gotoOf([
    { href: '/p/a', name: 'Hide' },
    { href: '/p/b', name: 'Hid' },
    { href: '/p/c', name: 'Dish', key: 'h' },
    { href: '/p/d', name: 'Dishcloth' },
    { href: '/p/d', name: 'Dish again' },
  ]);
  const keys = list.map((l) => l.key);
  assert.equal(new Set(keys).size, keys.length, `a letter given twice: ${keys.join(' ')}`);
  assert.equal(to(list, 'e'), '/p/a');
  assert.equal(list.filter((l) => l.href === '/p/b').length, 0, 'Hid has no free letter and still got one');
  assert.equal(list.filter((l) => l.href === '/p/d').length, 1, 'one place drawn twice got two letters');
  assert.equal(to(list, 'h'), '/', 'a declared letter took one somebody learnt');
});

test('`g` is never a target, and neither is a digit, which counts the rail', () => {
  const list = gotoOf([
    { href: '/p/garden', name: 'Garden' },
    { href: '/p/gg', name: 'Gg' },
    { href: '/p/one', name: '1 Tall', key: '1' },
    { href: '/p/two', name: 'Twig', key: 'g' },
  ]);
  assert.equal(to(list, 'g'), undefined);
  assert.equal(to(list, '1'), undefined);
  assert.equal(to(list, 'a'), '/p/garden');
  assert.equal(list.filter((l) => l.href === '/p/gg').length, 0);
  assert.equal(to(list, 't'), '/p/one');
  assert.equal(to(list, 'w'), '/p/two');
});

test('a learnt place the rail draws is said by the rail name, and an accent is its letter', () => {
  const list = gotoOf([
    { href: '/', name: 'Today' },
    { href: '/p/eclair', name: 'Éclairs' },
  ]);
  assert.equal(list.find((l) => l.key === 'h')?.name, 'Today');
  assert.equal(to(list, 'e'), '/p/eclair');
});

test('the sheet prints the same list, and the `g` row takes it', () => {
  const rows = [{ href: '/s/money', name: 'Money' }];
  const line = chordOf(gotoOf(rows));
  assert.equal(line.key, 'g then h d i s k p , m');
  assert.equal(line.label, 'Go to Today, Needs you, Inbox, Search, Keychain, Add-ons, Settings, Money');
  const row = BINDINGS.find((b) => b.id === 'goto')!;
  const was = { key: row.key, label: row.label };
  assert.equal(was.key, 'g then h d i s k p ,', 'before the layout hands a list, the row says the seven');
  sayGoto(rows);
  assert.deepEqual({ key: row.key, label: row.label }, line);
  Object.assign(row, was);
});

test('the layout holds no table of letters, and reaches this file only by a dynamic import', () => {
  const layout = readFileSync(new URL('../shell/AppFrame.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(layout, /const GOTO\b/u, 'the fixed table is back in the root layout');
  assert.doesNotMatch(layout, /^\s*import [^(]*a11y\/goto/mu, 'goto.ts is imported statically, so the entry script carries it');
  assert.match(layout, /import\('\$lib\/a11y\/goto\.ts'\)/u, 'the layout never loads goto.ts');
});

test('a rail drawn in the places order gives each place its letter, and `g m` opens Money', () => {
  const rail = [
    { href: '/', name: 'Today' },
    { href: '/decide', name: 'Needs you' },
    { href: '/p/work', name: 'Work' },
    { href: '/p/projects', name: 'Projects' },
    { href: '/p/money', name: 'Money' },
    { href: '/p/people', name: 'People' },
    { href: '/p/agents', name: 'Agents' },
    { href: '/audit', name: 'Activity' },
  ];
  const list = gotoOf(rail);
  assert.deepEqual(
    list.slice(7).map((l) => `${l.key} ${l.name}`),
    ['w Work', 'r Projects', 'm Money', 'e People', 'a Agents', 'c Activity'],
  );
  assert.equal(hrefOf(rail, 'm'), '/p/money');
});
