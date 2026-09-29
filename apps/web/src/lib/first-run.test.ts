/**
 * What the first run proposes from one sentence, held against the use cases and
 * the reader the app ships.
 *
 * AGAINST THE SEED, NOT A FIXTURE: the proposal is the arranger's, the modules are the seed's and the name is `who.ts`'s,
 * and a fixture repeating any of them would pass while the screen proposed something else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { USE_CASES } from '@braindog/seed/usecases';

import { firstRun } from './first-run.ts';
import { propose, type Proposal } from './start/propose.ts';

const CTX = { zone: 'Europe/London', locale: 'en-GB' };
const said = (sentence: string): Proposal => propose(sentence, CTX);

test('ONE SENTENCE GIVES THE WHOLE PROPOSAL: the name, the use case, the modules, and what each phrase became', () => {
  const p = said('Sami, I run a few companies and I send invoices');
  assert.equal(p.name, 'Sami');
  assert.equal(p.usecase, 'founder');
  const founder = USE_CASES.find((u) => u.usecase === 'founder')!;
  for (const m of founder.modules) assert.ok(p.modules.includes(m), `the founder stands on ${m}, and it is not proposed`);
  assert.ok(p.heard.length > 0, 'nothing was said back');
  for (const h of p.heard) {
    assert.ok('Sami, I run a few companies and I send invoices'.includes(h.phrase), `${h.phrase} is not a phrase of the sentence`);
    assert.notEqual(h.became, '', `${h.phrase} became nothing`);
  }
});

test('EACH OF THE FOUR CHIPS PROPOSES ITS OWN PERSON: a student, a founder, a team and somebody starting something', () => {
  const want = ['student', 'founder', 'team', 'guide'];
  firstRun.whoChips.forEach((chip, i) => assert.equal(said(chip).usecase, want[i], chip));
});

test('A SENTENCE THESE RULES CANNOT READ IS KEPT, NEVER REFUSED: nothing heard, nothing guessed', () => {
  for (const sentence of ['Je suis étudiante et je veux suivre mes devoirs', 'أنا طالب', '']) {
    const p = said(sentence);
    assert.equal(p.usecase, null, sentence);
    assert.deepEqual(p.heard, [], sentence);
    assert.deepEqual(p.rows, [], sentence);
    assert.equal(p.currency, null, sentence);
  }
  /* A NAME IS STILL HEARD, and People with it, so the words have somewhere to be kept. */
  assert.deepEqual(said('Élodie, je suis étudiante').modules, ['people']);
});

test('THE CURRENCY IS ONE THAT WAS TYPED, or none', () => {
  assert.equal(said('I invoice Halden EGP 5,000 every month on the 20th').currency, 'EGP');
  assert.equal(said('I send invoices').currency, null);
  assert.equal(said('hosting costs 20 pounds a month').currency, null, 'pounds could be sterling or Egyptian, and is not guessed');
});

test('AN ENTRY IS PROPOSED ONLY WHEN THE SENTENCE FILLS IT COMPLETELY', () => {
  assert.deepEqual(said('I send invoices').rows, [], 'an invoice with no amount and no day is not written');
  const full = said('We bill Fenwick £2,000 a month on the 1st');
  const invoice = full.rows.find((r) => r.fields.what !== undefined);
  assert.ok(invoice, 'a complete invoice is not proposed');
  assert.deepEqual(invoice.fields.amount, { amount: 200000, currency: 'GBP' });
  /* AND IT POINTS AT THE CLIENT THE SENTENCE NAMED, who comes before it, so the press can link the two. */
  const party = invoice.party === undefined ? undefined : full.rows[invoice.party];
  assert.equal(party?.fields.name, 'Fenwick', 'the invoice does not point at the client the sentence named');
  assert.ok(invoice.party !== undefined && invoice.party < full.rows.indexOf(invoice), 'the client does not come before the invoice');
});

test('A MODULE NOTHING POINTED AT DOES NOT ARRIVE, and what one leans on still does', () => {
  /* The maths student's Projects, which the reader answers for any sentence at all. */
  assert.ok(!said('I keep losing track of my coursework deadlines').modules.includes('portfolio'));
  /* Money leans on a project, so Projects comes with it. The person an invoice is to is a link and not a dependency
     since money-core 3.0.0 (`LINKS` in `packages/seed/src/packs/first-party.ts`), so People does not arrive with it
     when the sentence named nobody. */
  const money = said('I send invoices').modules;
  for (const m of ['portfolio', 'money-core']) assert.ok(money.includes(m), `${m} did not come with Money`);
  assert.ok(!money.includes('people'), 'People came with Money, though who an invoice is to is only a link');
});

test('THE SAME WORDS ALWAYS GIVE THE SAME PROPOSAL', () => {
  for (const sentence of ['Sami, I run a few companies', "I'm part of a team", 'I want to start a podcast'])
    assert.deepEqual(said(sentence), said(sentence), sentence);
});

test('THE WORDS SAY NONE OF THE DEVELOPER WORDS THE OLD CARD SAID', () => {
  const words = Object.values(firstRun).flatMap((w) => (typeof w === 'string' ? [w] : Array.isArray(w) ? w.map(String) : []));
  for (const w of words) assert.doesNotMatch(w, /Builds on|Lists:|Pages:|In a voice that is|\brows?\b|\bregisters?\b|\bmodules?\b/u, w);
});

/**
 * WHY NOTHING WAS SAVED, SAID FOR THE HOST THAT WAS THERE, AND NOW NOT SAID AT ALL.
 *
 * `/start` drew the sample whenever `boot` answered 401 or nobody, kept the typed row in the tab, and
 * said why it was not saved in one of four causes read off `/auth/methods`, measured on the live hosts
 * when nobody could sign in to them. There is no sample now: a signed-out `/start` is
 * sent to sign in, so there is no row kept in a tab to explain, and these sentences are rendered by
 * nothing, so they are gone too.
 */
test('THE SENTENCES FOR A ROW KEPT IN THE TAB ARE GONE WITH THE SAMPLE THAT KEPT IT', async () => {
  const words: Record<string, unknown> = firstRun;
  for (const key of ['keptNothing', 'keptNothingWhy', 'keptNothingFor', 'keptExamples', 'rowChanged', 'rowIsThere', 'youArePending'])
    assert.equal(key in words, false, `firstRun.${key} is still here`);
  const module: Record<string, unknown> = await import('./first-run.ts');
  assert.equal('keptNothingCause' in module, false, 'the cause picker is still exported');
});
