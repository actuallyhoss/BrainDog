/**
 * Cloudflare's script on the sign-up page: ready, a script error, the limit, and trying again after a failure,
 * on a stub document, so nothing is fetched. The strings are invented.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadWidget, reopenForCheck, TURNSTILE_SRC, WIDGET_MS, widgetWords, type WidgetDoc } from './turnstile.ts';

type StubScript = {
  src: string;
  async: boolean;
  dataset: Record<string, string>;
  fire(type: 'load' | 'error'): void;
  addEventListener(type: string, listener: () => void): void;
  remove(): void;
};

/** A document with a head that holds script tags, and a window `turnstile` can be put on. */
function stubDoc() {
  const win: { turnstile?: unknown } = {};
  const head: StubScript[] = [];
  const script = (): StubScript => {
    const on = new Map<string, (() => void)[]>();
    const s: StubScript = {
      src: '',
      async: false,
      dataset: {},
      fire: (type) => {
        const all = on.get(type) ?? [];
        on.delete(type);
        for (const f of all) f();
      },
      addEventListener: (type, listener) => void on.set(type, [...(on.get(type) ?? []), listener]),
      remove: () => {
        const i = head.indexOf(s);
        if (i >= 0) head.splice(i, 1);
      },
    };
    return s;
  };
  const doc = {
    defaultView: win,
    head: { append: (s: StubScript) => void head.push(s) },
    querySelector: (sel: string) => (sel === 'script[data-turnstile]' ? (head.find((s) => 'turnstile' in s.dataset) ?? null) : null),
    createElement: () => script(),
  };
  return { win, head, doc: doc as unknown as WidgetDoc };
}

const SRC = 'https://widget.example.test/check.js';

test('READY: one tag with the source, and ready when it loads and defines the global', async () => {
  const s = stubDoc();
  const out = loadWidget({ doc: s.doc, src: SRC, timeoutMs: 1_000 });
  assert.equal(s.head.length, 1);
  assert.equal(s.head[0]?.src, SRC);
  assert.equal(s.head[0]?.async, true);
  s.win.turnstile = { render: () => 'w1' };
  s.head[0]?.fire('load');
  assert.equal(await out, 'ready');
});

test('READY AT ONCE when the global is already there, and no tag is added', async () => {
  const s = stubDoc();
  s.win.turnstile = {};
  assert.equal(await loadWidget({ doc: s.doc, src: SRC }), 'ready');
  assert.equal(s.head.length, 0);
});

test('A SECOND CALL WHILE IT LOADS IS THE SAME LOAD, and still one tag', async () => {
  const s = stubDoc();
  const one = loadWidget({ doc: s.doc, src: SRC, timeoutMs: 1_000 });
  const two = loadWidget({ doc: s.doc, src: SRC, timeoutMs: 1_000 });
  assert.equal(one, two);
  assert.equal(s.head.length, 1);
  s.win.turnstile = {};
  s.head[0]?.fire('load');
  assert.equal(await two, 'ready');
});

test('A SCRIPT ERROR IS FAILED, well before the limit', async () => {
  const s = stubDoc();
  const began = Date.now();
  const out = loadWidget({ doc: s.doc, src: SRC, timeoutMs: 5_000 });
  s.head[0]?.fire('error');
  assert.equal(await out, 'failed');
  assert.ok(Date.now() - began < 1_000);
});

test('THE LIMIT: no global by then is failed, even after a load that defined nothing', async () => {
  const s = stubDoc();
  const out = loadWidget({ doc: s.doc, src: SRC, timeoutMs: 20 });
  s.head[0]?.fire('load');
  assert.equal(await out, 'failed');
  /* AND SILENCE, with neither event, ends the same way. */
  const quiet = stubDoc();
  assert.equal(await loadWidget({ doc: quiet.doc, src: SRC, timeoutMs: 20 }), 'failed');
});

test('A GLOBAL THAT LANDS AFTER THE LOAD, BEFORE THE LIMIT, IS READY', async () => {
  const s = stubDoc();
  const out = loadWidget({ doc: s.doc, src: SRC, timeoutMs: 30 });
  s.head[0]?.fire('load');
  s.win.turnstile = {};
  assert.equal(await out, 'ready');
});

test('TRY AGAIN AFTER FAILED: the old tag goes, one fresh one is added, and it can be ready', async () => {
  const s = stubDoc();
  const first = loadWidget({ doc: s.doc, src: SRC, timeoutMs: 1_000 });
  const failedTag = s.head[0];
  failedTag?.fire('error');
  assert.equal(await first, 'failed');

  const again = loadWidget({ doc: s.doc, src: SRC, timeoutMs: 1_000 });
  assert.equal(s.head.length, 1, 'one script tag at a time');
  assert.notEqual(s.head[0], failedTag);
  s.win.turnstile = {};
  s.head[0]?.fire('load');
  assert.equal(await again, 'ready');
});

test('THE DEFAULTS: Cloudflare\'s explicit script, and ten seconds', () => {
  assert.equal(WIDGET_MS, 10_000);
  assert.equal(TURNSTILE_SRC, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
});

test('THE WORDS: the failed line, a Send label for each wait, and no em dash', () => {
  assert.equal(widgetWords('failed').line, 'The check that you are a person did not load. Try again.');
  assert.equal(widgetWords('failed').again, 'Try again');
  assert.equal(widgetWords('loading').line, null);
  assert.equal(widgetWords('ready').line, null);
  for (const state of ['loading', 'ready', 'failed'] as const) {
    const w = widgetWords(state);
    assert.ok(w.send.length > 0);
    assert.ok(!JSON.stringify(w).includes('—'));
  }
});

test('A SIGN-IN SCREEN ON A PAGE THAT MAY NOT HOLD THE CHECK IS LOADED AFRESH, ONCE', () => {
  const at = (loaded: string, here: string) => {
    const replaced: string[] = [];
    const win = {
      location: { pathname: new URL(here).pathname, href: here, replace: (to: string) => replaced.push(to) },
      performance: { getEntriesByType: () => [{ name: loaded }] },
    } as unknown as Pick<Window, 'location' | 'performance'>;
    return { went: reopenForCheck(win), replaced };
  };
  assert.deepEqual(at('https://app.brain.dog/', 'https://app.brain.dog/signin?next=x'), { went: true, replaced: ['https://app.brain.dog/signin?next=x'] });
  assert.deepEqual(at('https://app.brain.dog/signin', 'https://app.brain.dog/signin'), { went: false, replaced: [] });
  assert.deepEqual(at('https://app.brain.dog/signin', 'https://app.brain.dog/signup'), { went: false, replaced: [] });
  assert.deepEqual(at('https://app.brain.dog/maya', 'https://app.brain.dog/maya/settings'), { went: false, replaced: [] });
});
