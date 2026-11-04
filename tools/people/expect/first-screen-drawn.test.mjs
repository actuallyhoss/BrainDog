/**
 * The first screens as drawn: the markup reader, the two checks that read the shell, one walk as
 * Mariam whose sidebar and Today are rendered from the web's own parts and judged, and four people's walks held to a rail
 * with no empty place in it. Run it alone:
 * `node --test tools/people/expect/first-screen-drawn.test.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DRAWN_UNITS, SIGNS, checkDrawn, drawnScreen, drawnScreens, firstScreen, report } from './first-screen.mjs';
import { readMarkup } from './markup.mjs';
import { saidLists } from './screens.mjs';
import { signsLine } from '../../../apps/web/src/lib/home/default-home.ts';

const MARIAM = JSON.parse(readFileSync(new URL('../mariam.json', import.meta.url), 'utf8'));

const inNav = (role, name) => ({ role, name, landmark: 'navigation' });
const RAIL = [inNav('link', 'Today'), inNav('link', 'Decide'), inNav('link', 'People'), inNav('heading', 'Pages'), inNav('button', 'New page')];
const SHELL = (over = {}) => ({ path: '/', width: 1440, text: ['Today', 'Nothing needs you right now.'], roles: [...RAIL, { role: 'heading', name: 'Today', landmark: 'main' }], counts: {}, owner: true, ...over });

/* ── the markup reader ────────────────────────────────────────────────────────────────────────────────── */

test('markup is read as a person meets it: names, landmarks, and nothing that is hidden', () => {
  const { text, roles } = readMarkup(
    '<nav aria-label="Record"><a href="/">Today</a><ul inert=""><li><a href="/r/orders">Orders <span>2</span></a></li></ul>' +
      '<button aria-label="Collapse the sidebar"><svg><path d="M0 0"></path></svg></button><span aria-hidden="true">/</span></nav>' +
      '<main><h1>Today</h1><p>Nadia paid EGP&nbsp;900 &amp; more.</p><dialog><h2>Add to this page</h2></dialog><a>no address</a>' +
      '<span role="gridcell">Nadia</span><span role="gridcell">vanilla jars</span><input type="text" placeholder="Name the page"></main>',
  );
  assert.deepEqual(text, ['Today', 'Today', 'Nadia paid EGP 900 & more.', 'no address', 'Nadia', 'vanilla jars']);
  assert.deepEqual(roles, [
    { role: 'navigation', name: 'Record', landmark: null },
    { role: 'link', name: 'Today', landmark: 'navigation', href: '/' },
    { role: 'button', name: 'Collapse the sidebar', landmark: 'navigation' },
    { role: 'main', name: '', landmark: null },
    { role: 'heading', name: 'Today', landmark: 'main' },
    { role: 'gridcell', name: 'Nadia', landmark: 'main' },
    { role: 'gridcell', name: 'vanilla jars', landmark: 'main' },
    { role: 'textbox', name: 'Name the page', landmark: 'main' },
  ]);
});

/* ── the two checks, on planted screens ───────────────────────────────────────────────────────────────── */

test('the seven stay seven, and each of the three beside them has a unit', () => {
  assert.equal(Object.keys(firstScreen).length, 7);
  assert.deepEqual(Object.keys(DRAWN_UNITS).sort(), Object.keys(drawnScreen).sort());
  assert.equal(checkDrawn(SHELL(), MARIAM).length, 10);
});

test('pages-line: exactly one line, under one Pages, in the reader\'s own word', () => {
  const check = drawnScreen['pages-line'];
  const rail = (...more) => SHELL({ roles: [...RAIL.slice(0, 3), ...more] });
  assert.equal(check(SHELL()).pass, true);
  assert.match(check(SHELL()).saw, /"New page" once, under the rail's own "Pages"/u);
  /* Once a page is made, the Pages place holds the line and the rail's own heading goes. */
  assert.match(check(rail(inNav('link', 'Pages'), inNav('button', 'New page'))).saw, /once, under the Pages place/u);
  assert.match(check(rail(inNav('heading', 'Pages'))).saw, /has no "New page" and no "Suggest a page"/u);
  assert.match(check(rail(inNav('heading', 'Pages'), inNav('button', 'New page'), inNav('button', 'New page'))).saw, /2 lines where one makes a page/u);
  assert.match(check(rail(inNav('button', 'New page'))).saw, /stands under no "Pages"/u);
  assert.match(check(rail(inNav('heading', 'Pages'), inNav('link', 'Pages'), inNav('button', 'New page'))).saw, /"Pages" is in the rail 2 times/u);
  assert.equal(check(SHELL({ owner: false })).pass, false);
  assert.equal(check(rail(inNav('heading', 'Pages'), inNav('button', 'Suggest a page'))).pass, false);
  assert.equal(check({ ...rail(inNav('heading', 'Pages'), inNav('button', 'Suggest a page')), owner: false }).pass, true);
  for (const unread of [SHELL({ path: '/start', roles: [] }), SHELL({ roles: [] }), SHELL({ width: 390 })]) assert.equal(check(unread).pass, null);
});

test('signs-line: said once, as words that open the page, and only to whoever owns the record', () => {
  const check = drawnScreen['signs-line'];
  for (const block of signsLine()) assert.match(block.body.replace(/\{\{[^}]+\}\}/gu, '3'), SIGNS, block.body);
  const said = 'One vital sign needs a look';
  const link = { role: 'link', name: said, landmark: 'main' };
  const told = (over = {}) => SHELL({ text: ['Today', `${said}.`], roles: [...RAIL, { role: 'heading', name: 'Today', landmark: 'main' }, link], ...over });
  assert.match(check(SHELL()).saw, /says nothing about the vital signs/u);
  assert.equal(check(SHELL()).pass, null, 'silence with the signs unread is not a pass');
  assert.equal(check(told()).pass, true);
  assert.match(check(told({ owner: false })).saw, /does not own the record is told "One vital sign needs a look/u);
  assert.match(check(told({ roles: SHELL().roles })).saw, /opens nothing/u);
  assert.match(check(told({ text: [`${said}.`, '2 vital signs need a look.'] })).saw, /says it 2 times/u);
  assert.equal(check(SHELL({ path: '/r/people' })).pass, null);
  assert.equal(check(SHELL({ roles: RAIL })).pass, null);
});

test('no line a check says holds a long dash', () => {
  for (const snap of [SHELL(), SHELL({ owner: false }), SHELL({ roles: [] })]) for (const r of checkDrawn(snap, MARIAM)) assert.doesNotMatch(r.saw, /\u2014/u);
});

/* ── one walk, drawn ──────────────────────────────────────────────────────────────────────────────────── */

test('Mariam: the sidebar and Today are drawn at both moments, every check that reads them is green', { timeout: 120_000 }, async () => {
  const { screens, why } = await drawnScreens(MARIAM);
  assert.equal(why, null);
  const drawn = screens.filter((s) => s.words !== true && s.width === 1440);
  assert.equal(drawn.length, 4);
  const todays = drawn.filter((s) => s.path === '/');
  assert.equal(todays.length, 2);
  for (const s of drawn) {
    assert.equal(s.owner, true);
    /* THE RAIL'S ROWS ARE THE PRODUCT'S TO GET RIGHT and are held to being read, in the test beside this one. */
    for (const r of checkDrawn(s, MARIAM)) if (r.id !== 'rail-has-rows') assert.notEqual(r.pass, false, `${s.path} ${s.moment}: ${r.id}: ${r.saw}`);
  }
  for (const s of todays) {
    assert.ok(s.roles.some((r) => r.landmark === 'main' && r.role === 'heading' && r.name === 'Today'), 'Today has its name in main');
    assert.equal(drawnScreen['signs-line'](s).pass, true);
  }
  /* Told one real thing, Today is hers: its line, and what the rail then holds. */
  const told = todays[1];
  assert.ok(told.text.some((t) => t.includes('Nadia')), told.text.join(' / '));
  assert.ok(told.roles.some((r) => r.landmark === 'navigation' && r.role === 'link' && r.name === 'Orders 1'));
  assert.equal(firstScreen['rail-has-rows'](drawn[3]).pass, true);
  const { lines, code } = report(screens, MARIAM);
  assert.match(lines.at(-1), /^62 checks: \d+ green, \d+ red, 0 not seen, \d+ that do not apply\. Exit code [01]\.$/u, lines.join('\n'));
  assert.equal(code, lines.some((l) => /: red\./u.test(l)) ? 1 : 0);
});

/* ── the rail's rows, read as the shell reads them ──────────────────────────────────────────── */

test('a page stands on the lists the record says it reads, and on none a pack filled', () => {
  const held = new Map([['accounts', {}], ['obligations', {}]]);
  /* The record leaves a list its packs fill on day 0 out of `lists`, so Categories is never counted as hers. */
  assert.deepEqual(saidLists({ slug: 'money', lists: ['accounts', 'obligations', 'accounts'] }, held), ['accounts', 'obligations']);
  /* A list this reader was not sent is not hers to be judged by, and a page that reads none has nothing to be empty. */
  assert.deepEqual(saidLists({ slug: 'money', lists: ['accounts', 'payroll', 7] }, held), ['accounts']);
  assert.deepEqual(saidLists({ slug: 'notes', lists: [] }, held), []);
  /* A host that says nothing of a page's lists is read from the drawn page, as before. */
  assert.equal(saidLists({ slug: 'money', list: 'accounts' }, held), null);
  assert.equal(saidLists(undefined, held), null);
});

const PEOPLE = ['mariam', 'sam', 'nour', 'layla'];

for (const who of PEOPLE) {
  test(`${who}: no place is in the first rail with nothing to show, and the command would leave with 0`, { timeout: 180_000 }, async () => {
    const person = who === 'mariam' ? MARIAM : JSON.parse(readFileSync(new URL(`../${who}.json`, import.meta.url), 'utf8'));
    const { screens, why } = await drawnScreens(person);
    assert.equal(why, null);
    const drawn = screens.filter((s) => s.words !== true);
    assert.equal(drawn.length, 6, 'three screens at each of two moments');
    for (const s of drawn) {
      const rows = firstScreen['rail-has-rows'](s);
      assert.equal(rows.pass, true, `${s.path} at ${s.width}, ${s.moment}: ${rows.saw}`);
    }
    const { lines, code } = report(screens, person);
    assert.deepEqual(lines.filter((l) => /rail-has-rows: (?:red|not seen)/u.test(l)), []);
    assert.match(lines.at(-1), /^62 checks: \d+ green, 0 red, 0 not seen, \d+ that do not apply\. Exit code 0\.$/u, lines.filter((l) => /: red\./u.test(l)).join('\n'));
    assert.equal(code, 0);
  });
}
