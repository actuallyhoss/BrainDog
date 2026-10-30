# Resources

Beside its tools, your BrainDog offers MCP resources: documents an agent reads by address, such as your Home page with every figure worked out, or the grammar a page declaration is written in. A client that reads resources learns more for fewer tokens.

## What a resource is

A resource is read with the client's own `resources/read`, by an address that starts `braindog:`. Each one is checked before it is listed, so an agent is only offered what it may read, and a page's blocks are held to what the agent may see. An address that names nothing is refused with the fix: read `braindog:boot` for what this BrainDog holds.

Each resource says how long a client may keep it before reading it again. Who is working and what applies now are read fresh every time; a page or a figure may be kept for a minute; a grammar, a list's fields or a skill's text for an hour.

## Fixed addresses

```comparison | Resources with no argument
Address | What it holds | Keep it for
braindog:whoami | Who the agent is here, and which verbs it reaches | Read fresh
braindog:boot | What your BrainDog holds, and how many rows each list has | A minute
braindog:context | The briefing for where the agent is: its session, its project, and what applies there | Read fresh
braindog:sessions/live | Who else is working now, on what, and in which repository | Read fresh
braindog:digest/today | What the digest would say if it went now. It sends nothing | A minute
braindog:decisions | What has been proposed and not yet answered | A minute
braindog:inbox | Every state in one answer: how many in each, then each state newest first, what waits first; a busy inbox keeps ten a state and names each state's address | Read fresh
braindog:inbox/patterns | What each pattern did with the last 14 days of messages: what it filed, what it skipped and why, what waits, and how many none of them read | Read fresh
braindog:actions | Every scheduled action: what it calls, how often, whether it is paused and why, and this month so far | A minute
braindog:automations | Every automation: what starts it, when it runs next, and how its runs went this month | A minute
braindog:arrangement | How your BrainDog is arranged: its packs, what else is on offer, its voice and settings, its pages, and what waits | A minute
braindog:design | The design book: every kind of block with an example, the colours, type and spacing, and the layout rules. Read it before designing a page, a card or a visual | An hour
```

`braindog:sessions/live` matters more than it looks. Two sessions working in one folder overwrite each other, so an agent that finds another session in its repository should coordinate or stop.

## Grammars

The grammars say what a declaration may contain, each with one that installs. An agent reads one before it proposes a new page, list, figure, door or automation, so what it proposes is something BrainDog will take.

```comparison | The grammars
Address | What it describes
braindog:grammar/page | A page declaration
braindog:grammar/register | A list declaration: its keys, and each field's keys
braindog:grammar/metric | A figure declaration
braindog:grammar/proposals | The proposals that change what your BrainDog is: pack, settings and arrange
braindog:grammar/ingest | A door or a scheduled action, with one of each
braindog:grammar/kinds | Every kind of block a page draws, a line each, and what to reach for; braindog:grammar/kind/<name> says one whole
braindog:grammar/script | A script: what its code can reach, and its limits
braindog:grammar/automations | An automation: its triggers, its steps, its limits and what does not run yet
```

## Addresses with an argument

The client fills in the part in braces.

```comparison | Templates
Address | What it holds
braindog:schema/{register} | The fields of one list
braindog:page/{slug} | One page, with every block worked out: rows and figures, never markup
braindog:metric/{id} | One figure, with its target and how it compares
braindog:skill/{name} | The text of one skill, and when to reach for it
braindog:declaration/{slug} | One page as declared, to change and propose back
braindog:automation/{id} | One automation as declared, with its last ten runs, each step with its outcome
braindog:inbox/{state} | The newest hundred in one state, or one arrival whole by its id
```

The inbox states are `untriaged`, `review`, `skipped`, `matched`, `proposed`, `ignored` and `all`. `skipped` is where a skip rule that is too wide shows itself.

`braindog:page/home` is the place to start when an agent needs to know what leads in this BrainDog: it answers the Home page with every block worked out.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://app.brain.dog/<slug>
```
