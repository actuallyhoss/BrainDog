/**
 * `braindog usecase export|check`: a BrainDog's arrangement as a file somebody else can install
 * (`loop/research-spark.md` S14).
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
 * INSTALLING IS NOT HERE. Planning and installing a pack is an owner's in the app (ADR-060); a token is refused, and this
 * command says where to go instead of offering a verb that cannot work.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { readShared, SHARED_SUFFIX } from '@braindog/declare';
import { refused, type Result } from '@braindog/ports';

import { connect, fixOf, type AgentIo } from './skills.ts';

const USAGE =
  'braindog usecase takes export [--out <file>] [--title <title>] [--version <x.y.z> | --minor] [--example <list>:<n>,<n>] [--signal <word>] [--skill <n>], or check <file>.';

/** A refusal's sentence with its code after it, or the plain sentence for an answer that carries none. */
const saidWithCode = (r: Result<unknown>): string => (refused(r) ? `${r.refusal.fix} (${r.refusal.code})` : fixOf(r));

export async function usecase(args: string[], io: AgentIo): Promise<number> {
  const [verb, ...rest] = args;
  if (verb === 'export') return exportFile(rest, io);
  if (verb === 'check') return check(rest, io);
  if (verb === 'install') {
    io.say('A shared use case is installed from Add-ons in the app, where the owner reads its plan first. Open /packs and choose Install from a file.');
    return 1;
  }
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
    io.say(saidWithCode(answer));
    return refused(answer) && answer.refusal.code === 'UNREACHABLE' ? 3 : 1;
  }
  const got = answer.value as { file?: unknown; doc?: unknown };
  if (typeof got.file !== 'string' || typeof got.doc !== 'object' || got.doc === null) {
    io.say('The record answered in a shape this build does not recognise as a use case.');
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
    io.say('braindog usecase check takes one file, and nothing else.');
    return 1;
  }
  const [file, ...more] = positionals;
  if (!file || more.length > 0) {
    io.say('braindog usecase check takes one file, as in braindog usecase check student-1.0.1.usecase.json.');
    return 1;
  }
  let text: string;
  try {
    text = readFileSync(resolve(io.cwd, file), 'utf8');
  } catch {
    io.say(`${file} could not be read.`);
    return 1;
  }
  const shared = await readShared(text);
  if (!shared.ok) {
    io.say(saidWithCode(shared));
    return 1;
  }
  const u = shared.value.usecase;
  const lists = shared.value.pack?.declarations.filter((d) => d.kind === 'register').length ?? 0;
  const pages = shared.value.pack?.declarations.filter((d) => d.kind === 'page').length ?? 0;
  const needs = u.modules.length === 0 ? 'no module first' : `${u.modules.join(', ')} first`;
  io.out(`${u.title} ${u.version} reads as a use case: ${lists} lists, ${pages} pages and ${shared.value.pack?.seeds.length ?? 0} example rows, needing ${needs}. Nothing was sent.`);
  return 0;
}
