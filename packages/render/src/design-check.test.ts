/**
 * The design check: a draft that scrolls sideways at 390, uses a colour outside the tokens, reads a list it may not,
 * says nothing when empty or prints the system's words is refused, with its sentence; one that does none of it passes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { designCheck, designSentence, DESIGN_BUDGET } from './design-check.ts';
import { DRAWN_EXAMPLE } from './drawn.ts';

const drawn = (code: string) => ({ kind: 'drawn', heading: 'Runway', source: 'register.bills', columns: [{ field: 'what' }], code });
const SAYS = "<div id=v></div><script>braindog.on(function (d) { v.textContent = d.rows.length === 0 ? 'Nothing yet.' : d.rows.length + ' bills'; });</script>";

test('A COMPOSED BLOCK AND THE DRAWN EXAMPLE PASS', () => {
  assert.deepEqual(designCheck({ blocks: [{ kind: 'calendar', heading: 'Renewals', source: 'register.services', empty: 'Nothing renews soon.' }] }), []);
  assert.deepEqual(designCheck({ blocks: [drawn(DRAWN_EXAMPLE)] }), []);
  assert.equal(designSentence([]), null);
});

test('A DRAFT THAT SCROLLS SIDEWAYS AT 390 IS REFUSED, WITH ITS SENTENCE', () => {
  for (const code of [`<div style="width: 640px"></div>${SAYS}`, `<svg width="800" height="200"></svg>${SAYS}`, `<style>.s{overflow-x: auto}</style>${SAYS}`, `<style>.s{width:100vw}</style>${SAYS}`]) {
    const found = designCheck({ blocks: [drawn(code)] });
    assert.deepEqual(
      found.map((f) => f.rule),
      ['phone'],
      code,
    );
    assert.match(designSentence(found) ?? '', /^This design is not shown, because it /u);
  }
  /* AN SVG WITH A VIEWBOX SCALES TO ITS TILE, so its width is not a size. */
  assert.deepEqual(designCheck({ blocks: [drawn(`<svg viewBox="0 0 800 200" width="800"></svg>${SAYS}`)] }), []);
});

test('A COLOUR OUTSIDE THE TOKENS IS REFUSED, in CSS, an SVG attribute and a script', () => {
  for (const code of [
    `<style>p{color:#333}</style>${SAYS}`,
    `<svg viewBox="0 0 1 1"><rect fill="red"/></svg>${SAYS}`,
    `<style>p{background: rgb(0,0,0)}</style>${SAYS}`,
    `<script>x.style.color = '#fff'</script>${SAYS}`,
    `<style>p{color:var(--brand)}</style>${SAYS}`,
  ]) {
    const found = designCheck({ blocks: [drawn(code)] });
    assert.deepEqual(
      found.map((f) => f.rule),
      ['tokens'],
      code,
    );
    assert.match(found[0]!.said, /would not read in both light and dark/u);
  }
  /* THE BOOK'S OWN COLOURS, A GRADIENT BY ITS ID AND NO COLOUR AT ALL pass. */
  assert.deepEqual(
    designCheck({ blocks: [drawn(`<style>p{color:var(--ink-2);border:1px solid var(--rule);background:transparent}</style><svg viewBox="0 0 1 1"><rect fill="url(#fade)" stroke="none"/></svg>${SAYS}`)] }),
    [],
  );
});

test('WHAT IT MAY NOT READ, A WHOLE PAGE IN A CARD, NO EMPTY STATE AND THE SYSTEM WORDS are each refused', () => {
  const rules = (d: Parameters<typeof designCheck>[0]) => designCheck(d).map((f) => f.rule);
  const reads = (list: string) => list !== 'vault';
  assert.deepEqual(rules({ reads, blocks: [{ kind: 'table', source: 'register.vault', empty: 'None.' }] }), ['reads']);
  assert.deepEqual(rules({ where: 'card', blocks: [drawn(SAYS)] }), ['fits']);
  assert.deepEqual(rules({ blocks: [{ kind: 'table', source: 'register.bills' }] }), ['empty']);
  assert.deepEqual(rules({ blocks: [drawn("<div id=v></div><script>braindog.on(function (d) { d.rows.forEach(function () {}); });</script>")] }), ['empty']);
  assert.deepEqual(rules({ blocks: [{ kind: 'note', heading: 'Rows in bills', body: 'Fine.' }] }), ['words']);
  assert.deepEqual(rules({ blocks: [{ kind: 'note', heading: 'Bills', body: 'Paid — all of them.' }] }), ['words']);
  assert.deepEqual(rules({ blocks: [{ kind: 'nonsense' }] }), ['fits']);
});

test('OVER BUDGET IS REFUSED, and a block another pack laid or one not drawn is not the draft’s', () => {
  assert.deepEqual(
    designCheck({ blocks: [], drewMs: DESIGN_BUDGET.composedMs + 1 }).map((f) => f.rule),
    ['budget'],
  );
  assert.deepEqual(
    designCheck({ blocks: [], aliveMs: DESIGN_BUDGET.aliveMs + 1 }).map((f) => f.rule),
    ['budget'],
  );
  assert.deepEqual(
    designCheck({
      blocks: [
        { kind: 'table', source: 'register.bills', added: 'money' },
        { kind: 'table', source: 'register.bills', drawn: false },
      ],
    }),
    [],
  );
});
