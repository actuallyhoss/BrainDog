/**
 * The kernel schema, migration 14: `push_sub`, where one person's phone or browser asked to be told.
 *
 * `loop/research-living-in-it.md` section 3.2 and brief W58-2. A Web Push subscription is an address a push service
 * minted for one browser on one device, and `51 §5` has the record drop it when that service answers 404 or 410, so it
 * is the record's to keep and not the Worker's. One row per person per endpoint: two people signed in on one shared
 * tablet are two rows, and each is taken away only by the person who made it.
 *
 * `id` IS WHAT A `notify.push` JOB NAMES, AND NEVER THE ENDPOINT. The outbox is in the `data` section and travels in
 * every `.brain` file, so an endpoint written into a payload would leave the record in the next export, which is
 * exactly what `local` below exists to prevent. The deliverer asks for the endpoints behind the ids under its lease.
 *
 * THE TWO KEYS ARE KEPT THOUGH A CONTENT-FREE PUSH READS NEITHER. `p256dh` and `auth` are what a push with a body is
 * encrypted to (RFC 8291); the first channel sends none (section 3.2, "the smallest channel"), and a subscription saved
 * without them would have to be asked for again from every phone on the day a body is sent.
 *
 * `local`, so no file carries it and the format stays 1. The person's erasure deletes it (`erase.ts`).
 */
export default `
CREATE TABLE IF NOT EXISTS push_sub (
  id TEXT PRIMARY KEY,                      -- a ULID, what a notify.push job names
  person_id TEXT NOT NULL,                  -- the person who subscribed, and the only one who may unsubscribe it
  endpoint TEXT NOT NULL,                   -- the push service's https address for one browser
  p256dh TEXT NOT NULL,                     -- base64url, the browser's P-256 public key
  auth TEXT NOT NULL,                       -- base64url, the 16-byte authentication secret
  created_at TEXT NOT NULL,
  used_at TEXT,                             -- the last push the service accepted; NULL until one is
  UNIQUE (person_id, endpoint)
);
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('push_sub', 'local');
`;
