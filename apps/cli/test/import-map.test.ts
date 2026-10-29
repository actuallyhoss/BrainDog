/**
 * A MAPPING THAT IS DATA, AND MANY ASKS AS ONE QUESTION.
 *
 * An import was a code module and a map file, so a person whose tool nobody had written a module for had no way in.
 * A map's `sections` now say, for each path of the export, the list it fills, the key it is found again by and each
 * field's move in one of five words (text, money, day, link, one of): `braindog import --map <map.json> <export.json>`.
 *
 * And an adapter's asks were filed one question each, which is how 57 rules became 57 questions. Asks of one `group`
 * are filed as one question with a part for each (`gatherAsks`), and a part asked on an earlier night is not asked
 * again whichever question it rode in. EVERY VALUE IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TOOLS, gatherAsks, mapAdapter, planSections, readMap, type Plan, type PlannedAsk } from '../src/adapter.ts';
import { applyPlan, said, type Door } from '../src/import.ts';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/tallybook/${name}`, import.meta.url)), 'utf8');
const MAP = fixture('sections.json');
const EXPORT = JSON.parse(fixture('export.json')) as Record<string, unknown>;

const mapOf = (text: string) => {
  const got = readMap(text, 'map.json');
  assert.ok(got.ok, got.ok ? '' : got.fix);
  return got.value;
};

test('A MAP WITH SECTIONS IS READ AS DATA: the lists come from its sections, in the order they are named', () => {
  const map = mapOf(MAP);
  assert.deepEqual(map.targets.order, ['people', 'accounts', 'tasks']);
  assert.deepEqual(map.targets.names, { people: 'People', accounts: 'Accounts', tasks: 'Tasks' });
  assert.equal(map.source, 'Tallybook');
  assert.equal(map.key, 'tallybook:');
  assert.deepEqual(
    map.sections?.map((s) => [s.path, s.register, s.kind]),
    [
      ['people', 'people', 'person'],
      ['book.accounts', 'accounts', 'account'],
      ['items', 'tasks', 'item'],
    ],
  );
});

test('A MAP THAT CANNOT BE READ SAYS WHICH LINE AND HOW TO FIX IT', () => {
  const bad = (sections: unknown, more: Record<string, unknown> = { source: 'Tallybook' }) => {
    const got = readMap(JSON.stringify({ ...more, sections }), 'map.json');
    assert.ok(!got.ok, 'a broken map was read');
    return got.fix;
  };
  assert.match(bad({ items: { register: 'tasks', name: 'Tasks', key: 'id', fields: { by: { from: 'due', as: 'date' } } } }), /as is one of text, money, day, link, one of/u);
  assert.match(bad({ items: { register: 'tasks', name: 'Tasks', key: 'id', fields: { cost: { from: 'cost', as: 'money' } } } }), /names the field holding each amount's currency/u);
  assert.match(bad({ items: { register: 'tasks', name: 'Tasks', key: 'id', fields: { owner: { from: 'who', as: 'link', to: 'people' } } } }), /links owner to people, which no section reads/u);
  assert.match(bad({ items: { register: 'tasks', key: 'id', fields: { what: 'what' } } }), /has no name for tasks/u);
  assert.match(bad({ items: { register: 'tasks', name: 'Tasks', key: 'id', fields: { what: 'what' } } }, {}), /source in map\.json is what the report calls the tool/u);
  assert.match(bad({ 'a.b.c': { register: 'tasks', name: 'Tasks', key: 'id', fields: { what: 'what' } } }), /a path of one or two names/u);
});

test('EACH OF THE FIVE MOVES: text, day, money in minor units, one of, and a link to an item the export holds', () => {
  const map = mapOf(MAP);
  const { rows, skipped, changed } = planSections(EXPORT, map, TOOLS);
  const by = (key: string) => rows.find((r) => r.key === key);
  assert.deepEqual(by('tallybook:account:c1')?.fields, { name: 'Studio cash', kind: 'cash', balance: { amount: 125050, currency: 'EGP' }, as_of: '2026-09-24' });
  /* A CURRENCY WRITTEN IN SMALL LETTERS IS STILL ONE, and 80 dollars is 8000 cents. */
  assert.deepEqual(by('tallybook:account:c2')?.fields.balance, { amount: 8000, currency: 'USD' });
  assert.deepEqual(by('tallybook:account:c2')?.fields.kind, 'card');
  assert.deepEqual(by('tallybook:item:a1')?.fields, { what: 'Renew the workshop lease', by: '2026-10-01', owner: { $ref: 'tallybook:person:p1' } });
  assert.equal(by('tallybook:item:a3')?.fields.by, '2026-10-07', 'a day with a time was not cut to its day');
  /* A LINK TO NOTHING STILL ARRIVES, without the link, and the report says why. */
  assert.deepEqual(by('tallybook:item:a2')?.fields, { what: 'Send the October invoices', by: '2026-10-03' });
  assert.deepEqual(changed, ['Send the October invoices arrived without its owner, because people in the export holds nothing called p9.']);
  assert.deepEqual(skipped, []);
});

test('A WORD THE TABLE HAS NOT GOT IS CARRIED AS ITS ELSE, and the export word goes to the list to be proposed', () => {
  const map = mapOf(
    JSON.stringify({
      source: 'Tallybook',
      sections: { accounts: { register: 'accounts', name: 'Accounts', key: '$key', label: 'name', fields: { name: 'name', kind: { from: 'type', as: 'one of', values: { Cash: 'cash' }, else: 'bank' } } } },
    }),
  );
  const { rows } = planSections({ accounts: { c7: { name: 'Savings jar', type: 'Jar' } } }, map, TOOLS);
  assert.deepEqual(rows, [{ register: 'accounts', key: 'tallybook:accounts:c7', label: 'Savings jar', fields: { name: 'Savings jar', kind: 'bank' }, own: { kind: 'Jar' } }]);
  /* A WORD THAT IS A NAME EVERY OBJECT HAS IS STILL NOT IN THE TABLE. */
  const odd = planSections({ accounts: { c8: { name: 'Odd', type: 'constructor' } } }, map, TOOLS);
  assert.deepEqual(odd.rows[0]?.fields, { name: 'Odd', kind: 'bank' });
});

test('WHAT A MAP CANNOT CARRY IS LEFT OUT WITH ITS REASON, never dropped quietly', () => {
  const map = mapOf(
    JSON.stringify({
      source: 'Tallybook',
      sections: { items: { register: 'tasks', name: 'Tasks', key: 'id', label: 'what', fields: { what: 'what', by: { from: 'due', as: 'day' } } } },
    }),
  );
  const exp = { items: [{ what: 'No key here' }, { id: 'b1', what: 'Twice' }, { id: 'b1', what: 'Twice again' }, { id: 'b2', what: 'Soon', due: 'next week' }, 'loose words'] };
  const { rows, skipped } = planSections(exp, map, TOOLS);
  assert.deepEqual(rows.map((r) => r.label), ['Twice', 'Soon']);
  assert.deepEqual(skipped, [
    { reason: 'No id to find it again by, in items', items: ['No key here'] },
    { reason: 'In items twice, so only the first was carried', items: ['Twice again'] },
    { reason: 'due is not a day, so it was not carried', items: ['Soon'] },
    { reason: 'Not an item in items', items: ['loose words'] },
  ]);
});

test('THE MAP IS AN ADAPTER OF ITS OWN: it reads the export, plans its rows, and says the day it was taken', () => {
  const adapter = mapAdapter(mapOf(MAP));
  assert.equal(adapter.source, 'Tallybook');
  assert.deepEqual(adapter.read('[1, 2]'), { ok: false, fix: 'An export a map reads is one JSON object, with its sections inside it.' });
  const read = adapter.read(fixture('export.json'));
  assert.ok(read.ok);
  const plan = adapter.plan(read.value, { today: '2026-09-25', map: {}, tools: TOOLS });
  assert.equal(plan.taken, '2026-09-24T20:00:00.000Z');
  assert.equal(plan.rows.length, 6);
});

/** Ten rules an adapter plans, each a change installing one declaration, all of one group. */
const RULES: PlannedAsk[] = Array.from({ length: 10 }, (_, i) => ({
  key: `tallybook:rule:r${String(i + 1)}`,
  label: `Shop ${String(i + 1)} is Groceries`,
  question: `File what you spend at shop ${String(i + 1)} under Groceries?`,
  kind: 'change' as const,
  body: { declaration_id: null, to: { id: `rule.shop-${String(i + 1)}`, kind: 'rule', body: { when: `shop ${String(i + 1)}`, then: 'Groceries' } }, from: `tallybook:rule:r${String(i + 1)}` },
  group: { key: 'tallybook:rules', label: 'Rules from Tallybook', question: 'File what you spend the way Tallybook did?' },
}));

test('TEN RULES ARE ONE QUESTION WITH TEN PARTS, each part kept by its own key and label so it can be left out', () => {
  const choice: PlannedAsk = { key: 'tallybook:ask:lane', label: 'Lane', question: 'Which lane?', body: { options: ['a', 'b'], from: 'tallybook:ask:lane' }, group: RULES[0]!.group! };
  const { asks, before } = gatherAsks([choice, ...RULES], new Set());
  assert.equal(before, 0);
  assert.equal(asks.length, 2, 'a choice rides in no bundle, and the ten rules are one');
  assert.equal(asks[0], choice);
  const one = asks[1]!;
  assert.equal(one.key, 'tallybook:rules');
  assert.equal(one.question, 'File what you spend the way Tallybook did?');
  assert.equal((one.body.to as { declarations: unknown[] }).declarations.length, 10);
  const parts = one.body.parts as { from: string; label: string }[];
  assert.deepEqual(parts.map((p) => p.label), RULES.map((r) => r.label));
  assert.equal(one.body.from, 'tallybook:rules');
  /* FILED UNDER ONE OF THE IDS IT INSTALLS, as the record files a bundle, though the first part named none. */
  assert.equal(one.body.declaration_id, 'rule.shop-1');
});

test('A PART ASKED ON AN EARLIER NIGHT IS NOT ASKED AGAIN, and the question it rode in counts as asked once', () => {
  const asked = new Set(RULES.map((r) => r.key));
  const eleventh: PlannedAsk = { ...RULES[0]!, key: 'tallybook:rule:r11', label: 'Shop 11 is Groceries', body: { ...RULES[0]!.body, from: 'tallybook:rule:r11' } };
  const { asks, before } = gatherAsks([...RULES, eleventh], asked);
  assert.equal(before, 1, 'ten parts of one question were counted as ten questions');
  /* A GROUP LEFT WITH ONE ASK IS FILED AS THAT ASK, under its own key. */
  assert.deepEqual(asks, [eleventh]);
});

test('APPLIED, TEN RULES FILE ONE QUESTION ON DECIDE, and the second night asks nothing and says so', async () => {
  const filed: { question: string; body: Record<string, unknown> }[] = [];
  const door: Door = {
    schema: async () => ({ ok: true, value: {} }),
    list: async () => ({ ok: true, value: { rows: [], cursor: null } }),
    create: async () => ({ ok: true, value: {} }),
    update: async () => ({ ok: true, value: {} }),
    governance: async () => ({ ok: true, value: filed.map((f, i) => ({ id: `s${String(i)}`, status: 'open', body: f.body })) }),
    propose: async (p) => {
      filed.push({ question: p.question, body: p.body });
      return { ok: true, value: {} };
    },
  };
  const plan: Plan = { key: 'tallybook:', taken: null, rev: null, rows: [], asks: RULES, polls: [], skipped: [], changed: [] };
  const first = await applyPlan(plan, door, { dryRun: false });
  assert.equal(filed.length, 1, `ten rules filed ${String(filed.length)} questions`);
  assert.ok(said(first, { dryRun: false, file: 'export.json' }).includes('Decide: 1 asked, 0 asked before.'));
  const second = await applyPlan(plan, door, { dryRun: false });
  assert.equal(filed.length, 1, 'the second night asked again');
  assert.ok(said(second, { dryRun: false, file: 'export.json' }).includes('Decide: 0 asked, 1 asked before.'));
});

test('A QUESTION THE IMPORT FILES PRINTS THE LINK THAT OPENS IT ON DECIDE, and with no record named, the count alone', async () => {
  const door: Door = {
    schema: async () => ({ ok: true, value: {} }),
    list: async () => ({ ok: true, value: { rows: [], cursor: null } }),
    create: async () => ({ ok: true, value: {} }),
    update: async () => ({ ok: true, value: {} }),
    governance: async () => ({ ok: true, value: [] }),
    propose: async () => ({ ok: true, value: { id: 'q_7' } }),
  };
  const plan: Plan = { key: 'tallybook:', taken: null, rev: null, rows: [], asks: RULES, polls: [], skipped: [], changed: [] };
  const report = await applyPlan(plan, door, { dryRun: false });
  const linked = said(report, { dryRun: false, file: 'export.json', to: { key: 'https://host.example/the-studio' } });
  assert.ok(linked.some((l) => l.endsWith(' https://host.example/the-studio/decide/q_7')), linked.join('\n'));
  const bare = said(report, { dryRun: false, file: 'export.json', to: { key: 'https://host.example' } });
  assert.ok(!bare.some((l) => l.includes('/decide/')), 'a host that names no record was handed a guessed link');
});
