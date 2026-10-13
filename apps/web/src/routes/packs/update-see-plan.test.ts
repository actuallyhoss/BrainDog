/**
 * THE UPDATES TAB'S OWN "See the plan" TAKES THE HOLDER ALONG, as "Update all" and the listing's page do.
 *
 * WHAT WAS WRONG. Money's update waits on something Personal's update hands to it. "Update all" put Personal in first
 * and the listing's page drew both plans on one sheet, but the row's own press answered with a sentence and a second
 * button, "Update Personal first": three ways to take one update, and the one on the row was the only one that stopped.
 *
 * THE STEPS ARE TRIED AS FUNCTIONS (`offer.ts` `afterOthers` and `installInTurn`, which the press now goes through), fed
 * what the page feeds them; the page itself is read as text for what it must do with them, as `update-all-count.test.ts`
 * reads it: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sheetOf } from '../../lib/market/plan.ts';
import { holderFirst } from '../../lib/market/update-order.ts';
import { afterOthers, diffOf, installInTurn, turnWords, type Offered, type Planned } from './browse/[id]/offer.ts';
import type { SharedPlan } from './sharing.ts';

const personalFile = { usecase: 'personal', version: '2.4.0', pack: { pack: 'usecase-personal', hands: { 'metric.budgets-set': 'money-core' } } };
const personal: Offered = { key: 'usecase:personal', kind: 'usecase', id: 'personal', title: 'Personal', source: 'bundled', file: { doc: null, text: JSON.stringify(personalFile) } };
const money: Offered = { key: 'module:money-core', kind: 'module', id: 'money-core', title: 'Money', source: 'bundled', file: { doc: null, text: null } };

const personalPlan: Planned = { kind: 'usecase', plan: { usecase: { id: 'personal', title: 'Personal', version: '2.4.0' }, packs: [], approve: [] } as unknown as SharedPlan };
/** Money's plan: refused over what Personal holds until Personal's update is in (`held`), and asking for `approve`. */
const moneyPlan = (held: boolean, approve: string[] = []): Planned => ({
  kind: 'pack',
  doc: {},
  diff: { pack: { id: 'money-core', version: '3.17.0' }, planHash: held ? 'h1' : 'h2', direction: 'upgrade', installed_version: '3.16.0', conflicts: held ? [{ id: 'metric.budgets-set', pack: 'usecase-personal' }] : [] },
  planHash: held ? 'h1' : 'h2',
  approve,
});
const TITLES: Readonly<Record<string, string>> = { 'usecase-personal': 'Personal', 'money-core': 'Money', 'metric.budgets-set': 'Budgets set' };
const titleOf = (id: string): string => TITLES[id] ?? id;

/** The press, as the page makes it: this update's plan beside everything that waits on the tab. */
const pressed = (waiting: readonly Offered[]) => afterOthers(moneyPlan(true), money, waiting, async () => ({ ok: true, planned: personalPlan }));
const along = (p: Planned): boolean => p.kind === 'pack' && p.after !== undefined && p.after.first.length > 0;

test('Money pressed with Personal waiting opens one sheet of both plans, Personal first, with nothing stopping Approve', async () => {
  const p = await pressed([personal, money]);
  assert.ok(along(p), 'the holder is not taken along');
  const shown = diffOf(p);
  assert.ok(Array.isArray(shown) && shown.length === 2, 'the sheet is not the two plans');
  assert.equal(shown[0], personalPlan.kind === 'usecase' ? personalPlan.plan : null, 'the holder is not drawn first');
  assert.deepEqual(sheetOf(shown, titleOf)?.stops, []);
});

test('Approve puts Personal in, plans Money again and installs that, and the tab names both', async () => {
  const p = await pressed([personal, money]);
  const went: string[] = [];
  const out = await installInTurn(p, {
    replan: async (u) => {
      went.push(`plan ${u.title}`);
      return { ok: true, planned: moneyPlan(false) };
    },
    install: async (q) => {
      went.push(q.kind === 'usecase' ? 'install Personal' : `install Money ${q.planHash}`);
      return { ok: true, nav: null };
    },
  });
  assert.deepEqual(went, ['install Personal', 'plan Money', 'install Money h2']);
  assert.equal(out.ok && out.first ? turnWords.installedAfter(money.title, out.first) : '', 'Money is installed, after Personal.');
});

test('a plan that asks for a line nobody was shown stops once the holder is in, and says to read it again', async () => {
  const p = await pressed([personal, money]);
  const went: string[] = [];
  const out = await installInTurn(p, {
    replan: async () => ({ ok: true, planned: moneyPlan(false, ['Sends each payment to a bank feed']) }),
    install: async (q) => {
      went.push(q.kind);
      return { ok: true, nav: null };
    },
  });
  assert.deepEqual(went, ['usecase'], 'Money went in with a line nobody read');
  assert.equal(out.ok, false);
  assert.equal(!out.ok && out.fix, turnWords.unread);
  assert.doesNotMatch(turnWords.unread, /[–—]/u);
});

/** The row's sentence for a run that stopped, as `installTurn` makes it from the refusal. */
const rowOf = (out: Awaited<ReturnType<typeof installInTurn>>): string => (out.ok ? '' : out.first && out.first.length > 0 ? turnWords.stoppedAfter(out.first, out.fix, out.stopped) : out.fix);

test('a run refused after Personal went in says on the row that Personal is installed, and what stopped Money', async () => {
  const p = await pressed([personal, money]);
  const out = await installInTurn(p, {
    replan: async () => ({ ok: true, planned: moneyPlan(false) }),
    install: async (q) => (q.kind === 'usecase' ? { ok: true, nav: null } : { ok: false, fix: 'Budgets set is held by something else.', code: 'PROVIDES_CONFLICT' }),
  });
  assert.deepEqual(!out.ok && out.first, ['Personal'], 'the refusal does not carry who went in');
  const row = rowOf(out);
  assert.equal(row, 'Personal is installed. Money stopped: Budgets set is held by something else.');
  assert.doesNotMatch(row, /[–—]|usecase|module:|money-core/u, 'the row reads an id or a dash');
});

test('a run refused before Personal went in names nobody as installed', async () => {
  const p = await pressed([personal, money]);
  const out = await installInTurn(p, {
    replan: async () => assert.fail('nothing is planned again after a holder that did not go in'),
    install: async () => ({ ok: false, fix: 'The record changed. Read the plan again.', code: null }),
  });
  assert.equal(!out.ok && out.first, undefined);
  assert.equal(rowOf(out), 'The record changed. Read the plan again.');
});

test('a holder from the Kennel is not taken along, so the row still names it as the step to take first', async () => {
  const far: Offered = { ...personal, source: 'kennel' };
  const p = await afterOthers(moneyPlan(true), money, [far, money], async () => assert.fail('a signed version is read on its own sheet'));
  assert.equal(along(p), false);
  assert.equal(holderFirst(p.kind === 'pack' ? p.diff : null, [far])?.title, 'Personal');
});

/** The page without its comments, so a comment that quotes the old line counts for nothing. */
const PAGE = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8')
  .replaceAll(/<!--[\s\S]*?-->/gu, '')
  .replaceAll(/\/\*[\s\S]*?\*\//gu, '');
const body = (name: string): string => {
  const from = PAGE.indexOf(`async function ${name}(`);
  assert.ok(from >= 0, `${name} is gone`);
  return PAGE.slice(from, PAGE.indexOf('\n  }\n', from));
};

test('the press hands the plan what else waits, and a holder taken along opens the sheet instead of the row answer', () => {
  const press = body('showPlan');
  assert.match(press, /await planOf\(u, updates \?\? \[\]\)/u, 'the plan is read without what else waits');
  assert.match(body('planOf'), /planFor\(client, listing, u\.file, installed, copy\.writeRaced, among && /u);
  assert.match(press, /const along = p\.kind === 'pack' && p\.after !== undefined && p\.after\.first\.length > 0;/u);
  assert.match(press, /const holder = along \|\| p\.kind !== 'pack' \? null : holderFirst\(p\.diff,/u, 'a holder taken along still stops the press');
  assert.ok(press.indexOf('waitsOn(p, u, holder)') < press.indexOf('sheet = {'), 'a holder left behind opens a sheet it cannot approve');
  assert.match(press, /diff: diffOf\(p\),[\s\S]*if \(along\) await installTurn\(p, u\);\s*else await installOne\(p, u\.title, u\);\s*await reread\(\);/u);
});

test('the run goes through installInTurn, ends on the sentence that names who went first, and a stop stays on the row', () => {
  const run = body('installTurn');
  assert.match(run, /await installInTurn\(p, \{/u);
  assert.match(run, /out\.first \? turnWords\.installedAfter\(u\.title, out\.first\) : words\.installed\(u\.title\)/u);
  /* Good news only inside the branch that went through. */
  assert.ok(run.indexOf('toasts.push(') > run.indexOf('if (out.ok) {') && run.indexOf('toasts.push(') < run.indexOf('return true;'));
  assert.equal(run.match(/toasts\.push\(/gu)?.length, 1);
  assert.match(run, /if \(notOwner\(out\.code\)\) \{\s*await askOwner\(stopped, read\);/u, 'a refusal for not being the owner is not filed on Decide');
});

test('a stop after a holder went in names the holder on the row pressed, in a refusal and beside one filed on Decide', () => {
  const run = body('installTurn');
  assert.match(run, /const went = out\.first \?\? \[\];/u, 'the refusal is not asked who went in');
  assert.match(
    run,
    /else said = \{ \.\.\.said, \[u\.key\]: \{ fix: went\.length > 0 \? turnWords\.stoppedAfter\(went, out\.fix, out\.stopped\) : out\.fix, code: out\.code \} \};/u,
    'what stopped the run is not said on the row, or the holder that went in is not named beside it',
  );
  /* Filed on Decide, the row keeps its own words, so who is in rides beside them and the row draws it. */
  assert.match(run, /if \(mine && went\.length > 0\) said = \{ \.\.\.said, \[u\.key\]: \{ \.\.\.mine, went \} \};/u);
  assert.ok(run.indexOf('{ ...mine, went }') > run.indexOf('waitsOn(p, u, stopped)'), 'the row sentence written after it drops who went in');
  assert.match(PAGE, /\{@const went = \(s\?\.went \?\? \[\]\)\.map\(\(t\) => words\.installed\(t\)\)\.join\(' '\)\}/u);
  assert.equal(PAGE.match(/\{went\}\{went \? ' ' : ''\}/gu)?.length, 2, 'who went in is not drawn on both of the row answers');
  /* Still no good news: a run that stopped pushes no toast of its own. */
  assert.equal(run.match(/toasts\.push\(/gu)?.length, 1);
});
