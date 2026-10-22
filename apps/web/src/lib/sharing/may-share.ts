/**
 * Whether somebody may share at all (sharing plan §3.1): an owner, or an Admin over the whole record, as the record's
 * `team` asks. Its own file, importing nothing, so a page that only draws the Share button (`ShareLazy.svelte`) does not
 * load the sheet's state and the kernel's sentences to decide whether to draw it.
 */

export const canShare = (me: { owner?: boolean; level?: string | null; lists?: readonly string[] | null } | undefined): boolean =>
  me !== undefined && (me.owner === true || (me.level === 'decide' && (me.lists ?? null) === null));

/**
 * Whether sharing is Cloud Plus's on this record, from what `/account/billing` said: the host takes payment, the record
 * is one the reader owns, and it is on Free or Cloud. Anything unknown is "no", so a host that did not answer, or a
 * record that is not listed, still opens the sheet and the record's own refusal speaks.
 */
export const needsPlus = (billing: { open: boolean; records: readonly { slug: string | null; plan: string }[] } | null, slug: string | null | undefined): boolean => {
  if (!billing?.open || !slug) return false;
  const plan = billing.records.find((r) => r.slug === slug)?.plan;
  return plan === 'free' || plan === 'cloud';
};
