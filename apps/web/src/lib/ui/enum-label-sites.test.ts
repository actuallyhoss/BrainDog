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
import { stateSaid } from '../../routes/r/[register]/[seq]/lead.ts';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(here, '../../routes/r/[register]/+page.svelte'), 'utf8');
const CARDS = readFileSync(join(here, 'RowCards.svelte'), 'utf8');
const ROW_PAGE = readFileSync(join(here, '../../routes/r/[register]/[seq]/+page.svelte'), 'utf8');

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
  const bare = { id: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'role', type: 'enum', values: ['client', 'registrar'] }] };
  const client: Governor = {
    boot: async () => ({ ok: true, value: {} }),
    governance: async () => ({ ok: true, value: [] }),
    call: async () => ({ ok: false, refusal: { code: 'NOPE', fix: '' } }),
    schema: async () => ({ ok: true, value: bare }),
    get: async () => ({ ok: true, value: { seq: 3, version: 1, fields: { name: 'Nour', role: 'client' } } }),
  };
  const body = { register: 'people', rows: [{ at: 'people#3', patch: { role: 'registrar' } }] };
  heardLabels(PERSONAL);
  const held = await heldBy(client, [body]);
  const [row] = updatesOf(body, held.registers, held.rows, plainOf(held.registers));
  assert.deepEqual(row?.changes, [{ field: 'role', label: 'Role', long: false, before: 'Work contact', after: 'Agency' }]);
  /* And a record with no labels reads the value's own words, as the diff always did. */
  heardLabels({});
  const plain = await heldBy(client, [body]);
  const [was] = updatesOf(body, plain.registers, plain.rows, plainOf(plain.registers));
  assert.deepEqual(was?.changes, [{ field: 'role', label: 'Role', long: false, before: 'client', after: 'registrar' }]);
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
