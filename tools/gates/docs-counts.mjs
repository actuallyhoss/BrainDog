/**
 * `docs-counts`: a number written in a document is a claim about the code, so it is read against the code.
 *
 *   node tools/gates/docs-counts.mjs
 *
 * THE CLASS IS DOC (`loop/finish/defects.md` §4.1): a count written in prose goes stale the day the list it counts
 * moves, and nothing notices. The documents gave sizes for the MCP tools, the resource templates and the kinds of
 * declaration that the code no longer had (defects T6 to T8), and the README counted the gates beside a runner that
 * registered more. Every one of those was found by somebody counting by eye. The house rule is to write no count at all
 * and to name where the code keeps it; this is the rule's enforcement for the lists a stranger is most likely to be
 * told the size of.
 *
 * EACH COUNT IS READ WHERE THE CODE KEEPS IT, never from a number typed here. `COUNTS` below names the file and the
 * table for each list, and the count is taken by reading that table the way a person does, one entry a line. A table
 * this gate cannot find is a finding, never a skip: a marker that moved would otherwise turn a whole list's check off
 * without a word.
 *
 * TEXT, NOT IMPORT, as `closed-lists` reads `kinds.ts`. Importing the modules would load the packages they import,
 * so this gate's negative fixture would have to be a working copy of those packages rather than a few lines each.
 * `run.mjs` runs every gate when it is imported, so it could not be imported here at all.
 *
 * A CLAIM NAMES ITS NOUN. "Sixteen MCP tools", "22 gates", "nine kinds of declaration" are claims; "the eight kinds" is
 * not one this gate reads, because this corpus says it of declaration kinds, block kinds, schedule kinds and connector
 * auth kinds alike, and a rule that read it as any one of them would misread the rest. A qualified count ("four CSS
 * gates", "three new refusal codes") is about some of a list, not all of it, so only the bare noun is read.
 *
 * BLOCK KINDS ARE READ IN DIGITS ONLY. `closed-lists` already holds every spelled-out count of them (its check 4),
 * over a wider corpus than this one and with its own account of which sentences are history, so a second reading of
 * the same words here would report one line from two gates.
 *
 * WHAT IS READ IS `README.md` AND EVERY DOCUMENT IN `docs/` THAT IS NOT HISTORICAL, by the label `docs/00-README.md`
 * gives it. A HISTORICAL document is "a build-time plan the code overtook", which nobody rewrites to match the tree, so
 * a count in it was true on its day and is not a claim about this one. Where a label names CONTRACT sections and calls
 * the rest HISTORICAL, the named sections are read and the rest is not. A document the index does not list is read
 * whole, because an unlabelled document has not been excused of anything.
 *
 * TWO LEDGERS, AND AN ENTRY THAT EXCUSES NOTHING IS RED. `DEBT` is what was already stale when this gate landed, by
 * file and line: the unit that makes a listed line true deletes its entry. `NOT_A_TOTAL` is a count that is not about
 * the whole list today (a decision's title, a size the text says the list used to have, a subset), each with its
 * reason. Both are matched on the words and the file rather than the line, so an entry follows its sentence when the
 * document above it is edited. An entry whose words are no longer there is a finding at the repository's own root, as
 * an unused exemption is in `shell-words`, because an entry left behind would excuse the same words written stale again.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository this file sits in, which is the only root the ledgers are about. */
const HOME = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/** The text between the first `open` and the first `close` after it, or `null` when either is missing. */
const between = (text, open, close) => {
  const at = text.indexOf(open);
  if (at < 0) return null;
  const end = text.indexOf(close, at + open.length);
  return end < 0 ? null : text.slice(at, end);
};

/** How many times a pattern matches in a piece of text, or `null` for no text. */
const counted = (text, pattern) => (text === null ? null : [...text.matchAll(pattern)].length);

/**
 * Each list a document may state the size of: where the code keeps it, and how that table is counted.
 *
 * `count` ANSWERS `null` WHEN THE TABLE IS NOT WHERE IT LOOKS, and a count of none is read the same way: every one of
 * these lists has members, so none found is a marker that moved rather than a list that emptied.
 */
const COUNTS = [
  {
    key: 'gates',
    noun: 'gates',
    file: 'tools/gates/run.mjs',
    table: '`GATES`',
    /* ONE ROW A GATE, TWO SPACES IN, which is how every entry of the runner's table is written. */
    count: (src) => counted(between(src, 'const GATES = [', '\n];'), /^ {2}\['[\w-]+',/gm),
  },
  {
    key: 'blockKinds',
    noun: 'block kinds',
    file: 'packages/render/src/kinds.ts',
    table: '`TABLE`',
    /* THE SAME READING AS `closed-lists`' `realKindCount`, so the two gates cannot disagree about the number. */
    count: (src) => counted(between(src, 'const TABLE = {', '} as const satisfies'), /^ {2}[a-zA-Z]+:\s*\{/gm),
  },
  {
    key: 'tools',
    noun: 'MCP tools',
    file: 'packages/mcp/src/index.ts',
    table: '`TOOLS`',
    /* A TOOL'S OWN KEYS SIT FOUR SPACES IN, and the keys of its input schema sit deeper. */
    count: (src) => counted(between(src, 'export const TOOLS', '\n];'), /^ {4}name: '/gm),
  },
  {
    key: 'templates',
    noun: 'MCP resource templates',
    file: 'packages/mcp/src/index.ts',
    table: '`TEMPLATES`',
    count: (src) => counted(between(src, 'export const TEMPLATES', '] as const;'), /\buriTemplate:/g),
  },
  {
    key: 'declarationKinds',
    noun: 'declaration kinds',
    file: 'packages/kernel/src/declare.ts',
    table: '`KINDS`',
    count: (src) => {
      const list = /^export const KINDS = \[([^\]]*)\] as const;/m.exec(src);
      return list === null ? null : counted(list[1], /'[a-z]+'/g);
    },
  },
  {
    key: 'refusalCodes',
    noun: 'refusal codes',
    file: 'packages/ports/src/index.ts',
    table: '`REFUSAL_CODES`',
    /* THE REGISTRY IS A SPREAD OF ITS FAMILIES, so each family the spread names is found and counted, and a family it
       names that is not declared as a list is the whole count unread, not a smaller one. */
    count: (src) => {
      const spread = /^export const REFUSAL_CODES = \[([\s\S]*?)\] as const;/m.exec(src);
      if (spread === null) return null;
      let total = 0;
      for (const [, family] of spread[1].matchAll(/\.\.\.([A-Z_]+)/g)) {
        const n = counted(between(src, `const ${family} = [`, '] as const;'), /'[A-Z][A-Z0-9_]*'/g);
        if (n === null || n === 0) return null;
        total += n;
      }
      return total;
    },
  },
];

/**
 * A number as this corpus writes one: digits with their commas, or words up to nine hundred and ninety-nine.
 *
 * WORDS BECAUSE THE CORPUS SPELLS ITS COUNTS OUT ("a hundred and twelve codes in nine families") and a gate that read
 * digits alone would pass every stale count written that way.
 */
const ONES = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const WORD = new Map([
  ...ONES.map((w, i) => [w, i + 1]),
  ...TEENS.map((w, i) => [w, i + 10]),
  ...TENS.map((w, i) => [w, (i + 2) * 10]),
]);
const UNDER_A_HUNDRED = `(?:(?:${TENS.join('|')})(?:[- ](?:${ONES.join('|')}))?|${TEENS.join('|')}|${ONES.join('|')})`;
const NUMBER = `(\\d{1,3}(?:,\\d{3})*|(?:a|${ONES.join('|')})\\s+hundred(?:\\s+and\\s+${UNDER_A_HUNDRED})?|${UNDER_A_HUNDRED})`;

/** What a number as written is worth, or `NaN` for words this reading does not know. */
function valueOf(said) {
  const text = said.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^\d/.test(text)) return Number(text.replace(/,/g, ''));
  const hundred = /^(\S+) hundred(?: and (.+))?$/.exec(text);
  if (hundred) {
    const lead = hundred[1] === 'a' ? 1 : (WORD.get(hundred[1]) ?? Number.NaN);
    return lead * 100 + (hundred[2] === undefined ? 0 : valueOf(hundred[2]));
  }
  return text.split(/[- ]/).reduce((sum, w) => sum + (WORD.get(w) ?? Number.NaN), 0);
}

/**
 * The shapes a claim about each list takes: the number, then the noun, with nothing between but the qualifiers that
 * still mean the whole list ("fixed" and "MCP" before tools, "resource" and "MCP" before templates).
 *
 * `\s+` SPANS A LINE BREAK, because a sentence wraps where the editor wrapped it and a count split across two lines is
 * the same claim.
 */
const CLAIMS = {
  gates: new RegExp(`\\b${NUMBER}\\s+gates\\b`, 'gi'),
  blockKinds: /\b(\d{1,3}(?:,\d{3})*)\s+(?:block\s+kinds|kinds\s+of\s+blocks?)\b/gi,
  tools: new RegExp(`\\b${NUMBER}\\s+(?:(?:fixed|MCP)\\s+)?tools\\b`, 'gi'),
  templates: new RegExp(`\\b${NUMBER}\\s+(?:(?:resource|MCP)\\s+)?templates\\b`, 'gi'),
  refusalCodes: new RegExp(`\\b${NUMBER}\\s+(?:refusal\\s+codes|codes\\s+in\\s+[a-z-]+\\s+families)\\b`, 'gi'),
  declarationKinds: new RegExp(`\\b${NUMBER}\\s+(?:declaration\\s+kinds|kinds\\s+of\\s+declarations?)\\b`, 'gi'),
};

/**
 * What was stale when this gate landed, read off the tree on 26 September 2026.
 *
 * `line` IS WHERE THE WORDS WERE THAT DAY, for a reader to find them; the match is on `file` and `said`. The unit that
 * makes a line true deletes its entry here in the same change, and the gate is red until it does.
 */
const DEBT = [
  {
    file: 'docs/16-DECISIONS.md',
    line: 1255,
    said: 'a hundred and twelve codes in nine families',
    owner: 'no unit yet: ADR-057 states the registry at the size it had when it was written',
  },
];

/**
 * Counts that are not a claim about the whole list today, each with the reason it is not.
 *
 * A NEW ENTRY HERE IS A SENTENCE SOMEBODY DECIDED NOT TO REWRITE, so it carries its reason, and a list nobody can read
 * is a list that grows. A count that is simply wrong belongs in `DEBT` or, better, in no list at all.
 */
const NOT_A_TOTAL = [
  { file: 'docs/10-MCP.md', line: 97, said: '40 tools', why: 'the design the section refuses, a tool per register' },
  { file: 'docs/10-MCP.md', line: 214, said: 'eight tools', why: 'what the first token ceiling was set for' },
  { file: 'docs/16-DECISIONS.md', line: 174, said: 'Eight MCP tools', why: "ADR-008's title, the decision as it was taken" },
  { file: 'docs/16-DECISIONS.md', line: 186, said: 'fourteen tools', why: 'the size the surface had when the ceiling was raised' },
  { file: 'docs/16-DECISIONS.md', line: 1204, said: 'fourteen tools', why: 'the size the surface had when the ceiling was raised' },
  { file: 'docs/22-FRONTEND.md', line: 297, said: 'eight tools', why: 'the surface before the page resource, in the past tense' },
  { file: 'docs/22-FRONTEND.md', line: 468, said: 'four gates', why: "the colour rule's own gates, not the runner's table" },
  { file: 'docs/22-FRONTEND.md', line: 489, said: '16 block kinds', why: 'a moment in the build plan, not the size of the table' },
  { file: 'docs/30-BLUEPRINT.md', line: 622, said: 'Two refusal codes', why: 'two named codes of the registry, not the registry' },
];

/** The words of a claim, as the ledgers compare them: one space between words, and no case. */
const words = (said) => said.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * The part of a document that is read: all of it, the named sections of it, or none of it, by its label.
 *
 * THE LINES THAT ARE NOT READ ARE BLANKED RATHER THAN CUT, so a line number this gate prints is the line in the file.
 * A heading inside a fenced block is not a heading, and `40` carries `# packs/...` and `# fixtures/...` lines inside
 * its fences, one of them within the §6 this gate reads.
 */
function readablePart(text, label) {
  if (label === undefined) return text;
  const parts = label.split(';').map((part) => part.trim());
  const rest = (parts.at(-1) ?? '').split(/[\s,]/)[0];
  if (rest !== 'HISTORICAL') return text;
  const sections = parts.slice(0, -1).flatMap((part) => [...part.matchAll(/§(\d+(?:\.\d+)*)/g)].map((m) => m[1]));
  if (sections.length === 0) return null;
  let fenced = false;
  let keep = false;
  let depth = 0;
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return keep ? line : '';
      }
      const heading = fenced ? null : /^(#{1,6})\s+(\d+(?:\.\d+)*)?/.exec(line);
      if (heading) {
        const number = heading[2];
        if (number !== undefined && sections.some((s) => number === s || number.startsWith(`${s}.`))) {
          keep = true;
          depth = heading[1].length;
        } else if (keep && heading[1].length <= depth) keep = false;
      }
      return keep ? line : '';
    })
    .join('\n');
}

/** Each document's label, from the index's table: `| NN | [Title](file.md) | LABEL | ... |`. */
function labelsOf(index) {
  const labels = new Map();
  for (const row of index.matchAll(/^\| \d{2} \| \[[^\]]*\]\(([^)]+\.md)\) \| ([^|]+) \|/gm))
    labels.set(`docs/${row[1]}`, row[2].trim());
  return labels;
}

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned (`52 §5.1` step 3). Nothing in this file happens
 * on import. The root defaults to `BRAINDOG_GATE_ROOT`, which is how `self-test` aims it at its seeded tree, and then
 * to this repository. It returns 1 for a finding, 3 when there was no prose to read, and falls off the end for a pass.
 */
export default function docsCounts(root = process.env.BRAINDOG_GATE_ROOT ?? HOME) {
  const findings = [];
  const at = (...parts) => join(root, ...parts);

  /* ── the counts, from the code ── */
  const code = new Map();
  for (const list of COUNTS) {
    const file = at(...list.file.split('/'));
    const n = existsSync(file) ? list.count(readFileSync(file, 'utf8')) : null;
    if (n === null || n === 0) {
      findings.push(
        `${list.file}: this gate cannot count ${list.table} there, so no stated count of ${list.noun} was checked. ` +
          `Point \`COUNTS\` in docs-counts.mjs at where the list is kept now.`,
      );
      continue;
    }
    code.set(list.key, { n, list });
  }

  /* ── the documents, by label ── */
  const documents = [];
  if (existsSync(at('README.md'))) documents.push({ rel: 'README.md', text: readFileSync(at('README.md'), 'utf8') });
  if (existsSync(at('docs'))) {
    const index = existsSync(at('docs', '00-README.md')) ? readFileSync(at('docs', '00-README.md'), 'utf8') : '';
    const labels = labelsOf(index);
    for (const name of readdirSync(at('docs')).filter((n) => n.endsWith('.md')).sort()) {
      const rel = `docs/${name}`;
      const text = readablePart(readFileSync(at('docs', name), 'utf8'), labels.get(rel));
      if (text !== null) documents.push({ rel, text });
    }
  }
  if (documents.length === 0) {
    console.log(`  docs-counts: no prose was read under ${root}, so nothing was checked`);
    return 3;
  }

  /* ── the ledgers, keyed on the file and the words ── */
  const ledger = new Map();
  for (const [kind, entries] of [['debt', DEBT], ['not a total', NOT_A_TOTAL]])
    for (const entry of entries) {
      const key = `${entry.file}\n${words(entry.said)}`;
      ledger.set(key, [...(ledger.get(key) ?? []), { ...entry, kind, used: false }]);
    }

  /* ── every claim, against the code ── */
  let claims = 0;
  let excused = 0;
  for (const { rel, text } of documents)
    for (const [key, pattern] of Object.entries(CLAIMS)) {
      const truth = code.get(key);
      if (truth === undefined) continue;
      for (const match of text.matchAll(pattern)) {
        claims++;
        if (valueOf(match[1]) === truth.n) continue;
        const entry = (ledger.get(`${rel}\n${words(match[0])}`) ?? []).find((e) => !e.used);
        if (entry) {
          entry.used = true;
          excused++;
          continue;
        }
        const line = text.slice(0, match.index).split('\n').length;
        findings.push(
          `${rel}:${line} says "${match[0].replace(/\s+/g, ' ')}", and the code holds ${truth.n} ` +
            `(${truth.list.table} in ${truth.list.file}).`,
        );
      }
    }

  /* AN ENTRY THAT EXCUSES NOTHING, AT HOME ONLY. A seeded fixture is not this repository, so the ledgers are not
     about it, and asking them there would make every fixture red for the tree's own sentences. */
  if (resolve(root) === HOME)
    for (const entry of [...ledger.values()].flat())
      if (!entry.used)
        findings.push(
          `docs-counts.mjs lists "${entry.said}" in ${entry.file} as ${entry.kind}, and nothing stated there needs it now. ` +
            'Delete the entry.',
        );

  const summary = [...code.values()].map(({ n, list }) => `${list.noun} ${n}`).join(' · ');
  if (findings.length === 0) {
    console.log(
      `  docs-counts: ${claims} stated count(s) over ${documents.length} document(s), ${excused} of them listed; ${summary}`,
    );
    return;
  }
  for (const finding of findings) console.error(`    ${finding}`);
  console.error(
    `\n  docs-counts: ${findings.length} finding(s)\n` +
      '  A count in prose goes stale the day its list moves. Name where the code keeps the list rather than\n' +
      '  its size, or, where the sentence is history, say so and list it in NOT_A_TOTAL with its reason.\n',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns it at its seeded tree with `BRAINDOG_GATE_ROOT`. `?? 0` because
   a pass returns nothing. */
if (import.meta.main) process.exitCode = docsCounts() ?? 0;
