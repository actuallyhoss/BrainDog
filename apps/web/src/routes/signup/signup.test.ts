/**
 * Describe-then-build's two promises on sign-up: the record is named from what was heard, and what was said survives the
 * round trip through the mail to the tab the link opens.
 *
 * AGAINST THE RULES THE PAGE READS WITH (`propose`), not a fixture of their answer, so a reading that stops hearing a
 * business stops naming the record after it here too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  allWritten,
  arrivalOf,
  billing,
  checkName,
  chooseName,
  CODE_KEY,
  codeKept,
  keepCode,
  keepSaid,
  namesHeard,
  recordNames,
  SAID_KEY,
  SAID_MOST,
  saidFromLink,
  saidKept,
  signupMode,
  startSignup,
  type Asked,
  type Io,
  type NameSeen,
} from '../../lib/signup.ts';
import { readFileSync } from 'node:fs';

import { firstRun } from '../../lib/first-run.ts';
import { words } from './words.ts';
import { propose } from '../../lib/start/propose.ts';
import { oneQuestion, words as asked } from '../../lib/start/question.ts';

const CTX = { zone: 'Europe/London', locale: 'en-GB' };

/** A Directory that has handed out these names and no others. */
const directory =
  (taken: readonly string[], asked: string[] = []) =>
  async (slug: string): Promise<Asked<NameSeen>> => {
    asked.push(slug);
    return { ok: true, value: { slug, free: !taken.includes(slug), why: null, mode: 'open', open: true, turnstile: null } };
  };

/** A storage that keeps what it is given, as a tab's would. */
function storage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  };
}

test('THE RECORD IS NAMED FOR THE BUSINESS HEARD FIRST, then the person, then the address', () => {
  const p = propose('Sami, I run Kiln Studio, a pottery shop', CTX);
  assert.deepEqual(namesHeard(p), { person: 'Sami', business: 'Kiln Studio' });
  assert.deepEqual(recordNames(namesHeard(p), 'sami.k@example.com'), ['kiln-studio', 'sami', 'sami-k']);
  /* NO BUSINESS: the person. A client in People is not the business, and neither is a payment. */
  const billing = propose('I am Dana. We bill Fenwick £2,000 a month on the 1st', CTX);
  assert.equal(namesHeard(billing).business, null);
  assert.deepEqual(recordNames({ person: null, business: null }, 'dana@example.com'), ['dana']);
  /* THE BUSINESS WITH A CLIENT BESIDE IT is still the business, whichever the sentence said first. */
  assert.equal(namesHeard(propose('I am Dana, I run Kiln Studio and we bill Fenwick £2,000 a month', CTX)).business, 'Kiln Studio');
});

test('WITH NO NAME HEARD THE TRADE NAMES THE RECORD, never the email', () => {
  const p = propose('I run a small ceramics studio with two potters. I lose track of kiln firings and who owes me money.', CTX);
  assert.equal(p.title, 'Ceramics studio');
  assert.deepEqual(namesHeard(p), { person: null, business: 'Ceramics studio' });
  assert.deepEqual(recordNames(namesHeard(p), 'nadia@pots.example'), ['ceramics-studio', 'nadia']);
  /* A NAME HEARD STILL COMES FIRST: "Mariam's Candles" is the title she is shown, and the address is hers as before. */
  assert.equal(namesHeard(propose("I'm Mariam. I run a small candle shop", CTX)).business, null);
});

test('THE RECORD IS NEVER NAMED FOR A CLIENT OR A VENDOR, only for what the person runs', () => {
  /* WHAT A MODEL MAY HAND BACK, list by list: none of these is the person's, and the record's name is public. */
  const theirs = [
    { register: 'organisations', fields: { name: 'Acme Ltd' } },
    { register: 'people', fields: { name: 'Fenwick', role: 'client' } },
    { register: 'services', fields: { name: 'Adobe' } },
    { register: 'accounts', fields: { name: 'HSBC' } },
    { register: 'obligations', fields: { what: 'Monthly invoice to Fenwick' } },
  ];
  assert.deepEqual(namesHeard({ name: 'Jo', rows: theirs }), { person: 'Jo', business: null });
  assert.deepEqual(recordNames(namesHeard({ name: 'Jo', rows: theirs }), 'jo@acme.example'), ['jo']);
  /* A PROJECT THAT CARRIES A CLIENT'S NAME is the client's work, and the next project is the one taken. */
  const rows = [...theirs, { register: 'things', fields: { name: ' fenwick ' } }, { register: 'things', fields: { name: 'Kiln Studio' } }];
  assert.equal(namesHeard({ name: null, rows }).business, 'Kiln Studio');
});

test('A NAME IS ONE THE DIRECTORY COULD HAND OUT: a letter first, no hyphen last, never a spoken id', () => {
  assert.deepEqual(recordNames({ person: null, business: '2 Kiln Studio!' }, ''), ['kiln-studio']);
  assert.deepEqual(recordNames({ person: 'D41', business: null }, ''), [], 'd41 opens decision 41');
  assert.deepEqual(recordNames({ person: 'A', business: null }, '9@example.com'), [], 'one letter, and an address with no letter');
  const long = recordNames({ person: null, business: 'The Very Long Name Of A Studio That Makes Pots' }, '')[0] ?? '';
  assert.ok(long.length <= 32 && !long.endsWith('-'), long);
});

test('THE FIRST FREE NAME IS CHOSEN, and a taken one tries -2 to -9 before giving up', async () => {
  assert.equal(await chooseName(['kiln-studio', 'sami'], directory([])), 'kiln-studio');
  assert.equal(await chooseName(['kiln-studio', 'sami'], directory(['kiln-studio'])), 'sami');
  assert.equal(await chooseName(['kiln-studio', 'sami'], directory(['kiln-studio', 'sami', 'kiln-studio-2'])), 'kiln-studio-3');
  const asked: string[] = [];
  const all = ['kiln', ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `kiln-${n}`)];
  assert.equal(await chooseName(['kiln'], directory(all, asked)), null, 'every name is taken, and the person chooses one');
  assert.deepEqual(asked, all, 'it stops at -9');
  assert.equal(await chooseName([], directory([])), null);
  /* A HOST THAT DID NOT ANSWER IS NOT A NAME: the person is asked for one rather than given one nobody checked. */
  assert.equal(await chooseName(['kiln'], async () => ({ ok: false, kind: 'unreachable' })), null);
});

test('WHAT WAS SAID SURVIVES THE ROUND TRIP THROUGH THE MAIL, and only for the life of the link', () => {
  const tab = storage();
  const now = Date.UTC(2026, 9, 6, 9);
  keepSaid(tab, { said: 'Sami, I run Kiln Studio', currency: 'GBP', usecase: null }, now);
  /* THE TAB THE LINK OPENS reads it back, and builds what the first tab drew. */
  assert.deepEqual(saidKept(tab, now + 60_000), { said: 'Sami, I run Kiln Studio', currency: 'GBP', usecase: null });
  assert.equal(saidKept(tab, now + 27 * 60 * 60 * 1000), null, 'a sentence older than the link is not built');
  /* AN OLD SENTENCE IS REMOVED AS IT IS READ, so a shared device does not keep somebody's words for the next person. */
  assert.equal(tab.map.has(SAID_KEY), false);
  keepSaid(tab, { said: 'Sami, I run Kiln Studio', currency: 'GBP', usecase: null }, now);
  assert.equal(saidKept(tab, now - 60_000), null, 'one dated after this clock is not built');
  assert.equal(tab.map.has(SAID_KEY), false);
  keepSaid(tab, { said: 'Sami, I run Kiln Studio', currency: 'GBP', usecase: null }, now);
  /* FORGOTTEN once the record is made. */
  keepSaid(tab, null, now);
  assert.equal(tab.map.has(SAID_KEY), false);
  assert.equal(saidKept(tab, now), null);
});

test('THE SENTENCE KEPT IS THE WORDS ALONE, at most what the host keeps, and storage that throws keeps nothing', () => {
  const tab = storage();
  keepSaid(tab, { said: 'x'.repeat(SAID_MOST + 50), currency: null, usecase: 'founder' }, 1);
  const kept = JSON.parse(tab.map.get(SAID_KEY) ?? '{}') as Record<string, unknown>;
  assert.deepEqual(Object.keys(kept).sort(), ['at', 'currency', 'said', 'usecase']);
  assert.equal(String(kept.said).length, SAID_MOST);
  assert.equal(saidKept(tab, 2)?.usecase, 'founder');
  /* A BLANK SENTENCE IS NOTHING TO KEEP, and a broken one is nothing to read. */
  keepSaid(tab, { said: '   ', currency: null, usecase: null }, 1);
  assert.equal(tab.map.has(SAID_KEY), false);
  tab.setItem(SAID_KEY, '{not json');
  assert.equal(saidKept(tab, 2), null);
  assert.equal(tab.map.has(SAID_KEY), false, 'a broken sentence is removed too');
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  assert.doesNotThrow(() => keepSaid(blocked, { said: 'hello', currency: null, usecase: null }));
  assert.equal(saidKept(blocked), null);
});

test('THE SENTENCE IS FORGOTTEN ONLY WHEN THE BUILD IS ALL IN, so a dropped line or a refusal can be tried again', () => {
  assert.equal(allWritten({ failed: [] }), true);
  assert.equal(allWritten({ failed: [{ said: 'Money was not added.', why: '' }] }), false);
  assert.equal(allWritten(null), false, 'nothing answered');
});

/** A host that answers one envelope, and remembers what it was sent. */
function host(answer: unknown, status = 200) {
  const sent: { url: string; body: Record<string, unknown> | null }[] = [];
  const io: Io = {
    fetch: async (url, init) => {
      sent.push({ url, body: typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null });
      return new Response(JSON.stringify(answer), { status, headers: { 'content-type': 'application/json' } });
    },
  };
  return { io, sent };
}

const CODE = 'c'.repeat(20) + '_-' + 'D'.repeat(21);

test('WHO MAY SIGN UP IS THE HOST\'S mode, and a host a release older that says only open is read the old way', async () => {
  for (const mode of ['open', 'invite', 'closed'] as const) {
    const out = await checkName('', host({ ok: true, value: { slug: '', free: false, mode, open: mode !== 'closed' } }).io);
    assert.ok(out.ok);
    assert.equal(out.ok && out.value.mode, mode);
    assert.equal(out.ok && out.value.open, mode !== 'closed');
  }
  const old = await checkName('', host({ ok: true, value: { slug: '', free: false, open: true } }).io);
  assert.equal(old.ok && old.value.mode, 'open');
  const shut = await checkName('', host({ ok: true, value: { slug: '', free: false } }).io);
  assert.equal(shut.ok && shut.value.mode, 'closed', 'a host that says nothing is closed');
});

test('SIGN IN ASKS THE SAME DOOR FOR THE MODE ALONE, and a host that did not answer offers nothing', async () => {
  for (const mode of ['open', 'invite', 'closed'] as const) {
    assert.equal(await signupMode(host({ ok: true, value: { slug: '', free: false, mode, open: mode !== 'closed' } }).io), mode);
  }
  const down: Io = { fetch: async () => Promise.reject(new TypeError('offline')) };
  assert.equal(await signupMode(down), null);
});

test('AN INVITATION\'S CODE IS READ OFF THE ADDRESS AND WIPED, as a mailed link is, and kept for this tab only', () => {
  let wiped = 0;
  assert.deepEqual(arrivalOf(`#code=${CODE}`, () => (wiped += 1)), { kind: 'code', code: CODE });
  assert.equal(wiped, 1);
  /* A FRAGMENT THAT IS NOT A CODE IS NOT TAKEN, and the address is left as it was. */
  assert.equal(arrivalOf('#code=short', () => (wiped += 1)), null);
  assert.equal(wiped, 1);
  const tab = storage();
  keepCode(tab, CODE);
  assert.equal(tab.map.get(CODE_KEY), CODE);
  assert.ok(CODE_KEY.startsWith('braindog.signup'));
  assert.equal(codeKept(tab), CODE);
  keepCode(tab, 'not a code');
  assert.equal(codeKept(tab), null, 'anything but a code is not kept');
  keepCode(tab, CODE);
  keepCode(tab, null);
  assert.equal(tab.map.has(CODE_KEY), false);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.doesNotThrow(() => keepCode(blocked, CODE));
  assert.equal(codeKept(blocked), null);
});

test('THE CODE RIDES WITH THE START, and a refusal at code is the host\'s own sentence', async () => {
  const yes = host({ ok: true, value: {} });
  assert.deepEqual(await startSignup({ email: ' sami@example.com ', slug: 'kiln', code: CODE }, yes.io), { ok: true, value: { proof: null } });
  assert.equal(yes.sent[0]?.url, '/auth/signup/start');
  assert.equal(yes.sent[0]?.body?.['code'], CODE);
  const none = host({ ok: true, value: {} });
  await startSignup({ email: 'sami@example.com', slug: 'kiln' }, none.io);
  assert.equal('code' in (none.sent[0]?.body ?? {}), false, 'no code is sent when there is none');
  const fix = 'Sign-up here is by invitation, so open the link you were sent to sign up.';
  const no = await startSignup({ email: 'sami@example.com', slug: 'kiln' }, host({ ok: false, refusal: { code: 'FORBIDDEN', fix, at: 'code' } }, 403).io);
  assert.deepEqual(no, { ok: false, kind: 'refused', fix, at: 'code', code: 'FORBIDDEN' });
});

test('"MAKE IT AGAIN" WAITS ON THE ACCOUNT\'S OWN YES: canMake true only when the host says so', async () => {
  const said = await billing(host({ ok: true, value: { records: [], open: false, plans: [], canMake: true } }).io);
  assert.equal(said.ok && said.value.canMake, true);
  const silent = await billing(host({ ok: true, value: { records: [], open: false, plans: [] } }).io);
  assert.equal(silent.ok && silent.value.canMake, false, 'a host that did not say is a no');
});

test('THE INVITATION PAGE IS ONE PLAIN LINE, with no dash and no code to type', () => {
  for (const line of [words.inviteTitle, words.inviteWhy]) {
    assert.doesNotMatch(line, /[\u2013\u2014]/);
    assert.doesNotMatch(line, /\bcode\b/i, 'nobody types a code, so the page does not ask for one');
  }
});

/* ── use case 6, steps 1 to 4 (set 9 October) ───────────────────────── */

const PAGE = readFileSync(new URL('./Signup.svelte', import.meta.url), 'utf8');
const MARIAM = "I'm Mariam. I run a small candle shop in Alexandria and freelance as a designer. I lose track of orders and who owes me.";
const plain = (line: string) => {
  assert.doesNotMatch(line, /[\u2013\u2014]/, `${line} carries a dash`);
  assert.doesNotMatch(line, /\b(row|entity|list item)\b/i, `${line} names the machinery`);
};

/* STEPS 1 TO 3 ARE ONE CONVERSATION SINCE 1 NOV (56fa8292b), and its turns the only reading the page asks (a5ab06c83). */
test('STEP 1: THE PAGE OPENS ON THE CONVERSATION\'S FIRST QUESTION, NO CHIP CLOUD, and three promises, "Yours to export or move, any time" among them', () => {
  assert.equal(firstRun.whoPlaceholder, "I'm Mariam. I run a candle shop and want to keep track of orders, stock and what I owe suppliers.");
  assert.equal(words.promises.length, 3);
  assert.deepEqual([...words.promises], ['Free, with no card', 'Nothing is saved until you keep it', 'Yours to export or move, any time']);
  for (const line of [...words.promises, words.lede, firstRun.whoPlaceholder]) plain(line);
  assert.doesNotMatch(PAGE, /firstRun\.whoChips/, 'the starter chips are back (first F6)');
  assert.match(PAGE, /let asking = \$state\.raw<ChatAsk \| null>\(firstAsk\(\)\);/, 'the page does not open on the first question');
  assert.match(PAGE, /\{:else if step === 'describe'\}[\s\S]*?<Chat turns=\{chatTurns\} current=\{asking\}[\s\S]*?\{:else if step === 'keep'\}/, 'the first step is not the conversation');
  assert.match(PAGE, /words\.promises/, 'the page draws no promises');
});

test('STEP 2: THE READING STANDS ON WHERE IT SAYS THE WORDS ARE, the build forms beside the conversation, and the press that ends it goes on to Keep', () => {
  assert.equal(words.next, "That's me");
  assert.match(PAGE, /litIn\(sentence, read\?\.heard/, 'the marks are not cut from heard[].at');
  assert.match(PAGE, /<Chat [^\n]*onenough=\{\(\) => void keep\(\)\}/, 'the conversation cannot be ended to go on to Keep');
  for (const line of [words.heardTap, words.you, words.becomeInstead, words.takeOut]) plain(line);
});

test('STEP 3: ONE QUESTION AT MOST, each answer saying what it means, and the line that says it is the only one', () => {
  const q = oneQuestion(propose(MARIAM, CTX), MARIAM);
  assert.ok(q, 'Mariam is asked nothing');
  assert.equal(q.question, asked.arrivesQuestion);
  assert.equal(q.choices.length, 3);
  for (const c of q.choices) assert.ok(c.means && c.means.length > 0, `${c.label} does not say what it means`);
  assert.equal(q.only, 'That is the only question. Everything else came from what you wrote.');
  /* ONE QUESTION ON SCREEN: the conversation draws `current`, one object, and nothing beside it asks a second. */
  assert.equal((PAGE.match(/<Chat\b/g) ?? []).length, 1, 'more than one conversation is drawn');
  assert.doesNotMatch(PAGE, /id="first-q"/, 'the one-question step is back beside the conversation');
  assert.doesNotMatch(PAGE, /asking && open ===/, 'the old questions under the field are back');
  /* NOTHING TO ASK IS STRAIGHT ON: a name, no amount and no orders. */
  assert.equal(oneQuestion(propose("I'm Sami and I run a few companies", CTX), "I'm Sami and I run a few companies"), null);
});

test('STEP 4: WHAT WAS SAID IS SENT WITH THE START, so the link carries it to another device', async () => {
  assert.match(PAGE, /startSignup\(\{[^}]*said: draftNow\(\)/, 'the page does not send what was said');
  const yes = host({ ok: true, value: {} });
  await startSignup({ email: 'mariam@example.com', slug: 'mariams-candles', said: { said: MARIAM, currency: null, usecase: null } }, yes.io);
  const sent = yes.sent[0]?.body?.['said'];
  assert.equal(typeof sent, 'string', 'no said in the start');
  assert.equal(saidFromLink(sent as string)?.said, MARIAM);
  assert.equal(words.send, 'Email me a link');
  assert.equal(words.openHere, "Open the link on this phone. After that, this phone's lock signs you in.");
  for (const line of [words.openHere, words.openHereWide, words.lockTitle]) plain(line);
});

test('STEP 4: THE PASSKEY IS OFFERED STRAIGHT AFTER THE LINK, before the build, and the build goes on without it', () => {
  const verify = PAGE.slice(PAGE.indexOf('async function verify('), PAGE.indexOf('async function lockable('));
  assert.ok(verify.indexOf("step = 'lock'") > -1, 'the link does not offer the passkey');
  assert.ok(verify.indexOf("step = 'lock'") < verify.lastIndexOf('makeFree(held)'), 'the build is made before the passkey is offered');
  assert.match(PAGE, /<PasskeyFirst ondone=\{lockDone\} \/>/, 'nothing goes on past the passkey');
});

test('THE MAKING STEP HAS NO BAR THAT MOVES FOR EVER', () => {
  assert.doesNotMatch(PAGE, /class="bar"|\.bar-fill/);
});

/* ── closed, and signed in (the checker's two) ───────────────────────── */

test('INVITE ONLY IS ITS OWN SCREEN: the invite-only step draws Apply with the host\'s check, and the closed step does not', () => {
  const closed = PAGE.slice(PAGE.indexOf("{:else if step === 'closed'}"), PAGE.indexOf("{:else if step === 'invite-only'}"));
  const invite = PAGE.slice(PAGE.indexOf("{:else if step === 'invite-only'}"), PAGE.indexOf("{:else if step === 'describe'}"));
  assert.ok(closed.length > 0 && invite.length > 0, 'the two screens are not two branches');
  assert.doesNotMatch(closed, /<Apply\b|words\.invite/, 'the closed page asks to apply');
  assert.match(invite, /<Apply \{siteKey\} \/>/, 'the invite-only step does not draw Apply');
  assert.match(PAGE, /import Apply from '\.\/Apply\.svelte';/);
  /* THE SITE KEY IS SET BEFORE THE STEP, so the application carries the host's check. */
  const ask = PAGE.slice(PAGE.indexOf('async function ask('), PAGE.indexOf("step = 'describe'", PAGE.indexOf('async function ask(')));
  assert.ok(ask.indexOf('siteKey = out.value.turnstile') > -1, 'the site key is not read');
  assert.ok(ask.indexOf('siteKey = out.value.turnstile') < ask.indexOf("step = 'invite-only'"), 'the site key is set after the invite-only step');
  /* A CODE OR A SIGNED-IN PERSON NEVER SEES IT: the step is taken only with neither. */
  assert.match(ask, /mode === 'invite' && signedIn === null && codeKept\(tabStore\(\)\) === null\) \{\s*step = 'invite-only';/);
  const apply = readFileSync(new URL('./Apply.svelte', import.meta.url), 'utf8');
  assert.match(apply, /words\.haveAsk\} <a class="link" href=\{at\('\/signin'\)\}>\{copy\.signIn\}/, 'the way to sign in is gone');
  assert.match(apply, /widgetWords\(widgetState\)/, 'the check is not drawn as the sign-up form draws it');
  assert.match(apply, /\{#if siteKey !== null\}/, 'the check is drawn with no site key');
});


test('CLOSED ASKS NOTHING: no field, no question, and the page waits for the host before it says "Who are you?"', () => {
  const closed = PAGE.slice(PAGE.indexOf("{:else if step === 'closed'}"), PAGE.indexOf("{:else if step === 'invite-only'}"));
  assert.ok(PAGE.includes("{:else if step === 'closed'}") && closed.length > 0, 'the closed page is gone');
  assert.doesNotMatch(closed, /<textarea|<input|first-q|whoQuestion/, 'the closed page asks something');
  const loading = PAGE.slice(PAGE.indexOf("{#if step === 'loading' || step === 'verifying'}"), PAGE.indexOf("{:else if step === 'unreachable'}"));
  assert.doesNotMatch(loading, /whoQuestion/, 'the page asks who you are before it knows sign-up is open');
  const ask = PAGE.slice(PAGE.indexOf('async function ask('), PAGE.indexOf("step = 'describe'", PAGE.indexOf('async function ask(')));
  assert.match(ask, /mode === 'closed'\) \{\s*step = 'closed';\s*return;/, 'a closed host still reaches the describe step');
});

test('SIGNED IN, NO EMAIL: the address field and the link are only for somebody not signed in', () => {
  const keep = PAGE.slice(PAGE.indexOf("{:else if step === 'keep'}"), PAGE.indexOf("{:else if step === 'lock'}"));
  const field = keep.indexOf('id="up-email"');
  assert.ok(field > -1, 'the keep step has no email field');
  assert.ok(keep.lastIndexOf('{#if signedIn === null}', field) > keep.lastIndexOf('{/if}', field), 'the email field is drawn for somebody signed in');
  assert.match(PAGE, /const ready = \$derived\([^;]*signedIn !== null \|\|/, 'a person signed in still needs an email to go on');
  assert.match(PAGE, /\{#if signedIn === null && plan === 'free'\}<p class="quiet open-here">/, 'a person signed in is told to open a link');
});

test('BOTH FORMS LINK THE TERMS AND THE PRIVACY POLICY, in one short line under the press', () => {
  const line = `${words.agree} ${words.terms} ${words.agreeAnd} ${words.privacy}.`;
  assert.ok(line.length <= 48, `"${line}" fits one line at 390`);
  assert.doesNotMatch(line, /—/u);
  const apply = readFileSync(new URL('./Apply.svelte', import.meta.url), 'utf8');
  for (const [name, source] of [['the make form', PAGE], ['the apply form', apply]] as const) {
    assert.match(source, /<a class="link" href="https:\/\/brain\.dog\/legal\/terms" target="_blank" rel="noopener">\{words\.terms\}<\/a>/u, `${name} links the Terms`);
    assert.match(source, /<a class="link" href="https:\/\/brain\.dog\/legal\/privacy" target="_blank" rel="noopener">\{words\.privacy\}<\/a>/u, `${name} links the Privacy policy`);
  }
});
