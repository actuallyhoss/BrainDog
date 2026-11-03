/**
 * A record's files on the Cloud: `PUT /api/files/<sha256>` keeps the bytes at the address their hash makes, `PUT
 * /api/files` keeps them and answers the name, and `GET /api/files/<sha256>` gives them back (`51 §5.5`, `12 §8` "The
 * asset store"). All three also under `/<slug>/api/files`, which is the address the app calls from.
 *
 * THE BYTES NEVER CROSS INTO THE RECORD'S OBJECT. A row holds `{ sha256, mime, bytes, name }` (`kernel/src/coerce.ts`
 * `file`) and the bytes sit in `BLOBS` at `rec_<id>/a/<sha256>`, so a photo of a receipt costs the record's single
 * thread nothing and the record's `.brain` copy stays the size of its facts. Who may is still asked of the same doors
 * `recordApi` asks (`session.ts`), so a cookie, a bearer and a slug mean here what they mean one path over.
 *
 * THE KEY IS THE HASH, NEVER THE CALLER'S. A name the caller chose would let one upload overwrite another's, and a path
 * in it would walk out of the prefix; the digest of what arrived is the one name nobody can choose. Two uploads of the
 * same bytes are one object, which is what content addressing is for.
 *
 * A PUT AT AN ADDRESS IS HELD TO IT. The client hashed the bytes it meant to send and named the hash in the path; this
 * door hashes what arrived, and a difference is `CHECKSUM_MISMATCH` with nothing kept, so a file cut short on the way
 * is never filed under a name it does not have. A second put of the same bytes finds them there and answers as the
 * first did, and nothing is written twice.
 *
 * TYPED BY ITS FIRST BYTES AND NOT BY ITS HEADER. `Content-Type` is what the caller says; the magic bytes are what the
 * file is. Six types are taken, and SVG is never one of them: an SVG is a document that can carry script, and served
 * from this origin it would run as this origin. Every answer carries `sandbox` and `nosniff` as well, so even a file that
 * fooled the check could not act as a page.
 *
 * WHY HERE AND NOT IN `route.ts`: this is a door with its own body and its own storage, and `route.ts` holds the pure
 * tests of which path is which. `index.ts` has one dispatch line for it in `route()`.
 */

import { ATTACHED_MOST, attachedName, attachedType } from '@braindog/kernel';
import type { CallContext } from '@braindog/record';
import type { Refusal } from '@braindog/ports';
import type { LimitClass, LimitDoor } from '@braindog/host/limits';

import { appPath } from './route.ts';
import { bearerOf, doorOf, withCookie, type BearerDeps, type Deps } from './session.ts';

/** The most one file may be: two mebibytes, the figure `12 §8` and `51 §5.5` name. */
export const FILE_MOST = 2_097_152;

/** Where a record's file lives in `BLOBS`: under the record's own id, so deleting the record can sweep it. */
export const filesPrefix = (record: string): string => `${record}/a/`;
export const fileKey = (record: string, sha256: string): string => `${filesPrefix(record)}${sha256}`;

/** A file's name as the record stores it: sixty-four lower-case hex characters, the same test `coerce.ts` applies. */
export const SHA256 = /^[0-9a-f]{64}$/;

/**
 * The headers every file goes out with.
 *
 * `default-src 'none'; sandbox` MAKES THE ANSWER INERT even when a browser opens it as a page: no script, no form, no
 * plugin, no same-origin. `nosniff` stops a browser guessing a type the check did not give it. `private` because a file
 * is one record's and a shared cache must never hand it to somebody else; `immutable` because the name is the hash, so
 * the bytes behind one name can never change. `noindex` because the address is the capability: a search engine
 * that found one must never list it.
 */
export const FILE_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': "default-src 'none'; sandbox",
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex',
  'cache-control': 'private, max-age=31536000, immutable',
};

/**
 * The type a file's first bytes say it is, or `null` for anything this store does not take.
 *
 * READ FROM THE BYTES THEMSELVES, and each signature is the one its format's own specification fixes: PNG's eight bytes,
 * JPEG's start-of-image marker, GIF's two versions, WebP's RIFF container, AVIF's `ftyp` box with an AVIF brand, and
 * PDF's `%PDF-`. Nothing else is guessed, so an SVG, an HTML page or a script is refused whatever its header says.
 */
export function sniff(bytes: Uint8Array): string | null {
  const at = (i: number, ...want: number[]): boolean => want.every((b, j) => bytes[i + j] === b);
  const ascii = (i: number, text: string): boolean => at(i, ...[...text].map((c) => c.charCodeAt(0)));
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis'))) return 'image/avif';
  if (ascii(0, '%PDF-')) return 'application/pdf';
  return null;
}

/** The media type a header names, without its parameters, lower-cased; empty when there is none. */
const typeSaid = (header: string | null): string => (header ?? '').split(';')[0]!.trim().toLowerCase();

/**
 * Whether what the caller said the file is agrees with what it is.
 *
 * NO HEADER, AND `application/octet-stream`, SAY NOTHING, and the bytes decide. A header that names a type is held to
 * it: a file sent as `image/png` that opens as a PDF is a mistake somewhere, and storing it as either would be a guess.
 */
export const agrees = (said: string, found: string): boolean => said === '' || said === 'application/octet-stream' || said === found;

/** The SHA-256 of the bytes, as the record writes it. */
export async function sha256Of(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The body, whole, or `null` the moment it passes `most`.
 *
 * COUNTED AS IT ARRIVES AND NOT FROM `Content-Length`, which a caller writes and may leave out or understate. The header
 * is still read first by the caller of this, so an honest oversized upload is refused before a byte of it is read.
 */
export async function bodyUpTo(body: ReadableStream<Uint8Array> | null, most: number): Promise<Uint8Array | null> {
  if (body === null) return new Uint8Array(0);
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const read = await reader.read();
    if (read.done) break;
    total += read.value.byteLength;
    if (total > most) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(read.value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/**
 * Whether a caller may read a record's files: anybody the record lets read something.
 *
 * A PERSON AT `append` ALONE IS REFUSED, because `append` is the rung that writes without reading, and a file is read.
 * One invited to a single register reads that register's rows, files included, so any register level above `append`
 * lets them read. Every token scope reads. A runner and a share link are neither, and a link's page draws no file.
 */
export function readsFiles(ctx: CallContext): boolean {
  const p = ctx.principal;
  if (p.kind === 'token') return true;
  if (p.kind !== 'person') return false;
  if (p.level !== null && p.level !== 'append') return true;
  return Object.values(ctx.levels ?? {}).some((l) => l !== 'append');
}

/**
 * Whether a caller may keep a file in the record: a person who can write anything, or a `write` token.
 *
 * `append` COUNTS, because a new row is what `append` writes and a file is most often attached to one. `read` does not,
 * and neither does a `propose` token, whose writes are proposals somebody else accepts.
 */
export function writesFiles(ctx: CallContext): boolean {
  const p = ctx.principal;
  if (p.kind === 'token') return p.scope === 'write';
  if (p.kind !== 'person') return false;
  if (p.level !== null && p.level !== 'read') return true;
  return Object.values(ctx.levels ?? {}).some((l) => l !== 'read');
}

/** Which of the two doors a path asks: the collection a file is put into, or one file by its name. */
export function fileAsked(pathname: string): { slug: string | null; sha256: string | null } | null {
  const app = appPath(pathname);
  const rest = app === null ? pathname : app.rest;
  if (/^\/+api\/+files\/*$/.test(rest)) return { slug: app?.slug ?? null, sha256: null };
  const one = /^\/+api\/+files\/+([^/]+)\/*$/.exec(rest);
  if (one) return { slug: app?.slug ?? null, sha256: one[1]! };
  return null;
}

/** Whether `route()` hands this path here: `/api/files` and below, at the root or under a record's name. */
export const servesFiles = (pathname: string): boolean => {
  const app = appPath(pathname);
  return /^\/+api\/+files(?:\/|$)/.test(app === null ? pathname : app.rest);
};

/** The bucket, as narrow as this file uses it. R2's `R2Bucket` is one. */
export type FileBucket = {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ size: number; body: ReadableStream<Uint8Array>; httpMetadata?: { contentType?: string } } | null>;
  head(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null>;
  delete(keys: string | string[]): Promise<void>;
};

/** What `route()` hands this door: the bucket, the two doors' own dependencies, and the caller's minute. */
export type FileDeps = {
  /** `BLOBS`; absent, and the store answers `NOT_IN_THIS_BUILD`, as every optional binding does (`ops.md` §4.0 Rule 2). */
  blobs: FileBucket | undefined;
  session: Deps;
  bearer: BearerDeps;
  limit: (who: LimitDoor, cls: LimitClass) => Promise<Response | null>;
  /** A day's bytes for one record (`ABUSE.uploadDay`): `null` to go on, or the 429. Absent, and nothing is counted. */
  bytes?: ((record: string, bytes: number) => Promise<Response | null>) | undefined;
  /**
   * Whether the record keeps this file from this caller, named only on rows they cannot read (the record's `fileHeld`).
   * Absent, and nothing is held back beyond "reads files", as before.
   */
  held?: ((record: string, sha256: string, ctx: CallContext) => Promise<boolean>) | undefined;
};

const answer = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

const refuse = (status: number, refusal: Refusal, extra: Record<string, string> = {}): Response => answer(status, { ok: false, refusal }, extra);

/* THE SENTENCES, each saying what to do next. The code is from the registry (`30 §6`); none is new. */
const NO_STORE: Refusal = { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog keeps no files: it has no BLOBS bucket bound.' };
const NO_FILE: Refusal = { code: 'ROUTE_UNKNOWN', fix: 'There is no file by that name here.' };
const NOT_HERE: Refusal = { code: 'ROUTE_UNKNOWN', fix: 'A file is put with PUT /api/files/<sha256> and read with GET /api/files/<sha256>.' };
const TOO_BIG: Refusal = { code: 'OUT_OF_BOUNDS', fix: 'A file here is at most 2 MB. Send a smaller one.' };
const TOO_BIG_ATTACHED: Refusal = { code: 'OUT_OF_BOUNDS', fix: `An attached file is at most ${ATTACHED_MOST / 1024 / 1024} MB. Send a smaller one.` };
const NO_NAME: Refusal = { code: 'BODY_MALFORMED', fix: 'name is the file\'s own name with its ending, such as brief.pdf or mockup.html.' };
const NOT_TAKEN: Refusal = { code: 'BODY_MALFORMED', fix: 'A file here is a PNG, JPEG, GIF, WebP or AVIF picture, or a PDF.' };
const MISLABELLED = (said: string, found: string): Refusal => ({ code: 'BODY_MALFORMED', fix: `This file was sent as ${said} and is ${found}. Send it with its own type.` });
const MISMATCH: Refusal = { code: 'CHECKSUM_MISMATCH', fix: 'These bytes do not hash to the address they were put at, so nothing was kept; put them at their own hash.' };
const EMPTY: Refusal = { code: 'BODY_MALFORMED', fix: 'The file arrived empty. Send its bytes as the body.' };
const CANNOT_READ: Refusal = { code: 'LEVEL_REQUIRED', fix: 'Reading a file here takes somebody who can read this BrainDog, or a token.' };
const CANNOT_WRITE: Refusal = { code: 'LEVEL_REQUIRED', fix: 'Adding a file takes somebody who can write here, or a token with write scope.' };
/** The one 401 body: "A `401` says only `unauthorized`." What to do is the app's to say, not a stranger's to read. */
const NOBODY: Refusal = { code: 'UNAUTHORIZED', fix: 'unauthorized' };

/**
 * The door itself: who is asking, whether they may, and then the bytes.
 *
 * THE ORDER IS `recordApi`'S. A link is refused as a link is everywhere but its own page (one 404 with no body), the
 * session is asked before the bearer, the caller's minute is spent before the bucket is touched, and a cookie rotated on
 * the way in rides back on every answer.
 */
export async function serveFiles(request: Request, deps: FileDeps): Promise<Response> {
  const url = new URL(request.url);
  const asked = fileAsked(url.pathname);
  if (asked === null) return refuse(404, NOT_HERE);
  const method = request.method;
  const reading = method === 'GET' || method === 'HEAD';
  if (asked.sha256 === null && method !== 'PUT') return refuse(405, NOT_HERE, { allow: 'PUT' });
  if (asked.sha256 !== null && !reading && method !== 'PUT') return refuse(405, NOT_HERE, { allow: 'GET, HEAD, PUT' });

  const door = await doorOf(request, deps.session, asked.slug);
  if (door.door === 'share') return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  if (door.door === 'refused') {
    /* THE DOOR'S OWN ANSWER, in `recordApi`'s shapes: its refusal where it has one, the Worker's sentence for nothing
       presented, and a bare 429 or 503 carrying only what it knows. */
    if (door.retryAfter !== undefined)
      return withCookie(answer(door.status, { ok: false, retryAfter: door.retryAfter }, { 'retry-after': String(door.retryAfter) }), door.cookie);
    if (door.refusal !== undefined) return withCookie(refuse(door.status, door.refusal), door.cookie);
    return withCookie(door.status === 401 ? refuse(401, NOBODY) : answer(door.status, { ok: false }), door.cookie);
  }
  let record: string;
  let ctx: CallContext;
  let cookie: string | undefined;
  if (door.door === 'session') {
    ({ record, ctx, cookie } = door);
  } else {
    const found = await bearerOf(request, 'api', deps.bearer, asked.slug);
    if ('status' in found) return found.status === 403 ? refuse(403, found.refusal) : refuse(401, NOBODY);
    ({ record, ctx } = found);
  }
  const over = await deps.limit({ door: door.door, ctx }, reading ? 'read' : 'write');
  if (over !== null) return withCookie(over, cookie);

  const out = reading ? await give(request, deps.blobs, record, ctx, asked.sha256!, deps.held) : await keep(request, deps.blobs, record, ctx, asked.sha256, deps.bytes, url.searchParams.get('name'));
  return withCookie(out, cookie);
}

/**
 * `PUT /api/files` and `PUT /api/files/<sha256>`: the body, checked, hashed and kept, and its name answered.
 *
 * `at` IS THE HASH THE PATH NAMED, or `null` for the collection. It is compared before the type is read: bytes that are
 * not the ones the client hashed are not the file it meant, so what they look like says nothing. A name that is not a
 * hash at all is the same refusal, because no bytes could hash to it.
 */
async function keep(request: Request, blobs: FileBucket | undefined, record: string, ctx: CallContext, at: string | null, spend?: FileDeps['bytes'], name: string | null = null): Promise<Response> {
  if (!writesFiles(ctx)) return refuse(403, CANNOT_WRITE);
  if (blobs === undefined) return refuse(501, NO_STORE);
  if (at !== null && !SHA256.test(at)) return refuse(422, MISMATCH);
  /* A PUT THAT NAMES ITS FILE (`?name=`) IS AN ATTACHMENT (`methods/attachments.ts`): any type, up to 25 MB, typed by its
     bytes and then its name (`attachedType`), never by its header. One that names none is a file field's, as before. */
  const named = name === null ? null : attachedName(name);
  if (name !== null && named === null) return refuse(400, NO_NAME);
  const most = named === null ? FILE_MOST : ATTACHED_MOST;
  const big = named === null ? TOO_BIG : TOO_BIG_ATTACHED;
  /* AN HONEST HEADER THAT SAYS TOO MUCH IS REFUSED BEFORE A BYTE IS READ; a dishonest one is caught by the count. */
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > most) return refuse(413, big);
  const bytes = await bodyUpTo(request.body, most);
  if (bytes === null) return refuse(413, big);
  if (bytes.byteLength === 0) return refuse(400, EMPTY);
  const sha256 = await sha256Of(bytes);
  if (at !== null && at !== sha256) return refuse(422, MISMATCH);
  const mime = named === null ? sniff(bytes) : attachedType(bytes, named).mime;
  if (mime === null) return refuse(415, NOT_TAKEN);
  const said = typeSaid(request.headers.get('content-type'));
  if (named === null && !agrees(said, mime)) return refuse(415, MISLABELLED(said, mime));
  /* THE SAME BYTES ARE ALREADY THE SAME FILE, so a second put finds them and writes nothing; the answer is the first's. */
  const key = fileKey(record, sha256);
  if ((await blobs.head(key)) === null) {
    /* ONLY NEW BYTES ARE COUNTED against the day (`ABUSE.uploadDay`); the same file put again costs nothing and writes nothing. */
    const over = spend === undefined ? null : await spend(record, bytes.byteLength);
    if (over !== null) return over;
    await blobs.put(key, bytes, { httpMetadata: { contentType: mime } });
  }
  return answer(200, { sha256, mime, bytes: bytes.byteLength });
}

/**
 * `GET /api/files/<sha256>`: the bytes, inert.
 *
 * A NAME THAT IS NOT A HASH AND A HASH THIS RECORD DOES NOT HOLD ARE ONE ANSWER, so the door says nothing about which
 * names exist beyond the one asked.
 */
async function give(request: Request, blobs: FileBucket | undefined, record: string, ctx: CallContext, sha256: string, held?: FileDeps['held']): Promise<Response> {
  if (!readsFiles(ctx)) return refuse(403, CANNOT_READ);
  if (blobs === undefined) return refuse(501, NO_STORE);
  if (!SHA256.test(sha256)) return refuse(404, NO_FILE);
  /* AND A FILE NAMED ONLY ON ROWS THIS CALLER CANNOT READ IS NOT THERE FOR THEM (the record's `fileHeld`), in the same
     404 as a hash nobody holds, so the answer does not say the file exists. */
  if (held !== undefined && (await held(record, sha256, ctx))) return refuse(404, NO_FILE);
  const key = fileKey(record, sha256);
  const fileHeaders = (meta: { size: number; httpMetadata?: { contentType?: string } }): Record<string, string> => ({
    ...FILE_HEADERS,
    'content-type': meta.httpMetadata?.contentType ?? 'application/octet-stream',
    'content-length': String(meta.size),
  });
  /*
   * `blobs.head` and `blobs.get` are kept as two calls, never one behind a ternary, because TypeScript would
   * otherwise infer their shared variable's type as `head`'s alone: `get`'s answer is a structural subtype of
   * `head`'s (it has every field `head`'s has, and `body` besides), so a ternary of the two collapses to the
   * wider, bodyless type, and `object.body` would read as `unknown` on the branch that does have it.
   */
  if (request.method === 'HEAD') {
    const object = await blobs.head(key);
    if (object === null) return refuse(404, NO_FILE);
    return new Response(null, { status: 200, headers: fileHeaders(object) });
  }
  const object = await blobs.get(key);
  if (object === null) return refuse(404, NO_FILE);
  return new Response(object.body, { status: 200, headers: fileHeaders(object) });
}
