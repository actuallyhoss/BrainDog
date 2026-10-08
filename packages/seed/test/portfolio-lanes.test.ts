/**
 * A project's lanes: four, said in words, as taken for him on 8 October (`docs/20-COLLABORATION.md` §1, USE-A02).
 *
 * THE QUESTION WAS FOUR OR FIVE. The pack stores four, Building, Earning, Parked and Finished, and an older board drew
 * five (Earning, Shipping, Exploring, Maintain, Retired). Nobody had ruled, so the four lived only because nothing had
 * changed them. The default is now written down, his to reverse with a word, and this file is what goes red when the
 * declaration moves without that word: a fifth lane, a lane gone, or one shown by its stored word.
 *
 * READ FROM WHAT INSTALLS, NOT FROM THE MODULE'S CONSTANT ALONE. `firstPartyDocument('portfolio')` is the document a
 * record is given, on his record and on everyone's, so the lanes are held where a person meets them. Every filter over
 * the lanes, in the pack and in every use case (`personal.ts`'s "lane is building or earning" among them), is read too:
 * a lane renamed in the declaration and not in a filter leaves a page that quietly shows nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS, firstPartyDocument } from '../src/index.ts';
import { USE_CASES } from '../src/usecases/index.ts';

type Body = Record<string, unknown>;

/** The four, in the order the form offers them, each with the word a person reads. */
const LANES: Readonly<Record<string, string>> = { building: 'Building', earning: 'Earning', parked: 'Parked', retired: 'Finished' };

const laneOf = (fields: unknown): Body => {
  const lane = (Array.isArray(fields) ? (fields as Body[]) : []).find((f) => f.id === 'lane');
  assert.ok(lane, 'Projects declares a lane');
  return lane;
};

const things = (): Body => {
  const doc = firstPartyDocument('portfolio');
  assert.ok(doc, 'portfolio is a first-party pack');
  const decl = (doc.declarations as Body[]).find((d) => d.register === 'things');
  assert.ok(decl, 'portfolio declares Projects');
  return decl;
};

test('Portfolio declares exactly four lanes, in this order', () => {
  const lane = laneOf(things().fields);
  assert.equal(lane.type, 'enum');
  assert.equal(lane.required, true);
  assert.deepEqual(lane.values, Object.keys(LANES));
});

test('each lane is labelled in words, and never by its stored word', () => {
  const lane = laneOf(things().fields);
  assert.deepEqual(lane.labels, LANES);
  for (const [value, word] of Object.entries(LANES)) {
    assert.match(word, /^[A-Z][a-z]+$/, `${value} reads as one capitalised word`);
    assert.notEqual(word, value, `${value} is not shown as stored`);
  }
  assert.equal(lane.label, 'Status', 'the field itself is named in words');
});

test('the seed module and the installed document say the same four', () => {
  assert.deepEqual(laneOf(REGISTERS.things?.fields), laneOf(things().fields));
});

/** Every lane a filter names, from "lane is a or b" and from `{ field: 'lane', in: [...] }`, anywhere under `from`. */
function lanesNamed(from: unknown): { where: string; lane: string }[] {
  const found: { where: string; lane: string }[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\blane is (?:not )?([a-z_]+(?: or [a-z_]+)*)/g))
        for (const lane of m[1]!.split(' or ')) if (lane !== 'set') found.push({ where: v, lane });
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v !== null && typeof v === 'object') {
      const o = v as Body;
      if (o.field === 'lane' && Array.isArray(o.in)) for (const lane of o.in) found.push({ where: JSON.stringify(o), lane: String(lane) });
      Object.values(o).forEach(walk);
    }
  };
  walk(from);
  return found;
}

test('every filter over the lanes, in the pack and in every use case, names one of the four', () => {
  const named = [...lanesNamed(firstPartyDocument('portfolio')), ...lanesNamed(USE_CASES)];
  assert.ok(named.length > 0, 'the walk finds the filters it is meant to read');
  assert.ok(
    named.some((n) => n.where === 'lane is building or earning'),
    "the walk reads the projects in play, as a person's record filters them",
  );
  for (const n of named) assert.ok(Object.hasOwn(LANES, n.lane), `"${n.where}" names "${n.lane}", which is not a lane`);
});
