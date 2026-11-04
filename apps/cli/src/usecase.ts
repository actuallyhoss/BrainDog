/**
 * `braindog usecase list|export|check|install`: a BrainDog's arrangement as a file somebody else can install.
 *
 * EXPORT IS A READ, so a signed-in machine may save one: `exportUseCase` answers the modules, the use case's lists and
 * pages, the pages placed by hand, the voice and the labels, and no row unless `--example list:1,2` names it. `--minor`
 * counts a minor on from the later of the installed version and the one last shared, where a patch is the default;
 * `--signal` puts in a word that suggests the use case, and `--skill 3` a skill's name and trigger. The version shared is
 * kept only from the app's share form, because keeping it is a settings write, which is an owner's in a browser.
 *
 * A REFUSAL IS SAID AS THE RECORD SAYS IT, with its code after it, so a file refused for a block kind this build does not
 * draw reads as that, and the code is there for whoever wrote the file.
 *
 * CHECK SENDS NOTHING. It runs the file through `readShared`, the door the record and the app read a shared file
 * through, so a file that would be refused (too large, a credential in it, a block kind nothing draws) is found out here.
 *
 * INSTALL ASKS, IT NEVER INSTALLS. Planning and installing a pack is an owner's in the app (ADR-060), and no token reaches
 * it. So `install <file|url>` files a `pack` proposal carrying the file, which the record reads through the same door the
 * app does, plans with the modules it names, and puts in front of the owner on Decide. It prints that link. A file this
 * build would refuse is refused here first, and nothing is sent.
 *
 * A USE CASE ON OFFER IS INSTALLED BY ITS ID, the way an agent asks over MCP: `install student` reads the arrangement, and
 * files a `pack` proposal `{ "install": "usecase-student" }`, which the record plans with the modules it builds on. An id
 * not on offer is refused here with the ids that are, and nothing is sent. `list` says the use cases on this BrainDog, the
 * one speaking, and those on offer, from the same read.
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { readShared, SHARED_SUFFIX } from '@braindog/declare';
import { reachOf } from '@braindog/declare/catalogue';
import { refused, type Result } from '@braindog/ports';
import { moduleName } from '@braindog/seed/usecases/names';

import { installFromCatalogue, loadSource, reachLines, sdkVerb } from './catalogue.ts';
import { oneLine, printable } from './clip.ts';
import { refuse } from './json.ts';
import { untilAccepted } from './links.ts';
import { causeOf, connect, fixOf, joinedSaid, type AgentIo, type Connected } from './skills.ts';

const USAGE =
  'braindog starter takes new <id>, check <file>, diff <a> <b>, publish <file> --to <folder> [--sign <key file>], key <file> --author <name>, search [words] --from <catalogue>, preview <file> [--port <n>], list [--host <host>], export [--out <file>] [--title <title>] [--version <x.y.z> | --minor] [--example <list>:<n>,<n>] [--signal <word>] [--skill <n>], or install <id|file|url> [--from <catalogue>] [--version <x.y.z>] [--host <host>].';

/**
 * A refusal's sentence with its code after it, or the plain sentence for an answer that carries none, as one clean line:
 * `readShared` refusing a file is free to name what the file holds, and the file may be anybody's.
 */
const saidWithCode = (r: Result<unknown>): string => oneLine(refused(r) ? `${r.refusal.fix} (${r.refusal.code})` : String(fixOf(r)));

export async function usecase(args: string[], io: AgentIo): Promise<number> {
  const [verb, ...rest] = args;
  if (verb === 'list') return list(rest, io);
  if (verb === 'export') return exportFile(rest, io);
  if (verb === 'check') return check(rest, io);
  if (verb === 'install') return installFile(rest, io);
  const sdk = sdkVerb(verb);
  if (sdk) return sdk(rest, io);
  io.say(USAGE);
  return 1;
}

/** `courses:1,2` read as `{ courses: [1, 2] }`, or the sentence saying what was wrong. */
export function examplesOf(given: readonly string[]): { ok: true; value: Record<string, number[]> } | { ok: false; fix: string } {
  const out: Record<string, number[]> = {};
  for (const one of given) {
    const m = /^([a-z][a-z0-9_]*):(\d+(?:,\d+)*)$/u.exec(one);
    if (!m) return { ok: false, fix: `--example ${one} is a list and row numbers, as in --example courses:1,2.` };
    out[m[1] as string] = [...(out[m[1] as string] ?? []), ...(m[2] as string).split(',').map(Number)];
  }
  return { ok: true, value: out };
}

async function exportFile(args: string[], io: AgentIo): Promise<number> {
  let values: {
    host?: string | undefined;
    out?: string | undefined;
    title?: string | undefined;
    version?: string | undefined;
    usecase?: string | undefined;
    example?: string[] | undefined;
    minor?: boolean | undefined;
    signal?: string[] | undefined;
    skill?: string[] | undefined;
  };
  try {
    ({ values } = parseArgs({
      args,
      strict: true,
      options: {
        host: { type: 'string' },
        out: { type: 'string' },
        title: { type: 'string' },
        version: { type: 'string' },
        usecase: { type: 'string' },
        example: { type: 'string', multiple: true },
        minor: { type: 'boolean' },
        signal: { type: 'string', multiple: true },
        skill: { type: 'string', multiple: true },
      },
    }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  const examples = examplesOf(values.example ?? []);
  if (!examples.ok) {
    io.say(examples.fix);
    return 1;
  }
  const skills = (values.skill ?? []).map(Number);
  if (skills.some((n) => !Number.isInteger(n) || n < 1)) {
    io.say('--skill is a row number from Skills, as in --skill 3.');
    return 1;
  }
  if (values.minor && values.version !== undefined) {
    io.say('--minor counts the version on for you, so give it or --version, not both.');
    return 1;
  }

  const at = await connect(values.host, io);
  if (typeof at === 'number') return at;
  const answer = await at.client.exportUseCase({
    ...(values.title === undefined ? {} : { title: values.title }),
    ...(values.version === undefined ? {} : { version: values.version }),
    ...(values.usecase === undefined ? {} : { usecase: values.usecase }),
    ...(Object.keys(examples.value).length === 0 ? {} : { examples: examples.value }),
    ...(values.minor ? { step: 'minor' as const } : {}),
    ...(values.signal === undefined ? {} : { signals: values.signal }),
    ...(skills.length === 0 ? {} : { skills }),
  });
  if (!answer.ok) {
    return refuse(io, answer, saidWithCode(answer));
  }
  const got = answer.value as { file?: unknown; doc?: unknown };
  if (typeof got.file !== 'string' || typeof got.doc !== 'object' || got.doc === null) {
    io.say('BrainDog answered in a shape this build does not recognise as a starter.');
    return 1;
  }
  const file = resolve(io.cwd, values.out ?? got.file);
  writeFileSync(file, `${JSON.stringify(got.doc, null, 2)}\n`);
  const shared = Object.keys(examples.value).length === 0 ? 'with no rows of yours in it' : 'with the example rows you named';
  io.out(`${got.file.slice(0, -SHARED_SUFFIX.length)} written to ${file}, ${shared}.`);
  return 0;
}

async function check(args: string[], io: AgentIo): Promise<number> {
  let positionals: string[];
  try {
    ({ positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: {} }));
  } catch {
    io.say('braindog starter check takes one file, and nothing else.');
    return 1;
  }
  const [file, ...more] = positionals;
  if (!file || more.length > 0) {
    io.say('braindog starter check takes one file, as in braindog starter check student-1.0.1.usecase.json.');
    return 1;
  }
  /* READ AS PUBLISH, PREVIEW, DIFF, SEARCH AND YANK ALREADY DO, through `catalogue.ts`'s `loadSource`, so a
     `.usecase.yaml` file checks the same as the JSON it means. */
  const loaded = await loadSource(file, io);
  if (!loaded.ok) {
    io.say(loaded.fix);
    return 1;
  }
  const shared = await readShared(loaded.text);
  if (!shared.ok) {
    refuse(io, shared, saidWithCode(shared));
    return 1;
  }
  /* THE FILE'S WORDS ARE ITS AUTHOR'S, and `readShared` takes a title, author or license holding ESC and BEL without a
     word, so the lines are built from a scrubbed copy. */
  const u = printable(shared.value.usecase);
  const lists = shared.value.pack?.declarations.filter((d) => d.kind === 'register').length ?? 0;
  const pages = shared.value.pack?.declarations.filter((d) => d.kind === 'page').length ?? 0;
  const needs = u.modules.length === 0 ? 'no module first' : `${u.modules.join(', ')} first`;
  io.out(`${u.title} ${u.version} reads as a starter: ${lists} lists, ${pages} pages and ${shared.value.pack?.seeds.length ?? 0} example rows, needing ${needs}. Nothing was sent.`);
  io.out(`  By ${u.author}, ${u.license}.`);
  for (const line of reachLines(reachOf(shared.value))) io.out(line);
  return 0;
}

/** An address this command reads a file from: https, or http on this machine only. */
function addressOf(given: string): URL | null {
  let url: URL;
  try {
    url = new URL(given);
  } catch {
    return null;
  }
  if (url.protocol === 'https:') return url;
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? url : null;
}

/** The most a use-case file is read to, from a path or an address: what the hosts read one to (`PUBLIC_MOST_BYTES`), a little over what one may weigh, so `readShared`'s refusal is the one said for a file just over. */
export const USECASE_READ_MOST_BYTES = 300 * 1024;
/** How long reading one from an address may take, the body included, as on the hosts (`PUBLIC_TIMEOUT_MS`). */
export const USECASE_READ_TIMEOUT_MS = 10_000;

const TOO_LARGE = (where: string) => `The file at ${where} is larger than a shared starter may be, so it was not read.`;

/**
 * The most a catalogue's own file is read to. ITS INDEX LISTS EVERY PLUGIN AT EVERY VERSION, so it grows with each release and
 * is no starter: held to a starter's 300 KB, the index the hosts serve passed it on 31 Oct (416 KB on 3 Nov), and every
 * `pack install <id>` with no `--from`, and an import's adapter by its id, answered that the host had no catalogue at all.
 */
export const CATALOGUE_READ_MOST_BYTES = 4 * 1024 * 1024;

/** The text of a use-case file, from a path or an address, or the sentence saying why it could not be read. */
export async function readSource(
  given: string,
  io: AgentIo,
  timeoutMs = USECASE_READ_TIMEOUT_MS,
  mostBytes = USECASE_READ_MOST_BYTES,
): Promise<{ ok: true; text: string } | { ok: false; fix: string }> {
  if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(given)) {
    try {
      const path = resolve(io.cwd, given);
      if (statSync(path).size > mostBytes) return { ok: false, fix: TOO_LARGE(given) };
      return { ok: true, text: readFileSync(path, 'utf8') };
    } catch {
      return { ok: false, fix: `${given} could not be read.` };
    }
  }
  const url = addressOf(given);
  if (url === null) return { ok: false, fix: `${given} is not an https address. A starter is read from https, or from http on this machine.` };
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const got = await fetch(url, { redirect: 'error', signal });
    if (!got.ok) {
      await got.body?.cancel().catch(() => undefined);
      return { ok: false, fix: `${url.host} answered ${String(got.status)} for that file.` };
    }
    /* COUNTED AS IT ARRIVES, so a length that lies, or none, reads no further than the cap. */
    if (Number(got.headers.get('content-length') ?? '0') > mostBytes) {
      await got.body?.cancel().catch(() => undefined);
      return { ok: false, fix: TOO_LARGE(url.host) };
    }
    const parts: Uint8Array[] = [];
    let total = 0;
    if (got.body) {
      const reader = got.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > mostBytes) {
          await reader.cancel().catch(() => undefined);
          return { ok: false, fix: TOO_LARGE(url.host) };
        }
        parts.push(value);
      }
    }
    return { ok: true, text: Buffer.concat(parts).toString('utf8') };
  } catch {
    return { ok: false, fix: signal.aborted ? `${url.host} took longer than ${String(Math.round(timeoutMs / 1000) || timeoutMs / 1000)} seconds, so nothing was read.` : `${url.host} did not answer with the file.` };
  }
}

async function installFile(args: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined; from?: string | undefined; version?: string | undefined; 'trust-key'?: boolean | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { host: { type: 'string' }, from: { type: 'string' }, version: { type: 'string' }, 'trust-key': { type: 'boolean' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  const [given, ...more] = positionals;
  if (!given || more.length > 0) {
    io.say('braindog starter install takes one file or address, as in braindog starter install reading-club-1.0.0.usecase.json.');
    return 1;
  }
  /* FROM A CATALOGUE BY ID, held to the checksum the index gives, then asked for as a file. */
  if (values.from !== undefined) return ID.test(given) ? installFromCatalogue(given, values.from, values.version, values.host, io, 'usecase', false, false, values['trust-key'] === true) : (io.say('--from names a catalogue to install a starter from by its id, as in braindog starter install study --from ./catalogue.'), 1);
  if (values.version !== undefined) {
    io.say('--version picks a version from a catalogue, so it goes with --from.');
    return 1;
  }
  if (ID.test(given)) return installOffered(given, values.host, io);
  /* AS `check` READS ITS FILE: YAML turns to JSON text here too, so `install <file>.usecase.yaml` reads. */
  const read = await loadSource(given, io);
  if (!read.ok) {
    io.say(read.fix);
    return 1;
  }
  /* REFUSED HERE BEFORE ANYTHING IS SENT, by the door the record will read it through. */
  const shared = await readShared(read.text);
  if (!shared.ok) {
    refuse(io, shared, saidWithCode(shared));
    return 1;
  }
  return proposeFile(read.text, shared.value.usecase, values.host, io);
}

/**
 * A `pack` proposal carrying a file already read through `readShared`, and the Decide link it prints. The record reads the
 * file through the same door again and plans it; nothing is installed until the owner accepts it.
 */
export async function proposeFile(text: string, file: { usecase: string; title: string; version: string }, host: string | undefined, io: AgentIo, question?: string): Promise<number> {
  /* The question and the line are built from a scrubbed copy; `text`, the file itself, is sent byte for byte. */
  const u = printable({ title: file.title, version: file.version });
  const at = await connect(host, io);
  if (typeof at === 'number') return at;
  /* ASKED ONCE, keyed as its pack is (`usecase-<id>`), so the file and the use case on offer by its id join. */
  const answer = await at.client.call<{ id: string; joined?: true; said?: string }>('propose', {
    question: question ?? `Install ${u.title} ${u.version}?`,
    body_kind: 'pack',
    body: { file: text },
    ...causeOf(`install#${USE_CASE}${file.usecase}`),
  });
  if (!answer.ok) {
    return refuse(io, answer, saidWithCode(answer));
  }
  const id = (answer.value as { id?: unknown }).id;
  if (typeof id !== 'string') {
    io.say('BrainDog took the question and did not say which one it is. Open Decide in the app.');
    return 1;
  }
  const joined = joinedSaid(answer.value);
  io.out(`${joined !== null ? joined : question === undefined ? `Asked the owner to install ${u.title} ${u.version}.` : `Asked the owner: ${oneLine(question)}`} ${untilAccepted(at.to, id)}`);
  return 0;
}

/* ── a use case on offer, by its id ─────────────────────────────────────── */

/** A use case's id, bare or as its pack: `student` or `usecase-student`. A file or an address always has a dot or a slash. */
const ID = /^[a-z][a-z0-9-]*$/u;
const USE_CASE = 'usecase-';

/** What `arrangement` answers that these two commands read. */
type Offer = { id: string; usecase?: string; summary?: string; modules?: string[] };
type Arrangement = { packs: { id: string; version?: string; off?: boolean }[]; offer: Offer[]; updates?: { id: string; from: string; to: string }[]; voice?: { pack?: string | null } };

const isArrangement = (v: unknown): v is Arrangement =>
  typeof v === 'object' && v !== null && Array.isArray((v as Arrangement).packs) && Array.isArray((v as Arrangement).offer);

/**
 * A starter by the name the app gives it: `usecase-founder` as "Solo founder", one name everywhere, and one this build
 * does not ship by its id in words: `usecase-reading-club` as "Reading club".
 */
const idWords = (id: string): string => moduleName(id);

/** The arrangement, or the exit code after saying why it could not be read. */
async function arrangementOf(host: string | undefined, io: AgentIo): Promise<{ at: Connected; value: Arrangement } | number> {
  const at = await connect(host, io);
  if (typeof at === 'number') return at;
  const answer = await at.client.call<unknown>('arrangement', {});
  if (!answer.ok) {
    return refuse(io, answer, saidWithCode(answer));
  }
  if (!isArrangement(answer.value)) {
    io.say('BrainDog answered in a shape this build does not recognise as its arrangement.');
    return 1;
  }
  return { at, value: answer.value };
}

async function list(args: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, options: { host: { type: 'string' } } }));
  } catch {
    io.say('braindog starter list takes --host <host>, and nothing else.');
    return 1;
  }
  const read = await arrangementOf(values.host, io);
  if (typeof read === 'number') return read;
  /* AN OFFER'S NAME AND SUMMARY ARE A USE CASE'S WORDS, written by whoever wrote its file, not by the person reading them. */
  const { packs, offer, voice } = printable(read.value);
  const on = packs.filter((p) => p.id.startsWith(USE_CASE));
  const offered = offer.filter((o) => o.id.startsWith(USE_CASE) || typeof o.usecase === 'string');
  if (on.length === 0) io.out('No starter is set up on this BrainDog yet.');
  else {
    io.out('On this BrainDog:');
    for (const p of on) {
      const notes = [p.version === undefined ? '' : p.version, p.off ? 'turned off' : '', voice?.pack === p.id ? 'speaking' : ''].filter((n) => n !== '');
      io.out(`  ${p.id.slice(USE_CASE.length)}  ${idWords(p.id)}${notes.length ? ` (${notes.join(', ')})` : ''}`);
    }
  }
  if (offered.length === 0) io.out('No other starter is on offer here.');
  else {
    io.out('On offer, installed with braindog starter install <id>:');
    for (const o of offered) {
      const summary = o.summary ? ` ${o.summary.replace(/\.?$/u, '.')}` : '';
      const needs = o.modules?.length ? ` Builds on ${o.modules.join(', ')}.` : '';
      io.out(`  ${o.id.replace(USE_CASE, '')}  ${o.usecase ?? idWords(o.id)}.${summary}${needs}`);
    }
  }
  return 0;
}

/** `install student`: a `pack` proposal for a use case on offer, as an agent files one over MCP. */
async function installOffered(given: string, host: string | undefined, io: AgentIo): Promise<number> {
  const id = given.startsWith(USE_CASE) ? given : `${USE_CASE}${given}`;
  const read = await arrangementOf(host, io);
  if (typeof read === 'number') return read;
  const { at, value } = read;
  const offered = value.offer.find((o) => o.id === id);
  /* ONE ON AT AN OLDER VERSION THAN OFFERED is updated by the same proposal. */
  const update = value.updates?.find((u) => u.id === id);
  if (offered === undefined && update === undefined) {
    const held = value.packs.find((p) => p.id === id);
    const ids = value.offer.filter((o) => o.id.startsWith(USE_CASE)).map((o) => o.id.slice(USE_CASE.length));
    const others = ids.length === 0 ? 'No other starter is on offer here.' : `On offer: ${ids.join(', ')}.`;
    io.say(held ? `${idWords(id)} is already on this BrainDog. ${others}` : `There is no starter called ${id.slice(USE_CASE.length)} on offer here. ${others}`);
    return 1;
  }
  const title = oneLine(offered?.usecase ?? idWords(id));
  const answer = await at.client.call<{ id: string; joined?: true; said?: string }>('propose', {
    question: update ? `Update ${title} from ${update.from} to ${update.to}?` : `Set this BrainDog up for ${title}?`,
    body_kind: 'pack',
    body: { install: id },
    ...causeOf(`install#${id}`),
  });
  if (!answer.ok) {
    return refuse(io, answer, saidWithCode(answer));
  }
  const filed = (answer.value as { id?: unknown }).id;
  if (typeof filed !== 'string') {
    io.say('BrainDog took the question and did not say which one it is. Open Decide in the app.');
    return 1;
  }
  const asked = update ? `update ${title} from ${update.from} to ${update.to}` : `set this BrainDog up for ${title}`;
  const joined = joinedSaid(answer.value);
  io.out(`${joined ?? `Asked the owner to ${asked}.`} ${untilAccepted(at.to, filed)}`);
  return 0;
}
