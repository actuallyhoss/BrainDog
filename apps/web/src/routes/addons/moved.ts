/**
 * Where an old plugin address lands now. Plugins lived under `/packs`, then under `/addons` (until 3 Nov, when the owner
 * renamed add-ons to plugins); they live under `/plugins`, and what this record holds is Settings › Plugins. Every old
 * address keeps working: a link somebody shared, a Decide card filed before the move, a push, a bookmark.
 *
 * - `/packs`, and `/packs?tab=updates` or `?tab=installed`: Settings › Plugins. `?tab=from` keeps asking for the
 *   install-from-a-file part there.
 * - `/packs/browse`: the store, `/plugins`, keeping a search.
 * - `/packs/browse/<id>` and `/packs/<id>`: the plugin's one page, `/plugins/<id>`, keeping `?kind=`.
 * - `/packs/share`: `/plugins/share`, keeping its mode.
 *
 * PURE, so a test reads it without SvelteKit.
 */

/** Settings › Plugins, what this record holds. It was Settings › Add-ons, `/settings/addons`, which still opens it. */
export const INSTALLED_AT = '/settings/plugins';
/** The store. */
export const STORE_AT = '/plugins';

/** The address an old `/addons` address means now: `rest` is what followed `/addons/`, `search` its query with the `?`. */
export function pluginsFrom(rest: string, search: string): string {
  const parts = rest.split('/').filter((p) => p !== '');
  return `${STORE_AT}${parts.length > 0 ? `/${parts.join('/')}` : ''}${search}`;
}

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
