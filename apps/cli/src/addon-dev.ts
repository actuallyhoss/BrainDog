/**
 * The add-on author's loop on this machine: `braindog addon dev <folder>` and `braindog addon publish --github`.
 *
 * DEV STARTS A SCRATCH BRAINDOG AND KEEPS THE FOLDER INSTALLED IN IT. It is `addon preview`'s scratch self-host
 * (loopback, nobody signs in, a scratch data folder removed when it stops), with the folder's file published to a
 * scratch catalogue. The file is installed as the owner would install it, through `planPack` and `installPack`, and the
 * folder is watched: on each save of the add-on file or a script file the file is read through the add-on door again,
 * planned, and installed as an update, with what the plan adds, changes and takes away said, or the refusal said with
 * its code. A version left as it was installs as a reinstall, so a field can be changed without a version each time.
 *
 * A SCRIPT LIVES IN ITS OWN .js FILE AND THE ADD-ON FILE CARRIES ITS TEXT as `source`, as every add-on in `packs/`
 * holds it and its test checks (`packs/weather/weather.test.ts`). Which file is which script: a file named for the
 * script's id (`weather_poll.js` or `weather-poll.js`), or, when the add-on has one script and the folder one .js file,
 * that file. On each save the file's text is copied into `source` in the add-on file itself (a JSON file; a YAML one is
 * only read with it), so what is installed, checked and published is one file that says everything.
 *
 * PUBLISH --GITHUB PUTS THE FOLDER ON GITHUB WITH THE PERSON'S OWN `gh`. The folder is its own repository (made when it
 * is not one), its changes are committed, `v<version>` is tagged on that commit, and the branch and the tag are pushed to
 * `--repo owner/name`, or to `<you>/<id>`, created public when it is not there. A version already tagged on another
 * commit is never moved: a published version is the bytes people installed. It prints the `git:` line that installs it
 * and the `act` call an agent makes with it. BrainDog never holds a GitHub credential; `gh` does.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { addressFaults } from '@braindog/declare';
import { CATALOGUE_INDEX, emptyCatalogue, MANIFEST_KEYS, publishTo, readCatalogueFile } from '@braindog/declare/catalogue';
import { parseYaml } from '@braindog/declare/yaml';
import { refused, type Result } from '@braindog/ports';

import { oneLine } from './clip.ts';
import type { AgentIo } from './skills.ts';

const PACK_FILE = /\.pack\.(json|ya?ml)$/u;
const said = (r: Result<unknown>): string => (refused(r) ? oneLine(`${r.refusal.fix} (${r.refusal.code})`) : 'That was not taken.');
type Doc = Record<string, unknown>;

/* ── the folder ─────────────────────────────────────────────────────────── */

/** The add-on file in a folder: `<folder>.pack.json` (or .yaml), else the one add-on file it holds. A file names itself. */
export function packFileIn(given: string, cwd: string): { file: string; dir: string } | { fix: string } {
  const path = resolve(cwd, given);
  let folder: boolean;
  try {
    folder = statSync(path).isDirectory();
  } catch {
    return { fix: `${given} is not a folder or a file on this machine.` };
  }
  if (!folder) return PACK_FILE.test(path) ? { file: path, dir: dirname(path) } : { fix: `${given} is not an add-on file: its name ends .pack.json or .pack.yaml.` };
  const inside = readdirSync(path).filter((f) => PACK_FILE.test(f));
  const own = ['.pack.json', '.pack.yaml', '.pack.yml'].map((s) => `${basename(path)}${s}`).find((f) => inside.includes(f));
  const found = own ?? (inside.length === 1 ? inside[0] : undefined);
  if (found === undefined) return { fix: inside.length === 0 ? `${given} holds no .pack.json or .pack.yaml file. Start one with braindog addon new <id>.` : `${given} holds ${inside.join(', ')}; name the one you mean.` };
  return { file: join(path, found), dir: path };
}

/** The script files beside an add-on file, by script id: named for the id, or the one file for the one script. */
export function scriptFiles(dir: string, doc: Doc): Map<string, string> {
  const decls = Array.isArray(doc.declarations) ? (doc.declarations as unknown[]) : [];
  const ids = decls.flatMap((d) => (d !== null && typeof d === 'object' && typeof (d as Doc).script === 'string' ? [String((d as Doc).script)] : []));
  let js: string[];
  try {
    js = readdirSync(dir).filter((f) => f.endsWith('.js'));
  } catch {
    js = [];
  }
  const out = new Map<string, string>();
  for (const id of ids) {
    const named = [`${id}.js`, `${id.replace(/_/gu, '-')}.js`].find((f) => js.includes(f));
    if (named !== undefined) out.set(id, join(dir, named));
  }
  if (out.size === 0 && ids.length === 1 && js.length === 1) out.set(ids[0]!, join(dir, js[0]!));
  return out;
}

/** The file as text and as a document, with each script's file copied into its `source`, and what was copied. */
export function readFolder(file: string): { ok: true; text: string; doc: Doc; copied: string[]; json: boolean; raw: string } | { ok: false; fix: string } {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return { ok: false, fix: `${file} could not be read.` };
  }
  const json = file.endsWith('.json');
  let doc: unknown;
  if (json) {
    try {
      doc = JSON.parse(raw);
    } catch (e) {
      return { ok: false, fix: `${basename(file)} is not JSON yet: ${e instanceof Error ? oneLine(e.message) : 'it does not parse'}.` };
    }
  } else {
    const parsed = parseYaml(raw);
    if (!parsed.ok) return { ok: false, fix: `${basename(file)}: ${said(parsed)}` };
    doc = parsed.value;
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, fix: `${basename(file)} is not an add-on file: it is not an object.` };
  const copied: string[] = [];
  const files = scriptFiles(dirname(file), doc as Doc);
  for (const d of Array.isArray((doc as Doc).declarations) ? ((doc as Doc).declarations as Doc[]) : []) {
    if (d === null || typeof d !== 'object' || typeof d.script !== 'string') continue;
    const at = files.get(d.script);
    if (at === undefined) continue;
    let source: string;
    try {
      source = readFileSync(at, 'utf8');
    } catch {
      continue;
    }
    if (d.source !== source) {
      d.source = source;
      copied.push(basename(at));
    }
  }
  return { ok: true, text: `${JSON.stringify(doc, null, 2)}\n`, doc: doc as Doc, copied, json, raw };
}

/** Copies the scripts into a JSON add-on file on disk, keeping how it was laid out, and says which; YAML is left alone. */
function keepInStep(file: string, read: { text: string; copied: string[]; json: boolean }, io: AgentIo): void {
  if (read.copied.length === 0) return;
  if (!read.json) {
    io.out(`  ${read.copied.join(', ')} read into the add-on. A YAML file is not written to; copy the script into its source before you publish.`);
    return;
  }
  writeFileSync(file, read.text);
  io.out(`  ${read.copied.join(', ')} copied into ${basename(file)} as its source.`);
}

/* ── dev ────────────────────────────────────────────────────────────────── */

type PackCalls = {
  planPack: (args: { doc: unknown }) => Promise<Result<unknown>>;
  installPack: (args: { doc: unknown; planHash: string }) => Promise<Result<unknown>>;
};

type Plan = {
  planHash?: unknown;
  direction?: unknown;
  installed_version?: unknown;
  pack?: { id?: unknown; version?: unknown };
  adds?: { id: string; summary: string }[];
  changes?: { id: string; summary: string }[];
  retires?: { id: string; rows: number }[];
  approve?: string[];
  warnings?: { at: string; say: string }[];
  seeds?: { count: number };
};

/** What a plan says, as the lines `dev` prints under each install. */
export function planLines(diff: Plan): string[] {
  const lines: string[] = [];
  for (const a of diff.adds ?? []) lines.push(`  Adds ${oneLine(a.id)}: ${oneLine(a.summary)}`);
  for (const c of diff.changes ?? []) lines.push(`  Changes ${oneLine(c.id)}: ${oneLine(c.summary)}`);
  for (const r of diff.retires ?? []) lines.push(`  Takes away ${oneLine(r.id)}${r.rows > 0 ? `, which holds ${r.rows} ${r.rows === 1 ? 'row' : 'rows'}` : ''}`);
  for (const w of diff.warnings ?? []) lines.push(`  Warning at ${oneLine(w.at)}: ${oneLine(w.say)}`);
  for (const a of diff.approve ?? []) lines.push(`  Asks the owner to approve: ${oneLine(a)}`);
  if (lines.length === 0) lines.push('  Nothing changed since the last install.');
  return lines;
}

/**
 * One pass of the loop: read the folder, check the file at the door, plan it on the scratch record and install it.
 * Said in lines; `installed` when it went in, `same` when the file is the one installed last (`last`), which is what
 * the save that copies a script into the file wakes, and nothing is said for it.
 */
export async function devInstall(file: string, client: PackCalls, io: AgentIo, last: { text: string | null } = { text: null }, saved = false): Promise<'installed' | 'same' | 'refused'> {
  const read = readFolder(file);
  if (!read.ok) {
    io.say(`  ${read.fix}`);
    return 'refused';
  }
  if (read.text === last.text) return 'same';
  if (saved) io.out(`${basename(file)} saved:`);
  keepInStep(file, read, io);
  const door = await readCatalogueFile(read.text);
  if (!door.ok) {
    io.say(`  Refused: ${said(door)}`);
    return 'refused';
  }
  for (const key of Object.keys(read.doc).filter((k) => !(MANIFEST_KEYS as readonly string[]).includes(k)))
    io.out(`  Warning: ${oneLine(key)} is not a key an add-on says. BrainDog passes over it, and the store refuses it.`);
  const remote = addressFaults(read.doc);
  if (remote.length > 0) {
    for (const r of remote) io.say(`  Refused: ${oneLine(`${r.fix} (${r.code})`)}`);
    return 'refused';
  }
  const planned = await client.planPack({ doc: read.doc });
  if (!planned.ok) {
    io.say(`  Refused: ${said(planned)}`);
    return 'refused';
  }
  const diff = ((planned.value as { diff?: Plan } | null)?.diff ?? {}) as Plan;
  if (typeof diff.planHash !== 'string') {
    io.say('  BrainDog answered no plan for this file.');
    return 'refused';
  }
  const put = await client.installPack({ doc: read.doc, planHash: diff.planHash });
  if (!put.ok) {
    io.say(`  Refused: ${said(put)}`);
    return 'refused';
  }
  last.text = read.text;
  const what = [diff.pack?.id, diff.pack?.version].filter((p) => typeof p === 'string').join(' ');
  const how = diff.direction === 'install' ? 'Installed' : diff.direction === 'reinstall' ? 'Reinstalled' : diff.direction === 'downgrade' ? 'Went back to' : 'Updated to';
  io.out(`${how} ${oneLine(what)}.`);
  for (const line of planLines(diff)) io.out(line);
  return 'installed';
}

const DEV_USAGE = 'braindog addon dev takes one folder and --port <n>, as in braindog addon dev bookshelf --port 7870.';

/** The first page the add-on declares, which is where the person looks; else its listing. */
function pageOf(doc: Doc): string | null {
  for (const d of Array.isArray(doc.declarations) ? (doc.declarations as Doc[]) : [])
    if (d !== null && typeof d === 'object' && typeof d.page === 'string') return d.page;
  return null;
}

/** Waits for the scratch BrainDog to answer, up to `ms`. */
async function answers(base: string, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${base}/api/boot`, { signal: AbortSignal.timeout(1000) });
      await r.body?.cancel().catch(() => undefined);
      if (r.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((done) => setTimeout(done, 150));
  }
  return false;
}

/**
 * `addon dev <folder> [--port <n>]`: a scratch BrainDog with the folder installed, kept installed on every save.
 * Runs until Ctrl+C, then removes the scratch BrainDog.
 */
export async function dev(args: string[], io: AgentIo): Promise<number> {
  let values: { port?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { port: { type: 'string' } } }));
  } catch {
    io.say(DEV_USAGE);
    return 1;
  }
  const [given, ...more] = positionals;
  const port = Number(values.port ?? '7870');
  if (!given || more.length > 0 || !Number.isInteger(port) || port < 1024 || port > 65535) {
    io.say(DEV_USAGE);
    return 1;
  }
  const found = packFileIn(given, io.cwd);
  if ('fix' in found) {
    io.say(found.fix);
    return 1;
  }
  const first = readFolder(found.file);
  if (!first.ok) {
    io.say(first.fix);
    return 1;
  }
  keepInStep(found.file, first, io);
  const id = typeof first.doc.pack === 'string' ? first.doc.pack : basename(found.dir);

  const entry = io.env.BRAINDOG_SELFHOST || fileURLToPath(new URL('../../selfhost/src/main.ts', import.meta.url));
  if (!existsSync(entry)) {
    io.say('braindog addon dev needs the self-host. Set BRAINDOG_SELFHOST to its entry file.');
    return 1;
  }
  const scratch = mkdtempSync(join(tmpdir(), 'braindog-dev-'));
  const clean = () => rmSync(scratch, { recursive: true, force: true });
  /* THE STORE LISTS IT, AS PREVIEW'S DOES: the file as it was when dev started, in a scratch catalogue. */
  const catalogue = join(scratch, 'catalogue');
  mkdirSync(catalogue);
  const listed = await publishTo(emptyCatalogue('Dev'), first.text, () => null);
  if (listed.ok) {
    mkdirSync(join(catalogue, dirname(listed.value.path)), { recursive: true });
    writeFileSync(join(catalogue, ...listed.value.path.split('/')), first.text);
    writeFileSync(join(catalogue, CATALOGUE_INDEX), JSON.stringify(listed.value.index));
  }
  /* LOOPBACK AND NOBODY SIGNS IN, as preview: a request carrying nothing is the owner, so this command installs as the
     owner would from the plan sheet, and nothing of a real record is opened. */
  const env = { ...io.env, BRAINDOG_DATA: join(scratch, 'data'), BRAINDOG_KEK_FILE: join(scratch, 'data', 'kek'), BRAINDOG_CATALOGUE: catalogue, BRAINDOG_KENNEL: 'off', PORT: String(port) } as Record<string, string | undefined>;
  for (const k of ['BRAINDOG_TOKEN', 'BRAINDOG_FILE', 'BRAINDOG_HOST', 'BRAINDOG_ORIGIN', 'BRAINDOG_SERVER_KEY']) delete env[k];
  const init = spawnSync(process.execPath, [entry, 'init', 'dev', '--owner', 'dev@example.invalid'], { env, stdio: 'ignore' });
  if (init.status !== 0) {
    clean();
    io.say('The scratch BrainDog for dev could not be created.');
    return 1;
  }
  /* THE SELF-HOST'S OWN BANNER IS NOT THIS COMMAND'S TO SAY; what it says when it stops is kept and said then. */
  const server = spawn(process.execPath, [entry, 'serve'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let told = '';
  server.stderr?.on('data', (chunk: Buffer) => {
    told = `${told}${chunk.toString('utf8')}`.slice(-2000);
  });
  const base = `http://localhost:${port}`;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    server.kill('SIGTERM');
  };
  const exited = new Promise<number>((done) => {
    server.on('exit', (code) => done(code ?? 0));
    server.on('error', () => done(1));
  });
  if (!(await answers(base, 20_000))) {
    stop();
    await exited;
    clean();
    io.say(`The scratch BrainDog did not answer on port ${port}. Pick another with --port.${told.trim() === '' ? '' : ` It said: ${oneLine(told.trim().split('\n').slice(-2).join(' '))}`}`);
    return 1;
  }
  const { connect } = await import('./skills.ts');
  const devIo: AgentIo = { ...io, env: { ...env, BRAINDOG_HOST: base } };
  const at = await connect(base, devIo);
  if (typeof at === 'number') {
    stop();
    await exited;
    clean();
    return at;
  }
  const client = at.client as unknown as PackCalls;
  const page = pageOf(first.doc);
  io.out(`Dev BrainDog for ${oneLine(id)} at ${base}${page === null ? `/addons/${id}` : `/p/${page}`} (the store page is ${base}/addons/${id}).`);
  const last = { text: null as string | null };
  await devInstall(found.file, client, io, last);
  io.out(`Watching ${found.dir}: save the add-on file or a script and it is installed again. Stop with Ctrl+C; the scratch BrainDog is removed.`);

  /* ONE INSTALL AT A TIME, AND ONE MORE IF A SAVE LANDS WHILE ONE RUNS, so a burst of saves ends on the last. Writing the
     scripts into the file wakes the watch once more, and that pass finds nothing to copy and plans a reinstall. */
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let again = false;
  const pass = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    const t0 = Date.now();
    const went = await devInstall(found.file, client, io, last, true);
    if (went === 'installed') io.out(`  In ${Date.now() - t0} ms. Reload the page to see it.`);
    /* AFTER A REFUSAL THE NEXT SAVE IS ALWAYS TRIED, the one that puts the file back as it was installed included. */
    if (went === 'refused') last.text = null;
    running = false;
    if (again) {
      again = false;
      await pass();
    }
  };
  const watcher = watch(found.dir, (_event, name) => {
    if (name === null || !(PACK_FILE.test(name) || name.endsWith('.js'))) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void pass();
    }, 60);
  });
  const quit = () => {
    watcher.close();
    stop();
  };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
  const code = await exited;
  watcher.close();
  clean();
  if (!stopped) io.say(`The scratch BrainDog stopped: ${oneLine(told.trim().split('\n').slice(-3).join(' ')) || `exit ${code}`}`);
  return stopped ? 0 : code;
}

/* ── publish to GitHub ──────────────────────────────────────────────────── */

type Ran = { ok: boolean; out: string; err: string };

const runIn = (cwd: string, io: AgentIo) => (command: string, args: string[]): Ran => {
  const r = spawnSync(command, args, { cwd, env: io.env as NodeJS.ProcessEnv, encoding: 'utf8' });
  return { ok: r.status === 0 && r.error === undefined, out: (r.stdout ?? '').trim(), err: oneLine((r.stderr ?? '').trim() || (r.error?.message ?? '')) };
};

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

/**
 * `addon publish [<folder>] --github [--repo owner/name]`: the folder pushed to GitHub with `gh`, `v<version>` tagged,
 * and the line that installs it printed.
 */
export async function publishGithub(args: string[], io: AgentIo): Promise<number> {
  const usage = 'braindog addon publish --github takes one folder (this one when left out) and --repo owner/name, as in braindog addon publish bookshelf --github --repo you/bookshelf.';
  let values: { repo?: string | undefined; github?: boolean | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { github: { type: 'boolean' }, repo: { type: 'string' } } }));
  } catch {
    io.say(usage);
    return 1;
  }
  if (positionals.length > 1 || (values.repo !== undefined && !REPO.test(values.repo))) {
    io.say(usage);
    return 1;
  }
  const found = packFileIn(positionals[0] ?? '.', io.cwd);
  if ('fix' in found) {
    io.say(found.fix);
    return 1;
  }
  const read = readFolder(found.file);
  if (!read.ok) {
    io.say(read.fix);
    return 1;
  }
  if (read.copied.length > 0 && !read.json) {
    io.say(`${read.copied.join(', ')} differs from the source in ${basename(found.file)}. Copy it in, or run braindog addon dev once, then publish.`);
    return 1;
  }
  keepInStep(found.file, read, io);
  const door = await readCatalogueFile(read.text);
  if (!door.ok || door.value.kind !== 'pack') {
    io.say(`${basename(found.file)} would be refused: ${door.ok ? 'it is not an add-on.' : said(door)} Run braindog addon check ${positionals[0] ?? '.'} and publish once it passes.`);
    return 1;
  }
  const remote0 = addressFaults(read.doc);
  if (remote0.length > 0) {
    for (const r of remote0) io.say(oneLine(`${r.fix} (${r.code})`));
    io.say(`${basename(found.file)} would be refused by BrainDog, as said above. Nothing was pushed.`);
    return 1;
  }
  const { pack: id, version } = door.value.file.pack.manifest;
  const tag = `v${version}`;
  const dir = found.dir;
  const run = runIn(dir, io);

  if (!run('gh', ['--version']).ok) {
    io.say('publish --github uses gh, GitHub\'s command line. Install it from https://cli.github.com and sign in with gh auth login, then publish again.');
    return 1;
  }
  let repo = values.repo;
  if (repo === undefined) {
    const me = run('gh', ['api', 'user', '--jq', '.login']);
    if (!me.ok || me.out === '') {
      io.say('gh is not signed in. Run gh auth login, or name the repository with --repo owner/name.');
      return 1;
    }
    repo = `${me.out}/${id}`;
  }

  /* THE FOLDER IS ITS OWN REPOSITORY, never a folder inside another one, so what is pushed is the add-on and nothing else. */
  const top = run('git', ['rev-parse', '--show-toplevel']);
  if (top.ok && resolve(top.out) !== resolve(dir)) {
    io.say(`${dir} is inside the git repository at ${top.out}. Copy the add-on's folder out on its own and publish from there.`);
    return 1;
  }
  if (!top.ok) {
    const made = run('git', ['init', '-b', 'main']);
    if (!made.ok) {
      io.say(`git could not start a repository in ${dir}: ${made.err}`);
      return 1;
    }
    io.out(`Started a git repository in ${dir}.`);
  }
  const dirty = run('git', ['status', '--porcelain']).out !== '';
  /* A VERSION ALREADY TAGGED IS SAID BEFORE ANYTHING IS COMMITTED, so a refused publish leaves the folder as it was. */
  const before = run('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]);
  if (before.ok && (dirty || before.out !== run('git', ['rev-parse', 'HEAD']).out)) {
    io.say(`${tag} is already published, and the folder holds something else now. A published version is never moved: raise the version in ${basename(found.file)} and publish again.`);
    return 1;
  }
  if (dirty) {
    run('git', ['add', '-A']);
    const committed = run('git', ['commit', '-m', `${oneLine(door.value.file.title)} ${version}`]);
    if (!committed.ok) {
      io.say(`git could not commit the folder: ${committed.err}`);
      return 1;
    }
  }
  const head = run('git', ['rev-parse', 'HEAD']).out;
  if (!before.ok && !run('git', ['tag', tag]).ok) {
    io.say(`git could not tag ${tag}.`);
    return 1;
  }

  let url = run('gh', ['repo', 'view', repo, '--json', 'url', '--jq', '.url']);
  if (!url.ok) {
    const made = run('gh', ['repo', 'create', repo, '--public', '--description', oneLine(String(door.value.file.pack.manifest.summary)).slice(0, 300)]);
    if (!made.ok) {
      io.say(`gh could not make ${repo}: ${made.err}`);
      return 1;
    }
    io.out(`Made ${repo} on GitHub, public.`);
    url = run('gh', ['repo', 'view', repo, '--json', 'url', '--jq', '.url']);
    if (!url.ok) {
      io.say(`gh made ${repo} and then could not find it: ${url.err}`);
      return 1;
    }
  }
  const remote = /^https:\/\//u.test(url.out) && !url.out.endsWith('.git') ? `${url.out}.git` : url.out;
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).out || 'main';
  const pushed = run('git', ['push', remote, `HEAD:refs/heads/${branch}`]);
  if (!pushed.ok) {
    io.say(`git could not push to ${repo}: ${pushed.err}`);
    return 1;
  }
  /* A TAG ALREADY ON GITHUB AT OTHER BYTES IS REFUSED BY GIT HERE, which is the answer: never moved. */
  const pushedTag = run('git', ['push', remote, `refs/tags/${tag}`]);
  if (!pushedTag.ok) {
    io.say(`git could not push ${tag} to ${repo}: ${pushedTag.err} A version on GitHub is never moved: raise the version and publish again.`);
    return 1;
  }
  const line = `git:${repo}@${tag}:${basename(found.file)}`;
  io.out(`${oneLine(door.value.file.title)} ${version} is on GitHub at ${repo}, tagged ${tag} on ${head.slice(0, 12)}.`);
  io.out(`Install it with: braindog addon install ${line}`);
  io.out(`An agent installs it with: act installPack {"source": {"kind": "git", "ref": "${line.slice('git:'.length)}"}}`);
  io.out('Anyone can read it there. BrainDog has not reviewed it; to list it in the store, run braindog addon publish with --kennel.');
  return 0;
}

/* ── a git: line, read ──────────────────────────────────────────────────── */

const GIT_LINE = /^git:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)@([A-Za-z0-9_./-]+):([^\s?#]+)$/u;

/**
 * The raw address of `git:owner/repo@ref:path`, as the record's host reads it (`fetchShared`), or `null` when it is not
 * one. `BRAINDOG_GITHUB_RAW` stands in for raw.githubusercontent.com, so the line can be read from a copy on this machine.
 */
export function gitAddress(given: string, env: Record<string, string | undefined>): string | null {
  const m = GIT_LINE.exec(given);
  if (!m) return null;
  const [, owner, repo, ref, path] = m;
  const base = (env.BRAINDOG_GITHUB_RAW ?? 'https://raw.githubusercontent.com').replace(/\/+$/u, '');
  return `${base}/${owner}/${repo}/${ref}/${String(path).replace(/^\/+/u, '')}`;
}
