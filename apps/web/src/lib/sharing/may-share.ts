/**
 * Whether somebody may share at all (sharing plan §3.1): an owner, or an Admin over the whole record, as the record's
 * `team` asks. Its own file, importing nothing, so a page that only draws the Share button (`ShareLazy.svelte`) does not
 * load the sheet's state and the kernel's sentences to decide whether to draw it.
 */

export const canShare = (me: { owner?: boolean; level?: string | null; lists?: readonly string[] | null } | undefined): boolean =>
  me !== undefined && (me.owner === true || (me.level === 'decide' && (me.lists ?? null) === null));
