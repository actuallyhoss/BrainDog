/**
 * `braindog picture <project or person> <file or https link>`: a project's logo or a person's photo, saved as the picture
 * they are drawn by in BrainDog (his word of 4 November: "preferably if the agent can find a photo in the context, it
 * should save it as project or people icon").
 *
 * THE BYTES FIRST, THEN ONE WRITE. The picture goes up through the file door (`putFile`, the 2 MB door a file field
 * uses, which types it by its bytes and takes PNG, JPEG, GIF, WebP and AVIF), then the row's picture field is set to it
 * with `update`, so it lands, or asks, as any other write of this caller's would.
 *
 * ONE ALREADY THERE IS HIS. The record files an agent's write that would replace a picture already chosen as a question
 * for the owner (`pictureKept` in `packages/record`), and this says so; `--said "<his words>"` passes what he told the
 * agent, and it lands. A person's own login replaces it.
 *
 * WHO IS NAMED BY THEIR NAME OR THEIR ROW (`things#3`, `people#12`). A name is looked up among the lists that keep a
 * picture: the one whose name it is, else the one row found; several found are named back, and nothing is written.
 *
 * SMALL BEFORE IT LEAVES THE MACHINE WHERE IT CAN BE. On a Mac a picture over 256 KB is made 512 a side by `sips` first;
 * anywhere else, or if that fails, it goes as it is, under the door's 2 MB.
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
  'braindog picture saves a project\'s logo or a person\'s photo as the picture they are drawn by: braindog picture "<project or person>" <file or https link> [--said "<what the owner told you>"] [--host <host>]. A picture already there is the owner\'s to replace, so an agent\'s is asked of him. To take one back: braindog picture --undo <batch>.';

/** The most one picture may be, as the file door holds it (`FILE_MOST`). */
export const PICTURE_MOST = 2 * 1024 * 1024;

/** Over this, a Mac makes the picture smaller before it is sent. */
const SHRINK_FROM = 256 * 1024;

/** A row by its spoken name, `things#3`. */
const SPOKEN = /^[a-z][a-z0-9_]*#[1-9][0-9]*$/u;

type Client = ReturnType<typeof clientFor>;
type Row = { id?: unknown; seq?: unknown; version?: unknown; register?: unknown; fields?: Record<string, unknown> };
type Decl = { title?: unknown; name?: unknown; identity?: { picture?: unknown } | null; fields?: { id?: unknown; type?: unknown }[] };

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
  const bytes = smaller(read.bytes);
  if (looksLikeSvg(bytes)) {
    io.say('An SVG is not kept as a picture. Save it as a PNG and try again.');
    return 1;
  }
  if (bytes.length > PICTURE_MOST) {
    io.say(`That picture is larger than 2 MB. Make it smaller and try again.`);
    return 1;
  }

  /* ── who it is of ── */
  const found = await rowOf(client, who.trim());
  if ('refusal' in found) return refuse(io, found.refusal, unreachable(found.refusal) ? `${to.key} did not answer, so nothing was saved.` : printable(fixOf(found.refusal)));
  const { register, seq, version, field, name, held } = found;

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
  if (asked) {
    io.out(printable(`${name} already has a picture, so the owner was asked: ${typeof asked.question === 'string' ? asked.question : 'change it?'}`));
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

/** An SVG by its first bytes, which the file door refuses: a document that can carry script is never a picture. */
function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart().toLowerCase();
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
}

/**
 * The picture made 512 a side on a Mac, where it is over `SHRINK_FROM` and `sips` can read it; else as it came. PNG stays
 * PNG, so a logo keeps its clear ground, and anything else becomes a JPEG.
 */
function smaller(bytes: Uint8Array): Uint8Array {
  if (process.platform !== 'darwin' || bytes.length <= SHRINK_FROM || looksLikeSvg(bytes)) return bytes;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const dir = mkdtempSync(join(tmpdir(), 'braindog-picture-'));
  try {
    const into = join(dir, 'in');
    const out = join(dir, png ? 'out.png' : 'out.jpg');
    writeFileSync(into, bytes);
    execFileSync('sips', ['-Z', '512', '-s', 'format', png ? 'png' : 'jpeg', into, '--out', out], { stdio: 'ignore', timeout: 20_000 });
    const made = new Uint8Array(readFileSync(out));
    return made.length > 0 && made.length < bytes.length ? made : bytes;
  } catch {
    return bytes;
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
): Promise<{ register: string; seq: number; version: number | null; field: string; name: string; held: string | null } | { refusal: Result<unknown> }> {
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
    const pictured: { register: string; seq: number; title: string }[] = [];
    for (const h of hits.value) if (fieldOf(await declOf(h.register)) !== null) pictured.push(h);
    const fold = (s: string): string => s.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
    const named = pictured.filter((h) => fold(h.title) === fold(who));
    const one = named.length === 1 ? named[0] : named.length === 0 && pictured.length === 1 ? pictured[0] : undefined;
    if (one === undefined) {
      if (pictured.length === 0) return no('REF_UNKNOWN', `No project or person called ${who} keeps a picture here. Name them as BrainDog does, or by their row, as things#3.`);
      const said = (named.length > 1 ? named : pictured).slice(0, 5).map((h) => `${h.title} (${h.register}#${h.seq})`).join(', ');
      return no('NAME_AMBIGUOUS', `More than one is called ${who}: ${said}. Name the one you mean by its row.`);
    }
    register = one.register;
    seq = one.seq;
  }
  const field = fieldOf(await declOf(register));
  if (field === null) return no('FIELD_UNKNOWN', `${register} keeps no picture. A project or a person does, once their list is up to date.`);
  const got = await client.get(register, seq);
  if (!got.ok) return { refusal: got };
  const row = (isObject(got.value) ? got.value : {}) as Row;
  const decl = await declOf(register);
  const title = typeof decl?.title === 'string' ? row.fields?.[decl.title] : undefined;
  const now = row.fields?.[field];
  const held = isObject(now) && typeof now.sha256 === 'string' ? now.sha256 : null;
  return { register, seq, version: typeof row.version === 'number' ? row.version : null, field, name: typeof title === 'string' && title.trim() !== '' ? title.trim() : `${register}#${seq}`, held };
}
