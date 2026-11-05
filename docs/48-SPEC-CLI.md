# 48 · apps/cli — specification

The `braindog` command: the `braindog-cli` package on npm, Apache-2.0, unscoped, one published file, no
runtime dependencies ([33-CONTRACTS](33-CONTRACTS.md) §5, [31-STACK](31-STACK.md) §6). Mode: ponytail. Node's
`util.parseArgs`, `fetch`, `node:sqlite` through the ports adapter, WebCrypto — the standard library all the
way down.

---

## 1 · Purpose and boundary

**What it does.** Logs a machine into one record through the RFC 8628 device flow; moves a record in and out
of the two containers of [03-DOG-FORMAT](03-DOG-FORMAT.md) §2 (`.brainl` ↔ `.brain`); verifies either offline;
lints, plans, installs and uninstalls packs ([04-PACKS](04-PACKS.md) §3–§4); dry-runs rules
([07-INGEST-AND-RULES](07-INGEST-AND-RULES.md) §6); mints, lists and revokes agent tokens; enrols and runs the
tier-C runner ([33-CONTRACTS](33-CONTRACTS.md) §11, [46-SPEC-SLASH](46-SPEC-SLASH.md) §4.7); starts a self-host
for development.

**What it refuses to do.** It never holds the record: every row read or written goes over HTTP to a record
that validates it. It never signs a `.brain` — the signature travels from the host that holds the key. It never
decrypts a grant. It never prints a stored token. It never imports `apps/selfhost` or `apps/worker` — apps
import packages, never each other ([35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §2) — so `init` and `dev` *spawn*
the self-host (§13 D5). It never runs `claude` with `--dangerously-skip-permissions`.

**What it may import.** `render` for `PRIMITIVES_VERSION` (36); `ports` for the envelope types and the
`node:sqlite` adapter (37; the one [40-SPEC-FIXTURES](40-SPEC-FIXTURES.md) §5.3 uses); `kernel` for
`FORMAT_VERSION`, `KERNEL_MIGRATION` and `applyMigrations` (41); `declare` for the offline lint (42);
`where` only transitively. Row 12 of [31-STACK](31-STACK.md) §2. The runner's kinds, their lint (`jobBody`) and
`fillPrompt` come from `kernel`, not from `slash/prompts`, so the edge to `slash` that §13 D9 planned was never
taken (§5.13). Everything else is `node:*`.

---

## 2 · Public API

An app's public surface is its command tree, its config file and its environment. `--host <host>` is a global on
every command but `mcp`. The second global, `--json`, is specified in §4.5 and **is built**, over every command
that has an answer to put in an envelope; §4.5 names the seven that do not and why. Every command exits with one
of four codes (§4.4).

| Command | Arguments · flags | Calls | Prints | Exit |
|---|---|---|---|---|
| `setup <host>` | `<host>` = `https://origin[/slug]` · `--dry-run` · `--yes` | in order, stopping at the first step that fails (§5.15): `login <host>` unless a live login for it is held; `install --apply` into the user profile, its plan printed first and, on a terminal, `Write these changes? [y/N]` asked before it is written (`--yes` writes without asking; off a terminal without `--yes` it stops after the plan with exit 1); where Codex is, its turn end (`notify`) in a marked block at the top of `~/.codex/config.toml` and BrainDog's block at the end of `~/.codex/AGENTS.md`, shown and asked the same way (`clients/codex-hooks.ts`); `claude mcp add-json braindog <json> --scope user` unless that entry is already there; `tools write --scope user`; `skills sync`, the last two as if outside any repository | one line per step on stdout with its command's own lines indented under it, and the six digits on stderr; last, `Nothing changed: this machine was already set up from <host>.` when no step changed anything. `--dry-run` asks for no login, writes no file, runs no `claude`, and reads the record only with a login already held | 0 · 1 · 3 |
| `login <host>` | `<host>` = `https://origin[/slug]` · `--keychain <project\|*>` | `POST /auth/device` then `POST /auth/device/token` until approved; with `--keychain`, `reach: 'vault'` and `scope` | the six digits and the URL (stderr); `logged in to <host> as <label> · token expires <date>`, or with `--keychain` `vault grant for <scope> on <host> kept as <label> · expires <date>`; an expired code, a denial and Ctrl+C are one sentence each | 0 · 1 · 3 |
| `logout [<host>]` | `<host>` = `https://origin[/slug]`, or `--host <host>`; both together only when they name the same host. There is no `--all` | nothing, on the network or off it. Reads the hosts file and rewrites it with `saveHosts`: for every key that names the host (`sameHost`, so a hand-written trailing slash goes too), `token`, `runner` and the whole `vault` map, then the entry once nothing is left in it, then `default` when it named that host. The host is never told, so the token stays live there until it expires or the owner revokes it in the app | `signed out of <host> · a token, a runner token and N keychain access removed`, and ` · no default host is set now` when the default named it; `No login to <host> is kept on this machine, so there was nothing to remove.` when there was nothing, which is 0; never a token, a label or a Keychain scope | 0 · 1 |
| `keys list` | `--project <name>` · `--everywhere` · `--json` · `--host <host>` | under the login, with no keychain access and no session headers: `schema` of the keys list and of projects, then `list` of both in pages of fifty, followed to the end, and one more read of the keys list filtered by `<deadline field> before today`, which says on the record's own clock which keys are past their day; when that answer holds every dated key and one of those days is a day old or less, one further read filtered by `<deadline field> after today`, which tells a record that answered from a host that ignores the filter; and when that read comes back empty, which is the true answer and also what a host gives that reads nothing by `after`, a last read filtered by `<deadline field> after -3d`, believed only when it holds every one of those near keys and no key without a day; and when that holds, one more filtered by `<deadline field> before +3d`, believed the same way, which tells a host that compares the word after the field as text (to it every day is before `today` and after `-3d`, and none is before `+3d`). A host that refuses any of these reads, or leaves a near key out, has the keys printed by this machine's date with a line saying the record did not say. Reads only, and opens no key | the keys your record holds, one line each: what each opens, where it applies, whether it is sealed, and the day it expires. In the `--json` document each key also holds `expired`, true when its day is past on the record's own clock. Never a value, a grant's id or a row's id | 0 · 1 · 3 |
| `keys put <label>` | `--opens <what>` · `--kind <kind>` · `--keychain <project>` · `--host <host>`; the value on stdin, never an argument | `POST /api/vault/deposit { label, opens?, kind?, value }` with the keychain access as bearer and the session headers | `deposited <credentials#n> on <host> · version <n>`, or `rotated …` when the label was already a key in scope; never the value or the label | 0 · 1 · 3 |
| `keys put --from <file \| folder>` | `--project <name>` · `--opens <what>` · `--kind <kind>` · `--dry-run` · `--host <host>` | reads a file of `NAME=value` lines, or a folder of one key a file; asks y/N on the terminal before each key, then one `POST /api/vault/deposit` per key, as `put`. With no terminal it sends nothing, and `--dry-run` neither asks nor sends. `--project` uses that project's keychain access and never falls back to the login. Under the login a name the record already holds is refused at the door and counted as skipped; under the project's grant the held key's value is replaced | each key by its name, then how many were sealed, skipped and refused; when a whole file or folder went in with nothing refused, declined or left unread, that it may now be deleted; never a value | 0 · 1 · 3 |
| `keys scan [<folder>]` | `--project <name>` · `--deposit` · `--ask` · `--json` · `--host <host>` | walks the repository, skipping `node_modules`, `.git`, links and any folder holding over 5,000 files, which it names; finds `.env` and `.env.<ending>`, `.dev.vars`, files under `.secrets`, `.pem` and `.p8` files and `id_*` key files, and skips `.env.example`, `.env.sample` and `.env.template`. Sends nothing unless `--deposit`, which seals as `put --from`. `keys scan --ask` files one question to add what it found, never a value | each key's name with its file, and one `keys put --from` command per place; never a value | 0 · 1 · 3 |
| `keys exec <label \| credentials#n> -- <command> [args...]` | `--as <ENV_NAME>` · `--keychain <project>` · `--host <host>` | `POST /api/vault/open { label }` or `{ credential }`, as `put`; then the command, with no shell, its own standard streams, and the key in one environment variable, named by `--as` or made from the label. On Windows the command is found through PATH and PATHEXT, and a `.cmd` or `.bat` starts through `cmd.exe /d /v:off /s /c` with every argument escaped for it and the key never on that line | nothing of its own, and never the value; a missing command, a bad `--as`, a label no name can be made from, a name that changes how a command runs (§8), or a batch file's argument that cannot be escaped is one sentence before any request | the command's exit code (1 for a signal) · 1 · 3 |
| `run <label \| credentials#n> -- <command> [args...]` | `--as <ENV_NAME>` · `--keychain <project>` · `--host <host>` | `keys exec`, dispatched to unchanged. It is a shorter name, not a second door, and never prints a key | what `keys exec` prints | the command's exit code (1 for a signal) · 1 · 3 |
| `keys headers <credentials#n \| label>` | `--as <Header>`, required · `--keychain <project>` · `--host <host>` | nothing when standard output is a terminal, which is refused first; otherwise `POST /api/vault/open { credential }` or `{ label }` under keychain access and never the login, as `exec`, which the host logs as a `grant.read` (§5.16) | `{"<Header>":"<value>"}` and a line break on stdout, for a program that reads it, such as Claude Code's `headersHelper`, and nothing else. A terminal, a header name outside letters, digits, `-`, `_` and `.`, and a key holding a character a header cannot carry are one sentence each on stderr, and print no key | 0 · 1 · 3 |
| `keys helper <credentials#n \| label>` | `--keychain <project>` · `--host <host>` | as `keys headers`, by the same path: nothing when standard output is a terminal, which is refused first; otherwise `POST /api/vault/open { credential }` or `{ label }` under keychain access and never the login (§5.16) | the key alone and a line break on stdout, for a program that reads it, such as Claude Code's `apiKeyHelper`, and nothing else. A terminal and a key holding a character a header cannot carry are one sentence each on stderr, and print no key | 0 · 1 · 3 |
| `skills sync` | `--host <host>` · `--dry-run` | `GET /api/context`; `GET /api/get` for each skill it writes or checks; `POST /api/propose` with a rowset update of `body` and `rev` for a local edit; `POST /api/create` with `managed: false` for a file found by hand. Writes `<CLAUDE_CONFIG_DIR or ~/.claude>/skills/<name>/SKILL.md` or `commands/<name>.md`, a project's under `<top-level>/.claude/`, and the lock at `~/.braindog/skills-lock.json` | one line per file written, updated, deleted, kept and proposed, or registered, a file in a repository marked `(in the repository, not committed)`; `Skills are in sync.` when there was nothing to do | 0 · 1 · 3 |
| `doctor` | `--replaced <replace.json>` · `--under <folder>` · `--config-dir <folder>` · `--json` | nothing on the network. Reads each profile's settings and servers file, every other agent app's servers file through the clients table, the folders named by `--under`, `crontab -l` and `ps -A`, and writes none of them (§5.18) | one line per profile and per other app, then up to three headings (`Still naming <tool>:`, `Shaped like a key, and the value is never shown here:`, `Not as braindog install leaves a profile:`), each place by its file and its entry, then one `Started before this command was updated: restart <app>.` line per app, then `<n> places to fix.` or `Nothing to fix.`; never a value | 0 · 1 |
| `env diff` | `--config-dir <folder>` · `--host <host>` · `--json` | on the network only when this machine holds a login: `list` of the tools and the skills lists, in pages of fifty, under the login and with no session headers, so it opens no run. Reads each profile's settings, servers file, skills folder and CLAUDE.md, the profiles `doctor` finds, ccenv's under `CCENV_HOME` among them, and writes none of them | one line per profile with how many servers, plugins, hook events and skills it holds and its CLAUDE.md's hash; then `Missing beside the other profiles:`, `Not the same in every profile:` (a server's entry or CLAUDE.md, by hash) and `Against your BrainDog's <n> tools and <n> skills that apply everywhere:`, the profiles that lack the same names on one line; then `<n> differences, by name and hash only.` or `Nothing differs.`. A name shaped like a key is `[hidden name <n>]`; never a value | 0 · 1 |
| `env apply` | `--profile <name>`, repeatable · `--dry-run` · `--yes-data` · `--host <host>` | in each profile `doctor` finds, or each named, `setup`'s steps 2 to 5 (§5.19): `install --apply` over that profile, `claude mcp add-json braindog` and each tool's `claude mcp add-json` with its `CLAUDE_CONFIG_DIR`, `skills sync` into its folder, and with a list in the role `profiles` its rules in a marked block of its CLAUDE.md. Then, where Codex is and no `--profile` was named, Codex's turn end and AGENTS.md block and BrainDog's server in its config.toml, each program pinned as Claude Code's are. The record by `schemas`, `list`, `get` and `context` under the login with no session headers. An entry that runs a program is asked y/N at a terminal and pinned in `~/.braindog/pins.json` before it is placed | a line per step and profile with its command's own lines under it, each program entry whole with whether it is approved here; then what was left out for want of approval, and `Applied to <profiles>.` or `Nothing changed: every profile already holds what your BrainDog applies to it.`. `--dry-run` writes, runs, asks and pins nothing | 0 · 1 |
| `statusline` | `--statusline` on `setup` and `env apply` places it | reads Claude Code's status JSON on stdin and prints one line; no network on the print path, and the placed command starts Node on `braindog-statusline.mjs` alone (about 35 ms a draw on an M-series Mac, 103 through the whole command). At most every five minutes for each profile (`~/.braindog/statusline/<profile>`, stamped first) it starts a detached `statusline --beat` that sends the profile's name, the machine, the 5 hour and 7 day percentages and the reset time to the Profiles add-on's row (`keepMeters`, `profile-place.ts`); nothing else leaves, and a record without the add-on does nothing | one short line | 0 |
| `env pins` | `--forget <name>` · `--json` | nothing on the network: `~/.braindog/pins.json`, which `--forget` alone writes | one line per approved entry, oldest first: its name, its kind, the profiles it was placed in, the first twelve of its hash and the day it was approved; with `--forget`, how many pins of that name went | 0 · 1 |
| `env check` | `--profile <name>`, repeatable · `--json` | no request of its own: `claude mcp list` once a profile, with that profile's `CLAUDE_CONFIG_DIR` and with none for the default one, in the home folder, three at once and thirty seconds each. The `claude` found on the path is asked y/N at a terminal and pinned before its first run (§5.19) | a line per profile with how many servers stand how, then a line per status naming its servers; last, how many need a sign-in or failed, or `Nothing waits on a sign-in and nothing failed.`. A server by its name alone, and a name shaped like a key as `[hidden name <n>]` | 0 · 1 |
| `sync inventory` | `--under <folder>` · `--host <host>` · `--json` | on the network only when this machine holds a login: `list` of the skills list, as `env diff` reads it, and on a machine that has joined setup sync one `sealedList` within the command's budget. Names and sizes by `stat`, and no file it lists is opened; the skills lock is read when the record is not. In each repository under `--under`, `git --no-optional-locks status --porcelain=v1 -z --ignored`, `git rev-list --count --branches --not --remotes` and `git rev-parse --git-common-dir`, and nothing that writes | each group by name and size: auto memory (`projects/<project>/memory/` alone), the context folder, the programs in `~/.local/bin`, ccenv's shared files, the skills the record does not hold, the `.env` files git ignores by repository; each repository's commits on no remote and changes not committed, a linked worktree as one of its checkout; then `It would refuse:` with why (a sign-in, session transcripts, a plugin cache, a cache, a link, a name that says it may hold a key); then `It would carry <n> files, <size>, and refuse <n> things.`; on a machine that has joined, `Sealed already:` with the sealed files by count and size and each machine's bundles and newest time, read off their keys, nothing opened | 0 · 1 |
| `sync join` | `--name <machine>` · `--new-key` · `--host <host>`; the passphrase typed at the terminal, never an argument | under this machine's own login, never an agent app's token, and with no session headers (§5.20): `schemas { every: true }` and `packs` to find the list playing `role: carry`, `boot` for the record's address, `sealedGet { key: 'sync/key' }`, `sealedList`; on a record with no `sync/key`, a new key and `sealedPut` of its copy, read back; otherwise the copy opened with the passphrase and the retired machines' notes read. The key is written to the Keychain, Credential Manager or the secret service (`secret-store.ts`) and the machine's note to `~/.braindog/sync.json` | `Joined setup sync on <host> as <machine>. The sync key is kept in <store> on this machine.`, the honesty line on the first machine, and what to run next; a wrong passphrase three times, a retired name, a name another machine sends under without a yes, a record with sealed files and no copy of the key without `--new-key`, and no terminal are one sentence each | 0 · 1 · 3 |
| `sync push` | `--dry-run` · `--host <host>` | as `join` finds the lists, then `list` of Carry, `sealedList`, a `sealedPut` for each thing whose sealed version is not kept yet, a sealed manifest, `create` of a Bundles entry and `update` of this machine's older ones; with nothing changed, one `update` of the latest entry's Last checked time (`heard`). Reads each thing's place on this system, `git` for `.env` files and unpushed work, and the Keychain for an item of tool sign-ins; takes `~/.braindog/locks/sync.lock` | the machine and system, then one line per thing in Carry: off, refused and why, no place here, nothing there, sealed already, or sealed and sent, by files and size, with what was left out under it; then `Sealed one bundle from <machine>: …` or `Nothing changed since the last bundle`. Never a byte of what is sealed | 0 · 1 · 3 |
| `sync pull` | `--from <machine>` · `--dry-run` · `--yes-data` · `--host <host>` | as `push` finds them, then the newest bundle from another machine or the one named: its sealed manifest and each thing's sealed file by `sealedGet`, each opened here; `list` of the people list for a thing that belongs to someone else; `update` of Carry's `waits`. Writes each file at its place on this system, a replaced one copied first to `~/.braindog/sync-kept/<when>/`; pins in `~/.braindog/pins.json`; the Keychain item of tool sign-ins on a Mac | one line per thing: placed, already here, left and why, waiting for a yes; each program shown whole before `Place <path> on this machine? It runs a program. [y/N]`, a thing that is someone else's asked by their name, tool sign-ins asked before they move; then where replaced files were kept and `Placed what <machine> sent.` | 0 · 1 · 3 |
| `sync patches` | `--from <machine>` · `--dry-run` · `--host <host>` | as `pull` reads a bundle, the things of kind unpushed work alone; then `git clone`, `git fetch`, `git bundle verify`, `git checkout -B` and `git apply` in each repository under this system's place, never asking at the terminal | one line per repository: what it holds against which base and whether it applied, or why not; each key-shaped file left for the Keychain with the `keys put` command for it | 0 · 1 · 3 |
| `sync drill` | `--from <machine>` · `--host <host>` | as `pull` reads a bundle, from any machine, this one included; writes each file into a scratch folder of its own and removes it after; `create` of a Drills entry and `update` of the one before | one line per thing with its files and whether every hash matched, then `Passed: …` or `Failed: …` with what failed | 0 · 1 · 3 |
| `sync retire <machine>` | `--yes` · `--host <host>` | as `push` finds the lists, then `sealedPut` of the machine's sealed note at `machine/<name>/retired` and `update` of its latest Bundles entry to retired, or `create` of one; on this machine, its key removed from the store and its note from `sync.json` | `Retired <machine>. …`; on this machine, its key gone and each item or file of tool sign-ins asked y/N before it is removed | 0 · 1 · 3 |
| `tools scan` | `--host <host>` · `--dry-run` | reads `<top-level>/.mcp.json` and `~/.claude.json` (`mcpServers`, and `projects[<path>].mcpServers`) and writes neither; `GET /api/context` and `/api/get`; `POST /api/create` for a new server, `POST /api/update` of `hosts` and `seen` for a matching row, `POST /api/propose` with a rowset for one that differs, asked as `Change how <name> starts?`; a server with no row of its name is matched to the row of its scope that starts the same way (the same command and arguments, or the same address), which is stamped as seen with nothing added or asked; each key through `keys put` | one line per server recorded, proposed or skipped, and one sentence when keys were recorded by name only for want of keychain access, which the start hook says once per host until a grant is kept; never a value | 0 · 1 · 3 |
| `tools write` | `--scope user\|project` · `--dry-run` · `--host <host>` | `GET /api/context` and `/api/get`; reads the entry already in `~/.claude.json` or `<top-level>/.mcp.json`; with `--scope`, `claude mcp remove` and `claude mcp add-json <name> <json> --scope <scope>`, only for an entry that is absent, still what `~/.braindog/tools-lock.json` says was written, or still the command the scan read | each entry it would add or replace, as `+ <name> at <scope> scope: <json>` or `~ …`, a line for each need an entry cannot carry, then what was applied; no entry holds a value. A stdio tool's key is wrapped in `keys exec`, and an HTTP tool's header key is named by a `headersHelper` that runs `keys headers` (§5.16) | 0 · 1 · 3 |
| `session show\|next\|tried\|note\|end` | `show` takes no argument; `next`, `tried` and `note` take one line of text in quotes; `end` takes `--state idle\|handoff\|done` (`idle` by default) · `--next <text>` · `--host <host>`. No verb names a run, because the session file for this folder does and a token that named one would be refused | `GET /api/context` for every verb, then for all but `show` `POST /api/handoff` with one of `{ next }`, `{ tried }`, `{ note }` or `{ state, next?, branch?, head? }`, as the run the session headers name | `show`: the run and its state, the last handoff left here with the last three things tried, and who else is live in this repository. The rest: one line naming the run. A folder with no session file, a `--state` outside the three, and a missing or unquoted line are one sentence each, before any request | 0 · 1 · 3 |
| `context` | `--host <host>` | `GET /api/context`, one call, and it opens no run | the card: Next, Waiting, Learned and More, each left out when empty, plus an Also line only when another run is working in the repository; three items a slot, 1,500 characters, as the start hook prints it, but with a first line that names the run and where it stands rather than an event it did not have | 0 · 1 · 3 |
| `tidy` | `--ask` · `--json` · `--host <host>` | `GET /api/stale`, one call with no session headers: it opens no run, files nothing and answers nothing; `--ask` also asks to fold what is held twice | a line a kind, `N  <what the record says>`, and under it `Clear it: <the one call that clears it>`; then `7 things are stale.`, or `Nothing is stale.` alone. With `--json`, the record's answer untouched in the envelope (§4.5). A BrainDog built before the read says in one sentence that it is older than the command | 0, on an older BrainDog too; 1 on any other refusal, with its fix; an unknown flag prints the usage and sends nothing |
| `automations list` | `--all`, `--host <host>` | `GET /api/context`, then `GET /api/automations` with no `rule`: READ+, held by the record to the lists the caller reads | `Automations on this BrainDog:` and one line each: the bare id, the name when one was given, what starts it and whether as a run or inside the write, `Turned off.`, the pack and project, the next clock time, the last run's state, time and sentence, the runs still open, and this month's counts. `No automation you can read is set up on this BrainDog.` when the list is empty. Without `--all` only the ones that need a look (on, last run failed) get a line, and one line counts the rest (AK25). Under `--json` the value is the record's `AutomationRow[]` unchanged | 0 · 1 · 3 |
| `automations show <id>` | `<id>` = `chase` or `rule.chase` · `--host <host>` | `GET /api/automations { rule }` | the id, name and version; what starts it and whether it is on; this month's counts and the runs open; then the last ten runs, newest first, each with its state, start time, actor and how it began, and under it each step as `<n> <kind>: <state>` with the step's answer cut to 120 characters. An inline rule says it has no runs to show because it happens inside the write. The value is the record's `Automation`, body and runs whole. An unknown id is the record's `DECLARATION_UNKNOWN` sentence | 0 · 1 · 3 |
| `automations run <id>` · `automations cancel <run>` | `--host <host>` | `POST /api/automationRun { rule }` or `POST /api/cancelRun { run }`. Both are ADMIN, and the record's `admin()` refuses every token before it reads the arguments, so from this command both answer `NEEDS_BROWSER_SESSION` with `Open this from the app; a token cannot start an automation.` or `... cannot stop a run.` They are built rather than left out, as `page push` is, so they work unchanged the day a proven session that is not a cookie can reach an ADMIN door | `<id> started as <run>. The next drain takes it.` or `<run> is cancelled. A run stopped while it waits never resumes.`; the value is the record's `{ run }` or `{ run, state }` | 0 · 1 · 3 |
| `scripts list` | `--host <host>` | `GET /api/context`, then `GET /api/scripts`: READ+, held by the record to a caller who reads every list a script reads and writes | `Scripts on this BrainDog:` and one line each: the bare id, the title when one was given, how it starts (its clock, the door that hands it an arrival, a rule), `Paused` with where to resume it when three refused runs in a row stopped it, the pack, the next clock time, the last run's outcome, time and the record's sentence, the refused runs in a row while it is still on, this month's runs, and the lists it reads and writes and the origins it fetches from. `No script you can read is installed on this BrainDog.` when the list is empty. No log and no key's value: the log stays on the run's event. Under `--json` the value is the record's `ScriptRow[]` unchanged | 0 · 1 · 3 |
| `scripts resume <id>` | `--host <host>` | `POST /api/resumeScript { script }`, ADMIN, so refused to a token for the same reason | `<id> runs again now. Three more refused runs in a row pause it again.`; the value is `{ script }`. The id is the first word of its `scripts list` line | 0 · 1 · 3 |
| `page pull <slug>` | `--out <file>` · `--host <host>` | `GET /api/context`, then `GET /api/arrangement { page }`: READ+, the page's stored declaration as the caller may read it; for a page made from a template, the template's. The answer is read with `storedOf` from `@braindog/dog`, the reader the app's source view shares | writes `dogText` of the stored body to `<page>.dog` (or `--out`), the same bytes the app's source view shows and downloads, and prints `<page> written to <file>.`, or for a template's page `<slug> is one of the pages <template> makes, one for each row, so <template>'s source was written to <file>.`; the value is `{ page, file, version }`, with `template` for a template's page. A refusal is the record's sentence | 0 · 1 · 3 |
| `page push <file>` | `--host <host>` | reads the file with `parseDog`, then `POST /api/setDeclaration { body }` with the body exactly as read, which an owner's session applies. ADMIN, and the record's `admin()` refuses every token before it reads the arguments (ADR-060). On that one refusal, `NEEDS_BROWSER_SESSION`, it reads `governance { register: 'suggestion' }` for an open change with the same `declaration_id` and `to`, and otherwise `POST /api/propose { question, body_kind: 'change', body: { declaration_id: 'page.<name>', to: { id, kind: 'page', body } } }`. Nothing is applied until the question is accepted on Decide. Any other refusal is shown as the record said it. A file the parser refuses is never sent | `<page> pushed to <host>.` with the value `{ page, host }` where it was applied; `<name> asked as SG<n>. It waits on Decide.` where it was asked, and `<name> is already waiting as SG<n>. It waits on Decide.` where the same change is open, with the value `{ page, waits, asked, question? }`; a change the person already answered prints the record's sentence and files nothing. A parse failure prints `<file>, line <n>: <sentence>` | 0 · 1 · 3 |
| `page check <file>` | none | nothing on the network. Reads the file with `parseDog`, then the kernel's `validateDeclaration` on `page.<page>` with no installed state, so a `requires` naming a list nobody installed is not asked about | `<page> reads as a page. Nothing was sent.`; the value is `{ page, blocks }`. A parse failure prints `<file>, line <n>: <sentence>`; a declaration the kernel refuses prints the kernel's sentence | 0 · 1 |
| `mcp` | `--agent claude\|codex\|cursor\|other` · `--host <host>` | reads one JSON-RPC message per line on stdin and sends it to the host's own `POST /mcp` with the bearer and the session headers, inside a 20-second budget (`bridge.ts`); with the host away, the cached list answers and a tool call refuses. In Claude Code the session headers name the profile, `x-braindog-profile` (Environment, `CLAUDE_CONFIG_DIR`), which the record keeps as the run's `seat` (kernel migration 44): stamped as the run opens, or learned once from a later call or pulse, and never written after. After its first `pulse` that finds a run, at most once a day for each profile on each machine (`~/.braindog/places.json`, claimed before it asks and given back when the host is away), it keeps the profile's place where the Profiles add-on is on (`profile-place.ts`): `POST /api/schemas { every: true }` and `POST /api/packs` find the list playing `role: profiles` and the list of the same add-on that links each row to one profile, `POST /api/list` reads both, and one `POST /api/create` or `POST /api/update` writes the machine, the build, whether both hooks are there and when it was heard, as the session's run, a place marked stale going back to live. A profile no row is named for, a place he retired and a session already closing write nothing; without the add-on the `schemas` read is all | JSON-RPC on stdout and nothing else; one line on stderr when it cannot start. A host that does not answer is a tool error carrying the unreachable sentence of the agent path's §1.7. A `create` or `update` carries an `op_id`, the app's or one the bridge makes when the host lists the argument, and a lost answer sends it once more with the same id, so it is one entry. A read is never sent twice | 0 once stdin closes and every call in flight is answered · 1 when it cannot start |
| `hook notify <json>` | Codex's event as its last argument, of which only `type` is read | nothing on the network: the inbox file the bridge keeps for the Codex process that started it (`codex-<pid>`) | nothing printed; when a turn ends and the run has not taken something he told it, one system notice on this machine, once per instruction (`notifyHook`) | 0, always |
| `hook start` · `hook end` · `hook beat` | none; Claude Code runs it with its event on stdin (`session_id`, `cwd`, `source` or `reason`; what each event sends is the measured table under "The session hooks") | `start`: `POST /api/attach { source, client_id, branch, head }` with the session headers, inside 8 seconds, then writes the session file and prints the card, then on `startup` or `resume`, when they are owed, starts `skills sync` and `tools scan` in a process of its own that it never waits for, and last writes how long it took into the session file. `end`: `POST /api/meet { name, email or handle, where }` for each author of the commits since the run began, at most 10, then `POST /api/end { branch, head }` (`POST /api/handoff { state: 'idle', branch, head }` only where the host has no `end`), all as the run the session file names. The start hook's time is sent as `POST /api/heard { kind: 'hook', ms, build }` by the next hook of the same session, sent beside the call it makes anyway, the next `attach` or the `end`: a small request of its own in parallel with that call, never waited for before it, and never one the start hook makes. On a machine that has joined setup sync, `end` and the day's first `start` then start `sync push --auto end` or `--auto day` as a process of its own and never wait for it (§5.20) | `start`: the card: Next, Waiting, Learned and More, each left out when empty, plus an Also line only when another run is working in the repository; three items a slot, 1,500 characters; or one line when the machine is not signed in, the host does not answer, or the host refuses. `end`: nothing. `beat`: Claude Code runs it after every tool call; it reads the age of `~/.braindog/beats/<session>` and stops unless 5 minutes have passed, otherwise `POST /api/beat` as the run the session file names, inside 2 seconds; it prints nothing | 0, always, because a non-zero exit is how a hook stops a session |
| `install` | `--apply` · `--config-dir <folder>` (repeatable) | nothing on the network; reads `<profile>/settings.json`, where the profile is each `--config-dir`, else `CLAUDE_CONFIG_DIR`, else `~/.claude` | each entry it would add, as `+ hooks.<Event>: <json>`: three hooks, SessionStart with the status line `Connecting to BrainDog...`, SessionEnd with `Saving this session to BrainDog...`, and PostToolUse (the beat) with none, each with a 10 second timeout, and an older BrainDog entry replaced in place as a `~` line; then the `claude mcp add-json` line that registers `mcp`. With `--apply` it writes them, after copying the file to `settings.json.bak`, or the first free `.bak<n>` | 0 · 1 when a settings file is not JSON or not the settings shape, and then nothing is written |
| `init <slug>` | self-host only | spawns the self-host entry: `init <slug>` (§5.14) | the child's output | the child's |
| `serve [<file>]` | self-host only | spawns the self-host entry: `serve [<file>]` (§5.14) | the child's output | the child's |
| `dev` | self-host only; `--port <n>` (default 8080) | spawns the self-host entry: `dev` | the child's output | the child's |
| `export` | `--sections data,origin,governance` · `--redact-grants` · `--with-attachments` · `-o <file.brain>` · `--key <pubkey \| url>` | `POST /api/export` — one streamed body, under an operation grant (§5.2) · `GET /a/<sha256>` for attachments | the verify block of §5.6, then the paths written | 0 · 1 · 3 |
| `export --mirror <folder>` | `--host <host>` | `boot`, then `schema` and `list` page by page for every list it names, under the machine's own sign-in and no approval (§5.9) | one line: the lists, how many they hold, the files changed since the folder was last written, and any list not read | 0 · 1 · 3 |
| `import <file.brain \| file.brainl>` | `--key <pubkey \| url>` | offline verify, then `POST /api/import` — one streamed body (operation grant) | `imported <tables> tables, <rows> rows · event <id>` | 0 · 1 · 3 |
| `verify <file>` | `--key <pubkey \| url>` (optional: unpinned without it) | nothing — offline; the URL form of `--key` is the one network call | the verify block | 0 · 1 |
| `pack lint <dir \| file>` | — | nothing — offline, `@braindog/declare` | `ok <pack> <version> · <n> declarations · <checksum[0..16]>`, or one sentence per refusal | 0 · 1 |
| `pack plan <src>` | `<src>` = path · `https://…` · `git:owner/repo@ref` · Kennel id | `POST /api/planPack` (operation grant) | the diff screen of 04 §3 | 0 · 1 · 3 |
| `pack install <src>` | `--with-deps` · `--yes` | `planPack`, then `POST /api/installPack { pack, plan_hash }` | the diff, `Apply? [y/N]`, then `installed <id> <version>` | 0 · 1 · 3 |
| `pack uninstall <id>` | `--yes` | `POST /api/uninstallPack` | the RETIRES · KEEPS · DELETES block of 04 §4 | 0 · 1 · 3 |
| `rule test <id>` | `--against <raw-id \| register>` | `POST /api/ruleTest` | the dry run of 07 §6, plus `won / lost / takenBy` | 0 · 1 · 3 |
| `rule apply <id>` | `--dry` | `POST /api/ruleApply { id, dry }` | `would set <n> fields on <m> rows` / `set <n> fields on <m> rows · batch <ulid>` | 0 · 1 · 2 · 3 |
| `token create` | `--scope read,propose` · `--name <n>` | `POST /api/createToken` (operation grant) | the token, **once**, then `shown once` | 0 · 1 · 3 |
| `token list` | — | `POST /api/listTokens` (operation grant) | id · name · scope · created · last used · surface | 0 · 1 · 3 |
| `token revoke <id>` | — | `POST /api/revokeToken` (operation grant) | `revoked <id>` | 0 · 1 · 3 |
| `runner enrol <host>` | — | `claude --version` and `--help` first, then `POST /auth/device` with `reach: 'runner'` (§5.13) | the six digits; `enrolled on <host> as <label> · runner expires <date>`, never the bearer | 0 · 1 · 3 |
| `runner repos add <name> <folder>` · `runner repos list` | — | nothing: this machine's own map in `~/.braindog/runner.json` | the map | 0 · 1 |
| `runner allow <kind>` | — | nothing: the kind as the last refused job carried it, kept in `waiting` | the kind whole, and one question at the terminal | 0 · 1 |
| `runner run` | `--once` · `--host <host>` | `claimJob { wait: 20, host, seats }` · `postJobEvent` · `readCancel` under the runner's own bearer; spawns `claude` in the kind's repository folder or an empty one, under the Claude Code profile the job names | one line per job to stderr; never exits unless `--once` | 0 · 1 · 3 |
| `--version` | — | nothing | `app <date>+<sha> · format 1 · kernel <n> · primitives 1` | 0 |

Thirty commands plus `--version`, counted: the seventeen of the first design, then `mcp`, `serve`, `hook`
(its two events in one row), `install`, `keys put` and `keys exec`, `skills sync`, `tools scan` and `tools write`,
and the agent path's `logout`, `run`, `session` (its five verbs in one row) and `context`. `automations` and `scripts`
came after the count, for the automations canvas, and have their five rows above.
`setup` and `keys headers` came after it too, for the agent layer's finish, and have
their rows above.
`keys list` and `doctor` came after those, for the Keys index and for what `install --replace` leaves behind, and have
their rows above.
`env diff` and `sync inventory` came after those, for the several profiles one machine runs and what a setup sync
would carry from it, and have their rows above.
`keys helper`, `env apply`, `env pins` and `env check` came after those, for what each of those profiles is given
and the programs placed in it, and have their rows above.
`sync join`, `sync push`, `sync pull`, `sync patches`, `sync drill` and `sync retire` came after those, for setup sync
(§5.20), and have their rows above.
`--json` **is built.** Exactly one JSON document on stdout, every progress line moved to stderr, and the flag is
taken out of the arguments before dispatch so no command's own `parseArgs` has to know a global exists
(`apps/cli/src/json.ts`). `mcp` is excluded, because its stdout is the protocol; §4.5 lists the other six.
`--host` beats `BRAINDOG_HOST`, which beats `hosts.json`'s
`default`. A host is written `https://origin[/slug]`; a bare name means https, and plain http is refused
except to this machine, because the bearer would cross the network in the clear.

**What is built is what `main.ts` dispatches**, and its usage text lists the same words: `setup`, `runner`, `mcp`,
`hook`, `install`, `login`, `logout`, `keys`, `run`, `export`, `import`, `token`, `skills`, `tools`, `page`,
`usecase`, `pack`, `kennel`, `context`, `session`, `automations`, `scripts`, `verify`, `init`, `serve` and
`--version`. A word it does not know is a typo, and it says so. **The artefact is built**: §3's bundle is
`dist/braindog.mjs`, the manifest's `bin` points at it, and the manifest is not `private`, so `tools/release.mjs`
offers `braindog-cli`. A checkout still runs `node apps/cli/src/main.ts`, which is what `setup` writes into Claude
Code's entry when it runs from one. `init` and `serve` are the self-host's, which has no `bin` of its own and tells
people to type them, so this command claims the name and spawns the self-host for both.

A new machine needs two lines, the install and then `setup`:

```sh
curl -fsSL https://brain.dog/cli/install.sh | sh     # macOS and Linux; on Windows: irm https://brain.dog/cli/install.ps1 | iex
braindog setup https://app.brain.dog/<slug>
```

`login` and `install` stay commands of their own, and `setup` runs both (§5.15).

**`automations` and `scripts` are the automations canvas from a terminal** (`apps/cli/src/automations.ts`), over five record methods: the four the canvas and the MCP tools already call,
`automations`, `automationRun`, `cancelRun` and `resumeScript`, and the `scripts` read. Reading is open to any token the record lets read the lists
involved; starting, stopping and resuming are ADMIN, and a token is refused at that door by the record, not by this
command, so a person is told where the button is. **`scripts list` was refused here until the record could answer it**:
measured on 2026-09-22, no method in `packages/host/src/index.ts`'s route table read the `schedule` rows of kind
`script` or listed script declarations (`actions` filters to `pull`, `call` and `poll`), so the id to resume was only
in the event that paused the script. The record's READ+ `scripts` is that read now, and `list` prints it.

Claude Code registers `mcp` once per profile, and no token appears in the line or in the file it writes. `setup`
runs this line itself, as its third step (§5.15):

```
claude mcp add-json braindog '{"type":"stdio","command":"node","args":["<checkout>/apps/cli/src/main.ts","mcp","--agent","claude"]}' --scope user
```

### The session hooks

`install` puts two entries in Claude Code's user settings. Each runs a shim in `apps/cli/hooks/`,
`braindog-hook.ps1` on Windows and `braindog-hook.sh` elsewhere, which passes the event on stdin to
`braindog hook start` or `braindog hook end` and exits 0 whatever happens. From a checkout at `C:\src\braindog`
the entries are:

```
+ hooks.SessionStart: {"hooks":[{"type":"command","command":"powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\\src\\braindog\\apps\\cli\\hooks\\braindog-hook.ps1\" start","timeout":20}]}
+ hooks.SessionEnd: {"hooks":[{"type":"command","command":"powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\\src\\braindog\\apps\\cli\\hooks\\braindog-hook.ps1\" end","timeout":15}]}
```

- **Start.** It attaches to the run, writes the session file, and prints the card, which Claude Code adds
  to the model's context. A `resume` sends the resumed conversation's own `session_id`, so it re-attaches to the
  same run; a `clear` sends a new one, so it is a new run; a forked resume sends `fork` and a new id, and is read
  as a `startup` (measured, below). `startup` and `clear` print the whole card; `compact` prints only its Next line, the one thing the model just
  lost; a `resume` of the same session within an hour of a hook last hearing from it prints nothing. With no token it prints one line naming `BRAINDOG_TOKEN` and
  the hosts file, and `braindog login <host>`. A host that does not answer within 8 seconds is one line
  too.
- **End.** First it meets the people in this session's commits: the authors of `git log` since the run's first
  head, read only, each once and at most 10, sent to `meet` with an email, or a `github:` handle for GitHub's
  private address, and `where` as `commit <h> in <repo>`. Bots, by a name ending in `[bot]` or a noreply
  address, and the machine's own `git config user.email` are left out. It goes first because a write brings an
  idle run back to active, and it stops sending once half of the 8 seconds has passed. Any refusal but one author's malformed address ends
  it silently, so a record with People switched off or a host that is down costs nothing.
  Then it sets the run `idle`, with its branch and commit, and prints nothing. It never sets `done`: a
  terminal closing is not the work finishing, and a session that crashes never says so. A run already handed
  off, done or abandoned has no declared move to `idle`, so the record refuses the call and the run stays as it
  was. When another session in the same folder has rewritten the session file since, its client id differs,
  and the hook leaves that run alone.
- **The hook's own time.** The start hook counts from its process's start to the card printed, and keeps the
  milliseconds in the session file as `hook_ms`. The next hook of the same session (by `session_id`) sends it as the
  agent door's `hook` mark, against the run that start attached and with the command's build, beside the call it
  makes anyway: a compaction's or resume's `attach`, or the `end`. HTTP takes one method a request, so the mark is a
  request of its own sent in parallel with that call, until the host reads it off a header. The end takes it out of the file as it sends it,
  so a time is sent once. A clear is another session and never sends its predecessor's time. A host without `heard`
  refuses the mark and the hook carries on.
- **The card**, five slots in this order, each left out when it is empty, at most three items a slot and 1,500
  characters in all, clipped at a word: who the run is and where (`BrainDog · run S731 · project BrainDog ·
  Claude Code on MacBook`, the device named as a person names it, never a hostname); Next, the last handoff's
  step with its age and author, and "check before acting" when it is older than a day or another run left it;
  Waiting, the questions on the owner, merged when they read the same once ids and case are ignored; Learned,
  the two newest learnings for this project; and More, counts of dead ends and learnings, keys by name, and
  `call context`. An Also line follows Next only when another run is working in the repository, and the
  caller's own run is never in it. Keys and skills are counts, never lists.
- **Skills sync and tools scan.** On `startup` and `resume` only, and only when the record has a skills or tools
  register and what they read moved since they last ran whole here, `start` prints the card first and then starts
  `hook later <file>` as a process of its own, which it never waits for: `skills sync` and then `tools scan`, each on
  its own client within 45 seconds, two minutes in all. A skills list the context cut short runs once a day. The job
  file sits beside the session files, holds no token, and is deleted once read; what the work did is one line in
  `hook.log`. A failure leaves the work owed for the next start. The scan's sentence about keys kept by name for want
  of keychain access is said once per host rather than in every briefing, and said again only after a grant has been
  kept and there is none again. A `compact`, a `clear` or a subagent runs neither (a subagent is told the card's first
  line alone), and a record with neither register costs no request and no file read.

#### What Claude Code hands each hook, measured

Measured on Claude Code 2.1.295 on 9 October 2026, on macOS, in a scratch profile (`CLAUDE_CONFIG_DIR`) whose hooks
copied their stdin and their Claude variables to a file. The profile was not signed in, so every event that needs a
model's answer is marked not measured rather than guessed. Each captured event is a fixture in
`apps/cli/test/fixtures/hook-events/`, and `apps/cli/test/hooks.test.ts` reads each one through `eventOf`.

| What happened | Hooks, in order | `session_id` | `source` or `reason` | Fixture |
| --- | --- | --- | --- | --- |
| `claude` opened in a folder | SessionStart | a new one | `startup`, with `model` | `startup.json` |
| `claude -p` | SessionStart, SessionEnd | a new one | `startup` (no `model`), then `other` | `startup-print.json` |
| `/clear` typed in a window | SessionEnd, then SessionStart, in the same process | the end: the open session's; the start: a new one | `clear`, then `clear` | `clear.json` |
| `claude --resume <id>` | SessionStart | the resumed conversation's own | `resume` | `resume.json` |
| `/resume` picked inside a window | SessionEnd, then SessionStart, in the same process | the end: the open session's; the start: the picked conversation's | `resume`, then `resume` | `resume-picked.json` |
| `claude --continue` | SessionStart | the folder's newest conversation's | `resume` | `continue.json` |
| `claude --resume <id> --fork-session` | SessionStart | a new one | `fork` | `fork.json` |
| `/exit` | SessionEnd | the session's | `prompt_input_exit` | `exit.json` |
| Ctrl-C twice, or a `claude -p` that ends | SessionEnd | the session's | `other` | `exit.json` |
| `claude -p` started from another session's shell | SessionStart, SessionEnd | a new one | `startup`, then `other` | `nested.json` |
| `/compact` | PreCompact (`trigger: manual`); the SessionStart after it not measured | the session's | not measured | `compact.json` |
| An automatic compaction | not measured | not measured | not measured | none |
| A helper (a subagent the Agent tool starts) | not measured | not measured | not measured | none |

What follows from it, and what the hooks do about it:

- **A resume keeps its id, a clear and a fork do not.** `attach` finds a resumed run by its `session_id`. A clear is a
  new run. A fork arrives as `fork`, a source the hook does not name, and is read as `startup`: a new run with the
  whole card. That a compaction keeps its id, as this section said before it was measured, is still unmeasured.
- **The variables follow the session.** In every hook `CLAUDE_CODE_SESSION_ID` equals the stdin's `session_id`, after
  a clear and a picked resume too, and `CLAUDE_PID` is the Claude Code process, the same across a clear and a picked
  resume in one window. A `claude` started from another session's shell has its own `CLAUDE_PID` and session id, and
  nothing in its hooks' environment names the session it was started from.
- **`CLAUDE_CODE_CHILD_SESSION` is `1` in every hook**, a window opened by a person included, so on this version it
  cannot tell a subagent from a session of its own. `isChild` in `hooks.ts` reads it, so the start hook takes every
  session for a subagent: it never writes the window's file (`windowPath`), and a run's parent is looked for in every
  session. Not changed here, because the helper's own hook was not measured; it is listed for the run rules' units.

### The config file

```
$XDG_CONFIG_HOME/braindog/hosts.json          Linux, macOS; ~/.config when XDG_CONFIG_HOME is unset
%APPDATA%\braindog\hosts.json                 Windows, unless XDG_CONFIG_HOME is set
mode 0600 · written atomically (write hosts.json.tmp, rename)
```

Shape in §4.1. `BRAINDOG_TOKEN` wins over the file and is never written to it. A token is never an argument,
because argv shows in process lists and in an agent's config.

```
<the folder above hosts.json>/sessions/<12 hex>.json    one per working folder · mode 0600 · written atomically
```

**The session file** says which run a working folder is: `{ host, spoken, client_id, head_at_start, at }`, and
never a token. `hook start` writes it. `mcp` reads it on every request and sends `X-Braindog-Session` and
`X-Braindog-Client` when its `host` is the host being called, and `hook end` reads it to find the run to idle.
The name is the first 12 hex characters of the SHA-256 of the folder's absolute path, lower-cased on Windows,
because Claude Code starts `mcp` in that folder and tells it nothing else. It sits in the user's config folder
rather than in the repository, where `git status` would show it and a commit could carry it, and rather than in
a temp folder, which is emptied and can be shared between users. Two sessions in one folder share one file, and
the later start wins; that is the case the briefing's warning is for.

```
~/.braindog/skills-lock.json    { <absolute path>: { spoken, version, sha256, proposed_sha? } } · mode 0600 · written atomically
~/.braindog/tools-lock.json     { written: { <scope>|<top-level>|<name>: sha256 }, asked: { <same key>: sha256 }, same: { <same key>: the row it was matched to }, missed: { <same key>: sha256 of the rows looked among } } · mode 0600 · written atomically
~/.braindog/tools-said.json     { <host>: { no_grant_said: <ISO date> } } · mode 0600 · written atomically
```

**The said file** remembers that the start hook's `tools scan` has already told a host's sessions that its keys
were kept by name for want of keychain access, so the sentence is not in every briefing. A host's entry is removed at
the first scan that finds an unexpired keychain access for it in `hosts.json`. It holds a host and a date, never a
value. `tools scan` typed by hand does not read it, and says the sentence every time.

**The lock files** say what BrainDog last wrote, so a file or an entry changed since is never overwritten. The
skills lock keys each skill file by its absolute path; `proposed_sha` is the hash of a local edit already proposed,
so one edit is asked about once. The tools lock keeps the hash of each Claude Code entry `tools write` applied, and
the hash of each server's shape `tools scan` proposed, made from names only. Neither holds a value.

### Environment

| Variable | Read by | Means |
|---|---|---|
| `BRAINDOG_HOST` | every remote command | the host when `--host` is absent |
| `BRAINDOG_TOKEN` | every remote command | the bearer, as-is: an agent token on Cloud, the owner bearer of 33 §6 on a self-host |
| `XDG_CONFIG_HOME` | config | the directory above `braindog/hosts.json` and `braindog/sessions/` |
| `BRAINDOG_TIMEOUT_MS` | `mcp`, `hook` | for `mcp`, the budget of one tool call, in milliseconds; 20,000 when unset or not a whole number. For `hook`, the whole hook's budget, which it may shorten below 8,000 and never lengthen |
| `CLAUDE_CONFIG_DIR` | `install`, `skills sync`, `hook`, `mcp`, and any command run inside Claude Code | the Claude Code profile folder when no `--config-dir` is given, and where global skills are written; `~/.claude` when unset. Also the profile's name every call from Claude Code sends as `x-braindog-profile` (`profileNameOf`): `default` when unset or `~/.claude`, `<name>` for `~/.claude-<name>`, a ccenv profile's folder name under `.ccenv/profiles/` or `CCENV_HOME`'s `profiles/`, else the folder's own name without its leading dots. A name outside the repository's grammar is not sent, and the path never is. Another agent sends none. `runner run` names this machine's profiles in each claim by the same name, and starts a job that names one with `CLAUDE_CONFIG_DIR` set to its folder (§5.13) |
| `BRAINDOG_SELFHOST` | `init`, `serve`, `dev` | the path of the self-host entry file (§5.14) |
| `BRAINDOG_DATA`, `PORT` | `init`, `serve`, `dev` | passed through to the spawned self-host, unread by the CLI |

---

## 3 · Files

```
apps/cli/
├── package.json          name braindog-cli · license Apache-2.0 · type module · bin { braindog: dist/braindog.mjs }
│                         files [dist] · engines { node: ">=24.13" } · dependencies {}
├── LICENSE               the Apache-2.0 text — a real file, exact name (31 §4 rules 3–4)
├── README.md
├── scripts/bundle.mjs    the esbuild bundle, its build tuple and its .sha256
├── tsconfig.json         strict · verbatimModuleSyntax · erasableSyntaxOnly · noEmit
├── src/
│   ├── main.ts           ~200 lines  parseArgs, the command table, dispatch, exit codes, --version, the four error classes
│   ├── http.ts           ~220 lines  host resolution, hosts.json (0600, atomic), call() and stream(), the device flow, admin()
│   ├── brain.ts          ~360 lines  the .brainl reader, the canonical projection, hashing, verify, materialise, toBrainl
│   ├── mirror.ts         ~270 lines  the mirror's files from lists and rows, and writing only what changed (§5.9)
│   ├── mirror-read.ts    ~190 lines  export --mirror: boot, schema and list page by page under the machine's sign-in (§5.9)
│   ├── pack.ts           ~180 lines  source resolution (path · url · git · Kennel), lint, plan, install (--with-deps), uninstall, the diff screen
│   ├── runner.ts         enrol, repos, allow, the claim loop, the pin, the claude spawn, distil(); kinds linted by jobBody from @braindog/kernel
│   └── print.ts          ~120 lines  the refusal sentence, conflict and unreachable lines, tables, the verify block; the --json envelope is json.ts's (§4.5)
└── test/
    ├── mock-host.ts      a node:http server answering canned Result envelopes and a .brainl body
    ├── make-brainl.ts    materialises the fixture record (40 §5.3), exportBrainl() to lines, appends a dog_sig row with a test key
    ├── fixtures/         stream-json.ndjson · refusals → sentences; no golden --json: the flag is built and the per-command goldens are not (T4)
    └── *.test.ts         §9
```

Six source files in the first design, counted. The agent path adds `position.ts`, `stdio.ts` and `surface.ts`
for `mcp`; `hooks.ts` (the two hooks and the session file), `brief.ts` (the briefing) and `install.ts` for the
hooks; `keys.ts` for the key doors; `skills.ts` and `tools.ts` for the sync, the scan and the write; and
`hooks/braindog-hook.ps1` and `hooks/braindog-hook.sh`, the shims Claude Code runs. Setup sync adds `sealer.ts`,
`secret-store.ts`, `carry.ts`, `sync-record.ts`, `sync-join.ts`, `sync-push.ts`, `sync-pull.ts` and `sync-patches.ts`
(§5.20). Published artefact: `dist/braindog.mjs`, one file, with `dist/braindog.mjs.sha256`, `dist/braindog.mjs.sig` (made at deploy by
`tools/ship/cli-sign.mjs`) and `dist/braindog.mjs.build` (the one line `braindog update` reads, §5.17) beside it, built by
`scripts/bundle.mjs` (`pnpm --filter braindog-cli build`): esbuild with `src/main.ts --bundle --platform=node
--format=esm --target=node24 --define:__BUILD__="<yyyy.mm.dd>+<sha7>" --outfile=dist/braindog.mjs`, keeping the
entry's own hashbang in place of a banner, the build taken from `BRAINDOG_BUILD` or else the UTC date and
`git rev-parse --short=7 HEAD`. The deploy serves both at `https://brain.dog/cli/`, beside `install.ps1` and
`install.sh`, which check the SHA-256 and, once a release key is pinned (`src/release-key.ts`), the ed25519 signature in `dist/braindog.mjs.sig` before running it, put the file at `~/.braindog/bin/braindog.mjs` and write a `braindog` shim on
the user's PATH. `tsc --noEmit` type-checks; tests run
the `.ts` sources directly under Node 24.13 (`node --test`). esbuild is a devDependency only (§13 D4).

---

## 4 · Data structures

### 4.1 · `hosts.json`

```ts
type HostsFile = {
  default?: string;                                  // a key of `hosts`
  hosts: Record<string, {                            // key: 'https://brain.dog/acme' — origin + '/' + slug, no trailing slash; a leading '/app' is taken off
    token?:  { value: string; expires: string; label: string };   // login: the read+write agent token, 90 days
    runner?: { value: string; expires: string; label: string };   // runner enroll: the 90-day device grant
    Keychain?:  Record<string, { value: string; expires: string }>;  // login --keychain: key = the project's id, or '*'
  }>;
};
```

Keychain access is kept under its scope, so one host can hold grants for several projects; `keys` uses `--keychain`,
or the only one held.

*(Amended September 23rd 2026 for push A of the one-domain move, checked against `hostKey` in
`apps/cli/src/http.ts`.)* The app's connect screen prints `braindog login <origin>/<slug>` when it knows the
record's slug, and `hostKey` keeps that as `<origin>/<slug>`. *(Amended October 29th 2026: the app left `/app` for the
root, so the screen prints `<origin>/<slug>`; it printed `<origin>/app/<slug>` until then.)* An address with `/app` in
front, as people pasted it before, is kept as `<origin>/<slug>` too: `app` is a reserved slug, so a first segment of
`app` is always the prefix. `login`, `logout` and `--host` key through the same function, so a login written with or
without `/app` is one entry, and keys written before either move do not change. The CLI has no default host. On the
Cloud the origin is `https://app.brain.dog` (it was `https://brain.dog` between pushes B and C of the one-domain move); the API calls go to the
origin's root, `/auth/device` and `/api/*`, which the other name keeps serving with no redirect. That matters
because every request here is sent with `redirect: 'error'`, so a redirect on either would fail every command.

Invariants a test checks: the file's mode is `0600` on POSIX; a write is a rename of a complete file; a `value`
appears in no other file, no log line, no `--json` output; an `expires` in the past makes the CLI say
`login expired for <host> — run braindog login <host>` (exit 1) before any request.

### 4.2 · The wire

```ts
// 33 §2, imported from @braindog/ports as types
type Result<T> = { ok: true; value: T; version: number }
               | { ok: false; refusals: Refusal[] }
               | { ok: false; conflict: { version: number; current: unknown; actor: string } };
type Refusal   = { code: RefusalCode; at: string; found?: unknown; wanted?: string; fix: string };

// the device flow — /auth/* routes, 33 §4; the shapes are §13 D1
type DeviceRequest = { slug?: string; reach: Reach; label: string; scope?: string; subject?: string };
type Reach         = 'login' | 'runner' | 'export' | 'import' | 'pack' | 'token' | 'vault';
type DeviceCode    = { device_code: string; user_code: string; verification_uri: string; expires_in: 600; expires: string; interval: 5 };
type DevicePoll    = { pending: true; interval: number } | { pending: false; bearer: string; reach: Reach; scope: string | null; expires: string };

// export — POST /api/export answers 200 text/plain; charset=utf-8: the .brainl of 41 §5.10, streamed (§13 D3)
type ExportArgs  = { sections?: ('data' | 'origin' | 'governance')[]; redact_grants?: boolean };
// import — POST /api/import takes the .brainl as its body; the host hands the lines to importBrainl (41 §5.11)
type ImportReply = { imported: { tables: number; rows: number; event: string } };

// packs — the Diff of 04 §3; the type is 42's, these are the fields the CLI prints
type Diff = { plan_hash: string; pack: { id: string; version: string; author: string; license: string };
              requires: { format: Check; primitives: Check; packs: (Check & { id: string })[] };
              adds: Named[]; changes: Named[]; conflicts: Named[]; seeds: number; spawns: Named[];
              calls_out: Named[]; touches: { rows_read: 0; rows_written: 0 } };
type Named = { id: string; summary: string };  type Check = { wanted: string; have: string; ok: boolean };

// rules
type RuleTest  = { register: string; total: number; matches: { seq: number; title: string; would: string[]; outside?: string }[];
                   suppressed: number; won: number; lost: number; takenBy: Record<string, number> };
type RuleApply = { dry: boolean; rows: number; fields: number; batch?: string };

// tokens
type TokenCreated = { id: string; name: string; scope: Scope; expires: string; token: string };
type TokenRow     = { id: string; name: string; scope: Scope; created_at: string; last_used_at: string | null; last_surface: string | null };

// the runner — 46 §4.7, verbatim
type Claim     = { job: Job; lease_until: string; bearer: string; mcp: { url: string; tools: string[] } };
type Idle      = { job: null; idle_ms: 1500 };
type Job       = { id: string; kind: 'triage' | 'explain' | 'propose' | 'draft'; args: Record<string, string>; seq: number;
                   claude_session: string | null; expires: string; /* …the row of 30 §1 */ };
type JobEventIn = { job_id: string; seq: number; kind: 'start' | 'say' | 'think' | 'tool' | 'out' | 'limit' | 'note' | 'end' | 'error'; body: object | null };
type Ack       = { seq: number; cancel: 0 | 1; lease_until: string };
type EndBody   = { status: 'ok' | 'needs_decision' | 'refused' | 'limit' | 'error' | 'interrupted' | 'cancelled';
                   result?: object; error?: string; claude_session?: string; turns?: number; ms?: number };
```

### 4.3 · The `.brainl`, as the CLI reads and writes it

The grammar is [41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.10's, restated only to the extent the reader and the
writer here need it. Text, UTF-8, LF, no BOM.

```ebnf
dogl      = "#dogl " digits NL { block } ;                 (* the format revision — FORMAT_VERSION, 1 at v1 *)
block     = "#table " table-name " " columns NL { row } ;   (* columns: the DDL order, comma-separated, no spaces *)
row       = json-array NL ;                                 (* the JCS array of the values, in column order — 34 §5 *)
```

| Rule | Value |
|---|---|
| Line kinds | a line beginning `#` is structure; every other line begins `[` and is a row of the current table; nothing else is legal |
| Block order | `dog_meta`, `dog_section`, `dog_manifest`; then `data`, `origin`, `governance` — within a section, the DDL order of 30 §1, which is `sqlite_master` order; `dog_sig` last, one row appended by the host that holds the signing key |
| Row order | by primary key; `entry_fts` by `id`; `dog_sig` by `key_id`; BINARY collation |
| Values | `null` · INTEGER → number · REAL → JCS number · TEXT → string · BLOB → `{"b64":"<RFC 4648 §4, padded>"}`; an INTEGER beyond ±(2⁵³ − 1) is the adapter's `INT_OUT_OF_RANGE` |
| Hash | `dog_manifest.sha256` = SHA-256 hex over the table's row lines joined by LF, no trailing LF; an empty table hashes the empty string |
| Manifest | one row per exported table except `dog_manifest` and `dog_sig` — 23 rows for a full export of a 31-table record; 25 tables travel (03 §3) |
| Signature | Ed25519 over the row lines of `dog_manifest` ordered by `table_name`, LF-joined; keys and `sig` base64url raw bytes; `key_id` = the first 16 hex of SHA-256(public key) |
| Schema | **not in the stream**. A `.brain` gets its tables from `applyMigrations` (41 §5.2), the same DDL the record has; the stream's headers are checked against it (§5.5) |
| `.brain` header | `PRAGMA application_id = 1145193761` · `PRAGMA user_version = <format>` (03 §2) |

A `.brain` and its `.brainl` carry the same rows, manifest and signature; `toBrainl(.brain)` reproduces the stream byte
for byte (§9 T13–T14).

### 4.4 · Exit codes

| Code | Means | Raised when |
|---|---|---|
| 0 | ok | the command's `Result` was `ok`, or the offline check passed |
| 1 | refused | a `refusals` envelope; an offline refusal (`FORMAT_NEWER_THAN_READER`, `CHECKSUM_MISMATCH`, `SIGNATURE_INVALID`, `SCHEMA_NEWER`, `INT_OUT_OF_RANGE`); a CLI-local error (bad arguments, a file that is not a `.brain`, no self-host entry, `claude` too old) |
| 2 | conflict | a `conflict` envelope — HTTP 409 |
| 3 | unreachable | DNS, TCP, TLS, a timeout, any 5xx, a body that is not JSON, an export stream cut before `#table dog_sig` |

Four, counted, from [33-CONTRACTS](33-CONTRACTS.md) §5.

### 4.5 · The `--json` envelope

```ts
type Out<T> = { ok: true;  value: T; version?: number }                  // the host's Result, passed through
            | { ok: false; refusals: Refusal[] }                          // exit 1
            | { ok: false; conflict: { version: number; current: unknown; actor: string } }   // exit 2
            | { ok: false; error: { message: string; cause?: string } };  // exit 1 (local) or 3 (unreachable) — §13 D11

type Verified = { container: 'dog' | 'dogl'; format: number; tables: number; rows: number; manifest: 'ok';
                  signature: { valid: true; key_id: string; pinned: boolean }; produced: { at: string; by: string };
                  partial?: ('data' | 'origin' | 'governance')[] };
```

**Built on 2026-09-20**, in `apps/cli/src/json.ts`. One document on stdout, every other line on stderr, then exit.

**One decision, taken once.** The split between `io.out` and `io.say` was already load bearing everywhere in this
app, so the flag only has to change where `out` goes: it is a wrapper around `AgentIo`, and nothing in a command
body asks whether the flag was given. It is also removed from the arguments in `main.ts` before dispatch, because
every command parses with `parseArgs({ strict: true })` and the alternative was adding a `json` option to
twenty-eight call sites and remembering it in the twenty-ninth.

**`value` is the readable answer until a command has a reply type written down.** That is this section's own first
measurement, not a shrug: §4.2 gives a `value` shape to nine commands and to no other, and there were 53 `io.out`
call sites when the flag landed. Inventing 53 ad-hoc shapes would have published a surface nobody had agreed and
that this document would then have to follow. So the default `value` is `{ lines }`, the exact lines the command
would have printed, and a command whose answer has a real shape hands one over with `io.answer`. What a caller
branches on is the envelope: `ok`, the refusal codes and the exit code, and those are right for every command from
the first day. Where §4.2 does name a reply type, that is what `value` holds; for the offline commands, `verify` →
`Verified`; `pack lint` → `{ pack, version, declarations, checksum }`; `export` → `{ dogl, dog, verified: Verified,
files?: { fetched: number; missing: string[] } }`; `export --mirror` → `{ lists, held, changed, unread }`.

**Seven commands take no envelope, because they have no stdout of their own to put one on.** `mcp` is a transport
and its stdout is the protocol. `keys exec` and its alias `run` hand stdout to a child process. `hook start` and
`hook end` print a briefing to a hook consumer that reads text. `init` and `serve` spawn the self-host and pass its
streams through. `usecase preview` was the seventh and was missed at first: it spawns the self-host with
`stdio: 'inherit'`, so the child owns the process's stdout until Ctrl+C, and `usecase preview <file> --json` left
`BrainDog self-host listening on ...` above the document, which `JSON.parse` throws on. Each of the seven is left
off the flag rather than made to refuse it, so the command's own strict `parseArgs` refuses it in the command's own
words. `keys headers`, `keys helper`, `setup` and `env apply` are left off it for the same reason: the first two
print the one header document or the one key a program reads from stdout, `setup` prints for a person while its first
step may wait for six digits, and `env apply` prints for a person while it asks y/N at the terminal (§5.15, §5.16,
§5.19). The sync verbs but `inventory` are left off it as `env apply` is: each prints for a person as it goes, and
`join`, `pull` and `retire` ask at the terminal (§5.20).

**No token is ever in this document**, on any path. It carries only lines a command already wrote to stdout,
sentences it already wrote to stderr, refusals a host sent, and values a command handed over by name; the bearer is
read in `http.ts` and leaves only as `Authorization`. `test/json.test.ts` asserts the whole document against a fake
bearer for every path that could plausibly carry one.

**`--json` is taken only before a `--`.** `keys exec` and `run` hand everything after the separator to a child
process, and a child is entitled to its own `--json`. Those two take no envelope in any case; the rule is applied
in `takeJson` so no command added later can acquire the bug by joining the list.

Still owed: the per-command golden documents of T4.

---

## 5 · Algorithms

### 5.1 · Dispatch (`main.ts`)

1. `--version` or `-v` first: print `app ${__BUILD__} · format ${FORMAT_VERSION} · kernel ${KERNEL_MIGRATION} · primitives ${PRIMITIVES_VERSION}`; exit 0. Unbundled, `__BUILD__` is `dev+0000000`.
2. Take the leading non-flag words as the command path (`pack install`); look it up; unknown → usage to stderr, exit 1.
3. `parseArgs({ args: rest, options: { ...GLOBAL, ...command.options }, allowPositionals: true, strict: true })`; a parse error → its message and the command's usage line, exit 1.
4. `await command.run(ctx, positionals, values)` → `{ value, human }`; `emit()` prints `human` to stdout; exit 0. Under `--json` the same answer is the `Out` envelope of §4.5.
5. Catch by class: `Refused` → one sentence per refusal (§6), exit 1 · `Conflicted` → the conflict line, exit 2 · `Unreachable` → the unreachable line, exit 3 · anything else → `error: <message>`, exit 1. Under `--json` the same four are the envelope of §4.5.

### 5.2 · The HTTP client and the device flow (`http.ts`)

`call(host, method, args, bearer, { timeoutMs = 30_000 })`:

1. `fetch(`${origin}/api/${method}`, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json', accept: 'application/json', 'user-agent': `braindog-cli/${__BUILD__}` }, body: JSON.stringify(args), signal: AbortSignal.timeout(timeoutMs) })`.
2. Network error or timeout → `Unreachable(host, cause)`.
3. `401` → `Refused([{ code: 'UNAUTHORIZED', at: host, fix: 'Run braindog login <host>.' }])`; the body is not read ([12-SECURITY](12-SECURITY.md) §8: a 401 says only that).
4. `409` → `Conflicted(body.conflict)`. `422`, `403`, `503` → `Refused(body.refusals)`. Any other non-2xx, or a body that is not JSON → `Unreachable`.
5. `200` → return `body.value`, remembering `body.version` for the envelope.

No retries: a failed call is reported once (`ponytail:` §10). `stream(host, method, args, bearer)` is `call()`
returning `res.body` unparsed, `timeoutMs = 600_000`; `send(host, method, body: ReadableStream, bearer)` is the
mirror — `fetch(…, { body, duplex: 'half', headers: { 'content-type': 'text/plain; charset=utf-8' } })` — and
parses the `Result` that comes back.

`device(host, request, onCode)` — RFC 8628 over the `Result` envelope:

1. `POST ${origin}/auth/device` with `{ slug, reach, label: `${os.hostname()} · braindog-cli`, subject }` → `DeviceCode`, or a `429` with `Retry-After` once this address has started ten in 15 minutes. `slug` is the host's path segment, after `hostKey` has taken a leading `/app` off it (§4.1); absent, the self-host's only record.
2. Refuse a `verification_uri` whose origin differs from the host's — a phished approval page is the one thing this flow must never print.
3. `onCode(code)` prints to stderr: `Open ${verification_uri} and enter  ${user_code.slice(0,3)} ${user_code.slice(3)}   (10 minutes)`.
4. Every `interval` seconds until `expires_in` has elapsed: `POST /auth/device/token { slug, device_code }`. `pending` → sleep the reply's `interval` (so a slow-down is obeyed). A bearer → return it. A refusal (`DEVICE_CODE_EXPIRED`, `DEVICE_CODE_TRIES`) → `Refused`. `expires_in` elapsed with no answer → `Refused([DEVICE_CODE_EXPIRED])`.

`admin(host, method, args, reach, subject)` — how a CLI reaches an ADMIN method without an admin token (§13 D1):

1. Call with the stored bearer (`BRAINDOG_TOKEN`, else `hosts[host].token`). A self-host owner bearer succeeds here and nothing else happens.
2. On `Refused` whose only code is `NEEDS_BROWSER_SESSION`: `device(host, { reach, subject })` — the owner approves *this operation* in the browser; the reply is a ten-minute operation grant, held in memory, never written.
3. Retry with the operation grant; keep it for the rest of the process (an `export`'s body, a `--with-deps` install's siblings). A second `NEEDS_BROWSER_SESSION` is a refusal, printed.

### 5.3 · `login <host>`

1. Parse `<host>`: `https:` required except for `localhost` and `127.0.0.1`; `origin[/slug]`; the key is the normalised string.
2. `device(host, { reach: 'login' })`: the exchange returns a `write` token, 90 days (33 §5). The hosts file is read first, so a broken one fails before anybody approves.
3. `saveHost`: read `hosts.json` (or `{ hosts: {} }`), set `hosts[key].token = { value, expires, label }` and `default = key`; write `hosts.json.tmp` with `mode: 0o600`; `renameSync`.
4. Print `logged in to <key> as <label> · token expires <date>`. The token is never printed.
5. Every other ending is one sentence and exit 1: `The code expired before anyone approved it. Run braindog login <key> to start again.`, `The request was denied after five wrong codes were typed. Run braindog login <key> to start again.`, and on Ctrl+C `Sign-in was stopped before it finished, and nothing was saved.` A host that does not answer is exit 3. Built in `apps/cli/src/login.ts`.

### 5.4 · `export`

1. Resolve host and bearer. `args = { sections, redact_grants }`; `-o` defaults to `./<slug>.brain`; the `.brainl` is written beside it with the same base name.
2. `admin(host, 'export', args, 'export', `export ${slug}${sections ? ' ' + sections.join(',') : ''}`)` as a stream; `pipeline(Readable.fromWeb(body), createWriteStream(`${base}.brainl.part`, { mode: 0o600 }))`.
3. The file must end with a `#table dog_sig …` header and one row; otherwise `Unreachable('export stream ended before dog_sig — export again')` — the record cut the stream because it changed mid-export (41 §5.10, `CHECKSUM_MISMATCH` at the host) or the network did. The `.part` is kept.
4. Rename to `${base}.brainl`; `verify()` it (§5.6). A refusal exits 1 and leaves the `.brainl` in place.
5. `materialise(`${base}.brainl`, `${base}.brain`)` (§5.5).
6. `--with-attachments`: `SELECT fields FROM entry WHERE deleted_at IS NULL`; every JSON object shaped `{ sha256: /^[0-9a-f]{64}$/, mime, bytes, name }` is a `file` value ([34-GRAMMARS](34-GRAMMARS.md) §3). `GET ${origin}/a/${sha256}`, four at a time, into `${base}.files/${sha256}` after the bytes hash to their name; a 404 goes to `missing`. The route is unauthenticated — the URL is the capability (12 §8).
7. Print the verify block, then `wrote <base>.brainl · <base>.brain[ · n files (m missing)]`. The mirror is its own command, `export --mirror <folder>` (§5.9), and takes no `.brain`.

On a self-host the same route serves the same stream (33 §6); the CLI cannot tell which it spoke to.

### 5.5 · Materialise `.brainl` → `.brain` (`brain.ts`)

1. `rm -f ${dog}.part`; `sql = open(`${dog}.part`)` — the `node:sqlite` adapter of `@braindog/ports`; `applyMigrations(sql)` from `@braindog/kernel` — the thirty-one tables, the kernel's indexes, `register.session`, the `dog_section` rows (41 §5.2). `sql.exec('PRAGMA application_id = 1145193761')`.
2. Read lines with `readline.createInterface({ input: createReadStream(dogl), crlfDelay: Infinity })` — never `readFileSync`.
3. Line 1 must be `#dogl <n>`; `n > FORMAT_VERSION` → `FORMAT_NEWER_THAN_READER`; `n < FORMAT_VERSION` is accepted (03 §7 rule 3).
4. `#table <name> <cols>` → the table must exist in the file's schema and every named column in `PRAGMA table_info`, else `SCHEMA_NEWER` (the file was written by a newer kernel; `fix: Update braindog-cli.`); a column the DDL has and the header lacks takes its default (03 §7's additive rule). Prepare `INSERT OR REPLACE INTO <name> (<cols>) VALUES (?, …)` — `OR REPLACE` because the migration seeded `dog_meta`, `dog_section`, `counter`, `migration` and `register.session`, and the file's rows win. For `entry_fts`: `INSERT INTO entry_fts (rowid, id, register, text) SELECT rowid, ?, ?, ? FROM entry WHERE id = ?` — the rowid is looked up, because rowids are reassigned and `entry_fts.rowid = entry.rowid` (30 §1); `entry` precedes `entry_fts` in DDL order.
5. A row line → `JSON.parse`; arity must equal the header's; `{ b64 }` → `Buffer.from(b64, 'base64')`; `sql.exec(stmt, ...values)` inside `sql.transactionSync` per 1,000 rows. Twenty-four parameters at most (`event`), under the adapter's hundred.
6. After the last line: `sql.exec('PRAGMA user_version = <n>')`; close; `renameSync` to `${dog}`, mode `0600`.
7. Return `{ tables, rows }`.

Declaration indexes (`entry_i_*`, `entry_u_*`, `entry_k_*`) are not recreated: a `.brain` is a file a person
queries, and a restore is an `import` that rebuilds them (`ponytail:` §10). One pass, O(rows), O(1) memory in rows.

### 5.6 · `verify <file>` (`brain.ts`)

Offline. `--key` is a base64url raw public key, or a URL answering JSON `{ key_id, public_key }` (the well-known
key of 03 §4 — §13 D10); absent, the key inside the file is used and the result says `unpinned`. The embedded
key proves integrity; origin is `--key`'s job (41 §5.11 step 3).

**On a `.brain`:**

1. `sql = open(path)`; nothing is written. `PRAGMA application_id` ≠ 1145193761 → local error `not a .brain file` (exit 1, no code). `PRAGMA user_version` > `FORMAT_VERSION` → `FORMAT_NEWER_THAN_READER`.
2. Read `dog_meta`, `dog_section`, `dog_manifest`, `dog_sig`, and `record.id`. `dog_sig` must hold exactly one row, else `SIGNATURE_INVALID`.
3. For every `dog_manifest` row: `project(sql, table)` (§5.7) into an incremental `createHash('sha256')`, counting rows; a differing hash or count → `CHECKSUM_MISMATCH at <table>`. Every table is checked; every mismatch is reported.
4. Signed bytes = `project(sql, 'dog_manifest')` joined by LF. Key = `--key` or `dog_sig.public_key`; recompute `key_id`; a mismatch with `dog_sig.key_id` → `SIGNATURE_INVALID`. `crypto.subtle.importKey('raw', key, { name: 'Ed25519' }, false, ['verify'])`; `crypto.subtle.verify('Ed25519', k, sig, bytes)` false → `SIGNATURE_INVALID`.
5. Every `dog_section` row with `section ≠ 'local'` and no manifest row marks the file `partial`; the sections present are reported.
6. Print, or throw `Refused` with every refusal collected.

**On a `.brainl`:** one streaming pass. Line 1 is the format; the `dog_manifest` block arrives third, so every later
`#table` block is hashed and counted against a manifest row already in hand; `dog_sig` arrives last; then steps
3–5 run. Memory is O(tables).

```
  ✓ application_id  DOG!            ✓ format 1
  ✓ 25 tables, 3,118 rows           ✓ manifest hashes match
  ✓ signature valid                 produced 2026-08-31T15:04:11Z by rec_01J…
```

The first cell reads `✓ dogl` for the text container; `signature valid (key from the file — pass --key to
pin)` when unpinned; `partial: governance` on a sectioned export. `25 tables` is the manifest's row count plus
the two it cannot hold; `3,118 rows` is the manifest's sum; `produced` is `dog_sig.signed_at` and `record.id`.

### 5.7 · The canonical projection (`project`, `toBrainl`)

1. `cols = PRAGMA table_info(<t>)` ordered by `cid`; `order = cols where pk > 0 ordered by pk`, else `id` for `entry_fts`, `key_id` for `dog_sig` (41 §5.10).
2. `sql.exec(`SELECT <cols> FROM <t> ORDER BY <order>`)` — the adapter refuses an INTEGER beyond 2⁵³ − 1 (`INT_OUT_OF_RANGE`, 30 §13).
3. Per row: a `Uint8Array` → `{ b64: Buffer.from(v).toString('base64') }`; then `JSON.stringify(values)` — for an array of scalars and one-key objects this *is* the RFC 8785 form, so no JCS code exists here.
4. Yield the line. `hashLines` updates SHA-256 with each line and a LF between lines.

`toBrainl(dog)` yields `#dogl <user_version>`, then one block per travelling table in the order of §4.3
(`dog_section` rank, then `sqlite_master.rowid`, which is DDL order), each with its `#table <name> <cols>`
header from `table_info` and its rows from `project`. The record's `exportBrainl` (41 §5.10) emits the same
bytes; T13 is the proof, and the interface-agreement audit reconciles any drift between the two.

### 5.8 · `import <file>`

1. `verify(file, key)` — a refusal stops here. Nothing has left the machine.
2. `lines = file.endsWith('.brain') ? toBrainl(file) : readLines(file)`, as a `ReadableStream`.
3. `admin(host, 'import', lines, 'import', `import ${record_slug} (${rows} rows)`)` through `send()` — one body, `text/plain`. The host reads it whole and calls `importBrainl(lines, ctx)` (41 §5.11): `IMPORT_NOT_EMPTY`, `FORMAT_NEWER_THAN_READER`, `CHECKSUM_MISMATCH`, `SIGNATURE_INVALID`, `SCHEMA_NEWER` come back as refusals, and a refused or cut import writes nothing (41 §5.11 step 6).
4. Print `imported <tables> tables, <rows> rows · event <id>`. The record rebuilds `entry_fts` and writes the one `import` event; the CLI does neither.

### 5.8a · `import --map <map.json> <export.json>`, a map that is data (`adapter.ts`)

Another tool's export comes in through `braindog import`, and an export that is one JSON object needs no code: a map
file says which of its paths become which rows. `mapAdapter` reads the map as the adapter, so the command is
`braindog import --map <map.json> <export.json> [--dry-run] [--strict] [--host <host>]`. A module beside a map
(`braindog import <adapter> <export.json> --map <map.json>`) stays for what a map cannot say.

**The map.** One JSON object:

```json
{
  "source": "Tallybook",
  "key": "tallybook:",
  "taken": "saved",
  "sections": {
    "people": { "register": "people", "name": "People", "key": "id", "label": "name", "kind": "person", "fields": { "name": "name" } },
    "book.accounts": {
      "register": "accounts", "name": "Accounts", "key": "id", "label": "name", "kind": "account",
      "fields": {
        "name": "name",
        "kind": { "from": "type", "as": "one of", "values": { "Cash": "cash", "Bank": "bank" }, "else": "bank" },
        "balance": { "from": "balance", "as": "money", "currency": "cur" },
        "as_of": { "from": "on", "as": "day" }
      }
    },
    "items": {
      "register": "tasks", "name": "Tasks", "key": "id", "label": "what",
      "fields": { "what": "what", "by": { "from": "due", "as": "day" }, "owner": { "from": "who", "as": "link", "to": "people" } }
    }
  }
}
```

- `source` is what the report calls the tool; `key` the prefix of every key the import plans (`import:` when left
  out); `taken` the path of the day the export was taken, when it says.
- Each key of `sections` is a path of one or two names (`items`, `book.accounts`). What sits there is a list of items,
  or an object of items by their key. The lists are written in the order the sections name them, so a section that
  others link to comes first.
- A section names the list it fills (`register`, required) and what the report calls it (`name`); the field each item
  is found again by (`key`, required, or `$key` for the name it sits under); the field the report names an item by
  (`label`, the key when left out); and `kind`, one word in small letters between the prefix and the item's key (the
  path's last name when left out). A second import finds each row again by that key, so nothing arrives twice.
- `fields` maps each field of the list to how a value moves. A string is the export's field, carried as text. An
  object names `from` and `as`, one of five words:
  - `text`: carried as written.
  - `day`: the first ten characters of a date.
  - `money`: an amount and its currency, written in minor units. `currency` is the item's field holding the code, or
    `in` the one currency the whole section is in; `minor: true` when the export already holds minor units. Two
    currencies are never added.
  - `link`: the key of an item in another section (`to`, its path). A key that section does not hold arrives without
    the link, and the report says which.
  - `one of`: the export's word turned into the list's by `values`. A word the table has not got is proposed to the
    list and carried as `else` until it lands.

**What it does.** The plan is the same as an adapter's: `--dry-run` prints it and writes nothing. A row deleted in the
record is never written again, and the report says so. A value that cannot move is left out with its reason, one
line per reason. Every part of the export no section read is named, one line each: "Not read: <section>, 14 items."
With `--strict` an import that leaves any part unread writes nothing, so a map is finished before it is trusted. A map
that is wrong is refused before anything is read, in one sentence naming the field (`sections.items in map.json names
the list it fills ("register").`). A map with no `sections` needs an adapter beside it, and says so.

### 5.9 · `export --mirror <folder>` (`mirror-read.ts`, `mirror.ts`)

The whole record as plain files a person can read and git can diff, so a changed row is one changed file and a
nightly run in a git repository is a history of the record. It is not a `.brain`: no operation grant, no
stream, no signature. It reads what an agent reads.

**How it reads.**

1. Host and bearer as every command finds them (§4.1): the machine's own sign-in. No session headers, so the reads
   name no run. No approval is asked, so a script can run it every night; it holds exactly what that sign-in may read.
2. `boot`: the record's own index of lists, each by id and name. There is no list of lists in the code, so a list
   added to the record is in the next mirror with nothing changed here.
3. For each list, four at a time: `schema { register }` for its name, title field, `seq_prefix` and fields in
   declared order; then `list { register, limit: 50, cursor }` page by page until the cursor is null, 2,000 pages at
   most. Fifty because a read of a hundred has answered `INTERNAL` on the Cloud, as `keys list` reads.
   Each read has its own budget (`BRAINDOG_TIMEOUT_MS`, 20 seconds), so a long record is read to the end.
4. A list whose `schema` or `list` refuses, or whose pages do not end, is not read: it is named in the top README with
   the record's sentence (`- Keys: not read. <fix>`), never left out in silence, and its folder is left as it was.
   A refusal of `boot` itself is the command's refusal: exit 1, or 3 when the host does not answer.

**What it writes** (`mirrorFiles(lists, rowsOf, day)`, a map from path to text):

5. `README.md`: `Written on <day>.`, then one line per list in id order, a link named `<name>` to `<id>/README.md` and then `: <count>`, or
   the not-read line.
6. `<list>/README.md`: the list's name, `<name> holds <count>.`, and its fields in declared order with the kind of
   value each takes in words (`a link to People`, `money`, `a day`).
7. `<list>/<seq>.md`, one per live row by number: `# <title>`, `<list name> <spoken number>`, then each non-document
   field in declared order as `<label>: <value>`, then each `document` field as `## <label>` and its text byte for
   byte. A list whose rows have no number (a series) is one `<list>/series.md`, its points in the order they were made.
8. Values: `money` → `<currency> <amount / 10^d>` grouped in threes, `d` the currency's own decimals (`Intl`), never
   converted and never added to another currency; `day` and `instant` as written; `ref` → the other row's list,
   number and title, `People #1, Mara Lindqvist`; `list` joined by `, `; `bool` → `yes` / `no`; `enum` → its label;
   `file` → `<name> (<bytes> bytes)`; `json` with its keys sorted; a missing value → `not set`. A label missing is
   the field's id said as words.
9. Deleted rows are skipped. A `secret` field says `sealed` and nothing of its grant; a field the declaration does
   not name, or names as retired, is never written. Nothing of a grant, a sealed value or a token is in any file.
10. Order and names are fixed, so two mirrors of an unchanged record are the same bytes.

**How it writes** (`writeMirror(folder, files)`, answering how many files changed):

11. Only a file whose text differs is written. A row file (`<seq>.md`, `series.md`) whose row is gone is removed,
    inside a list read this run. Nothing else in the folder is touched: not `.git`, not a note of the person's own.
    Every path is checked to resolve inside the folder.
12. The top README is not rewritten for its day alone, so a night with nothing new changes no file at all.
13. It prints one line: `Mirrored <n> lists, <m> in all. <k> files changed since the folder was last written.`,
    then `Not read: <names>.` when any list was not read. No path and no host. Under `--json` the value is
    `{ lists, held, changed, unread }`. Exit 0 · 1 · 3.

### 5.10 · `pack lint | plan | install | uninstall` (`pack.ts`)

`loadSource(ref)`, in order of test: an existing path → its `*.pack.yaml`, or a directory read recursively for
`*.yaml|*.yml` with exactly one `*.pack.yaml` (04 §2); `https://` → one fetched file; `git:owner/repo@ref` →
`git clone --depth 1 --branch <ref> https://github.com/owner/repo` into `os.tmpdir()`, then the directory rule;
a bare id matching `^[a-z][a-z0-9-]{1,63}$` → `https://kennel.brain.dog/p/<id>` (04 §3); anything else → local error.

`lint`: `parsePack(files)` then `lintPack(pack)` from `@braindog/declare` (§11); refusals print with
`declarations[i]` rewritten to that declaration's `kind.id`; none → `ok <pack> <version> · <n> declarations ·
<packChecksum(pack).slice(0, 16)>`. Offline: `declare` imports no database (31 §2).

`install <src> [--with-deps] [--yes]`:

1. `loadSource`, `lint` — a lint refusal never reaches the host.
2. `diff = admin(host, 'planPack', { pack }, 'pack', `install ${id} ${version}`)`.
3. `DEPENDENCY_UNRESOLVED` refusals with `--with-deps`: for each `at` of the form `requires.packs.<id>`, run these steps for the Kennel id `<id>` first (depth ≤ 8; a repeated id is a local error naming the cycle), then re-plan the parent under the same operation grant. Without `--with-deps` the refusal prints with its own fix (04 §5).
4. Print `renderDiff(diff)` — the screen of 04 §3: the header line, the two `requires` lines with `ok` or the failing check, then `ADDS · CHANGES (shown, not applied) · CONFLICTS · SEEDS · SPAWNS · CALLS OUT · TOUCHES`, each `Named.summary` as the host rendered it.
5. `Apply? [y/N]`: `--yes` skips it; stdin not a TTY and no `--yes` → local error `pass --yes when stdin is not a terminal`; anything but `y` → `not applied`, exit 0.
6. `admin(host, 'installPack', { pack, plan_hash })`. `PLAN_STALE` → re-plan once, re-print, re-ask (04 §3 property 3); a second `PLAN_STALE` prints.
7. `installed <id> <version> · <n> declarations`.

`plan` is steps 1–4. `uninstall <id> [--yes]` asks once, calls `uninstallPack { id }`, prints
`RETIRES <n> declarations · KEEPS <rows> in <register>… · DELETES nothing` (04 §4).

### 5.11 · `rule test` · `rule apply`

`rule test <id> --against <x>`: `x` a 26-char ULID → `{ raw: x }`; a register id → `{ register: x }`; else
absent. `call(host, 'ruleTest', { id, against })` → 07 §6's block: `matches <n> of <total> rows in
register.<r>`, one line per row (`#<seq> <title> <would…>` or `— <outside>`), `once_per would suppress <k> of
<n>`, then `won <w> · lost <l> · takenBy rule.<id> <n>…`.

`rule apply <id> [--dry]`: `call(host, 'ruleApply', { id, dry })` → `--dry`: `would set <fields> fields on
<rows> rows`; without: `set <fields> fields on <rows> rows · batch <ulid>` — one `event.batch` for the run, so
the undo is one query (07 §6.1); the dry run is the undo by design.

### 5.12 · `token create | list | revoke`

`create --scope read,propose --name <n>`: the scope list collapses to the ladder's top (`write` > `propose` >
`read`, 30 §10); `admin(host, 'createToken', { scope, name }, 'token', `create token ${name} (${scope})`)`;
print `token <id> · <name> · <scope> · expires <date>`, a blank line, the token, then `shown once`. `list` and
`revoke` are `listTokens {}` and `revokeToken { id }` under the same reach.

### 5.13 · `runner enrol` · `runner repos` · `runner run` · `runner allow` (`runner.ts`)

*(Rewritten on 27 September 2026 against `apps/cli/src/runner.ts`, and departing
from the first design on purpose.)* The first design ran every job in an empty `mkdtemp` folder, allowed only
`mcp__braindog__*` tools and checked the kind against four fixed prompts. A job that reads a repository needs the
folder it lives in and `Read`, `Grep` and `Glob`, so what a run may do is now a `job.<id>` declaration: approved once
by the owner in Decide, installed by an ordinary `change`, and pinned once on each machine that runs it. The host
sends a repository's name and never a path.

*(Since kernel migration 44.)* A job may also name the machine it runs on and the Claude Code profile it runs under,
each by name, as runs name them (`createJob { machine, seat }`, "Start one now" in the app). A claim says where the
runner is, and the record hands it only a job placed nowhere or placed here. The profile's folder is this machine's
own business, as a repository's is: the host sends the name, and only this machine turns it into a folder.

`enrol <host>`: Claude Code and Codex are checked first (below), so a machine that could never run a job is not
enrolled to hold one; either is enough. Then the device flow of §5.2 with `reach: 'runner'` and the label `<machine name> · braindog-cli · runner`,
and the bearer is kept as `hosts[key].runner = { value, expires, label }`, beside the login and never in its place
(`keepRunner` in `http.ts`). It prints the six digits and `enrolled on <host> as <label> · runner expires <date>`,
and never the bearer.

`repos add <name> <folder>`: this machine's own map, in `~/.braindog/runner.json` (`{ repos, allowed, waiting }`,
mode 0600, written atomically). A name has the shape the kernel's lint gives a kind's `repo` (letters, digits, `.`,
`_` and `-`); the folder must exist, and is kept as an absolute path. `repos list` prints the map. Nothing is sent.

**Claude Code on the machine.** `claude --version` must parse to at least `2.1.248` (26 §5, `CLAUDE_LEAST`) at
`enrol`, at the start of `run` and after every job; missing, silent about its version, or older is one sentence,
and nothing is claimed. `claude --help` is read at the same moments, for the two flags of the first design that
were never confirmed against an installed Claude Code. On Windows a `claude.cmd`
is found through PATH and PATHEXT and started through `cmd.exe`, as `keys exec` starts one (`planCommand`).

`run [--once] [--host <host>]`, one job at a time:

1. **Host.** `--host`, then `BRAINDOG_HOST`, then the one host this machine is enrolled on, then the default
   (`runnerTarget`). The enrolment is the bearer; the login token and `BRAINDOG_TOKEN` are never read.
2. **Wait.** `claimJob { wait: 20, host, seats }`, aborted 10 s after the wait, because a far end that vanishes
   without closing the socket would otherwise hold the loop for ever. `host` is this machine as its runs name it
   (`os.hostname()`, sent only when it fits `^[A-Za-z0-9._-]{1,128}$`) and `seats` the Claude Code profiles it can
   start a job under, at most 32, by the name `profileNameOf` gives each folder (`claimArgs`, `seatsHere`): the
   folders `~/.braindog/profiles.json` lists, else every profile `doctor` finds (`profilesIn`), and always the
   runner's own, read again before every claim. One folder reached two ways is one profile. A job placed on another
   machine, or under a profile not named, stays for a runner that can run it, and a host older than migration 44
   reads neither and hands over only jobs placed nowhere. A claim the host held is asked again at once. One answered at
   once with `{ job: null, idle_ms }` is asked again after `idle_ms`, doubling to 30 s, for a proxy that cannot hold
   twenty seconds (46 §5). A host that does not answer is one line, then a claim every 30 s. Any other refusal ends
   the command with its sentence.
3. **Check.** The claim, `{ job: { id, kind, title, prompt, tools, turns, permission, repo, args, seat, seq },
   lease_until, bearer, mcp: { url } }`, is read field by field (a `seat` in another shape than a profile's name is
   refused, never dropped, since dropping it would run the job under this runner's own login), and the kernel's own lint (`jobBody`) runs again over what it
   carries, so a tool, a permission mode or a prompt the record would refuse at install is refused here too. Each
   argument is at most 64 characters and one line. `mcp.url` is resolved against the enrolled host and must stay on
   its origin, so the job's bearer goes nowhere else. A kind that names a repository needs that name in `repos`, and
   its folder must still be there. When the installed help lists the permission modes, the kind's must be among them.
   A job that names a profile needs exactly one folder here that answers to it (`seatEnv`): none, or two (such as
   `~/.claude-studio` and ccenv's `studio` as separate folders), is refused by the profile's name, never a folder, with
   the way to list the one meant in `~/.braindog/profiles.json`, because the wrong folder is another login. These run
   before the pin, so nobody is asked about a job that could not have run. Any failure posts `error { text }` and
   `end { status: 'refused', error }`, and Claude Code never starts.
4. **Pin.** The first time this machine sees a kind, by the SHA-256 of `{ kind, title, prompt, tools, turns,
   permission, repo }` with the prompt's `%arg%` slots unfilled, it prints the kind whole to stderr (where it works,
   what it may use, how it asks, its turns and its prompt) and asks `Allow <kind> to run on this machine? [y/N]`. Yes
   adds the hash to `allowed`; anything else refuses the job. With no terminal attached, the kind is kept under
   `waiting` and the job is refused with a sentence naming `braindog runner allow <kind>`, which asks the same
   question later at a terminal. A host that forges a kind cannot run it on a machine that never allowed it (owner
   item 13). The lease is renewed while the person reads, and a Cancel in the app ends the question.
5. **Prepare.** The working folder is the repository's mapped folder, or an empty `mkdtemp('braindog-job-')` of its
   own when the kind names none. `mcp.json`, at mode 0600 in a `mkdtemp('braindog-mcp-')` of its own, is
   `{ mcpServers: { braindog: { type: 'http', url, headers: { Authorization: 'Bearer <the job bearer>', … } } } }`,
   the headers also carrying `x-braindog-host` and `x-braindog-profile` (the job's profile, or this runner's own), each
   only when it fits its grammar, so the job's run says where it ran as a session's does.
6. **Spawn.** `claude -p [--restricted] [--disable-slash-commands] --output-format stream-json --verbose
   --strict-mcp-config --mcp-config <mcp.json> --allowedTools <each of the kind's tools> --permission-mode <the
   kind's> --max-turns <the kind's turns>`, in that folder, with no shell and without `BRAINDOG_TOKEN` in its
   environment. A job under a profile runs with `CLAUDE_CONFIG_DIR` naming that profile's folder (`envFor`), left
   unset for `~/.claude`, because Claude Code keeps the default profile's servers in `~/.claude.json` only when the
   variable is unset; a job under none runs in this runner's own environment. The two bracketed flags are passed only where `claude --help` lists them. `--verbose` is there
   because `stream-json` under `-p` is refused without it. Each tool is its own argument, so a named command holding
   a comma or a space is never split. The prompt, filled once by `fillPrompt` and never re-scanned, goes on standard
   input, so it is in no process list and needs no escaping for `cmd.exe`. `--json-schema` went with the fixed kinds,
   which were the only thing that had a schema, and `--resume` because a claim names no session. Never `--bare`;
   never `--dangerously-skip-permissions`.
7. **Distil.** Each stdout line becomes the lines of the table below, numbered from the claim's `seq` plus one and
   posted one at a time, in order, through `postJobEvent`. A post the host does not answer is sent again, a few times
   (`POST_TRIES`), and the record answers a repeat of its last line as it did the first time. A line the record
   refuses as too long is dropped and counted; once it refuses a job's next line as one too many, the rest are
   dropped and counted, and the end still goes.
8. **Renew and cancel.** A job that has posted nothing for 14 s asks `readCancel`, checked every 5 s, which renews
   the 60-second lease; every post's answer renews it too. Either answer's `cancel: true` stops Claude Code (on
   Windows with `taskkill /T`, because `claude.cmd` runs under `cmd.exe`) and ends the job `cancelled`, so a Cancel
   pressed in the app is seen within twenty seconds. Any refusal of a post or a renewal other than "did not answer"
   means the record no longer holds the job for this machine: Claude Code is stopped and nothing more is posted.
9. **Finish.** `end` carries `{ status, result?: { text?, filed?, dropped? }, error?, claude_session?, turns?, ms? }`.
   `ok` on a `success` result. `needs_decision` when the run filed a proposal through `mcp__braindog__propose`, with
   `filed: [{ id, decide? }]` read from that tool's answer, because the laptop never decides (26 §5). `limit`, after a
   `limit { turns }` line, on `error_max_turns`. `error`, after an `error { subtype, text }` line, on another
   `error_*`, or when Claude Code ended with no result at all. `interrupted` on exit 143 or 130 or on Ctrl+C here.
   `cancelled` on the owner's Cancel. No cost is sent: the figure in the stream is Claude Code's estimate in dollars,
   and on the owner's own subscription it is effort, never money the owner chose to count. `mcp.json`, and the empty folder
   when there was one, are removed in `finally`.
10. `--once` returns after one job; otherwise back to step 2.

| stream-json line | event | body |
|---|---|---|
| `type: system, subtype: init` | `start` | `{ model, tools: n, mcp? }`, `mcp` being the braindog server's status |
| `type: assistant`, a `text` part | `say` | `{ text: head(2000), len }` |
| `type: assistant`, a `thinking` part | `think` | `{ text: head(500), len }` |
| `type: assistant`, a `tool_use` part | `tool` | `{ call, name, input: head(2000), len }`, `call` counted from 1 |
| `type: user`, a `tool_result` part | `out` | `{ call, text: head(2000), len, error? }`, `call` being its `tool` line's, so the transcript folds the two onto one row. Claude Code's own ids are not sent, because the record replaces anything that looks like a key |
| `type: result, subtype: error_max_turns` | `limit` | `{ turns }` |
| `type: result`, another `error_*` | `error` | `{ subtype, text }` |
| `type: result, subtype: success` | `end` | step 9 |
| a line type this table does not name | `note` | `{ text }`, once per type (`UNREAD_MOST` types at most) |
| the runner's own refusal (steps 3 and 4) | `error` | `{ text }`, then `end { status: 'refused', error }` |

The kinds are the `job_event.kind` CHECK (`JOB_EVENT_KINDS`). The raw stream is never relayed (26 §5).

**A Codex job.** A kind may say `agent: codex` (`JOB_AGENTS` in the kernel); a kind that says none is Claude Code's,
and the claim carries `agent` either way. `enrol` and `run` need Claude Code or Codex, not both: `codex --version` must
parse to at least `0.46.0` (`CODEX_LEAST`, not confirmed against an installed Codex), and a job for an agent the
machine lacks is refused in step 3 with the sentence saying which. The pin's hash includes `agent` only when it is
`codex`, so a Claude Code kind allowed before keeps its pin. Codex cannot hold a run to named commands, so the kernel
refuses a Codex kind that names any (`Bash(...)`), and the card says what its sandbox allows instead.

Steps 5 and 6 for Codex: no `mcp.json`. The job's bearer is put in the child's environment as `BRAINDOG_JOB_BEARER`,
and Codex is started as `codex exec --json --skip-git-repo-check --sandbox <read-only for dontAsk, workspace-write for
acceptEdits> -c approval_policy="never" -c mcp_servers={braindog = {url, bearer_token_env_var = "BRAINDOG_JOB_BEARER",
http_headers = {"x-braindog-agent" = "codex"}, enabled_tools = [the kind's record tools]}} -`, the prompt on standard
input. `mcp_servers` set whole replaces his own servers for the run, as `--strict-mcp-config` does. Codex has no
`--max-turns`, so the runner counts its calls and stops it past the kind's turns, which ends as `limit`.

| `codex exec --json` line | event | body |
|---|---|---|
| `thread.started` | `start` | `{ model: null, tools: 0 }`; its `thread_id` is the end's `claude_session` |
| `item.completed`, `agent_message` | `say` | `{ text: head(2000), len }`; the last one is the result's text |
| `item.completed`, `reasoning` | `think` | `{ text: head(500), len }` |
| `item.started` or `item.completed`, `command_execution`, `mcp_tool_call`, `file_change`, `web_search` | `tool` | once per item: `{ call, name, input, len }`, named `Bash`, `mcp__<server>__<tool>`, `Edit` or `WebSearch` |
| `item.completed` of a call | `out` | `{ call, text, len, error? }`; a `propose` answer's id is kept as for Claude Code |
| `turn.completed` | `end` | step 9, `ok` or `needs_decision` |
| `turn.failed` | `error` | `{ subtype: 'error', text }`, then `end { status: 'error' }` |
| `error`, or an `error` item | `note` | `{ text }` |
| a type this table does not name | `note` | once per type |

The stream is read as Codex's documents describe it: no Codex was on the machine this was written on.

### 5.14 · `init <slug>` · `dev` (spawn the self-host)

1. `entry = process.env.BRAINDOG_SELFHOST ?? resolve(import.meta.dirname, '../../selfhost/src/main.ts')` when that file exists (a repository checkout); otherwise a local error: `braindog init needs the self-host — set BRAINDOG_SELFHOST to its entry file`.
2. `spawn(process.execPath, [entry, 'init', slug], { stdio: 'inherit', env: process.env })` — or `[entry, 'dev', '--port', port]`.
3. Forward `SIGINT` and `SIGTERM` to the child; exit with its code.

The self-host's `init <slug>` creates `<data>/<slug>/record.brain`, runs migration 0001 and writes the owner
into the Directory; its `dev` runs the process against a scratch data dir with the memory ports (33 §5). Both
are [49-SPEC-SELFHOST](49-SPEC-SELFHOST.md)'s to implement (§13 D5).

### 5.15 · `setup <host>` (`setup.ts`)

The one line a new machine needs. Each step is a command of its own, and `setup` only
runs them in order, stopping at the first that fails with that step's sentence:

1. **Sign in.** A live login is the one `target` would send for the host: the hosts file's, unexpired, or
   `BRAINDOG_TOKEN`. Held, none is asked for; and when the hosts file keeps it while its `default` names another host
   or none, `default` becomes this host, because the MCP entry and the hooks name no host of their own. Not held,
   `login <host>` runs as §5.3 says, with its six digits on stderr.
2. **Hooks.** `install` is planned dry over the user profile (`CLAUDE_CONFIG_DIR`, else `~/.claude`). When it would
   add a hook, `install --apply` writes both, keeping the copy `settings.json.bak` first, and places the Agent Skill,
   `skills/braindog/SKILL.md`, as it always does. Today the step asks only whether a hook is missing, so a
   profile that has both hooks and no skill is left without one until `braindog install --apply` is run by hand. A
   settings file `install` cannot read stops the run with its sentence, and nothing is written.
3. **MCP server.** The profile's servers file (`~/.claude.json` for the default profile, `<profile>/.claude.json` for
   a named one) is read for `mcpServers.braindog`. An entry with this command's `type`, `command` and `args` is left.
   Another entry by that name is removed first with `claude mcp remove braindog --scope user`. Then
   `claude mcp add-json braindog '{"type":"stdio","command":"node","args":["<this command's file>","mcp","--agent","claude"]}' --scope user`,
   run with no shell. `claude` missing, or a non-zero exit, stops the run.
4. **Tools.** `tools write --scope user` (§2 and §5.16), over the tools the record applies everywhere.
5. **Skills.** `skills sync`, into the profile's `skills/` and `commands/` alone.

Steps 4 and 5 run as if outside any repository, so nothing at project scope is read or written: a project's
`.mcp.json` is still written only by `tools write --scope project`, typed by hand. Each step prints one line saying
what it did or found, then its command's own lines indented under it. The last line says the run changed nothing
only when no step did: no login asked for, no default moved, no hook added, no entry registered, and no line from
steps 4 and 5. `--dry-run` asks for no login, writes no file, runs no `claude`, and reads the record only with a login
already held; without one it says steps 4 and 5 were not read.

### 5.16 · `keys headers`, `keys helper` and a tool's `headersHelper` (`keys.ts`, `tools.ts`)

The one function that prints a key, behind two commands. Claude Code runs an HTTP MCP server's
`headersHelper` when it connects and reads the server's headers, as a JSON object, from that command's standard
output and nowhere else, so a key an HTTP tool needs in a header reaches it no other way. `tools write` renders an
HTTP tool whose `needs` hold `header:<Header>=credentials#N` as

```
{ "type": "http", "url": "<endpoint>", "headersHelper": "node \"<this command's file>\" keys headers credentials#N --as <Header>" }
```

so the entry holds the command and never the key. An entry has one helper, so a second header key is left out and
said. The header name and the spoken id are checked before they are written into a command a shell reads, and a path
to this command holding anything but letters, digits, spaces and `_ . : / ( ) -` leaves the header out rather than
write it. `keys headers <credentials#n | label> --as <Header>`:

1. Standard output that is a terminal is refused, before anything is read or sent: a person is reading it, not a
   program.
2. `--as` is required, and matches `^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$`, or it is one sentence.
3. The keychain access `exec` would use, and never the login: a login may add a key and never read one.
4. `POST /api/vault/open { credential }` or `{ label }`, as `exec`, which the host logs as a `grant.read`.
5. `headersOne`: a key holding a character outside printable ASCII is refused; otherwise `{"<Header>":"<value>"}`,
   with `"` and `\` escaped, is written to standard output synchronously and the exit is 0. `secret-grep` exempts
   this one function from its standard-output sink and nothing else in the file, and the seeded negative
   `secret-grep-headers` holds it to that.

If owner item 3 takes the command back, `tools write` leaves the header out again and says so.

`keys helper <credentials#n | label>` is the same door for Claude Code's `apiKeyHelper`, which a profile that runs on
an API key reads its key from: a command's standard output, trimmed, sent in a header. It takes `--keychain` and `--host`
and no `--as`, runs steps 1, 3 and 4 above, and `headersOne` prints the key alone and a line break. A key outside
printable ASCII is refused there too, since Claude Code refuses one. Nothing here writes an `apiKeyHelper` into a
profile yet; when `env apply` does, it is a program entry (§5.19).

### 5.17 · `braindog update [--check]` (`update.ts`)

The command keeps itself current, and only when it is typed: the start hook says it is behind and never runs this.

1. From a checkout (build `dev+0000000`) it refuses in one sentence: a checkout is updated with git.
2. Reads `<base>/braindog.mjs.build` (base `https://brain.dog/cli`), one line holding the build that is out. `--check`
   says whether this command is that build, or behind it, and stops. The same build already installed is said, and
   nothing is downloaded.
3. Downloads `<base>/braindog.mjs` to `braindog.new.mjs` beside the installed file, and refuses unless its SHA-256 is
   the one in `<base>/braindog.mjs.sha256` and its own `--version`, asked under this Node, is the build read in 2. Every
   read follows its moves by hand, five at most, and a move to anything but https ends it before that address is asked.
4. Copies the installed file to `braindog.mjs.prev` and renames the download over it, one atomic rename, so the
   installed name always holds a whole command. Any failure deletes the download and leaves the installed file.
5. Runs `install --apply` to place the Agent Skill and hooks again, and says the old and new builds.

---

### 5.18 · `braindog doctor` (`doctor.ts`)

`braindog doctor [--replaced <replace.json>] [--under <folder>] [--config-dir <folder>] [--json]` says, for every
agent app and profile on this machine, whether BrainDog is set up there, what still names a replaced tool, what holds
something shaped like a key, and which BrainDog servers still run an older build. **It changes nothing**: no file is
written, no request is made, nothing is taken out and no process is signalled.

- `--replaced <replace.json>` is the file `install --replace` reads (its shape below). With it, every server, hook,
  skill, schedule and startup entry that still names the replaced tool is listed. Without it that heading is not printed.
- `--under <folder>`, repeatable, adds a folder whose project `.mcp.json` files are read beside the profiles.
- `--config-dir <folder>`, repeatable, names a profile to read beside the ones found in the home folder.
- `--json` prints the report (`replaced`, `profiles`, `apps`, `places`) as one document in place of the lines.

What it reads:

1. **Claude Code's profiles**: `.claude` and each `.claude-<name>` in the home that holds a `settings.json`, and
   `CLAUDE_CONFIG_DIR`. For each, the servers file (`~/.claude.json` and the profile's own), its hooks and its skills.
2. **Every other app in the clients table** (`clients/index.ts`: Codex, Cursor, Claude Desktop, VS Code) that its
   `found(home, env)` says is here, through its own `servers(home, null)`: BrainDog's server there, a server of the
   replaced tool's, and an entry holding something shaped like a key. Claude Code is left to its profiles, which read
   the same file, so nothing is listed twice.
3. With `--replaced`: the crontab, the launch agents and systemd user units, and the shell start-up files.
4. **Every process of the machine** (`ps -A` with its start time; none on Windows yet): a BrainDog server, one whose
   command runs the installed file with `mcp`, started before that file last changed. The installed file is the one
   `install` registers (never the name the command was typed by, which may be a link); for a checkout's `main.ts`
   its time is the newest `.ts` source in its folder and in the checkout's `packages`, tests left out, since a pull
   can leave `main.ts` itself untouched. The app it serves is its `--agent`, else the first app among its parents.

What it prints: one line saying how many profiles and other apps it read; one line per profile, by its name (`Claude
Code, the default profile`, `Claude Code, profile <name>`), saying whether BrainDog's server is registered and runs
this command and whether both hooks are there; one line per other app, by its name, saying the same of its server and
whether a server of the replaced tool's is still there. Then three headings, each only when it holds something:

1. `Still naming <tool>:` for what the replaced tool left behind.
2. `Shaped like a key, and the value is never shown here:` for an entry holding something shaped like a key.
3. `Not as braindog install leaves a profile:` for a profile missing the server or a hook.

Under a heading each place is its file (under the home as `~/...`, so it is a file a person can open, or `crontab`),
the entry's name and one sentence of fixed words. Then one line per app with an old server:
`Started before this command was updated: restart <app>.`, with `(<n> servers)` when there are several. Nothing read
from a command, an argument, a header, a process or a line is copied into a sentence, so no value can reach the
output. The last line is `<n> places to fix.` or `Nothing to fix.`. The exit code is 1 when anything is listed and 0
when nothing is, so a script can tell without reading the lines. Any other argument, or a
replace file that does not read, is one sentence before anything on the machine is read.

**The replace file** (`apps/cli/replace.example.json` is one, for an invented tool). A person leaving a tool writes
their own and keeps it beside their own notes, not in the repository. One JSON object:

| Key | Holds | Matched against |
|---|---|---|
| `name` | the tool's name, required | what the lines call it, as `<name>'s` |
| `hooks` | patterns, read without case | a hook's command |
| `programs` | patterns, read without case | a server's command and arguments |
| `hosts` | host names | a server's own URL, or a proxy's arguments; a schedule or start-up line as text |
| `skills` | texts, read without case | the `description:` line of a skill's front matter, and nothing else of it |
| `mcpJson` | where a project `.mcp.json` with the tool's server was seen | nothing: `install` names them in its hand-run line |

At least one of `hooks`, `programs`, `hosts` and `skills` holds something, or the file is refused. A skill is set aside
by `install --replace`, and listed by `doctor`, only when its description line holds one of `skills`: a folder of notes
that mentions the old host in its body is nobody's skill, and one with no front matter says nothing about whose it is.

### 5.19 · `env apply`, `env pins` and `env check` (`env-apply.ts`, `pins.ts`, `env-check.ts`)

One machine runs several Claude Code profiles: the default `~/.claude`, each `~/.claude-<name>`, and ccenv's under
`CCENV_HOME`. These three put the record's own set-up in each, say what was approved to run there, and ask each what
its servers say. The profiles are the ones `doctor` finds, named as `env diff` names them: `default`, `<name>` for
`.claude-<name>`, and a ccenv profile by its own name, which is what `--profile` takes.

**`env apply [--profile <name>...] [--dry-run] [--yes-data] [--host <host>]`** runs `setup`'s steps 2 to 5 (§5.15) in
each profile, with setup's own code:

1. **Hooks.** `install --apply` over that profile alone, its plan printed first.
2. **MCP server.** `registerServer`: `claude mcp add-json braindog <json> --scope user` with that profile's
   `CLAUDE_CONFIG_DIR`, and with none for the default one, a copy of its servers file kept first.
3. **Tools.** `tools write --scope user` into that profile's own servers file (`~/.claude.json` for the default one,
   `<profile>/.claude.json` for any other), each entry's lock key naming the profile, so what was written in one is
   never read as what was written in another.
4. **Skills.** `skills sync` into that profile's folder. A folder two profiles reach through a link, as ccenv makes
   them, is synced once, with the skills given to either.
5. **Rules**, with the Profiles add-on: the profile's `rules` in a block of its `CLAUDE.md` between two lines of their
   own, `<!-- braindog: this profile's rules from Profiles. Change them there; braindog env apply writes this block. -->`
   and `<!-- braindog: end of the rules from Profiles. -->`. The block is replaced where it stands, added at the end
   after a blank line, or taken out with that line when the rules are empty; every other byte, line endings included,
   is the person's, and a copy of the file is kept before its first change. A start with no end, or rules holding a
   marker line, change nothing and are said.

**The status line.** `braindog statusline` is what Claude Code runs to draw its status line: the model, the folder's name, how much of the 5 hour and 7 day limits is used and when they reset, each only if the event had it. Its beat to the Profiles add-on (`five_hour_pct`, `seven_day_pct`, `resets_at`, `beat_at` on the profile's row) carries a profile name, the machine and those figures, never a path, a word or a session, and the page only shows them: nothing rotates or switches a profile. `setup --statusline` and `env apply --statusline` set `statusLine: { "type": "command", "command": "node \"<hooks folder>/braindog-statusline.mjs\"" }` (the small entry the bundle writes beside the hook scripts, `statusline-entry.ts`, which loads `statusline.ts` alone; a checkout runs `src/statusline-entry.ts`) only in a profile with no `statusLine` of its own, after a copy of its settings, asked y/N like any program and pinned as kind `statusline`. A profile that keeps a status line of its own sends the same beat by piping its status JSON to `braindog statusline --beat-only` (or the small entry with `--beat-only`), which prints nothing.

**Which profile gets what.** The add-on is a list whose declaration plays the role `profiles`, found through `schemas`.
A record with none says `Install the Profiles add-on to choose per profile; applying what applies everywhere.` once,
and every profile gets what applies everywhere. With one, a row is a Claude Code profile when its `app` is empty or
names Claude, matched to a profile by name without case. A tool or skill whose `profiles` field names profiles, by name
or by a ref to a row, goes to those alone, and one whose field is empty to every profile.

**A program is approved on this machine before it is placed**, as a runner's job kind is (§5.13, step 4). A program
entry is BrainDog's hooks, its MCP server, or a tool whose entry has a `command` or a `headersHelper`. Each is printed
whole in its step's plan, asked `Allow <it> to run from Claude Code on this machine? [y/N]` once a run however many
profiles it goes into, and a yes is pinned in `~/.braindog/pins.json` by the SHA-256 of its kind, its name and the entry
whole. The same entry is not asked about again, and a changed one is, its new pin replacing the old. A no, or no one at
a terminal, leaves the entry out, and the last lines name each with the profiles it was left out of. Plain data (an
HTTP server with no helper, a skill, the rules block) is written with its line and no question. A skill whose text runs
something (`` !`command` ``, a fenced `!` block, `hooks` or `allowed-tools` in its front matter) is a program: it waits for
a yes at `braindog skills sync`, shown whole and pinned by its hash, and `--yes` is not that yes.

**Planned, then asked, then written, a step at a time**, so no request to the record waits on a person. At a terminal
the data is written as the run goes. With no terminal, `--yes-data` writes the plain data and the programs already
pinned, and asks nothing; without it the run is its plan, and exits 1 when anything waits. `--dry-run` writes no file,
runs no `claude`, asks nothing and pins nothing.

**No key is written.** A tool's key is named by the command that opens it, `keys exec` or `keys headers` (§5.16), and
never held. A tool entry, or a profile's rules, that look like a key are left out and said, and such an entry is not
printed. The record is read under the login with no session headers, as `env diff` reads it. Signed out, unreachable or
refused, the hooks and the server are still placed and the rest waits, with exit 1. A status line and an
`apiKeyHelper` are not placed yet; when they are, each is a program entry.

**`env pins [--forget <name>] [--json]`** lists what is pinned, oldest first: each entry's name, its kind, the profiles
it was placed in, the first twelve of its hash and the day it was approved. `--forget` drops every pin of a name, so it
is asked about the next time it is placed, and exits 1 when none had that name. The file holds those five things and
never an entry.

**`env check [--profile <name>...] [--json]`** runs `claude mcp list` in each profile, with that profile's
`CLAUDE_CONFIG_DIR` and with none for the default one, in the home folder so no repository's `.mcp.json` is read beside
the profile's own, three at once and thirty seconds each. Claude Code connects to every server to check it, so `claude`
is a program entry: the file found on the path, with `mcp list`, is shown whole and asked y/N the first time and pinned;
with no terminal and no pin it does not run, and not on the path it is one sentence. Each server is said by its name and
its mark alone (connected, needs a sign-in, failed, waits for approval in a session, turned off), never by the words
Claude Code prints after the mark, which may quote an error. It changes nothing but the pin a yes keeps, and exits 1
when a server needs a sign-in or failed, or a profile's list was not read.

### 5.20 · Setup sync: `sync join`, `push`, `pull`, `patches`, `drill` and `retire` (`sync-*.ts`, `carry.ts`, `sealer.ts`, `secret-store.ts`)

Each machine seals what it carries before it leaves the machine, and keeps it in the record, where the host holds bytes
it cannot open. A new machine, or a wiped one, joins with the sync passphrase and places what another machine sent. The
verbs work only with the Setup sync add-on installed (`packs/setup-sync`), and say `Install the Setup sync add-on
first` otherwise.

**The lists, found as `env apply` finds Profiles.** Carry is the list that plays `role: carry`; the add-on that holds it
names its other lists in `packs`, and of those Bundles is the one with live `host` and `sealed` fields and Drills the
one with `host` and `grade` (`findLists`). All three are personal, so only the owner's own session or his own plain
or device key reaches them. Every verb therefore calls the record as this machine's own login, never the token `setup`
made for an agent app (`BRAINDOG_AGENT` and `CLAUDECODE` are dropped before the host is read), and with no session
headers, so a sync names no run and opens none. Each thing in Carry has a name, a kind (files, `.env` files git ignores,
unpushed work, tool sign-ins, auto memory), a place on a Mac, on Windows and on Linux, names to leave out, whether it runs
a program, whose account it is when it is somebody else's (a ref to People), the machines where it waits for a yes, and
whether it is on. The fields these verbs read and write by name are short ids, `mac`, `win`, `linux`, `whose`, `waits`,
`host`, `ref`, `heard`, `kept`, `grade` and `fails` among them, and `host` names a machine as the Profiles add-on names
one, so no word the code uses for itself is also an id of this add-on's (`core-names`).

**The sealed files are four record methods** (the contract with the host): `sealedPut { key, part, parts, bytes, sha256,
size }`, `sealedGet { key, part }`, `sealedList { prefix? }` and `sealedDelete { key }`, each reached only by the owner's
own session or key, never by MCP, a page, a share or a child token. `sealedGet` and `sealedList` are reads and the other
two writes. A file goes in parts of at most 4 MiB, at most eight and 25 MiB in all, part 0 first, each part naming the
SHA-256 of the whole sealed file; the last part's answer says `complete` once the host has hashed every part, a
`CHECKSUM_MISMATCH` is put again from part 0 once, and a file read back is held to the same hash. `NOT_FOUND` is a file
not there. A host without the methods answers `ROUTE_UNKNOWN`, and every verb says `<host> does not keep sealed files
yet. Update it, then try again.`; a self-host with nowhere to keep them (`NOT_IN_THIS_BUILD`) and a day's upload allowance
used up (`RATE_LIMITED`, shared with attachments) are said in the record's words, and a sign-in that is not this
machine's own (`FORBIDDEN`, `LEVEL_REQUIRED`) is told to log in on this machine. The keys: `sync/key`, the sync key's copy; `carry/<n>/<version>`, what thing `n` held; `bundle/<machine>.<yyyymmddhhmmss>.<random>/manifest`, each bundle's list of what it holds, so bundles are found by machine
and time from the list of keys alone; `machine/<machine>/retired`, a retired machine's note.

**Sealing** (`sealer.ts`). One sync key, 32 random bytes, made on the first machine that joins. Each file is AES-256-GCM
under it with a fresh 12-byte IV and its own key as additional data, written `BDS1 | iv | ciphertext and tag`, so a file
moved to another key, another thing or another version does not open. The key's copy in the record is
`{ v: 1, kdf: "pbkdf2-sha256", rounds: 600000, salt, iv, ct }`, sealed under the key PBKDF2-SHA-256 derives from the sync
passphrase in NFC, with `braindog-sync-key:<record>` as additional data; a copy asking for fewer than 100,000 or more
than 10,000,000 rounds is no copy. Symmetric on purpose: with a public half, a compromised host could seal a file for
his machines to place. A thing's version is 24 hex characters of an HMAC-SHA-256 of its archive under a key derived from
the sync key, so the same bytes are the same version on every machine, nothing is sent twice, and the host cannot guess
what a version holds. The manifest and the retired notes are sealed too, so a host cannot change what a machine is told
to place, nor retire a machine.

**The secret store** (`secret-store.ts`) keeps the key on each machine as 64 hex characters, never on a command line: a
Mac's Keychain (service `braindog-sync-key`, account the record's address), typed into `security -i` on standard input
and read back to be sure, since `add-generic-password` takes a value only as an argument; Windows' Credential Manager
(target `braindog-sync-key:<record>`), through a small PowerShell helper over `CredReadW`, `CredWriteW` and
`CredDeleteW` handed as `-EncodedCommand`, the value on standard input, UTF-8 with no byte-order mark both ways; Linux's
secret service through `secret-tool`, attributes `service` and `slug`, the value on standard input. A line of
`security -i` holds 4,096 bytes, so a Keychain item of tool sign-ins over about 1,900 bytes goes as `-X <hex>` on
`security`'s own command line for the moment it runs, as ccenv writes the same item; the sync key never does. An item
naming Claude Code's keychain item or the claude.ai login is refused before any program runs, and a store's own output is
never relayed.

1. **`sync join [--name <machine>] [--new-key]`.** Names the machine (`--name`, else the name typed at the prompt, else
   the name `deviceName` gives), one line of at most 64 characters. On a record with no `sync/key` it makes the key, asks
   for a new sync passphrase twice, hidden, at least twelve characters, asks the record again just before putting the
   copy so one made meanwhile is not overwritten, and reads the copy back. A record holding sealed files with no copy is
   given a new key only with `--new-key`, since a new key opens none of them; a machine that holds the key puts the copy
   back by running `join` again, choosing a passphrase. Otherwise it asks for the passphrase, up to three times, and
   opens the copy. A retired name is never joined again, and a name another machine sends bundles under is taken only on
   a yes. The key goes into this machine's store, and `~/.braindog/sync.json` (0600) keeps, for each record by its host,
   its address, the machine's name, when it joined, pushed and last tried, the day claimed, its last bundle by the
   sealed key of each thing, and the bundle last placed from each other machine. Never a value and never the key.
2. **Every other verb starts the same way** (`ready`): a host and a login, this machine joined, the key in its store,
   the add-on installed, and this machine not retired. A machine that finds its own sealed note removes its key and its
   note at once, says so, and does nothing more.
3. **`sync push [--dry-run]`.** Each thing in Carry in order. An off one and auto memory are said and passed over, auto
   memory as `waits on your yes`; a thing with no place on this system is skipped and said, so a bash tool with no
   Windows place never lands on a PC. The rest are gathered within the hard lines below: files and folders read whole,
   names left out by Leave out (a name, or `*<ending>`), links named and left; the `.env` files git ignores in each
   repository under the place (`git status --porcelain=v1 -z --ignored`, so nothing under an ignored folder is read);
   unpushed work (step 5); or a Keychain item of tool sign-ins. A file that another thing carries as tool sign-ins is
   left out of every other thing. One thing is one archive (`BDA1`, a JSON head naming each file's place, size, mode and
   SHA-256, then the bytes), at most 25 MiB; a larger one is refused with the advice to leave some of it out. An archive
   whose version is kept already is not sent again. Then one sealed manifest and one Bundles entry, this machine's
   latest, its machine, its time, what each thing held by files and size, the sealed files by key and hash, and whether
   everything went; the entry before it becomes older once this one is written. A push that changed nothing sends no
   bundle and moves the latest entry's Last checked time. `~/.braindog/locks/sync.lock` keeps two pushes, pulls or
   patches from running at once, and one left by a run that died is taken over after thirty minutes.
4. **When a session ends, and once a day.** The end hook and the start hook call `startPush`, which reads
   `sync.json` and, on a machine that has joined, starts `braindog sync push --auto end` or `--auto day` as a detached
   process and returns: the hook waits for none of it. The day and the time of the try are kept in `sync.json` before
   the push starts, as `profile-place.ts` claims its own, and the day is given back when the record did not answer; an
   end-of-session push waits ten minutes after the last try, so a dozen sessions closing together send once. Under
   `--auto` every line goes to `~/.braindog/sync.log`, nothing is asked, and the exit is 0.
5. **Unpushed work** (`sync-patches.ts`). For each repository under the place: `repo.json` (its remote with no name or
   password in it, and only an `https`, `http`, `ssh`, `git` or `user@host:path` address; its branch, base and head),
   `commits.bundle`, a git bundle of `<branch> --not --remotes` or the whole history when no remote holds any of it,
   `staged.patch` and `unstaged.patch`, `git diff --binary` a file at a time, and `new/<path>` for each file git does
   not ignore and does not track. A changed or new file named as a key (`.env`, `.npmrc`, `.pem`, `id_rsa` and their
   kind) or holding an issuer's key shape is left out and named, with the `braindog keys put` line that puts it in the
   Keychain. Every reading `git` runs with `--no-optional-locks`, and the bundle is written in a scratch folder and removed.
   **`sync patches [--from <machine>] [--dry-run]`** puts it back: a repository that is not here is cloned from its
   remote, or from its own bundle when it has none and the bundle holds its whole history; one that is here is used
   only with no changes of its own, and its branch only when it has not moved past what comes. Then `git bundle verify`,
   `git fetch` of the bundle, `git checkout -B <branch>`, `git apply --index` of the staged changes and `git apply` of
   the unstaged ones, and each new file that is not here already. `GIT_TERMINAL_PROMPT=0`, so nothing waits for a
   password. A repository stops at its first failure and says why; no other waits on it.
6. **`sync pull [--from <machine>] [--dry-run] [--yes-data]`.** The newest bundle from another machine, or from the one
   named; a machine's bundles are tried newest first until one opens under this machine's key. Each thing in it is
   placed where Carry says it lives on this system, and only while Carry still holds it and it is on; a thing this
   machine sent a newer copy of is left unless `--from` names the machine. A file here that differs is copied first to
   `~/.braindog/sync-kept/<when>/`, never beside itself; a `.env` file that differs is left and said, since the live one
   is likelier right. Placed bytes are exactly the bytes sealed, so line endings stay as found and no byte-order mark is
   added; files are written beside themselves and renamed over. At a terminal, each asked y/N:
   - **A program**: a file of a thing that runs one, or any file whose mode lets it run, is shown whole and asked
     `Place <path> on this machine? It runs a program. [y/N]`, and a yes is pinned in `~/.braindog/pins.json` by the
     SHA-256 of its bytes and mode, kind `carry` (§5.19), so the same file is not asked about again and a changed one
     is. A program that holds what looks like a key is not shown and not placed.
   - **Somebody else's account**: a thing that belongs to another person is asked about by their name from People, with
     the advice to sign in again on this machine instead, since an account may tie a sign-in to the machine it was
     made on.
   - **Tool sign-ins** move and are never live on two machines: placed only from a machine that is retired, never over
     sign-ins this machine holds already, and only to their own Keychain item or file, never to an agent app's login.
     Each app reads them at its next start; ccenv's own script spreads them into each profile.
   - **A place that moved**: what a thing is, whether it runs and where it goes are sealed in the manifest, so Carry can
     ask for more care than the sealing machine did and never less. A place on this system that is not the sealed one is
     asked about by where it would go, `--yes-data` does not take it, and `sync patches` applies nothing there.
   With no terminal, `--yes-data` places the plain data and the programs already pinned and asks nothing; without it the
   run is its plan and exits 1. `--dry-run` places, asks and pins nothing. What waits for a yes is written on its thing
   in Carry, by this machine's name, for the page to show.
7. **`sync drill [--from <machine>]`.** The newest bundle from any machine, this one included, opened and written into a
   scratch folder of its own, each file read back against the hash its archive gives, tool sign-ins checked in memory
   and never written, and the folder removed whatever happened. Nothing is placed, run or pinned. The outcome, the
   counts and what failed go into Drills as the latest drill, and the one before becomes older once it is written.
8. **`sync retire <machine> [--yes]`.** Asks at a terminal, or takes `--yes`, then seals the machine's note at
   `machine/<name>/retired` and marks its latest Bundles entry retired, or writes one saying so. That machine sends and
   places nothing more and removes its own key the next time it runs a sync verb; its tool sign-ins may then move to
   another machine, which is how setup sync never keeps two machines on one refresh token: move, then retire. Retiring
   this machine removes its key and its note now, and asks before removing each item or file of tool sign-ins it holds.
   The copies each app keeps of its own sign-ins are the app's, never opened, and the person is told to sign out of them.

**The hard lines, held in code and not left to Carry** (`carry.ts`). No agent app's login: a place, a file or a Keychain
item naming Claude Code's login file, Codex's, Claude Code's keychain item or the claude.ai login is refused, and a file
whose bytes hold the claude.ai login under another name is dropped before it is sealed and said by its place alone. No
transcript: below an agent app's folder (`.claude`, `.claude-<name>`, `.codex`, ccenv's, and each profile and Codex's
folder by where it is), a `projects`, `transcripts` or `sessions` folder and any `.jsonl` is refused by its name and
never listed. That refuses auto memory too, which sits inside `projects/`; its kind is refused whatever its place says,
until the owner says yes to carrying it. No link is followed. A sign-in moves only as tool sign-ins.

**Windows.** `~` is `%USERPROFILE%` and `%NAME%` in a place is read from the environment without case; a place that is
not a full path once read is refused. Paths compare without case on Windows and on a Mac, and as written on Linux.
Bytes are carried and placed exactly, so a file keeps its line endings and gains no byte-order mark; the PowerShell
helper reads and writes UTF-8 with none. Tool sign-ins on Windows are a file (ccenv's `mcp-auth.json`), since only a
Mac has a Keychain, and a thing whose place on a system is a Keychain item is refused there.

**What leaves the machine in the clear**: names, sizes, counts, times and hashes, in the lines, the log and the Bundles
and Drills entries. What a file holds is only ever in the sealed bytes. A refusal from the record is said in its own
sentence; one from a program is said in fixed words.

## 6 · Refusals and errors

**One sentence per refusal** ([30-BLUEPRINT](30-BLUEPRINT.md) §6, the CLI row):

```
<at> ['<found>'] — <fix with its first letter lower-cased>
```

`at` has a leading `declarations[<i>]` replaced by that declaration's `kind.id` when the CLI holds the pack
(`lint`, `plan`, `install`). So `{ code: 'FIELD_TYPE_UNKNOWN', at: 'declarations[3].fields[4].type',
found: 'currency', fix: "Did you mean 'money'?" }` prints as
`register.invoices.fields[4].type 'currency' — did you mean 'money'?`. The code itself is not printed: it would travel
only in `--json` (§4.5).

| Situation | Rendering | Exit |
|---|---|---|
| `refusals` from the host | one line each, every code of 30 §6 passed through unchanged | 1 |
| `UNAUTHORIZED` | `<host> — run braindog login <host>.` | 1 |
| `NEEDS_BROWSER_SESSION` | never printed on the first occurrence — it starts the approval of §5.2; printed if the approval also fails | 1 |
| `PLAN_STALE` | re-planned once (§5.10); printed on the second | 1 |
| `conflict` (409) | `<register>#<seq> was changed by <actor> — now version <n>; re-read and re-apply.` | 2 |
| unreachable | `<host> unreachable — <cause>`: `ECONNREFUSED` · `ENOTFOUND` · `timeout after 30 s` · `HTTP 502` · `export stream ended before dog_sig — export again` | 3 |
| `SCHEMA_MISMATCH` · `SCHEMA_NEWER` (503) | the host's sentence | 1 |
| local error | `error: <message>`, with no code; the `error` variant of `--json` (§4.5) | 1 |

**Codes the CLI raises itself**, offline, each with the `fix` a person reads:

| Code | `at` · `found` | `fix` |
|---|---|---|
| `FORMAT_NEWER_THAN_READER` | `user_version` · the file's | `Update braindog-cli; this file was written by a newer format.` |
| `SCHEMA_NEWER` | `<table>.<column>` · the header's column | `Update braindog-cli; this file was written by a newer kernel.` |
| `CHECKSUM_MISMATCH` | `<table>` · the recomputed hash | `The rows of <table> changed after signing; do not trust this file.` |
| `SIGNATURE_INVALID` | `dog_sig` · `key_id` | `The signature does not verify against key <key_id>; the file was altered or not produced by that instance.` |
| `DEVICE_CODE_EXPIRED` | `device_code` | `The code lived ten minutes; run the command again.` |

Five, counted — four of 30 §6's format and lifecycle codes, one auth code, raised here only when the host never
answered within `expires_in`. `INT_OUT_OF_RANGE` is the adapter's and passes through. Everything else the CLI
refuses locally — a file that is not a `.brain`, a malformed `.brainl` line, an unreadable `hosts.json`, no
self-host entry, `git` or `claude` missing or old, `--yes` needed, an unknown flag — is an **error**, not a
refusal: a sentence, exit 1, no code, because the only codes are the corpus's.

---

## 7 · Performance budget

| Measure | Budget | How measured |
|---|---|---|
| `braindog --version` wall time | ≤ 120 ms p95 | T22 spawns `dist/braindog.mjs` 10× on the CI runner |
| `dist/braindog.mjs` size | ≤ 400 KB | `stat` after build, in `ci.yml` |
| `.brainl` → `.brain`, 100 MB / 300,000 rows | ≤ 30 s | T17, nightly, a generated `.brainl` |
| `verify` of that `.brain` · that `.brainl` | ≤ 15 s · ≤ 10 s | T17 |
| Peak RSS during export or verify | ≤ 300 MB | T17 reads `process.memoryUsage().rss` of the child — streaming only, never a whole file in memory |
| HTTP call timeout | 30 s; export and import bodies 600 s | `AbortSignal.timeout` |
| Import body | one request, ≤ 100 MB — the Worker's request ceiling; the record reads it whole (41 §5.11) | `ponytail:` §10 |
| Device poll | every 5 s (the reply's `interval`), ten minutes | §5.2 |
| Runner claim | `wait: 20`, abort at 30 s; `idle_ms` 1,500 → 30,000 | §5.13 |
| A prompt, tool or stop hook | ≤ 50 ms with something to say; about 5 ms with nothing | the script reads the flags file and stops, or starts Node on `braindog-inbox.mjs` alone with `NODE_COMPILE_CACHE`; measured 30 ms (92 before) on an M-series Mac, `inbox-file.test.ts` holds the shell path under 50 |
| A status line draw | ≤ 50 ms | Node on `braindog-statusline.mjs` alone, which imports `statusline.ts` and `position.ts` only; measured 35 ms (103 before), 22 of it Node starting; `statusline.test.ts` holds the import list |
| Attachment fetch | 4 concurrent | §5.4 step 6 |

Startup has nothing to load but one file: no dependency resolution, no `node_modules` walk.

---

## 8 · Security

| Boundary | Rule |
|---|---|
| `hosts.json` | mode `0600`, atomic rename, in the user's config dir; a token value appears nowhere else on disk. On Windows the mode is a no-op and the file inherits the profile's ACL (`ponytail:` §10) |
| Tokens on the wire | only in `Authorization: Bearer`; `https:` required except loopback; never in a URL, a log line, an error, or `--json` — except the new token's value at `token create`, once, by design |
| Operation grants | ten minutes, one command, held in memory, never written; approved by the owner in a browser for the named subject (§13 D1). A stolen `hosts.json` can read and write rows at the token's scope; it cannot export, import, install or mint |
| The approval page | the CLI prints `verification_uri` only when its origin equals the host's |
| `verify` | no network: the file, the key, WebCrypto. `--key <url>` is the one explicit fetch |
| `export` · `import` | the `.brainl` is verified after it arrives and before it is sent; the `.brain` and `.brainl` are written `0600` — they carry the whole record with its sealed grants (03 §5) |
| Attachments | bytes are hashed before they are written under their name; the content address is the check |
| The runner | `--strict-mcp-config`, and `--allowedTools`, `--permission-mode` (`dontAsk` or `acceptEdits`) and `--max-turns` from the approved kind and nothing wider; `--restricted` and `--disable-slash-commands` only where the installed help lists them; the kind's repository folder from this machine's own map, or an empty folder it owns; a job's profile from this machine's own profiles, by name, refused when no folder or two answer to it, the folder never sent; the kernel's `jobBody` lint run again on the claim, one-line arguments of at most 64 characters, a kind pinned on each machine by its SHA-256 before its first run, the version gate, the job bearer only inside a `0600` `mcp.json` deleted after the job; never `--bare`, never `--dangerously-skip-permissions` (26 §4.4: one flag turns on [C]). The dedicated unix user and the hardened systemd unit of 26 §5 are the operator's ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md)) |
| `keys` | the value is read from stdin, never an argument, and one function prints a key, behind `keys headers` and `keys helper`, to a program and never to a terminal (§5.16): `exec` puts it into the environment of the one command it spawns, with no shell, and never on stdout, stderr or a file; it travels only in the one deposit request and the one read's answer, neither of which follows a redirect. The keychain access goes only to `/api/vault/*`, and no sentence quotes a value, a grant or a label (12 §6 rule 9). `exec` never puts a key in a variable that changes how a command runs, whether `--as` names it or a label makes it: `PATH`, `PATHEXT`, `HOME`, `USERPROFILE`, `SHELL`, `ENV`, `BASH_ENV`, `COMSPEC`, `SYSTEMROOT`, `WINDIR`, `NODE_OPTIONS`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES`, `DYLD_LIBRARY_PATH`, `PYTHONPATH`, `PYTHONSTARTUP`, `PYTHONHOME`, `RUBYOPT`, `RUBYLIB`, `PERL5OPT`, `PERL5LIB`, `PERLLIB`, `JAVA_TOOL_OPTIONS`, `_JAVA_OPTIONS`, `JDK_JAVA_OPTIONS`, `PROMPT_COMMAND`, `PS4`, `IFS`, `SHELLOPTS`, `BASHOPTS`, `ZDOTDIR`, and any name starting `NODE_`, `LD_` or `DYLD_`. On Windows a `.cmd` or `.bat` runs through `cmd.exe` with AutoRun and delayed expansion off and every argument caret-escaped twice, once for `cmd.exe` and once for the batch file's `%*`, so `&`, `|`, `^`, `"` and `%` in an argument start nothing and expand nothing. An argument with a line break, or an environment variable whose name ends in `^`, is refused, because neither can be escaped. A batch file that reads its arguments a third time, through `call`, is outside that promise |
| The session file | ids, a commit and the host's address, never a token; `0600` beside `hosts.json`; its ids are sent only to the host that wrote it |
| The profile | its name alone leaves the machine, in `x-braindog-profile`, in a runner's claim and in a Places row: the last part of `CLAUDE_CONFIG_DIR`, held to `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` with no `..`, or nothing. Never the folders above it, and a Places row this command writes holds no folder at all |
| Hook output | the briefing names a row by its spoken id and its own words, and a key by its label only; it reads only string fields, so a key's sealed-state projection never reaches the model. A failure line is fixed text or the host's refusal sentence, never an exception's message. A commit named by the record is checked to look like one before git sees it |
| `install` | a dry run unless `--apply`; a copy of the settings file before any write; never a project's `.mcp.json`; a settings file it cannot parse is not quoted, because its `env` may hold keys |
| `skills sync` | a name matching `^[a-z0-9][a-z0-9-]{0,63}$`, whose path resolves inside the skills or commands folder, or nothing is written; a file is overwritten or deleted only while its SHA-256 is still the lock's, so a local edit is never lost; a row with `managed: false` is never written; a file in a repository is reported and never committed; the lock holds paths, spoken ids, versions and hashes |
| `tools scan` | both configs are read only; a key-named (`…KEY`, `…TOKEN`, `…SECRET`, `…PASSWORD`, `…PAT`, `Authorization`) or key-shaped env or header value goes only to `keys put`, and the row keeps `NAME=credentials#N`; with no keychain access it keeps the name, drops the value, and says so in one sentence, once per host from the start hook; a key in a command, an argument or an address keeps the server out of the record; a config it cannot parse is named, never quoted; no line, row, proposal or lock holds a value |
| `tools write` | a dry run unless `--scope` names one; a stdio tool's keys are handed over by `braindog keys exec`, so no entry holds one; a header that needs a key is named by a `headersHelper` that runs `keys headers`, one per entry, and a second is left out and said; `claude` runs with no shell and its output is not relayed; a project's `.mcp.json` changes only under `--scope project`, typed by hand; an entry changed by hand since is left |
| `env apply` | a program entry (BrainDog's hooks, its server, a tool's `command` or `headersHelper`) is printed whole and placed only after a person at this machine says yes to it, pinned by SHA-256 in `~/.braindog/pins.json`, which holds a name, a kind, profile names, a hash and a time and never an entry; with no terminal one not pinned is left out and named; no key is written, and an entry or rules that look like one are left out and not printed; a CLAUDE.md changes only inside its marked block, after a copy is kept; `claude` runs with no shell and its output is not relayed (§5.19) |
| `env check` | runs the `claude` found on the path, pinned by its path before the first run, with no shell; a server is said by its name and its mark, and nothing Claude Code prints after the mark is relayed |
| Agent apps' logins | nothing that runs on the machine names Claude Code's keychain item (`Claude Code-credentials`), the claude.ai login in it (`claudeAiOauth`), a profile's `.credentials.json` or Codex's `auth.json`, except in a list that refuses them, so none is read, held or moved (26 §3: *"may not collect, store, or intermediate"*). `sync inventory` sizes a sign-in by `stat` and refuses it, and every setup sync verb refuses a place, a file or a Keychain item naming one, and drops a file whose bytes hold the claude.ai login, before anything is read or sealed (§5.20). The four names live in one list, `SIGN_INS` in `sync.ts`. The `no-login` gate reads the command, its hook scripts, every package's source and the packs, and finds a name anywhere but a refusal list it names by file and `const` |
| Setup sync | every file sealed on the machine with AES-256-GCM under a sync key the host never holds, its own key as additional data, so the record keeps bytes it cannot open and a file a host made does not open; the key's copy sealed under the sync passphrase (PBKDF2-SHA-256, 600,000 rounds), which is typed hidden at a terminal and never an argument, kept or sent. The key on each machine only in its secret store, written on standard input and never on a command line; only an item of tool sign-ins too long for `security -i` goes on `security`'s command line, never the key. The record reached only as this machine's own login with no session headers. No session transcript is listed or read, no link followed, and auto memory waits on the owner's yes. A program placed by a pull, a file of a thing that runs one or one whose mode lets it run, is shown whole and pinned by SHA-256 before it is placed; somebody else's account is asked about by their name; tool sign-ins move only from a retired machine and never over sign-ins held here; a replaced file is copied to `~/.braindog/sync-kept/`, never beside itself. Lines, the log and the Bundles and Drills entries hold names, counts, sizes, times and hashes, never a byte of what is sealed (§5.20) |
| Logging | a line names a host, a command, a code, a count — never a token, a row, a grant, a prompt (12 §8) |
| Input | `parseArgs` in strict mode; a `.brainl` line that is neither `#…` nor a JSON array is an error; the only DDL a `.brain` build runs is the kernel's own |

---

## 9 · Tests and gates

`test/**/*.test.ts`, `node --test`, `node:assert/strict`; the mock host is an in-process `node:http` server
answering canned `Result` envelopes (35 §2). No `.brainl` is committed (40 §1): `make-brainl.ts` materialises the
fixture record through 40 §5.3's materialiser, runs `exportBrainl` to lines, and appends the `dog_sig` row with a
test Ed25519 key held in `test/`. Golden files are compared as parsed JSON.

| # | Case | Input → expected |
|---|---|---|
| T1 | `--version` | → `app dev+0000000 · format 1 · kernel 1 · primitives 1`, exit 0 |
| T2 | unknown command · unknown flag | `braindog frob` · `export --bogus` → usage on stderr, exit 1 |
| T3 | refusal sentence | 30 §6's `FIELD_TYPE_UNKNOWN` object → `register.invoices.fields[4].type 'currency' — did you mean 'money'?` |
| T4 | golden `--json`, every command | **Not built.** The flag landed on 2026-09-20 and its own envelope test is `test/json.test.ts`; the per-command goldens are still owed. When they land: mock host answers the fixture reply → stdout equals `golden/<command>.json`, one file per command |
| T5 | exit codes | mock answers `ok` · `422` · `409` · closed socket → 0 · 1 · 2 · 3, for `rule apply` |
| T6 | `login` approved | poll → pending, pending, token → `hosts.json` holds it, `default` set, mode `0600` (POSIX only), the token absent from stdout and stderr |
| T7 | `login` expired · denied · foreign URI | `DEVICE_CODE_EXPIRED` → exit 1 · `DEVICE_CODE_TRIES` → exit 1 · `verification_uri` on another origin → refused before printing |
| T8 | env precedence | `--host` beats `BRAINDOG_HOST` beats `default`; `BRAINDOG_TOKEN` beats the file and is never written |
| T9 | `admin()` | first call `403 NEEDS_BROWSER_SESSION` → device flow → retry succeeds; second `403` → printed, exit 1; owner bearer → no device flow |
| T10 | `verify` accepts | the generated `seed.brainl` and its `.brain` with `--key` → the block, exit 0; without `--key` → `pinned: false` |
| T11 | `verify` refuses | one byte appended to the first `entry` line (40 §6's `tamper: row`) → `CHECKSUM_MISMATCH at entry`; a flipped `sig` byte → `SIGNATURE_INVALID`; `#dogl 2` → `FORMAT_NEWER_THAN_READER`; a header naming an unknown column → `SCHEMA_NEWER`; a plain SQLite file → `error: not a .brain file`; each exit 1 |
| T12 | `verify` partial | a `--sections governance` export → `partial: ['governance']`, exit 0 |
| T13 | round trip | `seed.brainl` → `materialise` → `toBrainl` → bytes equal the input |
| T14 | round trip, property | fast-check 4.9.0: random `Param` values (text with `|`, quotes, unicode, CR/LF; blobs; nulls; integers to ±2⁵³ − 1) written into `entry.fields`, `event.note`, `entry_vec.vec` and `grant.ciphertext` of a materialised record → `exportBrainl` → `materialise` → `toBrainl` identical; 200 runs; failing `{ seed, path }` committed under `test/seeds/` |
| T15 | export | mock streams `seed.brainl` → `.brainl` and `.brain` written, verify block printed; stream cut before `dog_sig` → exit 3, `.part` kept |
| T16 | import | `seed.brain` → one `text/plain` body whose bytes equal `seed.brainl`; the mock's `IMPORT_NOT_EMPTY` → exit 1; a tampered file → refused locally, no request made |
| T17 | 100 MB, nightly | generated `.brainl` → the numbers of §7 |
| T18 | `pack lint` | every fixture under `fixtures/refusals/` of the 33 pack codes → the expected sentence; a clean pack → `ok`, checksum matches `packChecksum` |
| T19 | `pack install` | diff printed; `n` → `not applied`, exit 0; `--yes` → `installPack` called with the diff's `plan_hash`; `PLAN_STALE` once → re-planned; `--with-deps` → `people` planned and installed before the parent; non-TTY without `--yes` → exit 1 |
| T20 | runner distil | `stream-json.ndjson` (nine line types) → the nine expected events, `seq` 1..n, `out.len` = the untruncated length |
| T21 | runner loop | mock claim → job → a stub `claude` on PATH → events posted in order, `end` carries `claude_session`; `cancel: 1` on an ack → SIGTERM sent, `end { cancelled }`; stub exits 143 → `end { interrupted }`; kind `frob`, an arg with a space, or `Bash` in `mcp.tools` → `error`, `end { refused }`, `claude` never spawned; `--version` 2.1.200 → local error |
| T22 | startup | 10 spawns of `dist/braindog.mjs --version` → p95 ≤ 120 ms |
| T23 | `export --mirror` | the seed record over `boot`, `schema` and `list` → `README.md`, a folder per list, a file per live row, a deleted row absent, money in JPY and KWD in their own decimals, a document byte for byte, a second run changing no file, a list added later appearing, a list not read named, no grant id in any file (`apps/cli/test/mirror.test.ts`) |
| T24 | attachments | two `file` values, one served, one 404 → one file written under its hash, `missing: [sha]` |

Twenty-four, counted. CI rows ([33-CONTRACTS](33-CONTRACTS.md) §8): `ci.yml` runs T1–T16, T18–T24 on every
push and T17 nightly; `gates.yml`'s `licence-closure` runs `npm pack --dry-run --json` on `apps/cli` — only
`dist/braindog.mjs`, `LICENSE`, `README.md`, `package.json`; `dependencies` empty; the bundle contains no
`@braindog/` and no `../../`; `LICENSE` starts with the Apache-2.0 words (31 §4 rule 8); `graph` asserts the six
imports of §1 point down the order; `release.yml` builds and publishes through trusted publishing, `0.0.1` by
hand first (31 §6).

**The agent path's tests**, which run today with `node --test` in `apps/cli`. `stdio.test.ts` and `http.test.ts`
cover `mcp`. `brief.test.ts` covers the card with no host:
- the owner's order;
- the two-sessions warning, word for word;
- no value, where a key carries a sentinel both in a field other than its label and in its sealed-state
  projection;
- five slots and 1,500 characters under thirty full registers, still keeping the next step and the questions;
- a record with people, keys, skills and learnings switched off;
- a tie between two projects.

`hooks.test.ts` covers the command against a stub host on `node:http`:
- `attach` and the session file;
- `compact` re-attaching by client id;
- one line and exit 0 for a host that never answers and for a closed port;
- the not-signed-in line;
- `end` sending `state: 'idle'`, and leaving another session's run alone;
- `end` sending the authors of the session's commits in a temporary repository to `meet` first: bots and the
  owner left out, a GitHub private address as a handle, at most 10, and silent with People switched off and
  with a closed port;
- `install` as a dry run, then with `--apply` and its copy, then with nothing left to change;
- no child ever printing the token.

`env-apply.test.ts`, `pins.test.ts`, `env-check.test.ts` and `keys-helper.test.ts` cover §5.19 and `keys helper`, over
a planted home of three profiles (the default one, `.claude-studio` and ccenv's `work`, whose skills folder is a link),
a record client and a terminal made in the test, and a `claude` that writes the profile's servers file:
- a dry run that changes no byte of the home, runs nothing, asks nothing and pins nothing;
- each program asked once for every profile, then pinned, and the next run asking nothing and changing nothing;
- a changed entry asked again, a no leaving the old entry and naming it, and a yes replacing its pin;
- off a terminal, nothing asked: a plan without `--yes-data`, and with it the data alone;
- the person's CLAUDE.md byte for byte around the block, in either line ending, and again once the block is gone;
- no login and no key-shaped value in any file the run leaves, any line it says, or any argument `claude` is given;
- `claude mcp list` run with each profile's `CLAUDE_CONFIG_DIR` and none for the default one, and a server said by
  its name and mark alone;
- `keys helper` refusing a terminal before any request, and as a process printing the key alone.

---

## 10 · Deliberate ceilings

- `ponytail:` the runner long-polls `claimJob { wait: 20 }` only; the `GET /ws/runner` socket and the frames of 46 §4.7 attach when the Worker exposes the route (Cloud only, 46 §13 #8) — the loop does not change.
- `ponytail:` one browser approval per ADMIN command on Cloud; unattended Cloud export or install is ADR-060's signed single-use plan hash, not a stored scope — add when a customer scripts it.
- `ponytail:` `import` is one request body, so a record above the host's request ceiling (100 MB on the Worker) cannot move through the CLI until 41 pages `importBrainl`; a self-host has no such ceiling.
- `ponytail:` a CLI-built `.brain` carries the kernel's indexes, not the declarations' (`entry_i_*`); `import` recreates them. Add `kernel.rebuildIndexes` here when someone opens such a file live.
- `ponytail:` no HTTP retries outside the runner loop and the bridge's one retry of a write carrying an `op_id` (§2, `mcp`); add a bounded retry on `Unreachable` if flaky networks show up in bug reports.
- `ponytail:` `export --with-grants` (03 §5) is not a v1 flag — a passphrase re-wrap is a Worker act; add when the keychain password ships.
- `ponytail:` `pack install --force` for a downgrade that orphans rows (04 §5) is not a v1 flag; the record refuses the downgrade until the code exists.
- `ponytail:` the paste source of 04 §3 is the app's; the CLI takes a path, a URL, a `git:` ref or a Kennel id.
- `ponytail:` `git:` means GitHub over `git clone --depth 1` with `git` on PATH; other forges when asked.
- `ponytail:` the Kennel is one fixed URL pattern, `https://kennel.brain.dog/p/<id>`; no search, no index cache.
- `ponytail:` the `.brainl` stays beside the `.brain` after export; add `--dogl-only` when disk matters.
- `ponytail:` attachments fetch four at a time with no resume; a re-run skips files whose hash matches.
- `ponytail:` the mirror writes markdown with plain values and verbatim `document` fields; no HTML, no `braindog-render`; add `--mirror-html` through `toHTML` when a browser-readable mirror is asked for.
- `ponytail:` `--json` is one document at exit, built on 2026-09-20 (§4.5); no streaming progress protocol either way.
- `ponytail:` `hosts.json`'s `0600` is a no-op on Windows; an `icacls` call if a Windows report shows another user reading it.
- `ponytail:` `init` and `dev` need `BRAINDOG_SELFHOST` outside a checkout; a published self-host binary would let the CLI find it.
- `ponytail:` no `--model` on the runner; the customer's subscription and the `claude` default decide.
- `ponytail:` no colour, no TTY detection, `✓` and `✗` always; the machine surface is `--json` (§4.5).

Eighteen, counted.

---

## 11 · Dependencies

| Kind | Package | Version | Why |
|---|---|---|---|
| runtime | — | — | none. `dependencies: {}`; the licence-closure gate asserts it |
| workspace | `@braindog/render` | `workspace:*` | `PRIMITIVES_VERSION` (36 §2) |
| workspace | `@braindog/ports` | `workspace:*` | `Result`, `Refusal`, `RefusalCode` types; `open(path)` — the `node:sqlite` adapter (37; 40 §5.3) |
| workspace | `@braindog/where` | `workspace:*` | transitively, through `declare` (38) |
| workspace | `@braindog/kernel` | `workspace:*` | `FORMAT_VERSION`, `KERNEL_MIGRATION`, `applyMigrations(sql)` (41 §2) |
| workspace | `@braindog/declare` | `workspace:*` | `parsePack(files: { path: string; text: string }[]): { pack?: Pack; refusals: Refusal[] }` · `lintPack(pack: Pack): Refusal[]` · `packChecksum(pack: Pack): string` (42) |
| workspace | `@braindog/slash` | `workspace:*` | `PROMPTS` from the `./prompts` subpath — data only, no imports (46 §2, §3) |
| dev | `typescript` | 6.0.3 | `tsc --noEmit` (31 §3) |
| dev | `esbuild` | pinned in `pnpm-workspace.yaml`'s catalog at first add — read from the registry, not from memory (31 §3's rule) | the one-file bundle (31 §8) |
| dev | `fast-check` | 4.9.0 | T14 (35 §2) |

Workspace packages are bundled into `dist/braindog.mjs` at build; esbuild tree-shakes `kernel` to its constants
and `applyMigrations`, and `slash` to `prompts.ts`. A runtime import is a new ADR ([ADR-046](16-DECISIONS.md)).

---

## 12 · Build order

Position 12 of [31-STACK](31-STACK.md) §2, after `record` ([35-SPEC-OVERVIEW](35-SPEC-OVERVIEW.md) §4).

| Needs first | For |
|---|---|
| 36 `render` | `PRIMITIVES_VERSION` |
| 37 `ports` | the envelope types; the `node:sqlite` adapter; the `Result` shape the mock host speaks |
| 40 `fixtures` · 41 `kernel` | the materialiser of 40 §5.3 and `exportBrainl` produce the test `.brainl`; `applyMigrations` builds the `.brain`; 41 §5.10 owns the grammar |
| 42 `declare` | `parsePack`, `lintPack`, `packChecksum` |
| 45 `record` | the methods of §2; `export` and `import` as the routes carry them |
| 46 `slash` | the `Claim` · `Ack` · `EndBody` protocol the runner speaks; the kinds themselves are the kernel's `job` declarations (§5.13), not `PROMPTS` |

| Unblocks | How |
|---|---|
| 49 `selfhost` | the `init <slug>` and `dev` subcommand contract of §5.14; the `/api/export` and `/api/import` bodies it serves |
| 51 `worker` | the routes of §13 D1, D3, D9 the Worker must answer |
| 52 testing | `brain-roundtrip` runs through `materialise` and `toBrainl`; the `licence-closure` row for `braindog-cli` |
| 53 operations | restore = `braindog import` into a fresh record; key rotation = `verify --key <url>` |

---

## 13 · Decisions taken here

Fourteen, counted. Each names the design document to amend in the same revision (35 §1).

**D1 · Operation grants: how the CLI reaches ADMIN without an admin token.** `braindog login` yields the
`read`+`write` agent token 33 §5 states, and that token cannot reach ADMIN (30 §5, ADR-060). So every
ADMIN command — `export`, `import`, `pack plan|install|uninstall`, `token create|list|revoke` — runs the same
RFC 8628 flow with a `reach` naming the command and a `subject` the approver reads; the owner approves *that
operation* from a browser session, and the exchange returns a ten-minute **operation grant** the CLI holds in
memory. This is the "device grant approved in the browser" ADR-060 already names for the install path,
generalised to the other owner acts; ADR-060 stays literally true — no token row has an admin scope, and a
stolen `hosts.json` cannot export or install. Wire: `POST /auth/device { slug?, reach, label, subject? }` and
`POST /auth/device/token { slug?, device_code }`, `Result` envelopes (§4.2). Storage: `device_grant` gains
`reach TEXT NOT NULL CHECK (reach IN ('login','runner','export','import','pack','token'))`, with `'vault'` added by kernel migration 4; a `login` exchange
mints the `token` row and leaves the grant row as the approval's audit; a `runner` exchange returns the 90-day
bearer of 12 §6.1; the four operation reaches return a bearer whose hash sits in `token_hash` with `expires`
left at the code's ten minutes. The Worker resolves an operation bearer to the approver's person principal with
`ctx.op = reach`, and the ADMIN group admits a person principal whose `ctx.op` names the method's command. A
self-host's `BRAINDOG_TOKEN` is the owner bearer and needs no approval (30 §10). *Amend:* 33 §2
(`CallContext.op?: Reach`), 33 §4 (the two `/auth/device` routes; ADMIN admits an operation grant), 33 §5,
30 §1 (`device_grant.reach`), 30 §5 and §10 (one row: operation grant → the approver, one command, ten
minutes), 12 §6.1, ADR-060 (an addendum, not a reversal).

**D2 · The `.brainl` is 41 §5.10's, and the CLI adds only what a file needs.** The grammar (`#dogl`, `#table
name cols`, manifest before data, `dog_sig` last) is the kernel's; the CLI's own decisions are: the `.brain`'s
schema comes from `applyMigrations`, never from the stream; rows land with `INSERT OR REPLACE` so the
migration's seed rows yield to the file's; a header naming a column the DDL lacks is `SCHEMA_NEWER`;
declaration indexes are not recreated; `entry_fts` rows are re-keyed by rowid lookup. *Amend:* 03 §2–§3 and
33 §9 to cite 41 §5.10 as the grammar's home and `#dogl` as its magic; 34 §5 with the no-PK orderings. *Also:*
02 §1 and 32 §2.3 still list `vault_key` among seven `local` tables; 03 §3, 30 §1, 12 §8 and 41 §5.2 say six
and that `vault_key` travels sealed — fix the former two.

**D3 · `export` and `import` are each one streamed body.** `POST /api/export` answers `200 text/plain;
charset=utf-8` with the `.brainl` itself — the host pages `exportBrainl(cursor)` internally and appends the signed
`dog_sig` row; a refusal is a `422` before the first byte; a mid-export `CHECKSUM_MISMATCH` (41 §5.10) cuts the
stream and the CLI reports exit 3. `POST /api/import` takes the `.brainl` as its `text/plain` body; the host
collects the lines and calls `importBrainl(lines, ctx)`, which writes nothing unless everything verifies. The
request ceiling is the host's (§10). *Amend:* 33 §4 (the two routes' bodies), 33 §9 (no page protocol over
HTTP; the record's ≤ 30 × ≤ 3 batching is internal to `importBrainl`).

**D4 · Bundling.** Type stripping is refused under `node_modules`, so the published artefact is JavaScript:
`esbuild` (dev only, per 31 §8) bundles `src/main.ts` into `dist/braindog.mjs` with `--platform=node
--format=esm --target=node24`; `tsc --noEmit` type-checks; `engines.node >= 24.13` because `node:sqlite` and
WebCrypto Ed25519 are the build's floor. *Amend:* 31 §3 (add the esbuild pin to the catalog, read from the
registry), 35 §2 (the build step is exactly this).

**D5 · The CLI/self-host boundary.** `init` and `dev` spawn the self-host entry with `process.execPath`; the
CLI never imports `apps/selfhost` (35 §2) and never links `packages/record`. The entry is
`BRAINDOG_SELFHOST`, or `apps/selfhost/src/main.ts` relative to a checkout. The self-host exposes `init <slug>`
and `dev [--port]` as subcommands of its entry. *Amend:* 33 §5 (the two rows say "spawns the self-host"),
33 §6; 49 implements the subcommands.

**D6 · `hosts.json` location and shape.** `$XDG_CONFIG_HOME/braindog/hosts.json`; `~/.config` when unset;
`%APPDATA%\braindog\hosts.json` on Windows unless `XDG_CONFIG_HOME` is set. Shape §4.1: `default` plus a map
whose keys are `origin/slug` and whose values hold `token` and `runner` separately. *Amend:* 33 §5.

**D7 · `--mirror` layout.** `<folder>/README.md`, `<list>/README.md`, `<list>/<seq>.md`; §5.9's
value rendering; verbatim `document` fields; live rows only; no `braindog-render`. *Amend:* 33 §5, 32 §2.

**D8 · The runner, v1.** Long-poll only — 33 §11's fallback one, the socket a §10 ceiling. The protocol is
46 §4.7's verbatim: `claimJob { wait }` in the body (33 §11 wrote it as a query string), `Claim` with `bearer`
and `mcp.tools`, `Ack`, `EndBody` carrying `claude_session`, `readCancel` every 20 s as the lease's heartbeat.
The templates and result schema come from `@braindog/slash/prompts` (46 §2), so the runner refuses a fifth kind
by construction; `mcp.tools` is filtered to `mcp__braindog__*` before it reaches `--allowedTools`.
`--no-session-persistence` is dropped from 26 §5's invocation because it defeats `--resume <claude_session>`,
which the same section calls the most valuable column; sessions persist in the runner's own unix user's home.
*Amend:* 33 §11 (the `Wait` row: `{ wait }` in the body; v1 pulls by long-poll), 26 §5 (the invocation), ADR-044
(a note that the runner attaches to the socket when 51 exposes it). *Overtaken on 27 September 2026 (§5.13):* a
kind is a `job.<id>` declaration approved in Decide and pinned on each machine, not one of four fixed templates;
the lint is the kernel's `jobBody`, and a kind may name a repository, `Read`, `Grep`, `Glob` and named commands
besides the `mcp__braindog__` tools, and the permission mode `dontAsk` or `acceptEdits`. Long-poll only, `claimJob { wait }` in the body and the `Ack` and `EndBody` shapes still hold.

**D9 · Methods and edges the corpus does not list.** `ruleTest({ id, against })` READ+ · `ruleApply({ id, dry })`
DATA, `write` scope unless `dry` · `createToken({ scope, name })`, `listTokens()`, `revokeToken({ id })` ADMIN.
Forty-nine methods, then — 10 · 11 · 4 · 6 · 12 · 6 — against 30 §5's forty-four. And one package edge:
`cli → slash` (12 → 11, down the order) for `prompts`. *Amend:* 30 §5 (the counts and rows), 33 §2 (the
argument objects), 33 §4 (the routes exist by the `/api/<method>` rule), 31 §2 (row 12: `1, 2, 3, 6, 7, 11`).

**D10 · `verify --key` is optional, and the key has a path.** Without `--key`, the file's own public key
verifies the signature and the output says `unpinned`; with it, the key must match `dog_sig.key_id`. The
well-known URL of 03 §4 is `GET /.well-known/braindog-key` → `{ key_id, public_key }`. *Amend:* 03 §4, 33 §4,
33 §5.

**D11 · Local errors have no code.** A CLI-local failure (bad file, missing tool, bad arguments) is an `error`
with a sentence and exit 1 (or 3 when the host is the cause), never a refusal with an invented code; `--json`
carries it as the fourth envelope variant (§4.5). *Amend:* 33 §5.

**D12 · Flags not in v1.** `export --with-grants` (03 §5), `pack install --force` (04 §5), the paste source
(04 §3) — each a §10 ceiling. *Amend:* 03 §5 and 04 §3, §5 to say "CLI: later" beside each.

**D13 · `--scope` is a list on the command line and one value on the wire.** `read,propose` collapses to the
ladder's top (30 §10); the record's `token.scope` is one CHECKed value (30 §1). *Amend:* 33 §5.

**D14 · Attachments are checked by their address.** `--with-attachments` writes `<base>.files/<sha256>`;
`verify` beside such a directory hashes every file against its name and lists any referenced digest with no
file; nothing is added to the signed manifest. *Amend:* 03 §8 ("the manifest hashes the set" → "the content
address is the check").

---

## 14 · Done when

- [ ] `pnpm -F braindog-cli build` produces `dist/braindog.mjs`; `npm pack --dry-run --json` lists four files and no dependency; the bundle contains no `@braindog/` or `../../`
- [ ] `braindog --version` prints the tuple in ≤ 120 ms p95 (T22)
- [ ] T1–T24 green under `node --test`; T17 green nightly at the numbers of §7
- [ ] `login` against the mock stores a `0600` `hosts.json` and never prints the token (T6)
- [ ] `export` → `verify` → `import` round-trips the generated `seed.brainl` against the mock, and `toBrainl(materialise(x)) ≡ x` byte for byte (T13, T14)
- [ ] every pack refusal fixture renders as its sentence (T18); `pack install` shows the diff, asks, applies with the `plan_hash`, and survives one `PLAN_STALE` (T19)
- [ ] the runner refuses an unknown kind, a prose argument, a foreign tool and an old `claude`; distils the fixture to nine events; honours cancel; reports `interrupted` on 143 (T20, T21)
- [ ] every `ponytail:` line of §10 appears as a comment at the place it describes
- [ ] the fourteen amendments of §13 are applied to their documents in this revision
- [ ] `braindog-cli@0.0.1` published by hand; trusted publishing wired for the next

---

*Previous: [47-SPEC-CONNECT](47-SPEC-CONNECT.md). Next: [49-SPEC-SELFHOST](49-SPEC-SELFHOST.md).*
