# The catalogue

A catalogue is where a record finds packs: an index of what is on offer, each version's file beside it, and each file held to its checksum. A record reads the catalogue its host ships, the Kennel, and any folder or address you point it at.

## What a record reads

```comparison | Where packs come from
Source | What it is | How a record reaches it
The host's own catalogue | the packs BrainDog ships, bundled with the app | Browse, in the app
The Kennel | the public catalogue anybody can publish to | Browse, and braindog addon search
A catalogue folder | a folder you publish to yourself | braindog addon install with --from
A file | one pack file on your machine | braindog addon install with its path
```

~~~code | As written
```comparison | Where packs come from
Source | What it is | How a record reaches it
The host's own catalogue | the packs BrainDog ships, bundled with the app | Browse, in the app
The Kennel | the public catalogue anybody can publish to | Browse, and braindog addon search
A catalogue folder | a folder you publish to yourself | braindog addon install with --from
A file | one pack file on your machine | braindog addon install with its path
```
~~~

The Kennel is a convenience and never a gate: a pack you trust installs from a file or a folder just as well, through the same plan and the same checks.

## Installing

In the app, Browse lists what the catalogue offers, each with its title, summary, version notes and what it would reach. Installing asks the record's owner in Needs you, with the plan: what the pack adds and changes, the example rows it writes, and every host it calls out to. Nothing is installed until the owner accepts it.

From the command line:

```code | In a terminal
braindog addon install reading-list
braindog addon install ./reading-list/reading-list.pack.json
braindog addon install reading-list --from https://example.com/catalogue/
```

Each files a proposal for the owner rather than installing, and prints where to answer it in Needs you. An agent with a key installs the same way, so no agent adds lists or pages to a record without its owner saying yes, unless the owner has turned on **Let your agents do everything without asking** for their own agents.

A record holds the version it installed to that file's checksum, and a catalogue that later served different bytes under the same version would be refused.

## A catalogue of your own

```code | In a terminal
braindog addon publish reading-list/reading-list.pack.json --to ./catalogue
```

`--to <folder>` adds a version to a catalogue folder: an `index.json` and each version's file under `packs/<id>/`. It is held to the same rules as the Kennel: never a version already there, never an earlier one, and a major for anything taken away. Serve the folder from any address, and a record installs from it with `--from`. The Kennel is laid out the same way, which is why one reader serves both.
