/**
 * Lateness on Money's Heads up is said in the danger colour as well as in words: `{{bad:…}}` had a
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

import { HEADLINE } from '../src/modules/money/pages/parts/headline.ts';
import { HEADS_UP } from '../src/modules/money/pages/parts/heads-up.ts';

/* "LATE", THE WORD EVERY OTHER SCREEN USES (money F5), where it said "past their due date". */
const LATE = 'late';

/**
 * The one line of Heads up drawn on this figure: its body, or, for a line of several sentences (`says`), the one said
 * when nothing else holds, which is the last. Bills late is such a line since money-core 3.18.0, its first sentences
 * the part of a plan that is late.
 */
const bodyOn = (metric: string): string => {
  const on = (when: unknown): boolean => {
    const w = when as { metric?: string; any?: unknown[] } | undefined;
    return w?.metric === metric || (Array.isArray(w?.any) && w.any.some(on));
  };
  const lines = HEADS_UP.filter((b) => on(b.when));
  assert.equal(lines.length, 1, `one line of Heads up is drawn on ${metric}`);
  const says = lines[0]!.says as { body: string }[] | undefined;
  const body = says ? says.at(-1)!.body : lines[0]!.body;
  assert.equal(typeof body, 'string');
  return body as string;
};

const bads = (nodes: readonly Inline[]) =>
  nodes.filter((n): n is Extract<Inline, { type: 'bad' }> => n.type === 'bad');

for (const [metric, whole] of [
  /* EACH LINE ENDS ON ITS ONE WAY TO ACT. */
  ['late-in', 'Invoices late: 3 to come in. See them'],
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

test('BILLS LATE ARE SAID ONCE, ON THE FIRST LINE, THE FIGURE THE LINK TO THEM (polish-i, PI1)', () => {
  const on = (when: unknown): boolean => JSON.stringify(when ?? null).includes('"overdue"');
  assert.equal(HEADS_UP.filter((b) => on(b.when)).length, 0, 'Heads up has no Bills late line of its own');
  const says = HEADLINE[0]!.says as { when?: unknown; body: string }[];
  const bills = says.find((s) => JSON.stringify(s.when) === JSON.stringify({ metric: 'overdue', gt: 0 }));
  assert.ok(bills, 'the first line has a sentence for bills late');
  const nodes = inline(bills.body, { resolve: () => '3' });
  /* THE PART OF A PLAN THAT IS LATE RIDES FIRST IN THE SAME SENTENCE, SINCE money-core 3.34.0, so two phrases are late:
     the part's and the bills'. */
  assert.equal(bads(nodes).length, 2, 'late in the danger colour');
  const link = nodes.find((n): n is Extract<Inline, { type: 'link' }> => n.type === 'link' && n.href.startsWith('/r/obligations?'));
  assert.ok(link, 'the figure late opens the bills that are late');
  assert.equal(text(link.body), '3', 'the figure alone, so a phone\'s tap target keeps the space after it');
  assert.ok(text(nodes).includes('Bills late: 3 to pay.'), text(nodes));
});
