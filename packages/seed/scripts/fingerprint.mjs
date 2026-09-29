/**
 * PRINTS THE `DECLARED` ENTRY THAT `test/pack-versions.test.ts` IS ABOUT TO DEMAND, so that a person who moved a
 * declaration runs one command instead of being told a hex string by somebody else.
 *
 * WRITTEN BECAUSE THE GUARD WAS HAND-FED THREE TIMES IN TWO DAYS. Every one of those entries reached the file the same
 * way: an agent computed the fingerprint, wrote it into a report, and a caller copied it across. `portfolio@1.4.0` came
 * in that way in `a89bc072`, sixteen characters and fifteen ids, none of which the caller could check
 * without running the pack code themselves. The guard already knows all of it, and a value a reviewer cannot recompute
 * is a value a reviewer is waving through.
 *
 * WHAT IT WILL NOT WRITE IS THE REASON, and that is the whole of the design. The refusals stay exactly as strict: the
 * history line still has to say which change moved the fingerprint, still has to name a declaration in backticks, and
 * still has to end in the new value. That sentence is where somebody decides whether what moved was words or
 * arithmetic, which is the decision the single-hash guard this replaced never once put in front of anybody. The typing
 * was never the point, so the tool takes the typing and leaves the decision.
 *
 * IT RECOMPUTES RATHER THAN SHARING CODE WITH THE TEST. The test is TypeScript and this package compiles with `allowJs`
 * off, so an import of this file would be a TS7016 error there and a `.d.mts` kept by hand here. Instead the test runs
 * this command and holds what it printed against what the guard computes, which catches the two drifting apart and also
 * catches the failure an import could not see: an entry that is right inside the tool and printed in a shape nobody can
 * paste.
 *
 * Usage: `node packages/seed/scripts/fingerprint.mjs [pack ...]`, with no arguments meaning every first-party pack.
 */

import { createHash } from 'node:crypto';

import { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument, firstPartyManifest } from '../src/index.ts';

/** The indent a `holds` line sits at inside `DECLARED`, so that what is printed can be pasted without touching it. */
const INDENT = '      ';

/** Where a `holds` line is broken. The file it is pasted into runs to about this width, and the ids are long. */
const WIDTH = 134;

/**
 * WHAT THE DECLARATIONS AND SETTINGS SAY, HASHED, the same shape the guard hashes: what reaches a record that already
 * holds the pack, never the example rows, which are planted only into an empty list.
 */
const fingerprint = (doc) =>
  createHash('sha256')
    .update(JSON.stringify({ declarations: doc.declarations, config: doc.config ?? null }))
    .digest('hex')
    .slice(0, 16);

/** Every declaration and every setting a record that installs the pack holds, by id. `provides` is the manifest's own list. */
const inventory = (id, doc) =>
  [...firstPartyManifest(id).provides, ...Object.keys(doc.config ?? {}).map((k) => `setting.${k}`)].sort();

/**
 * THE IDS BROKEN INTO LINES A PERSON CAN READ, one kind at a time and never past `WIDTH`. Whitespace inside `holds`
 * means nothing to the guard, so this is for the reviewer: a pack gaining a rule shows up as one line growing rather
 * than as every line after it shifting along.
 */
function wrapped(ids) {
  const lines = [];
  let line = '';
  let kind = '';
  for (const id of ids) {
    const now = id.slice(0, id.indexOf('.'));
    if (line !== '' && (now !== kind || line.length + 1 + id.length > WIDTH)) {
      lines.push(line);
      line = '';
    }
    line = line === '' ? INDENT + id : `${line} ${id}`;
    kind = now;
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** The reason nobody may skip, in the place it goes, saying what belongs there. The guard refuses this line as it stands. */
const REASON = 'SAY WHICH CHANGE MOVED IT, naming a declaration of this pack in backticks';

/** One entry, as the source text to paste. */
function block(id) {
  const doc = firstPartyDocument(id, { seeds: [] });
  const key = `${id}@${FIRST_PARTY_VERSIONS[id]}`;
  const declares = fingerprint(doc);
  return [
    `  '${key}': {`,
    '    holds: `',
    ...wrapped(inventory(id, doc)),
    '    `,',
    `    declares: '${declares}',`,
    '    history: [',
    `      '${REASON} -> ${declares}',`,
    '    ],',
    '  },',
  ].join('\n');
}

const wanted = process.argv.slice(2);
const unknown = wanted.filter((name) => !FIRST_PARTY.includes(name));
if (unknown.length > 0) {
  process.stderr.write(`No first-party pack called ${unknown.join(', ')}. The packs are ${FIRST_PARTY.join(', ')}.\n`);
  process.exit(1);
}

const packs = wanted.length > 0 ? wanted : [...FIRST_PARTY];

/*
 * THE HEADING A PERSON READS BEFORE THEY PASTE, and the sentence about the history is the load-bearing one. Cutting five
 * of `money-core@1.3.0`'s six history lines out of DECLARED and running the guard was measured green: nothing in
 * `wrong()` holds a history against how long it used to be, so a line somebody deleted and a line nobody ever wrote look
 * identical to it. The first draft of this heading opened by saying to paste the entry over the one under the same key,
 * which is the move that loses those lines, so it now names the two fields to replace and asks for the history line to
 * be appended under what is there.
 */
const said = [
  'Paste each entry below into DECLARED in packages/seed/test/pack-versions.test.ts, and then write the reason: which',
  'change moved the fingerprint, naming a declaration of the pack in backticks.',
  '',
  'WHERE THE KEY IS ALREADY THERE, replace its `holds` and its `declares` with the printed ones and APPEND the printed',
  'history line below the lines already under it. Do not paste over the history. A reset appends a line rather than',
  'editing one, the list getting longer is how a reader sees a version rewritten twice, and the guard cannot tell a',
  'history line that was deleted from one that was never written.',
  '',
];
for (const id of packs) {
  /* A PACK STILL ON 1.0.0 HAS NO ENTRY TO PRINT. The guard's answer for a 1.0.0 pack that changed is a new version, not
     a fingerprint, because 1.0.0 is what every record installed before any of the packs had a version of its own. */
  if (FIRST_PARTY_VERSIONS[id] === '1.0.0') {
    said.push(`${id} is on 1.0.0, which gets no entry. Raise it in FIRST_PARTY_VERSIONS first, then run this again.`, '');
    continue;
  }
  said.push(block(id), '');
}
process.stdout.write(`${said.join('\n')}\n`);
