/**
 * Which record a request is for.
 *
 * ITS OWN FILE, and free of `cloudflare:`, because the slug it returns is the argument to
 * `idFromName` — and that string IS the tenant boundary. A path that resolves to the wrong slug is
 * one customer reading another's record, which is not a thing to leave untested because the file it
 * would otherwise live in cannot be loaded outside workerd.
 */

/**
 * Which record, and which method: `/r/the-studio/api/list` is one object and one call.
 *
 * IT IS A FUNCTION AND NOT FOUR LINES IN A HANDLER because the slug it returns is the argument to
 * `idFromName`, and that string IS the tenant boundary. A path that resolves to the wrong slug is
 * one customer reading another's record, and it is not the kind of thing to leave untested because
 * the file it lives in imports `cloudflare:workers`.
 *
 * The grammar is `31-STACK`'s slug: lower-case, digits and hyphens, no leading or trailing hyphen.
 * Anything else is no record at all rather than a name passed through to the platform — `..`,
 * `%2e%2e`, an empty segment and a slug with a slash in it all arrive here as strings.
 */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type Routed = { slug: string; rest: string };

export function recordPath(pathname: string): Routed | null {
  const [, prefix, slug, ...rest] = pathname.split('/');
  if (prefix !== 'r' || !slug || !SLUG.test(slug)) return null;
  /* The remainder is rebuilt with a leading slash, so a request to `/r/x` and one to `/r/x/` both
     become `/` rather than one becoming the empty string — which the URL parser reads as the path
     it was given rather than as the root. */
  return { slug, rest: `/${rest.join('/')}` };
}
