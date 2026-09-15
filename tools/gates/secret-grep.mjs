/**
 * A plaintext secret never reaches a place that keeps things. `12 §8`, ADR-062, `52 §5.2`.
 *
 *   node tools/gates/secret-grep.mjs
 *
 * THE PROMISE THIS GUARDS IS THE ONE THE PRODUCT IS BUILT ON: a credential never goes in the record.
 * The registers index what a key OPENS, never the key — so the record holds sealed bytes and the
 * fingerprint of what wrapped them, and it has no way to open either. The two hosts hold the KEK and
 * do the unwrapping, and that is the whole of where a plaintext is allowed to exist.
 *
 * WHAT GOES WRONG IS NEVER THE STORING. Nobody writes a credential into a register. What happens is
 * that somebody unwraps one to use it, and then logs the call that used it — `console.error('post
 * failed', options)` where `options.headers.authorization` is the secret — and the credential is now
 * in whatever reads the logs, for ever, in a system that was designed so it could not be. That is
 * one line, added while debugging, by somebody who knows the rule perfectly well.
 *
 * SO IT IS A SINK GATE RATHER THAN A STORE GATE. Sources are the names a plaintext goes by; sinks
 * are the things that persist or transmit. A call that puts one inside the other is red, and the
 * sentence names both, because "you logged a secret" is only actionable if it says which.
 *
 * AND `Plaintext` LIVES IN THREE MODULES. `52 §5.2`: the brand appears in the two hosts' vault steps,
 * where a key is sealed and opened, and `loop/research-agent-path.md` §8 adds the CLI's `keys.ts`,
 * where an agent's key is read in and handed to one command. Anywhere else is a plaintext that has travelled,
 * and a type that has travelled is a value that has.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

const root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/**
 * What a plaintext is called. `52 §5.2` names three identifiers and one branded type.
 *
 * WORD-BOUNDED, so `plaintextLabel` is not a plaintext and `decrypted_at` is not a decryption. A
 * gate that matched substrings would be a gate somebody turns off.
 *
 * AND THE FIVE THE KEY HIERARCHY ACTUALLY USES. `apps/selfhost/src/keys.ts` holds the root key, two
 * data keys and an Ed25519 private half, and calls them `plain`, `dek`, `kek`, `root` and `pkcs8` —
 * none of which the four names above match. Its own header claimed this gate was red on a plaintext
 * reaching a log, and `console.error('unwrap failed', plain)` was green. A gate that cannot see the
 * one file the whole key hierarchy lives in is a gate that passes because it is not looking.
 */
const SOURCE = /\b(?:plaintext|plainText|decrypted|secretValue|plain|dek|kek|root|pkcs8)\b/i;

/**
 * `root` IS THE ONE AMBIGUOUS NAME ON THAT LIST, and it cost a false positive the day the sinks
 * were widened: `packages/skin/scripts/theme.mjs` logs `path.slice(root.length + 1)`, where `root`
 * is the repository directory and the whole line is a build message telling somebody to run
 * `pnpm theme`.
 *
 * The other eight names are only ever a key. `root` is a key in `apps/selfhost/src/keys.ts` and a
 * directory, a DOM node or a tree everywhere else — so on its own it is not evidence, and a gate
 * that reports a build script for printing a path is a gate somebody adds an exemption to. The
 * exemption is the real cost: the next genuine leak in that file is exempted with it.
 *
 * So `root` counts only in a file that is ALSO about keys. That is a weaker test than the other
 * eight get, and it is the honest one — the file where a root key leaks is a file that unwraps
 * something, and `keys.ts` names `kek`, `dek` and `unwrap` in its first thirty lines. A file that
 * says `root` and nothing else has no key in it to leak.
 */
const KEY_FILE = /\b(?:kek|dek|pkcs8|unwrap|vault_key|age1|plaintext|passphrase)\b/i;
const STRONG = /\b(?:plaintext|plainText|decrypted|secretValue|plain|dek|kek|pkcs8)\b/i;
const sourceIn = (args, whole) => STRONG.test(args) || (/\broot\b/i.test(args) && KEY_FILE.test(whole));

/**
 * AND THE FOUR RAW VALUES SIGN-IN CARRIES, by the one name each has (`packages/ports/src/auth.ts`): the
 * session id, a sign-in link, a claim link and the self-host's server key. Every one of them opens an
 * account, so a log, the record, an error message or a response body holding one is a leak.
 *
 * AN OUTBOUND REQUEST AND A SERIALISATION ARE NOT SINKS FOR THESE FOUR. A browser posts the key or the link
 * to its own host exactly once, and that post is the one thing they exist for; a gate red on it would be red
 * on the sign-in screen itself. A response is still a sink, because echoing one back is the leak.
 */
const WIRE = /\b(?:sid|linkToken|claimToken|serverKey)\b/;

/**
 * What keeps or transmits. `52 §5.2`'s five, and every one of them outlives the process.
 *
 * `push(` IS WEB PUSH AND NOT `Array.prototype.push`, which is why the source has to appear in the
 * SAME call for a finding: `findings.push(plaintextLabel)` is an array, and `push(sub, plaintext)`
 * is a notification leaving the machine. Requiring both halves is what makes the rule usable
 * without an allowlist that would rot.
 */
const SINKS = [
  { id: 'a log', re: /\bconsole\.[a-z]+\s*\(/g },
  { id: 'a log', re: /(?<![.\w])log\s*\(/g },
  { id: 'telemetry', re: /\btelemetry\s*\(/g },
  { id: 'a push notification', re: /(?<![.\w])push\s*\(/g },
  { id: 'a dispatch', re: /\bdispatch\.[a-z]+\s*\(/gi },
  /**
   * AND THE RECORD ITSELF, WHICH IS THE HALF THIS GATE'S OWN FAILURE MESSAGE NAMES FIRST.
   *
   * *"A credential never goes in the record, and never in a log."* Five sinks, and every one of them
   * was the log half: `console`, `log`, `telemetry`, `push`, `dispatch`. A plaintext written into
   * the record through `sql.exec` was checked by nothing at all — and that is `12 §6`'s promise, the
   * one the vault exists to keep and the one ADR-062 is about. Measured against seven leak shapes,
   * this gate caught one.
   */
  { id: 'the record', re: /\bsql\.(?:exec|one|all|run)\s*\(/g, bound: true },
  /* AN ERROR MESSAGE REACHES A LOG BY EVERY PATH THERE IS. `throw new Error(`unwrap failed:
     ${plain}`)` is a plaintext in a string that is about to be caught, serialised and written
     somewhere by code that has no idea what is in it. */
  { id: 'an error message', re: /new Error\s*\(/g },
  /* SERIALISATION IS THE STEP BEFORE EVERY OTHER SINK. A value inside `JSON.stringify` is a value
     on its way out of the process, whatever it is handed to next. */
  { id: 'a serialisation', re: /JSON\.stringify\s*\(/g, wire: false },
  { id: 'a response', re: /new Response\s*\(/g },
  { id: 'an outbound request', re: /(?<![.\w])fetch\s*\(/g, wire: false },
  /* AND STANDARD OUTPUT, where a key is one line away from a terminal's scrollback or an agent's transcript. No
     command prints a key (`loop/research-agent-path.md` §5.7), so no function anywhere is exempt from this sink. */
  { id: 'standard output', re: /\bprocess\.stdout\.write\s*\(/g },
  { id: 'standard output', re: /\bwriteFileSync\s*\((?=\s*1\s*,)/g },
  /* AND A CHILD PROCESS, which can print, log or keep its arguments and its environment. `braindog keys exec` hands
     a key to one command this way, and that one call is exempt below; any other is a finding. NOT A SINK FOR THE
     FOUR SIGN-IN VALUES, for the reason an outbound request is not: a self-host is handed its own server key in its
     environment, and that is the one thing the key exists for. */
  { id: 'a child process', re: /\b(?:spawn|spawnSync|execFile|execFileSync|fork)\s*\(/g, wire: false },
];

/**
 * The bound parameters of a `sql.` call: everything after the SQL text, with its literals removed.
 *
 * A COLUMN NAME IS NOT A VALUE, AND NEITHER IS A LABEL. Reading the whole argument list makes eight
 * of this repository's `sql.exec` calls a finding, and every one of them is innocent:
 * `INSERT INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id)` has `kek` and `root` as
 * words in the SCHEMA, and `key.wrapped_by ?? 'kek'` binds the NAME of the key that did the
 * wrapping. What is bound there is already sealed. A gate red on all eight is a gate switched off
 * within a week, which is this file's own argument for not matching substrings.
 *
 * What IS a leak is a plaintext identifier bound: `sql.exec('INSERT INTO grant …', plain)`. So the
 * SQL text goes, the string literals go, and what is left is the variables.
 *
 * Measured after: 0 findings over 244 files, and six of seven seeded leak shapes caught where the
 * five log sinks caught one.
 */
function bound(args) {
  const text = args.trimStart();
  const quote = text[0];
  let rest = args;
  if (quote === "'" || quote === '"' || quote === '`') {
    rest = '';
    for (let i = 1; i < text.length; i++) {
      if (text[i] === '\\') {
        i++;
        continue;
      }
      if (text[i] === quote) {
        rest = text.slice(i + 1);
        break;
      }
    }
  }
  return rest.replace(/'[^']*'|"[^"]*"/g, "''");
}

/**
 * Comments go: a banned word inside prose is prose, and this file's own header proves it.
 *
 * BLANKED RATHER THAN REMOVED, so the line numbers survive. Collapsing a twenty-line header into one
 * space moves every finding below it, and a gate that names the wrong line is a gate somebody stops
 * trusting on the second use.
 */
const blank = (m) => m.replace(/[^\n]/g, ' ');
const decomment = (text) => text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:])(\/\/.*)$/gm, (_, a, c) => a + blank(c));

/**
 * The argument text of a call, from its opening bracket to the matching close.
 *
 * BRACKET-COUNTED RATHER THAN REGEXED, because the shape that matters is nested:
 * `console.error('post failed', { headers: auth(plaintext) })` is one call and the source is two
 * levels down. A pattern that stopped at the first `)` would find the inner call and miss the outer,
 * which is the one doing the writing.
 */
function argsOf(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

const lineOf = (text, at) => text.slice(0, at).split('\n').length;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (skipDir(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    /* `.svelte` TOO. A component that logs a grant it just opened is the same leak in a file this
       gate would otherwise not read, and the vault screen is where an unwrapped value is nearest. */
    else if (/\.(ts|mjs|js|svelte)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Where the brand is allowed to be named.
 *
 * BY PATH, because the rule is about which MODULE holds it rather than which line. `52 §5.2` names
 * the two hosts' vault steps, and the agent path adds the CLI's key commands.
 */
const BRAND_HOMES = [
  /^apps[\\/]selfhost[\\/]src[\\/]vault\.ts$/,
  /^apps[\\/]worker[\\/]src[\\/]vault\.ts$/,
  /^apps[\\/]cli[\\/]src[\\/]keys\.ts$/,
];

/**
 * THE SINKS A BRAND HOME MAY USE, EACH BY FILE AND BY FUNCTION.
 *
 * A key has to leave somewhere: a deposit is sent to its host once, a read is answered once, and a key read back on
 * an agent's machine goes into the environment of one command. Those three places are named here, nothing on the
 * read side is exempt from standard output, and the same sink anywhere else in the same file is still a finding, which is what the seeded
 * negative `secret-grep-vault` proves.
 */
const EXEMPT = [
  { file: /^apps[\\/]cli[\\/]src[\\/]keys\.ts$/, fn: 'depositOne', sinks: ['an outbound request', 'a serialisation'] },
  { file: /^apps[\\/]cli[\\/]src[\\/]keys\.ts$/, fn: 'execOne', sinks: ['a child process'] },
  { file: /^apps[\\/]selfhost[\\/]src[\\/]vault\.ts$/, fn: 'answerOpen', sinks: ['a serialisation', 'a response'] },
];

/** A regex that finds any of `names` as a whole identifier, never as a property after a dot. */
const namesRe = (names) =>
  names.size === 0 ? null : new RegExp(`(?<![.\\w$])(?:${[...names].map((n) => n.split('$').join('\\$')).join('|')})(?![\\w$])`);

/**
 * THE SHAPES A DEPOSITED VALUE TAKES IN A BRAND HOME.
 *
 * None of them is called `plaintext`. A key arrives as a string in a body, becomes bytes, is sealed, and on the way
 * back is bytes and then a string in an answer, under whatever names the code gives it. What they share is the
 * brand: so a name declared `: Plaintext` or made `as Plaintext` is a source, and so is every name assigned from an
 * expression that holds one, followed until nothing new is found.
 *
 * A CALL TO A FUNCTION DECLARED IN THE SAME FILE IS NOT FOLLOWED. `const answer = await depositOne(…, value)` is the
 * host's reply, not the value, and following it would make every sentence about a deposit a finding.
 */
function brandedNames(text) {
  const names = new Set();
  for (const m of text.matchAll(/([A-Za-z_$][\w$]*)\??\s*:\s*Plaintext\b/g)) names.add(m[1]);
  for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^;\n]*\bas\s+Plaintext\b/g)) names.add(m[1]);
  const declared = new Set([...text.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  const assigned = [...text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:[^=\n]+)?\s*=\s*([^;\n]+)/g)];
  for (let grew = true; grew; ) {
    grew = false;
    const held = namesRe(names);
    for (const [, name, rhs] of assigned) {
      if (held === null || names.has(name) || !held.test(rhs)) continue;
      const callee = /^(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(rhs.trim())?.[1];
      if (callee !== undefined && declared.has(callee)) continue;
      names.add(name);
      grew = true;
    }
  }
  return names;
}

/**
 * The innermost `function NAME` whose body holds offset `at`, or `null`.
 *
 * The body is the first `{` after the parameters that is not inside a return type's angle brackets, counted to its
 * match. An arrow function has no name here, so an exemption can only ever name a declared function.
 */
function enclosing(text, at) {
  let inner = null;
  for (const m of text.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/g)) {
    if (m.index > at) break;
    const params = argsOf(text, m.index + m[0].length - 1);
    let open = m.index + m[0].length + params.length + 1;
    for (let angle = 0; open < text.length; open++) {
      const c = text[open];
      if (c === '<') angle++;
      else if (c === '>' && text[open - 1] !== '=') angle--;
      else if (c === '{' && angle <= 0) break;
    }
    let close = text.length;
    for (let i = open, depth = 0; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) {
        close = i;
        break;
      }
    }
    if (at > open && at < close) inner = m[1];
  }
  return inner;
}

const findings = [];
let scanned = 0;

/* `packages/fixtures/**` IS IN SCOPE TOO — 52 §6's table: a fixture that carried a real credential
   would be one committed to a public repository, which is the failure this gate is for at its
   worst. Everything under `packages` and `apps` is walked, tests included. */
for (const top of ['packages', 'apps'])
  for (const file of walk(join(root, top))) {
    scanned++;
    const rel = relative(root, file);
    const text = decomment(readFileSync(file, 'utf8'));
    const home = BRAND_HOMES.some((h) => h.test(rel));
    const branded = home ? namesRe(brandedNames(text)) : null;

    for (const sink of SINKS) {
      sink.re.lastIndex = 0;
      for (const m of text.matchAll(sink.re)) {
        const raw = argsOf(text, m.index + m[0].length - 1);
        const args = sink.bound ? bound(raw) : raw;
        const plain = sourceIn(args, text) || (branded !== null && branded.test(args));
        if (plain && EXEMPT.some((e) => e.file.test(rel) && e.sinks.includes(sink.id) && enclosing(text, m.index) === e.fn)) continue;
        if (plain || (sink.wire !== false && WIRE.test(args)))
          findings.push({
            where: `${rel}:${lineOf(text, m.index)}`,
            why: plain ? `a plaintext reaches ${sink.id}` : `a sign-in secret reaches ${sink.id}`,
            text: `${m[0]}${args.trim().slice(0, 60)}`,
          });
      }
    }

    /* THE BRAND, AND THE THREE MODULES IT LIVES IN. A `Plaintext` in a fourth file is a plaintext that
       has been handed somewhere it was not unwrapped, and a type travelling is a value travelling. */
    if (/\bPlaintext\b/.test(text) && !home) {
      const at = text.search(/\bPlaintext\b/);
      findings.push({
        where: `${rel}:${lineOf(text, at)}`,
        why: 'names the Plaintext brand outside a host vault step',
        text: 'Plaintext',
      });
    }

    /* AND A PROMPT TEMPLATE NEVER NAMES ONE. `52 §5.2` lists any file under a `prompts` directory as a sink of its own:
       whatever is in one goes to a model, and a template that interpolates a decrypted value is a
       credential in somebody else's inference log. */
    if (/[\\/]prompts[\\/]/.test(rel) && SOURCE.test(text))
      findings.push({
        where: `${rel}:${lineOf(text, text.search(SOURCE))}`,
        why: 'a prompt template names a plaintext',
        text: (SOURCE.exec(text) ?? [''])[0],
      });
  }

if (findings.length === 0) {
  console.log(`  secret-grep: 0 plaintexts reach a sink, over ${scanned} files`);
} else {
  console.error(`\n  secret-grep: ${findings.length} finding(s) — 12 §8, ADR-062\n`);
  for (const f of findings) console.error(`    ${f.where}  ${f.why}\n      ${f.text}`);
  console.error(
    '\n  A credential never goes in the record, and never in a log. Say what it opened, its id, or\n' +
      '  the label — never the value. If it must be used, use it and let it go out of scope.\n',
  );
  process.exitCode = 1;
}
