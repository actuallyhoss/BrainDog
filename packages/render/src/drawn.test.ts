/**
 * A drawn block's code is held to its rules, its document carries the policy and the bridge before the author's code,
 * it is handed only the fields its columns name, and the frame may ask for nothing but a height and one of its own rows.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DRAWN_CODE_MOST, DRAWN_EXAMPLE, DRAWN_HEIGHT, DRAWN_POLICY, DRAWN_ROWS_MOST, drawnAsk, drawnData, drawnDocument, drawnFault, drawnHeight, drawnTheme } from './drawn.ts';
import { KINDS } from './kinds.ts';

test('A DRAWN KIND IS ON THE TABLE, page-only, on the panel', () => {
  assert.equal(KINDS.drawn.primitive, 'panel');
  assert.equal(KINDS.drawn.pageOnly, true);
});

test('CODE THAT DRAWS WITH HTML, SVG, CSS AND A SCRIPT IS ADMITTED, the example and an SVG namespace included', () => {
  assert.equal(drawnFault(DRAWN_EXAMPLE), null);
  assert.equal(drawnFault('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4" fill="url(#g)"/></svg>'), null);
  assert.equal(drawnFault('<img src="data:image/png;base64,AAAA" alt="">'), null);
  assert.equal(drawnFault('<div style="background:url(data:image/svg+xml,abc)"></div>'), null);
  assert.equal(drawnFault(''), null);
});

test('AN ADDRESS OFF THE PAGE, THE NETWORK, STORAGE AND THE PAGE AROUND IT ARE EACH REFUSED IN WORDS', () => {
  const refused = [
    '<img src="https://example.com/a.png">',
    '<img src="//example.com/a.png">',
    '<div style="background:url(/x.png)"></div>',
    '<style>@import "x.css";</style>',
    '<link rel="stylesheet" href="x.css">',
    '<meta http-equiv="refresh" content="0">',
    '<iframe></iframe>',
    '<form></form>',
    '<!doctype html><html><body></body></html>',
    '<script>fetch("/api/boot")</script>',
    '<script>new WebSocket("x")</script>',
    '<script>localStorage.setItem("a", 1)</script>',
    '<script>document.cookie</script>',
    '<script>top.location = "x"</script>',
    '<script>window.open("x")</script>',
    '<script>import("x")</script>',
    '<a href="javascript:alert(1)">x</a>',
  ];
  for (const code of refused) {
    const fix = drawnFault(code);
    assert.ok(fix, `${code} was admitted`);
    assert.doesNotMatch(fix, /—/u);
  }
});

test('CODE PAST THE CAP IS REFUSED, counted in bytes', () => {
  assert.equal(drawnFault('a'.repeat(DRAWN_CODE_MOST)), null);
  assert.match(drawnFault('a'.repeat(DRAWN_CODE_MOST + 1)) ?? '', /longer than 64 KB/u);
  assert.ok(drawnFault('é'.repeat(DRAWN_CODE_MOST / 2 + 1)), 'two bytes a letter, past the cap');
});

test('A HEIGHT IS CLAMPED, and anything that is not a number is the first height', () => {
  assert.equal(drawnHeight(5), DRAWN_HEIGHT.least);
  assert.equal(drawnHeight(99999), DRAWN_HEIGHT.most);
  assert.equal(drawnHeight(300.4), 300);
  assert.equal(drawnHeight('300'), DRAWN_HEIGHT.first);
  assert.equal(drawnHeight(Number.NaN), DRAWN_HEIGHT.first);
});

test('THE DATA IS ONLY THE FIELDS THE COLUMNS NAME, each row by the spoken id it is opened by', () => {
  const data = drawnData({
    source: 'register.tasks',
    columns: [{ field: 'title', label: 'Task' }, { field: 'due' }],
    rows: [
      { seq: 3, fields: { title: 'Call Acme', due: '2026-10-22', secret: 'not handed in' } },
      { seq: 0, fields: { title: 'no seq' } },
      { fields: { title: 'no seq either' } },
    ],
  });
  assert.equal(data.list, 'tasks');
  assert.deepEqual(data.columns, [{ field: 'title', label: 'Task' }, { field: 'due', label: 'due' }]);
  assert.deepEqual(data.rows, [{ ref: 'tasks#3', fields: { title: 'Call Acme', due: '2026-10-22' } }]);
});

test('NO MORE ROWS THAN THE CAP ARE HANDED IN, and a value that is not JSON goes in as nothing', () => {
  const rows = Array.from({ length: DRAWN_ROWS_MOST + 5 }, (_, i) => ({ seq: i + 1, fields: { n: i === 0 ? Number.POSITIVE_INFINITY : i } }));
  const data = drawnData({ register: 'bills', columns: [{ field: 'n' }], rows });
  assert.equal(data.rows.length, DRAWN_ROWS_MOST);
  assert.equal(data.rows[0]?.fields.n, null);
});

test('THE THEME KEEPS ONLY VALUES THAT CANNOT END THEIR DECLARATION, and names red the accent', () => {
  const css: Record<string, string> = { '--ink': ' #101114 ', '--red': '#CF413A', '--tile': 'red; } body { display:none', '--font-ui': 'Geist, system-ui' };
  const theme = drawnTheme('dark', (name) => css[name] ?? '');
  assert.equal(theme.mode, 'dark');
  assert.equal(theme.tokens.ink, '#101114');
  assert.equal(theme.tokens.accent, '#CF413A');
  assert.equal(theme.tokens.font, 'Geist, system-ui');
  assert.equal(theme.tokens.tile, undefined);
});

test('THE DOCUMENT CARRIES THE POLICY, THEN THE GUARD, THEN THE START DATA, THEN THE BRIDGE, THEN THE CODE', () => {
  const doc = drawnDocument('<p id="mine">hi</p>', { data: { list: 'tasks', columns: [], rows: [{ ref: 'tasks#1', fields: { title: '</script><script>alert(1)</script>' } }] }, theme: { mode: 'light', tokens: {} } });
  const policy = doc.indexOf(DRAWN_POLICY);
  const guard = doc.indexOf('RTCPeerConnection');
  const start = doc.indexOf('id="braindog-start"');
  const bridge = doc.indexOf('window.braindog');
  const code = doc.indexOf('<p id="mine">');
  assert.ok(policy > 0 && policy < guard && guard < start && start < bridge && bridge < code, 'out of order');
  /* A VALUE CANNOT CLOSE THE START DATA'S SCRIPT TAG. */
  assert.equal(doc.split('</script>').length - 1, 3, 'a value closed a script tag');
  assert.match(DRAWN_POLICY, /default-src 'none'/u);
  assert.doesNotMatch(DRAWN_POLICY, /connect-src (?!'none')/u);
});

test('THE FRAME MAY ASK A HEIGHT, AND TO OPEN ONLY A ROW IT WAS HANDED', () => {
  const refs = new Set(['tasks#3']);
  assert.deepEqual(drawnAsk({ braindog: 'height', height: 20 }, refs), { height: DRAWN_HEIGHT.least });
  assert.deepEqual(drawnAsk({ braindog: 'open', ref: 'tasks#3' }, refs), { open: 'tasks#3' });
  assert.equal(drawnAsk({ braindog: 'open', ref: 'people#1' }, refs), null);
  assert.equal(drawnAsk({ braindog: 'open', ref: '/settings' }, refs), null);
  assert.equal(drawnAsk({ braindog: 'go', href: 'https://example.com' }, refs), null);
  assert.equal(drawnAsk('height', refs), null);
  assert.equal(drawnAsk({ braindog: 'height', height: '20' }, refs), null);
});
