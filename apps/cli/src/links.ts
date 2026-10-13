/**
 * The addresses the command prints for a person to open in the app.
 *
 * THE APP LIVES UNDER `/app/<slug>`, and a target's `base` is the origin alone (`target`, http.ts), because the API is
 * served from the origin. A link built from `base` landed on `<origin>/decide/<id>`, which is no page. The record is
 * in the target's `key`, `https://origin[/slug]`, so a link is built from the key and never from the base.
 */

import type { Target } from './http.ts';

/**
 * Where the person answers a filed question: `<origin>/app/<slug>/decide/<id>`, or null when there is no such address.
 *
 * THE SAME STRING THE AGENT DOOR HANDS AN AGENT (`decideAt`, packages/mcp/src/index.ts), so a question filed from the
 * command and one filed through the door send the person to one place. links.test.ts holds that line word for word.
 *
 * NO SLUG, NO LINK. A key that is an origin alone, a self-host reached by its port, names no record, and the door
 * answers without `decide` there too. A guessed address would say it named this question and land somewhere else.
 * An empty id is no question either. The caller says "Open Decide in the app" (`untilAccepted`).
 */
export function decideLink(to: Pick<Target, 'key'>, id: string): string | null {
  if (id === '') return null;
  let url: URL;
  try {
    url = new URL(to.key);
  } catch {
    return null;
  }
  /* ONE SEGMENT IS A SLUG. `hostKey` has already dropped the `/app` prefix and the trailing slash. */
  const path = url.pathname.replace(/^\/+|\/+$/g, '');
  if (path === '' || path.includes('/')) return null;
  let slug: string;
  try {
    /* The key's path is already percent-encoded by `URL`, and encoding it again would double every escape. */
    slug = decodeURIComponent(path);
  } catch {
    return null;
  }
  return `${url.origin}/app/${encodeURIComponent(slug)}/decide/${encodeURIComponent(id)}`;
}

/** The sentence a filing ends on: the link to the question, or where to find it when the host names no record. */
export function untilAccepted(to: Pick<Target, 'key'>, id: string): string {
  const link = decideLink(to, id);
  return link === null ? 'Nothing is installed until they accept it. Open Decide in the app.' : `Nothing is installed until they accept it: ${link}`;
}
