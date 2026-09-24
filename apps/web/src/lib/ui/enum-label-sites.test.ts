/**
 * Every other place a list draws a declared value: by the label the field carries, as the form now does.
 *
 * THE FORM WAS ONE SITE OF SEVEN. `value-said.test.ts` held `RowForm.svelte` to `valueSaid`, and the register page went
 * on drawing each filter pill, menu, segment and sheet row as `copy.valueWord(value)`, the inline cell editor's options
 * and the state menus as `v.replace(/_/g, ' ')`, and a saved view's title the same way. So a household's People list,
 * whose rows read Work contact, was filtered by a pill that said Client, and a Things row was moved by a menu that offered
 * `building` where the list's rows read Active (`loop/research-held-landing.md`, section 3, "Not covered, same defect").
 *
 * THE CARDS WORDED WHAT `display` HAD ALREADY SAID, which the research called harmless, and on screen it is: every
 * value label the seed ships starts with a capital, so `copy.valueWord` gave each back unchanged, and the card's
 * `::first-letter` rule raises the one letter it would have changed in `iPhone repairs`. A card now draws the stored
 * value through `valueSaid` all the same, so the card and the form say a value by one function and cannot drift.
 *
 * THE GRID'S OWN CELLS ARE LEFT, and they are the two `copy.valueWord(value)` the page keeps: there `value` is what
 * `toRows` said, which is `display`'s label already raised to a capital by `toRows` itself, so wording it again changes
 * nothing that `toRows` has not already changed.
 *
 * HELD BY READING THE SOURCE, as `value-said.test.ts` is, because a Svelte component does not mount under `node --test`.
 *
 * THREE SITES FURTHER OUT, AND THESE ARE HELD BY WHAT THEY SAY. With Personal's labels laid on the sample, a block's
 * filter line read "status is building or earning" over rows reading Active and Ongoing, Decide's diff of a rowset said
 * a person's role was changing to "registrar" where the row reads Agency, and a project's own page led with Earning
 * over a Status field reading Ongoing (`loop/research-batch-forty-seven-audit.md` §3, all three measured failing). The
 * last tests below run the three with Personal's own labels and read what they say. The row page's lead keeps one
 * source check, that it draws through the function the tests run; a rename there turns it red, never green.
 *
 * AND THE LEAD HAD TWO NEIGHBOURS. The same page chipped that project's state "Earning" under a lead reading Ongoing,
 * and its inline editor offered a person's Role as `registrar` where the People list reads Agency
 * (`loop/research-batch-forty-eight-audit.md` §6; both tests failed against the page before it changed). The chip
 * now draws through `stateSaid` and the options through `choicesOf`, the tests run both with Personal's labels, and
 * each keeps the same single source check that the page calls them.
 *
 * AND A THREAD'S PAGE DID THE SAME WITH HEALTH. Each update's chip and the composer's menu spelt the stored value with
 * its underscores out, so the menu offered "on track" under a header reading "On track" (`loop/research-batch-forty-nine-audit.md`
 * §6; both tests failed against the page before it changed). They draw through `t/[track]/health.ts` now.
 *
 * THEN THE HEADER ABOVE THEM, AND AN ADD-ON'S SETTINGS. With those chips fixed, a record labelling on_track Fine read
 * Fine on every update and On track in the header, whose `healthLabel` read a table and no labels; it takes the
 * declaration now. The settings page spelt an enum setting's values with the underscores out, and there the honest fix
 * is smaller than the brief: a pack's setting cannot declare a value's words, so the page says each the way an
 * unlabelled field value reads everywhere else. Both tests below failed before the code under them changed.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { useCase } from '@braindog/seed/usecases';

import { saidPlainly } from '../record/blocks.ts';
import { REGISTERS } from '../record/data.ts';
import { heldBy, plainOf, type Governor } from '../record/governance.ts';
import { heardLabels, relabelAll } from '../voice.ts';
import { updatesOf } from '../../routes/decide/[id]/changes.ts';
import { choicesOf, stateSaid } from '../../routes/r/[register]/[seq]/lead.ts';
import { healthChoices, healthSaid } from '../../routes/t/[track]/health.ts';
import { healthLabel } from '../record/api.ts';
import { settingChoices } from '../../routes/packs/[id]/said.ts';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(here, '../../routes/r/[register]/+page.svelte'), 'utf8');
const CARDS = readFileSync(join(here, 'RowCards.svelte'), 'utf8');
const ROW_PAGE = readFileSync(join(here, '../../routes/r/[register]/[seq]/+page.svelte'), 'utf8');
const TRACK_PAGE = readFileSync(join(here, '../../routes/t/[track]/+page.svelte'), 'utf8');
const PACK_PAGE = readFileSync(join(here, '../../routes/packs/[id]/+page.svelte'), 'utf8');

const PERSONAL = useCase('personal')!.labels as Record<string, string>;
after(() => {
  relabelAll(REGISTERS, {});
  heardLabels({});
});

/* The grid's two cells, over `toRows`'s already-labelled text (see the header). */
const CELL = '<span class="enum">{copy.valueWord(value)}</span>';

test('THE REGISTER PAGE WORDS NO DECLARED VALUE ITSELF, outside the two cells that draw what `toRows` said', () => {
  const rest = PAGE.split(CELL);
  assert.equal(rest.length - 1, 2, 'the two grid cells moved; read `toRows` again before changing this');
  const raw = rest.join('').match(/copy\.valueWord\([^)]*\)/gu) ?? [];
  assert.deepEqual(raw, [], 'a filter pill, menu, segment or sheet row is still drawn without its label');
});

test('AND SPELLS NONE WITH ITS UNDERSCORES TAKEN OUT, but in `saidInLine`, behind the label', () => {
  /* The one left is the fallback where a field carries no label, and it sits after the label's lookup. */
  const spelt = PAGE.split('\n').filter((line) => /\w\.replace\(\/_\/g, ' '\)/u.test(line));
  assert.equal(spelt.length, 1, `the cell editor, the state menus or a sentence still spell the stored value:\n${spelt.join('\n')}`);
  assert.ok(spelt[0]!.includes('const saidInLine = ') && spelt[0]!.includes('?.labels?.[value] ??'), spelt[0]);
});

test('THE FOUR STATE SITES AND THE VIEW TITLE SAY A VALUE THROUGH `saidInLine`, by the field it belongs to', () => {
  /* THE TEST ABOVE ONLY REFUSES ONE WRONG SPELLING. With the bulk menu's item put back as a bare `{state}`, or the row
     menu asking `saidInLine('', state)`, which finds no field and so no label, the four tests this file first held still passed; both
     were measured by mutation. So the sites are counted: the row's move and its toast, the bulk move and its toast,
     the two menus, and the saved view's title. */
  const count = (s: string) => PAGE.split(s).length - 1;
  assert.equal(count("saidInLine(decl?.state ?? '', state)"), 4, 'a state menu or a move sentence no longer reads the state field');
  assert.equal(count('saidInLine(f.field, v)'), 1, "a saved view's title no longer reads the filtered field's labels");
});

test('THE PILLS, THE MENU, THE SEGMENTS, THE SHEET AND THE CELL EDITOR DRAW THROUGH `valueSaid`', () => {
  /* `assert.ok` and not `assert.match`, which prints all four thousand lines of the page when it fails. */
  assert.ok(/import \{[^}]*\bvalueSaid\b[^}]*\} from '\$lib\/voice\.ts'/u.test(PAGE), 'the page does not import `valueSaid`');
  /* The phone's summary, the menu's summary, its items, the segments, the sheet, and the cell editor's options. */
  assert.equal(PAGE.match(/valueSaid\(f, (value|v)\)/gu)?.length, 6);
});

test('A CARD DRAWS THE STORED VALUE BY ITS LABEL, and does not word the label a second time', () => {
  assert.equal(CARDS.includes('copy.valueWord('), false, 'a card still runs `valueWord` over what `display` said');
  assert.ok(CARDS.includes('valueSaid('), 'a card does not draw through `valueSaid`');
  /* PRESENCE WAS NOT ENOUGH: `worded` asking for `money` instead of `enum` kept the call in the file and never reached
     it, and the two lines above passed (measured). The call has to sit behind the enum test, and the detail line has to
     hand it the stored value and not what `display` said. */
  const call = CARDS.split('\n').filter((line) => line.includes('valueSaid(f, value)'));
  assert.equal(call.length, 1, call.join('\n'));
  assert.ok(call[0]!.includes("f?.type === 'enum'"), call[0]);
  assert.ok(CARDS.includes('worded(f, e.fields[f], display('), 'the detail line no longer hands `worded` the stored value');
});

test("A BLOCK'S FILTER LINE SAYS A VALUE BY ITS LABEL, as the rows under it read it", () => {
  /* Personal's `my-project` page filters `lane is building or earning`, and a Personal record's Projects Overview
     carries two blocks on `lane is parked or retired` (`portfolio.ts`). */
  relabelAll(REGISTERS, PERSONAL);
  assert.equal(saidPlainly('things', 'lane is building or earning'), 'status is Active or Ongoing');
  assert.equal(saidPlainly('things', 'lane is parked or retired'), 'status is On hold or Finished');
  /* A label typed back is the same value, so it prints the same word. */
  assert.equal(saidPlainly('things', 'lane is ongoing'), 'status is Ongoing');
  /* And a record with no labels still reads the value's own words, underscores out. */
  relabelAll(REGISTERS, {});
  assert.equal(saidPlainly('things', 'lane is building or earning'), 'status is building or earning');
});

test("DECIDE'S DIFF OF A ROWSET SAYS BOTH SIDES BY THE RECORD'S LABELS", async () => {
  /* THE WHOLE PATH `/decide` TAKES, and not `plainOf` handed a declaration somebody relabelled first: the two Decide
     screens read the record's declarations through the raw client, which knows no labels, so a `plainOf` that read
     `labels` would still have said Registrar on the screen. */
  const bare = { id: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'role', type: 'enum', values: ['client', 'accountant'] }] };
  const client: Governor = {
    boot: async () => ({ ok: true, value: {} }),
    governance: async () => ({ ok: true, value: [] }),
    call: async () => ({ ok: false, refusal: { code: 'NOPE', fix: '' } }),
    schema: async () => ({ ok: true, value: bare }),
    get: async () => ({ ok: true, value: { seq: 3, version: 1, fields: { name: 'Nour', role: 'client' } } }),
  };
  const body = { register: 'people', rows: [{ at: 'people#3', patch: { role: 'accountant' } }] };
  heardLabels(PERSONAL);
  const held = await heldBy(client, [body]);
  const [row] = updatesOf(body, held.registers, held.rows, plainOf(held.registers));
  assert.deepEqual(row?.changes, [{ field: 'role', label: 'Role', long: false, before: 'Work contact', after: 'Tax and accounts' }]);
  /* And a record with no labels reads the value's own words, as the diff always did. */
  heardLabels({});
  const plain = await heldBy(client, [body]);
  const [was] = updatesOf(body, plain.registers, plain.rows, plainOf(plain.registers));
  assert.deepEqual(was?.changes, [{ field: 'role', label: 'Role', long: false, before: 'client', after: 'accountant' }]);
});

test("A ROW'S LEAD SAYS ITS STATE BY ITS LABEL, as its saved field does", () => {
  relabelAll(REGISTERS, PERSONAL);
  assert.equal(stateSaid(REGISTERS.things, 'earning'), 'Ongoing');
  assert.equal(stateSaid(REGISTERS.things, 'parked'), 'On hold');
  relabelAll(REGISTERS, {});
  assert.equal(stateSaid(REGISTERS.things, 'earning'), 'Earning');
  assert.equal(stateSaid(undefined, 'client_work'), 'Client work');
  /* The one source check: the page's lead draws through the function above, so a rename turns this red. */
  assert.ok(ROW_PAGE.includes('<span class="lead-word">{stateSaid(decl, stateValue)}</span>'), 'the lead no longer draws its state through `stateSaid`');
});

test("A ROW'S STATE CHIP SAYS ITS STATE BY THE SAME FUNCTION AS ITS LEAD", () => {
  /* THE CHIP BESIDE THE FIXED LEAD STILL SPELT THE STORED VALUE: a Personal project led with Ongoing over a chip that
     read Earning, since `Chip` raises the first letter of whatever it is handed (audit forty-eight §6). */
  relabelAll(REGISTERS, PERSONAL);
  assert.equal(stateSaid(REGISTERS.things, 'earning'), 'Ongoing');
  relabelAll(REGISTERS, {});
  assert.ok(ROW_PAGE.includes('<Chip label={stateSaid(decl, String(value))} {tone} />'), 'the state chip no longer draws through `stateSaid`');
  assert.equal(ROW_PAGE.split('stateSaid(decl, ').length - 1, 2, 'the lead or the chip draws its state some other way');
});

test("A ROW'S INLINE EDITOR OFFERS EACH VALUE BY ITS LABEL, in the order the field declares", () => {
  /* Editing a person's Role offered `registrar` where the People list read Agency (audit forty-eight §6). Asked of
     `accountant` since People 2.0.0 took `registrar` away (M3 B9): the same relabel, Tax and accounts. */
  relabelAll(REGISTERS, PERSONAL);
  const role = REGISTERS.people!.fields.find((f) => f.id === 'role')!;
  const offered = choicesOf(role);
  assert.deepEqual(offered.map(([v]) => v), role.values, 'the editor offers other values than the field declares');
  assert.deepEqual(Object.fromEntries(offered).accountant, 'Tax and accounts');
  assert.deepEqual(Object.fromEntries(offered).client, 'Work contact');
  /* A record with no labels still reads the value's own words, as the register page's editor does. */
  relabelAll(REGISTERS, {});
  assert.equal(Object.fromEntries(choicesOf(REGISTERS.people!.fields.find((f) => f.id === 'role')!)).accountant, 'Accountant');
  assert.ok(ROW_PAGE.includes('{#each choicesOf(f) as [v, said]}<option value={v}>{said}</option>{/each}'), 'the editor no longer draws its options through `choicesOf`');
  /* And no value on the row's page is spelt by taking its underscores out, which is how both sites read the value. */
  const spelt = ROW_PAGE.split('\n').filter((line) => /\.replace\(\/_\/g, ' '\)/u.test(line));
  assert.deepEqual(spelt, [], 'a value on the row page is still spelt from its stored id');
});

test("NEITHER A ROW'S PAGE NOR A THREAD'S SPELLS A VALUE WITH ITS UNDERSCORES TAKEN OUT", () => {
  /* The register page's own check, laid on the two pages that draw one row or one thread, WITHOUT ITS LEADING `\w`.
     Audit forty-nine §6 asked for that pattern and said it found two lines on each page; measured, it found one, since
     `String(u.fields.health).replace(...)` puts a bracket before the dot, and so did the row page's chip before
     `fbf9e708`. Neither page has a helper that reads labels to exempt. Before this held, it found the thread's update
     chip and its composer's menu; the row page was already clean. */
  for (const [name, source] of [['the row page', ROW_PAGE], ['the thread page', TRACK_PAGE]] as const) {
    const spelt = source.split('\n').filter((line) => /\.replace\(\/_\/g, ' '\)/u.test(line));
    assert.deepEqual(spelt, [], `${name} still spells a stored value:\n${spelt.join('\n')}`);
  }
});

test("A THREAD SAYS EACH UPDATE'S HEALTH, AND OFFERS EACH, BY THE RECORD'S LABELS", () => {
  /* NO SHIPPED USE CASE LABELS A HEALTH, so these are a record's own, written as its settings would write them
     (`label_updates__health__on_track`). Before, the composer offered "on track" in lower case under a header chip
     reading "On track", and a labelled record read the stored id on every update. */
  relabelAll(REGISTERS, { 'updates.health.on_track': 'Fine', 'updates.health.at_risk': 'Wobbling' });
  assert.equal(healthSaid(REGISTERS.updates, 'on_track'), 'Fine');
  const offered = healthChoices(REGISTERS.updates);
  assert.deepEqual(offered.map(([v]) => v), ['on_track', 'at_risk', 'off_track'], 'the composer offers other values than the field declares');
  assert.deepEqual(offered.map(([, said]) => said), ['Fine', 'Wobbling', 'Off track']);
  /* A record with no labels reads the value's own words, capital first, as the header chip does. */
  relabelAll(REGISTERS, {});
  assert.deepEqual(healthChoices(REGISTERS.updates).map(([, said]) => said), ['On track', 'At risk', 'Off track']);
  /* The two source checks: the page draws both through the functions above, and keeps writing the stored value. */
  assert.ok(TRACK_PAGE.includes('{#each healthChoices(REGISTERS.updates) as [v, said]}<option value={v}>{said}</option>{/each}'), "the composer no longer offers a health through `healthChoices`");
  assert.ok(TRACK_PAGE.includes('label={healthSaid(REGISTERS.updates, String(u.fields.health))}'), "an update's chip no longer says its health through `healthSaid`");
});

test("A THREAD'S HEADER SAYS ITS HEALTH BY THE SAME LABELS AS THE CHIPS UNDER IT", () => {
  /* THE HEADER WAS THE ONE SITE LEFT ON THE THREAD. With the record's own `updates.health.on_track` reading Fine, every
     update's chip said Fine and the header chip above them said On track, from a table in `healthLabel` that read no
     labels (audit fifty's checkers; failed against `api.ts` before it changed). */
  const current = { health: 'on_track', asOf: '2026-09-20', by: 'Sam', state: 'current' } as const;
  relabelAll(REGISTERS, { 'updates.health.on_track': 'Fine' });
  assert.equal(healthLabel(current, REGISTERS.updates), healthSaid(REGISTERS.updates, 'on_track'));
  assert.equal(healthLabel(current, REGISTERS.updates), 'Fine');
  assert.equal(healthLabel({ ...current, state: 'missing' }, REGISTERS.updates), 'Fine, and stale');
  /* A health the record does not label keeps the table's words, and so does a caller that hands no declaration. */
  assert.equal(healthLabel({ ...current, health: 'at_risk' }, REGISTERS.updates), 'At risk');
  assert.equal(healthLabel(current), 'On track');
  relabelAll(REGISTERS, {});
  assert.equal(healthLabel(current, REGISTERS.updates), 'On track');
  /* The two states with no health say so whatever the labels are. */
  assert.equal(healthLabel({ health: null, asOf: null, by: null, state: 'missing' }, REGISTERS.updates), 'Update missing');
  assert.ok(TRACK_PAGE.includes('<Chip label={healthLabel(health, REGISTERS.updates)}'), 'the header chip no longer hands `healthLabel` the declaration');
});

test("AN ADD-ON'S SETTINGS PAGE SAYS AN ENUM SETTING'S VALUES AS THE REST OF THE PRODUCT SAYS AN UNLABELLED VALUE", () => {
  /* THERE IS NO LABEL TO DRAW. A pack's setting takes `type`, `values`, `default`, `label` and `note`, and the kernel's
     `readConfig` refuses any other key, so a value's words cannot be declared. What the page can do is say a value the
     way `valueSaid` says one a field does not label: the segments and the menu read `two yearly` where a register's
     pills for the same stored value read Two yearly (audit forty-nine §6 named both lines; failed before they moved). */
  const decl = { type: 'enum', values: ['weekly', 'two_yearly', 'api'] } as const;
  assert.deepEqual(settingChoices(decl), [['weekly', 'Weekly'], ['two_yearly', 'Two yearly'], ['api', 'API']]);
  assert.deepEqual(settingChoices({ type: 'enum' }), []);
  assert.equal(PACK_PAGE.split('settingChoices(decl)').length - 1, 2, 'the segments or the menu no longer draw through `settingChoices`');
  const spelt = PACK_PAGE.split('\n').filter((line) => /\.replace\(\/_\/g, ' '\)/u.test(line));
  assert.deepEqual(spelt, [], `the settings page still spells a stored value:\n${spelt.join('\n')}`);
});
