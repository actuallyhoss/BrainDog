# The command line: pages and packs

The commands for building with `braindog`: pages as files you can edit, and use cases and packs you can build, test and share. [The first page](/docs/agents/cli) covers signing in, keys and sessions.

## Pages as files

```comparison | Pages
Command | What it does
braindog page pull <slug> | Fetch a page's declaration and write it as a .dog file: one page, one file. --out names the file
braindog page push <file> | Read a .dog file and set it as the page. An owner in the app only: a token is refused, this one included
braindog page check <file> | Check a .dog file against the page grammar, on this machine. Nothing is sent
```

## Use cases

A use case is a whole arrangement (modules, lists, pages, voice and labels) in one file somebody else can install.

```comparison | Use cases
Command | What it does
braindog usecase list | Say the use cases on this record, the one speaking, and the ones on offer
braindog usecase export | Save this record's arrangement as a use-case file, with only the example rows you name. --out, --title and --version shape the file
braindog usecase check <file> | Read a use-case file the way a record will, on this machine: its size, any key in it, its shape and its blocks
braindog usecase new <id> | Write a starting use-case file, one list and a page over it, that already reads the way a record will
braindog usecase diff <earlier> <later> | Say what moved between two versions, and the least version bump that needs
braindog usecase install <id, file or address> | Ask the owner to install one: files a proposal and prints its link on Decide. Nothing is installed until they accept
braindog usecase publish <file> --to <folder> | Add a version to a catalogue folder: never one already there, never an earlier one, and a major when it takes something away
braindog usecase publish <file> --kennel | Submit it to the Kennel, the public catalogue. --sign names the author key
braindog usecase yank <id> <version> --reason <why> | Take a version back on the Kennel. A record holding it is told why
braindog usecase search [words] | List what a catalogue holds, the Kennel unless --from names another
braindog usecase preview <file> | Start a scratch record on this machine with the file in its catalogue, removed when it stops
```

## Packs

A pack adds lists, pages, figures and rules to a record. The pack commands match the use-case ones, and add a test.

```comparison | Packs
Command | What it does
braindog pack new <id> | Write a starting pack folder: its manifest, a first page over a first list with two example rows, its test and a README
braindog pack check <file or folder> | Read a pack, warn on any key its manifest does not take, and install it in a scratch record, saying every refusal a record would give
braindog pack test <folder> | Install the pack in a scratch record, write the rows in its test file, and say each expectation as passed or failed
braindog pack preview <file or folder> | Start a scratch record with the pack in its catalogue, and print its page
braindog pack diff <a> <b> | As for a use case
braindog pack search [words] | As for a use case
braindog pack install <id or file> | As for a use case: a proposal, never an install
braindog pack yank <id> <version> --reason <why> | As for a use case
braindog pack publish <file> | Add a version to a catalogue folder, or submit it to the Kennel and say whether it is listed or waits for review
braindog pack key <file> --author <name> | Make an author key in a file you choose, outside any repository. It signs what you publish
braindog pack key rotate <old> <new> --to <folder> | Name a new key as the old one's successor in a catalogue, signed by the old key
braindog pack key revoke <file> --to <folder> --reason <why> | Mark a key as untrusted. What it signed is no longer offered
braindog kennel review | For the Kennel's operator: what waits for review, with show, list and refuse, and trust for a publisher
```

None of the check, test, diff, new or key commands sends anything. [The last page](/docs/agents/cli-record) covers automations and the record as a file.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://brain.dog/app/<slug>
```
