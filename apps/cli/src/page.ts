/**
 * `braindog page pull|push|check`: a page's declaration as a file, one page to one file, in the dialect
 * `@braindog/dog` prints and parses (`docs/06-PAGES.md` §1).
 *
 * THE FILE IS WHAT THE RECORD HOLDS. `pull` reads the stored declaration through `arrangement({ page })`, the read an
 * agent makes before it proposes a change to a page, and writes `dogText` of its body: the same bytes the app's source
 * view shows and downloads, because both read the answer with `storedOf` and print it with `dogText`. It used to cut
 * the page's live answer down to a short list of keys, which wrote a summary nobody could push back without losing
 * the rest of the page. A page made for each row of a list has no declaration of its own, so its template's is
 * written, and the command says so.
 *
 * `push` sends what `parseDog` read through `setDeclaration`, the same door the app's own editor uses, "the same lint a
 * pack gets." `check` runs the parse and the kernel's own validation locally and sends nothing at all: it is how
 * somebody finds out a `.dog` file is broken before it is anybody else's problem.
 *
 * `push` IS GATED WHERE THIS FILE HAS NO SAY. `setDeclaration` is an ADMIN route, and `packages/record/src/index.ts`'s
 * `admin()` refuses any `token` principal outright ("Open this from the app; a token cannot change what this record
 * is"), and every bearer this CLI holds, `braindog login` included, is a token to the record (ADR-060). So `push` is
 * built exactly as asked and is refused with that sentence until the record grows a door for a proven session that is
 * not a browser cookie. That is a change to `packages/record` and `packages/host`, neither of which this file owns.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { dogName, dogText, parseDog, storedOf, type DogParsed } from '@braindog/dog';
import { validateDeclaration } from '@braindog/kernel';

import { refuse } from './json.ts';
import { connect, type AgentIo } from './skills.ts';

/** A file the parser refused, said with its name and the line, so the person can go straight to it. */
const unread = (file: string, no: Extract<DogParsed, { ok: false }>): string => `${file}, line ${String(no.line)}: ${no.fix}`;

/** The page a body declares. `parseDog` and `storedOf` both refuse a body whose `page` is not text. */
const nameOf = (body: { page?: unknown }): string => (typeof body.page === 'string' ? body.page : '');

const USAGE = 'braindog page takes pull <slug>, push <file> or check <file>, and --host and --out where a verb takes them.';

/** `braindog page pull|push|check`, over the real terminal, and the exit code the command decides. */
export async function page(args: string[], io: AgentIo): Promise<number> {
  const [verb, ...rest] = args;
  if (verb === 'pull') return pull(rest, io);
  if (verb === 'push') return push(rest, io);
  if (verb === 'check') return check(rest, io);
  io.say(USAGE);
  return 1;
}

async function pull(args: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined; out?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { host: { type: 'string' }, out: { type: 'string' } } }));
  } catch {
    io.say('braindog page pull takes one slug, and --host and --out.');
    return 1;
  }
  const [slug, ...more] = positionals;
  if (!slug || more.length > 0) {
    io.say('braindog page pull takes one slug, as in braindog page pull invoicing.');
    return 1;
  }

  const at = await connect(values.host, io);
  if (typeof at === 'number') return at;

  const answer = await at.client.call('arrangement', { page: slug });
  if (!answer.ok) return refuse(io, answer);
  const stored = storedOf(answer.value, slug);
  if ('fix' in stored) {
    io.say(stored.fix);
    return 1;
  }

  const name = nameOf(stored.body);
  const file = resolve(io.cwd, values.out ?? dogName(name));
  /* `dogText` ENDS WITH ITS OWN LINE BREAK, so the file is the bytes the app shows, with nothing added here. */
  writeFileSync(file, dogText(stored.body));
  io.out(
    stored.template === null
      ? `${name} written to ${file}.`
      : `${slug} is one of the pages ${name} makes, one for each row, so ${name}'s source was written to ${file}.`,
  );
  /* ONE PAGE, ONE FILE, and those are the two facts a caller needs to open what was written, with the version a later
     change is read against and, for a page made from a template, the template's name. */
  io.answer?.({ value: { page: name, file, version: stored.version, ...(stored.template === null ? {} : { template: stored.template }) } });
  return 0;
}

async function push(args: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { host: { type: 'string' } } }));
  } catch {
    io.say('braindog page push takes one file, and --host.');
    return 1;
  }
  const [file, ...more] = positionals;
  if (!file || more.length > 0) {
    io.say('braindog page push takes one file, as in braindog page push invoicing.dog.');
    return 1;
  }

  let text: string;
  try {
    text = readFileSync(resolve(io.cwd, file), 'utf8');
  } catch {
    io.say(`${file} could not be read.`);
    return 1;
  }
  const parsed = parseDog(text);
  if (!parsed.ok) {
    io.say(unread(file, parsed));
    return 1;
  }

  const at = await connect(values.host, io);
  if (typeof at === 'number') return at;

  /* THE BODY AS READ, WHOLE: the file is the declaration, so there is nothing to cut or fill in before it is sent. */
  const out = await at.client.call('setDeclaration', { body: parsed.value });
  if (!out.ok) return refuse(io, out);
  const name = nameOf(parsed.value);
  io.out(`${name} pushed to ${at.to.key}.`);
  io.answer?.({ value: { page: name, host: at.to.key } });
  return 0;
}

async function check(args: string[], io: AgentIo): Promise<number> {
  let positionals: string[];
  try {
    ({ positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: {} }));
  } catch {
    io.say('braindog page check takes one file, and nothing else.');
    return 1;
  }
  const [file, ...more] = positionals;
  if (!file || more.length > 0) {
    io.say('braindog page check takes one file, as in braindog page check invoicing.dog.');
    return 1;
  }

  let text: string;
  try {
    text = readFileSync(resolve(io.cwd, file), 'utf8');
  } catch {
    io.say(`${file} could not be read.`);
    return 1;
  }
  const parsed = parseDog(text);
  if (!parsed.ok) {
    io.say(unread(file, parsed));
    return 1;
  }

  /* NO `installed` MAP: `check` runs with no connection at all, so `DEPENDENCY_UNRESOLVED` (a `requires` that names a
     register nobody has installed) is not asked about here. Everything else `pageBody` checks is answerable from the
     file alone. */
  const name = nameOf(parsed.value);
  const fault = validateDeclaration({ id: `page.${name}`, kind: 'page', body: parsed.value });
  if (fault) {
    io.say(fault.fix);
    return 1;
  }
  const blocks = parsed.value.blocks;
  io.out(`${name} reads as a page. Nothing was sent.`);
  io.answer?.({ value: { page: name, blocks: Array.isArray(blocks) ? blocks.length : 0 } });
  return 0;
}
