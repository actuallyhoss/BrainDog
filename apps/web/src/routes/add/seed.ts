/**
 * What the palette opens with on `/add` (E45 of the 24 October scope): the words a phone shared, or none.
 *
 * THE HOME SCREEN ICON'S "Ask" AND A SHARE FROM ANOTHER APP BOTH LAND HERE (`static/manifest.webmanifest`, `shortcuts`
 * and `share_target`). A share hands `title`, `text` and `url`; each is kept once, in that order, so a link shared with
 * its page's name reads "Name https://...". Cut at `SEED_MOST`, since a shared page can carry a whole article.
 */

export const SEED_MOST = 500;

export function sharedSeed(params: URLSearchParams): string {
  const parts: string[] = [];
  for (const key of ['title', 'text', 'url']) {
    const v = (params.get(key) ?? '').replace(/\s+/gu, ' ').trim();
    if (v !== '' && !parts.some((p) => p.includes(v))) parts.push(v);
  }
  return parts.join(' ').slice(0, SEED_MOST);
}
