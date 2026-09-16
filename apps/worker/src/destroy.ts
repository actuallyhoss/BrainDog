/**
 * Deleting a hosted record (`02 §9`, `51 §5.13`): the host's half of `deleteRecord`.
 *
 * THE RECORD CHECKED EVERYTHING BEFORE THIS RUNS: an owner, a recent sign-in, the name typed exactly. What is left is
 * the platform's, in `51 §5.13`'s order: the alarm, then every byte the object holds, then the Directory's names for it,
 * so nothing resolves to the empty object afterwards.
 *
 * THE ALARM FIRST, AND BY NAME. `deleteAll()` clears it too at the compatibility date this Worker runs on, and the
 * explicit call is what keeps that true if the date is ever moved back (`alarm.test.ts` checks the date).
 *
 * THE DIRECTORY LAST, AND ITS REFUSAL IS THROWN. A record whose bytes are gone and whose name still resolves is a
 * name that opens an empty record, and saying "deleted" over that would be the record agreeing with itself.
 */

/** The two storage methods deletion needs, so a test can hold the order without a Durable Object. */
export type Wipe = { deleteAlarm(): Promise<void>; deleteAll(): Promise<void> };

/** The Directory's `close`: `null` once every name the record had is released, a refusal otherwise. */
export type Close = (record: string) => Promise<{ code: string; fix: string } | null>;

/** What a deleted record answers from then on, on every door it has. */
export const DELETED = { code: 'RECORD_UNAVAILABLE', fix: 'This record was deleted.', at: 'record' } as const;

export async function destroyRecord(storage: Wipe, close: Close, record: string | null): Promise<void> {
  await storage.deleteAlarm();
  await storage.deleteAll();
  if (record === null) return;
  const refused = await close(record);
  if (refused) throw new Error(`The record's data was deleted, and its name was not released: ${refused.fix}`);
}
