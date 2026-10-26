# The SDK

The pack SDK is the `braindog` command line: it starts a pack, checks it the way a record will read it, runs its test, and draws its pages, all on your own machine and without sending anything anywhere.

## Getting the command line

It needs Node.js 24.13 or later. On macOS or Linux:

```code | In a terminal
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog --version
```

On Windows, in PowerShell:

```code | In PowerShell
irm https://brain.dog/cli/install.ps1 | iex
braindog --version
```

Each script puts one file in a `.braindog` folder in your home folder, checked against the checksum published beside it, and adds that folder to your path. Run the same line again to update. `braindog --help` lists every command.

## The loop

```steps | Making a pack
Start it | braindog addon new <id> | a folder with a list, a page, two example rows, a test and a README
Check it | braindog addon check <folder> | every refusal a record would give, with its code
Test it | braindog addon test <folder> | writes the test's rows and says each expectation as passed or failed
Look at it | braindog addon preview <folder> | a scratch BrainDog on this machine with your pack in its catalogue
Publish it | braindog addon publish <file> --kennel | when it is ready for other people
```

~~~code | As written
```steps | Making a pack
Start it | braindog addon new <id> | a folder with a list, a page, two example rows, a test and a README
Check it | braindog addon check <folder> | every refusal a record would give, with its code
Test it | braindog addon test <folder> | writes the test's rows and says each expectation as passed or failed
Look at it | braindog addon preview <folder> | a scratch BrainDog on this machine with your pack in its catalogue
Publish it | braindog addon publish <file> --kennel | when it is ready for other people
```
~~~

## `pack new`

```code | In a terminal
braindog addon new reading-list --title "Reading list" --author "Your name"
```

It writes a starting folder: `<id>.pack.json`, or `<id>.pack.yaml` with `--yaml`, holding a first list and a page over it with two example rows; `<id>.test.json`; and a short README. `--out <folder>` says where. The file it writes already reads the way a record will read it, so `check` passes on it before you change a line.

## `pack check`

```code | In a terminal
braindog addon check reading-list
```

It reads the pack, JSON or YAML, warns on any manifest key a record does not take, and installs it in a scratch record in memory, beside the first-party modules it requires. Every refusal the record would give, a list it does not bring, a figure with no window, a colour outside a theme, is said here with its code, before anybody else sees the file.

## `pack test`

`<id>.test.json` holds rows to write and what the record should then hold:

```code | A test file
{
  "rows":   [ { "list": "items", "fields": { "name": "Check the test runs" } } ],
  "expect": [ { "list": "items", "count": 3 },
              { "figure": "open-items", "value": 3 },
              { "row": 1, "field": "state", "is": "open" } ]
}
```

`braindog addon test <folder>` installs the pack in a scratch record after the modules it needs and its example rows, writes each of `rows` as a person would, with the record's rules running, and says each of `expect` as passed or failed. A count counts the example rows too, `row` counts from one, and a figure is read the way a page reads it.

## `pack preview`

`braindog addon preview <folder>` starts a scratch BrainDog on this machine with the pack in its catalogue, and prints where to open its page. `--port <n>` chooses the port. Everything is removed when it stops.

## The rest of the commands

- `braindog addon diff <earlier> <later>`: what moved between two versions, and the least version bump that needs.
- `braindog addon search [words]`: what the Kennel holds, or a catalogue named with `--from`.
- `braindog addon install <id|file>`: ask a record's owner to install a pack. It files a proposal, and nothing is installed until they accept it in Needs you.
- `braindog addon publish <file> --to <folder>`: add a version to a catalogue folder of your own.
- `braindog addon publish <file> --kennel`: submit it to the Kennel, described in [publishing and review](/docs/packs/publishing).
- `braindog addon yank <id> <version> --reason <why>`: take a published version back.
- `braindog addon key <file> --author <name>`: make an author key to sign what you publish.

## Starters

A starter is a whole arrangement of a record, its lists, pages and voice, shared as one file. `braindog starter` takes the same subcommands as `pack`: `new`, `check`, `diff`, `publish`, `yank`, `search`, `install` and `preview`, and `starter export` saves the record you are signed in to as a starter file.
