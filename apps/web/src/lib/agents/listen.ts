/**
 * WHAT THE CONNECT SHEET'S LIVE ROW ASKS every two seconds (`ConnectSheet.svelte`, `listen`): the newest runs, and the
 * keys once a key was made in it. A read that fails is no answer, and the row keeps what it last said.
 *
 * ONE ASK FOR EVERY SCREEN THAT OPENS THE SHEET. Settings, Agents built it in place, and Today's first step ("Connect
 * Claude Code", `home/WantMore.svelte`) opens the same sheet, so the two cannot ask the record different things.
 *
 * PURE OVER THE CLIENT IT IS HANDED: the screen keeps its own client (Agents.svelte's `clientOf`), and a test hands a
 * fake one, so nothing here imports the client itself.
 */
import type { createClient } from '@braindog/client';
import type { TokenRow } from '../record/device.ts';

/** The two reads the live row needs, as the record's client answers them. */
export type ListenClient = Pick<ReturnType<typeof createClient>, 'list' | 'listTokens'>;

/** What one ask answers: the newest runs as the record listed them, and the keys when they were asked for. */
export type Listened = { rows: readonly unknown[]; keys: readonly TokenRow[] };

/** How many of the newest runs one ask reads: the agent that just called is among the first few. */
export const LISTEN_RUNS = 20;

/** The `listen` the sheet is handed, over `client`. `null` when the record could not answer the runs. */
export const listenFor =
  (client: ListenClient) =>
  async (keys: boolean): Promise<Listened | null> => {
    const runs = await client.list({ register: 'session', limit: LISTEN_RUNS, order: [{ field: 'last_seen', dir: 'desc' }] });
    if (!runs.ok) return null;
    const tokens = keys ? await client.listTokens() : null;
    return { rows: runs.value.rows, keys: tokens?.ok ? (tokens.value as TokenRow[]) : [] };
  };
