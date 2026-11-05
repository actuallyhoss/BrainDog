/**
 * The six-digit field's rules (`code-form.ts`) and where the field is drawn: Settings, Agents, and Home's connect sheet
 * under the setup line, loaded with the sheet (first-run-connect-91).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { copy } from '../copy.ts';
import type { Approver } from '../record/keychain.ts';
import { CODE_PLACEHOLDER, approverOf, retyped, saidOf, sent } from './code-form.ts';

/* An invented machine; never a real one's name. */
const LAPTOP = 'Wren on Larkspur';

/** A fake client that records every code it was sent, looked at or pressed, and answers with `answer`. */
function fake(answer: (code: string) => Awaited<ReturnType<Approver['deviceApprove']>>) {
  const asked: string[] = [];
  const pressed: string[] = [];
  const client: Approver = {
    deviceLook: async (a) => {
      asked.push(a.user_code);
      const out = answer(a.user_code);
      return out.ok ? { ok: true as const, value: { ...out.value, expires: '2026-11-05T12:10:00.000Z', project: null, keys: [], more: 0 } } : out;
    },
    deviceApprove: async (a) => (pressed.push(a.handle), answer(a.user_code)),
  };
  return { asked, pressed, client };
}

const yes = () => ({ ok: true as const, value: { handle: 'h1', reach: 'login' as const, scope: null, label: LAPTOP, ua: null } });
const no = (code: string): (() => Awaited<ReturnType<Approver['deviceApprove']>>) => () => ({ ok: false as const, refusal: { code, fix: `said ${code}` } });

test('the CLI prints the code in two groups, and the two are read as one code', async () => {
  const { asked, client } = fake(yes);
  const approve = approverOf(client);
  for (const typed of ['123 456', '123 456', ' 123-456 ', '123456']) assert.equal((await approve(typed)).kind, 'looked', typed);
  assert.deepEqual(asked, ['123456', '123456', '123456', '123456']);
  assert.equal(CODE_PLACEHOLDER, '000000');
});

test('seven digits is refused out loud, never trimmed to a different code, and nothing is sent', async () => {
  const { asked, client } = fake(yes);
  const answer = await approverOf(client)('123 4567');
  assert.deepEqual(answer, { kind: 'malformed', why: 'long', digits: 7 });
  assert.deepEqual(saidOf(answer), { tone: 'bad', line: copy.codeLong(7), invalid: true, signIn: false });
  assert.deepEqual(saidOf(await approverOf(client)('12 34')), { tone: 'bad', line: copy.codeShort(4), invalid: true, signIn: false });
  assert.equal(saidOf(await approverOf(client)(''))?.line, copy.codeEmpty);
  assert.equal(saidOf(await approverOf(client)('123 45x'))?.line, copy.codeOther);
  assert.deepEqual(asked, []);
});

test('TYPING A CODE LETS NOTHING IN: it looks, says nothing under the boxes, and only the handle it answered approves', async () => {
  const { pressed, client } = fake(yes);
  const looked = await approverOf(client)('123456');
  assert.equal(looked.kind, 'looked');
  assert.deepEqual(pressed, [], 'typing the code pressed Approve');
  assert.equal(saidOf(looked), null);
  const typed = await sent('123456', approverOf(client));
  assert.equal(typed.typed, '123456', 'the code stays for the press');
  assert.equal(typed.changed, false);
  assert.equal((await approverOf(client)('123456', 'h1')).kind, 'approved');
  assert.deepEqual(pressed, ['h1']);
});

test('THE SHEET AFTER THE DIGITS SAYS WHAT IS ASKING, Approve is the one press that lets it in, and the focus is not on it', () => {
  const form = markup(read('./CodeForm.svelte'));
  for (const said of ['copy.confirmMachine', 'copy.confirmClient', 'copy.confirmCan', 'copy.confirmKeys', 'copy.confirmProject', 'copy.confirmSelf']) assert.ok(form.includes(said), said);
  assert.equal(form.match(/onclick=\{\(\) => void pressed\(\)\}/gu)?.length, 1);
  assert.ok(form.indexOf('copy.confirmApprove') > form.indexOf('</form>'), 'Approve is on the sheet, out of the form an Enter submits');
  assert.match(read('./CodeForm.svelte'), /sheetHead\?\.focus\(\)/u);
});

test('the answer says its own line and tone, from what deviceApprove answered', async () => {
  const approved = await approverOf(fake(yes).client)('123456', 'h1');
  const said = saidOf(approved);
  assert.equal(said?.tone, 'good');
  assert.equal(said?.invalid, false);
  assert.match(said?.line ?? '', new RegExp(`^${LAPTOP} is approved`, 'u'));
  assert.equal(saidOf(await approverOf(fake(no('FORBIDDEN')).client)('123456'))?.line, copy.codeWrong);
  assert.equal(saidOf(await approverOf(fake(no('DEVICE_CODE_TRIES')).client)('123456'))?.line, copy.codeTries);
  assert.equal(saidOf(await approverOf(fake(no('DEVICE_CODE_EXPIRED')).client)('123456'))?.line, copy.codeExpired);
  /* A refusal nobody mapped says the record's own sentence. */
  assert.equal(saidOf(await approverOf(fake(no('RATE_LIMITED')).client)('123456'))?.line, 'said RATE_LIMITED');
  assert.equal(saidOf(null), null);
});

test('a sign-in too old to approve, or none at all, offers Sign in again with its reason', async () => {
  for (const answer of [await approverOf(fake(no('NEEDS_BROWSER_SESSION')).client)('123456'), await approverOf(null)('123456')]) {
    assert.deepEqual(saidOf(answer), { tone: 'bad', line: copy.signInAgainWhy, invalid: true, signIn: true });
  }
  /* A malformed code is said before a missing sign-in: nothing is sent either way. */
  assert.equal((await approverOf(null)('12'))?.kind, 'malformed');
});

test('a refusal keeps the code typed, an approval empties the field, and a keystroke clears the answer', async () => {
  const kept = await sent('123 456', approverOf(fake(no('FORBIDDEN')).client));
  assert.equal(kept.typed, '123 456');
  assert.equal(kept.changed, false);
  const done = await sent('123 456', approverOf(fake(yes).client), 'h1');
  assert.equal(done.typed, '');
  assert.equal(done.changed, true);
  assert.deepEqual(retyped('12'), { typed: '12', answer: null });
});

/* ── where it is drawn ─────────────────────────────────────────────────── */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const markup = (src: string): string => src.slice(src.indexOf('</script>')).replaceAll(/<!--[\s\S]*?-->/gu, '');

test('the form is a form, takes any paste, and keeps its live region in the document', () => {
  const form = markup(read('./CodeForm.svelte'));
  assert.match(form, /<form[^>]*onsubmit=\{tryCode\}/u);
  assert.doesNotMatch(form, /maxlength|onpaste|onkeydown/u);
  assert.match(form, /autocomplete="one-time-code"/u);
  /* The status line is outside every `{#if}`: it is in the document before its first sentence. */
  const status = form.indexOf('role="status"');
  assert.ok(status > 0 && !form.slice(0, status).includes('{#if'), 'the live region is always drawn');
  /* The tone's mark sits beside the sentence. */
  assert.match(form, /role="img" aria-label=\{TONES\[said\.tone\]\.label\}/u);
});

test('Settings, Agents draws the one component in both places, on the owner\'s arm', () => {
  const agents = markup(read('../../routes/settings/[area]/areas/Agents.svelte'));
  assert.equal(agents.match(/<CodeForm id="user-code"/gu)?.length, 2);
  assert.doesNotMatch(agents, /autocomplete="one-time-code"/u);
  assert.match(agents, /code=\{first \? undefined : codeForm\}/u);
});

test('Home hands the sheet the field, loaded with the sheet and never at the top of Home', () => {
  const src = read('../home/WantMore.svelte');
  const script = src.slice(0, src.indexOf('</script>'));
  assert.doesNotMatch(script, /^\s*import (?!type )[^;]*CodeForm/mu);
  assert.doesNotMatch(script, /^\s*import (?!type )[^;]*code-form/mu);
  assert.match(script, /import\('\$lib\/agents\/CodeForm\.svelte'\)/u);
  const home = markup(src);
  assert.match(home, /<connect\.Form [^>]*onchanged=\{\(\) => \(approved = true\)\}/u);
  /* The owner's only: a reader who may not approve is given no field. */
  assert.match(home, /code=\{mayConnect \? codeField : undefined\}/u);
});
