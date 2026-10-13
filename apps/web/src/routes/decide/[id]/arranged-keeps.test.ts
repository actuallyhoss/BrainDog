/**
 * An update that keeps what the owner changed says so on Decide, by the owner's name for it
 * (`packages/record/test/pack-update-kept.test.ts`).
 *
 * THE RECORD FILES `keeps` ON THE STEP AND THE OWNER'S NAME IN `names`. Without a line for it, Decide listed what the
 * update adds and changes and said nothing about the one thing it leaves alone, and that thing can carry the older
 * version's window: measured, `spent-30d` stayed at `-31d` while `received-30d` moved to `-30d`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arrangedOf } from './arranged.ts';

const update = (keeps: string[], names: Record<string, string>) => ({
  install: 'money-core',
  kind: 'pack',
  title: 'money-core',
  packs: { install: ['money-core'] },
  names,
  plan: [{ pack: 'money-core', from: '1.5.0', version: '1.6.0', adds: ['ingest.bank-ipn-in'], changes: ['metric.received-30d'], keeps }],
  approve: [],
});

test('an update names the measure it keeps as the owner changed it, by the owner’s name', () => {
  const appears = arrangedOf('pack', update(['metric.spent-30d'], { 'metric.spent-30d': 'Spent, last month' }))?.parts.find((p) => p.part === 'appears');
  const said = JSON.stringify(appears);
  assert.match(said, /Keeps Spent, last month as you changed it\. This update's version of it is not taken\./u);
  assert.match(said, /Changes/u, 'the changes it does make are still said');
});

test('an update names the page it keeps as the owner arranged it', () => {
  const appears = arrangedOf('pack', update(['page.money'], { 'page.money': 'My money' }))?.parts.find((p) => p.part === 'appears');
  assert.match(JSON.stringify(appears), /Keeps your My money page as you arranged it\./u);
});

test('an update that keeps nothing says nothing about keeping', () => {
  const appears = arrangedOf('pack', update([], {}))?.parts.find((p) => p.part === 'appears');
  assert.doesNotMatch(JSON.stringify(appears), /Keeps/u);
});

/* WHAT A KEPT PAGE GOES WITHOUT (declare-edited-page-60). The record files `brings` and the sentence for the whole update
   (`brings_line`), and Decide says it once in place of "is not taken", with the choice that follows the update. */
test('an update that adds to a page the owner changed says what the page goes without, once', () => {
  const line = 'Solo founder 2.6.0 adds the Late table and the title Today to your Overview page, which you changed. Your page is kept as you left it.';
  const body = {
    ...update(['page.home-founder', 'metric.spent-30d'], { 'page.home-founder': 'Overview', 'metric.spent-30d': 'Spent, last month' }),
  };
  body.plan[0] = { ...body.plan[0]!, brings: [{ id: 'page.home-founder', title: 'Today', blocks: [{ kind: 'table', heading: 'Late' }] }], brings_line: line } as never;
  const said = JSON.stringify(arrangedOf('pack', body)?.parts.find((p) => p.part === 'appears'));
  assert.ok(said.includes(`${line} Once this update is in, you are asked whether to take its page.`), said);
  assert.doesNotMatch(said, /Keeps your Overview page as you arranged it/u, 'the page is said twice');
  assert.match(said, /Keeps Spent, last month as you changed it\./u, 'what else it keeps is still said');
});
