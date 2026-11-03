/**
 * What a script may do beyond rows (add-ons phase 4): send its owner a notice (`ctx.notify`) and keep a little state of
 * its own (`ctx.store`). The model call (`ctx.ask`) is the host's, since the model and its allowance are Slash's.
 *
 * NO NEW TABLE. A notice is the `note` event every notice already is (`digest.ts` `noteEvent`), signed by the run as its
 * writes are, so the bell, the unread count and the digest read it with no change, and a day's count is read off those
 * events. The state is `pref` rows (migration 9) under a holder no person can be, `addon:<owner>`, the way Slash keeps
 * its own marks there, so it is local, never in a `.brain` file, and never one person's.
 *
 * WHOSE IS IT. An add-on's scripts share one count and one store, named by the pack that owns them; a script no pack owns
 * is its own owner, `script:<id>`. So two scripts of one add-on cannot send forty notices a day between them.
 *
 * NOTHING HERE IS CALLED FROM THE SANDBOX. The host reads (`noticesToday`, `storeOf`) while a run is going and queues what
 * the run asked; `finishScript` applies it with the run's writes, all or nothing, through `applyNotices` and `applyStored`,
 * which check every part again because the host is code the record does not control.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from './migrate.ts';
import { SCRIPT_NOTICES_PER_DAY, SCRIPT_STORE_BYTES } from './script.ts';

/** Who an add-on's count and store belong to: its pack, or the script itself when no pack owns it. */
export const scriptOwner = (run: { script: string; pack?: string | null | undefined }): string =>
  typeof run.pack === 'string' && run.pack !== '' ? run.pack : `script:${run.script}`;

/** The `pref` holder an owner's store is kept under. No person's id starts so, as no person's is `braindog:self`. */
export const storeHolder = (owner: string): string => `addon:${owner}`;

/** The longest key `ctx.store` takes, and the longest title and body of a notice. */
export const STORE_KEY_MOST = 128;
export const NOTICE_TITLE_MOST = 80;
export const NOTICE_BODY_MOST = 200;

const DAY_MS = 86_400_000;

/** A notice as a script asked for it, checked: its title and, when it said one, its body. */
export type Notice = { title: string; body?: string };

/** A notice a script asked for, or the refusal that names what is wrong with it. */
export function noticeOf(said: unknown): Result<Notice> {
  if (said === null || typeof said !== 'object' || Array.isArray(said))
    return no('VALUE_MALFORMED', 'ctx.notify takes { title, body }: a short title and, if you like, one line under it.', { at: 'notice' });
  const { title, body, ...rest } = said as Record<string, unknown>;
  const stray = Object.keys(rest)[0];
  if (stray !== undefined) return no('VALUE_MALFORMED', `ctx.notify takes title and body, and was handed ${stray}.`, { at: `notice.${stray}` });
  if (typeof title !== 'string' || title.trim() === '') return no('REQUIRED_MISSING', 'A notice needs a title, a few words of text.', { at: 'notice.title' });
  if (title.length > NOTICE_TITLE_MOST) return no('OUT_OF_BOUNDS', `A notice's title is at most ${NOTICE_TITLE_MOST} characters.`, { at: 'notice.title' });
  if (body !== undefined && body !== null && typeof body !== 'string') return no('VALUE_MALFORMED', "A notice's body is text.", { at: 'notice.body' });
  if (typeof body === 'string' && body.length > NOTICE_BODY_MOST) return no('OUT_OF_BOUNDS', `A notice's body is at most ${NOTICE_BODY_MOST} characters.`, { at: 'notice.body' });
  return ok({ title: title.trim(), ...(typeof body === 'string' && body.trim() !== '' ? { body: body.trim() } : {}) });
}

/** What the note of a notice says: its title, and its body after it. */
export const noticeSaid = (n: Notice): string => (n.body === undefined ? n.title : `${n.title}: ${n.body}`).slice(0, 280);

/** The scripts an owner's notices are signed by: every script its pack holds, or the one script. */
function scriptsOf(sql: Sql, owner: string): string[] {
  if (owner.startsWith('script:')) return [owner.slice('script:'.length)];
  return sql
    .all<{ id: string }>(
      "SELECT DISTINCT id FROM declaration WHERE kind = 'script' AND coalesce(pack_id, json_extract(body, '$.pack')) = ?",
      owner,
    )
    .map((r) => r.id.replace(/^script\./u, ''));
}

/** How many notices an owner's scripts sent in the last day: the `note` events their runs signed. */
export function noticesToday(sql: Sql, owner: string, nowMs: number): number {
  const scripts = scriptsOf(sql, owner);
  if (scripts.length === 0) return 0;
  const since = instant(nowMs - DAY_MS);
  return scripts.reduce(
    (n, script) => n + Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE kind = 'note' AND ts > ? AND actor LIKE ? ESCAPE '\\'", since, `script:${script.replace(/[\\%_]/gu, (c) => `\\${c}`)}@%`)?.n ?? 0),
    0,
  );
}

/** How many more notices an owner may send today. */
export const noticesLeft = (sql: Sql, owner: string, nowMs: number): number => Math.max(0, SCRIPT_NOTICES_PER_DAY - noticesToday(sql, owner, nowMs));

/**
 * The notices a run handed back, checked again and sent: each a `note` signed by the run and routed `active` by `tell`,
 * which holds it in quiet hours and lets one push an hour through. More than the day has left refuses them all, so a
 * host that counted wrong cannot send the twenty-first.
 */
export function applyNotices(
  sql: Sql,
  run: { script: string; pack?: string | null | undefined; actor: string },
  handed: unknown,
  nowMs: number,
  tell: ((said: { actor: string; say: string }) => void) | undefined,
): Result<number> {
  const list = handed === undefined || handed === null ? [] : handed;
  if (!Array.isArray(list)) return no('VALUE_MALFORMED', 'What it notified is not a list of notices.', { at: 'notices' });
  if (list.length === 0) return ok(0);
  if (tell === undefined) return no('NOT_IN_THIS_BUILD', 'This BrainDog sends no notices from a script.', { at: 'notices' });
  const left = noticesLeft(sql, scriptOwner(run), nowMs);
  if (list.length > left)
    return no('OUT_OF_BOUNDS', `It sent ${list.length} notices, and its add-on may send ${SCRIPT_NOTICES_PER_DAY} a day, with ${left} left today.`, { at: 'notices' });
  for (const [i, n] of list.entries()) {
    const one = noticeOf(n);
    if (!one.ok) {
      const r = 'refusal' in one ? one.refusal : { code: 'VALUE_MALFORMED', fix: 'it is not a notice.' };
      return no(r.code, `Notice ${i + 1}: ${r.fix}`, { at: 'notices' });
    }
    tell({ actor: run.actor, say: noticeSaid(one.value) });
  }
  return ok(list.length);
}

/** An owner's store, key by key, as it stands. */
export function storeOf(sql: Sql, owner: string): Record<string, unknown> {
  return Object.fromEntries(
    sql.all<{ key: string; value: string }>('SELECT key, value FROM pref WHERE person_id = ? ORDER BY key', storeHolder(owner)).map((r) => [r.key, JSON.parse(r.value) as unknown]),
  );
}

/** What an owner's store weighs: every key and value, as UTF-8. */
export const storeBytes = (store: Readonly<Record<string, unknown>>): number => {
  const enc = new TextEncoder();
  return Object.entries(store).reduce((n, [k, v]) => n + enc.encode(k).length + enc.encode(JSON.stringify(v)).length, 0);
};

/** A key `ctx.store` takes, or the sentence that says why not. */
export function storeKeyFault(key: unknown): string | null {
  if (typeof key !== 'string' || key === '') return 'A store key is text, at least one character.';
  if (key.length > STORE_KEY_MOST) return `A store key is at most ${STORE_KEY_MOST} characters.`;
  return null;
}

/** One change a run made to its store: a key and its new value, `null` taking the key away. */
export type Stored = { key: string; value: unknown };

/** What the store would hold after these changes, or the refusal: a bad key, or over `SCRIPT_STORE_BYTES` in all. */
export function storeAfter(before: Readonly<Record<string, unknown>>, changes: readonly Stored[]): Result<Record<string, unknown>> {
  const after: Record<string, unknown> = { ...before };
  for (const c of changes) {
    const fault = storeKeyFault(c.key);
    if (fault !== null) return no('VALUE_MALFORMED', fault, { at: 'store' });
    if (c.value === null || c.value === undefined) delete after[c.key];
    else after[c.key] = c.value;
  }
  const bytes = storeBytes(after);
  if (bytes > SCRIPT_STORE_BYTES)
    return no('OUT_OF_BOUNDS', `An add-on keeps at most ${SCRIPT_STORE_BYTES / 1024 / 1024} MB in its store, and this would be ${Math.ceil(bytes / 1024)} KB. Take keys away with ctx.store.set(key, null).`, { at: 'store' });
  return ok(after);
}

/** The store changes a run handed back, checked again and written in its savepoint. */
export function applyStored(sql: Sql, owner: string, handed: unknown, nowMs: number): Result<number> {
  const list = handed === undefined || handed === null ? [] : handed;
  if (!Array.isArray(list)) return no('VALUE_MALFORMED', 'What it stored is not a list of changes.', { at: 'stored' });
  if (list.length === 0) return ok(0);
  const changes: Stored[] = [];
  for (const c of list as unknown[]) {
    if (c === null || typeof c !== 'object' || Array.isArray(c) || !('key' in c)) return no('VALUE_MALFORMED', 'A store change is { key, value }.', { at: 'stored' });
    changes.push({ key: (c as { key: string }).key, value: (c as { value?: unknown }).value ?? null });
  }
  const before = storeOf(sql, owner);
  const after = storeAfter(before, changes);
  if (!after.ok) return after as Result<never>;
  const holder = storeHolder(owner);
  const at = instant(nowMs);
  for (const key of new Set(changes.map((c) => c.key))) {
    if (!Object.hasOwn(after.value, key)) sql.exec('DELETE FROM pref WHERE person_id = ? AND key = ?', holder, key);
    else
      sql.exec(
        `INSERT INTO pref (person_id, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (person_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        holder,
        key,
        JSON.stringify(after.value[key]),
        at,
      );
  }
  return ok(changes.length);
}

/** Every key an owner kept, gone: what removing an add-on with its data does (`uninstallPack {data: true}`). */
export function dropStore(sql: Sql, owner: string): number {
  const n = Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM pref WHERE person_id = ?', storeHolder(owner))?.n ?? 0);
  sql.exec('DELETE FROM pref WHERE person_id = ?', storeHolder(owner));
  return n;
}
