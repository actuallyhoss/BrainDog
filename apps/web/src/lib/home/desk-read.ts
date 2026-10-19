/**
 * The desk's project cards, read from the record: the list that declares `scopes`, and its rows.
 *
 * A ROUTE-ONLY MODULE, like `hues.ts`: the client carries the route table as a value, so Home imports this when it asks
 * and nothing every screen loads imports it. IT NEVER FAILS THE SCREEN: a record with no projects list, a list the
 * reader may not read and a host that refuses the call all answer `null`, and `null` draws nothing.
 */

import { createClient } from '@braindog/client';

import { learn } from '../record/remote.ts';
import { REGISTERS } from '../record/held.ts';
import { cardsOf, projectsOf, type CardDecl, type CardRow, type ProjectCard } from './project-cards.ts';

/** The most rows of the projects list read for the desk. */
const READ = 200;

export type Cards = { cards: ProjectCard[]; more: number; list: string; name: string };

/** The record's cards, or `null` where it keeps no projects list or none has a live project. */
export async function readCards(base: string, lists: readonly { id: string; name: string }[], asked: Map<string, Promise<void>>): Promise<Cards | null> {
  const client = createClient({ base });
  await Promise.all(lists.filter((l) => REGISTERS[l.id] === undefined).map((l) => learn(client.schema, l.id, asked)));
  const decls = lists.flatMap((l) => (REGISTERS[l.id] ? [{ ...(REGISTERS[l.id] as unknown as CardDecl), id: l.id }] : []));
  const decl = projectsOf(decls);
  if (decl === null) return null;
  const out = await client.list({ register: decl.id, limit: READ });
  if (!out.ok) return null;
  const rows = (out.value.rows as unknown[]).filter(
    (r): r is CardRow => typeof r === 'object' && r !== null && typeof (r as CardRow).seq === 'number' && typeof (r as CardRow).fields === 'object',
  );
  const { cards, more } = cardsOf(decl, rows);
  return cards.length === 0 ? null : { cards, more, list: decl.id, name: lists.find((l) => l.id === decl.id)?.name ?? '' };
}
