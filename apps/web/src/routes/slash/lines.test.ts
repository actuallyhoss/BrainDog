/**
 * `/slash`'s sentence and its one figure: every number is one the record answered, and the red is what waits on him.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { suggestionsOf, words as slash, type Reading } from '../../lib/record/slash.ts';
import { byLine, foldOf, sentenceOf, suggestedOf, tallyOf, words } from './lines.ts';

const READING: Reading = {
  model: null,
  quiet: null,
  noticed: [],
  drafts: [
    { question: 'Turn off Notes?', body_kind: 'pack', asked: { id: 'SG4', status: 'resolved' } },
    { question: 'Add Watch?', body_kind: 'pack', asked: { id: 'SG3', status: 'open' } },
    { question: 'Give Logbook a page of its own?', body_kind: 'arrange', asked: null },
    { question: 'Pin Kiln to Today?', body_kind: 'arrange', asked: null },
  ],
  waiting: [{ id: 'SG3', question: 'Add Watch?' }],
  cap: 3,
};

test('THE LINE IS THE STATE: what waits on Decide leads, in red, and who drafts is never the headline', () => {
  const s = sentenceOf(1, 2, 4, slash.emptyTitle);
  assert.deepEqual(s, { text: 'One suggestion waits for you on Decide.', needs: 'One suggestion waits for you on Decide' });
  assert.equal(sentenceOf(3, 0, 3, slash.emptyTitle).needs, 'Three suggestions wait for you on Decide');
  assert.ok(!s.text.includes(slash.byRules));
});

test('NOTHING WAITING, NO RED: what is new, else everything answered, else nothing yet', () => {
  assert.deepEqual(sentenceOf(0, 2, 3, slash.emptyTitle), { text: 'Slash has two new suggestions.', needs: undefined });
  assert.deepEqual(sentenceOf(0, 0, 3, slash.emptyTitle), { text: words.allSettled, needs: undefined });
  assert.deepEqual(sentenceOf(0, 0, 0, 'Nothing to suggest yet'), { text: 'Nothing to suggest yet.', needs: undefined });
  assert.deepEqual(sentenceOf(0, 0, 0, 'Nothing to suggest yet.'), { text: 'Nothing to suggest yet.', needs: undefined });
});

test('THE TILE COUNTS WHERE EACH SUGGESTION STANDS, and leaves out a part with none', () => {
  const t = tallyOf(suggestionsOf(READING), READING.waiting.length, READING.cap);
  assert.ok(t);
  assert.equal(t.total, 4);
  assert.deepEqual(
    t.parts.map((p) => [p.label, p.value, p.tone]),
    [
      [words.partWaiting, 1, 'warn'],
      [words.partNew, 2, 'ink'],
      [words.partAnswered, 1, 'earn'],
    ],
  );
  assert.equal(t.reading, '1 waits for you on Decide, 2 are not asked yet and you answered 1.');
  const none = tallyOf(suggestionsOf({ ...READING, drafts: READING.drafts.slice(2) }), 0, 3);
  assert.deepEqual(
    none?.parts.map((p) => p.label),
    [words.partNew],
  );
});

test('A FULL DECIDE IS SAID, with the record’s own cap, when new ones are held back by it', () => {
  const t = tallyOf(suggestionsOf(READING), 3, 3);
  assert.match(t?.reading ?? '', /Slash keeps at most 3 on Decide at once/u);
  assert.doesNotMatch(tallyOf(suggestionsOf(READING), 1, 3)?.reading ?? '', /at most/u);
});

test('NOTHING SUGGESTED, NO TILE: a number tile is never drawn over nothing', () => {
  assert.equal(tallyOf([], 0, 3), null);
});

test('WHO DRAFTED IT IS SAID HONESTLY: the rules as how you use BrainDog, a model by its name', () => {
  assert.equal(byLine('rules'), 'From how you use BrainDog');
  assert.equal(byLine('glm-5.3-flash'), 'Drafted by glm-5.3-flash');
  assert.equal(byLine(null), null);
  assert.equal(byLine(''), null);

  /* A HOST WITH A MODEL STILL SENDS THE RULES' DRAFTS on the read, and not one of them carries the model's name. */
  const withModel: Reading = { ...READING, model: 'glm-5.3-flash' };
  const all = suggestedOf(withModel);
  assert.equal(all.length, 4);
  for (const s of all) {
    assert.equal(byLine(s.by), words.byRules, s.question);
    assert.doesNotMatch(byLine(s.by) ?? '', /glm/u);
  }

  /* WHAT THE LAST PRESS FILED says who drafted it, by id, over the reading's guess. */
  const pressed = suggestedOf(withModel, [{ id: 'SG3', by: 'glm-5.3-flash' }]);
  assert.equal(byLine(pressed.find((s) => s.question === 'Add Watch?')?.by), 'Drafted by glm-5.3-flash');
  assert.equal(byLine(pressed.find((s) => s.question === 'Turn off Notes?')?.by), words.byRules);

  /* A DRAFT THE RECORD SENDS WITH ITS OWN `by` keeps it. */
  const told = suggestedOf({ ...withModel, waiting: [], drafts: [{ ...READING.drafts[2]!, by: 'glm-5.3-flash' } as Reading['drafts'][number]] });
  assert.equal(byLine(told[0]?.by), 'Drafted by glm-5.3-flash');
});

test('WHAT WAITS ON DECIDE LEADS THE LIST, the record’s own waiting included, and nothing is claimed for who drafted it unknown', () => {
  const extra: Reading = { ...READING, waiting: [...READING.waiting, { id: 'SG9', question: 'Add a desk for the launch?' }] };
  const all = suggestedOf(extra);
  assert.deepEqual(
    all.map((s) => [s.question, s.state]),
    [
      ['Add Watch?', 'waiting'],
      ['Add a desk for the launch?', 'waiting'],
      ['Give Logbook a page of its own?', 'new'],
      ['Pin Kiln to Today?', 'new'],
      ['Turn off Notes?', 'answered'],
    ],
  );
  const desk = all.find((s) => s.question === 'Add a desk for the launch?');
  assert.equal(desk?.href, '/decide/SG9');
  assert.equal(desk?.by, null);
  assert.equal(byLine(desk?.by), null);
  assert.equal(byLine(suggestedOf(extra, [{ id: 'SG9', by: 'glm-5.3-flash' }]).find((s) => s.href === '/decide/SG9')?.by), 'Drafted by glm-5.3-flash');
  /* The tile counts the same list the headline does. */
  assert.equal(tallyOf(all, extra.waiting.length, extra.cap)?.total, 5);
});

test('A QUESTION WAITING AFTER A RELOAD SAYS WHO DRAFTED IT, from what the record kept, and the last press still outranks it', () => {
  const kept: Reading = {
    ...READING,
    waiting: [...READING.waiting, { id: 'SG9', question: 'Add a desk for the launch?', by: 'glm-5.3-flash' }, { id: 'SG10', question: 'Turn off Log?', by: 'rules' }, { id: 'SG11', question: 'Add Diary?', by: null }],
  };
  const all = suggestedOf(kept);
  const line = (href: string) => byLine(all.find((s) => s.href === href)?.by);
  assert.equal(line('/decide/SG9'), 'Drafted by glm-5.3-flash');
  assert.equal(line('/decide/SG10'), words.byRules);
  assert.equal(line('/decide/SG11'), null, 'a question filed before the record kept who drafted it was given a drafter');
  assert.equal(byLine(suggestedOf(kept, [{ id: 'SG9', by: 'included' }]).find((s) => s.href === '/decide/SG9')?.by), 'Drafted by included');
});

test('THE FOLD NAMES ONLY WHAT IT HOLDS, and is not drawn over nothing', () => {
  const none = { tally: false, noticed: false, answered: false, lately: false, daily: false, describe: false };
  assert.equal(foldOf(none), null);
  assert.equal(foldOf({ ...none, daily: true }), 'The daily look');
  assert.equal(foldOf({ ...none, noticed: true, answered: true, lately: true, daily: true }), 'What Slash noticed, what you answered, what you asked lately and the daily look');
  for (const line of [foldOf({ ...none, tally: true, noticed: true, answered: true, lately: true, daily: true, describe: true }) ?? '', words.more])
    assert.doesNotMatch(line, /\b(rows?|lists?|items?|entit(y|ies))\b/iu, line);
});

test('THE SCREEN AT REST: the Ask tile and one list, with everything else in one fold that a press opens', async () => {
  const { readFileSync } = await import('node:fs');
  const screen = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  const markup = screen.slice(screen.indexOf('</svelte:head>'), screen.indexOf('<style>'));
  const fold = markup.indexOf('<details class="more"');
  assert.ok(fold > 0, 'no fold');
  assert.equal((markup.match(/<details class="more"/gu) ?? []).length, 1, 'one fold, not several');
  const rest = markup.slice(0, fold);
  const inside = markup.slice(fold);
  /* At rest: the Ask tile and the list's section, and no other tile. */
  assert.equal((rest.match(/<(Tile|Section|SlashDaily)\b/gu) ?? []).length, 2, 'more than the Ask tile and one list at rest');
  for (const part of ['<SlashDaily', 'words.noticed', 'pageWords.answeredTitle', 'askWords.lately', 'tally.reading', '<AskPage']) {
    assert.ok(!rest.includes(part), `${part} is drawn at rest`);
    assert.ok(inside.includes(part), `${part} is lost`);
  }
  assert.match(screen, /byLine\(/u);
  /* THE FOLD'S LINE NAMES ONLY WHAT HAS SOMETHING IN IT: nothing noticed or asked yet is neither named nor drawn. */
  assert.match(screen, /noticed: reading\.noticed\.length > 0/u);
  assert.match(screen, /lately: modelHere && \(lately\?\.length \?\? 0\) > 0/u);
  assert.ok(!inside.includes('words.noticedNone') && !inside.includes('askWords.latelyNone'), 'an empty part is drawn in the fold');
});

test('NO EM DASH in anything this screen adds', () => {
  for (const w of Object.values(words)) {
    const line = typeof w === 'function' ? (w as (x: unknown) => string)(2) : w;
    assert.ok(!line.includes('—'), line);
  }
});
