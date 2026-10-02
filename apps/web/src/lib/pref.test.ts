/**
 * The cookie the shell reads before it paints, and the two settings that were lost on every reload.
 *
 * WHAT IS BEING TESTED IS THE MERGE, mostly. Each preference is written by its own control, and a
 * write that carried only the field it knew about would silently reset every other one — which is
 * the shape of bug that makes people think a product forgets things at random, and is exactly what
 * a per-control store invites.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as pref from './pref.ts';

/** A document with a cookie jar, since that is the whole of what `pref` touches. */
function jar(initial = '') {
  (globalThis as { document?: { cookie: string } }).document = {
    get cookie() {
      return initial;
    },
    set cookie(next: string) {
      initial = next.split(';')[0] ?? '';
    },
  };
}

test('a write merges rather than replaces', () => {
  jar();
  pref.write({ scheme: 'dark' });
  pref.write({ density: 'roomy' });
  assert.deepEqual(pref.read(), { scheme: 'dark', density: 'roomy' });
});

test('HIDDEN COLUMNS SURVIVE A RELOAD, per register', () => {
  /* 50 §5.2 names the store `prefs.columns[register]` and it did not exist: untick a column, press
     Done, reload, and it is back — on a screen whose search, filters and sort all survive in the
     URL, which is why a reader expects this to. */
  jar();
  pref.write({ columns: { obligations: ['party', 'due'] } });
  pref.write({ columns: { ...pref.read().columns, services: ['cost'] } });

  assert.deepEqual(pref.read().columns, { obligations: ['party', 'due'], services: ['cost'] });
  // And the scheme somebody set earlier is still there, which is the merge doing its job.
  pref.write({ scheme: 'dark' });
  assert.deepEqual(pref.read().columns?.obligations, ['party', 'due']);
});

test('and clearing one register leaves the others alone', () => {
  jar();
  pref.write({ columns: { obligations: ['party'], services: ['cost'] } });
  const all = { ...pref.read().columns };
  delete all.obligations;
  pref.write({ columns: all });
  assert.deepEqual(pref.read().columns, { services: ['cost'] });
});

test('THE NAV ORDER SURVIVES A RELOAD', () => {
  /* The rail's header claims "position lives in a per-user store and wins", and there was no store:
     Move up reordered the rail on screen and a reload put it back, silently — while `Hide`, one item
     below it in the same menu, was honest about writing nothing. */
  jar();
  pref.write({ nav: ['/p/money', '/r/obligations', '/'] });
  assert.deepEqual(pref.read().nav, ['/p/money', '/r/obligations', '/']);
});

test('the activity mark survives, so "since you were away" can advance', () => {
  /**
   * HOME'S FEED MADE A CLAIM ABOUT THE READER'S OWN HISTORY AND NOTHING STORED ONE.
   *
   * "Since you were away" read a module constant and there was no mark anywhere — not in the cookie,
   * not in `localStorage` — so the fifth session showed the same six items as the first. `19 §6`
   * calls this half of Home the answer to *"what happened while you were not looking"*, and
   * `copy.markAllRead` sat unused waiting for the store that did not exist.
   *
   * AN INSTANT, NOT A PER-ITEM FLAG: one string that survives a new arrival correctly, and the same
   * shape the real record uses (`33 §2`'s `whatsNew` cursor, defaulting to `member.seen_at`).
   */
  jar();
  assert.equal(pref.read().seen, undefined, 'a first visit has looked at nothing');
  pref.write({ seen: '2026-09-03T09:00:00Z' });
  assert.equal(pref.read().seen, '2026-09-03T09:00:00Z');
  /* And it is replaced, not accumulated — marking read twice leaves one mark. */
  pref.write({ seen: '2026-09-04T09:00:00Z' });
  assert.equal(pref.read().seen, '2026-09-04T09:00:00Z');
});

test('a cookie this build cannot read is not a crash', () => {
  // A preference from an older version, or one somebody edited. The default is the right answer and
  // the next write replaces it.
  jar('bd_pref=%7Bnot-json');
  assert.deepEqual(pref.read(), {});
});

test('AND NEITHER IS ONE THAT PARSES AND HOLDS THE WRONG TYPE, which used to be a blank screen', () => {
  /**
   * The guard checked that the cookie parsed and that it was an object, and then cast, so every
   * reader after it believed the type. `{"defined":"row"}` threw at MODULE LOAD out of
   * `define.svelte.ts`, and `{"nav":"/x"}` threw inside the shell's own `$derived`. With
   * `ssr = false` a throw in either is a blank screen, on every route, until somebody clears a
   * cookie they cannot see.
   *
   * A STORED VALUE IS UNTRUSTED INPUT FROM THE PAST: written by a build that no longer exists, by
   * somebody with developer tools open, or by a version of this file with a different idea of what
   * `nav` holds. The test above covers only the ones that fail to parse, which is why this one
   * exists.
   */
  for (const [key, bad] of [
    ['nav', '"/x"'],
    ['defined', '"row"'],
    ['railShut', '3'],
    ['columns', '["what"]'],
    ['scheme', '"chartreuse"'],
    ['chars', '"yes"'],
    ['seen', '17'],
  ] as const) {
    jar(`bd_pref=${encodeURIComponent(`{"${key}":${bad}}`)}`);
    assert.deepEqual(pref.read(), {}, `${key} of the wrong type reached a reader`);
  }

  /* ONE BAD KEY DOES NOT LOSE THE OTHERS. Somebody who has chosen a dark scheme keeps it when an
     older build's `nav` is dropped: throwing away every correct setting to punish one is the same
     forgetting-at-random the merge above this file exists to prevent. */
  jar(`bd_pref=${encodeURIComponent('{"scheme":"dark","nav":"/x"}')}`);
  assert.deepEqual(pref.read(), { scheme: 'dark' });

  /* AND A KEY THIS BUILD DOES NOT KNOW IS KEPT, because it is a setting from a newer build sharing
     a browser with this one, and dropping it would make the two fight over the cookie. */
  jar(`bd_pref=${encodeURIComponent('{"scheme":"dark","fromTheFuture":42}')}`);
  assert.deepEqual(pref.read() as Record<string, unknown>, { scheme: 'dark', fromTheFuture: 42 });
});

test('THE SAMPLE BAR’S DISMISSAL IS NOT A PREFERENCE ANY MORE, and a cookie still carrying one is left alone', () => {
  /**
   * `sampleSaid` put away the bar that said "this is a sample record". The sample went and
   * the bar with it, so the key is read by nothing and checked by nothing: a value this build does not
   * know, exactly like a key from a newer build, and kept for the reason the test above gives.
   *
   * THE WRONG TYPE IS WHAT TELLS THE TWO APART. While `SHAPE` still named the key, `"yes"` was a bad
   * boolean and was dropped; once it is gone, nothing here has an opinion about it.
   */
  jar(`bd_pref=${encodeURIComponent('{"scheme":"dark","sampleSaid":"yes"}')}`);
  assert.deepEqual(pref.read() as Record<string, unknown>, { scheme: 'dark', sampleSaid: 'yes' });
});

test('and an absent document reads empty rather than throwing', () => {
  delete (globalThis as { document?: unknown }).document;
  assert.deepEqual(pref.read(), {});
  pref.write({ scheme: 'dark' });
});

/**
 * THE HIGH-CONTRAST PALETTE HAS A SWITCH, AND IT DID NOT.
 *
 * `packages/theme` solves a second palette against a higher contrast floor, `theme.mjs` writes it
 * into `house.css` behind `html[data-theme='hc']`, and `--check` byte-compares it on every build.
 * Nothing in `apps/web/src` ever set that attribute, so a whole generated palette validated by
 * sixteen checks could not be turned on by the reader it exists for.
 *
 * WHAT WAS IN ITS WAY IS WHAT THIS ALSO CHECKS. `data-theme` carried two meanings and only one was
 * read: `house.css` has four `data-theme` selectors and all four say `hc`, while the record accent
 * was being written into the same attribute by `app.html` and by `accent.ts`. The one that was
 * written was the one nothing read.
 */
test('the contrast palette has a switch, and the accent does not fight it for the attribute', () => {
  const house = readFileSync(fileURLToPath(new URL('../../../../packages/skin/house.css', import.meta.url)), 'utf8');
  const selectors = [...house.matchAll(/data-theme=(['"])([^'"]+)\1/gu)].map((m) => m[2]);
  assert.ok(selectors.length > 0, 'house.css no longer carries a data-theme palette');
  assert.deepEqual([...new Set(selectors)], ['hc'], 'data-theme means something other than hc again');

  /* THE BOOT SCRIPT WRITES IT, so the palette is on before first paint rather than after a flash. */
  const boot = readFileSync(fileURLToPath(new URL('../app.html', import.meta.url)), 'utf8');
  assert.match(boot, /p\.contrast&&d\.setAttribute\('data-theme','hc'\)/u, 'the shell does not boot the contrast palette');
  assert.doesNotMatch(boot, /setAttribute\('data-theme',\s*p\.theme\)/u, 'the accent claims data-theme again');

  /* AND THE ACCENT DOES NOT TOUCH IT. Its palette is an adopted stylesheet and needs no attribute. */
  const accent = readFileSync(fileURLToPath(new URL('./accent.ts', import.meta.url)), 'utf8');
  const code = accent.replace(/\/\*[\s\S]*?\*\//gu, '');
  assert.doesNotMatch(code, /data-theme/u, 'accent.ts writes data-theme again');

  /* THE CONTROL EXISTS, on the screen that owns every other palette decision. */
  const appearance = readFileSync(fileURLToPath(new URL('../routes/settings/[area]/areas/Appearance.svelte', import.meta.url)), 'utf8');
  assert.match(appearance, /pickContrast\(!moreContrast\)/u, 'nothing turns the contrast palette on');
  assert.match(appearance, /role="switch"\s+aria-checked=\{moreContrast\}/u, 'the switch does not say which state it is in');
});

/**
 * THE LOOK FOLLOWS THE PERSON, AND THE COOKIE IS ITS FIRST-PAINT COPY (`35`).
 *
 * Scheme, text size, density, contrast and accent were cookies only, so a new laptop opened in the house look. The record
 * keeps them now as `look.*`, `boot` answers them on `me.prefs`, and three things have to hold for that to be a fix and
 * not a new way to lose a setting: the record's answer beats a stale cookie, a host too old for the keys leaves the
 * cookie as the whole answer, and a choice goes to both, so the next first paint on this device is already right.
 */

/** A document with a cookie jar and an `<html>` whose attributes can be read back. */
function page(initial = '') {
  const attrs = new Map<string, string>();
  (globalThis as { document?: unknown }).document = {
    get cookie() {
      return initial;
    },
    set cookie(next: string) {
      initial = next.split(';')[0] ?? '';
    },
    documentElement: {
      setAttribute: (name: string, value: string) => void attrs.set(name, value),
      removeAttribute: (name: string) => void attrs.delete(name),
    },
  };
  return attrs;
}

/** A record that keeps every look key, and what it was sent, in order. */
function keeping() {
  const sent: [string, unknown][] = [];
  const send: pref.Send = async (key, value) => (sent.push([key, value]), { from: 'kept' });
  return { sent, send };
}

const cookie = (p: Record<string, unknown>) => `bd_pref=${encodeURIComponent(JSON.stringify(p))}`;

test("THE RECORD'S ANSWER WINS OVER THE COOKIE, and the cookie is rewritten from it for the next first paint", async () => {
  const attrs = page(cookie({ scheme: 'dark', text: 'sm', density: 'compact', rail: 'kept' }));
  const record = keeping();
  pref.follow(record.send);
  try {
    pref.adopt({ 'look.scheme': 'light', 'look.density': 'roomy', 'look.contrast': true, 'nav.order': ['/'] });

    const now = pref.read() as Record<string, unknown>;
    assert.equal(now.scheme, 'light', 'the stale cookie beat the record');
    assert.equal(now.density, 'roomy');
    assert.equal(now.contrast, true);
    assert.equal(now.text, 'sm', 'a key the record does not answer took the device copy with it');
    assert.equal(now.rail, 'kept', 'adopting the look lost a setting that has nothing to do with it');
    assert.equal(attrs.get('data-scheme'), 'light');
    assert.equal(attrs.get('data-density'), 'roomy');
    assert.equal(attrs.get('data-theme'), 'hc');

    /* ADOPTING IS READING. Sending the record's own word back to it would be a write on every load. */
    await pref.settled();
    assert.deepEqual(record.sent, [], 'adopting the record sent the look back to it');

    /* `system` IS AN ANSWER: the device matches its screen, whatever it last held. */
    pref.adopt({ 'look.scheme': 'system', 'look.contrast': false });
    assert.equal(pref.read().scheme, undefined);
    assert.equal(attrs.has('data-scheme'), false);
    assert.equal(pref.read().contrast, undefined);
    assert.equal(attrs.has('data-theme'), false);

    /* AND A WORD THIS BUILD DOES NOT KNOW IS NO ANSWER, so the device's copy stands. */
    pref.adopt({ 'look.size': 'huge', 'look.density': 7 });
    assert.equal(pref.read().text, 'sm');
    assert.equal(pref.read().density, 'roomy');
  } finally {
    pref.follow(null);
  }
});

test('A CHOICE GOES TO BOTH: the cookie at once, and the record in the order the presses were made', async () => {
  const attrs = page();
  const record = keeping();
  pref.follow(record.send);
  try {
    pref.apply('scheme', 'dark');
    pref.apply('text', 'md');
    pref.apply('density', 'compact');
    pref.contrast(true);
    /* MATCH THE SYSTEM IS SENT AS A WORD, not `null`, which would leave another device on the dark it last heard of. */
    pref.apply('scheme', null);

    assert.deepEqual(pref.read(), { text: 'md', density: 'compact', contrast: true }, 'the cookie did not take the change at once');
    assert.equal(attrs.get('data-text'), 'md');

    await pref.settled();
    assert.deepEqual(record.sent, [
      ['look.scheme', 'dark'],
      ['look.size', 'md'],
      ['look.density', 'compact'],
      ['look.contrast', true],
      ['look.scheme', 'system'],
    ]);
    assert.equal(pref.follows(), true);
  } finally {
    pref.follow(null);
  }
});

test('A HOST TOO OLD FOR THE KEYS REFUSES THEM, and the cookie is then the whole of the setting', async () => {
  page(cookie({ scheme: 'dark' }));
  const sent: string[] = [];
  pref.follow(async (key) => (sent.push(key), { from: 'refused', fix: 'key is one of nav.order or nav.hidden.' }));
  try {
    /* AN OLDER HOST ANSWERS NO `look.*` AT ALL, so the device's dark stands through the adopt. */
    pref.adopt({ 'nav.order': ['/p/money'] });
    assert.equal(pref.read().scheme, 'dark', 'a record with no look answer reset the device to the house scheme');

    pref.apply('density', 'roomy');
    const kept = await pref.keep('look.size', 'md');
    assert.equal(kept.from, 'refused');
    assert.deepEqual(sent, ['look.density', 'look.size'], 'the record was not asked');
    assert.equal(pref.read().density, 'roomy', 'a refusal took the choice off this device too');
    /* AND SETTINGS IS NOT TOLD "EVERY DEVICE" by a host that cannot keep it. */
    assert.equal(pref.follows(), false);
  } finally {
    pref.follow(null);
  }
});

test('and with no record listening, a choice stays on the device and nothing is sent', async () => {
  page();
  pref.follow(null);
  pref.apply('scheme', 'dark');
  assert.deepEqual(await pref.keep('look.scheme', 'dark'), { from: 'device' });
  assert.equal(pref.read().scheme, 'dark');
  assert.equal(pref.follows(), false);
});
