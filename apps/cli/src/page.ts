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
 * `push` SENDS WHAT `parseDog` READ, WHOLE, AND WHO IS HOLDING THE KEY DECIDES WHAT BECOMES OF IT (DIRECTION 38: an
 * agent changes a page and the person accepts it in Decide). It is tried first through `setDeclaration`, the door the
 * app's own editor uses, and an owner's session is applied there and then. `setDeclaration` is an ADMIN route, and
 * `packages/record/src/index.ts`'s `admin()` refuses any `token` principal outright (`NEEDS_BROWSER_SESSION`), and every
 * bearer this CLI holds, `braindog login` included, is a token to the record (ADR-060). So that one refusal is not a
 * failure here: the same declaration is filed with `propose` as one `change`, `{ declaration_id, to }` with `to` the
 * whole declaration (`grammar pages`, `to_change_one`), and `push` prints the question's number and says it waits on
 * Decide. Nothing is applied until the person answers it. Any other refusal is shown as the record said it.
 *
 * THE SAME FILE PUSHED TWICE IS ONE QUESTION. The record joins an agent run's repeat by its cause and says so, and a
 * key that is no run is not joined there, so the questions still open are read first and one already asking for this
 * same declaration is named instead of asked again (`feed.ts` does the same for a feed).
 *
 * `check` runs the parse and the kernel's own validation locally and sends nothing at all: it is how somebody finds
 * out a `.dog` file is broken before it is anybody else's problem.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { dogName, dogText, parseDog, storedOf, type DogParsed } from '@braindog/dog';
import { validateDeclaration } from '@braindog/kernel';
import { refused, type Result } from '@braindog/ports';

import { refuse } from './json.ts';
import { connect, type AgentIo, type Connected } from './skills.ts';

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
  const name = nameOf(parsed.value);
  if (out.ok) {
    io.out(`${name} pushed to ${at.to.key}.`);
    io.answer?.({ value: { page: name, host: at.to.key } });
    return 0;
  }
  /* ONLY THE REFUSAL THAT SAYS "A TOKEN": anything else the record said about the file itself is the answer. */
  if (!refused(out) || out.refusal.code !== 'NEEDS_BROWSER_SESSION') return refuse(io, out);
  return ask(at.client, name, parsed.value, io);
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A value as text with every map's keys in order, so two declarations that say the same thing read the same. */
const canon = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canon).join(',')}]`
    : isObject(v)
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`)
          .join(',')}}`
      : (JSON.stringify(v) ?? 'null');

/** The most rows one governance read answers with: the record clamps it there (`packages/kernel/src/govern.ts`). */
const DECIDE_PAGE = 200;

/**
 * The open question that already asks for this declaration, by the name the record hands this caller; `''` for one
 * found under no name, and `null` for none. A page at a time, as `feed.ts` reads the add-ons waiting.
 */
async function waitingChange(client: Connected['client'], id: string, to: unknown): Promise<Result<string | null>> {
  const want = canon(to);
  let cursor: string | undefined;
  for (let pages = 0; pages < 100; pages++) {
    const got = await client.governance({ register: 'suggestion', limit: DECIDE_PAGE, ...(cursor === undefined ? {} : { cursor }) });
    if (!got.ok) return got;
    if (!Array.isArray(got.value)) return { ok: true, value: null };
    for (const s of got.value)
      if (isObject(s) && s.body_kind === 'change' && isObject(s.body) && s.body.declaration_id === id && canon(s.body.to) === want)
        return { ok: true, value: typeof s.id === 'string' ? s.id : '' };
    const last: unknown = got.value.at(-1);
    if (got.value.length < DECIDE_PAGE || !isObject(last) || typeof last.id !== 'string') return { ok: true, value: null };
    cursor = last.id;
  }
  return { ok: true, value: null };
}

/** A question's number as a person says it. A handle (`q.<id>`) is not one, and is left out of the sentence. */
const numbered = (id: unknown): string | null => (typeof id === 'string' && /^SG[1-9][0-9]*$/u.test(id) ? id : null);

/** A key's push: the declaration filed as one change on Decide, or the question already waiting for it named. */
async function ask(client: Connected['client'], name: string, body: Record<string, unknown>, io: AgentIo): Promise<number> {
  const id = `page.${name}`;
  const to = { id, kind: 'page', body };
  const before = (found: string | null): number => {
    io.out(`${name} is already waiting${found === null ? '' : ` as ${found}`}. It waits on Decide.`);
    io.answer?.({ value: { page: name, waits: true, asked: false, ...(found === null ? {} : { question: found }) } });
    return 0;
  };

  const waiting = await waitingChange(client, id, to);
  if (!waiting.ok) return refuse(io, waiting);
  if (waiting.value !== null) return before(numbered(waiting.value));

  /* A TEMPLATE'S TITLE IS A PATTERN (`{{name}}`), which is no name for a page, so its own name is said instead. */
  const title = typeof body.title === 'string' && body.title.trim() !== '' && !body.title.includes('{{') ? body.title : name;
  const filed = await client.call('propose', { question: `Use this version of the ${title} page?`, body_kind: 'change', body: { declaration_id: id, to } });
  if (!filed.ok) return refuse(io, filed);
  const value = isObject(filed.value) ? filed.value : {};
  const number = numbered(value.id);
  if (value.joined === true) return before(number);
  /* ANSWERED BEFORE, AND NOTHING FILED: the record says what the person said, and that is passed on as it came. */
  if (value.answered !== undefined && typeof value.said === 'string') {
    io.out(value.said);
    io.answer?.({ value: { page: name, waits: false, asked: false, said: value.said } });
    return 0;
  }
  io.out(`${name} asked${number === null ? '' : ` as ${number}`}. It waits on Decide.`);
  io.answer?.({ value: { page: name, waits: true, asked: true, ...(number === null ? {} : { question: number }) } });
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
