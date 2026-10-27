/**
 * What `/signin` hands on once somebody is in, and four things it got wrong on the owner's first minutes.
 *
 * WALKED, NOT READ. A walk of the first sign-in drove the Worker as production runs it, with a passkey made by
 * Chrome's own WebAuthn stack, and ranked what it met. This file holds four of those, by their rank:
 *
 *   1. After a sign-in that starts at the bare `/app/signin`, "Open BrainDog" drew The Studio, the sample business,
 *      and said "Nothing you do here is saved." Measured twice on the laptop (after the claim link and after the
 *      passkey), and the phone made the same move with no request. A reload drew his own record at `/app/walk`.
 *   7. The icons over "Your record is ready to claim." and "You are signed in" were 6 by 6 grey dots around a
 *      20-pixel icon, because `blocks.css` draws every `.glyph` as an intent dot and these screens reused the name.
 *   8. A claim link pasted into a tab already on `/app/signin` changed the address and nothing else, for 1.5 s and
 *      until a reload: a fragment-only change is a same-document navigation, and the link was read only on mount.
 *   9. After the claim link the screen said a passkey lets him sign in "without the key", a key he never used.
 *
 * WHY 1, 7 AND 8 ARE HELD BY READING THE PAGE'S SOURCE. A Svelte route does not mount under `node --test`, and the
 * browser gates that could drive it share ports with a full run. What can be held here is the mechanism (what
 * `readBoot` keeps across a sign-in, driven for real) and the page's own wiring, read as text.
 * The source checks are narrow on purpose: they name the four buttons, the two functions and the one class.
 *
 * THE INVITATION HOLDS ITEM 1 AS WELL. `/invite` is the first screen a colleague meets, it signs them in on
 * Accept exactly as `/signin` does, and testing found it drawing the sample
 * after the repair had been made here, so its "Open BrainDog" and its `accept` are held by the same two checks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { copy } from '../copy.ts';
import { forget, readBoot, refusedShell, type Fetch } from './boot-live.ts';

const ROUTES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'routes');
const SIGNIN = readFileSync(join(ROUTES, 'signin', '+page.svelte'), 'utf8');
const INVITE = readFileSync(join(ROUTES, 'invite', '+page.svelte'), 'utf8');
const LAYOUT = readFileSync(join(ROUTES, '+layout.svelte'), 'utf8');

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const BOOT = { record: { slug: 'walk', name: 'Sami', locale: 'en', currency: 'GBP' }, registers: [], now: '2026-09-23T06:30:00.000Z' };

/** A host that refuses `boot` until somebody signs in, and then answers the record, which is the walk exactly. */
function host(): { io: Fetch; signIn: () => void; asked: () => number } {
  let signed = false;
  let asked = 0;
  const io = (async () => {
    asked += 1;
    return signed
      ? json(200, { ok: true, value: BOOT })
      : json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } });
  }) as Fetch;
  return { io, signIn: () => (signed = true), asked: () => asked };
}

/* ── 1 · the kept sample, now gone ───────────────────────────────────── */

/**
 * THE 401 ON THE SIGN-IN SCREEN IS NOT KEPT, SO THE FIRST LOAD AFTER SIGNING IN ASKS THE RECORD.
 *
 * THIS TEST HELD ITEM 1 AS IT WAS. The sign-in screen's own load asked `boot` at the bare `/app` with no session,
 * was refused, and kept the sample for the tab; signing in is a `fetch` that sets a cookie, so the next load was
 * handed The Studio with no request made, and only `forget` put it right. With the sample gone that
 * 401 is a refusal like any other, and a refusal is never kept, so the read after the cookie asks and answers his
 * record without anybody dropping anything. `forget` in `enter` and the full page loads below stay: the switcher's
 * list and the voice are still kept for the tab.
 */
test('THE 401 ON THE SIGN-IN SCREEN IS NOT KEPT, so the first read after signing in answers his record', async () => {
  forget();
  const { io, signIn, asked } = host();
  assert.deepEqual(await readBoot('https://localhost:4403/app', io), { from: 'refused', code: 'UNAUTHORIZED', fix: 'Sign in again.' });
  signIn();
  const after = await readBoot('https://localhost:4403/app', io);
  assert.equal(after.from, 'live', 'the refusal from before the sign-in was handed back after it');
  assert.equal(asked(), 2);
  forget();
});

/**
 * AND THE SIGN-IN SCREEN DOES NOT POLL A RECORD NOBODY IS SIGNED IN TO.
 *
 * THE SAMPLE WAS WHAT KEPT IT QUIET. The layout polls `/api/version` whenever `data.live` is true, and the sample's
 * shell was the one that said false, so a stranger on the bare `/app/signin` was never polled. The shell over a
 * refusal says true, and `version` is `READ+`: with the sample gone every stranger's sign-in screen asked it, was
 * answered 401, and turned the hairline across the top of the screen to `offline`, a solid warning bar on the first
 * thing a new person sees, with another 401 on every tick after it.
 */
test('THE SHELL OVER A REFUSAL IS NOT POLLED, so a signed-out sign-in screen draws no offline bar', () => {
  const shell = refusedShell({ code: 'UNAUTHORIZED', fix: 'Sign in again.' });
  assert.equal(shell.live, true, 'the premise moved: `live` alone now tells a refusal apart');
  const poll = /\$effect\(\(\) => follow\(([^\n]*)\)\);/u.exec(LAYOUT)?.[1] ?? '';
  assert.ok(poll, 'no `follow` effect in the root layout');
  assert.match(poll, /\bdata\.refused \? null : apiBase\(/u, `the layout polls a record that refused it: follow(${poll})`);
});

/** The whole opening tag of the `Button` whose label is `copy.<key>`, or null when there is none. */
function buttonFor(src: string, key: string): string | null {
  const m = new RegExp(`<Button\\b[^>]*>\\s*\\{copy\\.${key}\\}`, 'u').exec(src);
  return m ? m[0] : null;
}

/* THE INVITATION IS THE SAME DOOR FOR THE FIRST COLLEAGUE. Testing drove
   the mechanism through the real `readBoot` for `/app/invite`: the layout kept the sample with nobody signed in,
   Accept set a cookie and nothing more, and "Open BrainDog" was `href="/"` with no reload, so the next move was handed
   `{"from":"sample"}` with one request made in all. The repair of 6959cf06 had been made on `/signin` alone. */
for (const [where, src, key] of [
  ['sign-in', SIGNIN, 'openBrainDog'],
  ['sign-in', SIGNIN, 'openYourRecord'],
  ['invite', INVITE, 'openBrainDog'],
] as const) {
  test(`"${copy[key]}" ON THE ${where.toUpperCase()} SCREEN IS A FULL PAGE LOAD, so nothing the tab kept before signing in is drawn after it`, () => {
    /* A full load drops every tab-kept answer at once (the boot, the switcher's `reach`, the voice) and lets the
       Worker's 302 put `/app/<slug>/` in the address. A client-side move keeps all of them, which was the bug. */
    const tag = buttonFor(src, key);
    assert.ok(tag, `no Button labelled copy.${key} on the ${where} screen`);
    /* THE VALUE IS READ TOO, not just the name. SvelteKit takes "" and "true" as a reload and "off" or "false" as
       the opposite, so a bare name check passed `data-sveltekit-reload="off"`, which is the client-side move again. */
    assert.match(tag, /\sdata-sveltekit-reload(?=[\s>])|\sdata-sveltekit-reload=(?:""|"true"|\{true\})/u, `copy.${key} is a client-side move: ${tag}`);
  });
}

test('SIGNING IN FORGETS THE KEPT BOOT, so a move that is not a full load still asks the record', () => {
  const enter = /const enter = [\s\S]*?\n {2}\};/u.exec(SIGNIN)?.[0] ?? '';
  assert.ok(enter, 'no `enter` on the sign-in screen');
  assert.match(enter, /\bforget\(\)/u, `enter() does not call forget():\n${enter}`);
});

test('ACCEPTING AN INVITATION FORGETS THE KEPT BOOT, and only once the host has said yes', () => {
  const accept = /async function accept\(\) \{[\s\S]*?\n {2}\}/u.exec(INVITE)?.[0] ?? '';
  assert.ok(accept, 'no `accept` on the invite screen');
  /* ON SUCCESS, NOT BEFORE THE ANSWER. A refused Accept leaves the stranger exactly as signed out as before, and the
     tab's kept answers are still right for a tab with no session, so dropping them there only asks for them again. */
  /* SUCCESS IS NOW TWO ANSWERS: joined, or a mail sent to prove the address. Proving leaves the stranger as
     signed out as a refusal does, so the kept boot is dropped only in the branch after both, where they joined. */
  assert.match(
    accept,
    /if \(!out\.ok\) \{[\s\S]*?\}\s*else if \(out\.value\.kind === 'proving'\)[^\n]*\n\s*else \{[^}]*\bforget\(\)/u,
    `accept() does not call forget() once, and only once they joined:\n${accept}`,
  );
  assert.equal(accept.match(/\bforget\(\)/gu)?.length, 1, `accept() calls forget() on more than one answer:\n${accept}`);
});

/* ── 7 · the dot where an icon was ───────────────────────────────────── */

for (const [where, src] of [
  ['sign-in', SIGNIN],
  ['invite', INVITE],
] as const) {
  test(`THE ${where.toUpperCase()} SCREEN DOES NOT NAME ITS ICONS \`.glyph\`, which blocks.css draws as a 6px dot`, () => {
    assert.doesNotMatch(src, /class="glyph\b/u);
    assert.doesNotMatch(src, /^\s*\.glyph\b/mu);
  });
}

/* ── 8 · a link pasted into a tab already here ───────────────────────── */

test('A LINK PASTED INTO A TAB ALREADY ON /signin IS TAKEN, on hashchange as well as on mount', () => {
  const on = /addEventListener\('hashchange', (\w+)\)/u.exec(SIGNIN);
  assert.ok(on, 'the sign-in screen does not listen for hashchange');
  assert.match(SIGNIN, new RegExp(`removeEventListener\\('hashchange', ${on[1]}\\)`, 'u'), 'the listener outlives the screen');
  const body = new RegExp(`(?:function ${on[1]}\\b|const ${on[1]} =)[\\s\\S]*?\\n {2}\\}`, 'u').exec(SIGNIN)?.[0] ?? '';
  assert.match(body, /\btakeLink\(/u, `${on[1]} does not read the link:\n${body}`);
  /* AND KEEPS WHAT IT READ. With `takeLink` called and its answer dropped, the fragment was cleared and the screen
     still said "Sign in to open your record.", which is item 8 above with the link now gone from the address as well. */
  assert.match(body, /^\s*link = \w+;/mu, `${on[1]} reads the link and does not keep it:\n${body}`);
});

/* ── 9 · "without the key" ───────────────────────────────────────────── */

test('AFTER A LINK THE SCREEN DOES NOT PROMISE A WAY IN WITHOUT A KEY HE NEVER HAD', () => {
  assert.doesNotMatch(copy.addPasskeyWhy('link'), /\bkey\b/u);
  assert.match(copy.addPasskeyWhy('link'), /\blink\b/u);
  /* The self-host's server key is the one case where "the key" is the thing he typed. */
  assert.match(copy.addPasskeyWhy('key'), /without the key/u);
  /* Signed in before this screen opened, so it cannot say how: it names neither. */
  assert.doesNotMatch(copy.addPasskeyWhy(null), /\bkey\b|\blink\b/u);
  assert.match(SIGNIN, /copy\.addPasskeyWhy\(entered\?\.via \?\? null\)/u);
});
