/**
 * Money's first open: the setup opens on Money's home while there is no home currency or no account, for the owner, and
 * never again once done or skipped. The gate is compiled here for the server, as `offer-card.test.ts` compiles its card,
 * since `node --test` cannot load a `.svelte` file and the claim is about what Money's home draws.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { createRawSnippet, type Component, type Snippet } from 'svelte';
import type { CatalogueIndex } from '@braindog/declare/catalogue';

import { balanceOf, headsSection, installOrder, moneyAddons, setupDue, type SetupFacts } from './setup.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

const { default: SetupGate } = (await import(new URL('./SetupGate.svelte', import.meta.url).href)) as {
  default: Component<{ facts: SetupFacts | null; setup: Snippet<[() => void]>; children: Snippet }>;
};

const fresh: SetupFacts = { owner: true, live: true, home: true, currency: null, accounts: 0, dismissed: false };
const setup = createRawSnippet(() => ({ render: () => '<section data-setup>Set up Money</section>' }));
const children = createRawSnippet(() => ({ render: () => '<div data-board>Money</div>' }));
const drawn = (facts: SetupFacts | null): string => render(SetupGate, { props: { facts, setup, children } }).body;

test("A NEW RECORD'S MONEY OPENS ON THE SETUP, in the board's place", () => {
  const body = drawn(fresh);
  assert.match(body, /data-setup/u);
  assert.doesNotMatch(body, /data-board/u);
});

test('a currency and no account, or an account and no currency, still opens on it', () => {
  assert.match(drawn({ ...fresh, currency: 'GBP' }), /data-setup/u);
  assert.match(drawn({ ...fresh, accounts: 2 }), /data-setup/u);
});

test('MONEY WITH A CURRENCY AND AN ACCOUNT OPENS ON ITS BOARD', () => {
  const body = drawn({ ...fresh, currency: 'GBP', accounts: 1 });
  assert.match(body, /data-board/u);
  assert.doesNotMatch(body, /data-setup/u);
});

test('ONCE DONE OR SKIPPED IT NEVER SHOWS AGAIN, however empty Money is', () => {
  assert.match(drawn({ ...fresh, dismissed: true }), /data-board/u);
});

test('only the owner, only on a record that answered, and only on Money’s home', () => {
  assert.match(drawn({ ...fresh, owner: false }), /data-board/u);
  assert.match(drawn({ ...fresh, live: false }), /data-board/u);
  assert.match(drawn({ ...fresh, home: false }), /data-board/u);
  assert.match(drawn(null), /data-board/u);
});

test('setupDue is the gate’s one rule', () => {
  assert.equal(setupDue(fresh), true);
  assert.equal(setupDue({ ...fresh, currency: 'EGP', accounts: 3 }), false);
});

test('Money’s home is the first page of its section, never a row’s page', () => {
  const nav = [
    { id: 'home', section: 'Money', order: 10 },
    { id: 'accounts', section: 'Money', order: 11 },
    { id: 'tasks', section: 'Work', order: 5 },
    { id: 'one-account', section: 'Money', order: 1, row: true as const },
  ];
  assert.equal(headsSection(nav, 'home'), true);
  assert.equal(headsSection(nav, 'accounts'), false);
  assert.equal(headsSection(nav, 'one-account'), false);
  assert.equal(headsSection(nav, 'nowhere'), false);
});

/* ── the add-ons ── */

const version = (pages: string[], modules: string[] = [], calls = 0) => ({
  version: '1.0.0',
  checksum: '',
  bytes: 0,
  published_at: '',
  bump: null,
  reach: { modules, lists: [], pages, rules: [], examples: 0, skills: [], calls_out: Array.from({ length: calls }, () => ({ host: 'api.example.com', line: '', key: null })) },
});
const entry = (id: string, shelf: string, v: ReturnType<typeof version>, extra: Record<string, unknown> = {}) => ({
  kind: 'pack',
  id,
  title: id,
  summary: '',
  author: '',
  license: '',
  audience: '',
  latest: '1.0.0',
  versions: [v],
  shelf,
  ...extra,
});
const index = {
  format: 1,
  name: 'test',
  entries: [
    entry('jars', 'money', version(['Jars'])),
    entry('a-bank-feed', 'money', version([], [], 1)),
    entry('a-weekly-mail', 'money', version([])),
    entry('tithe', 'money', version(['Tithe'], ['core-money', 'jars'])),
    entry('reading', 'reading', version(['Books'])),
    entry('hidden', 'money', version(['Hidden']), { unlisted: true }),
  ],
} as unknown as CatalogueIndex;

test('THE MONEY ADD-ONS ARE THE STORE’S MONEY SHELF: a page of their own, no calling out, listed', () => {
  const got = moneyAddons(index);
  assert.deepEqual(got.map((a) => a.id), ['jars', 'tithe']);
  assert.deepEqual(got.find((a) => a.id === 'tithe')?.needs, ['jars']);
  assert.deepEqual(moneyAddons(null), []);
});

test('one chosen without what it needs brings that first, and one already on is passed over', () => {
  const addons = moneyAddons(index);
  assert.deepEqual(installOrder(['tithe'], addons).map((a) => a.id), ['jars', 'tithe']);
  assert.deepEqual(installOrder(['tithe', 'jars'], addons).map((a) => a.id), ['jars', 'tithe']);
  assert.deepEqual(installOrder(['tithe'], addons, new Set(['jars'])).map((a) => a.id), ['tithe']);
});

test('a first balance is typed as a person types it: grouped, zero, or owed on a card', () => {
  assert.equal(balanceOf('1,250.50', 'GBP'), 125050);
  assert.equal(balanceOf('0', 'GBP'), 0);
  assert.equal(balanceOf('-300', 'GBP'), -30000);
  assert.equal(balanceOf('1500', 'JPY'), 1500);
  assert.equal(balanceOf('1.234', 'GBP'), null);
  assert.equal(balanceOf('', 'GBP'), null);
  assert.equal(balanceOf('ten', 'GBP'), null);
});
