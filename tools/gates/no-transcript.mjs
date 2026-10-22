/**
 * `no-transcript`: nothing BrainDog runs on a person's machine reads an agent's session transcript (AGT-B10 job 4).
 *
 *   node tools/gates/no-transcript.mjs [root]
 *
 * TRANSCRIPTS ARE NEVER READ. Every hook event Claude Code sends names the session's transcript in
 * `transcript_path`, a file holding every word of the conversation and every file the agent opened, and the hooks
 * are handed it after every tool call now that the beat runs there (`apps/cli/src/beat.ts`). Nothing reads it today
 * (`eventOf` takes the session and the folder alone), and nothing failed if something started to. This is that failure.
 *
 * WHAT A READ IS, a line at a time, comments blanked:
 *   - THE FIELD: `transcript_path`, or `transcriptPath`, named in code. Reading it is the first step of every way to
 *     open the file or send it on, so the name alone is the finding.
 *   - A CLIENT'S SESSION FOLDER: `.claude/projects` (Claude Code's transcripts), `.claude/transcripts`, or
 *     `.codex/sessions` (Codex's), written as a path or as two words joined (`join(home, '.claude', 'projects')`).
 *
 * WHERE: `apps/cli/src` and `apps/cli/hooks` (the command and its hook scripts), `packages/<name>/src`, and `packs/`,
 * which is everything that runs on the machine or ships to one. A test may name the field, to prove it is ignored.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { filesOf, textOf } from './public-clean.mjs';

/** What is read: the command, its hook scripts, every package's source, and the packs. */
const WHERE = /^(?:apps\/cli\/(?:src|hooks)\/|packages\/[^/]+\/src\/|packs\/)/u;
const SOURCE = /\.(?:[cm]?[jt]s|svelte|sh|ps1)$/u;
/** The exit of a gate that could not run, which is no pass. */
const COULD_NOT_RUN = 3;
const isTest = (rel) => /\.test\.[cm]?[jt]s$/u.test(rel) || /(?:^|\/)(?:tests?|fixtures)\//u.test(rel);

/** Each thing a read looks like, and the words its finding says. */
export const READS = [
  { re: /\btranscript_?path\b/iu, says: "reads the hook event's transcript_path" },
  { re: /\.claude[\\/]+(?:projects|transcripts)\b/iu, says: "opens Claude Code's session folder" },
  { re: /['"`]\.claude['"`]\s*,\s*['"`](?:projects|transcripts)['"`]/iu, says: "opens Claude Code's session folder" },
  { re: /\.codex[\\/]+sessions\b/iu, says: "opens Codex's session folder" },
  { re: /['"`]\.codex['"`]\s*,\s*['"`]sessions['"`]/iu, says: "opens Codex's session folder" },
];

/**
 * The text with its comments made spaces and every line kept where it was: `/* *\/` and `//` for the languages written
 * with them, `#` for the shell and PowerShell. A `//` inside a word (`https://`) is not one. Strings are kept, because a
 * name in a string (`event['transcript_path']`) is a read.
 */
export function blankComments(text, rel) {
  const blank = (s) => s.replace(/[^\n]/gu, ' ');
  if (/\.(?:sh|ps1)$/u.test(rel)) return text.replace(/<#[\s\S]*?#>/gu, blank).replace(/(^|\s)#.*$/gmu, (m, lead) => lead + blank(m.slice(lead.length)));
  return text.replace(/\/\*[\s\S]*?\*\//gu, blank).replace(/(^|[^:\w])\/\/.*$/gmu, (m, lead) => lead + blank(m.slice(lead.length)));
}

/** Each line of a file that reads a transcript, as `{ line, says }`. */
export function transcriptReads(text, rel) {
  const out = [];
  blankComments(text, rel)
    .split('\n')
    .forEach((line, i) => {
      const hit = READS.find((r) => r.re.test(line));
      if (hit) out.push({ line: i + 1, says: hit.says });
    });
  return out;
}

export default function noTranscript(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const ROOT = resolve(root);
  const all = existsSync(ROOT) ? filesOf(ROOT) : null;
  /* A GATE THAT READ NOTHING HAS NOT PASSED. Exit 3 is "could not run". */
  if (all === null || all.length === 0) {
    console.log(`  no-transcript: no file to read under ${ROOT}`);
    return COULD_NOT_RUN;
  }
  const files = all.filter((rel) => WHERE.test(rel) && SOURCE.test(rel) && !isTest(rel));
  if (files.length === 0) {
    console.log(`  no-transcript: nothing the command, a package or a pack runs, under ${ROOT}`);
    return COULD_NOT_RUN;
  }
  const findings = [];
  for (const rel of files) {
    const text = textOf(ROOT, rel);
    if (text === null) continue;
    for (const { line, says } of transcriptReads(text, rel)) findings.push(`  ${rel}:${String(line)} ${says}`);
  }
  if (findings.length === 0) {
    console.log(`  no-transcript: ${String(files.length)} file(s), 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  no-transcript: ${String(files.length)} file(s), ${String(findings.length)} finding(s).\n` +
      '  An agent session transcript is never read by anything BrainDog runs: the hook event is read for its session\n' +
      '  and its folder alone.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = noTranscript(process.argv[2]) ?? 0;
