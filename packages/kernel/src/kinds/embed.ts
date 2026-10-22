/**
 * `embed`: one video, design or map from a player this record names, drawn in the page.
 *
 * WRITTEN OUT AND NEVER READ: one row, `{ cells: [address, title, shape] }`, the title and the shape left off when
 * there are none. The shape is `16:9` (the default), `4:3`, `1:1` or `9:16`. An embed reads no list, so it takes no
 * `source:`.
 *
 * ONLY THE PLAYERS IN `EMBED_PROVIDERS`, refused at install with each of them named. A page is drawn inside the app, so
 * an address from anywhere else would be a frame of somebody's choosing on a record's own screen. The host draws a
 * named player as a facade first and loads it only when it is pressed, and a Worker policy that names what may be
 * framed names exactly these players' origins.
 *
 * A COPY OF `EMBED_PROVIDERS` IN `packages/render/src/embed.ts`, which also rewrites each address into the player's
 * own, and nothing checks the two agree at build. The kernel does not import the renderer, for the reason `declare.ts`
 * gives of `BLOCK_KINDS`, so a player added is added in both.
 *
 * A LEAF: nothing of the kernel is imported at run time, for the reason `kinds/listed.ts` gives.
 */

import type { KindModule } from './index.ts';
import { KIND_KEYS } from './keys.ts';
import { authoredCells, invalid } from './listed.ts';

/**
 * The players an embed may draw, by the id and the name `packages/render/src/embed.ts` gives each.
 *
 * YOUTUBE by a watch page or a short link, played from `youtube-nocookie.com`; VIMEO by a video's number; LOOM by a
 * shared recording; FIGMA by a file, design or prototype link; GOOGLE MAPS by the embed address its Share menu gives,
 * which is already a player.
 */
export const EMBED_PROVIDERS: readonly { id: string; name: string }[] = [
  { id: 'youtube', name: 'YouTube' },
  { id: 'vimeo', name: 'Vimeo' },
  { id: 'loom', name: 'Loom' },
  { id: 'figma', name: 'Figma' },
  { id: 'google-maps', name: 'Google Maps' },
];

/** The shapes an embed is drawn in, wide first. */
export const EMBED_ASPECTS = ['16:9', '4:3', '1:1', '9:16'] as const;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/u;
/* A VIMEO VIDEO BY ITS NUMBER, AND WHATEVER FOLLOWS IT, as the renderer admits it: an unlisted video's link carries its
   key as the next part (`vimeo.com/<number>/<key>`). */
const VIMEO = /^\/\d+(?:\/[A-Za-z0-9]+)?(?:\/.*)?$/u;
/* A LOOM ID OF ANY LENGTH, as the renderer reads one: Loom publishes no length. */
const LOOM = /^\/share\/[A-Za-z0-9]+\/?$/u;
const FIGMA = /^\/(?:file|design|proto)\/[A-Za-z0-9]+(?:\/|$)/u;

/**
 * The id of the player an address is from, or `null` for one from none of them.
 *
 * THE RENDERER'S OWN TEST, `embedOf`, READ LINE FOR LINE, because an address this admits and the renderer does not
 * would install and then draw as a fault, and one the renderer admits and this does not would be refused for nothing.
 * An https address on the player's own host, compared whole and never by suffix, so `youtube.com.example.net` is
 * nobody's video, with no name, password or port in it.
 */
export function embedProvider(address: string): string | null {
  let u: URL;
  try {
    u = new URL(address.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.port !== '') return null;
  const host = u.hostname.toLowerCase();
  if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'm.youtube.com')
    return u.pathname === '/watch' && YOUTUBE_ID.test(u.searchParams.get('v') ?? '') ? 'youtube' : null;
  if (host === 'youtu.be') return YOUTUBE_ID.test(u.pathname.slice(1)) ? 'youtube' : null;
  if (host === 'vimeo.com' || host === 'www.vimeo.com') return VIMEO.test(u.pathname) ? 'vimeo' : null;
  if (host === 'www.loom.com' || host === 'loom.com') return LOOM.test(u.pathname) ? 'loom' : null;
  if (host === 'www.figma.com' || host === 'figma.com') return FIGMA.test(u.pathname) ? 'figma' : null;
  if ((host === 'www.google.com' || host === 'google.com') && u.pathname === '/maps/embed' && u.searchParams.has('pb')) return 'google-maps';
  return null;
}

/** The players named in a sentence: `YouTube, Vimeo, Loom, Figma or Google Maps`. */
const PLAYERS = `${EMBED_PROVIDERS.slice(0, -1)
  .map((p) => p.name)
  .join(', ')} or ${EMBED_PROVIDERS.at(-1)?.name ?? ''}`;

export const embed: KindModule = {
  keys: KIND_KEYS.embed,

  validate(block, ctx) {
    if (block.source !== undefined) return invalid('An embed is written out, one row of its address, title and shape, and reads no list. Take source: off.', 'source');
    const written = authoredCells(block);
    const said = 'An embed is one row written out, authored: [{ cells: [address, title, shape] }], the title and the shape left off when there are none.';
    /* AN EMBED WITH NO ROW INSTALLS AND IS REFUSED WHEN IT IS READ, as `kinds/listed.ts` says of a block that names
       neither a list nor rows: the install decides no key is required. */
    if (written === null) return ctx.stage === 'read' ? invalid(said, 'authored') : null;
    /* ONE ROW, because an embed is one player; the count of its cells is not checked, which a drawer degrades
       (`declare.ts`, `05 §2.1`). */
    if (written.length !== 1) return invalid(said, 'authored');
    const cells = written[0] ?? [];
    const address = cells[0];
    /* THE ADDRESS IS NOT REPEATED IN THE SENTENCE: a refusal is logged, and a link somebody pasted can carry a key. */
    if (typeof address !== 'string' || embedProvider(address) === null)
      return invalid(`An embed plays ${PLAYERS}, and its address is from none of them.`, 'authored', EMBED_PROVIDERS.map((p) => p.name));
    /* TRIMMED AS THE RENDERER'S `embedAspect` TRIMS IT, so ` 4:3` is refused by neither. */
    const shape = cells[2];
    const aspect = typeof shape === 'string' ? shape.trim() : shape;
    if (aspect !== undefined && aspect !== '' && !(EMBED_ASPECTS as readonly unknown[]).includes(aspect))
      return invalid(`An embed's shape is ${EMBED_ASPECTS.join(', ')}, and ${JSON.stringify(aspect)} is none of them.`, 'authored', EMBED_ASPECTS);
    return null;
  },

  /* NOTHING TO READ: the row is the author's, and it is handed back as written. The player is the host's to draw. */
  read: (_deps, _block, base) => base,
};
