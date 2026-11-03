/**
 * `/admin` IS THE OPERATOR'S AND NOBODY ELSE'S: asked of `GET /account/ops/me` before anything draws, and anybody it
 * does not answer (a person who is not the operator, a self-host, no session) gets the app's own "not found", the
 * same as any address that names nothing.
 */
import { error, type LoadEvent } from '@sveltejs/kit';

export async function load({ fetch }: Pick<LoadEvent, 'fetch'>): Promise<void> {
  const res = await fetch('/account/ops/me', { headers: { accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
  if (res === null || !res.ok) error(404, 'Not found');
}
