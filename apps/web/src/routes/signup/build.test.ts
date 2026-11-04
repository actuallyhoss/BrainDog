/**
 * THE SIGN-UP'S BUILD (use case 6, steps 3 and 4): the press `accepting()` makes, read off her own sentence on a device
 * in Alexandria, so a record made with no currency, the one that reads her "900" later as unsure, goes red here.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { NO_AMEND, type Reply } from '../../lib/first-run.ts';
import type { Draft } from '../../lib/signup.ts';
import { propose, type Proposal } from '../../lib/start/propose.ts';
import { browserCurrencyEnv, zoneCurrency } from '../start/building.ts';
import { accepting, nameSent, picked, replyOf, type BuildEnv, type Extra } from './build.ts';

const SAID = "I'm Mariam. I run a small candle shop in Alexandria and freelance as a designer. I lose track of orders and who owes me.";
const ZONE = 'Africa/Cairo';
const LOCALE = 'en-EG';

const device = browserCurrencyEnv(LOCALE, ['en-EG', 'ar-EG'], ZONE);
const env: BuildEnv = { device, today: '2026-10-05', email: 'mariam@people.braindog.test', nav: [], locale: LOCALE };

/**
 * THE PAGE'S OWN READING (`reading` in Signup.svelte), the rules half: the zone, the language and the zone's currency go
 * in with the words. Held in a name first, so the context reads the same before and after it learns a currency.
 */
const ctx = { zone: ZONE, locale: LOCALE, currency: zoneCurrency(ZONE, device) };
const reading = async (s: string): Promise<Proposal> => propose(s, ctx);

const draft = (over: Partial<Draft> = {}): Draft => ({ said: SAID, currency: null, usecase: null, ...over });
const answered = (reply: Reply | null): Extra => ({ amend: NO_AMEND, reply });

test('THE ZONE IS READ AS EGYPT: Alexandria keeps Cairo time, and Cairo keeps EGP', () => {
  assert.equal(zoneCurrency(ZONE, device), 'EGP');
});

test('HER SENTENCE AND THE ALEXANDRIA ZONE BUILD A RECORD WHOSE CURRENCY IS EGP, after her one answer', async () => {
  const made = await accepting(draft(), answered({ about: 'arrivesBy', value: 'messages' }), reading, env);
  assert.ok(made, 'nothing was built from her sentence');
  assert.equal(made.usecase, 'shop');
  assert.ok(made.modules.includes('money-core'), `money is not kept: ${made.modules.join(', ')}`);
  assert.equal(made.currency, 'EGP');
  assert.equal(made.sentence, SAID);
  assert.equal(made.email, env.email);
});

test('THE SAME RECORD WHEN THE ANSWER CAME WITH THE LINK, and when no answer was kept at all', async () => {
  const linked = await accepting(draft({ reply: { about: 'arrivesBy', value: 'messages' } }), null, reading, env);
  assert.equal(linked?.currency, 'EGP');
  const bare = await accepting(draft(), null, reading, env);
  assert.equal(bare?.currency, 'EGP');
});

/**
 * WHERE THE DEVICE DOES NOT SAY THE CURRENCY (a clock on UTC) and a bare amount is told, the one question is the
 * currency: the answer is the record's, and a skip makes none rather than the language's guess.
 */
test('A CURRENCY ANSWERED OUTRANKS THE DEVICE, and one skipped is kept as none', async () => {
  const said = "I'm Sam. I run a bakery in Leeds. Nadia paid 900 for a cake.";
  const utc = { ...env, device: browserCurrencyEnv('en-GB', ['en-GB'], 'UTC'), locale: 'en-GB' };
  const read = async (s: string): Promise<Proposal> => propose(s, { zone: 'UTC', locale: 'en-GB' });
  const chose = await accepting(draft({ said }), answered({ about: 'currency', value: 'USD' }), read, utc);
  assert.equal(chose?.currency, 'USD');
  const skipped = await accepting(draft({ said }), answered({ about: 'currency', value: null }), read, utc);
  assert.ok(skipped?.modules.includes('money-core'), 'money is not kept, so the skip proves nothing');
  assert.equal(skipped?.currency, null);
  const unanswered = await accepting(draft({ said }), null, read, utc);
  assert.equal(unanswered?.currency, 'GBP');
});

test('A CURRENCY KEPT WITH THE SENTENCE OUTRANKS THE DEVICE', async () => {
  const kept = await accepting(draft({ currency: 'GBP' }), null, reading, env);
  assert.equal(kept?.currency, 'GBP');
});

test('THE LINK\'S ANSWER COMES FIRST, then this device\'s, then a currency chosen before the answer was kept', () => {
  const link: Reply = { about: 'arrivesBy', value: 'app' };
  const here: Reply = { about: 'arrivesBy', value: 'messages' };
  assert.deepEqual(replyOf(draft({ reply: link }), answered(here)), link);
  assert.deepEqual(replyOf(draft(), answered(here)), here);
  assert.deepEqual(replyOf(draft({ currency: 'EGP' }), null), { about: 'currency', value: 'EGP' });
  assert.equal(replyOf(draft(), null), null);
});

test('NOTHING TO BUILD FROM NOTHING SAID: the record\'s own /start asks instead', async () => {
  assert.equal(await accepting(draft({ said: '' }), null, reading, env), null);
});

test('THE PAGE BUILDS WITH THIS, not a copy of it', () => {
  const page = readFileSync(new URL('./Signup.svelte', import.meta.url), 'utf8');
  assert.match(page, /import \{[^}]*\baccepting\b[^}]*\} from '\.\/build\.ts'/u);
  assert.match(page, /await accepting\(/u);
  /* THE PAGE SAYS THE GUESS ON THE KEEP STEP AND KEEPS IT FOR A RECORD WITH NO MONEY YET (e8ffa25df), and those are its only
     uses: where Money is kept it sends no guess, so what the record is made in is `accepting()`'s. */
  assert.equal(page.match(/currencyChoices\(/gu)?.length, 3, 'the page picks a currency of its own beside accepting()');
  assert.match(page, /const moneyNow = \$derived\(currencyPick \?\? read\?\.currency \?\? \(sentence\.trim\(\) === '' \? null : currencyChoices\(sentence, deviceOf\(\)\)\.suggested\)\);/u);
  assert.match(page, /const moneyAsk = \$derived\(!setOpen \? null : currencyChoices\(sentence, deviceOf\(\)\)\);/u);
  assert.match(page, /keepCurrencyGuess\([^\n]*asked\.currency \?\? draft\?\.currency \?\? currencyChoices\(draft\?\.said \?\? '', deviceOf\(\)\)\.suggested\);/u);
  assert.match(page, /currency: money === null \? moneyNow : \(currencyPick \?\? read\?\.currency \?\? null\),/u, 'a guess goes to the build where Money is kept');
  /* WHAT THE SCREEN LIGHTS is chosen by the same `picked` the build uses, not by a second copy of the choice. */
  assert.match(page, /\bpicked\(read, chosen\)/u);
  assert.doesNotMatch(page, /\.also\.flatMap\(/u, 'the page chooses the use cases beside it on its own');
});

test('A USE CASE PICKED BY HAND stands over the one heard and leaves out the ones beside it; with no reading, it alone', async () => {
  const p = await reading(SAID);
  const heard = picked(p, null);
  assert.equal(heard.one?.usecase, 'shop');
  const byHand = picked(p, 'personal');
  assert.equal(byHand.one?.usecase, 'personal');
  assert.deepEqual(byHand.beside, []);
  const alone = picked(null, 'shop');
  assert.equal(alone.one?.usecase, 'shop');
  assert.deepEqual(alone.modules, picked({ usecase: null, also: [], modules: [] }, 'shop').modules);
  assert.ok(alone.modules.length > 0);
});

/* A NEW PERSON WITH NO NAME HEARD WAS NOBODY: the face said "Y" and Signing in said her address twice,
   while People already called her Mariam from the same address. She is sent as People names her. */
test('WITH NO NAME HEARD SHE IS SENT AS HER ADDRESS NAMES HER, and never as a word that names a mailbox', () => {
  assert.equal(nameSent({ name: 'Nadia' }, 'someone@pots.example'), 'Nadia', 'a name heard comes first');
  assert.equal(nameSent({ name: null }, 'mariam@ceramics.example'), 'Mariam');
  assert.equal(nameSent({ name: null }, 'Mariam.K@ceramics.example'), 'Mariam');
  assert.equal(nameSent(null, 'tomas_berg+shop@pots.example'), 'Tomas');
  for (const box of ['info@pots.example', 'hello@pots.example', 'j.smith@pots.example', 'x7@pots.example', 'studio@pots.example', ''])
    assert.equal(nameSent({ name: null }, box), '', box);
});
