/**
 * The panel beside a list, walked in a real browser: `p` on the third task, a new due day, Save, Undo, `j`, Escape.
 *
 *   node tools/gates/walks/row-drawer.walk.mjs
 *
 * WHY THIS EXISTS (PGS-C04's guard). A list opens the one panel every declared page opens (`RowPanel`, through
 * `listHost` in `apps/web/src/lib/page/row-host.svelte.ts`), and each seam of that has a test: the host's walk and its
 * address in `row-host-list.test.ts`, the screen's keys in `routes/r/[register]/row-drawer.test.ts`, read from the
 * source. NOTHING HAD PRESSED IT. A key the window never hears, a Save that writes and a list that does not read its
 * tasks again, an Undo that is offered and puts nothing back: each passes every one of those tests, and the first
 * person to find it would be the person whose list it is.
 *
 * WHAT IT WALKS, in PGS-C04's own words: on a fresh record with ten tasks, open Tasks, press `p` on the third, change
 * its due day in the panel, press Save. The task in the list shows the new day at once, a toast offers Undo, Undo puts
 * the day back, and the list never left the screen. The address holds `?row=3` while the panel is open and no `row`
 * after Save or after Escape. With the panel open, `j` moves it to the fourth task. Then the same at 390, where the
 * panel is a bottom sheet. The desk's width is the gates' own (`WIDTHS` says why it is 1512).
 *
 * THE NEW DAY IS READ OFF THE LIST, NEVER OFF A FORMAT WRITTEN HERE. One of the ten tasks is already due on the day the
 * third is moved to, so "shows the new day" is "prints what that task prints", in whatever words this build prints a
 * day in. A walk that held its own idea of "21 Oct" would go red the day the list said "in three weeks".
 *
 * TWO HALVES. `STEPS` and `judge` are data and a pure function, tested without a browser
 * (`test/row-drawer-walk.test.mjs`): each promise taken away is red in the words of what was missing. The drive below
 * them only presses and reads, and hands what it read to `judge`.
 *
 * AND A PLANTED FAULT (`BRAINDOG_GATE_SEED=row-drawer`, `seeded` and `planted` below). `self-test` runs the walk again
 * with the panel read after `j` as still on the third task, and the walk must go red on it, so a walk that passes while
 * looking at nothing is a red line in `self-test` and not a green one here.
 *
 * NO BUILD, NO RUN. It says it walked nothing and returns 3, which `run.mjs` counts as a skip and never as a pass.
 * ITS OWN EPHEMERAL PORT (`server.listen(0)`), for the reason `queue.mjs` gives: a fixed port is one a second run finds
 * taken. Every handle it opens is given back in one `finally`, however it leaves.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, STATUS_CODES } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { chromium } from '@playwright/test';

import { APP_BASE, appShell, budget, openPage, readiness } from '../lib.mjs';
import { answers, forward, forwards, serverKeyFor, startRecord } from '../record.mjs';

/* THE PREREQUISITE IS THE RUNNER'S QUESTION (`52 §5.1` step 2): it reads this line before it calls the walk. */
export const needs = ['web-build'];

/**
 * The widths the walk is made at: the desk, where the panel stands beside the list, and the phone's, where it is a
 * bottom sheet. They are the two every screen is audited at (`budgets.json`, `a11y.widths`), so the desk is 1512 and
 * not the 1440 PGS-C04 names: 1512 took 1440's place in the gates on 2 October, and the panel docks from 1,280 up.
 */
export const WIDTHS = budget('a11y').widths;

/** The ten tasks by name, in the order they are written, so the record numbers them from 1 and the third is `?row=3`. */
const NAMES = [
  'Order the paper samples',
  'Book the print slot',
  'Send the proofs to Halden',
  'Check the colour profiles',
  'Renew the font licence',
  'Write the release note',
  'Back up the source files',
  'Answer the reseller',
  'Update the specimen page',
  'Close the quarter',
];

/**
 * Each task with the days from the record's own day it is due in: one day after the task before it, and the last a
 * good way past them all. So the list reads in this order whether it is ordered by number or by due day, and no two
 * tasks share a day.
 */
export const TASKS = NAMES.map((what, i) => ({ what, due: i + 1 + (i + 1 === NAMES.length ? NAMES.length : 1) }));

/** The task `p` is pressed on, and the one `j` then moves the panel to, by their place among the ten. */
export const OPENED = NAMES.indexOf('Send the proofs to Halden') + 1;
export const WALKED = OPENED + 1;
/** The task that is already due on the day the third is moved to, so the list itself says how that day is printed: the last. */
export const NEW_DAY_TASK = TASKS.length;

/**
 * What the walk does, in order. `key` is the key a step presses, where it presses one.
 *
 * THE DRIVE RUNS THESE AND NOTHING ELSE: it holds one function per `id` and walks this list, so a step taken out here
 * is a step not walked, and the test reads the same list a run does.
 */
export const STEPS = [
  { id: 'list', does: 'Open the tasks list and read the third task and the day it is due.' },
  { id: 'open', key: 'p', does: 'Put the cursor on the third task and press p. Read the address and the panel.' },
  { id: 'type', does: 'Change the due day in the panel to the day the tenth task is due.' },
  { id: 'save', does: 'Press Save. Read the list, the toast and the address.' },
  { id: 'undo', does: 'Press Undo on the toast. Read the day in the list again.' },
  { id: 'reopen', key: 'p', does: 'Press p on the third task again. Read the address and the panel.' },
  { id: 'walk', key: 'j', does: 'Press j with the panel open. Read the address and the panel.' },
  { id: 'escape', key: 'Escape', does: 'Press Escape. Read the address and whether the panel is still open.' },
];

/**
 * Which form the panel is in, from where it sits on the screen: `bottom sheet`, `side panel`, `neither`, or `null`
 * when there is no panel.
 *
 * FROM THE BOX AND NOT FROM THE WIDTH. A bottom sheet spans the screen and rests on its bottom edge, with the list
 * showing above it; a side panel stands in the end half of the screen, no wider than half of it and most of its height,
 * so the list keeps the rest. What the panel calls itself (`data-form`) is not asked: below 1,280 it is a sheet in name
 * and a drawer at the edge to look at, and the promise is about what a person sees.
 */
export function formOf(box, screen) {
  if (box === null || box === undefined) return null;
  const near = (a, b) => Math.abs(a - b) <= 1;
  /** At least half of `whole`, said without a number: what is left of it is no more than `part`. */
  const half = (part, whole) => part >= whole - part;
  if (near(box.left, 0) && near(box.width, screen.width) && near(box.top + box.height, screen.height) && box.top > 0) return 'bottom sheet';
  if (half(box.left, screen.width) && !half(box.width, screen.width) && half(box.height, screen.height)) return 'side panel';
  return 'neither';
}

/**
 * What one walk fell short of, each as a sentence that starts with its width. An empty list is a pass.
 *
 * `seen` IS WHAT THE DRIVE READ AT ONE WIDTH, and nothing here touches a browser:
 *
 *   { width, form, third, fourth,
 *     day: { before, wanted, saved, undone },      what the list prints for the third task's due day, and for the tenth's
 *     opened: { row, task },                       the address's `row` and the panel's task, after `p`
 *     saved: { row, toast, undo, listed },         after Save: the address, the toast's words, its Undo, the list still drawn
 *     reopened: { row, task }, walked: { row, task }, escaped: { row, open } }
 *
 * A VALUE THE DRIVE COULD NOT READ IS `null`, AND `null` IS NEVER A PASS: a step that threw leaves what follows unread,
 * and an unread promise is a broken one here.
 */
export function judge(seen) {
  const out = [];
  const say = (line) => out.push(`${seen.width}: ${line}`);
  const third = `"${seen.third}"`;
  const row = (r) => (r === null || r === undefined ? 'no row' : `row=${r}`);
  const want = String(OPENED);
  const day = seen.day ?? {};
  const opened = seen.opened ?? {};
  const saved = seen.saved ?? {};
  const reopened = seen.reopened ?? {};
  const walked = seen.walked ?? {};
  const escaped = seen.escaped ?? {};

  /* THE FORM: a bottom sheet at the narrowest width walked, the phone's, and a panel beside the list at the desk's. */
  const phone = seen.width === Math.min(...WIDTHS);
  if (seen.form === null || seen.form === undefined) say(`pressing p on ${third} opened no panel.`);
  else if (phone && seen.form !== 'bottom sheet') say(`the panel is not a bottom sheet at this width: it is ${seen.form}.`);
  else if (!phone && seen.form !== 'side panel') say(`the panel does not stand beside the list at this width: it is ${seen.form}.`);

  /* `p` OPENS THE THIRD TASK, AND THE ADDRESS SAYS WHICH. */
  if (opened.row !== want) say(`the address holds ${row(opened.row)} while the panel is open on ${third}, not row=${want}.`);
  if (opened.task !== seen.third) say(`p on the third task opened ${opened.task ? `"${opened.task}"` : 'nothing that names a task'}, not ${third}.`);

  /* THE DAY, HELD AGAINST THE TASK THAT ALREADY HAS IT. Without that reading nothing below proves anything. */
  if (!day.wanted || !day.before) say(`the day a task is due could not be read off the list (${third} prints ${day.before ?? 'nothing'}, the task already due that day prints ${day.wanted ?? 'nothing'}), so Save and Undo were not judged.`);
  else if (day.before === day.wanted) say(`${third} already printed the new day (${day.wanted}) before anything was typed, so a Save that wrote nothing would pass.`);
  else {
    if (!day.saved) say(`after Save the list prints no day for ${third}, so it does not show the new day (${day.wanted}).`);
    else if (day.saved !== day.wanted) say(`after Save the list still shows ${day.saved} for ${third}, not the new day (${day.wanted}).`);
    if (day.undone !== day.before) say(`Undo did not put the day back: the list shows ${day.undone ?? 'nothing'} for ${third}, and it was ${day.before}.`);
  }

  /* SAVE: A TOAST THAT OFFERS UNDO, THE LIST STILL ON THE SCREEN, AND NO ROW IN THE ADDRESS. */
  if (!saved.toast) say('Save drew no toast, so nothing said the task was saved and nothing offered Undo.');
  else if (saved.undo !== true) say(`the toast after Save ("${saved.toast}") offers no Undo.`);
  if (saved.listed !== true) say('the list left the screen at Save.');
  if (saved.row !== null && saved.row !== undefined) say(`the address still holds ${row(saved.row)} after Save.`);

  /* OPEN AGAIN, THEN `j`: the panel and the address move to the fourth task. */
  if (reopened.row !== want || reopened.task !== seen.third)
    say(`p a second time opened ${reopened.task ? `"${reopened.task}"` : 'nothing'} at ${row(reopened.row)}, not ${third} at row=${want}.`);
  if (walked.task !== seen.fourth) say(`j did not move the panel to the fourth task, "${seen.fourth}": it shows ${walked.task ? `"${walked.task}"` : 'nothing'}.`);
  if (walked.row !== String(WALKED)) say(`after j the address holds ${row(walked.row)}, not row=${WALKED}.`);

  /* ESCAPE CLOSES IT AND TAKES THE ROW OUT OF THE ADDRESS. */
  if (escaped.open !== false) say('the panel is still open after Escape.');
  if (escaped.row !== null && escaped.row !== undefined) say(`the address still holds ${row(escaped.row)} after Escape.`);

  return out;
}

/**
 * THE WALK'S OWN PROOF THAT IT LOOKS AT ANYTHING (`self-test`, as `queue`, `keys` and `prefs` have theirs). True when
 * `BRAINDOG_GATE_SEED` names `row-drawer`, alone or among others joined by commas, as `seedsOf` reads it in `a11y.mjs`.
 * Another gate's seed is not this walk's and plants nothing here.
 *
 * READ FROM THE VARIABLE AND NOTHING ELSE: no argument, no file, so a run nobody seeded cannot be a seeded one.
 */
export function seeded(value = process.env.BRAINDOG_GATE_SEED) {
  return (value ?? '').split(',').some((s) => s.trim() === 'row-drawer');
}

/** The planted fault, in the words the seeded run says it planted. */
export const PLANT = 'the panel read after j as still on the third task';

/**
 * WHAT A SEEDED WALK HANDS `judge`: what it read, with the reading after `j` put back on the third task, as a panel
 * that never moved would read. PLANTED IN WHAT THE WALK READ AND NEVER IN THE APP: the page is pressed exactly as a real
 * run presses it, and only this copy differs, so a judge that stopped looking at `j` would pass it and `self-test` would
 * say so. Everything else in `seen` is handed on unchanged.
 */
export function planted(seen) {
  return { ...seen, walked: { row: String(OPENED), task: seen.third } };
}

/** What the drive hands `judge`: the planted reading in a seeded run, and in any other run what it read, itself. */
export const handed = (seen, on = seeded()) => (on ? planted(seen) : seen);

/** Whether the walk read `j` working, so the planted reading replaced a true one and the seeded red is the seed's. */
export const walkedTrue = (seen) => seen.walked?.task === seen.fourth && seen.walked?.row === String(WALKED);

/* ── the drive ────────────────────────────────────────────────────────────── */

/** The list the walk opens, its title box and its due box in the panel (`RowForm`'s ids, `new-<list>-<field>`), and
    the headings the list gives the title and the due day. All are the seed's own Tasks list (`packages/seed/src/modules/work.ts`). */
const LIST = 'tasks';
const TITLE_BOX = `new-${LIST}-what`;
const DUE_BOX = `new-${LIST}-by`;
const TITLE_HEAD = 'Task';
const DUE_HEAD = 'Due';

/**
 * Everything the walk reads, read in one look, in the page. Self-contained: it runs in the browser.
 *
 *   { tasks: [{ what, day }], row, path, panel: { open, task, box } | null, toast: { text, undo } | null, screen }
 *
 * THE LIST IS READ IN WHICHEVER FORM IT IS DRAWN IN: a table from 900 up, where the task is the cell under the title's
 * heading and the day the cell under the Due heading, and cards on a phone, where it is the card's second line less the chip that says where the task belongs.
 * Only what a person can see is read (`checkVisibility`), so a table kept in the document and hidden is not the list.
 *
 * THE TASK IS FOUND BY ITS HEADING, AS THE DAY IS, and never by its place: the picker's box leads the row, so the first cell of a row is a checkbox and not the task's name.
 */
function look({ titleBox, titleHead, dueHead }) {
  const text = (el) => (el?.textContent ?? '').replace(/\s+/gu, ' ').trim();
  const tasks = [];
  const heads = [...document.querySelectorAll('[role="row"] [role="columnheader"]')].map(text);
  const at = heads.indexOf(dueHead);
  const named = heads.indexOf(titleHead);
  for (const r of document.querySelectorAll('[role="row"]')) {
    const cells = [...r.querySelectorAll('[role="gridcell"]')];
    if (cells.length === 0 || !r.checkVisibility()) continue;
    tasks.push({ what: named < 0 ? '' : text(cells[named]), day: at < 0 ? null : text(cells[at]) || null });
  }
  for (const c of document.querySelectorAll('a.card')) {
    if (!c.checkVisibility()) continue;
    const line = c.querySelector('.card-b')?.cloneNode(true);
    line?.querySelector('.scope-chip')?.remove();
    tasks.push({ what: text(c.querySelector('.card-title')), day: text(line) || null });
  }
  const dock = document.querySelector('dialog.dock');
  const box = dock?.open ? dock.getBoundingClientRect() : null;
  const toast = [...document.querySelectorAll('.toast:not([aria-hidden="true"])')].at(-1);
  return {
    tasks,
    row: new URL(location.href).searchParams.get('row'),
    path: location.pathname,
    panel: box ? { open: true, task: dock.querySelector(`#${titleBox}`)?.value ?? null, box: { left: box.left, top: box.top, width: box.width, height: box.height } } : null,
    toast: toast ? { text: text(toast.querySelector('.text')), undo: toast.querySelector('.undo')?.checkVisibility() === true } : null,
    screen: { width: innerWidth, height: innerHeight },
  };
}

/** The ten tasks, written through the record's own door with the gate's key, as a person's own writes are. */
async function writeTasks(record) {
  /** The record's own day and `n` days on, as the record keeps a day. */
  const day = (n) => {
    const d = new Date(record.now);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().split('T')[0];
  };
  for (const [i, t] of TASKS.entries()) {
    const said = await fetch(new URL('/api/create', record.base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${serverKeyFor(record.base)}` },
      body: JSON.stringify({ register: LIST, fields: { what: t.what, state: 'open', by: day(t.due) } }),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (said?.ok !== true) throw new Error(`the record would not take the task "${t.what}": ${said?.refusal?.fix ?? 'it did not answer'}`);
    /* THE THIRD WRITTEN IS `?row=3`, and the walk says so before it leans on it. */
    if (said.value?.seq !== i + 1) throw new Error(`the record numbered "${t.what}" ${said.value?.seq}, not ${i + 1}, so the third task is not row 3.`);
  }
  return day(TASKS[NEW_DAY_TASK - 1].due);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

/** The status of a file that is not there, read from Node's own table. */
const NOT_FOUND = Number(Object.keys(STATUS_CODES).find((code) => STATUS_CODES[code] === 'Not Found'));

/** The build's own files, the record's doors handed to the record, and the app's shell for every other address. */
function serve(ROOT, record) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (forwards(url.pathname)) return forward(req, res, record.base);
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    /* A PATH THAT CLIMBS OUT OF THE BUILD IS GIVEN THE SHELL, never a file beside it (`printed.mjs`). */
    for (const candidate of rel.includes('..') ? [] : [rel, `${rel}.html`, join(rel, 'index.html')]) {
      const file = join(ROOT, candidate);
      if (!(await stat(file).catch(() => null))?.isFile()) continue;
      res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
      return createReadStream(file).pipe(res);
    }
    /* A MISSING ASSET IS NOT FOUND, never the shell, or a page asking for a chunk would be handed HTML. */
    if (Object.hasOwn(TYPES, extname(rel)) && extname(rel) !== '.html') {
      res.statusCode = NOT_FOUND;
      return res.end();
    }
    /* THE SPA FALLBACK the deployed host serves: `/r/tasks` is the router's to decide. */
    res.setHeader('content-type', TYPES['.html']);
    return createReadStream(appShell(ROOT)).pipe(res);
  });
}

/**
 * One walk at one width: every step of `STEPS`, in order, each writing what it read into `seen`.
 *
 * A STEP WAITS FOR WHAT IT EXPECTS AND THEN READS WHAT IS THERE (`until`): the last look is the answer whether or not
 * the wait was met, so a panel that never moved is read as the panel that did not move, and `judge` says so. Nothing
 * here decides red or green.
 */
async function walk(page, width, newDay, seen, at) {
  const third = TASKS[OPENED - 1].what;
  const fourth = TASKS[WALKED - 1].what;
  const holder = TASKS[NEW_DAY_TASK - 1].what;
  const wait = budget('ready').settleTimeoutMs;
  const read = () => page.evaluate(look, { titleBox: TITLE_BOX, titleHead: TITLE_HEAD, dueHead: DUE_HEAD });
  const dayOf = (got, what) => got.tasks.find((t) => t.what === what)?.day ?? null;
  /** Look until `ok(now, before)` or the wait runs out, and hand back the last look either way. */
  async function until(ok) {
    const end = Date.now() + wait;
    let before = await read();
    for (;;) {
      /* TWO FRAMES ON, so a panel still sliding has moved between the looks and one at rest has not. */
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const now = await read();
      if (ok(now, before) || Date.now() > end) return now;
      before = now;
    }
  }
  /** The panel open on a task and standing still, so its box is where it rests and not where it was passing. */
  const openOn = (what) => (now, before) => now.panel?.task === what && JSON.stringify(now.panel.box) === JSON.stringify(before.panel?.box);
  /** The list's cursor on a task: up past the top, then down to where the task is drawn. Only with no panel open. */
  async function cursorTo(what) {
    const drawn = (await read()).tasks.findIndex((t) => t.what === what);
    if (drawn < 0) throw new Error(`the list does not draw "${what}"`);
    for (let i = 0; i < TASKS.length; i += 1) await page.keyboard.press('k');
    for (let i = 0; i < drawn; i += 1) await page.keyboard.press('j');
  }
  const panelOf = (got) => ({ row: got.row, task: got.panel?.task ?? null });

  const DOES = {
    async list() {
      const got = await until((now) => now.tasks.length >= TASKS.length);
      seen.day.before = dayOf(got, third);
      seen.day.wanted = dayOf(got, holder);
    },
    async open(step) {
      await cursorTo(third);
      await page.keyboard.press(step.key);
      const got = await until(openOn(third));
      seen.opened = panelOf(got);
      seen.form = formOf(got.panel?.box ?? null, got.screen);
    },
    async type() {
      /* THE DAY AS THE RECORD KEEPS IT (`2026-09-24`), which the box reads as it reads any day a person types. */
      const box = page.locator(`dialog.dock #${DUE_BOX}`);
      await box.fill(newDay);
      await box.press('Tab');
    },
    async save() {
      await page.locator('dialog.dock button[type="submit"]').click();
      const got = await until((now) => now.toast !== null && now.row === null && dayOf(now, third) === seen.day.wanted);
      seen.day.saved = dayOf(got, third);
      seen.saved = {
        row: got.row,
        toast: got.toast?.text || null,
        undo: got.toast?.undo === true,
        /* THE LIST NEVER LEFT: the same address, and the tasks still drawn. */
        listed: got.path.endsWith(`/r/${LIST}`) && got.tasks.some((t) => t.what === holder),
      };
    },
    async undo() {
      await page.locator('.toast .undo').last().click();
      seen.day.undone = dayOf(await until((now) => dayOf(now, third) === seen.day.before), third);
    },
    async reopen(step) {
      await cursorTo(third);
      await page.keyboard.press(step.key);
      seen.reopened = panelOf(await until(openOn(third)));
    },
    async walk(step) {
      await page.keyboard.press(step.key);
      seen.walked = panelOf(await until(openOn(fourth)));
    },
    async escape(step) {
      await page.keyboard.press(step.key);
      const got = await until((now) => now.panel === null && now.row === null);
      seen.escaped = { row: got.row, open: got.panel !== null };
    },
  };

  for (const step of STEPS) {
    at.step = step;
    await DOES[step.id](step);
  }
  at.step = null;
}

/** What a walk has read before it has read anything: every promise unread, which `judge` calls broken. */
const unread = (width) => ({
  width,
  form: null,
  third: TASKS[OPENED - 1].what,
  fourth: TASKS[WALKED - 1].what,
  day: { before: null, wanted: null, saved: null, undone: null },
  opened: { row: null, task: null },
  saved: { row: null, toast: null, undo: false, listed: false },
  reopened: { row: null, task: null },
  walked: { row: null, task: null },
  escaped: { row: null, open: true },
});

/**
 * THE WHOLE WALK, AS A FUNCTION THE RUNNER CALLS (`52 §5.1` step 3). It returns 1 or 3 and falls off the end for a pass.
 *
 * IT OWNS A RECORD, A PORT AND A BROWSER, AND GIVES ALL THREE BACK ON EVERY PATH OUT. The three `let`s are for the
 * `finally`; each is taken inside the `try`, so a setup that throws (a record that refuses a task, a forward not wired,
 * no browser installed) leaves nothing listening. `queue.mjs` says at length why.
 *
 * THE RECORD IS THE FRESH ONE (`startRecord`'s `fresh`): the seed's lists and pages and nothing in Tasks, so the ten
 * written here are the ten it holds and the third is row 3.
 */
export default async function rowDrawer(root = join(import.meta.dirname, '..', '..', '..')) {
  const ROOT = join(root, 'apps', 'web', 'build');

  /* EXIT 3 IS A SKIP, NOT A PASS: with no build nothing was pressed, and green would say the panel works. */
  if (!(await stat(ROOT).catch(() => null))?.isDirectory()) {
    console.log('  row-drawer: no apps/web/build to walk, so nothing was pressed. Run `pnpm --filter @braindog/web build` first.');
    return 3;
  }

  /** Every way this run fell short, in the order it happened. Collected, never thrown on the first. */
  const findings = [];
  /** Read once, at the start, so every width of one run is seeded or none is. */
  const SEEDED = seeded();

  let record = null;
  let server = null;
  let browser = null;
  try {
    record = await startRecord(0, { fresh: true });
    const newDay = await writeTasks(record);

    server = serve(ROOT, record);
    await new Promise((r) => server.listen(0, r));
    const ORIGIN = `http://127.0.0.1:${server.address().port}`;

    /* PROOF THE FORWARD IS WIRED, so the list drawn is the record's and not a page that reached nothing. */
    await answers(ORIGIN);

    const ready = readiness('row-drawer', budget('ready').settleTimeoutMs, ROOT);
    browser = await chromium.launch();

    for (const width of WIDTHS) {
      const seen = unread(width);
      const at = { step: null };
      let opened = null;
      try {
        /* OPENED THE ONE WAY EVERY GATE OPENS A PAGE (`openPage`): on the record's clock, waited for. A KEYBOARD AT BOTH
           WIDTHS, so the narrow one is a narrow window and not a phone: the walk is made of keys, and a thumb has none. */
        opened = await openPage(browser, `${ORIGIN}${APP_BASE}/r/${LIST}`, { width, record, ready, waitUntil: 'networkidle' });
        const unmeasured = ready.check(`row-drawer /r/${LIST} at ${width}`, `/r/${LIST}`, opened.state);
        if (unmeasured) findings.push(unmeasured);
        await walk(opened.page, width, newDay, seen, at);
        /* AND THE PAGE THREW NOTHING WHILE IT WAS WALKED. */
        for (const e of opened.errors.filter((e) => e.kind === 'uncaught')) findings.push(`${width}: the page threw while it was walked: ${e.text.split('\n')[0]}`);
      } catch (e) {
        /* A THROW IN THE WALK IS A FINDING AND NOT A CRASH, said with the step it stopped at. What that step and the
           ones after it would have read stays unread, and `judge` says each of those too. */
        const said = e instanceof Error ? e.message.split('\n')[0] : String(e);
        findings.push(`${width}: the walk stopped${at.step ? ` at "${at.step.does}"` : ' before its first step'}: ${said}`);
      } finally {
        await opened?.context.close().catch(() => {});
      }
      /* A SEEDED RUN JUDGES THE PLANTED READING, and says whether it was planted over a walk that saw `j` work: without
         that line a run whose `j` was broken anyway would be red in the seed's words for a reason that is not the seed. */
      if (SEEDED && walkedTrue(seen)) console.log(`  row-drawer: seeded at ${width}: ${PLANT}, planted over a reading that had it on the fourth.`);
      findings.push(...judge(handed(seen, SEEDED)));
    }

    const blind = ready.nothingDrawn();
    if (blind) findings.push(blind);

    if (findings.length === 0) {
      console.log(
        `row-drawer: at ${WIDTHS.join(' and ')}, p opened the third of ten tasks at ?row=${OPENED}, Save showed the new day in the list with a toast, Undo put it back, j moved the panel to the fourth task and Escape closed it.`,
      );
    } else {
      console.error('\n  the panel beside a list, walked in a real browser:');
      for (const f of findings) console.error(`      ${f}`);
      return 1;
    }
  } finally {
    /* THE BROWSER, THE PORT AND THE RECORD, each guarded on its own so one failure does not cost the other two. */
    await browser?.close().catch(() => {});
    if (server !== null) await new Promise((r) => server.close(() => r()));
    await record?.close().catch(() => {});
  }
}

/* AND IT IS STILL A SCRIPT, for a person running the file by hand. `?? 0` because a pass returns nothing. */
if (import.meta.main) process.exitCode = (await rowDrawer()) ?? 0;
