/**
 * A page block, turned into the dialect.
 *
 * ONE conversion, used by every surface that draws a declared page — the page route and the shared
 * link — because they were two, and the second one only knew about `table` and `stat`. A shared
 * money page rendered its headings and then nothing under two of them: "Late" and "Owed by you, by
 * counterparty" were section titles with empty bodies, which is a worse failure than omitting them,
 * because the reader is told something is there and then shown that it is not.
 *
 * That is what a duplicated renderer costs. The page route grows a kind; the copy does not; nobody
 * notices until a screenshot of the surface with the fewest visitors turns up two hollow headings.
 *
 * A page block becomes a Block segment THROUGH THE DIALECT, so a declared page and a hand-written
 * write-up take one code path from the first `<figure>` down.
 */

import { money, parse, relative } from 'braindog-render';
import { CURRENCY, NOW, display, type BlockResult } from './api.ts';

/** A bar over a register groups its rows and sums them — the one place a page does arithmetic. */
function barRows(block: BlockResult): string[] {
  const totals = new Map<string, number>();
  for (const e of block.entries) {
    const key = display(block.register ?? '', 'party', e.fields.party) ?? 'Nobody in particular';
    totals.set(key, (totals.get(key) ?? 0) + Number(e.fields.amount ?? 0));
  }
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .map(([party, total]) => `${party} | ${money(total, CURRENCY)} | `);
}

function timelineRows(block: BlockResult): string[] {
  return block.entries.slice(0, 10).map((e) => {
    const iso = String(e.fields.renews ?? '');
    const days = (Date.parse(`${iso}T12:00:00Z`) - NOW) / 86_400_000;
    const tone = days < 0 ? ' | bad' : days < 21 ? ' | warn' : '';
    return `${relative(iso, NOW)} | ${e.fields.name} | ${e.fields.provider}${tone}`;
  });
}

function boardRows(block: BlockResult): string[] {
  return block.entries.map(
    (e) =>
      `${String(e.fields.state).replace(/_/g, ' ')} | ${e.fields.what} | ${
        e.fields.thing ? display('tasks', 'thing', e.fields.thing) : ''
      }`,
  );
}

/**
 * The heading is DELIBERATELY not passed through. The block bar above already names the block and
 * says where its rows came from; a figcaption repeating it is the same sentence twice, in two
 * different typographic registers.
 */
export function toSegments(block: BlockResult) {
  const head = `${block.kind}${block.tone ? ` |  | ${block.tone}` : ''}`;
  const rows = block.metrics
    ? block.metrics.map((m) => `${m.label} | ${m.value} | ${m.note}${m.tone ? ` | ${m.tone}` : ''}`)
    : block.kind === 'bar'
      ? barRows(block)
      : block.kind === 'timeline'
        ? timelineRows(block)
        : block.kind === 'board'
          ? boardRows(block)
          : block.body
            ? [block.body]
            : [];
  return parse(['```' + head, ...rows, '```'].join('\n'));
}
