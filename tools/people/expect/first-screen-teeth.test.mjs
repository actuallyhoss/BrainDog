/**
 * The first-screen checks with teeth: the rail read row by row from what was drawn, on the first
 * minute too; Today's line on the vital signs held to being there; a check that read nothing leaving the command with
 * 1; and the phone drawn beside the rail. Run it alone: `node --test tools/people/expect/first-screen-teeth.test.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { checkDrawn, drawnScreen, drawnScreens, firstScreen, lineOf, report } from './first-screen.mjs';
import { readMarkup } from './markup.mjs';
import { markupOf } from './draw.mjs';

const person = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const MARIAM = person('mariam.json');
const NOUR = person('nour.json');

const row = (name, href) => ({ role: 'link', name, landmark: 'navigation', href });
const THREE = [row('Today', '/'), row('Decide', '/decide'), row('People', '/p/people')];
const MONEY = row('Money', '/p/money');
const DOORS = [row('New list', '/r/_new?make'), row('Your account and settings', '/settings/account')];
const TODAY = [{ role: 'main', name: '', landmark: null }, { role: 'heading', name: 'Today', landmark: 'main' }];
const SCREEN = (over = {}) => ({ path: '/', width: 1440, text: ['Today', 'Nothing needs you right now.'], roles: [...THREE, ...TODAY], counts: { People: [{ name: 'Mariam', tags: [] }] }, behind: {}, signs: 0, owner: true, ...over });
const EMPTY = { Accounts: 0, 'Bills and invoices': 0, Ledger: 0, Repeating: 0 };

/* ── the rail, row by row ─────────────────────────────────────────────────────────────────────────────── */

test('rail-has-rows: a place whose page reads only empty lists is red on the first minute', () => {
  const check = firstScreen['rail-has-rows'];
  const r = check(SCREEN({ roles: [...THREE, MONEY, ...DOORS], behind: { '/p/money': EMPTY } }));
  assert.equal(r.pass, false);
  assert.match(r.saw, /^Money \(Accounts, Bills and invoices, Ledger and 1 more hold nothing\) is in the rail with nothing to show$/u);
  const two = check(SCREEN({ roles: [...THREE, MONEY, row('Work', '/p/work')], behind: { '/p/money': EMPTY, '/p/work': { Tasks: 0 } } }));
  assert.match(two.saw, /^Money \(.+\) and Work \(Tasks holds nothing\) are in the rail/u);
});

test('rail-has-rows: a place with one list that holds something, or a page that reads no list, is green', () => {
  const check = firstScreen['rail-has-rows'];
  const held = check(SCREEN({ roles: [...THREE, MONEY], behind: { '/p/money': { ...EMPTY, 'Bills and invoices': 1 } } }));
  assert.equal(held.pass, true, held.saw);
  assert.match(held.saw, /^Money is in the rail, each with something in it$/u);
  assert.equal(check(SCREEN({ roles: [...THREE, row('Notes', '/p/notes')], behind: { '/p/notes': {} } })).pass, true);
  /* The entries themselves, where the rig read them, count as the number does. */
  assert.equal(check(SCREEN({ roles: [...THREE, MONEY], behind: { '/p/money': { Accounts: [{ name: 'Cash', tags: [] }] } } })).pass, true);
});

test('rail-has-rows: a place the record declares stands empty on day 0, and a side page over nothing is still red', () => {
  const check = firstScreen['rail-has-rows'];
  const ready = check(SCREEN({ roles: [...THREE, MONEY], behind: { '/p/money': EMPTY }, places: ['/p/money'] }));
  assert.equal(ready.pass, true, ready.saw);
  assert.match(ready.saw, /^in the rail, Money opens on a first entry$/u);
  const board = check(SCREEN({ roles: [...THREE, MONEY, row('Board', '/p/board')], behind: { '/p/money': EMPTY, '/p/board': { Tasks: 0 } }, places: ['/p/money'] }));
  assert.equal(board.pass, false);
  assert.match(board.saw, /^Board \(Tasks holds nothing\) is in the rail with nothing to show$/u);
});

test('rail-has-rows: a rail of only Today, Decide and People is read, and green', () => {
  const r = firstScreen['rail-has-rows'](SCREEN({ roles: [...THREE, ...DOORS] }));
  assert.equal(r.pass, true, r.saw);
  assert.match(r.saw, /^the rail holds no place besides Today, Decide and People$/u);
});

test('rail-has-rows: a list is held against its own count, by where its row goes or by its name', () => {
  const check = firstScreen['rail-has-rows'];
  const orders = row('Orders 2', '/r/orders');
  assert.equal(check(SCREEN({ roles: [...THREE, orders], behind: { '/r/orders': { Orders: 2 } } })).pass, true);
  const named = check(SCREEN({ roles: [...THREE, orders, row('People 1', '/r/people')], counts: { Orders: 2 } }));
  assert.equal(named.pass, true, named.saw);
  assert.match(named.saw, /^Orders is in the rail/u);
  const empty = check(SCREEN({ roles: [...THREE, row('Services', '/r/services')], behind: { '/r/services': { Services: 0 } } }));
  assert.match(empty.saw, /^Services \(Services holds nothing\) is in the rail with nothing to show$/u);
});

test('rail-has-rows: a place nothing was read for is not seen, and that is this screen\'s to answer for', () => {
  const r = firstScreen['rail-has-rows'](SCREEN({ roles: [...THREE, MONEY] }));
  assert.equal(r.pass, null);
  assert.notEqual(r.applies, false);
  assert.match(r.saw, /did not read what stands behind Money in the rail/u);
  /* Red wins over unread: one place known to be empty is said, whatever else was not read. */
  const both = firstScreen['rail-has-rows'](SCREEN({ roles: [...THREE, MONEY, row('Work', '/p/work')], behind: { '/p/work': { Tasks: 0 } } }));
  assert.equal(both.pass, false);
});

test('rail-has-rows: on a phone the tabs are the places', () => {
  const r = firstScreen['rail-has-rows'](SCREEN({ width: 390, roles: [...TODAY, ...THREE, MONEY], behind: { '/p/money': EMPTY } }));
  assert.equal(r.pass, false);
  assert.match(r.saw, /is in the phone's places with nothing to show$/u);
});

/* ── Today's line on the vital signs ──────────────────────────────────────────────────────────────────── */

const SAID = { role: 'link', name: 'One vital sign needs a look', landmark: 'main', href: '/p/health' };
const told = (words, over = {}) => SCREEN({ text: ['Today', `${words}.`], roles: [...THREE, ...TODAY, { ...SAID, name: words }], ...over });

test('signs-line: a red sign with no line on Today is red for whoever owns the record', () => {
  const check = drawnScreen['signs-line'];
  assert.match(check(SCREEN({ signs: 1 })).saw, /^one vital sign reads red, and Today does not say so$/u);
  const two = check(SCREEN({ signs: 2 }));
  assert.equal(two.pass, false);
  assert.match(two.saw, /^2 vital signs read red, and Today does not say so$/u);
});

test('signs-line: silence is right when none is red, with no page to open, and for anybody else', () => {
  const check = drawnScreen['signs-line'];
  for (const calm of [SCREEN({ signs: 0 }), SCREEN({ signs: null }), SCREEN({ signs: 2, owner: false })]) assert.equal(check(calm).pass, true, check(calm).saw);
});

test('signs-line: silence with nothing to hold it against is not seen', () => {
  const check = drawnScreen['signs-line'];
  const { signs: _, ...bare } = SCREEN();
  for (const unread of [bare, SCREEN({ signs: 2, owner: undefined })]) {
    assert.equal(check(unread).pass, null);
    assert.notEqual(check(unread).applies, false);
  }
});

test('signs-line: the line that is there agrees with the record', () => {
  const check = drawnScreen['signs-line'];
  assert.equal(check(told('One vital sign needs a look', { signs: 1 })).pass, true);
  assert.equal(check(told('3 vital signs need a look', { signs: 3 })).pass, true);
  assert.match(check(told('One vital sign needs a look', { signs: 3 })).saw, /while 3 vital signs read red$/u);
  assert.match(check(told('One vital sign needs a look', { signs: 0 })).saw, /while no vital sign reads red$/u);
  assert.match(check(told('One vital sign needs a look', { signs: null })).saw, /on a record with no page for its vital signs$/u);
});

/* ── what Today calls the reader in her own lines ─────────────────────────────────────────────────────── */

test('own-lines-you: the owner of a record nobody else writes on is never a stranger on Today', () => {
  const check = drawnScreen['own-lines-you'];
  const feed = (over = {}) => SCREEN({ text: ['Today', 'Someone you share with added Nadia just now'], ...over });
  const alone = [{ name: 'Mariam', tags: [] }];
  const red = check(feed({ counts: { People: alone } }), MARIAM);
  assert.equal(red.pass, false);
  assert.match(red.saw, /^nobody but Mariam writes on this record, and Today says "Someone you share with added Nadia just now" once$/u);
  /* A client she typed signs nothing in, so the line is still hers; a bare count of one is her alone. */
  assert.equal(check(feed({ counts: { People: [...alone, { name: 'Nadia', tags: [] }] } }), MARIAM).pass, false);
  assert.equal(check(feed({ counts: { People: 1 } }), MARIAM).pass, false);
  /* Her own lines said as hers, and a Today with no feed at all, are green. */
  assert.equal(check(feed({ text: ['Today', 'You added Nadia just now'], counts: { People: alone } }), MARIAM).pass, true);
  assert.equal(check(SCREEN({ counts: { People: alone } }), MARIAM).pass, true);
});

test('own-lines-you: with somebody else on the record, or for somebody who does not own it, the words may be true', () => {
  const check = drawnScreen['own-lines-you'];
  const feed = (over = {}) => SCREEN({ text: ['Today', 'Someone you share with added Nadia just now'], counts: { People: [{ name: 'Mariam', tags: [] }] }, ...over });
  for (const apart of [feed({ counts: { People: [{ name: 'Mariam', tags: [] }, { name: 'Farid', tags: [] }] } }), feed({ counts: { People: 2 } }), feed({ owner: false }), feed({ path: '/r/people' })]) {
    assert.equal(check(apart, MARIAM).pass, null);
    assert.equal(check(apart, MARIAM).applies, false);
  }
  /* What was not read is said, never passed: People, whether she owns it, and a Today that was not drawn. */
  for (const unread of [feed({ counts: {} }), feed({ owner: undefined }), feed({ roles: THREE })]) {
    assert.equal(check(unread, MARIAM).pass, null);
    assert.notEqual(check(unread, MARIAM).applies, false);
  }
});

/* ── not seen, and not this screen's ──────────────────────────────────────────────────────────────────── */

test('a check with no business on a screen says so, and is told apart from one that read nothing', () => {
  const apart = [
    firstScreen['nothing-before-press'](SCREEN(), MARIAM),
    firstScreen['team-no-task'](SCREEN(), MARIAM),
    firstScreen['people-only-them']({ path: '/start', text: [], roles: [] }, MARIAM),
    drawnScreen['pages-line'](SCREEN({ width: 390 })),
    drawnScreen['signs-line'](SCREEN({ path: '/r/people' })),
  ];
  for (const r of apart) {
    assert.equal(r.pass, null, r.id);
    assert.equal(r.applies, false, r.id);
    assert.match(lineOf(r), /^[a-z-]+: does not apply\. /u);
  }
  const unread = [firstScreen['people-only-them'](SCREEN({ counts: {} }), MARIAM), firstScreen['team-no-task'](SCREEN(), NOUR), drawnScreen['signs-line'](SCREEN({ roles: THREE }))];
  for (const r of unread) {
    assert.equal(r.pass, null, r.id);
    assert.notEqual(r.applies, false, r.id);
    assert.match(lineOf(r), /^[a-z-]+: not seen\. /u);
  }
});

test('the command leaves with 1 when a check that applies read nothing, and 0 when only checks that do not apply are left', () => {
  const pages = [...THREE, { role: 'heading', name: 'Pages', landmark: 'navigation' }, { role: 'button', name: 'New page', landmark: 'navigation' }, ...TODAY];
  const read = report([SCREEN({ roles: pages })], MARIAM);
  assert.equal(read.code, 0, read.lines.join('\n'));
  assert.match(read.lines.at(-1), /^10 checks: 8 green, 0 red, 0 not seen, 2 that do not apply\. Exit code 0\.$/u);
  const { signs: _, ...blind } = SCREEN({ roles: pages });
  const unread = report([blind], MARIAM);
  assert.equal(unread.code, 1, unread.lines.join('\n'));
  assert.match(unread.lines.at(-1), /^10 checks: 7 green, 0 red, 1 not seen, 2 that do not apply\. UNCHECKED: 1 of 10 read nothing, which is not a pass\. Exit code 1\.$/u);
  /* Only the words were asked for: the code is left alone there, and UNCHECKED still says how little was read. */
  const words = report(null, MARIAM);
  assert.equal(words.code, 0);
  assert.match(words.lines.at(-1), /UNCHECKED: 5 of 7 read nothing/u);
});

test('no line a check says holds a long dash', () => {
  const screens = [SCREEN({ roles: [...THREE, MONEY], behind: { '/p/money': EMPTY } }), SCREEN({ signs: 2 }), SCREEN({ roles: [...THREE, MONEY] }), SCREEN({ width: 390 })];
  for (const snap of screens) for (const r of checkDrawn(snap, MARIAM)) assert.doesNotMatch(r.saw, /\u2014/u);
});

/* ── the web's own sidebar and tab bar, rendered ──────────────────────────────────────────────────────── */

const PLACE = (key, label, href) => ({ key, href, label, icon: 'today', near: [href] });
const MENU = '/?menu';
const PLACES = [PLACE('today', 'Today', '/'), PLACE('decide', 'Decide', '/decide'), PLACE('people', 'People', '/p/people'), PLACE('money', 'Money', '/p/money')];
const DATA = { me: { owner: true, person: 'p1', prefs: {} }, names: { p1: 'Mariam Said' }, pages: [], lists: [] };

/** The sidebar as the shell draws it for `places` (`side.ts` `sideModel`), with no list and no project read yet. */
const sideAs = async (places) => {
  const { sideModel } = await import('../../../apps/web/src/lib/shell/side.ts');
  const model = sideModel({ places, others: [], projects: null, lists: [], homes: new Map(), views: {}, tools: [], foot: [] });
  return markupOf('lib/shell/SideBar.svelte', { base: '', lists: [], model, lit: '/', mode: 'full', shown: true }, { data: DATA, path: '/' });
};

test('the sidebar as the web draws it says where each row goes, and its rows are read from that', async () => {
  const html = await sideAs(PLACES);
  const snap = { path: '/', width: 1440, ...readMarkup(html), counts: {}, owner: true };
  const money = snap.roles.find((r) => r.landmark === 'navigation' && r.role === 'link' && r.name === 'Money');
  assert.equal(money?.href, '/p/money');
  assert.equal(firstScreen['rail-has-rows']({ ...snap, behind: { '/p/money': EMPTY } }).pass, false);
  assert.equal(firstScreen['rail-has-rows']({ ...snap, behind: { '/p/money': { ...EMPTY, Ledger: 3 } } }).pass, true);
  /* With Money gone the sidebar is the three and its own doors, and nothing in it is taken for a place. */
  const three = await sideAs(PLACES.slice(0, 3));
  const calm = firstScreen['rail-has-rows']({ path: '/', width: 1440, ...readMarkup(three), counts: {}, behind: {}, owner: true });
  assert.equal(calm.pass, true, calm.saw);
  assert.match(calm.saw, /no place besides Today, Decide and People/u);
});

test('the phone\'s tab bar is a navigation whose tabs say where they go', async () => {
  const html = await markupOf('lib/shell/TabBar.svelte', { tabs: PLACES, menu: MENU }, { data: DATA, path: '/' });
  const snap = { path: '/', width: 390, ...readMarkup(html), counts: {}, behind: { '/p/money': EMPTY }, owner: true };
  assert.deepEqual(snap.roles.filter((r) => r.role === 'link').map((r) => [r.name, r.href, r.landmark]), [...PLACES.map((p) => [p.label, `${p.href}`, 'navigation']), ['Menu', MENU, 'navigation']]);
  /* NO MORE TAB since frame B: the rest is under the face at the top of each screen. */
  assert.ok(!snap.roles.some((r) => r.role === 'button' && r.name === 'More' && r.landmark === 'navigation'));
  assert.match(firstScreen['rail-has-rows'](snap).saw, /^Money \(.+\) is in the phone's places with nothing to show$/u);
});

/* ── one walk, drawn ──────────────────────────────────────────────────────────────────────────────────── */

test('Mariam: every screen of both moments is drawn at 1440 and at 390, and no check that applies reads nothing', { timeout: 120_000 }, async () => {
  const { screens, why } = await drawnScreens(MARIAM);
  assert.equal(why, null);
  const drawn = screens.filter((s) => s.words !== true);
  assert.deepEqual(drawn.map((s) => s.width), [1440, 1440, 390, 1440, 1440, 390]);
  const kept = drawn.slice(0, 3);
  for (const s of kept) assert.match(s.moment, /^just kept/u);
  for (const s of drawn) {
    /* THE FIRST MINUTE IS READ: the rail's rows are judged at both moments, green or red, never unread. */
    const rail = firstScreen['rail-has-rows'](s);
    assert.notEqual(rail.pass, null, `${s.path} at ${s.width}, ${s.moment}: ${rail.saw}`);
    for (const r of checkDrawn(s, MARIAM)) assert.ok(r.pass !== null || r.applies === false, `${s.path} at ${s.width}, ${s.moment}: ${r.id} read nothing: ${r.saw}`);
    /* What stands behind a place is read from the host, under the lists' names. */
    for (const reads of Object.values(s.behind)) for (const [name, n] of Object.entries(reads)) assert.ok(name !== '' && Number.isFinite(n), `${name}: ${n}`);
  }
  for (const s of drawn.filter((x) => x.path === '/')) {
    assert.ok(s.signs === null || Number.isFinite(s.signs), `the vital signs were read: ${s.signs}`);
    assert.ok(s.roles.some((r) => r.landmark === 'main' && r.role === 'heading' && r.name === 'Today'), `Today has its name in main at ${s.width}`);
  }
  for (const s of drawn.filter((x) => x.width === 390)) {
    const tabs = s.roles.filter((r) => r.landmark === 'navigation' && r.role === 'link');
    assert.ok(tabs.length >= 2 && tabs.length <= 5, `${tabs.length} tabs`);
    assert.equal(tabs[0].name, 'Today');
    assert.equal(drawnScreen['pages-line'](s).applies, false);
  }
  const { lines, code } = report(screens, MARIAM);
  assert.match(lines.at(-1), /, 0 not seen, \d+ that do not apply\. Exit code [01]\.$/u, lines.join('\n'));
  assert.equal(code, lines.some((l) => /: red\./u.test(l)) ? 1 : 0);
});
