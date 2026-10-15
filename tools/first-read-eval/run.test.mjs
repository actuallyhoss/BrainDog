/**
 * The first read eval, held without a model: a scratch set of three invented sentences answered from a canned file,
 * a trap taken that fails the bar, and no key or no `--spend` that asks nothing at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { barOf, main } from './run.mjs';

const dir = mkdtempSync(join(tmpdir(), 'first-read-eval-'));

/* Two readings and one trap answered after its question, so a trap taken fails the bar on its own. */
const SET = {
  ctx: { zone: 'Europe/London', locale: 'en-GB' },
  sentences: [
    { said: "I'm Petra, a law student, and I keep missing essay deadlines.", reads: { usecase: 'student', name: 'Petra', currency: null, question: null } },
    { said: "I'm Idris. I mend bikes for neighbours and bill them each month.", reads: { usecase: 'business', name: 'Idris', currency: null, question: null } },
    {
      trap: 'a name answered after a dollar sign',
      said: "I'm a student and I spent $12 on notebooks.",
      answer: { about: 'name', value: 'Wren' },
      reads: { usecase: 'student', name: 'Wren', currency: 'USD', question: 'name' },
    },
  ],
};
const setFile = join(dir, 'set.json');
writeFileSync(setFile, JSON.stringify(SET));

/** A whole answer as the setup schema asks it. */
const raw = (over) => ({ name: null, summary: '', usecase: null, also: [], modules: [], currency: null, heard: [], names: [], rows: [], draft: null, ask: null, ...over });
const RIGHT = [
  raw({ name: 'Petra', usecase: 'student', heard: [{ phrase: 'law student', became: 'Student' }] }),
  raw({ name: 'Idris', usecase: 'business', heard: [{ phrase: 'bill them', became: 'Invoices' }] }),
  raw({ usecase: 'student', currency: 'CAD' }),
];
const canned = (name, replies) => {
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify({ answers: SET.sentences.map((s, i) => ({ said: s.said, reply: replies[i] })) }));
  return file;
};
const run = async (argv, env = {}, send) => {
  const lines = [];
  const code = await main({ argv, env, send, print: (l) => lines.push(l), sleep: async () => {} });
  return { code, lines };
};

test('the bar is nine readings in ten: 36 of 40, every one of three', () => {
  assert.equal(barOf(40), 36);
  assert.equal(barOf(3), 3);
  assert.equal(barOf(2), 2);
});

test('with --fake a scratch set of three invented sentences scores right, one line each and a total', async () => {
  const { code, lines } = await run(['--set', setFile, '--fake', canned('right.json', RIGHT)]);
  assert.equal(code, 0, lines.join('\n'));
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^01 right {2}student/u);
  assert.match(lines[2], /^03 after {2}student {2}trap held/u);
  assert.match(lines.at(-1), /^2 of 2 readings right \(the bar is 2\), 1 of 1 traps held, 3 asks\. At the bar\.$/u);
});

test('a trap taken fails the bar though every reading is right, and a reading missed fails it too', async () => {
  const taken = await run(['--set', setFile, '--fake', canned('taken.json', [RIGHT[0], RIGHT[1], raw({ usecase: 'business' })])]);
  assert.equal(taken.code, 1);
  assert.match(taken.lines[2], /TRAP TAKEN: a name answered after a dollar sign: usecase "business", not "student"/u);
  assert.match(taken.lines.at(-1), /^2 of 2 readings right .* 0 of 1 traps held.*Under the bar\.$/u);

  /* A model that broke its JSON, or one with no answer, is no reading, said by its code and never by its words. */
  const missed = await run(['--set', setFile, '--fake', canned('missed.json', ['not json', RIGHT[1], RIGHT[2]])]);
  assert.equal(missed.code, 1);
  assert.match(missed.lines[0], /^01 wrong {2}student, read no reading \(PROPOSAL_SCHEMA\)/u);
});

test('no key or no --spend calls nothing: a fetch stub counts zero', async () => {
  let calls = 0;
  const send = async () => {
    calls++;
    throw new Error('asked');
  };
  const before = globalThis.fetch;
  globalThis.fetch = send;
  try {
    for (const [argv, env] of [
      [['--set', setFile], {}],
      [['--set', setFile, '--spend'], {}],
      [['--set', setFile, '--spend'], { MODEL_CHECK_TOKEN: 'tok-invented' }],
      [['--set', setFile], { MODEL_CHECK_TOKEN: 'tok-invented', MODEL_CHECK_ACCOUNT: 'acct-invented' }],
      [['--set', setFile, '--spend', '--fake', setFile], { MODEL_CHECK_TOKEN: 'tok-invented', MODEL_CHECK_ACCOUNT: 'acct-invented' }],
      [['--sp3nd'], { MODEL_CHECK_TOKEN: 'tok-invented', MODEL_CHECK_ACCOUNT: 'acct-invented' }],
      /* A canned file or a set that cannot be read may not run either: 2, never a score under the bar. */
      [['--set', setFile, '--fake', join(dir, 'no-such-file.json')], {}],
      [['--set', join(dir, 'no-such-set.json'), '--fake', setFile], {}],
    ]) {
      const { code, lines } = await run(argv, env, send);
      assert.equal(code, 2, `${argv.join(' ')}: ${lines.join(' ')}`);
      assert.equal(lines.length, 1);
    }
    const { lines } = await run(['--set', setFile], {}, send);
    assert.match(lines[0], /MODEL_CHECK_TOKEN and MODEL_CHECK_ACCOUNT in the environment and the flag --spend/u);
  } finally {
    globalThis.fetch = before;
  }
  assert.equal(calls, 0);
});

test('with the key and --spend the key goes to the model address alone, and never into what is printed', async () => {
  const TOKEN = 'tok-invented-0123456789';
  const ACCOUNT = 'acct-invented-42';
  const sent = [];
  /* The stub answers the first sentence and turns the others away with a fault that quotes the key back. */
  const send = async (url, init) => {
    sent.push({ url, auth: init.headers.authorization });
    const body = JSON.parse(init.body);
    if (body.messages.at(-1).content.includes('Petra')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(RIGHT[0]) } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } }));
    }
    return new Response(`bad key ${TOKEN} on ${ACCOUNT}`, { status: 400 });
  };
  const { code, lines } = await run(['--set', setFile, '--spend'], { MODEL_CHECK_TOKEN: TOKEN, MODEL_CHECK_ACCOUNT: ACCOUNT, MODEL_CHECK_BASE: 'https://model.invalid/v4' }, send);
  assert.equal(code, 1);
  assert.equal(sent.length, 3);
  for (const s of sent) {
    assert.equal(s.url, `https://model.invalid/v4/accounts/${ACCOUNT}/ai/v1/chat/completions`);
    assert.equal(s.auth, `Bearer ${TOKEN}`);
  }
  const printed = lines.join('\n');
  assert.ok(!printed.includes(TOKEN) && !printed.includes(ACCOUNT), printed);
  assert.match(lines[0], /^01 right/u);
  assert.match(lines.at(-1), /^spent about \d+ neurons\.$/u);
});
