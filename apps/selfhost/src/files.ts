/**
 * A record's files on the self-host: `PUT /api/files/<sha256>`, `PUT /api/files` and `GET /api/files/<sha256>`, the
 * same doors the Worker answers (`apps/worker/src/files.ts`, `51 §5.5`, `12 §8` "The asset store"), kept on disk at `<data>/<slug>/blobs/`
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
 * is the same file. A put at an address is held to it as on the Worker: bytes that hash to anything else are
 * `CHECKSUM_MISMATCH` and nothing is written, and bytes already there are not written again.
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { ATTACHED_MOST, attachedName, attachedType } from '@braindog/kernel';
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
  'x-robots-tag': 'noindex',
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
  rmSync(typeFile(folder, sha256), { force: true });
}

/**
 * WHERE AN ATTACHMENT'S TYPE IS KEPT BESIDE ITS BYTES, as the Worker keeps it in the object's metadata: `<sha256>.type`,
 * the one line `attachedType` read from its bytes and its name when it came. A disk keeps no type, and without it an
 * SVG, which has no first bytes of its own, went out as text and never showed as a picture.
 */
export const typeFile = (folder: string, sha256: string): string => join(folder, `${sha256}.type`);

/** Keeps an attachment's type beside it, once; a type already kept for the same bytes stays. */
export function keepType(folder: string, sha256: string, mime: string): void {
  if (!SHA256.test(sha256) || !/^[a-z]+\/[a-z0-9.+-]+$/u.test(mime)) return;
  const at = typeFile(folder, sha256);
  if (!existsSync(at)) writeFileSync(at, mime, { mode: 0o600 });
}

/**
 * The type kept beside a file, when it is a picture: only a picture is served by it, so an SVG shows as one (in an
 * `<img>`, where its script never runs, and inert under the door's `sandbox` when opened on its own). Every other kind
 * is typed from its bytes as before.
 */
function keptPicture(folder: string, sha256: string): string | null {
  try {
    const mime = readFileSync(typeFile(folder, sha256), 'utf8').trim();
    return /^image\/[a-z0-9.+-]+$/u.test(mime) ? mime : null;
  } catch {
    return null;
  }
}

const answer = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

const refuse = (status: number, refusal: Refusal, extra: Record<string, string> = {}): Response => answer(status, { ok: false, refusal }, extra);

/* THE WORKER'S SENTENCES, but for the store that is missing: here it is a record held in memory. */
const NO_STORE: Refusal = { code: 'NOT_IN_THIS_BUILD', fix: 'A record held in memory keeps no files. Serve it from a file to keep them.' };
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

/**
 * The door: `ctx` is who `contextFor` said is asking, and `folder` is `blobsFolder`'s answer for this record.
 *
 * `request.url` IS THE ROOT'S, with any `/<slug>` (or the old `/app/<slug>`) already taken off by `answer`, so one test
 * reads either address.
 */
export async function serveFiles(request: Request, ctx: CallContext, folder: string | null, held: (sha256: string, ctx: CallContext) => boolean = () => false): Promise<Response> {
  const path = new URL(request.url).pathname;
  const one = /^\/+api\/+files\/+([^/]+)\/*$/.exec(path);
  const collection = /^\/+api\/+files\/*$/.test(path);
  if (!one && !collection) return refuse(404, NOT_HERE);
  const method = request.method;
  if (collection && method !== 'PUT') return refuse(405, NOT_HERE, { allow: 'PUT' });
  if (one && method !== 'GET' && method !== 'HEAD' && method !== 'PUT') return refuse(405, NOT_HERE, { allow: 'GET, HEAD, PUT' });
  if (one && method !== 'PUT') return give(ctx, folder, one[1]!, method === 'HEAD', held);
  return keep(request, ctx, folder, one ? one[1]! : null, new URL(request.url).searchParams.get('name'));
}

/**
 * Sniffs and writes one file's bytes under `folder`, named by its hash: the write half of `PUT /api/files`, reused by
 * `arrivalDoor`'s mail attachments so a kept attachment is stored by the same rule a person's upload meets.
 * `null` for a type this store does not take, oversized, or empty, since a caller keeping an attachment only needs to
 * know whether it was kept.
 */
export function keepAttachment(folder: string, bytes: Uint8Array): { sha256: string; mime: string } | null {
  if (bytes.byteLength > FILE_MOST || bytes.byteLength === 0) return null;
  const mime = sniff(bytes);
  if (mime === null) return null;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  mkdirSync(folder, { recursive: true });
  const target = join(folder, sha256);
  /* THE SAME BYTES ARE ALREADY THE SAME FILE, so nothing is written twice. */
  if (existsSync(target)) return { sha256, mime };
  const passing = `${target}.${randomBytes(6).toString('hex')}.part`;
  writeFileSync(passing, bytes, { mode: 0o600 });
  renameSync(passing, target);
  return { sha256, mime };
}

/**
 * `PUT /api/files` and `PUT /api/files/<sha256>`, in the Worker's order: `at` is the hash the path named, compared
 * before the type is read, and a name that is not a hash is the same refusal, because no bytes could hash to it.
 */
async function keep(request: Request, ctx: CallContext, folder: string | null, at: string | null, name: string | null = null): Promise<Response> {
  if (!writesFiles(ctx)) return refuse(403, CANNOT_WRITE);
  if (folder === null) return refuse(501, NO_STORE);
  if (at !== null && !SHA256.test(at)) return refuse(422, MISMATCH);
  /* A PUT THAT NAMES ITS FILE (`?name=`) IS AN ATTACHMENT, as on the Worker: any type, up to 25 MB, typed by its bytes and
     then its name, never by its header. */
  const named = name === null ? null : attachedName(name);
  if (name !== null && named === null) return refuse(400, NO_NAME);
  /* THE BODY IS ALREADY IN MEMORY, weighed against the host's own ceiling as it arrived (`server.ts` `answer`); this is
     the file's smaller one. */
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (named !== null) {
    if (bytes.byteLength > ATTACHED_MOST) return refuse(413, TOO_BIG_ATTACHED);
    if (bytes.byteLength === 0) return refuse(400, EMPTY);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (at !== null && sha256 !== at) return refuse(422, MISMATCH);
    const mime = attachedType(bytes, named).mime;
    mkdirSync(folder, { recursive: true });
    const target = join(folder, sha256);
    if (!existsSync(target)) {
      const passing = `${target}.${randomBytes(6).toString('hex')}.part`;
      writeFileSync(passing, bytes, { mode: 0o600 });
      renameSync(passing, target);
    }
    keepType(folder, sha256, mime);
    return answer(200, { sha256, mime, bytes: bytes.byteLength });
  }
  if (bytes.byteLength > FILE_MOST) return refuse(413, TOO_BIG);
  if (bytes.byteLength === 0) return refuse(400, EMPTY);
  if (at !== null && createHash('sha256').update(bytes).digest('hex') !== at) return refuse(422, MISMATCH);
  const mime = sniff(bytes);
  if (mime === null) return refuse(415, NOT_TAKEN);
  const said = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (said !== '' && said !== 'application/octet-stream' && said !== mime) return refuse(415, MISLABELLED(said, mime));
  const kept = keepAttachment(folder, bytes);
  /* UNREACHABLE HERE: the checks above already refused what `keepAttachment` would answer `null` for, each with its
     own sentence, so this file is always taken once it reaches this line. */
  if (kept === null) return refuse(415, NOT_TAKEN);
  return answer(200, { sha256: kept.sha256, mime: kept.mime, bytes: bytes.byteLength });
}

/** `GET /api/files/<sha256>`: the bytes, inert, typed by their first bytes again. */
function give(ctx: CallContext, folder: string | null, sha256: string, head: boolean, held: (sha256: string, ctx: CallContext) => boolean): Response {
  if (!readsFiles(ctx)) return refuse(403, CANNOT_READ);
  if (folder === null) return refuse(501, NO_STORE);
  /* THE HASH IS TESTED BEFORE IT IS JOINED INTO A PATH, so `..` or a separator never reaches the filesystem. */
  if (!SHA256.test(sha256)) return refuse(404, NO_FILE);
  /* AND A FILE NAMED ONLY ON ROWS THIS CALLER CANNOT READ IS NOT THERE FOR THEM (the record's `fileHeld`), in the same
     404 as a hash nobody holds, so the answer does not say the file exists. */
  if (held(sha256, ctx)) return refuse(404, NO_FILE);
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(join(folder, sha256));
  } catch {
    return refuse(404, NO_FILE);
  }
  /* AN ATTACHMENT WITH NO SIGNATURE IS TEXT OR BYTES, read as the door read it (`attachedType`): a disk keeps no type. */
  const typed = sniff(bytes) ?? keptPicture(folder, sha256) ?? (attachedType(bytes, '').kind === 'text' ? 'text/plain; charset=utf-8' : 'application/octet-stream');
  const headers = { ...FILE_HEADERS, 'content-type': typed, 'content-length': String(bytes.byteLength) };
  return new Response(head ? null : Uint8Array.from(bytes), { status: 200, headers });
}
