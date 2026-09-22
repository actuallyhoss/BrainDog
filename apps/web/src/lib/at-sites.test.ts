/**
 * Every address the app renders goes through `at()`, and every record call through `apiBase()` (`research-one-domain.md` §3.2).
 *
 * WHY A SOURCE SCAN AND NOT A TEST PER SCREEN. Under `paths.base = '/app'` an `<a href="/decide">` is outside the app,
 * so SvelteKit treats it as another site: a full load of `brain.dog/decide`, which is the marketing site's 404. A `goto`
 * to it does the same. On 23 September the tree held 90 such `href`s and 30 `goto`s, spread over 113 files, and no
 * screen test draws more than one of them. So this reads the source the way a reviewer would, and names each one.
 *
 * `inApp` IS `at` WHERE A FILE ALREADY HAS AN `at` OF ITS OWN (an each-block index in `PageView.svelte`).
 *
 * WHAT IT ALLOWS. A query (`?f=…`), a fragment and another origin are not addresses in the app. `Button` calls `at()` on
 * the `href` it is handed, so a `<Button href="/x">` is rendered right and is not listed; an `<a>` has nobody to do it.
 *
 * AND THE ORIGIN. `location.origin` is the bare host, which is right for `/auth`, `/account` and `/in` and wrong for a
 * record's `/api`, which is `apiBase()` under a slug. The files that still read it are named below with the reason.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function* sources(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* sources(p);
    else if (/\.(svelte|ts)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) yield p;
  }
}

/* COMMENTS ARE NOT RENDERED. Several explain the old `href="/"` by quoting it, and a scan that counted them would be
   switched off by the second false finding. Blanked to spaces so the line numbers still point at the source. */
const blank = (text: string) => text.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|(^|[^:'"`])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

/** Values handed to a navigation that were rendered under the app where they were made, and by what. */
const RENDERED = new Map([
  ['out.to', 'the switcher answers `/app/<slug>/` (`record/switcher.ts`)'],
  ['signIn', '`signInFirst` answers `/app/signin?next=…` (`lib/at.ts`)'],
  ['href', 'the sign-in `reprove` hands back is built by `lib/record/vault.ts`'],
]);

/** The files that read the bare origin on purpose, and what for. Anything else reading it is a record call gone to the root. */
const BARE_ORIGIN = new Map([
  ['lib/clipboard.ts', 'a copied link is absolute, and `at()` adds the record'],
  ['lib/ui/Sidebar.svelte', '`/auth/switch` is the person\'s, not a record\'s'],
  ['lib/page/PageView.svelte', 'a block\'s link is this address with its fragment'],
  ['lib/ui/WebhookDoors.svelte', 'a door is `/in/…` at the root, which a stranger posts to'],
  ['routes/p/[slug]/Reporting.svelte', 'the curl line is a bearer at `/api`, which names its record by the key'],
  ['routes/settings/[area]/+page.svelte', 'the login line, the mail door and the invite link are built on the bare host'],
]);

test('NO ADDRESS IN THE APP IS RENDERED WITHOUT `at()`, and no record call goes to the bare origin', () => {
  const found: string[] = [];
  for (const file of sources(SRC)) {
    const name = relative(SRC, file).split('\\').join('/');
    if (name === 'lib/at.ts') continue;
    const text = blank(readFileSync(file, 'utf8'));
    /* An `<a>`, or a `<svelte:element>` that may be one, whose `href` is a root path, or is computed without `at()`. */
    /* `{href}` IS THE SAME ATTRIBUTE WRITTEN SHORT, and the rail's six utility links were written that way and were the
       ones this scan missed the first time: found in a browser, `/audit` and five more on a page under `/app/acme`. */
    for (const m of text.matchAll(/<(?:a|svelte:element)\b[^>]*?\s(?:href=(?:"(\/[^"]*)"|\{([^}]*)\})|\{(href)\})/g)) {
      const value = m[1] ?? m[2] ?? m[3] ?? '';
      /* The shorthand is allowed only where the file itself derived `href` through `at()`. */
      if (m[3] !== undefined && /const href = \$derived\((at|inApp)\(/.test(text)) continue;
      /* `Button` renders its `href` as `to`, which is `at(href)` a few lines above. */
      if (m[2] !== undefined && (/\b(at|inApp)\(/.test(value) || (name === 'lib/ui/Button.svelte' && value === 'to'))) continue;
      found.push(`${name}:${lineOf(text, m.index)}  <a href=${m[1] !== undefined ? `"${value}"` : `{${value}}`}>`);
    }
    for (const m of text.matchAll(/\b(goto|location\.assign|redirect)\((?:\s*\d+,)?\s*([^,)]*)/g)) {
      const arg = m[2]!.trim();
      if (arg === '' || /^(at|inApp)\(/.test(arg) || /^[`'"][?#]/.test(arg) || RENDERED.has(arg)) continue;
      found.push(`${name}:${lineOf(text, m.index)}  ${m[1]}(${arg})`);
    }
    if (!BARE_ORIGIN.has(name)) for (const m of text.matchAll(/location\.origin/g)) found.push(`${name}:${lineOf(text, m.index)}  location.origin`);
  }
  assert.deepEqual(found, [], `${found.length} address(es) rendered outside the app or sent to the wrong record:\n  ${found.join('\n  ')}`);
});
