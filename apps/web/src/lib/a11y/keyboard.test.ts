/**
 * The `--kb` writer, driven by a viewport this file owns.
 *
 * THE THING WORTH TESTING IS THE ARITHMETIC AND THE TEARDOWN, not that a phone has a keyboard. A
 * browser gate cannot help here at all: Playwright has no way to raise iOS's keyboard, so the only
 * place the height calculation can be held to anything is a fake viewport whose numbers are chosen
 * to be the ones a real phone reports.
 *
 * The numbers below are an iPhone 14 at 390x844 with the stock keyboard, which is 336px.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { watchKeyboard, type KeyboardHost } from './keyboard.ts';

/**
 * The browser's own `Window` has to fit the shape the module asks for.
 *
 * Type only, so it never runs and costs nothing. Without it the interface could drift into a
 * convenient fiction that only the fake satisfies, and the one call site that passes a real
 * `window` lives in a `.svelte` file where a type error is easy to miss.
 */
type Assert<T extends KeyboardHost> = T;
export type WindowFitsTheHost = Assert<Window & typeof globalThis>;

function fake(innerHeight = 844) {
  const heard = new Map<string, Set<() => void>>();
  const props = new Map<string, string>();
  const attrs = new Map<string, string>();
  const view = {
    height: innerHeight,
    offsetTop: 0,
    addEventListener(type: string, fn: () => void) {
      (heard.get(type) ?? heard.set(type, new Set()).get(type))!.add(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      heard.get(type)?.delete(fn);
    },
  };
  const host: KeyboardHost = {
    innerHeight,
    visualViewport: view,
    document: {
      documentElement: {
        style: {
          setProperty: (name: string, value: string) => void props.set(name, value),
          removeProperty: (name: string) => void props.delete(name),
        },
        setAttribute: (name: string, value: string) => void attrs.set(name, value),
        removeAttribute: (name: string) => void attrs.delete(name),
      },
    },
  };
  const fire = (type: string) => {
    for (const fn of heard.get(type) ?? []) fn();
  };
  const listeners = () => [...heard.values()].reduce((n, set) => n + set.size, 0);
  return { host, view, props, attrs, fire, listeners };
}

test('THE KEYBOARD IS THE STRIP THE VISUAL VIEWPORT NO LONGER COVERS, and `--kb` is it', () => {
  const f = fake();
  const stop = watchKeyboard(f.host);
  assert.equal(f.props.get('--kb'), undefined, 'nothing is written while there is no keyboard');

  f.view.height = 508;
  f.fire('resize');
  assert.equal(f.props.get('--kb'), '336px', '844 minus 508 is the keyboard');
  assert.equal(f.attrs.get('data-kb'), '', 'and the bar that has to disappear is told');
  stop();
});

test('`scroll` IS HEARD TOO, because Safari slides the viewport without resizing it', () => {
  const f = fake();
  const stop = watchKeyboard(f.host);
  f.view.height = 508;
  f.fire('resize');
  assert.equal(f.props.get('--kb'), '336px');

  /* The caret is near the bottom, so Safari slides the visual viewport up by 120px. The height has
     not changed and a writer listening only for `resize` would still report 336, which is 120px
     short of the strip that is actually hidden. */
  f.view.offsetTop = 120;
  f.fire('scroll');
  assert.equal(f.props.get('--kb'), '216px', 'the slide comes off the height that is left');
  stop();
});

test('A COLLAPSING URL BAR IS NOT A KEYBOARD, and neither is a rounding error', () => {
  const f = fake();
  const stop = watchKeyboard(f.host);
  for (const height of [844, 800, 788, 764]) {
    f.view.height = height;
    f.fire('resize');
    assert.equal(f.props.get('--kb'), undefined, `${844 - height}px of chrome is not a keyboard`);
    assert.equal(f.attrs.get('data-kb'), undefined);
  }
  stop();
});

test('AND IT IS REMOVED RATHER THAN SET TO ZERO when the keyboard goes away', () => {
  const f = fake();
  const stop = watchKeyboard(f.host);
  f.view.height = 508;
  f.fire('resize');
  assert.equal(f.props.get('--kb'), '336px');

  f.view.height = 844;
  f.fire('resize');
  /* An inline `0px` here would be a second copy of the token's own default, written on the one
     element a theme cannot reach to change it. */
  assert.equal(f.props.get('--kb'), undefined, 'the token in tokens.css is what the page falls back to');
  assert.equal(f.attrs.get('data-kb'), undefined);
  stop();
});

test('STOPPING GIVES BACK BOTH LISTENERS AND BOTH WRITES', () => {
  const f = fake();
  const stop = watchKeyboard(f.host);
  assert.equal(f.listeners(), 2, 'resize and scroll');
  f.view.height = 508;
  f.fire('resize');
  assert.equal(f.props.get('--kb'), '336px');

  stop();
  assert.equal(f.listeners(), 0, 'a shell that unmounts leaves nothing behind');
  assert.equal(f.props.get('--kb'), undefined);
  assert.equal(f.attrs.get('data-kb'), undefined);

  f.view.height = 400;
  f.fire('resize');
  assert.equal(f.props.get('--kb'), undefined, 'and a fired event after teardown writes nothing');
});

test('A BROWSER WITH NO `visualViewport` STILL RUNS THE APP', () => {
  const f = fake();
  f.host.visualViewport = null;
  const stop = watchKeyboard(f.host);
  assert.equal(f.listeners(), 0);
  assert.doesNotThrow(stop, 'and tearing down is the same call whether or not it ever started');
  assert.equal(f.props.get('--kb'), undefined);
});
