# The command line: pages and plugins

The commands for building with `braindog`: pages as files you can edit, and starters and plugins you can build, test and share. [The first page](/docs/agents/cli) covers signing in, keys and sessions.

## Pages as files

```comparison | Pages
Command | What it does
braindog page pull <slug> | Fetch a page's declaration and write it as a .dog file: one page, one file. --out names the file
braindog page push <file> | Read a .dog file and send it as the page. An owner's session applies it; a key asks in Needs you and it waits there for an answer
braindog page check <file> | Check a .dog file against the page grammar, on this machine. Nothing is sent
```

## Starters

A starter is a whole arrangement (modules, lists, pages, voice and labels) in one file somebody else can install.

```comparison | Starters
Command | What it does
braindog starter list | Say the starters in your BrainDog, the one speaking, and the ones on offer
braindog starter export | Save your BrainDog's arrangement as a starter file, with only the example rows you name. --out, --title and --version shape the file
braindog starter check <file> | Read a starter file the way BrainDog will, on this machine: its size, any key in it, its shape and its blocks
braindog starter new <id> | Write a starting starter file, one list and a page over it, that already reads the way BrainDog will
braindog starter diff <earlier> <later> | Say what moved between two versions, and the least version bump that needs
braindog starter install <id, file or address> | Ask the owner to install one: files a proposal and prints its link in Needs you. Nothing is installed until they accept
braindog starter publish <file> --to <folder> | Add a version to a catalogue folder: never one already there, never an earlier one, and a major when it takes something away
braindog starter publish <file> --kennel | Submit it to the Kennel, the public catalogue. --sign names the author key
braindog starter yank <id> <version> --reason <why> | Take a version back on the Kennel. A BrainDog holding it is told why
braindog starter search [words] | List what a catalogue holds, the Kennel unless --from names another
braindog starter preview <file> | Start a scratch BrainDog on this machine with the file in its catalogue, removed when it stops
```

## Plugins

A plugin adds lists, pages, figures and rules to a BrainDog. The plugin commands match the starter ones, and add a test. `braindog pack` is the old name and still works.

```comparison | Plugins
Command | What it does
braindog addon new <id> | Write a first plugin folder: its manifest, a first page over a first list with two example rows, its test and a README
braindog addon check <file or folder> | Read a plugin, warn on any key its manifest does not take, and install it in a scratch BrainDog, saying every refusal BrainDog would give
braindog addon test <folder> | Install the plugin in a scratch BrainDog, write the rows in its test file, and say each expectation as passed or failed
braindog addon preview <file or folder> | Start a scratch BrainDog with the plugin in its catalogue, and print its page
braindog addon diff <a> <b> | As for a starter
braindog addon search [words] | As for a starter
braindog addon install <id or file> | As for a starter: a proposal, never an install
braindog addon yank <id> <version> --reason <why> | As for a starter
braindog addon publish <file> | Add a version to a catalogue folder, or submit it to the Kennel and say whether it is listed or waits for review
braindog addon key <file> --author <name> | Make an author key in a file you choose, outside any repository. It signs what you publish
braindog addon key rotate <old> <new> --to <folder> | Name a new key as the old one's successor in a catalogue, signed by the old key
braindog addon key revoke <file> --to <folder> --reason <why> | Mark a key as untrusted. What it signed is no longer offered
braindog kennel review | For the Kennel's operator: what waits for review, with show, list and refuse, and trust for a publisher
```

None of the check, test, diff, new or key commands sends anything. [The last page](/docs/agents/cli-record) covers automations and your BrainDog as a file.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://app.brain.dog/<slug>
```
