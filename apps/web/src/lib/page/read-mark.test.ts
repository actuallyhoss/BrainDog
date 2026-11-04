/**
 * THE READER'S MARK HAS ONE STAMP RULE, and every screen that draws what is new since the mark uses it.
 *
 * WHAT WAS MEASURED. Home stamped by hand: a flag set before the send, so a mark that never landed was never tried
 * again, and a shell with no cursor sent a bare mark, which marks lines the screen never held. Activity had the rule in
 * a module of its own beside its route. Two rules for one mark is how the same sixty lines came back as new.
 *
 * THE RULE: one mark a visit, a mark that did not land may be tried at the next leave, and a mark is never sent below
 * the cursor the record handed over (`packages/record/test/markread-upto.test.ts` holds "never back" on the record's
 * side). The last test is a text test over the two screens, since there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { readMarkOf, seenAfter, stampOf } from './read-mark.ts';

test('NOTHING UNSEEN IS NOTHING TO STAMP, and neither is an away read that never answered', () => {
  assert.equal(readMarkOf(9, 0), null);
  assert.equal(readMarkOf(9, null), null, 'a page that could not say what was new marked it read');
  assert.equal(readMarkOf('e.01M1RQ3130J6MBME97EKYKKWZ2', 0), null);
});

test('NO CURSOR IS NO STAMP: a mark is never sent bare, which would mark lines this page never held', () => {
  assert.equal(readMarkOf(null, 3), null);
  assert.equal(readMarkOf(null, 3, 0), null);
});

test('WHAT IS UNSEEN IS STAMPED WITH THE CURSOR THE RECORD HANDED OVER, exactly as it came', () => {
  assert.equal(readMarkOf(9, 3), 9);
  const hers = 'e.01M1RQ3130J6MBME97EKYKKWZ2';
  assert.equal(readMarkOf(hers, 1), hers);
  /* HER LINES CARRY NO NUMBER (`readLog` draws them as 0), and a number is what the record refuses her. */
  assert.equal(readMarkOf(hers, 1, 0), hers);
  assert.equal(readMarkOf(hers, 1, 412), hers, 'a member held to named lists was sent back a number');
});

test('THE NEWEST LINE THE PAGE HELD WINS OVER AN OLDER CURSOR, since the shell keeps its answer for the tab', () => {
  /* The shell read 100 when the tab opened, sixty lines landed, and Activity drew them: stamping 100 leaves all sixty
     unseen, which is the sentence he read twice. */
  assert.equal(readMarkOf(100, 60, 160), 160);
  assert.equal(readMarkOf(null, 60, 160), 160, 'a shell that held nothing new when it was read kept the mark still');
  assert.equal(readMarkOf(100, 0, 160), null);
});

test('NEVER BACK: a page that held older lines than the cursor sends the cursor, never a line below it', () => {
  assert.equal(readMarkOf(160, 60, 100), 160, 'the mark was sent below the cursor the record handed over');
  assert.equal(readMarkOf(160, 60, 160), 160);
  /* A number that is no line of the log (a page that drew none, or a broken read) is not a mark. */
  for (const held of [0, -4, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(readMarkOf(160, 60, held), 160);
});

test('A MARK THAT LANDED LEAVES NOTHING UNSEEN, so the same visit has nothing left to stamp', () => {
  const after = seenAfter();
  assert.deepEqual(after, { actors: [], capped: false, byWho: null });
  assert.equal(readMarkOf(9, after.actors.length), null, 'a page already stamped stamped again');
  assert.notEqual(seenAfter(), after, 'two screens were handed one object to write on');
});

test('ONE STAMP A VISIT: leaving twice (a hidden tab, then another screen) sends one mark', async () => {
  const sent: unknown[] = [];
  const stamp = stampOf(async (upTo) => (sent.push(upTo), true));
  assert.equal(await stamp.leave(9), true);
  assert.equal(await stamp.leave(9), false);
  assert.equal(await stamp.leave(12), false, 'a visit that had landed its mark sent a second one');
  assert.deepEqual(sent, [9]);
  assert.equal(stamp.landed(), true);
});

test('NOTHING TO STAMP SENDS NOTHING, and is not a visit spent', async () => {
  const sent: unknown[] = [];
  const stamp = stampOf(async (upTo) => (sent.push(upTo), true));
  assert.equal(await stamp.leave(null), false);
  assert.deepEqual(sent, []);
  assert.equal(stamp.landed(), false);
  /* The lines arrive, and the next leave has something to send. */
  assert.equal(await stamp.leave(9), true);
  assert.deepEqual(sent, [9]);
});

test('A STAMP THAT FAILS LEAVES THE MARK WHERE IT WAS, and the next leave tries again', async () => {
  const sent: unknown[] = [];
  let answer: () => Promise<boolean> = async () => false;
  const stamp = stampOf(async (upTo) => (sent.push(upTo), answer()));
  assert.equal(await stamp.leave(9), false, 'a refused mark was said as landed');
  assert.equal(stamp.landed(), false);
  answer = async () => {
    throw new TypeError('fetch failed');
  };
  assert.equal(await stamp.leave(9), false, 'a host nobody reached threw out of the leave');
  assert.equal(stamp.landed(), false);
  answer = async () => true;
  assert.equal(await stamp.leave(9), true);
  assert.deepEqual(sent, [9, 9, 9]);
  assert.equal(stamp.landed(), true);
});

test('A SEND THAT THROWS BEFORE IT IS A PROMISE is a mark that did not land, and the leave still answers', async () => {
  let broken = true;
  const stamp = stampOf((): Promise<boolean> => {
    if (broken) throw new Error('no module');
    return Promise.resolve(true);
  });
  assert.equal(await stamp.leave(9), false);
  broken = false;
  assert.equal(await stamp.leave(9), true, 'a visit was spent on a send that never left');
});

test('TWO LEAVES AT ONCE SEND ONE MARK, while the first is still on its way', async () => {
  const sent: unknown[] = [];
  let land: (ok: boolean) => void = () => undefined;
  const stamp = stampOf((upTo) => (sent.push(upTo), new Promise<boolean>((done) => (land = done))));
  const first = stamp.leave(9);
  assert.equal(await stamp.leave(9), false);
  land(true);
  assert.equal(await first, true);
  assert.deepEqual(sent, [9]);
});

/* ── The two screens ───────────────────────────────────────────────────── */

/** A screen's source without its comments, so a comment quoting the old code cannot fail or pass a check. */
const read = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

const SCREENS = { Home: '../home/Home.svelte', Activity: '../../routes/audit/+page.svelte' } as const;

for (const [name, path] of Object.entries(SCREENS)) {
  test(`${name} stamps through the one rule, and sends no mark of its own`, () => {
    const text = read(path);
    assert.match(text, /import \{[^}]*\bstampOf\b[^}]*\} from '\$lib\/page\/read-mark\.ts';/u, `${name} does not import the one stamp`);
    /* Every send of the mark is the one handed to `stampOf`: a second `markAll` is a second rule. */
    assert.equal(text.match(/\bmarkAll\(/gu)?.length, 1, `${name} sends the mark somewhere the stamp does not see`);
    assert.match(text, /[sS]tamp(?:Of)?\(\s*\(upTo\)\s*=>[^;]*\bmarkAll\(/u, `${name}'s send is not the stamp's`);
    assert.doesNotMatch(text, /\bmarkRead\(/u, `${name} marks read past the stamp`);
    assert.match(text, /addEventListener\('pagehide'/u, `${name} does not stamp when the tab closes`);
  });
}

test('THE RULE LIVES IN ONE FILE: the copy beside Activity is gone', () => {
  for (const old of ['read-mark.ts', 'read-mark.test.ts'])
    assert.equal(existsSync(new URL(`../../routes/audit/${old}`, import.meta.url)), false, `routes/audit/${old} is a second home for the rule`);
});

/* ── A line that arrives while Home is open ────────────────────────────── */

/**
 * WHAT WAS MEASURED. Home stamped the shell's cursor, which `boot` answered when the tab opened. A
 * line that landed while Home was open was drawn there when the page was read again, and the mark was still stamped
 * below it, so the next visit said that line was new a second time.
 *
 * Home's leave is two lines, said here as it is written there: what was new when its page was last read wins, and
 * until that has answered the shell's cursor is the one sent.
 */
type News = { upTo: number | string | null; unseen: number; held: number };
const homeMark = (shell: number | string | null, news: News | null) =>
  news ? readMarkOf(news.upTo ?? shell, news.unseen, news.held) : readMarkOf(shell, shell === null ? 0 : 1);

test('A LINE THAT ARRIVES WHILE HOME IS OPEN IS MARKED AT LEAVE, with the newest line Home drew and not the cursor the tab opened on', async () => {
  const sent: unknown[] = [];
  const stamp = stampOf(async (upTo) => (sent.push(upTo), true));
  /* The tab opened on 100 with three lines new, and Home drew them. */
  let news: News | null = { upTo: 100, unseen: 3, held: 100 };
  assert.equal(homeMark(100, news), 100);
  /* A line lands, the record's version moves, and Home reads its page again and draws it. */
  news = { upTo: 101, unseen: 4, held: 101 };
  assert.equal(await stamp.leave(homeMark(100, news)), true);
  assert.deepEqual(sent, [101], 'the line drawn while Home was open was left unseen, and comes back as new');
});

test('A HOME OPENED ON A SHELL THAT HELD NOTHING NEW still marks the line that arrived while it was open', async () => {
  const sent: unknown[] = [];
  const stamp = stampOf(async (upTo) => (sent.push(upTo), true));
  /* Nothing was new at boot, so the shell has no cursor, and the first leave has nothing to send. */
  assert.equal(await stamp.leave(homeMark(null, { upTo: null, unseen: 0, held: 0 })), false);
  assert.equal(await stamp.leave(homeMark(null, { upTo: 41, unseen: 1, held: 41 })), true);
  assert.deepEqual(sent, [41]);
});

test('A MEMBER HELD TO NAMED LISTS sends back the cursor the page read answered with, and never a number', () => {
  const opened = 'e.01M1RQ3130J6MBME97EKYKKWZ2';
  const later = 'e.01M1RQ4FZ0J6MBME97EKYKKWZ9';
  /* Her lines carry no number, so `held` is 0 and the newer cursor is the one handed back, exactly as it came. */
  assert.equal(homeMark(opened, { upTo: later, unseen: 2, held: 0 }), later);
});

test('NOTHING NEW WHEN THE PAGE WAS READ IS NOTHING TO STAMP, though the tab opened on a cursor', () => {
  /* Activity stamped the mark in the same tab; the shell still holds the cursor it opened on. */
  assert.equal(homeMark(100, { upTo: null, unseen: 0, held: 0 }), null, 'Home stamped a mark another screen had already moved');
});

test('UNTIL THE RECORD HAS SAID WHAT IS NEW, HOME STAMPS THE SHELL’S CURSOR, and no cursor is still no mark', () => {
  assert.equal(homeMark(100, null), 100);
  assert.equal(homeMark('e.01M1RQ3130J6MBME97EKYKKWZ2', null), 'e.01M1RQ3130J6MBME97EKYKKWZ2');
  assert.equal(homeMark(null, null), null);
});

test('Home stamps through `readMarkOf` with what its last page read held, and asks before the page read it goes with', () => {
  const text = read(SCREENS.Home);
  assert.match(text, /import \{[^}]*\breadMarkOf\b[^}]*\} from '\$lib\/page\/read-mark\.ts';/u, 'Home does not import the one rule');
  assert.doesNotMatch(text, /stamp\.leave\(data\.upTo\)/u, 'Home stamps the cursor the tab opened on');
  assert.match(text, /news \? readMarkOf\(news\.upTo \?\? data\.upTo, news\.unseen, news\.held\) : readMarkOf\(data\.upTo, data\.upTo === null \? 0 : 1\)/u, 'the leave in this file’s `homeMark` is no longer Home’s');
  /* BOTH READS OF THE PAGE, the first and the one a new version of the record starts: each asks what is new before its
     page read goes out, so the cursor kept is never newer than the page it is kept beside. */
  const reads = [...text.matchAll(/const before = [^;\n]*newsNow\(\)[\s\S]*?\breadBody\(/gu)];
  assert.equal(reads.length, 2, 'a read of Home’s page does not ask what is new before it');
  assert.equal(text.match(/\bkeepNews\(before, mine(?:, key)?\)/gu)?.length, 2, 'what was new is kept beside a page that was not drawn');
  assert.equal(text.match(/\.whatsNew\(/gu)?.length, 1, 'Home asks what is new in a second place');
});
