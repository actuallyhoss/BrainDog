/**
 * The Vault is the Keychain now. This address goes there and keeps its query: installed pack pages and stored alerts
 * still link `/vault`, and a link that was shared keeps working.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { at } from '$lib/at.ts';

export function load({ url }: Pick<LoadEvent, 'url'>): void {
  redirect(307, at(`/keychain${url.search}`, url.pathname));
}
