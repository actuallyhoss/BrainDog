/**
 * The two documents that say the plans' figures say the table's (LCH-A08 job 5).
 *
 * WHY THIS TEST. Cloud Plus was 75,000 runs in the code and 60,000 in `docs/15-ROADMAP.md`, and nothing read the
 * document. So the roadmap's paragraph on what connectors cost and ADR-071's table in `docs/16-DECISIONS.md` are read
 * here figure by figure, each against `PLAN_TABLE`, and a copy of the roadmap with the old 60,000 put back must fail
 * (the planted fault). A figure changed in the table and not in the documents turns this red, naming the document, the
 * plan and the figure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PACKS, PLAN_TABLE, priceOf, type Plan, type PlanFigures } from '../src/plans.ts';

const HOUR = 3_600_000;
const GB = 1_000_000_000;
const doc = (name: string): string => readFileSync(new URL(`../../../docs/${name}`, import.meta.url), 'utf8');

/** The plans a document names, by the name a person reads: a self-host is no plan with figures. */
const NAMED = (['free', 'hosted', 'plus'] as const satisfies readonly Plan[]).map((id) => ({ id, row: PLAN_TABLE[id] }));

const number = (text: string | undefined): number | null => (text === undefined ? null : Number(text.replace(/,/g, '')));

/** What a document says of one plan, every figure it says, in the table's units. */
type Said = { price: string | null; runs: number | null; requests: number | null; bytes: number | null; ms: number | null; credits: number | null; agents: number | null };

/** Where `said` differs from the plan's row: one line a figure, naming where it was read. */
function differs(where: string, row: PlanFigures, said: Said): string[] {
  const held: Said = {
    price: row.price.month,
    runs: row.allowance?.runs ?? null,
    requests: row.allowance?.requests ?? null,
    bytes: row.allowance?.bytes ?? null,
    ms: row.allowance?.ms ?? null,
    credits: row.credits,
    agents: row.agents,
  };
  return (Object.keys(held) as (keyof Said)[])
    .filter((k) => said[k] !== held[k])
    .map((k) => `${where} ${row.name} ${k}: says ${JSON.stringify(said[k])}, the table says ${JSON.stringify(held[k])}`);
}

/** The roadmap's paragraph on what connectors cost, as one line of text. */
function roadmapParagraph(text: string): string {
  const at = text.indexOf('> **And what connectors cost is metered');
  assert.ok(at >= 0, 'docs/15-ROADMAP.md has no paragraph on what connectors cost');
  const end = text.indexOf('\n\n', at);
  return text.slice(at, end === -1 ? undefined : end).replace(/\n> ?/g, ' ');
}

/** Each plan's clause of the roadmap's paragraph, "on Cloud 15,000 runs, ... at $12 a month", read figure by figure. */
function roadmapSays(paragraph: string): string[] {
  const out: string[] = [];
  for (const { row } of NAMED) {
    const clause = new RegExp(`\\bon ${row.name} (?!Plus)(.*?)(?:;|\\.(?= ))`, 'u').exec(paragraph)?.[1];
    if (clause === undefined) {
      out.push(`roadmap ${row.name}: not said`);
      continue;
    }
    out.push(
      ...differs('roadmap', row, {
        price: /\bat (\$[\d.]+)/.exec(clause)?.[1] ?? null,
        runs: number(/([\d,]+) runs/.exec(clause)?.[1]),
        requests: number(/([\d,]+) requests/.exec(clause)?.[1]),
        bytes: ((gb) => (gb === null ? null : Math.round(gb * GB)))(number(/([\d.]+) GB/.exec(clause)?.[1])),
        ms: ((h) => (h === null ? null : h * HOUR))(number(/([\d,]+) hours/.exec(clause)?.[1])),
        credits: number(/([\d,]+) (?:Slash )?credits/.exec(clause)?.[1]),
        agents: number(/([\d,]+) agents/.exec(clause)?.[1]),
      }),
    );
  }
  return out;
}

/** ADR-071 in `docs/16-DECISIONS.md`, from its heading to the rule under it. */
function adr(text: string): string {
  const at = text.indexOf('## ADR-071');
  assert.ok(at >= 0, 'docs/16-DECISIONS.md has no ADR-071, the table of plans');
  const end = text.indexOf('\n---', at);
  return text.slice(at, end === -1 ? undefined : end);
}

/** ADR-071's table of plans, one row a plan, read figure by figure against the table. */
function adrSays(section: string): string[] {
  const out: string[] = [];
  const rows = new Map<string, string[]>();
  for (const line of section.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length === 9) rows.set(cells[0]!, cells);
  }
  for (const { row } of NAMED) {
    const cells = rows.get(row.name);
    if (!cells) {
      out.push(`ADR-071 ${row.name}: no row`);
      continue;
    }
    const [, price, runs, requests, data, time, credits, agents, people] = cells;
    out.push(
      ...differs('ADR-071', row, {
        price: /^\$[\d.]+/.exec(price ?? '')?.[0] ?? null,
        runs: number(runs),
        requests: number(requests),
        bytes: ((gb) => (gb === null ? null : Math.round(gb * GB)))(number(/^([\d.]+) GB$/.exec(data ?? '')?.[1])),
        ms: ((h) => (h === null ? null : h * HOUR))(number(/^([\d,]+) hours?$/.exec(time ?? '')?.[1])),
        credits: number(credits),
        agents: number(agents),
      }),
    );
    const peopleSaid = people === 'any number' ? null : number(people);
    if (peopleSaid !== row.people) out.push(`ADR-071 ${row.name} people: says ${people}, the table says ${row.people}`);
  }
  return out;
}

test("the roadmap's paragraph on what connectors cost says the table's figures", () => {
  assert.deepEqual(roadmapSays(roadmapParagraph(doc('15-ROADMAP.md'))), []);
});

test("ADR-071's table of plans says the table's figures", () => {
  assert.deepEqual(adrSays(adr(doc('16-DECISIONS.md'))), []);
});

test("ADR-071 says the packs and extra usage the table holds, and no yearly price", () => {
  const section = adr(doc('16-DECISIONS.md'));
  for (const pack of PACKS) {
    const said = new RegExp(`\\b${pack.credits}(?: credits)? for (\\$[\\d.]+)`).exec(section)?.[1];
    assert.equal(said, priceOf(pack.cents), `ADR-071 sells ${pack.credits} credits for ${said}, the table for ${priceOf(pack.cents)}`);
  }
  const extra = PLAN_TABLE.hosted.extra!;
  assert.match(section, new RegExp(`\\${priceOf(extra.runs.cents)} per ${extra.runs.per.toLocaleString('en-US')} runs`));
  assert.match(section, new RegExp(`\\${priceOf(extra.requests.cents)} per ${extra.requests.per.toLocaleString('en-US')} requests`));
  assert.match(section, new RegExp(`\\${priceOf(extra.bytes.cents)} a GB`));
  assert.match(section, new RegExp(`\\${priceOf(extra.ms.cents)} per ${extra.ms.per / HOUR} hours`));
  const yearly = NAMED.some(({ row }) => row.cents.year !== null);
  for (const [name, text] of [['ADR-071', section], ['the roadmap', roadmapParagraph(doc('15-ROADMAP.md'))]] as const)
    assert.equal(/No plan is sold by the year/.test(text), !yearly, `${name} says otherwise than the table about a yearly price`);
});

test('a document with a figure moved fails, naming the document, the plan and the figure', () => {
  /* THE PLANTED FAULTS: the roadmap's old 60,000 runs put back, and Free with a fourth agent in ADR-071's table. */
  const roadmap = roadmapParagraph(doc('15-ROADMAP.md')).replace('75,000 runs', '60,000 runs');
  assert.deepEqual(roadmapSays(roadmap), ['roadmap Cloud Plus runs: says 60000, the table says 75000']);
  const decisions = adr(doc('16-DECISIONS.md')).replace('| Free | $0 | 1,000 | 10,000 | 0.1 GB | 5 hours | 20 | 3 |', '| Free | $0 | 1,000 | 10,000 | 0.1 GB | 5 hours | 20 | 4 |');
  assert.deepEqual(adrSays(decisions), ['ADR-071 Free agents: says 4, the table says 3']);
});
