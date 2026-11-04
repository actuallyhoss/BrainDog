/**
 * `/admin` IS THE OPERATOR'S AND NOBODY ELSE'S: asked of `GET /account/ops/me` before anything draws, and anybody it
 * does not answer (a person who is not the operator, a self-host, no session) gets the app's own "not found", the
 * same as any address that names nothing.
 */
import { error, type LoadEvent } from '@sveltejs/kit';

export async function load({ fetch, parent }: Pick<LoadEvent, 'fetch' | 'parent'>): Promise<void> {
  /* A SELF-HOST HAS NO OPERATOR: not found without asking, and without a red line in the console. */
  if (((await parent()) as { host?: string }).host === 'self-host') error(404, 'Not found');
  const res = await fetch('/account/ops/me', { headers: { accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
  if (res === null || !res.ok) {
    /* AN ANSWER NOBODY READS IS A REQUEST STILL OUT, as Chromium counts it. */
    void res?.body?.cancel();
    error(404, 'Not found');
  }
}
