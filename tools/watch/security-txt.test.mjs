/**
 * The door for a vulnerability, held to one address: `security.txt`'s `Contact`, `SECURITY.md`'s
 * fallback address, and the address the site's `/security` page gives are one string; `Expires` is more than 60 days
 * away; `Canonical` and `Policy` are there. Read only: nothing here writes a file.
 *
 * THE SITE'S ADDRESS IS FOUND, NOT COPIED: the page's `address` is bound to a constant, and the constant's value is read
 * from the file the page imports it from, so a page that changes its constant is followed.
 *
 * KNOWN DISAGREEMENTS ARE A `todo` WHILE THEY ARE EXACTLY WHAT WAS SEEN, and nothing else is. `PENDING` names each one
 * with the value the tree held when this test was written and the change that closes it (files this job does not own).
 * The day the tree holds the fix the assertion passes; a different wrong value is red, never a todo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(`${ROOT}${path}`, 'utf8');

/** How far away `Expires` must be. */
const EXPIRES_MS = 60 * 24 * 60 * 60 * 1000;

/** The fields of a `security.txt` (RFC 9116): each name to every value it is given, comments and blanks skipped. */
export function fieldsOf(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^([A-Za-z-]+):\s*(.+?)\s*$/.exec(line);
    if (!m || line.startsWith('#')) continue;
    (out[m[1].toLowerCase()] ??= []).push(m[2]);
  }
  return out;
}

/** `SECURITY.md`'s fallback address: the line that says "Fallback: email `<address>`". */
function fallbackAddress() {
  const m = /Fallback: email `([^`\s]+@[^`\s]+)`/.exec(read('SECURITY.md'));
  assert.ok(m, 'SECURITY.md says no fallback address ("Fallback: email `...`")');
  return m[1];
}

/** The address the site's `/security` page gives: the constant `address` is bound to, read where it is exported. */
function siteAddress() {
  const page = read('apps/site/src/routes/security/+page.svelte');
  const bound = /const address(?::\s*string)?\s*=\s*([A-Z_][A-Z0-9_]*)\s*;/.exec(page);
  assert.ok(bound, "the /security page's `address` is not bound to a constant");
  const from = new RegExp(`import\\s*\\{[^}]*\\b${bound[1]}\\b[^}]*\\}\\s*from\\s*'\\$lib/([^']+)'`).exec(page);
  assert.ok(from, `the /security page does not import ${bound[1]} from $lib`);
  const value = new RegExp(`export const ${bound[1]}\\s*=\\s*'([^']*)'`).exec(read(`apps/site/src/lib/${from[1]}`));
  assert.ok(value, `${bound[1]} is not a string constant in apps/site/src/lib/${from[1]}`);
  return { name: bound[1], file: `apps/site/src/lib/${from[1]}`, value: value[1] };
}

const txt = fieldsOf(read('apps/site/static/.well-known/security.txt'));

/**
 * WHAT THE TREE HELD ON 2026-10-14, and the change that closes each. A todo only while the value is exactly this.
 * Remove an entry once its fix lands.
 */
/* NONE LEFT (30 October): the three say support@brain.dog, the one address that is routed to a person. */
const PENDING = {};
const todoIf = (key, value) => (key in PENDING && PENDING[key].seen === value ? `pending: ${PENDING[key].fix}` : false);

const contact = txt.contact?.[0];
const site = siteAddress();

test("security.txt's Contact is SECURITY.md's fallback address", { todo: todoIf('contact', contact) }, () => {
  assert.equal(txt.contact?.length, 1, 'security.txt gives one Contact');
  assert.equal(contact, `mailto:${fallbackAddress()}`);
});

test("the site's /security page gives SECURITY.md's fallback address", { todo: todoIf('site', site.value) }, () => {
  assert.equal(site.value, fallbackAddress(), `${site.name} in ${site.file}`);
});

test("security.txt's Expires is more than 60 days away", () => {
  const at = Date.parse(txt.expires?.[0] ?? '');
  assert.ok(Number.isFinite(at), 'security.txt has no Expires a date can be read from');
  const days = Math.floor((at - Date.now()) / 86_400_000);
  assert.ok(at - Date.now() > EXPIRES_MS, `Expires is ${days} days away; move it a year on`);
});

test('security.txt names its Canonical address', () => {
  const canonical = txt.canonical?.[0] ?? '';
  assert.match(canonical, /^https:\/\/[^/]+\/\.well-known\/security\.txt$/);
});

test('security.txt names its Policy', { todo: todoIf('policy', txt.policy?.[0]) }, () => {
  /* THE SITE'S SECURITY PAGE, NOT SECURITY.md IN A PRIVATE REPOSITORY, which answers a stranger 404 (36d2257c6). */
  assert.equal(txt.policy?.[0], 'https://brain.dog/security');
});

test('the field reader skips comments and keeps every value', () => {
  const f = fieldsOf('# Contact: mailto:no@example.test\nContact: mailto:a@example.test\nContact: https://example.test/report\n\nExpires: 2030-01-01T00:00:00.000Z\n');
  assert.deepEqual(f.contact, ['mailto:a@example.test', 'https://example.test/report']);
  assert.deepEqual(f.expires, ['2030-01-01T00:00:00.000Z']);
});
