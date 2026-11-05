/**
 * What an `embed` decides, as functions both drawers call: which address may be drawn in a frame, where that frame
 * points, and how tall it stands.
 *
 * Kept out of the markup for the reason `path.ts` and `queue.ts` are: an answer here can be tested without a DOM, and
 * two drawers that each worked it out would be two answers.
 *
 * A ROW IS `url | title | aspect`, ONE OF THEM, AUTHORED. The title and the aspect may be left off. An embed is on the
 * `panel` primitive for `capture`'s reason: it is one bounded thing, not rows of anything.
 *
 * A FRAME IS A PAGE SOMEBODY ELSE WROTE, running inside this one, so the list of who may be framed is closed and
 * small. An address is admitted only when it is one of the shapes below, and the frame is pointed at the provider's
 * own embed address rather than at what was typed: a YouTube page is framed through `youtube-nocookie.com`, which
 * sets no cookie until the video is played. `EMBED_PROVIDERS` is copied into the kernel, which refuses any other
 * address at install, and the hosts' holding frame names exactly these origins in its `frame-src` and the page names none,
 * because a frame may be navigated to anything the page holding it may hold (`HOLD_FRAME_PATH` in `@braindog/host`).
 *
 * NOTHING IS FRAMED UNTIL A READER ASKS. Both drawers draw a facade (the title, the provider, a link to the original);
 * the Svelte drawer adds a Load button, and only a press puts the frame on the page. A page that loaded every embed
 * on open would tell five providers who is reading it before anybody chose to watch anything.
 */

/** One provider a page may frame: what it is called on the screen, and the origin its frame is served from. */
export type EmbedProvider = { id: string; name: string; origin: string };

/**
 * The providers, closed. The kernel keeps a copy for its install check, and nothing at build holds the two together,
 * so a change here is made there in the same change.
 */
export const EMBED_PROVIDERS: readonly EmbedProvider[] = [
  { id: 'youtube', name: 'YouTube', origin: 'https://www.youtube-nocookie.com' },
  { id: 'vimeo', name: 'Vimeo', origin: 'https://player.vimeo.com' },
  { id: 'loom', name: 'Loom', origin: 'https://www.loom.com' },
  { id: 'figma', name: 'Figma', origin: 'https://www.figma.com' },
  { id: 'google-maps', name: 'Google Maps', origin: 'https://www.google.com' },
];

/** How tall a frame stands against its width. The first is what a row that says nothing gets. */
export const EMBED_ASPECTS = ['16:9', '4:3', '1:1', '9:16'] as const;
export type EmbedAspect = (typeof EMBED_ASPECTS)[number];

/** The hosts' document a player stands inside (`HOLD_FRAME_PATH` in `@braindog/host/drawn-frame`), which a test holds equal. */
export const EMBED_HOLD_PATH = '/drawn-frame/hold';

/** The words the drawers write that no author did, here because this package cannot import the app's copy. */
export const EMBED_NONE = 'Nothing to show here.';
export const embedLoad = (provider: string): string => `Load from ${provider}`;
export const embedOpen = (provider: string): string => `Open on ${provider}`;

const provider = (id: string): EmbedProvider => EMBED_PROVIDERS.find((p) => p.id === id)!;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/u;
/* A VIMEO VIDEO BY ITS NUMBER, AND WHATEVER FOLLOWS IT, as the kernel's copy admits it. An unlisted video's link
   carries its key as the next part (`vimeo.com/<number>/<key>`), which its player takes as `h`; a part that is not
   letters and digits is left off, and the player says so itself if the video will not play without it. */
const VIMEO = /^\/(\d+)(?:\/([A-Za-z0-9]+))?(?:\/.*)?$/u;
/* A LOOM ID OF ANY LENGTH, as the kernel's copy reads one: Loom publishes no length, and a length guessed here would
   degrade on the page a link the record admitted at install. */
const LOOM = /^\/share\/([A-Za-z0-9]+)\/?$/u;
const FIGMA = /^\/(?:file|design|proto)\/[A-Za-z0-9]+(?:\/|$)/u;

/**
 * Where an address is framed from, and whose it is, or null when it is not one this package frames.
 *
 * AN HTTPS ADDRESS ON THE PROVIDER'S OWN HOST, WITH NO NAME, PASSWORD OR PORT IN IT. The host is compared whole, never
 * by suffix, so `youtube.com.example.net` is nobody's video. What comes back is built here from the id alone, except
 * a Figma file, which Figma's embed takes whole and encoded, and a Google map, which is already an embed address.
 */
export function embedOf(url: string): { provider: EmbedProvider; src: string } | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.port !== '') return null;
  const host = u.hostname.toLowerCase();

  if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com') {
    const id = u.pathname === '/watch' ? (u.searchParams.get('v') ?? '') : '';
    return YOUTUBE_ID.test(id) ? { provider: provider('youtube'), src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1);
    return YOUTUBE_ID.test(id) ? { provider: provider('youtube'), src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === 'vimeo.com' || host === 'www.vimeo.com') {
    const m = VIMEO.exec(u.pathname);
    return m ? { provider: provider('vimeo'), src: `https://player.vimeo.com/video/${m[1]!}${m[2] ? `?h=${m[2]}` : ''}` } : null;
  }
  if (host === 'www.loom.com' || host === 'loom.com') {
    const m = LOOM.exec(u.pathname);
    return m ? { provider: provider('loom'), src: `https://www.loom.com/embed/${m[1]!}` } : null;
  }
  if (host === 'www.figma.com' || host === 'figma.com') {
    return FIGMA.test(u.pathname)
      ? { provider: provider('figma'), src: `https://www.figma.com/embed?embed_host=braindog&url=${encodeURIComponent(u.href)}` }
      : null;
  }
  /* WITH OR WITHOUT `www.`, as the kernel's copy admits it, and framed at `www.google.com` either way, the one origin a
     host's `frame-src` names for it. */
  if ((host === 'www.google.com' || host === 'google.com') && u.pathname === '/maps/embed' && u.searchParams.has('pb'))
    return { provider: provider('google-maps'), src: `https://www.google.com/maps/embed${u.search}` };
  return null;
}

/** The aspect a cell names, or null for a word that is not one. An empty cell is the first aspect. */
export function embedAspect(cell: string): EmbedAspect | null {
  const t = cell.trim();
  if (t === '') return EMBED_ASPECTS[0];
  return (EMBED_ASPECTS as readonly string[]).includes(t) ? (t as EmbedAspect) : null;
}

/**
 * What is wrong with an embed's row, in words, or null when nothing is.
 *
 * The parser degrades the block with this, because an address nobody frames would otherwise be a facade with no Load
 * and no reason given, and an aspect it does not know would be drawn as another one. A block with no row is not a
 * fault here: it is an embed with nothing in it yet, and says so.
 */
export function embedFault(rows: readonly (readonly string[])[]): string | null {
  for (const cells of rows) {
    const url = (cells[0] ?? '').trim();
    if (url === '') return 'no address to show';
    if (!embedOf(url)) return `an address "${url}" that is not a YouTube, Vimeo, Loom, Figma or Google Maps link`;
    const aspect = cells[2] ?? '';
    if (embedAspect(aspect) === null) return `an aspect "${aspect.trim()}" where ${EMBED_ASPECTS.join(', ')} goes`;
  }
  return null;
}

/** An embed ready to draw: where the frame points, whose it is, the original address, its title and its aspect. */
export type EmbedPlan = { src: string; provider: EmbedProvider; url: string; title: string; aspect: EmbedAspect };

/**
 * The first row as an embed, or null when it cannot be one.
 *
 * Lenient where `embedFault` is strict, for the reason `pathPlan` is: `Block` is a public type a host can build by
 * hand, so an aspect this does not know is read as the first one and an address nobody frames draws the empty line.
 */
export function embedPlan(rows: readonly { cells: readonly string[] }[]): EmbedPlan | null {
  const cells = rows[0]?.cells;
  if (!cells) return null;
  const url = (cells[0] ?? '').trim();
  const framed = embedOf(url);
  if (!framed) return null;
  return { ...framed, url, title: (cells[1] ?? '').trim(), aspect: embedAspect(cells[2] ?? '') ?? EMBED_ASPECTS[0] };
}
