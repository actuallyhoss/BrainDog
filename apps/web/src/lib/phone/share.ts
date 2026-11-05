/**
 * A share from another app on the phone, with a photo in it: the service worker's half, which takes the share, and the
 * page's half, which reads the photo back and sends it to the record.
 *
 * WHY THE WORKER. A photo is a file, and a share that carries files arrives as a POST (`share_target` in
 * `static/manifest.webmanifest`). The app has no server to take a POST at `/add`, so the worker answers it: the words go
 * on as the address `/add` always read (`routes/add/seed.ts`), and the photos wait in their own small cache, `SHARED`,
 * until the page has taken them. Nothing is sent anywhere by the worker.
 *
 * THE PHOTO IS SENT ONLY WHEN SOMETHING IS ADDED WITH IT. The palette opens with the words and the photo beside them,
 * and the photo goes into the first file field of the list the line is added to (a receipt's picture, say). A list with
 * no file field adds the line and says the photo was not kept with it. Dropping the share deletes the cache.
 *
 * A PHONE PHOTO IS MADE SMALLER FIRST. The record keeps files of at most 2 MB (`FILE_MOST`), and a camera's photo is
 * often twice that, so a picture over the limit is drawn again at 2048 pixels on its long side as a JPEG.
 *
 * Android only, today: Safari on the iPhone has no share target for web apps, so an iPhone shares into BrainDog by
 * copying and pasting into Tell or the palette. That is platform knowledge, not measured on a phone here.
 *
 * PLAIN NODE CAN LOAD THIS FILE, as `offline.ts` can: every browser global is read inside a function.
 */

/** The cache the shared photos wait in until the page takes them. */
export const SHARED = 'braindog-share';

/** The most photos one share keeps. */
export const PHOTOS_MOST = 4;

/** The most bytes a photo may be when it arrives; it is made smaller before it is sent. */
const ARRIVES_MOST = 40 * 1024 * 1024;

/** The record's own ceiling on one file (`apps/worker/src/files.ts` `FILE_MOST`). */
export const FILE_MOST = 2_097_152;

/**
 * THE PICTURES A SHARE MAY LEAVE, by the type the form says, and no other. THE WORKER ANSWERS `~shared/<i>` ITSELF, on this
 * origin and under no host's headers, and any web page can send a browser here with a form that POSTs to `/add`: a share
 * target has no way to tell an app on the phone from a stranger's page. With `image/*` taken on its word, a form naming
 * `image/svg+xml` left a document that ran its script as this origin the moment `~shared/0` was opened (sec-web, 5 Nov:
 * `/api/boot` read from inside it). SVG is a script, and the record refuses one for that reason (`12 §8`).
 */
const SHAREABLE: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/heic', 'image/heif']);

/**
 * THE HEADERS EVERY PHOTO IS ANSWERED WITH, as the file door answers a file (`12 §8`): nothing it holds runs, however it was
 * typed or opened, including a photo kept before the list above. `sandbox` gives a page opened from it an origin that
 * holds nothing; an `<img>` is drawn all the same.
 */
export const SHARED_POLICY = "default-src 'none'; sandbox";

/** A type as kept: lower case, with nothing after the `;`. */
const typeOf = (raw: string): string => (raw.split(';')[0] ?? '').trim().toLowerCase();

/** Where photo `i` of the share waits, under the worker's scope. */
export const photoAt = (scope: string, i: number): string => new URL(`~shared/${i}`, scope).href;

/** Whether a request is a share arriving: a POST to `/add` under the scope. */
export function isShare(url: string, method: string, scope: string): boolean {
  if (method !== 'POST') return false;
  const u = new URL(url);
  const root = new URL(scope);
  return u.origin === root.origin && u.pathname === `${root.pathname}add`;
}

/** As much of a form's entry as is read here. */
type Part = string | { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };

/**
 * The worker's answer to a share: keep its photos, then open `/add` with its words, the way a share without a photo
 * always opened it. A share that cannot be read still opens `/add`, with nothing.
 */
export async function takeShare(req: Request, scope: string, box: CacheStorage): Promise<Response> {
  const to = new URL('add', scope);
  try {
    const form = await req.formData();
    for (const key of ['title', 'text', 'url']) {
      const v = form.get(key);
      if (typeof v === 'string' && v.trim() !== '') to.searchParams.set(key, v);
    }
    const photos = (form.getAll('photo') as Part[]).filter(
      (p): p is Exclude<Part, string> => typeof p !== 'string' && SHAREABLE.has(typeOf(p.type)) && p.size > 0 && p.size <= ARRIVES_MOST,
    );
    await box.delete(SHARED);
    if (photos.length > 0) {
      const held = await box.open(SHARED);
      const kept = photos.slice(0, PHOTOS_MOST);
      await Promise.all(
        kept.map(async (p, i) =>
          held.put(photoAt(scope, i), new Response(await p.arrayBuffer(), { headers: { 'content-type': typeOf(p.type), 'x-name': encodeURIComponent(p.name || 'Photo') } })),
        ),
      );
      to.searchParams.set('photos', String(kept.length));
    }
  } catch {
    /* A SHARE THAT CANNOT BE READ OPENS THE PALETTE EMPTY, which is better than an error page from another app. */
  }
  return Response.redirect(to.href, 303);
}

/** Whether a request is the page asking for a photo the share left: a GET of `~shared/<i>` under the scope. */
export function isSharedPhoto(url: string, method: string, scope: string): boolean {
  if (method !== 'GET') return false;
  const u = new URL(url);
  const root = new URL(scope);
  return u.origin === root.origin && /^~shared\/\d$/u.test(u.pathname.slice(root.pathname.length));
}

/** The photo the share left at that address, or a 404 once it has gone. */
export async function sharedPhoto(url: string, box: CacheStorage): Promise<Response> {
  const held = await (await box.open(SHARED)).match(url, { ignoreSearch: true });
  if (!held) return new Response(null, { status: 404 });
  const type = typeOf(held.headers.get('content-type') ?? '');
  const headers = new Headers(held.headers);
  headers.set('content-type', SHAREABLE.has(type) ? type : 'application/octet-stream');
  headers.set('content-security-policy', SHARED_POLICY);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('cache-control', 'no-store');
  return new Response(await held.blob(), { status: 200, headers });
}

/* ─── the page's half ─── */

/** One photo of the share, as the page holds it. */
export type Photo = { blob: Blob; name: string };

/** The photos a share left, oldest first; none when there are none or the cache cannot be read. */
export async function sharedPhotos(scope: string, count: number): Promise<Photo[]> {
  if (typeof caches === 'undefined' || count <= 0) return [];
  try {
    const held = await caches.open(SHARED);
    const out: Photo[] = [];
    for (let i = 0; i < Math.min(count, PHOTOS_MOST); i++) {
      const res = await held.match(photoAt(scope, i));
      if (res) out.push({ blob: await res.blob(), name: decodeURIComponent(res.headers.get('x-name') ?? 'Photo') });
    }
    return out;
  } catch {
    return [];
  }
}

/** Let the share go: its photos leave the phone's cache. */
export async function dropShared(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await caches.delete(SHARED).catch(() => false);
}

/**
 * A photo the record will take: as it is when it is small enough, else drawn again at most 2048 pixels on its long side
 * as a JPEG. `null` when it is too big and this browser cannot draw it.
 */
export async function fitted(photo: Photo): Promise<Photo | null> {
  if (photo.blob.size <= FILE_MOST) return photo;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  try {
    const bitmap = await createImageBitmap(photo.blob);
    for (const long of [2048, 1600, 1200]) {
      const k = Math.min(1, long / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * k);
      canvas.height = Math.round(bitmap.height * k);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.85));
      if (blob && blob.size <= FILE_MOST) return { blob, name: photo.name.replace(/\.[A-Za-z0-9]+$/u, '') + '.jpg' };
    }
    return null;
  } catch {
    return null;
  }
}

/** A file as a row holds it: `{ sha256, mime, bytes, name }`, the record's answer to `PUT /api/files`. */
export type Sent = { sha256: string; mime: string; bytes: number; name: string };

/** Send one photo to the record's files, as a file field does; `null` when it could not be sent. */
export async function sendPhoto(base: string, photo: Photo): Promise<Sent | null> {
  const fit = await fitted(photo);
  if (fit === null) return null;
  try {
    const res = await fetch(`${base}/api/files`, {
      method: 'PUT',
      headers: { 'content-type': fit.blob.type || 'application/octet-stream', accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: fit.blob,
    });
    const said = (await res.json().catch(() => null)) as { sha256?: unknown; mime?: unknown; bytes?: unknown } | null;
    if (!res.ok || typeof said?.sha256 !== 'string' || typeof said.mime !== 'string' || typeof said.bytes !== 'number') return null;
    return { sha256: said.sha256, mime: said.mime, bytes: said.bytes, name: fit.name };
  } catch {
    return null;
  }
}
