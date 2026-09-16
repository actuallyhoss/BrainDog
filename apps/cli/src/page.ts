/**
 * `braindog page pull|push|check`: a page's declaration as a file, one page to one file, in the
 * terse dialect `@braindog/dog` prints and parses (`docs/06-PAGES.md` §1).
 *
 * PULL AND PUSH ARE ONE DIALECT, TWO DIRECTIONS. `pull` asks the record for a page and writes what
 * `dogText` prints; `push` reads that text back with `parseDog` and sends it through `setDeclaration`,
 * the same door the app's own editor uses — "the same lint a pack gets." `check` runs the parse and
 * the kernel's own validation locally and sends nothing at all: it is how somebody finds out a `.dog`
 * file is broken before it is anybody else's problem.
 *
 * `push` IS GATED WHERE THIS FILE HAS NO SAY. `setDeclaration` is an ADMIN route, and
 * `packages/record/src/index.ts`'s `admin()` refuses any `token` principal outright — "Open this
 * from the app; a token cannot change what this record is" — and every bearer this CLI holds,
 * `braindog login` included, is a token to the record. So `push` is built exactly as asked and will
 * be refused with that sentence until the record grows a door for a proven session that is not a
 * browser cookie, the way `/api/keys/put` and `/api/keys/open` are a door around the vault's own
 * gate. That is a change to `packages/record` and `packages/host`, neither of which this file owns.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { dogName, dogText, parseDog, type DogBlock, type DogPage } from '@braindog/dog';
import { validateDeclaration, type Json } from '@braindog/kernel';
import { refused } from '@braindog/ports';

import { connect, fixOf, type AgentIo } from './skills.ts';

/** The keys `DogBlock` prints. Anything else on a live answer is a reading, a row count or a value the record computed, never declared. */
const BLOCK_KEYS = ['kind', 'heading', 'span', 'source', 'where', 'columns', 'cells', 'order', 'target', 'limit', 'empty', 'authored', 'body'] as const;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * A live `page` answer, cut to the shape `dogText` reads.
 *
 * `client.page(slug)` ANSWERS `readPage`'S RESULT: the declaration's own keys, spread at the top,
 * plus `blocks` where each one carries what the kernel read on it — `rows`, `matched`, `readings`,
 * `values` and the rest. None of those are printed, because `DogBlock` does not carry them; cutting
 * to `BLOCK_KEYS` here is the same cut `dogText`'s own field access already makes silently, done
 * explicitly so a computed key never rides along into the text by accident.
 */
function dogPageOf(answer: unknown): DogPage | null {
  if (!isObject(answer) || typeof answer.page !== 'string' || typeof answer.title !== 'string' || !Array.isArray(answer.blocks)) return null;
  const blocks: DogBlock[] = answer.blocks.map((raw) => {
    const b = isObject(raw) ? raw : {};
    const cut: Record<string, unknown> = {};
    for (const key of BLOCK_KEYS) if (b[key] !== undefined) cut[key] = b[key];
    return { ...cut, kind: typeof b.kind === 'string' ? b.kind : '' } as DogBlock;
  });
  const page: DogPage = { page: answer.page, title: answer.title, blocks };
  if (isObject(answer.for) && typeof answer.for.register === 'string')
    page.for = { register: answer.for.register, ...(typeof answer.for.where === 'string' ? { where: answer.for.where } : {}) };
  if (isObject(answer.nav) && typeof answer.nav.section === 'string' && typeof answer.nav.order === 'number')
    page.nav = { section: answer.nav.section, order: answer.nav.order };
  if (Array.isArray(answer.requires)) page.requires = answer.requires.filter((r): r is string => typeof r === 'string');
  return page;
}

/** What `setDeclaration` and `validateDeclaration` both read: the page's own document, JSON-clean. */
const rawBodyOf = (page: DogPage): Record<string, Json> => JSON.parse(JSON.stringify(page)) as Record<string, Json>;

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

  const answer = await at.client.page(slug);
  if (!answer.ok) {
    io.say(fixOf(answer));
    return refused(answer) && answer.refusal.code === 'UNREACHABLE' ? 3 : 1;
  }
  const dogPage = dogPageOf(answer.value);
  if (!dogPage) {
    io.say(`${slug} came back in a shape this build does not recognise as a page.`);
    return 1;
  }

  const text = dogText(dogPage);
  const file = resolve(io.cwd, values.out ?? dogName(dogPage.page));
  writeFileSync(file, `${text}\n`);
  io.out(`${dogPage.page} written to ${file}.`);
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
    io.say(parsed.fix);
    return 1;
  }

  const at = await connect(values.host, io);
  if (typeof at === 'number') return at;

  const out = await at.client.call('setDeclaration', { body: rawBodyOf(parsed.value) });
  if (!out.ok) {
    io.say(fixOf(out));
    return refused(out) && out.refusal.code === 'UNREACHABLE' ? 3 : 1;
  }
  io.out(`${parsed.value.page} pushed to ${at.to.key}.`);
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
    io.say(parsed.fix);
    return 1;
  }

  /* NO `installed` MAP: `check` runs with no connection at all, so `DEPENDENCY_UNRESOLVED` — a
     `requires` that names a register nobody has installed — is not asked about here. Everything
     else `pageBody` checks is answerable from the file alone. */
  const fault = validateDeclaration({ id: `page.${parsed.value.page}`, kind: 'page', body: rawBodyOf(parsed.value) });
  if (fault) {
    io.say(fault.fix);
    return 1;
  }
  io.out(`${parsed.value.page} reads as a page. Nothing was sent.`);
  return 0;
}
