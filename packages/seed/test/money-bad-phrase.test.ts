/**
 * Lateness on Money's Heads up is said in the danger colour as well as in words (audit-56 #4): `{{bad:…}}` had a
 * writer in render (`packages/render/src/inline.ts`) and no page that used it, so "past their due date" was plain text.
 *
 * THE WORDS STAY, AND THE COLOUR REPEATS THEM: the phrase is the words that say it is late, so the line reads the same
 * with the colour taken away.
 *
 * RED FIRST: with either body back on plain "past their due date", its test finds no `{{bad:` in the body and no `bad`
 * among what the body parses to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inline, text, type Inline } from '../../render/src/inline.ts';

import { HEADS_UP } from '../src/modules/money/pages/parts/heads-up.ts';

/* "LATE", THE WORD EVERY OTHER SCREEN USES (the UI pass of 20 October, money F5), where it said "past their due date". */
const LATE = 'late';

/** The one line of Heads up drawn on this figure. */
const bodyOn = (metric: string): string => {
  const lines = HEADS_UP.filter((b) => (b.when as { metric?: string } | undefined)?.metric === metric);
  assert.equal(lines.length, 1, `one line of Heads up is drawn on ${metric}`);
  const body = lines[0]!.body;
  assert.equal(typeof body, 'string');
  return body as string;
};

const bads = (nodes: readonly Inline[]) =>
  nodes.filter((n): n is Extract<Inline, { type: 'bad' }> => n.type === 'bad');

for (const [metric, whole] of [
  /* EACH LINE ENDS ON ITS ONE WAY TO ACT, since the UI pass of 20 October. */
  ['late-in', 'Invoices late: 3 to come in. See them'],
  ['overdue', 'Bills late: 3 to pay. See them'],
] as const) {
  test(`${metric}: the words that say it is late are a bad phrase, and the line reads the same`, () => {
    const body = bodyOn(metric);
    assert.ok(body.includes(`{{bad:${LATE}}}`), `the body holds {{bad:${LATE}}}: ${body}`);

    const nodes = inline(body, { resolve: () => '3' });
    const phrases = bads(nodes);
    assert.equal(phrases.length, 1, 'one phrase in the danger colour');
    assert.equal(text(phrases[0]!.body), LATE);
    // The colour repeats the words: nothing is said by the colour alone, and nothing else on the line changed.
    assert.equal(text(nodes), whole);
  });
}
