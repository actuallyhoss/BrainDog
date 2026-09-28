/**
 * A record's files on the self-host: `PUT /api/files` and `GET /api/files/<sha256>`, the same two doors the Worker
 * answers (`apps/worker/src/files.ts`, `51 §5.5`, `12 §8` "The asset store"), kept on disk at `<data>/<slug>/blobs/`
 * beside the record file and its `snapshots/`.
 *
 * `server.ts` ANSWERS WHO IS ASKING AND THIS FILE DOES THE REST. The dispatch line there runs after `contextFor`, so
 * `ctx` here is the caller the record would see, whether that came from a cookie, a bearer or a host with no token,
 * where the machine is the boundary and the caller is the owner. The slug has already been taken off the path.
 *
 * THE SAME RULES AS THE WORKER, KEPT IN STEP BY HAND. The two hosts share no package this door could live in yet, so
 * the six signatures, the two-mebibyte ceiling and who may read or write are written here again, and a change to either
 * copy is a change to both. The one difference is storage: a file on disk has no metadata beside it, so its type is read
 * from its first bytes again when it is served, which is the same check that let it in.
 *
 * A FILE IS WRITTEN UNDER A TEMPORARY NAME AND MOVED INTO PLACE, so a crash mid-write leaves a stray temporary file
 * and never a truncated file under a hash it does not have. The name is the hash, so a second upload of the same bytes
 * is the same file, and the move replaces it with itself.
 */

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { CallContext } from '@braindog/record';
import type { Refusal } from '@braindog/ports';

/** The most one file may be: two mebibytes, the Worker's `FILE_MOST`. */
export const FILE_MOST = 2_097_152;

/** A file's name: sixty-four lower-case hex characters, as `kernel/src/coerce.ts` checks it. */
export const SHA256 = /^[0-9a-f]{64}$/;

/** The folder a record's files live in: `blobs/` beside the record file, or `null` for a record held in memory. */
export const blobsFolder = (recordFile: string): string | null => (recordFile === ':memory:' ? null : join(dirname(recordFile), 'blobs'));

/** The headers every file goes out with, and why each is there, are the Worker's (`FILE_HEADERS`). */
const FILE_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': "default-src 'none'; sandbox",
  'x-content-type-options': 'nosniff',
  'cache-control': 'private, max-age=31536000, immutable',
};

/** The type a file's first bytes say it is, or `null`: the Worker's `sniff`, byte for byte. SVG is never one. */
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

/** Who may read a record's files: the Worker's `readsFiles`. */
export function readsFiles(ctx: CallContext): boolean {
  const p = ctx.principal;
  if (p.kind === 'token') return true;
  if (p.kind !== 'person') return false;
  if (p.level !== null && p.level !== 'append') return true;
  return Object.values(ctx.levels ?? {}).some((l) => l !== 'append');
}

/** Who may keep a file here: the Worker's `writesFiles`. */
export function writesFiles(ctx: CallContext): boolean {
  const p = ctx.principal;
  if (p.kind === 'token') return p.scope === 'write';
  if (p.kind !== 'person') return false;
  if (p.level !== null && p.level !== 'read') return true;
  return Object.values(ctx.levels ?? {}).some((l) => l !== 'read');
}

/** Whether `server.ts` hands this path here: `/api/files` and below, read at the root. */
export const servesFiles = (path: string): boolean => /^\/+api\/+files(?:\/|$)/.test(path);

/**
 * Deletes one file by its hash, for an `erase.r2` job on this host. A key that is not a hash is refused rather than
 * joined into a path, and a file already gone is a file erased.
 */
export function eraseFile(folder: string | null, sha256: string): void {
  if (!SHA256.test(sha256)) throw new Error('an erase.r2 names the file it deletes by its SHA-256, and this one does not');
  if (folder === null) return;
  rmSync(join(folder, sha256), { force: true });
}

const answer = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

const refuse = (status: number, refusal: Refusal, extra: Record<string, string> = {}): Response => answer(status, { ok: false, refusal }, extra);

/* THE WORKER'S SENTENCES, but for the store that is missing: here it is a record held in memory. */
const NO_STORE: Refusal = { code: 'NOT_IN_THIS_BUILD', fix: 'A record held in memory keeps no files. Serve it from a file to keep them.' };
const NO_FILE: Refusal = { code: 'ROUTE_UNKNOWN', fix: 'This record holds no file by that name.' };
const NOT_HERE: Refusal = { code: 'ROUTE_UNKNOWN', fix: 'A file is put with PUT /api/files and read with GET /api/files/<sha256>.' };
const TOO_BIG: Refusal = { code: 'OUT_OF_BOUNDS', fix: 'A file here is at most 2 MB. Send a smaller one.' };
const NOT_TAKEN: Refusal = { code: 'BODY_MALFORMED', fix: 'A file here is a PNG, JPEG, GIF, WebP or AVIF picture, or a PDF.' };
const MISLABELLED = (said: string, found: string): Refusal => ({ code: 'BODY_MALFORMED', fix: `This file was sent as ${said} and is ${found}. Send it with its own type.` });
const EMPTY: Refusal = { code: 'BODY_MALFORMED', fix: 'The file arrived empty. Send its bytes as the body.' };
const CANNOT_READ: Refusal = { code: 'LEVEL_REQUIRED', fix: 'Reading a file here takes somebody who can read this record, or a token.' };
const CANNOT_WRITE: Refusal = { code: 'LEVEL_REQUIRED', fix: 'Adding a file takes somebody who can write here, or a token with write scope.' };

/**
 * The door: `ctx` is who `contextFor` said is asking, and `folder` is `blobsFolder`'s answer for this record.
 *
 * `request.url` IS THE ROOT'S, with any `/app/<slug>` already taken off by `answer`, so one test reads either address.
 */
export async function serveFiles(request: Request, ctx: CallContext, folder: string | null): Promise<Response> {
  const path = new URL(request.url).pathname;
  const one = /^\/+api\/+files\/+([^/]+)\/*$/.exec(path);
  const collection = /^\/+api\/+files\/*$/.test(path);
  if (!one && !collection) return refuse(404, NOT_HERE);
  const method = request.method;
  if (collection && method !== 'PUT') return refuse(405, NOT_HERE, { allow: 'PUT' });
  if (one && method !== 'GET' && method !== 'HEAD') return refuse(405, NOT_HERE, { allow: 'GET, HEAD' });
  return one ? give(ctx, folder, one[1]!, method === 'HEAD') : keep(request, ctx, folder);
}

/** `PUT /api/files`: the body, checked, hashed and kept, and its name answered. */
async function keep(request: Request, ctx: CallContext, folder: string | null): Promise<Response> {
  if (!writesFiles(ctx)) return refuse(403, CANNOT_WRITE);
  if (folder === null) return refuse(501, NO_STORE);
  /* THE BODY IS ALREADY IN MEMORY, weighed against the host's own ceiling as it arrived (`server.ts` `answer`); this is
     the file's smaller one. */
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > FILE_MOST) return refuse(413, TOO_BIG);
  if (bytes.byteLength === 0) return refuse(400, EMPTY);
  const mime = sniff(bytes);
  if (mime === null) return refuse(415, NOT_TAKEN);
  const said = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (said !== '' && said !== 'application/octet-stream' && said !== mime) return refuse(415, MISLABELLED(said, mime));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  mkdirSync(folder, { recursive: true });
  const target = join(folder, sha256);
  const passing = `${target}.${randomBytes(6).toString('hex')}.part`;
  writeFileSync(passing, bytes, { mode: 0o600 });
  renameSync(passing, target);
  return answer(200, { sha256, mime, bytes: bytes.byteLength });
}

/** `GET /api/files/<sha256>`: the bytes, inert, typed by their first bytes again. */
function give(ctx: CallContext, folder: string | null, sha256: string, head: boolean): Response {
  if (!readsFiles(ctx)) return refuse(403, CANNOT_READ);
  if (folder === null) return refuse(501, NO_STORE);
  /* THE HASH IS TESTED BEFORE IT IS JOINED INTO A PATH, so `..` or a separator never reaches the filesystem. */
  if (!SHA256.test(sha256)) return refuse(404, NO_FILE);
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(join(folder, sha256));
  } catch {
    return refuse(404, NO_FILE);
  }
  const headers = { ...FILE_HEADERS, 'content-type': sniff(bytes) ?? 'application/octet-stream', 'content-length': String(bytes.byteLength) };
  return new Response(head ? null : Uint8Array.from(bytes), { status: 200, headers });
}
