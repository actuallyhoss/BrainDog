/**
 * A picture cut to a square and made small before it is sent: what the changer's crop decides, and the drawing.
 *
 * THE SQUARE IS THE FRAME'S. The picture is laid under a square frame `frame` pixels a side, at least large enough to
 * cover it (`cover`), and moved and zoomed under it; what the frame shows is drawn onto a canvas `PICTURE_SIDE` a side
 * and sent as WebP, or PNG where the browser cannot write WebP. Either keeps a logo's clear ground.
 *
 * NEVER BIGGER THAN THE DOOR TAKES. A square of 256 is tens of kilobytes; the store's two megabytes are never near.
 *
 * `view` IS PURE, so what a drag or a zoom does is worked out without a canvas.
 */

import { PICTURE_SIDE } from './picture.ts';

/** Where the picture lies under the frame: its zoom over the size that covers the frame, and its top-left corner. */
export type View = { zoom: number; x: number; y: number };

/** The most a picture may be zoomed past the size that covers the frame. */
export const ZOOM_MOST = 4;

/** The scale that makes a picture of `w` by `h` just cover a square `frame` a side. */
export const cover = (w: number, h: number, frame: number): number => frame / Math.max(1, Math.min(w, h));

/**
 * `view` held so the picture still covers the frame: zoom between 1 and `ZOOM_MOST`, and no edge of the picture inside
 * the frame's.
 */
export function held(v: View, w: number, h: number, frame: number): View {
  const zoom = Math.min(ZOOM_MOST, Math.max(1, Number.isFinite(v.zoom) ? v.zoom : 1));
  const scale = cover(w, h, frame) * zoom;
  const clamp = (at: number, size: number): number => Math.min(0, Math.max(frame - size * scale, Number.isFinite(at) ? at : 0));
  return { zoom, x: clamp(v.x, w), y: clamp(v.y, h) };
}

/** The picture centred and just covering the frame, where a crop starts. */
export const centred = (w: number, h: number, frame: number): View => {
  const scale = cover(w, h, frame);
  return held({ zoom: 1, x: (frame - w * scale) / 2, y: (frame - h * scale) / 2 }, w, h, frame);
};

/** `view` zoomed to `zoom` about the frame's centre, so what is in the middle stays there. */
export function zoomed(v: View, zoom: number, w: number, h: number, frame: number): View {
  const before = cover(w, h, frame) * v.zoom;
  const after = cover(w, h, frame) * Math.min(ZOOM_MOST, Math.max(1, zoom));
  const mid = frame / 2;
  return held({ zoom, x: mid - ((mid - v.x) / before) * after, y: mid - ((mid - v.y) / before) * after }, w, h, frame);
}

/**
 * A picture read from a chosen, dropped or pasted file, decoded once.
 *
 * OFF THE MAIN THREAD WHERE THE BROWSER CAN (`createImageBitmap`), which no page policy stands in the way of. The image
 * element under it is for a browser without one: it loads through a `blob:` address, which the app's own policy refuses,
 * so there it fails and the changer says the picture could not be read.
 */
export async function decoded(file: Blob): Promise<{ image: CanvasImageSource; w: number; h: number; drop: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return { image: bitmap, w: bitmap.width, h: bitmap.height, drop: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  const w = img.naturalWidth || 512;
  const h = img.naturalHeight || 512;
  return { image: img, w, h, drop: () => URL.revokeObjectURL(url) };
}

/** What the frame shows, as a square `side` a side: WebP where the browser writes it, else PNG. */
export async function squared(image: CanvasImageSource, w: number, h: number, v: View, frame: number, side: number = PICTURE_SIDE): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const k = side / frame;
  const scale = cover(w, h, frame) * v.zoom * k;
  ctx.drawImage(image, v.x * k, v.y * k, w * scale, h * scale);
  const as = (type: string, quality?: number): Promise<Blob | null> => new Promise((done) => canvas.toBlob(done, type, quality));
  /* A BROWSER THAT CANNOT WRITE WEBP WRITES PNG AND SAYS SO in the blob's type, which is the answer read here. */
  const webp = await as('image/webp', 0.86);
  if (webp && webp.type === 'image/webp') return webp;
  const png = await as('image/png');
  if (!png) throw new Error('No picture');
  return png;
}
