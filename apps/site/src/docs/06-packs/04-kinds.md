# The kinds

Every declaration in a pack is one kind, named by its first key, and the list of kinds is closed: it is the kinds on this page. A declaration that begins with anything else is refused before the rest of it is read. This page has one example of each, and every example here installs as written, beside the reading list from [your first plugin](/docs/packs/first-pack).

```spec | The kinds, in the order KINDS names them
register | a list | its fields, their types, which one is the title
page | a page | its blocks, its place in the rail, the lists it reads
block | a new kind of block | the primitive it draws on and the shape of its rows
ingest | something arriving from outside | a door or a schedule, what it reads and the list it writes
rule | when something happens, do something | a trigger, a condition and steps from a closed list
metric | a figure | what it counts or adds up, its format, a target and a window
theme | how the record looks | a seed colour and the schemes, never CSS
digest | a message on a schedule | when, where it goes, and sections that drop out when empty
script | code, run in a sandbox | when it runs, what it reads and writes, where it may call out
job | a run of Claude Code on the owner's machine | the prompt, the tools, the folder and how it asks
```

## `register`

A list: its fields, their types, and which field a row is called by.

```code | A list
{
  "register": "items",
  "name": "Items",
  "title": "name",
  "fields": [
    { "id": "name", "type": "text", "required": true },
    { "id": "state", "type": "enum", "values": ["open", "done"], "default": "open" },
    { "id": "due", "type": "day" },
    { "id": "tags", "type": "list", "of": "text" }
  ]
}
```

A field `state` is always an enum. A list with example rows needs `tags`, which is where each example is marked. A field id is kept for ever: to change a field, retire it and add another.

## `page`

A page over lists the pack declares or requires. [Pages, blocks and templates](/docs/packs/pages) has the rest.

```code | A page
{
  "page": "reading-list",
  "title": "Reading list",
  "nav": { "section": "Reading list", "order": 10 },
  "icon": "board",
  "requires": ["register.items"],
  "blocks": [
    {
      "kind": "table",
      "heading": "Open",
      "source": "register.items",
      "where": "state is open",
      "columns": [{ "field": "name", "label": "Item" }, { "field": "due", "label": "Due", "align": "end" }],
      "empty": "Nothing is open."
    }
  ]
}
```

## `block`

A new kind of block, drawn by one of the renderer's primitives. A page then names it as `block.` and its id.

```code | A kind of block, and a page block using it
{ "block": "shelf", "title": "Shelf", "primitive": "grid", "cells": 3, "tone": true, "minSpan": 4, "purpose": "list" }

{ "kind": "block.shelf", "heading": "The shelf", "source": "register.items", "empty": "Nothing on the shelf." }
```

The primitive is one of `panel`, `grid`, `rows`, `proportional`, `inline` and `list`. A page that names a kind no installed pack declares is refused, rather than opening with a hole where the block should be.

## `ingest`

Something arriving from outside: a door for mail, a webhook or pasted text, or a schedule that fetches an address. This one polls an address once a day and writes a row from each answer.

```code | A daily poll
{
  "ingest": "reading-feed",
  "channel": "poll",
  "url": "https://stats.example.com/v1/reading",
  "every": "1d",
  "map": [{ "name": { "path": "data.title", "type": "text" } }],
  "writes": { "register": "items" }
}
```

The plan prints it as `CALLS OUT stats.example.com · every 1d · grant "none"` before anything installs. [Scripts and calling out](/docs/packs/scripts) says what an address may be.

## `rule`

When something happens, do something. The trigger is `on`, the condition is `when` in the same words a page's `where` uses, and `steps` are drawn from a closed list.

```code | A rule
{
  "rule": "due_soon",
  "name": "Tag what is due within a week",
  "on": { "written": { "register": "items", "op": ["create", "update"], "fields": ["due"] } },
  "when": "due before +7d",
  "steps": [{ "tag": "soon" }]
}
```

A rule starts when a row is `written`, when something arrives at a door (`arrival`), on a clock (`every`), when a figure crosses a line (`metric`), when a question is `decided`, or by hand (`manual`). Its steps are `tag`, `untag`, `set`, `move`, `link`, `note`, `notify`, `schedule`, `create`, `suggest`, `run` and `stop`, and for the flow between them `if`, `set_var`, `script`, `call`, `ask_slash`, `ask_person`, `wait`, `meet` and `run_job`. There are no others. A step that makes rows needs a bound, so a rule can never fill a record.

## `metric`

A figure. It says what it counts or adds up, over which rows, how it is written, and what it is measured against.

```code | A figure
{
  "metric": "open-items",
  "name": "Open items",
  "source": "register.items",
  "where": "state is open",
  "value": { "count": true },
  "format": "int",
  "target": { "lte": 10 },
  "window": "30d"
}
```

A figure with no target, or no window to compare with, is refused: a number with no target is decoration.

## `theme`

How the record looks, as a seed colour the theme builds every role from, and the schemes it offers. A theme is the one place a colour is written.

```code | A theme
{ "theme": "midnight", "seed": { "accent": "#CF413A" }, "scheme": "both" }
```

A colour is `#RGB`, `#RRGGBB` or `oklch(L C H)`. One with an alpha, one too grey to build from, or a set of roles that fails contrast is refused with the role named.

## `digest`

A message on a schedule. Each section reads a list, and one with nothing in it is left out.

```code | A morning digest
{
  "digest": "reading",
  "name": "Reading",
  "schedule": { "at": "09:00" },
  "channels": ["email", "in-app"],
  "sections": [
    {
      "heading": "Still open",
      "source": "register.items",
      "where": "state is open",
      "as": "table",
      "columns": [{ "field": "name", "label": "Item" }, { "field": "due", "label": "Due" }],
      "omit_when_empty": true
    }
  ]
}
```

## `script`

Code, run in a sandbox and never inside the record. Everything it may reach is said in the declaration, and the plan prints it. [Scripts and calling out](/docs/packs/scripts) has the rest.

```code | A script
{
  "script": "overdue",
  "title": "Mark what is past its day, once a day",
  "runs": { "every": "1d" },
  "egress": [],
  "keys": [],
  "reads": ["items"],
  "writes": ["items"],
  "source": "export default async function run(ctx) { ... }"
}
```

## `job`

A run of Claude Code on the owner's own machine, started from the record. The kind says everything a run may do: the prompt, with `%slots%` a person fills in, the tools, the folder, how many turns and how it asks.

```code | A job
{
  "job": "reading-notes",
  "title": "Reading notes",
  "prompt": "Write a short note on %title% and propose it as a row of items.",
  "args": [{ "id": "title", "label": "The book", "max": 64 }],
  "tools": ["Read", "mcp__braindog__propose"],
  "turns": 12,
  "permission": "dontAsk"
}
```

The owner approves the kind once, and a machine the owner enrolled runs it. No job skips its permissions: `dontAsk` runs only the tools it names.
