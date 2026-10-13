/**
 * `first-screen`: the first screens of a new record, drawn and judged for two people, on every run of the gates.
 *
 *   node tools/gates/first-screen.mjs [root]
 *
 * WHY THIS EXISTS. `tools/people/expect/first-screen.mjs` walks a person through the first run on a fresh self-host,
 * draws the web's own rail and Today at the two moments that matter (just kept, and after the first real thing) and
 * judges each screen: no tour, no count of steps, nobody in People but them, no example entry, no empty place in the
 * rail, one "New page", a true line on the vital signs. It leaves with 1 when a check is red or read nothing. Until
 * this file nothing ran it: its own tests hold the checks, and no gate held the product to them, so a rail that grew
 * an empty place on day 0 was red only for whoever thought to run the command by hand.
 *
 * WHO. Mariam and Sam (`PEOPLE`), because they are the two ends of the walk: one person keeping her own money, and one
 * who starts a record others join. A person is added by adding a file to that list.
 *
 * IT SPAWNS THE COMMAND AND READS WHAT IT PRINTED, and judges nothing itself. The checks, their words and the exit
 * code are the command's; a second copy of that judgement here would be the copy that drifts. One run a person, each
 * in a process of its own, since each opens and closes a self-host.
 *
 * RED NAMES WHO AND WHAT: the person by name, the first check that is red (or that read nothing, which the command
 * also leaves with 1 for), the screen it was on and what it saw. The rest of the command's lines are one command away
 * and are not repeated here.
 *
 * A TREE WITH NO `tools/people` IS NOT THIS GATE'S (a fixture root): it says so and leaves with 3, which `run.mjs`
 * counts as a skip. A tree that has the folder and is missing the command or a person is red.
 *
 * EXIT CODES: nothing (a pass), 1 for a finding, 3 for a tree that holds no people.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { budget } from './lib.mjs';

/** The command, from the root. */
export const CHECK = 'tools/people/expect/first-screen.mjs';

/** Who is walked, from the root. */
export const PEOPLE = ['tools/people/mariam.json', 'tools/people/sam.json'];

/** How long one person's walk may take before it is a finding, in milliseconds. It takes about three seconds. */
const WALK_MS = budget('firstScreen').walkTimeoutMs;

/** A terminal's colours, which the command writes only to a terminal and a hand-fed text may still carry. */
const COLOUR = /\u001b\[\d+m/gu;

/** One check's line as the command prints it: two spaces, the check, its word, what it saw. */
const CHECKED = /^\s+([a-z][\w-]*): (green|red|not seen|does not apply)\. ?(.*)$/u;

/**
 * The command, run as `personFile` under `root`: `{ status, out, err }`, with `status` `null` when it never finished.
 * The gate's default runner; a test hands its own.
 */
export function spawnCheck(root, personFile) {
  const r = spawnSync(process.execPath, [join(root, CHECK), '--as', join(root, personFile)], { cwd: root, encoding: 'utf8', timeout: WALK_MS });
  return { status: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}

/**
 * The first line of `out` that is not a pass, with the screen it stands under: `{ check, word, saw, screen }`, where
 * `word` is `red` or `not seen`. A red anywhere comes before a check that read nothing, since a red is the product's
 * fault and an unread check may be the rig's. `null` when the text holds neither.
 */
export function firstRed(out) {
  const found = { red: null, 'not seen': null };
  let screen = null;
  for (const raw of String(out ?? '').split('\n')) {
    const line = raw.replace(COLOUR, '');
    const m = CHECKED.exec(line);
    if (m === null) {
      if (line.trim() !== '' && !/^\s/u.test(line)) screen = line.trim();
      continue;
    }
    const [, check, word, saw] = m;
    if (Object.hasOwn(found, word) && found[word] === null) found[word] = { check, word, saw, screen };
  }
  return found.red ?? found['not seen'];
}

/** The person's own name, as their file says it; the file's name with a capital where it cannot be read. */
export function nameOf(root, personFile) {
  try {
    const name = JSON.parse(readFileSync(join(root, personFile), 'utf8')).name;
    if (typeof name === 'string' && name.trim() !== '') return name.trim();
  } catch {
    /* said by the caller, which finds the file missing or the command leaving with 2 */
  }
  const stem = basename(personFile, '.json');
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

/** The command's own last word on why it stopped: its `first-screen: red.` line, else the last thing it printed. */
function lastWord({ out, err }) {
  const lines = `${out}\n${err}`.split('\n').map((l) => l.replace(COLOUR, '').trim()).filter((l) => l !== '' && !/ExperimentalWarning|--trace-warnings/u.test(l));
  return lines.find((l) => l.startsWith('first-screen: red.')) ?? lines.at(-1) ?? 'it printed nothing';
}

/**
 * One person's run as a finding, or `null` for a pass. Only a 0 is a pass: 1 is a red or an unread check, 2 is a walk
 * that drew nothing, and anything else is a command that fell over.
 */
export function findingOf(name, ran) {
  if (ran.status === 0) return null;
  if (ran.status === null) return `${name}: the first screens were not drawn and judged within ${WALK_MS / 1000} seconds.`;
  const first = firstRed(ran.out);
  if (first === null) return `${name}: the first-screen checks left with ${ran.status} and named no red check. ${lastWord(ran)}`;
  const where = first.screen === null ? '' : ` on ${first.screen.replace(/, as [^,]+$/u, '')}`;
  const what = first.word === 'red' ? 'is red' : 'read nothing, which is not a pass';
  return `${name}: ${first.check} ${what}${where}. ${first.saw}`.trimEnd();
}

/** Every person walked with `run`, in order: `{ walked, findings }`. A person whose file is not there is a finding. */
export function judge(root, run = spawnCheck, people = PEOPLE) {
  const findings = [];
  let walked = 0;
  for (const file of people) {
    const name = nameOf(root, file);
    if (!existsSync(join(root, file))) {
      findings.push(`${name}: ${file} is not there, so nobody was walked as ${name}.`);
      continue;
    }
    walked += 1;
    const finding = findingOf(name, run(root, file));
    if (finding !== null) findings.push(finding);
  }
  return { walked, findings };
}

export default function firstScreenGate(root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'), run = spawnCheck) {
  const ROOT = resolve(root);
  if (!existsSync(join(ROOT, 'tools', 'people'))) {
    console.log(`  first-screen: there is no tools/people folder in ${ROOT}, so nobody's first screens are judged here. Skipped.`);
    return 3;
  }
  if (!existsSync(join(ROOT, CHECK))) {
    console.error(`  first-screen: ${CHECK} is not there, so nobody's first screens were judged.`);
    return 1;
  }
  const { walked, findings } = judge(ROOT, run);
  if (findings.length === 0) {
    console.log(`  first-screen: ${walked} people walked through the first run, 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(`  ${f}`);
  console.error(
    `\n  first-screen: ${walked} of ${PEOPLE.length} people walked, ${findings.length} finding(s).\n` +
      `  Each line names who and the first check that did not pass. The whole reading is one command away:\n` +
      `  node ${CHECK} --as tools/people/<who>.json`,
  );
  return 1;
}

if (import.meta.main) process.exitCode = firstScreenGate(process.argv[2]) ?? 0;
