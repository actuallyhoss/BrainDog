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

const USAGE = 'braindog attach takes a page and its pictures, as in braindog attach audit.html img/before.png --on "Fix the login" [--title <title>] [--visual <id>] [--draft] [--host <host>], or --undo <batch>.';

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
  let values: { on?: string | undefined; title?: string | undefined; visual?: string | undefined; draft?: boolean | undefined; undo?: string | undefined; host?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args,
      strict: true,
      allowPositionals: true,
      options: { on: { type: 'string' }, title: { type: 'string' }, visual: { type: 'string' }, draft: { type: 'boolean' }, undo: { type: 'string' }, host: { type: 'string' } },
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
