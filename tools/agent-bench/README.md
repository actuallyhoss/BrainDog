# Agent bench

How fast the MCP tools answer, and how big the answers are. It prints p50 and p95 per call and the answer size in
bytes, and says where a call misses `targets.json`. It never fails CI: a miss is a line of text, and the exit code is 0.

```
node tools/agent-bench/run.mjs                      # the seed, in process
node tools/agent-bench/run.mjs --host <url>         # a host, through the CLI bridge
node tools/agent-bench/run.mjs --runs 30 --json     # more samples, JSON out
node tools/agent-bench/run.mjs --big                # the seed grown to his record's size
node tools/agent-bench/local-host.mjs               # a host on this machine with that seed, through this tree's CLI
```

## Against the seed

A record with the seed installed, called through the same router the host uses. No network, so it measures the
record's own cost. It is the bench CI can run. The token is `propose`, because `instructions` needs it; every call is
still a read. The seed has no open run, so `context since` has no stamp to ask from and answers a short line.

## Against a host

`--host <url>` starts `braindog mcp --host <url>` and talks to it as a client does. Reads only: `tools/list`,
`resources/list`, `context`, `context {since}`, `instructions`, `get`, `list`, `search`, `schema`, `record_index` and
`governance`. Nothing writes, so a run leaves no session note behind. `get` reads the newest task one `list` names,
never a number assumed to be there: `tasks#1` was refused 30 times of 30 on his record, which has no such task.

- `--cli <file>` picks the CLI (default `~/.braindog/bin/braindog.mjs`, or `$CLI`).
- `--agent <kind>` picks the agent kind the bridge says it is (default `claude`).
- You need to be signed in to the host already. The bench signs nothing in.

The numbers include the network from this machine, which is what the plan's targets (section 4.1) are measured on.

## His size, on this machine

`--big` grows the seed to his record's shape on 24 Oct 2026 (`big-seed.mjs`: 30 projects, 910 runs, 38 skills, 48
tools, 176 keys, 2,527 numbers, 35 questions waiting), still nobody's rows. `local-host.mjs` starts the self-host in
memory with that seed, makes one agent key, and runs this bench through `apps/cli/dist/braindog.mjs` (build it first
with `pnpm --filter braindog-cli build`), so a host's costs show without the network and without his record.
`--small` there keeps the plain seed.

## `--profile <file>`

Written, not run on his record. It opens a restored copy of a record, never the live one, times `context`,
`record_index` and `governance` on it, and prints any `briefing:*` marks the record emitted through
`performance.mark` and `performance.measure`, so the cost can be read per phase. No phase marks exist in `briefing()`
yet; add them there before this reports phases.

It refuses without `--approved`. That flag means the owner said yes in the app to restoring a copy. The copy comes from the
migration-rehearsal path (`apps/cli/scripts/migration-rehearsal.mjs`, `restore-drill.mjs`). Do not run it on the owner's record,
and do not point it at a file that is a live database.

## Targets

`targets.json` holds the targets from the agents and MCP plan, section 4.1, in milliseconds and bytes. They were set
for his MacBook talking to brain.dog on his record. The seed is smaller and local, so it meets them easily; a miss on
the seed is a real regression, and a pass on the seed says nothing about his record.

## Test

```
node --test tools/agent-bench/test/*.test.mjs
```
