/**
 * The list's `hand:`, read from the declaration a screen holds (`hand.ts` re-exports it). Its own file so a page that
 * only asks whether a list hands its rows to somebody does not carry the hand sheet's reads and writes.
 */

import { handOf, type Hand } from '@braindog/declare/hand';

import type { RegisterDecl } from './schema.ts';

/** The list's `hand:`, read from the declaration a screen holds. `RegisterDecl` keeps every key the record sent. */
export const handFor = (decl: RegisterDecl | undefined): Hand | null => handOf(decl as unknown as Record<string, unknown> | undefined);
