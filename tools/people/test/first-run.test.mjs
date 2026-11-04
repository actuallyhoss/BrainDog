/**
 * Use case 6 for Mariam, walked on a fresh self-host: the test fails on the first red step, with that step's line.
 *
 * AND THE CHECKS FAIL BY THEMSELVES. One case a step: each pure check is handed what that step shows when it works and
 * must go green, then what it shows when it breaks and must go red, naming what broke. The person file is checked for
 * its shape, so a green walk is never a check that cannot fail.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

import { checkPerson } from '../check-files.mjs';
import { endOf, expect, firstReadAt, lineOf, marked, notMine, redOf, refusedWhy, selfHost, STEPS, walk } from '../expect/first-run.mjs';
import { words as signupWords } from '../../../apps/web/src/routes/signup/words.ts';
import { propose } from '../../../apps/web/src/lib/start/propose.ts';
import { answer, oneQuestion } from '../../../apps/web/src/lib/start/question.ts';
import { browserCurrencyEnv, zoneCurrency } from '../../../apps/web/src/routes/start/building.ts';

const MARIAM = JSON.parse(readFileSync(new URL('../mariam.json', import.meta.url), 'utf8'));
/** The walk's own source, so a step it does by a copy of the page, and not by the page's function, is red. */
const walker = readFileSync(new URL('../expect/first-run.mjs', import.meta.url), 'utf8');

/** Her sentence read as the sign-up page reads it, on a phone in Alexandria. */
const env = browserCurrencyEnv(MARIAM.locale, MARIAM.languages, MARIAM.zone);
const read = () => propose(MARIAM.said, { zone: MARIAM.zone, locale: MARIAM.locale, currency: zoneCurrency(MARIAM.zone) });

test('her file holds every field the walk reads, and one missing or wrong is refused by name', () => {
  assert.deepEqual(checkPerson(MARIAM), []);
  const { first: _first, ...noFirst } = MARIAM;
  assert.deepEqual(checkPerson(noFirst), ['first is missing: her first real thing, the sentence she tells the card']);
  const noPlaces = { ...MARIAM, expect: { ...MARIAM.expect, heard: { ...MARIAM.expect.heard, places: undefined } } };
  assert.match(checkPerson(noPlaces).join('\n'), /expect\.heard\.places is missing/u);
  /* WHAT ONLY A SHOP SAYS may be left out, but never written wrong. */
  const { money: _money, ...noMoney } = MARIAM.expect.today;
  assert.deepEqual(checkPerson({ ...MARIAM, expect: { ...MARIAM.expect, today: noMoney } }), []);
  const badLead = { ...MARIAM, expect: { ...MARIAM.expect, offer: { ...MARIAM.expect.offer, lead: { says: 'x', match: '(' } } } };
  assert.match(checkPerson(badLead).join('\n'), /expect\.offer\.lead is not/u);
  const strayPhrase = { ...MARIAM, expect: { ...MARIAM.expect, heard: { ...MARIAM.expect.heard, became: { freelance: ['Clients'] } } } };
  assert.match(checkPerson(strayPhrase).join('\n'), /names "freelance", which is not lit/u);
});

test('1. WHO ARE YOU? green on the five starting points and three promises; red on a tour, a count, a missing promise', () => {
  const copy = ['Free, with no card.', 'Nothing is saved until you keep it.', 'Yours to export or move.'];
  const chips = ['I run a small shop', 'I freelance', "I'm a student", 'I run a few companies', "I'm part of a team"];
  assert.equal(expect.who({ question: 'Who are you?', chips, copy }, MARIAM).pass, true);
  const who = expect.who({ question: 'Tell us about yourself', chips: ['I freelance'], copy: ['Take the tour', 'Step 1 of 3'] }, MARIAM);
  assert.equal(who.pass, false);
  for (const said of [/the question reads "Tell us about yourself"/u, /no "I run a small shop"/u, /1 starting points, not 5/u, /no promise "free, with no card"/u, /it says "Take the tour"/u]) assert.match(who.saw, said);
});

test('2. HER WORDS LIGHT UP: green on her own sentence read as the page reads it; red on half phrases, People for Clients, a place she never said', () => {
  const p = read();
  const heard = expect.heard({ proposal: p }, MARIAM);
  assert.equal(heard.pass, true, heard.saw);
  assert.match(heard.saw, /places Today, Orders, Products, Clients, Money/u);

  /* FREELANCE READ AS PEOPLE, "owes" lit alone, Projects among the places: what 48 read before uc6-heard-49. */
  const at = (phrase) => [MARIAM.said.indexOf(phrase), MARIAM.said.indexOf(phrase) + phrase.length];
  const old = {
    ...p,
    heard: p.heard.map((h) => (h.phrase === 'freelance as a designer' ? { ...h, phrase: 'freelance', became: 'People and Money', at: at('freelance') } : h.phrase === 'who owes me' ? { ...h, phrase: 'owes', at: at('owes') } : h)),
    places: [{ name: 'Today' }, { name: 'Orders' }, { name: 'Products' }, { name: 'People' }, { name: 'Projects' }, { name: 'Money' }],
  };
  const red = expect.heard({ proposal: old }, MARIAM);
  assert.equal(red.pass, false);
  for (const said of [/"freelance as a designer" not lit/u, /"who owes me" not lit/u, /no Clients among the places/u, /People, Projects among the places, which she never said/u]) assert.match(red.saw, said);

  const asPeople = { ...p, heard: p.heard.map((h) => (h.phrase === 'freelance as a designer' ? { ...h, became: 'People' } : h)) };
  assert.match(expect.heard({ proposal: asPeople }, MARIAM).saw, /"freelance as a designer" became "People", not Clients and Invoices/u);
  const noCurrency = { ...p, heard: p.heard.map((h) => (h.phrase === 'who owes me' ? { ...h, became: 'Money' } : h)) };
  assert.match(expect.heard({ proposal: noCurrency }, MARIAM).saw, /"who owes me" became "Money", not Money and Egyptian pounds/u);

  const sample = expect.heard({ proposal: { ...p, usecase: 'business', title: null, places: [{ name: 'Orders' }, ...p.places], rows: [{ register: 'orders', fields: { what: 'Example order' } }] } }, MARIAM);
  for (const said of [/read as business/u, /titled nothing/u, /first place is Orders/u, /before anything is kept/u]) assert.match(sample.saw, said);
});

test('3. ONE QUESTION: green on the page\'s own question; red on an answer that says nothing, a second question, no "only question"', () => {
  const p = read();
  const asked = oneQuestion(p, MARIAM.said, env);
  const after = answer(p, asked.about, MARIAM.answer, MARIAM.said);
  const green = expect.question({ asked, after, again: oneQuestion(after, MARIAM.said, env) }, MARIAM);
  assert.equal(green.pass, true, green.saw);

  const choice = { value: 'messages', label: 'Messages', means: '' };
  const red = expect.question({ asked: { about: 'currency', question: 'Where?', choices: [choice], only: '' }, after: { answers: {} }, again: { question: 'And your name?' } }, MARIAM);
  assert.equal(red.pass, false);
  for (const said of [/asked about currency, not arrivesBy/u, /1 answers, not 3/u, /"Messages" says nothing/u, /not say it is the only question/u, /"messages" was not kept/u, /a second question followed/u]) assert.match(red.saw, said);
  assert.match(expect.question({ asked: null }, MARIAM).saw, /no question was asked/u);
});

test('4. KEEP IT: the build is the page\'s own, called; red on no currency, a list not made, a sample person, a refused link', () => {
  /* THE WALK BUILDS WITH `accepting()`, as the sign-up page does: a copy once sent a currency the page never did. */
  assert.match(walker, /import \{ accepting\b[^}]*\} from '\.\.\/\.\.\/\.\.\/apps\/web\/src\/routes\/signup\/build\.ts'/u);
  /* AND THE NAMES THE PAGE SENDS ARE ITS OWN (`nameSent`, `titleSent`), never a copy: her name at the start, the title
     she was shown when the record is made. */
  assert.match(walker, /keepIt\(host, person, nameSent\(proposal\), titleSent\(after, person\.name\)\)/u);
  assert.match(walker, /await accepting\(/u);
  assert.doesNotMatch(walker, /currencyChoices\(|INSTALL_ORDER|\bconst offered\b/u, 'the walk picks modules or a currency of its own beside accepting()');

  const lists = MARIAM.expect.keep.lists;
  const good = { door: 'signup', failed: [], lists, people: ['Mariam'], examples: 0, currency: 'EGP', title: "Mariam's Candles" };
  assert.equal(expect.keep(good, MARIAM).pass, true);
  const self = expect.keep({ ...good, door: 'self-host' }, MARIAM);
  assert.equal(self.pass, null);
  assert.match(self.saw, /^sign-up not walked: self-host/u);
  /* THE PAGE SENDS THE NAME IT HEARD, so a record opened as "Mariam" is not the one she was shown. */
  assert.match(expect.keep({ ...good, title: 'Mariam' }, MARIAM).saw, /the mailed link opened "Mariam", not "Mariam's Candles"/u);
  assert.doesNotMatch(walker, /keepIt\(host, person, after\.title/u, 'the walk signs up under a name the page never sends');

  const red = expect.keep({ ...good, lists: lists.filter((id) => id !== 'obligations'), people: ['Mariam', 'Nadia'], examples: 2, currency: null }, MARIAM);
  assert.equal(red.pass, false);
  for (const said of [/no obligations on the record/u, /People holds Mariam, Nadia/u, /2 entries tagged example/u, /currency is none, not EGP/u]) assert.match(red.saw, said);
  const failed = expect.keep({ ...good, door: 'refused', why: 'the link was refused', failed: [{ said: 'Shop was not added.', why: 'no' }] }, MARIAM);
  assert.match(failed.saw, /sign-up refused: the link was refused; the build said "Shop was not added\."/u);
});

/** Her first real thing as the card reads it on a fresh shop: Nadia, her order, and the paid item in Bills and invoices. */
const told = MARIAM.expect.tell.lists.map((register, seq) => ({ register, fields: {}, said: register, missing: [], seq, title: register }));
const all = Object.fromEntries(told.map((r) => [r.register, 1]));
const none = Object.fromEntries(told.map((r) => [r.register, 0]));
const good = { preview: { rows: told, left: [] }, counts: { before: none, previewed: none, added: all, undone: none }, batch: 'b1', made: told, kept: [] };

test('5. TELL IT ONE REAL THING: green on three entries added as one and one Undo; red on the Ledger, a held Add, a write before the press, an Undo that leaves one', () => {
  assert.deepEqual(MARIAM.expect.tell.lists, ['people', 'orders', 'obligations']);
  assert.match(walker, /readyRows\(preview\.rows\)/u, 'the walk picks what one press sends by a copy of the card');
  assert.equal(expect.tell(good, MARIAM).pass, true);

  /* "PAID 900 ON INSTAPAY" ON THE LEDGER needs an account a fresh shop does not hold, so Add is held (uc6-tell-49). */
  const ledger = told.map((r) => (r.register === 'obligations' ? { ...r, register: 'transactions', missing: ['account'], said: 'EGP 900 in' } : r));
  const held = expect.tell({ ...good, preview: { rows: ledger, left: [] }, made: told.slice(0, 2) }, MARIAM);
  assert.equal(held.pass, false);
  assert.match(held.saw, /the preview is people, orders, transactions, not people, orders, obligations; "EGP 900 in" needs account, so Add is held/u);

  const early = expect.tell({ ...good, counts: { ...good.counts, previewed: all } }, MARIAM);
  assert.match(early.saw, /written before the press/u);
  const oneLeft = expect.tell({ ...good, counts: { ...good.counts, undone: { ...none, orders: 1 } }, kept: [told[1]] }, MARIAM);
  assert.match(oneLeft.saw, /the one Undo left "orders" in orders; after the one Undo, orders holds 1, was 0/u);
  /* COUNTS ALONE WOULD PASS AN UNDO THAT TOOK BACK THE WRONG ONE: the entry's own number says it. */
  assert.match(expect.tell({ ...good, kept: [told[0]] }, MARIAM).saw, /the one Undo left "people" in people/u);
  assert.match(expect.tell({ ...good, counts: { ...good.counts, added: none } }, MARIAM).saw, /the lists grew by 0/u);
  assert.match(expect.tell({ ...good, batch: undefined }, MARIAM).saw, /no batch, so no one Undo/u);
  assert.match(expect.tell({ ...good, refused: 'CAPTURE_REFUSED: no' }, MARIAM).saw, /the press was refused: CAPTURE_REFUSED/u);
});

test('6. HER FIRST TODAY: green on the card gone and Came in EGP 900; red on the tile missing, in minor units, or the card still up', () => {
  const source = [{ kind: 'source', source: { name: "Your bank's texts" } }];
  const today = { ok: true, tellShown: false, steps: source, hiddenSteps: [], lists: ['orders', 'people'], offers: [], money: [['Came in', 'EGP 900.00']], line: 'EGP 900 came in this week.' };
  const green = expect.today(today, MARIAM);
  assert.equal(green.pass, true, green.saw);
  assert.match(green.saw, /the money tile reads "Came in EGP 900"/u);

  assert.match(expect.today({ ...today, money: null }, MARIAM).saw, /no Money this week tile, so no "Came in EGP 900"/u);
  assert.match(expect.today({ ...today, money: [['Came in', 'EGP 90000']] }, MARIAM).saw, /the money tile reads "Came in EGP 90000", not "Came in EGP 900"/u);
  /* THE LEDGER'S MONEY IN, which never sees a paid item: the tile drawn over nothing. */
  assert.match(expect.today({ ...today, money: [] }, MARIAM).saw, /the money tile reads nothing/u);

  const agent = [{ kind: 'agent', agent: { name: 'An agent' } }];
  const red = expect.today({ ...today, tellShown: true, steps: agent, hiddenSteps: agent, lists: ['people'], offers: [{ title: 'Orders this week' }] }, MARIAM);
  assert.equal(red.pass, false);
  for (const said of [/still up/u, /not the source/u, /Hide left/u, /no orders in boot/u, /on her first day/u]) assert.match(red.saw, said);
  assert.match(expect.today({ ok: false, why: 'no answer' }, MARIAM).saw, /boot was refused/u);
});

test('7. A PAGE FOR HER PATTERN: green on day 15 with Orders saying who still owes; red on an early offer, none, or a sentence with no owed clause', () => {
  const offer = { id: 'week:orders', title: 'Orders this week', why: '4 orders due this week. Want a page of their own for them?' };
  /* WITH ITS FULL STOP, as every page's opening sentence ends (P13). */
  const lead = '6 orders this month, 4 to ship this week, 2 late, and Salma still owes EGP 1,350.';
  const seen = { early: [], earlyDay: 13, late: [offer], lateDay: 15, weeks: 3, thisWeek: 4, lead };
  const green = expect.offer(seen, MARIAM);
  assert.equal(green.pass, true, green.saw);
  assert.match(green.saw, /Orders says "6 orders this month/u);
  /* THE HEAD WRITES EGP AS EVERY OTHER PLACE DOES, "EGP 1,350", never "E£1,350" (the house rule since 9 October). */
  assert.equal(expect.offer({ ...seen, lead: lead.replace('EGP ', 'E£') }, MARIAM).pass, false);

  const red = expect.offer({ ...seen, early: [offer], late: [], weeks: 2, thisWeek: 3 }, MARIAM);
  assert.equal(red.pass, false);
  for (const said of [/before day 14/u, /read on 2 weeks/u]) assert.match(red.saw, said);
  assert.match(expect.offer({ ...seen, late: [{ ...offer, why: 'You have 4 rows' }] }, MARIAM).saw, /its why says/u);
  /* THE OWED CLAUSE IS WHAT THE MOCKUP SAYS, and a ref drawn as its id, or a total never kept, leaves it out or wrong. */
  assert.match(expect.offer({ ...seen, lead: '6 orders this month, 4 to ship this week, 2 late' }, MARIAM).saw, /Orders says "6 orders this month, 4 to ship this week, 2 late", not/u);
  assert.match(expect.offer({ ...seen, lead: '6 orders this month, 4 to ship this week, 2 late, and 01JZ8QK3F7R2M9V4XN6TCB5HAD still owes EGP 1,350' }, MARIAM).saw, /not "6 orders this month/u);
  assert.match(expect.offer({ ...seen, lead: null }, MARIAM).saw, /Orders says no sentence/u);
});

test('MARIAM ON A FRESH SELF-HOST: the seven steps, and the first red one fails the test', async () => {
  const host = await selfHost(MARIAM);
  const lines = [];
  let results;
  try {
    results = await walk(MARIAM, host, (r) => lines.push(lineOf(r)));
  } finally {
    await host.close();
  }
  console.log(lines.join('\n'));
  assert.deepEqual(results.map((r) => r.id), STEPS.map((s) => s.id), 'the walk did not say all seven steps');
  const red = results.find((r) => r.pass === false);
  assert.equal(red, undefined, red ? lineOf(red) : '');
});

test('MARIAM WITH TWO PEOPLE OWING: the same seven steps, and Orders counts the two other orders nobody has paid on', async () => {
  const TWO = JSON.parse(readFileSync(new URL('../mariam-two-debtors.json', import.meta.url), 'utf8'));
  assert.deepEqual(checkPerson(TWO), []);
  assert.notEqual(TWO.slug, MARIAM.slug);
  assert.notEqual(TWO.email, MARIAM.email);
  assert.match(TWO.expect.offer.lead.says, /Salma still owes EGP 1,350, with 2 more orders not paid at all\.$/u);
  const host = await selfHost(TWO);
  let results;
  try {
    results = await walk(TWO, host, () => {});
  } finally {
    await host.close();
  }
  const red = results.find((r) => r.pass === false);
  assert.equal(red, undefined, red ? lineOf(red) : '');
});

test('it never writes to a record it did not make', async () => {
  const fresh = { registers: [], record: { slug: MARIAM.slug, name: MARIAM.expect.heard.title } };
  assert.equal(notMine(fresh, MARIAM), null);
  assert.match(notMine({ ...fresh, record: { slug: 'pat', name: 'Pat' } }, MARIAM), /in Pat, not mariams-candles/u);
  assert.match(notMine({ ...fresh, registers: [{ id: 'orders', count: 3 }] }, MARIAM), /already holds three entries/u);
  assert.match(notMine(null, MARIAM), /did not answer/u);

  /* THE OWNER DOOR LANDS IN ANOTHER RECORD: step 4 is red, the walk stops, and that record is left as it was. */
  const host = await selfHost(MARIAM);
  let landed = null;
  const elsewhere = { ...host, owner: (t, who, title) => ((landed = t), host.owner(t, { ...who, slug: 'someone-else' }, title)) };
  let results;
  try {
    results = await walk(MARIAM, elsewhere);
    const after = await landed.client().boot();
    assert.equal(after.ok, true);
    assert.equal(after.value.registers.reduce((n, r) => n + r.count, 0), 0);
    assert.equal(after.value.registers.some((r) => r.id === 'orders' || r.id === 'people'), false);
  } finally {
    await host.close();
  }
  const keep = results.find((r) => r.id === 'keep');
  assert.equal(keep.pass, false);
  assert.match(keep.saw, /nothing was written to it/u);
  for (const r of results.slice(4)) assert.match(r.saw, /^not reached: /u);
});

/* ── run as a command: what it leaves with ───────────────────────────────────────────────────────────── */

const COMMAND = new URL('../expect/first-run.mjs', import.meta.url).pathname;

/** The command run to its end, not through a pipe: `{ status, stdout, stderr }`. Never `spawnSync`, which would hold
    this process still while the stub host below has to answer. */
function run(args) {
  return new Promise((done, broke) => {
    const child = spawn(process.execPath, [COMMAND, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    const said = { stdout: '', stderr: '' };
    child.stdout.on('data', (d) => (said.stdout += d));
    child.stderr.on('data', (d) => (said.stderr += d));
    child.on('error', broke);
    child.on('close', (status) => done({ status, ...said }));
  });
}

/** A host that is there and has none of the doors: every request is answered 404, so sign-up is refused at step 4. */
async function noDoors() {
  const server = createServer((_, res) => void res.writeHead(404, { 'content-type': 'application/json' }).end('{}'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

/* A REPORT said the command left with 0 on a red walk. It never did: the 0 was the exit code of the pipe the
   run was read through. These pin what it leaves with, each way it can end. */
test('RUN AS A COMMAND ON A HOST WITH NO SIGN-UP: step 4 is red, the three after it are red, and it exits 1', { timeout: 60_000 }, async () => {
  const host = await noDoors();
  let r;
  try {
    r = await run(['--base', host.origin]);
  } finally {
    await host.close();
  }
  assert.match(r.stdout, /^4\. Keep it: red\. sign-up refused/mu);
  /* It read "sign-up refused: refused", a kind where a reason belongs. It says the step, that the
     host sent no reason, what the sign-up page shows her then, and the kind last. */
  const four = r.stdout.split('\n').find((l) => l.startsWith('4. '));
  assert.doesNotMatch(four, /sign-up refused: refused/u);
  assert.ok(four.includes(`sign-up refused: asking for the link: the host sent no reason, and the page says "${signupWords.sendFailed}" (refused)`), four);
  assert.match(r.stdout, /^red\. 3 of 7 steps green$/mu);
  for (const n of [5, 6, 7]) assert.match(r.stdout, new RegExp(`^${n}\\. .+: red\\. not reached: `, 'mu'));
  assert.equal(r.stdout.split('\n').filter((l) => /^\d\. /u.test(l)).length, STEPS.length);
  assert.equal(r.status, 1);
});

test('RUN AS A COMMAND ON A FRESH SELF-HOST: seven green lines and it exits 0', { timeout: 120_000 }, async () => {
  const r = await run([]);
  assert.equal(r.stdout.split('\n').filter((l) => /^\d\. .+: green\. /u.test(l)).length, STEPS.length, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /: (red|not walked)\. /u);
  assert.equal(r.stdout.trimEnd().split('\n').at(-1), 'green. all 7 steps walked');
  assert.equal(r.status, 0);
});

test('RUN AS A COMMAND, A THROW IS RED TOO: a person file the walk cannot read exits 1 and says why in red', { timeout: 60_000 }, async () => {
  const host = await noDoors();
  let thrown, missing;
  try {
    /* package.json is JSON and no person: the walk throws on its first read of her. */
    thrown = await run([new URL('../../../package.json', import.meta.url).pathname, '--base', host.origin]);
    missing = await run([new URL('../nobody-here.json', import.meta.url).pathname, '--base', host.origin]);
  } finally {
    await host.close();
  }
  for (const r of [thrown, missing]) {
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /^red\. the walk stopped: .+/mu);
    assert.doesNotMatch(r.stdout, /: green\. /u);
  }
});

test('WHAT COUNTS AS RED: a red step, a step never said, and a step left not walked where it could have been', () => {
  const green = STEPS.map((s) => ({ id: s.id, pass: true, saw: 'seen' }));
  const withStep = (id, pass) => green.map((r) => (r.id === id ? { ...r, pass } : r));
  assert.equal(redOf(green, { advance() {} }), false);
  assert.equal(redOf(withStep('tell', false), { advance() {} }), true);
  assert.equal(redOf(green.slice(0, 4), { advance() {} }), true, 'three steps were never said');
  assert.equal(redOf([], {}), true, 'nothing was said at all');
  /* DAY 15 ON THE REAL CLOCK is the one step a walk may leave not walked. */
  assert.equal(redOf(withStep('offer', null), {}), false);
  assert.equal(redOf(withStep('offer', null), { advance() {} }), true, 'this host can move its clock');
  /* A build that did not happen and a step that says "not walked" for it is no pass. */
  assert.equal(redOf(withStep('keep', null), {}), true);
  assert.equal(redOf(withStep('today', undefined), {}), true);
});

test('WHY A SIGN-UP CALL WAS REFUSED: the host\'s sentence where it sent one, and never the kind alone where it sent none', () => {
  assert.equal(refusedWhy('send', { ok: false, kind: 'refused', fix: 'That address is taken.' }), 'That address is taken.');
  assert.equal(refusedWhy('send', { ok: false, kind: 'refused', fix: null }), `the host sent no reason, and the page says "${signupWords.sendFailed}" (refused)`);
  assert.equal(refusedWhy('make', { ok: false, kind: 'refused', fix: null }), `the host sent no reason, and the page says "${signupWords.makeFailed}" (refused)`);
  /* The page has no sentence of its own for a link or an opening refused, so none is put in its mouth. */
  assert.equal(refusedWhy('verify', { ok: false, kind: 'refused', fix: null }), 'the host sent no reason (refused)');
  assert.equal(refusedWhy('open', { ok: false, kind: 'unreachable' }), 'the host sent no reason (unreachable)');
  assert.equal(refusedWhy('send', { ok: false, kind: 'locked', retryAfter: 60 }), `the host sent no reason, and the page says "${signupWords.sendFailed}" (locked)`);
  for (const step of ['send', 'verify', 'make', 'open']) for (const kind of ['refused', 'locked', 'unreachable']) assert.notEqual(refusedWhy(step, { ok: false, kind, fix: null }), kind);
});

test('THE LAST LINE: a green hosted run says day 15 was not walked, so it cannot read as whole', () => {
  const green = STEPS.map((s) => ({ id: s.id, pass: true, saw: 'seen' }));
  const withStep = (id, pass) => green.map((r) => (r.id === id ? { ...r, pass } : r));
  const hosted = {};
  const moves = { advance() {} };
  assert.equal(endOf(green, moves), 'green. all 7 steps walked');
  /* The hosted run that leaves with 0: not red, and a step short. */
  assert.equal(redOf(withStep('offer', null), hosted), false);
  assert.match(endOf(withStep('offer', null), hosted), /^green as far as it went, with day 15 not walked: .+ 6 of 7 steps walked, so this is not the whole first run$/u);
  assert.doesNotMatch(endOf(withStep('offer', null), hosted), /all 7/u);
  /* Red says red, whatever was left: the same step left on a host that can move its clock, and a red step on either. */
  assert.equal(endOf(withStep('offer', null), moves), 'red. 6 of 7 steps green');
  assert.equal(endOf(withStep('tell', false), hosted), 'red. 6 of 7 steps green');
  assert.equal(endOf(green.slice(0, 4), moves), 'red. 4 of 7 steps green');
  assert.equal(endOf([], hosted), 'red. 0 of 7 steps green');
  /* And the line never disagrees with what the command leaves with. */
  for (const r of [green, withStep('offer', null), withStep('keep', null), withStep('today', undefined), []]) for (const h of [hosted, moves]) assert.equal(endOf(r, h).startsWith('red. '), redOf(r, h));
});

test('THE CHECKS BESIDE THE STEPS: the hard sentence, one box and one email, four presses, a reading in thirty seconds; each red by itself', async () => {
  const ctx = { zone: MARIAM.zone, locale: MARIAM.locale };
  assert.equal(expect.hard({ proposal: { usecase: 'shop' }, by: 'glm-5.3-flash' }, MARIAM).pass, true);
  assert.match(expect.hard({ proposal: { usecase: null }, by: 'glm-5.3-flash' }, MARIAM).saw, /read by the model as none, not shop/u);
  assert.equal(expect.hard({ proposal: { usecase: null }, by: 'rules' }, MARIAM).pass, null);
  assert.equal(expect.fields({ fields: [{ role: 'textbox' }, { role: 'textbox', type: 'email' }] }).pass, true);
  assert.match(expect.fields({ fields: [{ role: 'textbox' }, { role: 'textbox' }, { role: 'textbox', type: 'email' }] }).saw, /2 boxes to type in, not 1/u);
  assert.equal(expect.presses({ presses: ['a', 'b', 'c', 'd'] }).pass, true);
  assert.match(expect.presses({ presses: ['a', 'b', 'c', 'd', 'e'] }).saw, /5 presses: .*, not 4 at most/u);
  assert.equal(expect.quick(await firstReadAt(MARIAM.said, (s) => propose(s, ctx))).pass, true);
  assert.equal(expect.quick(await firstReadAt(MARIAM.said, (s) => propose(s, ctx), null, 3_000)).pass, false);
  /* A fail while marked waits on its unit; a pass while marked stays a pass, since one person's pass is not the unit landed. */
  assert.equal(marked(expect.presses({ presses: ['a', 'b', 'c', 'd', 'e'] })).waits, 'USE-B07');
  assert.equal(marked(expect.presses({ presses: ['a'] })).pass, true);
  assert.equal(redOf([...STEPS.map((s) => ({ id: s.id, pass: true, saw: 'seen' })), { id: 'quick', pass: false, saw: 'slow' }], { advance() {} }), true);
});
