/**
 * THE PICTURES DRAWN WIDGETS LEFT ON THIS DEVICE (widgets plan §8): what each component looked like when it last ran,
 * at a size and in light or dark, so a board draws it at once, inert, and the component comes alive after. Kept in this
 * browser only and never sent anywhere; a component whose code changed has a new key, so an old picture is never shown
 * for new code. Every read and write is guarded, so a browser that keeps nothing draws the component without a picture.
 */

/** How many pictures are kept, and the most one may weigh, in characters. */
export const PICTURES_MOST = 24;
export const PICTURE_KEPT_MOST = 96 * 1024;

const PREFIX = 'bd.drawn.pic.';
const INDEX = 'bd.drawn.pics';

/** A short, stable hash of the code, so a picture belongs to the code that drew it. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** The key a picture is kept under: the code, the frame's size (or the page), and light or dark. */
export const pictureKey = (code: string, size: string | null, mode: 'light' | 'dark'): string => `${hash(code)}.${size ?? 'page'}.${mode}`;

const store = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** The picture kept under a key, with the height it stood at, or `null`. */
export function keptPicture(key: string): { picture: string; height: number } | null {
  try {
    const raw = store()?.getItem(PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw) as { p?: unknown; h?: unknown };
    return typeof v.p === 'string' && typeof v.h === 'number' ? { picture: v.p, height: v.h } : null;
  } catch {
    return null;
  }
}

/** Keeps a picture under a key, the oldest let go past `PICTURES_MOST`. One too big is not kept. */
export function keepPicture(key: string, picture: string, height: number): void {
  if (picture.length > PICTURE_KEPT_MOST) return;
  const s = store();
  if (!s) return;
  try {
    const index = ((): string[] => {
      try {
        const v = JSON.parse(s.getItem(INDEX) ?? '[]') as unknown;
        return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
      } catch {
        return [];
      }
    })().filter((k) => k !== key);
    index.push(key);
    while (index.length > PICTURES_MOST) s.removeItem(PREFIX + index.shift()!);
    s.setItem(PREFIX + key, JSON.stringify({ p: picture, h: height }));
    s.setItem(INDEX, JSON.stringify(index));
  } catch {
    /* A full or blocked store keeps nothing; the component still draws alive. */
  }
}
