/**
 * The route rows for sealed files (`packages/record/src/methods/sealed.ts`): bytes the owner's own machines seal and only
 * they can open, kept beside the record where the host keeps large bytes.
 *
 * DATA, AND THE OWNER'S ALONE. The record holds each of the four to the owner himself, in his own session or with his own
 * key, as a personal list is held; no share, grant, link, child key, app or "See as" reaches them. None is an MCP tool.
 * `sealedPut` is the one `/api` body allowed past a mebibyte (`SEALED_BODY_MOST_BYTES` in `../index.ts`), since a part is
 * four mebibytes before base64.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'sealedPut', group: 'DATA', writes: true, what: 'Keep one part of a sealed file, at most 4 MB of base64, under its key. The owner alone.' },
  { name: 'sealedGet', group: 'DATA', writes: false, what: 'One part of a sealed file, in base64, as it was put. The owner alone.', takes: { key: 'text', part: 'integer' } },
  { name: 'sealedList', group: 'DATA', writes: false, what: 'The sealed files kept here, each with its parts, size, hash and whether it is whole. The owner alone.', takes: { prefix: 'text' } },
  { name: 'sealedDelete', group: 'DATA', writes: true, what: 'Delete a sealed file and every part of it. The owner alone.' },
];
