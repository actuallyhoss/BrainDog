/**
 * Where an old add-on address lands now. Add-ons lived under `/packs`; they live under `/addons`, and what this record
 * holds is Settings › Add-ons. Every old address keeps working: a link somebody shared, a Decide card filed before the
 * move, a bookmark.
 *
 * - `/packs`, and `/packs?tab=updates` or `?tab=installed`: Settings › Add-ons. `?tab=from` keeps asking for the
 *   install-from-a-file part there.
 * - `/packs/browse`: the store, `/addons`, keeping a search.
 * - `/packs/browse/<id>` and `/packs/<id>`: the add-on's one page, `/addons/<id>`, keeping `?kind=`.
 * - `/packs/share`: `/addons/share`, keeping its mode.
 *
 * PURE, so a test reads it without SvelteKit.
 */

/** Settings › Add-ons, what this record holds. */
export const INSTALLED_AT = '/settings/addons';
/** The store. */
export const STORE_AT = '/addons';

/** The address an old `/packs` address means now: `rest` is what followed `/packs/`, `search` its query with the `?`. */
export function movedFrom(rest: string, search: string): string {
  const parts = rest.split('/').filter((p) => p !== '');
  const query = new URLSearchParams(search);
  if (parts.length === 0) {
    const tab = query.get('tab');
    query.delete('tab');
    if (tab === 'from') query.set('from', '1');
    const left = query.toString();
    return `${INSTALLED_AT}${left ? `?${left}` : ''}`;
  }
  const [head, next] = parts;
  if (head === 'browse') return next === undefined ? `${STORE_AT}${search}` : `${STORE_AT}/${encodeURIComponent(decodeURIComponent(next))}${search}`;
  if (head === 'share') return `${STORE_AT}/share${search}`;
  return `${STORE_AT}/${encodeURIComponent(decodeURIComponent(head!))}${search}`;
}
