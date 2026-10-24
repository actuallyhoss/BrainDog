/**
 * Slash's drafts pass the design check before they are shown: a drawn part that scrolls sideways at 390 or paints a
 * colour outside the tokens is a fault the model is handed to mend, in the check's own sentence, and a fault the page
 * already had is not the draft's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { designFaults } from '../src/slash.ts';

const SAYS = "<div id=v></div><script>braindog.on(function (d) { v.textContent = d.rows.length === 0 ? 'Nothing yet.' : 'Some.'; });</script>";
const drawn = (code: string) => ({ kind: 'drawn', heading: 'Runway', source: 'register.bills', code, refusals: [] });

test('A DRAFT THAT SCROLLS SIDEWAYS OR PAINTS ITS OWN COLOUR IS A FAULT, WITH ITS SENTENCE', () => {
  const faults = designFaults([
    { id: 'page.money', blocks: [drawn(`<div style="width:900px"></div>${SAYS}`)] },
    { id: 'page.bills', blocks: [drawn(`<style>p{color:#222}</style>${SAYS}`)] },
  ]);
  assert.deepEqual(
    faults.map((f) => f.at),
    ['page.money.blocks[0]', 'page.bills.blocks[0]'],
  );
  assert.match(faults[0]!.fix, /^This design is not shown, because it is 900 px wide, wider than a 390 px phone/u);
  assert.match(faults[1]!.fix, /would not read in both light and dark/u);
});

test('A CLEAN DRAFT HAS NONE, AND A FAULT THE PAGE HAD BEFORE IS NOT THE DRAFT’S', () => {
  assert.deepEqual(designFaults([{ id: 'page.money', blocks: [drawn(SAYS)] }]), []);
  const old = drawn(`<style>p{color:#222}</style>${SAYS}`);
  assert.deepEqual(designFaults([{ id: 'page.money', blocks: [old], was: [old] }]), []);
});
