/**
 * The provision command READY prints asks for the slug, the email, the name and the zone, and prints no placeholder.
 *
 *   node --test "apps/worker/scripts/provision-ask.test.mjs"
 *
 * A PLACEHOLDER LEFT IN WAS TAKEN AS HIS NAME FOR GOOD. The command printed `name = '<your name>'` to be edited by hand
 * at midnight, the Worker refused the slug's and the email's placeholders and took the name's, and the owner's `me`
 * then said `<your name>` with no screen that renames him (`loop/research-batch-forty-six-audit.md` §7). The Worker now
 * refuses a name holding `<` or `>` (`test/provision-tz.test.ts`), and this file holds the other half: nothing is
 * printed to be edited, because each form asks.
 *
 * THE CLAIM LINK IS PRINTED ON A LINE OF ITS OWN. `Format-List` hard-wraps a value, and at 80 columns the one copy of
 * the claim link came out on two lines with ten spaces before the second (the same audit, "Found on the way"). A value
 * printed by itself is one line whatever the width.
 *
 * THE BASH FORM IS RUN, NOT READ, where there is a bash and a curl to run it with: its answers are piped in, it posts to
 * a server on 127.0.0.1 that this file starts, and the body that arrives is compared with what was typed. A name with a
 * quote, an apostrophe and a letter outside ASCII is the one that would break a body built by pasting into JSON.
 * It found a second fault the text did not show: with the body built right and handed to curl as `-d "$BODY"`, the
 * name arrived as `Zo` U+FFFD `...`, because Git for Windows' curl takes its arguments in Windows-1252 (`5a 6f eb` for
 * `Zoë`). The body now goes to curl on its stdin.
 */

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { provisionCommands } from './provision-check.mjs';

const ORIGIN = 'https://app.example.test';
const ZONE = 'Africa/Cairo';

test('NEITHER FORM PRINTS A PLACEHOLDER TO BE EDITED, because an unedited one is somebody\'s name for good', () => {
  const { powershell, bash } = provisionCommands(ORIGIN, ZONE);
  for (const [shell, lines] of [['powershell', powershell], ['bash', bash]]) {
    const text = lines.join('\n');
    assert.doesNotMatch(text, /<slug>|<your email>|<your name>/, `the ${shell} form still prints a placeholder:\n${text}`);
  }
});

test('THE POWERSHELL FORM ASKS FOR EACH OF THE FOUR, and offers this machine\'s zone as the answer to Enter', () => {
  const text = provisionCommands(ORIGIN, ZONE).powershell.join('\n');
  assert.match(text, /\$slug = Read-Host 'Slug'/);
  assert.match(text, /\$email = Read-Host 'Email'/);
  assert.match(text, /\$name = Read-Host 'Name/);
  assert.match(text, new RegExp(`\\$tz = Read-Host 'Time zone \\[${ZONE}\\]'`));
  assert.match(text, new RegExp(`if \\(-not \\$tz\\) \\{ \\$tz = '${ZONE}' \\}`), 'an empty answer is not this machine\'s zone');
  assert.match(text, /@\{ slug = \$slug; email = \$email; name = \$name; tz = \$tz \}/, 'the body is not built from the answers');
});

test('THE POWERSHELL FORM IS ONE SCRIPT BLOCK, & { on the first line and } on the last, so no Read-Host runs before the paste is whole', () => {
  /* STANDS IN FOR THE PASTE, WHICH A UNIT TEST CANNOT MAKE. Pasted as twelve bare lines into a 5.1 console, PSReadLine
     ran line one while the rest was still arriving, and the first Read-Host took the tail of line two as the operator
     key in 2 of 14 runs: a ParserError, `$pk` never set, UNAUTHORIZED, and the answers typed after it run as commands
     (`loop/research-batch-forty-eight-audit.md` §3, `paste-answers.ps1`). The same lines inside `& { ... }` were 8 of 8.
     So the braces are counted as well as the ends: a block that closed on an earlier line would run from there. */
  const lines = provisionCommands(ORIGIN, ZONE).powershell;
  assert.equal(lines[0], '& {', `the form opens with ${JSON.stringify(lines[0])}`);
  assert.equal(lines.at(-1), '}', `the form ends with ${JSON.stringify(lines.at(-1))}`);
  let depth = 0;
  lines.forEach((line, i) => {
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (i < lines.length - 1) assert.ok(depth > 0, `the block closes at line ${i + 1} of ${lines.length}: ${line}`);
    if (i > 0 && i < lines.length - 1) assert.match(line, /^ {2,}\S/, `line ${i + 1} is not indented inside the block: ${JSON.stringify(line)}`);
  });
  assert.equal(depth, 0, 'the braces of the form do not balance');
});

test('THE CLAIM LINK IS PRINTED BY ITSELF, so an 80-column window does not break the only copy across two lines', () => {
  const lines = provisionCommands(ORIGIN, ZONE).powershell.map((l) => l.trim());
  assert.ok(lines.includes('$r.value.claim'), `the claim link is not on a line of its own:\n${lines.join('\n')}`);
});

test('THE BASH FORM ASKS FOR EACH OF THE FOUR with read -r -p, and offers this machine\'s zone', () => {
  const text = provisionCommands(ORIGIN, ZONE).bash.join('\n');
  assert.match(text, /read -r -p 'Slug: ' SLUG/);
  assert.match(text, /read -r -p 'Email: ' EMAIL/);
  assert.match(text, /read -r -p 'Name[^']*: ' NAME/);
  assert.match(text, new RegExp(`read -r -p 'Time zone \\[${ZONE}\\]: ' ZONE`));
  assert.match(text, new RegExp(`ZONE=\\$\\{ZONE:-${ZONE}\\}`));
  /* NOT `TZ`, which is the variable every child process reads its own clock from. */
  assert.doesNotMatch(text, /\bTZ=/);
  assert.match(text, /--data-binary @-/, 'the body is handed to curl as an argument, which Git for Windows reads as Windows-1252');
});

/** Whether this machine can run the bash form at all: a `bash` and a `curl` on the path. */
const runnable = await new Promise((resolve) =>
  execFile('bash', ['-c', 'command -v curl && command -v node'], (err) => resolve(err === null)),
);

test('THE BASH FORM, RUN, POSTS WHAT WAS TYPED, a name with quotes and a letter outside ASCII included', { skip: !runnable && 'no bash with curl and node here' }, async (t) => {
  const seen = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.push({ authorization: req.headers.authorization, type: req.headers['content-type'], body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true,"value":{"claim":"https://app.example.test/app/signin#claim=x"}}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;

  const script = provisionCommands(origin, ZONE).bash.join('\n');
  /* THE KEY, THE SLUG, THE EMAIL, THE NAME, AND AN EMPTY LINE FOR THE ZONE, in the order the form asks. */
  const answers = ['test-operator-key', 'zoe', 'zoe@example.test', 'Zoë "Z" O\'Brien', ''].join('\n') + '\n';
  const out = await new Promise((resolve, reject) => {
    const child = execFile('bash', ['-c', script], (err, stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve(stdout)));
    child.stdin.end(answers);
  });

  assert.equal(seen.length, 1, `the form posted ${seen.length} times:\n${out}`);
  assert.equal(seen[0].authorization, 'Bearer test-operator-key');
  assert.deepEqual(JSON.parse(seen[0].body), { slug: 'zoe', email: 'zoe@example.test', name: 'Zoë "Z" O\'Brien', tz: ZONE });
});
