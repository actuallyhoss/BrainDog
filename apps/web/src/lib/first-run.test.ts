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

import { amend, amendKept, AMEND_KEY, keepAmend, litIn, NO_AMEND, firstRun, STARTING_POINTS } from './first-run.ts';
import { moduleName } from '@braindog/seed/usecases/names';
import { propose, type Proposal } from './start/propose.ts';

const CTX = { zone: 'Europe/London', locale: 'en-GB' };
const said = (sentence: string): Proposal => propose(sentence, CTX);

test('ONE SENTENCE GIVES THE WHOLE PROPOSAL: the name, the use case, the modules, and what each phrase became', () => {
  const p = said('Sami, I run a few companies and I send invoices');
  assert.equal(p.name, 'Sami');
  assert.equal(p.usecase, 'founder');
  const founder = USE_CASES.find((u) => u.usecase === 'founder')!;
  for (const m of founder.needs ?? founder.modules) assert.ok(p.modules.includes(m), `the founder stands on ${m}, and it is not proposed`);
  /* NOTHING SAID POINTS AT SERVICES OR TASKS, SO NEITHER COMES (founder 2.7.0 `needs`): each is offered at its moment. */
  for (const m of ['estate', 'work']) assert.ok(!p.modules.includes(m), `${m} is proposed, and nothing said points at it`);
  assert.ok(p.heard.length > 0, 'nothing was said back');
  for (const h of p.heard) {
    assert.ok('Sami, I run a few companies and I send invoices'.includes(h.phrase), `${h.phrase} is not a phrase of the sentence`);
    assert.notEqual(h.became, '', `${h.phrase} became nothing`);
  }
});

test('EACH OF THE FIVE CHIPS PROPOSES ITS OWN PERSON: a shop, a freelancer, a student, a founder and a team (use case 6)', () => {
  const want = ['shop', 'business', 'student', 'founder', 'team'];
  assert.equal(STARTING_POINTS.length, 5);
  STARTING_POINTS.forEach((chip, i) => assert.equal(said(chip).usecase, want[i], chip));
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
  assert.deepEqual(said('Élodie, je suis étudiante').modules, ['people', 'work'], 'and Work, so its first thing to do has a list (AM2)');
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

test('A MODULE NOTHING POINTED AT DOES NOT ARRIVE, and one only linked to does not either', () => {
  /* The maths student's Projects, which the reader answers for any sentence at all. */
  assert.ok(!said('I keep losing track of my coursework deadlines').modules.includes('portfolio'));
  /* Money leans on nothing now. The person an invoice is to is a link and not a dependency since money-core 3.0.0, and the
     project it is for since 4b137c806 (`LINKS` in `packages/seed/src/packs/first-party.ts`), so neither People nor Projects
     arrives with it when the sentence named neither. */
  const money = said('I send invoices').modules;
  assert.ok(money.includes('money-core'), 'money-core did not come with Money');
  assert.ok(!money.includes('portfolio'), 'Projects came with Money, though the project a bill is for is only a link');
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

/* ── what was heard, lit and changed by hand (use case 6, step 2) ─────── */

const MARIAM = "I'm Mariam. I run a small candle shop in Alexandria and freelance as a designer. I lose track of orders and who owes me.";

test('HER WORDS LIGHT UP WHERE SHE TYPED THEM: every lit run is a phrase heard, and the runs give back the sentence', () => {
  const p = said(MARIAM);
  const runs = litIn(MARIAM, p.heard);
  assert.equal(runs.map((r) => r.text).join(''), MARIAM, 'the runs lose or add words');
  const lit = runs.filter((r) => r.became !== null).map((r) => r.text);
  assert.ok(lit.includes('Mariam'), 'her name is not lit');
  assert.ok(lit.includes('a small candle shop'), 'the trade is not lit whole');
  assert.ok(lit.includes('orders'), 'orders is not lit');
  /* A READING A BEAT BEHIND THE TYPING LIGHTS NOTHING IT CANNOT FIND WHERE IT SAYS. */
  const typed = `So, ${MARIAM}`;
  assert.ok(litIn(typed, p.heard).every((r) => r.became === null), 'a stale span lit the wrong words');
  assert.deepEqual(litIn('', p.heard), []);
});

test('A LINE TAKEN OUT TAKES ITS PARTS WITH IT, and one turned into another part brings that part', () => {
  const p = said(MARIAM);
  const ctx = { nameOf: moduleName, caseTitle: 'Shop' };
  assert.deepEqual(amend(p, NO_AMEND, ctx).modules, p.modules, 'no change changed the parts');
  /* HER PHRASES ARE READ WHOLE (uc6-heard-49): "freelance as a designer" and "who owes me", each one line. */
  const out = amend(p, { out: ['freelance as a designer'], to: {} }, ctx);
  assert.ok(!out.heard.some((h) => h.phrase === 'freelance as a designer'), 'the line is still heard');
  assert.ok(out.modules.includes('money-core'), 'Money went, though "who owes me" still says it');
  assert.ok(!amend(p, { out: ['freelance as a designer', 'who owes me'], to: {} }, ctx).modules.includes('money-core'), 'Money stayed with nothing saying it');
  assert.ok(out.modules.includes('people'), 'People went, though her name still says it');
  const both = amend(p, { out: ['a small candle shop', 'orders'], to: {} }, ctx);
  assert.equal(both.usecase, null, 'the shop stayed with no line saying it');
  const moved = amend(p, { out: [], to: { 'who owes me': 'work' } }, ctx);
  assert.ok(moved.modules.includes('work'), 'the part it became is not brought');
  assert.equal(moved.heard.find((h) => h.phrase === 'who owes me')?.became, moduleName('work'));
});

test('HER NAME CHANGED IS HER NAME, and in the title; taken out, she is nobody yet', () => {
  const p = said(MARIAM);
  const ctx = { nameOf: moduleName, caseTitle: 'Shop' };
  const renamed = amend(p, { out: [], to: {}, name: 'Mimi' }, ctx);
  assert.equal(renamed.name, 'Mimi');
  assert.equal(renamed.title, "Mimi's Candles");
  const gone = amend(p, { out: [], to: {}, name: null }, ctx);
  assert.equal(gone.name, null);
  assert.ok(!gone.heard.some((h) => h.you === true), 'the you line is still there');
});

test('WHAT WAS CHANGED AND ANSWERED WAITS FOR THE SAME SENTENCE ONLY, and storage that throws keeps nothing', () => {
  const box = new Map<string, string>();
  const store = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v), removeItem: (k: string) => void box.delete(k) };
  keepAmend(store, { said: MARIAM, amend: { out: ['owes'], to: { freelance: 'work' }, name: 'Mimi' }, reply: { about: 'arrivesBy', value: 'messages' } });
  const back = amendKept(store, `${MARIAM}  `);
  assert.deepEqual(back.amend, { out: ['owes'], to: { freelance: 'work' }, name: 'Mimi' });
  assert.deepEqual(back.reply, { about: 'arrivesBy', value: 'messages' });
  assert.deepEqual(amendKept(store, 'Another sentence'), { amend: NO_AMEND, reply: null });
  box.set(AMEND_KEY, '{"said":1');
  assert.deepEqual(amendKept(store, MARIAM), { amend: NO_AMEND, reply: null });
  keepAmend(store, null);
  assert.equal(box.has(AMEND_KEY), false);
  const broken = { getItem: () => { throw new Error('off'); }, setItem: () => { throw new Error('off'); }, removeItem: () => { throw new Error('off'); } };
  keepAmend(broken, { said: MARIAM, amend: NO_AMEND, reply: null });
  assert.deepEqual(amendKept(broken, MARIAM), { amend: NO_AMEND, reply: null });
});

test('A PHRASE FOLDED INTO A LINE AND SAID APART LIGHTS AS WHAT THE LINE BECAME, while the line still sits where it says', () => {
  const said = 'who owes me, a studio, and taxes';
  const line = { phrase: 'who owes me', became: 'Money', at: [0, 11] as const, more: [[27, 32] as const] };
  assert.deepEqual(litIn(said, [line]), [
    { text: 'who owes me', became: 'Money' },
    { text: ', a studio, and ', became: null },
    { text: 'taxes', became: 'Money' },
  ]);
  assert.ok(litIn(`So, ${said}`, [line]).every((r) => r.became === null), 'a stale line lit its other span');
});

test('THE RULES SAY THEY READ IT FOR ANY CAUSE, and the month spent keeps its own line', () => {
  assert.equal(firstRun.readByRulesAny, 'Simple rules read this. Check what was heard, and tell it more.');
  assert.match(firstRun.readByRules, /questions are used for this month/u, 'the spent month still says why');
  assert.notEqual(firstRun.readByRulesAny, firstRun.readByRules);
  /* BEFORE THE PRESS: what Next does, plain, with no dash a person would read as an em dash. */
  assert.equal(firstRun.readOnPress, "Pressing That's me sets this up from what you wrote.");
  /* NOTHING-KEPT IS THE SECOND PROMISE under the button, and is not said twice on one screen. */
  assert.doesNotMatch(firstRun.readOnPress, /kept|saved/u);
  /* It never says a model reads the words, which the host may not have. */
  assert.doesNotMatch(firstRun.readOnPress, /model/u);
  for (const w of [firstRun.readByRulesAny, firstRun.readOnPress]) assert.doesNotMatch(w, /—/u, w);
});
