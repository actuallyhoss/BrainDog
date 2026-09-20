/**
 * The refusal corpus, read. The one reader the `via` runners share, and the only code they share.
 *
 * IT EXISTS AS ITS OWN UNIT BECAUSE IT WAS WRITTEN TWICE IN ONE COMMIT. `e74a563` built the first
 * two runners of `40 §6`'s seven, and each of them carried its own copy of the same fifty lines:
 * the same column-0 key match, the same duplicate-key guard, the same unquoting, differing only in
 * which continuation each one had reached for first. `refusals-render.test.ts` grew literal block
 * scalars because a document arrives as one, `refusals-write.test.ts` grew brace counting because a
 * declaration arrives as a flow collection, and both halves are the same fixture format. Two copies
 * of a reader over one corpus is one corpus with two answers about what a fixture says, and the
 * five runners `40 §6` still specifies would each have arrived with a sixth and seventh copy.
 *
 * IT LIVES BESIDE THE CORPUS RATHER THAN IN A PACKAGE, and that is the constraint the duplication
 * was a response to rather than an oversight. The two callers are in different workspaces with no
 * test dependency between them, `braindog-render` must test cleanly when unpacked alone, and a
 * workspace package created to hold this would have to build before either runner could run. A
 * plain module in `fixtures/`, imported by relative path, is read by Node's own type stripping and
 * builds nothing. `apps/site/scripts/product.mjs` already reaches across the tree the same way.
 *
 * IT IS NOT A YAML PARSER AND MUST NOT GROW INTO ONE. `42 §2` puts the one parser behind a
 * `@braindog/declare` subpath that does not exist yet. What is here is the subset the corpus is
 * written in, which is column-0 scalars, literal block scalars, and flow collections that are JSON.
 * The day `./yaml` lands, the same files are read unchanged by a real parser and this goes.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = fileURLToPath(new URL('./refusals', import.meta.url));

/** A fixture's column-0 keys. Every value is text; what it means is the runner's business. */
export type Keys = Map<string, string>;

export type Fixture = { name: string; keys: Keys };

/** Whether a brace-counting scan is inside a JSON string, which is the only place a brace is not one. */
function balance(text: string, state: { depth: number; inString: boolean; escaped: boolean }) {
  for (const c of text) {
    if (state.escaped) { state.escaped = false; continue; }
    if (state.inString) {
      if (c === '\\') state.escaped = true;
      else if (c === '"') state.inString = false;
      continue;
    }
    if (c === '"') state.inString = true;
    else if (c === '{' || c === '[') state.depth += 1;
    else if (c === '}' || c === ']') state.depth -= 1;
  }
}

/**
 * One fixture, as keys.
 *
 * THE HEADER IS COLUMN 0 AND EVERYTHING ELSE BELONGS TO A VALUE. `tools/gates/refusal-fixtures.mjs`
 * reads the same shape and skips every indented line, because a gate counting the enumeration never
 * needed a fixture's input. A runner does, and there are exactly two forms that input arrives in.
 *
 * `|` AND `|-` FOR A DOCUMENT, because a document is made of backticks and pipes and every
 * character of it is the author's. The block's own indentation comes off and nothing else is
 * touched, which is the one form that survives holding a fenced table.
 *
 * `{` AND `[` FOR A DECLARATION, because a flow collection is JSON and `JSON.parse` is the reader
 * for it. Spread over several lines with every continuation indented, three things hold at once:
 * the gate sees one key line and skips the rest, this joins them, and a real parser reads the same
 * mapping. A literal block would have been easier to type and would have made `declare` a string
 * instead of a map, which is the one thing that would not survive the switch.
 *
 * A THROW RATHER THAN AN ASSERTION, so this module owes nothing to `node:assert` and the two
 * runners keep their own vocabulary. Either way the test carrying the fixture goes red by name.
 */
function read(text: string, where: string): Keys {
  const keys: Keys = new Map();
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '' || line.startsWith('#') || /^\s/.test(line)) continue;
    const m = /^([a-z_]+):(?:[ \t]+(.*))?$/.exec(line);
    if (!m) throw new Error(`${where}:${i + 1} is not a key line, and this reader reads column 0 only`);
    const key = m[1]!;
    if (keys.has(key)) throw new Error(`${where}:${i + 1} says \`${key}\` twice`);
    let value = (m[2] ?? '').trim();

    if (value === '|' || value === '|-') {
      const body: string[] = [];
      let indent = '';
      while (i + 1 < lines.length) {
        const next = lines[i + 1]!;
        if (next.trim() !== '' && !/^\s/.test(next)) break;
        i++;
        if (indent === '' && next.trim() !== '') indent = /^\s+/.exec(next)![0]!;
        body.push(next.startsWith(indent) ? next.slice(indent.length) : next.trim());
      }
      while (body.length > 0 && body[body.length - 1]!.trim() === '') body.pop();
      keys.set(key, value === '|' ? `${body.join('\n')}\n` : body.join('\n'));
      continue;
    }

    if (value.startsWith('{') || value.startsWith('[')) {
      const state = { depth: 0, inString: false, escaped: false };
      balance(value, state);
      while (state.depth > 0 && i + 1 < lines.length) {
        i++;
        value += `\n${lines[i]}`;
        balance(lines[i]!, state);
      }
      if (state.depth !== 0) throw new Error(`${where}'s \`${key}:\` never closes`);
    }

    const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
    keys.set(key, quoted ? quoted[2]! : value);
  }
  return keys;
}

/**
 * Every fixture whose `via` is this one, read from the whole corpus rather than from a list.
 *
 * THE WHOLE DIRECTORY IS READ AND THEN FILTERED, which is what makes a runner's count assertion
 * mean anything. A runner that was handed its own family could not tell a family that grew by one
 * from a family that was always that size, and a fixture nothing drives is the thing these runners
 * exist to end.
 */
export function family(via: string): Fixture[] {
  return readdirSync(HOME)
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => ({ name, keys: read(readFileSync(join(HOME, name), 'utf8'), `fixtures/refusals/${name}`) }))
    .filter((f) => f.keys.get('via') === via);
}
