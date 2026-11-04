import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DOCKS, EXIT_MOST, FLICK, FLICK_MIN, FLICK_WINDOW, LET_GO, NARROW, PHONE, PHONE_WIDTH, Pull, STALL, Scrims, formOf, letGo, settled, step, unstall } from './panel.ts';

/** Every promise the code under test has settled, handled. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test('a narrow window gets a bottom sheet, and a wide one the docked panel', () => {
  assert.equal(formOf(true), 'sheet');
  assert.equal(formOf(false), 'docked');
});

test('the panel docks from one width, and a phone starts at another below it, both said once', () => {
  assert.equal(NARROW, `(width < ${DOCKS}px)`);
  assert.equal(PHONE_WIDTH, `(width < ${PHONE}px)`);
  assert.ok(PHONE < DOCKS);
  /* THE SHELL'S DOCK COLUMN OPENS WHERE THE PANEL DOCKS, so a docked panel always has its column and a sheet never does. */
  const shell = readFileSync(new URL('../shell/AppFrame.svelte', import.meta.url), 'utf8');
  assert.match(shell, new RegExp(`@media \\(width >= ${DOCKS}px\\) \\{\\s*\\.shell \\{\\s*grid-template-columns: [^;]*var\\(--dock-col`));
});

test('opening shows the docked panel without a modal, and the sheet with one', () => {
  assert.equal(step({ open: true, form: 'docked' }, { open: false, modal: false }), 'show');
  assert.equal(step({ open: true, form: 'sheet' }, { open: false, modal: false }), 'showModal');
});

test('an open panel in the form asked for is left alone', () => {
  assert.equal(step({ open: true, form: 'docked' }, { open: true, modal: false }), null);
  assert.equal(step({ open: true, form: 'sheet' }, { open: true, modal: true }), null);
});

test('crossing 1,280 while open reopens it in the other form rather than closing it', () => {
  assert.equal(step({ open: true, form: 'sheet' }, { open: true, modal: false }), 'reopen');
  assert.equal(step({ open: true, form: 'docked' }, { open: true, modal: true }), 'reopen');
});

test('closing closes whichever form is open, and a closed panel stays closed', () => {
  assert.equal(step({ open: false, form: 'docked' }, { open: true, modal: false }), 'close');
  assert.equal(step({ open: false, form: 'sheet' }, { open: true, modal: true }), 'close');
  assert.equal(step({ open: false, form: 'sheet' }, { open: false, modal: false }), null);
});

/* ── letting a bottom sheet go ───────────────────────────────────────────── */

/** A sheet as tall as a phone sheet with a short form in it. */
const TALL = 420;

test('A SHEET DRAWN PAST A THIRD OF ITS HEIGHT CLOSES, and one short of it goes back', () => {
  assert.equal(letGo(TALL * LET_GO + 1, TALL, 0), true, 'a slow pull past a third left the sheet open');
  assert.equal(letGo(TALL * LET_GO - 1, TALL, 0), false, 'a slow pull short of a third closed the sheet');
  /* The third is of THIS sheet: the same pull closes a short sheet and not a tall one. */
  assert.equal(letGo(120, 300, 0), true);
  assert.equal(letGo(120, 600, 0), false, 'the threshold did not follow the height of the sheet');
});

test('a flick closes it from anywhere, but a tap that jitters is not a flick', () => {
  assert.equal(letGo(FLICK_MIN, TALL, FLICK), true, 'a throw short of a third left the sheet open');
  assert.equal(letGo(FLICK_MIN, TALL, FLICK - 0.01), false, 'a drag slower than a flick closed the sheet');
  assert.equal(letGo(FLICK_MIN - 1, TALL, FLICK * 4), false, 'a few pixels of jitter at speed closed the sheet');
});

test('A PULL FOLLOWS THE FINGER DOWN AND NEVER ABOVE WHERE THE SHEET RESTS', () => {
  const pull = new Pull();
  assert.equal(pull.held, false);
  assert.equal(pull.move(500, 0), 0, 'a move with nothing grabbed drew the sheet');

  pull.grab(400, 0);
  assert.equal(pull.held, true);
  assert.equal(pull.move(460, 16), 60);
  assert.equal(pull.move(380, 32), 0, 'the sheet was drawn up past where it rests');
});

test('a pull let go past a third closes, however slowly it was drawn', () => {
  const pull = new Pull();
  pull.grab(400, 0);
  for (let t = 16, y = 400; y < 560; t += 16, y += 4) pull.move(y, t);
  assert.equal(pull.drop(560, 656, TALL), true, 'a slow pull of 160 on a 420 sheet went back');
  assert.equal(pull.held, false, 'the pull was still held after the release');
});

test('A THROW CLOSES THE SHEET, measured over the end of the pull and not the whole of it', () => {
  const pull = new Pull();
  pull.grab(400, 0);
  /* Slowly for a second, and then 40px in the last 50ms: 0.8 a millisecond at the moment it is let go. */
  pull.move(420, 1000);
  pull.move(440, 1025);
  assert.equal(pull.drop(460, 1050, TALL), true, 'a throw at the end of a slow pull was read as a slow pull');
});

test('a pull that stops before it is let go is somebody keeping the sheet', () => {
  const pull = new Pull();
  pull.grab(400, 0);
  pull.move(440, 30);
  pull.move(480, 60);
  /* Fast, and then still for longer than the window looks back. */
  assert.equal(pull.drop(480, 60 + FLICK_WINDOW + 50, TALL), false, 'a pull that had stopped was taken for a flick');
});

test('a cancelled pointer goes back unless it was already past a third', () => {
  const fast = new Pull();
  fast.grab(400, 0);
  fast.move(440, 20);
  assert.equal(fast.drop(460, 40, TALL, true), false, 'a cancelled pointer was read as a flick');

  const far = new Pull();
  far.grab(400, 0);
  far.move(600, 400);
  assert.equal(far.drop(600, 400, TALL, true), true, 'a sheet drawn past a third went back because the pointer was cancelled');
});

test('a release with nothing grabbed closes nothing', () => {
  assert.equal(new Pull().drop(900, 10, TALL), false);
});

/* ── an opening that never starts ────────────────────────────────────────── */

/** An opening whose first frame comes when the test says, or never. */
function opening() {
  let begin = () => {};
  const a = {
    ready: new Promise<unknown>((resolve) => (begin = () => resolve(undefined))),
    playState: 'running',
    finished: 0,
    finish() {
      this.finished++;
      this.playState = 'finished';
    },
  };
  return { el: { getAnimations: () => [a] }, a, begin: () => begin() };
}

test('AN OPENING STILL WAITING FOR ITS FIRST FRAME IS FINISHED, so a stall shows the panel in place', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { el, a } = opening();
  unstall(el);

  t.mock.timers.tick(STALL - 1);
  assert.equal(a.finished, 0, 'an opening was cut short before it had been given its time');
  t.mock.timers.tick(1);
  assert.equal(a.finished, 1, 'an opening that never began left the panel out of sight');
});

test('and one that began on time is left to play', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { el, a, begin } = opening();
  unstall(el);

  begin();
  await settle();
  t.mock.timers.tick(STALL * 2);
  assert.equal(a.finished, 0, 'a slide that had started was cut to its end');

  /* Nothing moving is nothing to do, and no browser support is the same. */
  unstall({ getAnimations: () => [] });
  unstall({});
});

/* ── an exit, to its end ─────────────────────────────────────────────────── */

/** An element with these exits running, each one a promise the test settles by hand. */
function moving(count: number) {
  const ends: { resolve: () => void; reject: () => void }[] = [];
  const animations = Array.from({ length: count }, () => ({
    finished: new Promise<unknown>((resolve, reject) => ends.push({ resolve: () => resolve(undefined), reject })),
  }));
  return { el: { getAnimations: () => animations }, ends };
}

test('AN ELEMENT WITH NOTHING MOVING IS DONE AT ONCE, so an exit nobody started cannot strand it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let done = 0;
  settled({ getAnimations: () => [] }, () => done++);
  assert.equal(done, 1, 'an element with no exit running waited for one');

  /* A browser with no Web Animations at all is the same answer. */
  settled({}, () => done++);
  assert.equal(done, 2);

  t.mock.timers.tick(EXIT_MOST * 2);
  assert.equal(done, 2, 'the fallback fired as well, so the element was let go twice');
});

test('an exit is waited for to its end, every part of it, and once', async () => {
  const { el, ends } = moving(2);
  let done = 0;
  settled(el, () => done++);

  ends[0]!.resolve();
  await settle();
  assert.equal(done, 0, 'the element was let go before the second half of its exit had finished');

  ends[1]!.resolve();
  await settle();
  assert.equal(done, 1, 'the element was never let go after its exit finished');
});

test('a cancelled exit counts as over, and one that never reports is let go after the longest wait', async (t) => {
  const cancelled = moving(1);
  let gone = 0;
  settled(cancelled.el, () => gone++);
  cancelled.ends[0]!.reject();
  await settle();
  assert.equal(gone, 1, 'a cancelled exit left the element on the page');

  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stuck = moving(1);
  let freed = 0;
  settled(stuck.el, () => freed++);
  t.mock.timers.tick(EXIT_MOST - 1);
  assert.equal(freed, 0);
  t.mock.timers.tick(1);
  assert.equal(freed, 1, 'an exit that never reported kept the element on the page for good');
});

test('AN EXIT CALLED OFF NEVER LETS THE ELEMENT GO, which is a menu opened again on its way out', async () => {
  const { el, ends } = moving(1);
  let done = 0;
  const off = settled(el, () => done++);
  off();
  ends[0]!.resolve();
  await settle();
  assert.equal(done, 0, 'an exit that was taken back still took the element off the page');
});

/* ── a scrim over the window ─────────────────────────────────────────────── */

test('A SCRIM IS UP FROM THE FIRST LAYING TO THE LAST LIFT, and the watcher hears each change once', () => {
  const scrims = new Scrims();
  const heard: boolean[] = [];
  const stop = scrims.watch((up) => heard.push(up));
  assert.deepEqual(heard, [false], 'a watcher was not told where things stand when it started');

  const sheet = scrims.lay();
  const menu = scrims.lay();
  assert.equal(scrims.up, true);
  assert.deepEqual(heard, [false, true], 'a second sheet over the first was told as a change');

  /* The first one laid goes first: the second is still over the window. */
  sheet();
  assert.equal(scrims.up, true, 'the scrim lifted while a sheet was still up');
  menu();
  assert.equal(scrims.up, false);
  assert.deepEqual(heard, [false, true, false]);

  stop();
  scrims.lay();
  assert.deepEqual(heard, [false, true, false], 'a watcher that stopped was still told');
});

test('a lift called twice lifts once, so a close and a destroy cannot take down somebody else\'s scrim', () => {
  const scrims = new Scrims();
  const mine = scrims.lay();
  const theirs = scrims.lay();
  mine();
  mine();
  assert.equal(scrims.up, true, 'a second lift of one laying took the other sheet\'s scrim with it');
  theirs();
  assert.equal(scrims.up, false);
});

/* ── one scale of motion ─────────────────────────────────────────────────── */

/**
 * EVERY OVERLAY AND EVERY PIECE OF CHROME MOVES ON THE SKIN'S SCALE, so a duration or a curve written out by hand here
 * is a step the scale cannot still, shorten or keep in step with the rest. Comments are taken out first: a sentence
 * may say "240ms" to explain what a token is.
 */
test('NO OVERLAY OR CHROME WRITES A DURATION OR A CURVE OF ITS OWN', () => {
  const files = ['Panel.svelte', 'Sheet.svelte', 'Menu.svelte', 'RowMenu.svelte', 'Toasts.svelte', 'Button.svelte', 'PageHead.svelte', 'controls.css', '../shell/TabBar.svelte', '../shell/SideBar.svelte', 'TopBar.svelte'];
  for (const file of files) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    const style = file.endsWith('.css') ? text : (text.match(/<style>([\s\S]*)<\/style>/u)?.[1] ?? '');
    const code = style.replace(/\/\*[\s\S]*?\*\//gu, '');
    /* A ZERO IS NO DURATION: `PageHead` clears a delay with `0s` (e183b9630), a step the scale has nothing to say about. */
    assert.doesNotMatch(code, /\b(?!0m?s\b)\d+(\.\d+)?m?s\b/u, `${file} writes a duration of its own`);
    assert.doesNotMatch(code, /cubic-bezier\(|linear\(/u, `${file} writes a curve of its own`);
  }
});

/**
 * GLASS ONLY ON FLOATING CHROME, THROUGH THE FILMS (04d4cf6d4, ops-look SPEC 1 rule 1): the toast, the sidebar card, the
 * phone bar and the glass controls wear `--glass-filter` or `--g-bf`, which reduced transparency takes off. The panel,
 * the frame and the controls' sheet draw none. `frame-gates.test.ts` holds the whole app to it; this names the overlays.
 */
test('no overlay or chrome blurs what is behind it but through the films, and the solid ones not at all', () => {
  for (const file of ['Panel.svelte', 'controls.css', '../shell/AppFrame.svelte']) {
    const code = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
    assert.doesNotMatch(code, /backdrop-filter|--glass/u, `${file} blurs or names the glass`);
  }
  for (const file of ['Toasts.svelte', 'Button.svelte', 'PageHead.svelte', '../shell/TabBar.svelte', '../shell/SideBar.svelte']) {
    const code = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
    const films = [...code.matchAll(/backdrop-filter:\s*([^;]+);/gu)].map((m) => m[1]!.trim());
    assert.ok(films.length > 0, `${file} is read as glass and holds none, so this checks nothing`);
    for (const film of films) assert.match(film, /^(?:none|var\(--(?:glass-filter|g-bf)\))$/u, `${file} writes a blur of its own`);
  }
});
