/**
 * The `event.kind` vocabulary, closed. `30-BLUEPRINT` §2.
 *
 * `20-COLLABORATION` §8 asks for this "in one place" and cites Retool's ~120 event types as the bar
 * — the number at which a history stops being readable, because nobody can hold the vocabulary in
 * their head and every screen that renders one has to special-case a list it cannot enumerate.
 * Forty is a list a person can learn.
 *
 * A CLOSED LIST IS A SECURITY ARGUMENT AND NOT A TIDINESS ONE. `30 §2`: a list enforced only by a
 * validator is a list one code path forgets. The `CHECK` in migration 0001 is the enforcement — the
 * *database* refuses a forty-first kind — and this array is what the code compares against, so the
 * two must say the same thing. `tools/gates/event-kinds.mjs` is what makes "must" true: it reads
 * this, the migration's `CHECK`, `30 §1`'s `CHECK`, `30 §2`'s table and the word *Forty* in `30 §2`'s
 * sentence, and is red when any two of the five disagree. `52 §5.2` singles this list out as "the
 * one large enough to have drifted three times".
 *
 * GROUPED AS `30 §2` GROUPS IT, and the counts in its own sentence are the group sizes: 10 row · 6
 * governance · 5 declaration · 5 credential · 5 ingest · 4 access · 5 lifecycle. Keeping the shape
 * is not decoration — it is how somebody adding a kind sees which group it belongs to, and therefore
 * which of the seven counts they have just changed.
 *
 * TWO STRINGS THAT LOOK LIKE KINDS AND ARE NOT. `access.changed` is `access.grant`/`access.revoke`
 * with the levels in `from_v`/`to_v` and the reason in `note`; `blocker` is an `export` event
 * carrying `note: 'failed: <reason>'` plus a suggestion to re-run. And two more: a KEK re-wrap of
 * `vault_key` is a `grant.rotate` row with `target_kind = 'vault_key'`, and a write to a `tags` list
 * is `tag`/`untag`, one row per element. There is no forty-first kind.
 */

/** The ten a row earns. `note` is the one a person or an agent writes on purpose. */
const ROW = ['create', 'edit', 'state', 'link', 'tag', 'untag', 'delete', 'restore', 'purge', 'note'] as const;

/** The six the decision gate writes, `18 §2` and `24 §4`. */
const GOVERNANCE = ['decide', 'supersede', 'suggest', 'resolve', 'predict', 'score'] as const;

/** The five a declaration's life earns, `42 §2`. */
const DECLARATION = ['install', 'uninstall', 'upgrade', 'declare', 'retire'] as const;

/** The five a credential earns, `12 §6` — and `grant.read` is the one that makes a vault auditable. */
const CREDENTIAL = ['grant.add', 'grant.read', 'grant.rotate', 'grant.revoke', 'grant.bind'] as const;

/** The five an arrival earns, `07 §3`. */
const INGEST = ['arrive', 'match', 'extract', 'propose', 'pull'] as const;

/** The four sharing earns, `20 §8`. */
const ACCESS = ['access.grant', 'access.revoke', 'share.open', 'share.close'] as const;

/** The five the record itself earns, `03 §5` and `53 §5`. */
const LIFECYCLE = ['export', 'import', 'erase', 'migrate', 'restore.pitr'] as const;

/**
 * Forty, in `30 §2`'s order.
 *
 * ORDER IS NOT ASSERTED BY THE GATE and is kept anyway: a diff that moves a kind between groups is a
 * diff that changes what the kind MEANS, and a reviewer should have to look at it.
 */
export const EVENT_KINDS = [...ROW, ...GOVERNANCE, ...DECLARATION, ...CREDENTIAL, ...INGEST, ...ACCESS, ...LIFECYCLE] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

/** Whether a string is one. For a reader deciding how to draw a row it has never seen. */
export const isEventKind = (kind: string): kind is EventKind => (EVENT_KINDS as readonly string[]).includes(kind);
