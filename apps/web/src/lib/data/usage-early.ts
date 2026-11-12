/**
 * What Usage's lower tiles read, asked as the page opens and taken by each tile when it mounts.
 *
 * WHY. The tiles for Slash and for attached files each read once the month had drawn, and the month drew after its own
 * reads: round trips one after another for reads that do not wait on each other, so the page settled most of a second
 * after its month (measured 12 Nov: the month at 1.5 s, these at 2.2 s). The shell already says who is reading and
 * where, which is all the page waited to learn before asking them.
 *
 * HELD ONCE AND ONLY FRESH (`early-asks.ts`): a tile that mounts later than that, or again, reads for itself as before,
 * and so does one whose read ahead failed. Asked only where the page will draw the tile.
 */

import { createClient, type SlashAsked, type SlashStatus } from '@braindog/client';

import { readRoom, type Room } from '../attach/attached.ts';
import { LEDGER_FETCHED } from '../ui/slash-asks.ts';
import { askEarly, takeEarly } from './early-asks.ts';

/** Slash's month as its tile reads it: the status and the ledger's lines, or `null` when either was refused. */
export type SlashRead = { status: SlashStatus; asks: SlashAsked[] } | null;

const slashKey = (base: string): string => `usage slash ${base}`;
const roomKey = (base: string): string => `usage room ${base}`;

/** Slash's status and its ledger for the tile, read together. */
export async function readSlashUsage(base: string): Promise<SlashRead> {
  const client = createClient({ base });
  const [status, asks] = await Promise.all([client.slashStatus(), client.slashAsks(LEDGER_FETCHED)]);
  return status.ok && asks.ok ? { status: status.value, asks: asks.value.asks } : null;
}

/** Ask ahead what the page at `base` will draw under its month. Each answer is wrapped, so one that says nothing is still an answer. */
export function askUsageEarly(base: string, will: { slash: boolean; room: boolean }): void {
  if (will.slash) askEarly(slashKey(base), async () => ({ got: await readSlashUsage(base) }));
  if (will.room) askEarly(roomKey(base), async () => ({ got: await readRoom(base) }));
}

/** Slash's month, from the ask ahead where one is held and fresh, else read now. */
export async function slashUsageOf(base: string): Promise<SlashRead> {
  const early = await (takeEarly<{ got: SlashRead }>(slashKey(base)) ?? null);
  return early ? early.got : readSlashUsage(base);
}

/** The room for files, from the ask ahead where one is held and fresh, else read now. */
export async function roomOf(base: string): Promise<Room | null> {
  const early = await (takeEarly<{ got: Room | null }>(roomKey(base)) ?? null);
  return early ? early.got : readRoom(base);
}
