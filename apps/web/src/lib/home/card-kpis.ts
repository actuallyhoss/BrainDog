/**
 * THE KEY NUMBERS PROJECTS LEAD WITH, read from the record (the KPI plan of 21 October, 2.5 and 2.6): the `kpis` source
 * `for: cards`, one a project. One project's page has its own, `for: project`, asked by the record beside the page, where
 * the one its card leads with is marked (`leadIn`).
 *
 * ASKED AS A BODY THE RECORD DRAWS AND KEEPS NOWHERE (`previewPage`), as Today's own body is, so no page has to carry a
 * block of them and the cards, the hero and Today read the one source. A ROUTE-ONLY MODULE, like `card-late.ts`.
 *
 * IT NEVER FAILS THE SCREEN: a record with no key numbers, a host built before the source and a refusal all answer
 * none, and a card then says what it said before.
 */

import { createClient } from '@braindog/client';
import { KPIS_KIND } from 'braindog-render';

import type { KpiAnswered } from './card-kpi.ts';
import { todayHeld } from './today-read.ts';

/** The most key numbers asked for the cards: one a project, and the desk and Projects draw fewer projects than this. */
const MOST = 200;

/** The block a read asks for: every project's lead. */
/* THE SOURCE IS NAMED AS ITS KIND IS (`KPIS_KIND`), as Today's tile names it, never spelled here. */
const BLOCK = { kind: KPIS_KIND, source: KPIS_KIND, for: 'cards', limit: MOST };

/** The key numbers the block answered, or none. */
async function read(base: string): Promise<KpiAnswered[]> {
  const client = createClient({ base });
  const body = { page: 'key-numbers', title: 'Key numbers', blocks: [BLOCK] };
  const out = await client.call<{ blocks?: unknown }>('previewPage', { body }).catch(() => null);
  if (!out?.ok || !Array.isArray(out.value.blocks)) return [];
  const block = out.value.blocks[0] as { kpis?: unknown } | undefined;
  return answered(block?.kpis);
}

/** The key numbers a `kpis` block answered, each one that is one. */
const answered = (kpis: unknown): KpiAnswered[] =>
  Array.isArray(kpis) ? (kpis as unknown[]).filter((k): k is KpiAnswered => typeof k === 'object' && k !== null && typeof (k as KpiAnswered).name === 'string' && Array.isArray((k as KpiAnswered).points)) : [];

/**
 * Every project's lead number, one a project: drawn by the record in Today's one read where it is held at this version
 * (`today-read.ts`), else asked.
 */
export async function readLeads(base: string): Promise<KpiAnswered[]> {
  const got = await (todayHeld(base) ?? Promise.resolve(null));
  const leads = got?.cards?.leads;
  return Array.isArray(leads) ? answered(leads) : read(base);
}

/**
 * The number a project leads with, from the key numbers a `kpis` block `for: project` answered, or `null` where it keeps
 * none: the record asks it for a project's page and answers it beside the page (`shape-answer.ts`).
 */
export const leadIn = (kpis: unknown): KpiAnswered | null => answered(kpis).find((k) => k.headline === true) ?? null;
