/**
 * `braindog picture <project, organisation or person> <file or https link>`: a project's or an organisation's logo or
 * a person's photo, saved as the picture they are drawn by in BrainDog (his word of 4 November: "preferably if the agent
 * can find a photo in the context, it should save it as project or people icon").
 *
 * THE BYTES FIRST, THEN ONE WRITE. The picture goes up through the file door (`putFile`, the 2 MB door a file field
 * uses, which types it by its bytes and takes PNG, JPEG, GIF, WebP and AVIF), then the row's picture field is set to it
 * with `update`, so it lands, or asks, as any other write of this caller's would.
 *
 * ONE ALREADY THERE IS HIS. The record files an agent's write that would replace a picture already chosen as a question
 * for the owner (`pictureKept` in `packages/record`), and this says so; `--said "<his words>"` passes what he told the
 * agent, and it lands. A person's own login replaces it.
 *
 * WHO IS NAMED BY THEIR NAME OR THEIR ROW (`things#3`, `people#12`, `organisations#4`). A name is looked up among the
 * lists that keep a picture: the one whose name it is, else the one row found; several found are named back, and
 * nothing is written.
 *
 * SQUARE AND SMALL BEFORE IT LEAVES THE MACHINE WHERE IT CAN BE, as the app's own changer makes it. On a Mac `sips` reads
 * nearly anything a logo or a photo comes as (an iPhone's HEIC, an SVG, an ICO, a TIFF), and the picture is made square
 * (a photo cut to its middle, a person's nearer the top where a face is; a logo padded clear, so none of it is cut
 * off), at most 512 a side, as a PNG, or a JPEG for a photo. One already square, small and in a form the
 * door takes goes as it is. Anywhere else, a PNG, JPEG, GIF, WebP or AVIF goes as it is, under the door's 2 MB, and
 * anything else is refused with what to do.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { fixOf, refused, type Result } from '@braindog/ports';

import { printable } from './clip.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { refuse } from './json.ts';
import { isObject, type AgentIo } from './skills.ts';

const USAGE =
  'braindog picture saves a project\'s or an organisation\'s logo or a person\'s photo as the picture they are drawn by: braindog picture "<project, organisation or person>" <file or https link> [--said "<what the owner told you>"] [--host <host>]. Name them as BrainDog does, or by their row, as things#3. A picture already there is the owner\'s to replace, so an agent\'s is asked of him. To take one back: braindog picture --undo <batch>.';

/** The most one picture may be, as the file door holds it (`FILE_MOST`). */
export const PICTURE_MOST = 2 * 1024 * 1024;

/** The most a side is made on a Mac: a face is drawn at 32 at most and a project's hero at 56, three pixels to a point. */
const SIDE = 512;

/** A row by its spoken name, `things#3`. */
const SPOKEN = /^[a-z][a-z0-9_]*#[1-9][0-9]*$/u;

type Client = ReturnType<typeof clientFor>;
type Row = { id?: unknown; seq?: unknown; version?: unknown; register?: unknown; fields?: Record<string, unknown> };
type Decl = { title?: unknown; name?: unknown; meets?: unknown; identity?: { picture?: unknown } | null; fields?: { id?: unknown; type?: unknown }[] };

/** `braindog picture`, and its exit code: 0 kept or asked, 1 refused, 3 unreachable. */
export async function pictureCommand(args: string[], io: AgentIo): Promise<number> {
  let values: { said?: string | undefined; undo?: string | undefined; host?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, strict: true, allowPositionals: true, options: { said: { type: 'string' }, undo: { type: 'string' }, host: { type: 'string' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  let to: Target;
  try {
    to = target(values.host, io.env, hostsPath(io.env));
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  const headers = await io.headers(to.key);
  const client = clientFor(to, async () => headers, AbortSignal.timeout(budgetOf(io.env) * 4));
  const unreachable = (r: Result<unknown>): boolean => refused(r) && r.refusal.code === 'UNREACHABLE';

  /* ── taking one back, by the batch its receipt named ── */
  if (values.undo !== undefined) {
    if (positionals.length > 0) {
      io.say(USAGE);
      return 1;
    }
    const back: Result<unknown> = await client.call('undoOwn', { batch: values.undo });
    if (!back.ok) return refuse(io, back, unreachable(back) ? `${to.key} did not answer, so nothing was taken back.` : printable(fixOf(back)));
    io.answer?.({ value: back.value });
    const v = isObject(back.value) ? back.value : {};
    io.out(printable(typeof v.say === 'string' ? v.say : 'Taken back.'));
    return 0;
  }

  const [who, from] = positionals;
  if (who === undefined || from === undefined || positionals.length > 2 || who.trim() === '') {
    io.say(USAGE);
    return 1;
  }

  /* ── the bytes: a file here, or an https link ── */
  const read = /^https?:\/\//iu.test(from) ? await fetched(from) : local(resolve(io.cwd, from), from);
  if ('error' in read) {
    io.say(read.error);
    return 1;
  }
  if (kindOf(read.bytes) === null) {
    io.say(UNREAD);
    return 1;
  }

  /* ── who it is of, before it is cut: a person's photo is cut square, a logo padded ── */
  const found = await rowOf(client, who.trim());
  if ('refusal' in found) return refuse(io, found.refusal, unreachable(found.refusal) ? `${to.key} did not answer, so nothing was saved.` : printable(fixOf(found.refusal)));
  const { register, seq, version, field, name, held, round } = found;

  const made = fitted(read.bytes, round);
  if ('error' in made) {
    io.say(made.error);
    return 1;
  }
  const bytes = made.bytes;
  if (bytes.length > PICTURE_MOST) {
    io.say(`That picture is larger than 2 MB. Make it smaller and try again.`);
    return 1;
  }

  /* ── up through the file door, then the one write ── */
  const kept = await client.putFile(bytes);
  if (!kept.ok) return refuse(io, kept, unreachable(kept) ? `${to.key} did not answer, so nothing was saved.` : printable(fixOf(kept)));
  if (held === kept.value.sha256) {
    io.answer?.({ value: { unchanged: true, register, seq } });
    io.out(printable(`${name} already wears that picture.`));
    return 0;
  }
  const ext = kept.value.mime.replace(/^image\//u, '').replace('jpeg', 'jpg');
  const done: Result<unknown> = await client.update({
    register,
    seq,
    patch: { [field]: { sha256: kept.value.sha256, mime: kept.value.mime, bytes: kept.value.bytes, name: `picture.${ext}` } },
    ...(version === null ? {} : { version }),
    ...(values.said === undefined ? {} : { said: values.said }),
  } as never);
  if (!done.ok) return refuse(io, done, unreachable(done) ? `${to.key} did not answer, so nothing was saved.` : printable(fixOf(done)));
  io.answer?.({ value: done.value });
  const v = isObject(done.value) ? done.value : {};
  const asked = isObject(v.asked) ? v.asked : null;
  /* ASKED, NOT SAVED: a picture already there is his to replace, and an agent's writes of a kind may ask until enough of
     them were kept (the record's `why` says which). On his word they land, so the line says how. */
  if (asked) {
    const question = typeof asked.question === 'string' ? asked.question : `Change the picture of ${name}?`;
    const why = typeof asked.why === 'string' && asked.why.trim() !== '' ? ` ${asked.why.trim()}` : '';
    io.out(printable(`Not saved yet: the owner was asked "${question}"${why}`));
    if (values.said === undefined) io.out(printable('If he told you to, run it again with --said "<his words>" and it is saved on his word.'));
    return 0;
  }
  io.out(printable(`Saved the picture of ${name}.`));
  if (typeof v.batch === 'string' && v.batch !== '') io.out(printable(`To undo it: braindog picture --undo ${v.batch}`));
  return 0;
}

/** A file on this machine, read whole, or why not. */
function local(path: string, given: string): { bytes: Uint8Array } | { error: string } {
  if (!existsSync(path) || !statSync(path).isFile()) return { error: `There is no file at ${given}.` };
  if (statSync(path).size > 16 * PICTURE_MOST) return { error: `${given} is far larger than a picture. Choose a smaller one.` };
  return { bytes: new Uint8Array(readFileSync(path)) };
}

/**
 * A picture behind an https link, or why not: https only (http only to this machine), each move it is sent on held to
 * the same test, five moves at most, twenty seconds, and never past 32 MB read.
 */
async function fetched(given: string): Promise<{ bytes: Uint8Array } | { error: string }> {
  let url: URL;
  try {
    url = new URL(given);
  } catch {
    return { error: `${given} is not a link.` };
  }
  const safe = (u: URL): boolean => u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname));
  if (!safe(url)) return { error: `${given} is not an https link, so nothing was read.` };
  try {
    let res: Response;
    for (let moves = 0; ; moves++) {
      res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { accept: 'image/*' }, redirect: 'manual' });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (location === null) break;
      const next = new URL(location, url);
      if (!safe(next)) return { error: `${url.origin} sent the picture on to ${next.href}, which is not https, so nothing was read.` };
      if (moves === 5) return { error: `${given} moved more than five times, so nothing was read.` };
      url = next;
    }
    if (!res.ok) return { error: `${url.origin} answered ${res.status} for the picture, so nothing was saved.` };
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (type !== '' && !type.startsWith('image/') && !type.startsWith('application/octet-stream'))
      return { error: `${url.origin} answered ${type.split(';')[0]}, not a picture, so nothing was saved.` };
    const body = new Uint8Array(await res.arrayBuffer());
    if (body.length > 16 * PICTURE_MOST) return { error: 'That picture is far larger than a picture should be. Choose a smaller one.' };
    return { bytes: body };
  } catch {
    return { error: `${url.origin} did not answer with a picture, so nothing was saved.` };
  }
}

/** Said of a file that is no picture anything here reads. */
const UNREAD = 'That is not a picture BrainDog can read. Try a PNG, JPEG or WebP.';

/** An SVG by its first bytes, which the file door refuses: a document that can carry script is never a picture. */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart().toLowerCase();
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
}

/**
 * What a picture is by its first bytes, as the file door reads them (`sniff` in `apps/worker/src/files.ts`): the name
 * `sips` is handed it under, whether the door takes it as it is, and what it is called when it does not. `null` for
 * bytes that are no picture.
 */
export function kindOf(bytes: Uint8Array): { ext: string; kept: boolean; called: string } | null {
  const at = (i: number, ...v: number[]): boolean => v.every((x, j) => bytes[i + j] === x);
  const ascii = (i: number, text: string): boolean => [...text].every((c, j) => bytes[i + j] === c.charCodeAt(0));
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return { ext: 'png', kept: true, called: 'PNG' };
  if (at(0, 0xff, 0xd8, 0xff)) return { ext: 'jpg', kept: true, called: 'JPEG' };
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return { ext: 'gif', kept: true, called: 'GIF' };
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return { ext: 'webp', kept: true, called: 'WebP' };
  if (ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis'))) return { ext: 'avif', kept: true, called: 'AVIF' };
  /* AN IPHONE'S PHOTO, and an AVIF the door does not know by its first brand: both read by `sips` as HEIF. */
  if (ascii(4, 'ftyp')) return { ext: 'heic', kept: false, called: 'HEIC photo' };
  if (at(0, 0, 0, 1, 0)) return { ext: 'ico', kept: false, called: 'ICO icon' };
  if (ascii(0, 'BM')) return { ext: 'bmp', kept: false, called: 'BMP' };
  if (at(0, 0x49, 0x49, 0x2a, 0) || at(0, 0x4d, 0x4d, 0, 0x2a)) return { ext: 'tiff', kept: false, called: 'TIFF' };
  if (looksLikeSvg(bytes)) return { ext: 'svg', kept: false, called: 'SVG' };
  return null;
}

/** A picture's size in pixels as `sips` reads it, or `null` where it cannot. */
function sizeOf(path: string): { w: number; h: number } | null {
  try {
    const said = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 });
    const w = Math.round(Number(/pixelWidth:\s*([\d.]+)/u.exec(said)?.[1]));
    const h = Math.round(Number(/pixelHeight:\s*([\d.]+)/u.exec(said)?.[1]));
    return w > 0 && h > 0 ? { w, h } : null;
  } catch {
    return null;
  }
}

/**
 * The picture as the record keeps it best: square, at most `SIDE` a side, and in a form the file door takes; or the
 * sentence why not. A person's photo (`round`) and any JPEG or HEIC are cut to their middle, a little above it on a tall
 * one, where a face is; a logo is padded to a square with clear sides, so no part of it is cut off.
 */
export function fitted(bytes: Uint8Array, round: boolean): { bytes: Uint8Array } | { error: string } {
  const kind = kindOf(bytes);
  if (kind === null) return { error: UNREAD };
  const not = `A ${kind.called} is not kept as a picture here. Save it as a PNG or a JPEG and try again.`;
  if (process.platform !== 'darwin') return kind.kept ? { bytes } : { error: not };
  const dir = mkdtempSync(join(tmpdir(), 'braindog-picture-'));
  try {
    const into = join(dir, `in.${kind.ext}`);
    writeFileSync(into, bytes);
    let size = sizeOf(into);
    if (size === null) return kind.kept ? { bytes } : { error: not };
    const svg = kind.ext === 'svg';
    /* SQUARE, SMALL AND IN A FORM THE DOOR TAKES: as it is. */
    if (kind.kept && size.w === size.h && size.w <= SIDE) return { bytes };
    const photo = kind.ext === 'jpg' || kind.ext === 'heic';
    const form = photo ? ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82'] : ['-s', 'format', 'png'];
    const ext = photo ? 'jpg' : 'png';
    let at = into;
    let n = 0;
    const step = (more: string[]): void => {
      const to = join(dir, `${++n}.${ext}`);
      execFileSync('sips', [...form, ...more, at, '--out', to], { stdio: 'ignore', timeout: 30_000 });
      at = to;
    };
    /* AN SVG IS DRAWN AT THE SIZE IT IS KEPT AT, never drawn small and blown up. */
    step(svg ? ['-Z', String(SIDE)] : []);
    size = sizeOf(at) ?? size;
    if (size.w !== size.h) {
      /* A PHOTO IS CUT, NEVER PADDED: white bars round a banner read as a frame, and a logo comes clear, as a PNG or SVG. */
      if (round || photo) {
        const side = Math.min(size.w, size.h);
        const y = size.h > size.w ? Math.round((size.h - size.w) / 4) : Math.round((size.h - side) / 2);
        const x = size.w > size.h ? Math.round((size.w - side) / 2) : 0;
        step(['-c', String(side), String(side), '--cropOffset', String(y), String(x)]);
      } else {
        const side = Math.max(size.w, size.h);
        step(['-p', String(side), String(side)]);
      }
      size = sizeOf(at) ?? size;
    }
    if (Math.max(size.w, size.h) > SIDE) step(['-Z', String(SIDE)]);
    const made = new Uint8Array(readFileSync(at));
    return made.length > 0 ? { bytes: made } : kind.kept ? { bytes } : { error: not };
  } catch {
    return kind.kept ? { bytes } : { error: not };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The row a picture is for, by its spoken name or its name, and the list's picture field; or the refusal that says why
 * not. Only a list that names `identity.picture` is looked in.
 */
async function rowOf(
  client: Client,
  who: string,
): Promise<{ register: string; seq: number; version: number | null; field: string; name: string; held: string | null; round: boolean } | { refusal: Result<unknown> }> {
  const decls = new Map<string, Decl | null>();
  const declOf = async (register: string): Promise<Decl | null> => {
    if (!decls.has(register)) {
      const got = await client.schema(register);
      decls.set(register, got.ok && isObject(got.value) ? (got.value as Decl) : null);
    }
    return decls.get(register) ?? null;
  };
  const fieldOf = (d: Decl | null): string | null => {
    const f = d?.identity?.picture;
    return typeof f === 'string' && (d?.fields ?? []).some((x) => x.id === f && x.type === 'file') ? f : null;
  };
  const no = (code: string, fix: string): { refusal: Result<unknown> } => ({ refusal: { ok: false, refusal: { code, fix } } });

  let register: string;
  let seq: number;
  if (SPOKEN.test(who)) {
    register = who.slice(0, who.indexOf('#'));
    seq = Number(who.slice(who.indexOf('#') + 1));
  } else {
    const hits = await client.search(who, 20);
    if (!hits.ok) return { refusal: hits };
    /* THE RECORD ANSWERS `{ hits }`, and an older one the hits alone, as the app's search reads both (`search-live.ts`). */
    const said: unknown = hits.value;
    const found = (Array.isArray(said) ? said : isObject(said) && Array.isArray(said.hits) ? said.hits : []) as unknown[];
    const pictured: { register: string; seq: number; title: string }[] = [];
    for (const h of found) {
      if (!isObject(h) || typeof h.register !== 'string' || typeof h.seq !== 'number' || typeof h.title !== 'string') continue;
      if (fieldOf(await declOf(h.register)) !== null) pictured.push({ register: h.register, seq: h.seq, title: h.title });
    }
    const fold = (s: string): string => s.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
    const named = pictured.filter((h) => fold(h.title) === fold(who));
    const one = named.length === 1 ? named[0] : named.length === 0 && pictured.length === 1 ? pictured[0] : undefined;
    if (one === undefined) {
      if (pictured.length === 0) return no('REF_UNKNOWN', `No project, organisation or person called ${who} keeps a picture here. Name them as BrainDog does, or by their row, as things#3.`);
      const said = (named.length > 1 ? named : pictured).slice(0, 5).map((h) => `${h.title} (${h.register}#${h.seq})`).join(', ');
      return no('NAME_AMBIGUOUS', `More than one is called ${who}: ${said}. Name the one you mean by its row.`);
    }
    register = one.register;
    seq = one.seq;
  }
  const field = fieldOf(await declOf(register));
  if (field === null) return no('FIELD_UNKNOWN', `${register} keeps no picture. A project, an organisation or a person does, once their list is up to date.`);
  const got = await client.get(register, seq);
  if (!got.ok) return { refusal: got };
  const row = (isObject(got.value) ? got.value : {}) as Row;
  const decl = await declOf(register);
  const title = typeof decl?.title === 'string' ? row.fields?.[decl.title] : undefined;
  const now = row.fields?.[field];
  const held = isObject(now) && typeof now.sha256 === 'string' ? now.sha256 : null;
  /* A PERSON IS DRAWN ROUND, by their list's `meets:`, so their photo is cut to its middle; anything else is padded. */
  const round = isObject(decl?.meets);
  return { register, seq, version: typeof row.version === 'number' ? row.version : null, field, name: typeof title === 'string' && title.trim() !== '' ? title.trim() : `${register}#${seq}`, held, round };
}
