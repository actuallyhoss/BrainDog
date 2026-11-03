/**
 * `braindog attach <file.html> [pictures...] --on "<thing>"`: pictures first through the file door, then the page in one
 * call, so no call carries more than one of them. `--draft` hands the version in as a draft, which waits for a person to
 * keep or throw away in BrainDog; with an agent's token every version is one by default (`attachVisual`). `--undo <batch>` takes it back as the receipt says.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

import { fixOf, refused, type Result } from '@braindog/ports';

import { printable } from './clip.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { refuse } from './json.ts';
import { isObject, type AgentIo } from './skills.ts';

const USAGE =
  'braindog attach puts files on a task or a project as they are, as in braindog attach brief.pdf artifact.html --to "Fix the login" [--name <name>], or lists them with --list --to "Fix the login". With --on it draws a page and its pictures as a visual instead: braindog attach audit.html img/before.png --on "Fix the login" [--title <title>] [--visual <id>] [--draft]. Either takes [--host <host>], or --undo <batch>.';

/** The most one attached file may be, as the file door holds it (`ATTACHED_MOST`), asked here so a large one never leaves the machine. */
export const ATTACHED_MOST = 25 * 1024 * 1024;

/** The most a page may be, as the record holds it (`VISUAL_PAGE_MOST`), asked here so a long one never leaves the machine. */
export const PAGE_MOST = 512 * 1024;
/** The most one picture may be, as the file door holds it (`FILE_MOST`). */
export const PICTURE_MOST = 2 * 1024 * 1024;

/** A picture by what its name ends with. The file door reads its first bytes again, so this only picks what to send. */
const PICTURE_END = /\.(?:png|jpe?g|gif|webp|avif)$/iu;

/** Every address a page writes where a picture may be named: tag attributes, `srcset` candidates and CSS `url()`. */
const NAMED = [
  /\s(?:src|href|poster|xlink:href|background)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/giu,
  /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*))\s*\)/giu,
];
const SRCSET = /\ssrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/giu;

/**
 * The page with `./` taken off the paths it names, since the record matches a picture by the name it was handed under,
 * and every relative picture path it names that ends as a picture does.
 */
export function pagePictures(html: string): { page: string; names: string[] } {
  const page = html.replace(/(\s(?:src|href|poster|srcset|xlink:href|background)\s*=\s*["']?)\.\//giu, '$1').replace(/(url\(\s*["']?)\.\//giu, '$1');
  const names = new Set<string>();
  const take = (v: string | undefined): void => {
    const name = (v ?? '').trim();
    if (name === '' || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/iu.test(name) || name.includes('..') || !PICTURE_END.test(name)) return;
    names.add(name);
  };
  for (const re of NAMED) for (const m of page.matchAll(re)) take(m[1] ?? m[2] ?? m[3]);
  for (const m of page.matchAll(SRCSET)) for (const part of (m[1] ?? m[2] ?? '').split(',')) take(part.trim().split(/\s+/u)[0]);
  return { page, names: [...names] };
}

/** A picture named on the command line, as the page names it: its path from the page's folder, or its own name. */
export function nameFrom(folder: string, file: string): string {
  const rel = relative(folder, resolve(file));
  const inside = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  return (inside ? rel : basename(file)).split(sep).join('/');
}

type Attached = { visual?: unknown; version?: unknown; batch?: unknown; said?: unknown; unchanged?: unknown };

/** `braindog attach`, and its exit code: 0 kept, 1 refused, 3 unreachable. */
export async function attachCommand(args: string[], io: AgentIo): Promise<number> {
  let values: { on?: string | undefined; to?: string | undefined; name?: string | undefined; list?: boolean | undefined; title?: string | undefined; visual?: string | undefined; draft?: boolean | undefined; undo?: string | undefined; host?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args,
      strict: true,
      allowPositionals: true,
      options: { on: { type: 'string' }, to: { type: 'string' }, name: { type: 'string' }, list: { type: 'boolean' }, title: { type: 'string' }, visual: { type: 'string' }, draft: { type: 'boolean' }, undo: { type: 'string' }, host: { type: 'string' } },
    }));
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
    if (positionals.length > 0 || values.on !== undefined || values.draft === true) {
      io.say(USAGE);
      return 1;
    }
    const back: Result<unknown> = await client.call('undoOwn', { batch: values.undo });
    if (!back.ok) return refuse(io, back, unreachable(back) ? `${to.key} did not answer, so nothing was taken back.` : printable(fixOf(back)));
    io.answer?.({ value: back.value });
    const v = isObject(back.value) ? back.value : {};
    io.out(printable(typeof v.say === 'string' ? v.say : 'Taken back.'));
    for (const line of Array.isArray(v.lines) ? v.lines : []) if (typeof line === 'string') io.out(printable(line));
    return 0;
  }

  /* ── files as they are, on a thing (`--to`), or the files a thing holds (`--list`) ── */
  if (values.to !== undefined) {
    if (values.on !== undefined || values.draft === true || values.visual !== undefined || values.to.trim() === '') {
      io.say(USAGE);
      return 1;
    }
    return attachFiles(values.to.trim(), positionals, values.name, values.list === true, client, to.key, io);
  }

  const [file, ...more] = positionals;
  if (file === undefined || values.on === undefined || values.on.trim() === '') {
    io.say(USAGE);
    return 1;
  }
  const at = resolve(io.cwd, file);
  if (!existsSync(at) || !statSync(at).isFile()) {
    io.say(`There is no file at ${file}. Try: braindog attach audit.html --on "Fix the login"`);
    return 1;
  }
  if (statSync(at).size > PAGE_MOST) {
    io.say(`${file} is larger than ${PAGE_MOST / 1024} KB. Keep pictures beside it rather than inside it, or split it.`);
    return 1;
  }
  const folder = dirname(at);
  const { page, names } = pagePictures(readFileSync(at, 'utf8'));

  /* WHAT GOES UP: every picture the page names that is beside it, then every one named here, each once by its name. */
  const files = new Map<string, string>();
  for (const name of names) {
    const path = resolve(folder, name);
    if (existsSync(path) && statSync(path).isFile()) files.set(name, path);
  }
  for (const extra of more) {
    const path = resolve(io.cwd, extra);
    if (!existsSync(path) || !statSync(path).isFile()) {
      io.say(`There is no picture at ${extra}.`);
      return 1;
    }
    files.set(nameFrom(folder, path), path);
  }

  const pictures: { name: string; sha256: string }[] = [];
  for (const [name, path] of files) {
    if (statSync(path).size > PICTURE_MOST) {
      io.say(`${name} is larger than 2 MB. Make it smaller and attach again.`);
      return 1;
    }
    const kept = await client.putFile(new Uint8Array(readFileSync(path)));
    if (!kept.ok) return refuse(io, kept, unreachable(kept) ? `${to.key} did not answer, so nothing was attached.` : printable(`${name}: ${fixOf(kept)}`));
    pictures.push({ name, sha256: kept.value.sha256 });
  }

  const done: Result<Attached> = await client.call<Attached>('attachVisual', {
    on: values.on.trim(),
    page,
    pictures,
    ...(values.title === undefined ? {} : { title: values.title }),
    ...(values.visual === undefined ? {} : { visual: values.visual }),
    ...(values.draft === true ? { draft: true } : {}),
  });
  if (!done.ok) {
    if (refused(done) && (done.refusal.code === 'ROUTE_UNKNOWN' || done.refusal.code === 'NOT_IN_THIS_BUILD'))
      return refuse(io, done, 'Your BrainDog is older than this command and keeps no pages yet. It will once it is updated.');
    return refuse(io, done, unreachable(done) ? `${to.key} did not answer, so nothing was attached.` : printable(fixOf(done)));
  }
  io.answer?.({ value: done.value });
  const v = done.value;
  io.out(printable(typeof v.said === 'string' ? v.said : 'Attached.'));
  if (typeof v.batch === 'string' && v.batch !== '') io.out(printable(`To undo it: braindog attach --undo ${v.batch}`));
  return 0;
}

type Kept = { id?: unknown; said?: unknown; batch?: unknown; unchanged?: unknown };
type Client = ReturnType<typeof clientFor>;

const sized = (n: number): string => (n < 1024 ? `${n} B` : n < 1_048_576 ? `${Math.round(n / 1024)} KB` : `${(n / 1_048_576).toFixed(1)} MB`);

/**
 * `braindog attach <file>... --to <thing>`: each file through the file door under its own name (`?name=`), then
 * `attachFile` with the hash the door answered, so the record reads the file again and decides what it is. One refused
 * stops the rest, with its sentence. `--list` reads what the thing holds instead.
 */
async function attachFiles(on: string, paths: string[], name: string | undefined, list: boolean, client: Client, host: string, io: AgentIo): Promise<number> {
  const unreachable = (r: Result<unknown>): boolean => refused(r) && r.refusal.code === 'UNREACHABLE';
  const old = (r: Result<unknown>): boolean => refused(r) && (r.refusal.code === 'ROUTE_UNKNOWN' || r.refusal.code === 'NOT_IN_THIS_BUILD');
  if (list) {
    if (paths.length > 0) {
      io.say(USAGE);
      return 1;
    }
    const got: Result<unknown> = await client.call('attachments', { on });
    if (!got.ok) return refuse(io, got, unreachable(got) ? `${host} did not answer.` : old(got) ? 'Your BrainDog is older than this command and keeps no attachments yet.' : printable(fixOf(got)));
    io.answer?.({ value: got.value });
    const files = isObject(got.value) && Array.isArray(got.value.attachments) ? got.value.attachments : [];
    if (files.length === 0) io.out(printable(`Nothing is attached to ${isObject(got.value) ? String(got.value.on) : on}.`));
    for (const f of files) if (isObject(f)) io.out(printable(`${String(f.name)}  ${String(f.kind)}, ${sized(Number(f.bytes ?? 0))}  ${String(f.id)}`));
    return 0;
  }
  if (paths.length === 0 || (name !== undefined && paths.length > 1)) {
    io.say(USAGE);
    return 1;
  }
  for (const given of paths) {
    const path = resolve(io.cwd, given);
    if (!existsSync(path) || !statSync(path).isFile()) {
      io.say(`There is no file at ${given}.`);
      return 1;
    }
    if (statSync(path).size > ATTACHED_MOST) {
      io.say(`${given} is larger than ${ATTACHED_MOST / 1024 / 1024} MB. Attach a smaller file.`);
      return 1;
    }
    const called = name ?? basename(path);
    const kept = await client.putFile(new Uint8Array(readFileSync(path)), called);
    if (!kept.ok) return refuse(io, kept, unreachable(kept) ? `${host} did not answer, so nothing was attached.` : printable(`${called}: ${fixOf(kept)}`));
    const done: Result<Kept> = await client.call<Kept>('attachFile', { on, name: called, sha256: kept.value.sha256 });
    if (!done.ok) return refuse(io, done, unreachable(done) ? `${host} did not answer, so ${called} was not attached.` : old(done) ? 'Your BrainDog is older than this command and keeps no attachments yet. It will once it is updated.' : printable(`${called}: ${fixOf(done)}`));
    io.answer?.({ value: done.value });
    io.out(printable(typeof done.value.said === 'string' ? done.value.said : `Attached ${called}.`));
  }
  return 0;
}
