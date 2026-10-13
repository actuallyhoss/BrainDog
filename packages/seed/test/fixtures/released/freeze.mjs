#!/usr/bin/env node
/**
 * Writes the released documents beside this file, read from one commit: `node freeze.mjs <commit>`.
 *
 * THE ONLY THING HERE THAT CALLS GIT. `update-keeps-rows.test.ts` reads the files this leaves and nothing else, so the
 * test says the same thing on a machine with no history. The commit is unpacked into a folder under the system's
 * temporary one (`git archive`, never a checkout of the working tree), linked to the packages already installed here,
 * and asked for its own documents: each first-party module through that commit's `firstPartyDocument`, and each folder
 * under `packs/` as the file it shipped. Nothing is read from the working tree but `node_modules`.
 *
 * A file is named `<id>-<version>.json`. One that is already there is left alone unless `--again` is passed, because
 * a released version never changes; a second release adds a second file.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const args = process.argv.slice(2);
const again = args.includes('--again');
const commit = args.find((a) => !a.startsWith('--'));
if (!commit) {
  console.error('Say which commit was released: node freeze.mjs <commit> [--again]');
  process.exit(2);
}

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const full = git('rev-parse', `${commit}^{commit}`);
const scratch = mkdtempSync(join(tmpdir(), 'braindog-released-'));

try {
  const tar = execFileSync('git', ['archive', full, 'packages', 'packs'], { cwd: root, maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', scratch], { input: tar });
  /* THE COMMIT'S OWN PACKAGES, THIS MACHINE'S INSTALLED ONES: each package's links are copied as links, so
     `@braindog/declare` resolves to the commit's copy and a library resolves through the one `node_modules` linked in. */
  symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir');
  for (const name of readdirSync(join(scratch, 'packages'))) {
    const links = join(root, 'packages', name, 'node_modules');
    if (existsSync(links)) cpSync(links, join(scratch, 'packages', name, 'node_modules'), { recursive: true, verbatimSymlinks: true });
  }

  const ask = `import { FIRST_PARTY, firstPartyDocument } from './packages/seed/src/index.ts';
process.stdout.write(JSON.stringify(Object.fromEntries(FIRST_PARTY.map((id) => [id, firstPartyDocument(id)]))));`;
  const firstParty = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', ask], { cwd: scratch, encoding: 'utf8', maxBuffer: 1 << 28 }));

  const docs = Object.values(firstParty);
  for (const folder of readdirSync(join(scratch, 'packs')).sort()) {
    const file = join(scratch, 'packs', folder, `${folder}.pack.json`);
    if (statSync(join(scratch, 'packs', folder)).isDirectory() && existsSync(file)) docs.push(JSON.parse(readFileSync(file, 'utf8')));
  }

  for (const doc of docs) {
    const name = `${doc.pack}-${doc.version}.json`;
    if (existsSync(join(here, name)) && !again) {
      console.log(`kept   ${name}`);
      continue;
    }
    writeFileSync(join(here, name), `${JSON.stringify(doc)}\n`);
    console.log(`wrote  ${name}`);
  }
  console.log(`from ${full}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
