/**
 * The declared actions' plan (`./actions.ts`): how many are shown, what folds, and what the string drawer prints.
 * Invented labels only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';
import { actionLabels, actionsPlan, HARD_WORD, type Action, type OnAct } from './actions.ts';
import { parse, type Block } from './parse.ts';

/* `parity.test.ts`'s hook, so `Block.svelte` can be drawn on the server here. */
registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

const make = (n: number): Action[] =>
  ['Brew', 'Steep', 'Pour', 'Stir', 'Sip'].slice(0, n).map((label, i) => ({ verb: `row.update`, label, args: { step: i } }));

const counts = (list: readonly Action[], narrow = false) => {
  const p = actionsPlan(list, { narrow });
  return [p.shown.length, p.menu.length, p.fold] as const;
};

test('one, three and five actions plan as one and none, three and none, three and two in a menu', () => {
  assert.deepEqual(counts(make(1)), [1, 0, null]);
  assert.deepEqual(counts(make(3)), [3, 0, null]);
  assert.deepEqual(counts(make(5)), [3, 2, 'menu']);
  assert.deepEqual(
    actionsPlan(make(5)).menu.map((a) => a.label),
    ['Stir', 'Sip'],
    'the folded ones keep the declared order',
  );
});

test('on a phone one is shown and the rest wait in a sheet', () => {
  assert.deepEqual(counts(make(1), true), [1, 0, null]);
  assert.deepEqual(counts(make(3), true), [1, 2, 'sheet']);
  assert.deepEqual(counts(make(5), true), [1, 4, 'sheet']);
  assert.equal(actionsPlan(make(5), { narrow: true }).shown[0]!.label, 'Brew');
});

test('the first plain button is the one primary, and never a hard one or a switch', () => {
  const plan = actionsPlan(make(3));
  assert.deepEqual(plan.shown.map((a) => a.primary), [true, false, false]);
  const hard = actionsPlan([{ verb: 'row.delete', label: 'Toss the kettle', hard: true }, ...make(1)]);
  assert.deepEqual(hard.shown.map((a) => a.primary), [false, false]);
  const sw = actionsPlan([{ verb: 'row.update', label: 'Keep warm', as: 'switch', on: true }]);
  assert.equal(sw.shown[0]!.kind, 'switch');
  assert.equal(sw.shown[0]!.primary, false);
});

test('a hard action keeps its mark wherever it lands, shown or folded', () => {
  const list: Action[] = [...make(4), { verb: 'row.delete', label: 'Toss the kettle', hard: true }];
  const wide = actionsPlan(list);
  assert.equal(wide.menu.at(-1)!.hard, true);
  const narrow = actionsPlan(list, { narrow: true });
  assert.equal(narrow.menu.at(-1)!.hard, true);
  assert.equal(narrow.menu.at(-1)!.label, 'Toss the kettle');
});

test('a kind falls back to a button when it cannot be drawn as declared', () => {
  const plan = actionsPlan([
    { verb: 'row.update', label: 'Roast', as: 'choice', choices: ['Light'] },
    { verb: 'row.update', label: 'Grind', as: 'choice', choices: ['Fine', 'Coarse'], value: 'Fine' },
    { verb: 'row.update', label: 'Open the menu', as: 'link' },
    { verb: 'row.update', label: 'Copy the blend', as: 'copy' },
    { verb: 'row.update', label: 'Odd', as: 'dial' as never },
  ]);
  assert.deepEqual(
    [...plan.shown, ...plan.menu].map((a) => a.kind),
    ['button', 'choice', 'button', 'copy', 'button'],
  );
  assert.equal(actionsPlan([{ verb: 'row.update', label: 'Recipe', as: 'link', href: '/r/recipes' }]).shown[0]!.kind, 'link');
});

test('an action with no label is not drawn, never shown as its verb', () => {
  const plan = actionsPlan([{ verb: 'row.tick', label: '  ' }, null, 'row.move', ...make(1)] as unknown[]);
  assert.deepEqual(plan.shown.map((a) => a.label), ['Brew']);
  assert.deepEqual(actionsPlan(undefined), { shown: [], menu: [], fold: null });
});

test('the string drawer gets labels only, a hard one with its word', () => {
  const list: Action[] = [...make(2), { verb: 'row.delete', label: 'Toss the kettle', hard: true }];
  assert.deepEqual(actionLabels(list), ['Brew', 'Steep', `Toss the kettle (${HARD_WORD})`]);
  for (const l of actionLabels(list)) assert.doesNotMatch(l, /row\.|<|button/u, 'no verb and no control in what is printed');
  assert.deepEqual(actionLabels(null), []);
});

type Props = { block: Block & { actions?: readonly Action[] }; act?: OnAct };
/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const load = async (path: string): Promise<Component<Props>> =>
  ((await import(new URL(path, import.meta.url).href)) as { default: Component<Props> }).default;

const fence = (): Block => parse('```stat | Kettle\nCups today | 4\n```')[0] as Block;
const buttons = (html: string): string[] =>
  [...html.matchAll(/<button type="button" class="actions-btn[^"]*"[^>]*>([^<]*)/gu)].map((m) => m[1]!);

test('a block handed two actions and an act draws two buttons, the first the primary', async () => {
  const Draw = await load('../svelte/Block.svelte');
  const block = { ...fence(), actions: make(2) };
  const html = render(Draw, { props: { block, act: () => {} } }).body;
  assert.deepEqual(buttons(html), ['Brew', 'Steep']);
  assert.match(html, /class="actions-btn[^"]*" data-primary=""[^>]*>Brew/u);
  assert.doesNotMatch(html, /aria-haspopup/u, 'two fold into nothing');
});

test('with no actions the block draws as it always did, and with no act its labels are one line and no control', async () => {
  const Draw = await load('../svelte/Block.svelte');
  const plain = render(Draw, { props: { block: fence() } }).body;
  assert.equal(render(Draw, { props: { block: fence(), act: () => {} } }).body, plain, 'no actions, no change');
  assert.doesNotMatch(plain, /actions/u);
  const preview = render(Draw, { props: { block: { ...fence(), actions: make(2) } } }).body;
  assert.doesNotMatch(preview, /<button|<a /u, 'a preview has no hand to press with');
  assert.match(preview, /<p class="block-actions">Brew · Steep<\/p>(<!--[^>]*-->)*<\/figure>/u, 'its labels in one quiet line, as the string drawer prints them');
});

test('five actions on a wide block are three buttons and one menu button with its count', async () => {
  const Draw = await load('../svelte/Block.svelte');
  const html = render(Draw, { props: { block: { ...fence(), actions: make(5) }, act: () => {} } }).body;
  assert.deepEqual(buttons(html).slice(0, 3), ['Brew', 'Steep', 'Pour']);
  assert.match(html, /aria-haspopup="menu" aria-expanded="false"[^>]*>More<span class="actions-count[^"]*">2</u);
});
