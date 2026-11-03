# Add-ons

An add-on (a pack, in its file and the command line) is one file of data for a record, written as one file of data: the lists it adds, the pages over them, and the figures, rules, digests and scripts that go with them. Anybody can write one, and a record installs it through the same door whether BrainDog wrote it or you did.

## BrainDog is the shell

The core of BrainDog knows how to keep lists, draw pages, count figures, run rules and send digests. It does not know what a freelancer's invoices are, or a reading list, or a bank's alert texts. Those arrive as packs. When something a pack needs cannot be said yet, the missing piece is built into the core for everyone, and the feature stays a pack on top of it.

So a pack is the way to give a record a shape of its own: a set of lists and pages for one kind of work, shared as a file.

## What an add-on can declare

A pack's `declarations` are each one of a closed set of kinds, listed in [The kinds](/docs/packs/kinds). The ones a pack reaches for most:

```spec | Declarations
register | a list | its fields, their types, and which one is the title
page | a page | its blocks, its place in the rail, the lists it reads
metric | a figure | what it counts or adds up, over which rows, toward what target
rule | when something happens, do something | on a list, when a row matches, a closed set of actions
digest | a message on a schedule | its sections, each left out when empty
ingest | something arriving from outside | a door for mail, a webhook or a pasted text, and what it writes
script | code, run in a sandbox and never inside the record | when it runs, what it reads and writes, where it may call out
```

~~~code | As written
```spec | Declarations
register | a list | its fields, their types, and which one is the title
page | a page | its blocks, its place in the rail, the lists it reads
metric | a figure | what it counts or adds up, over which rows, toward what target
rule | when something happens, do something | on a list, when a row matches, a closed set of actions
digest | a message on a schedule | its sections, each left out when empty
ingest | something arriving from outside | a door for mail, a webhook or a pasted text, and what it writes
script | code, run in a sandbox and never inside the record | when it runs, what it reads and writes, where it may call out
```
~~~

Beside its declarations, a pack can lay optional fields on another pack's list with `extends`, declare settings a person fills in on the pack's page with `config`, and carry example rows as `seeds`.

## What installing shows you

Nothing is installed without a plan first. The record works out everything the pack would add and change, and shows it before anything is written: each list and page it adds, the example rows it writes, every host a script or action would call out to and how often, and whatever it would conflict with. Installing then applies all of it in one step, or none of it. If the record changed since the plan was made, the install is refused and the plan made again.

A pack may place its own pages in the rail. It never moves yours.

## What an add-on cannot do

- Read a list it did not declare or require.
- Write any row except its own example rows, which are counted on their own line in the plan.
- Delete anything.
- Load anything from outside the record into a page: no remote font, picture, script or frame.
- Write a colour, a font or a spacing value. A page names intent, and the theme decides how it looks.
- Carry a credential. A key a script needs is held in the record's Keychain and named by its label.
- Call out to any host the plan did not print. A host is written out in full, so the plan can print it.

[What a pack can and cannot do](/docs/packs/limits) has the whole list.

A pack can still mislead: a figure could add up the wrong field under a plausible name. That is why the plan names every declaration, and why a figure on a page shows where it came from.

## Uninstalling

Declarations belong to the pack, and rows belong to you. Uninstalling retires the pack's lists and pages and keeps every row written under them: they stop being shown, they stay in every export, and installing the pack again brings them back. A pack can also be turned off and on again from the record's add-ons, keeping its version and settings, unless another pack that is on still leans on it.

## Build one with your agent

You do not need to write the file yourself. Ask the agent you work with for what BrainDog lacks: it looks in the store, writes an add-on when nothing fits, checks it against your BrainDog and asks you on Needs you before anything is installed. [Build one with your agent](/docs/packs/with-your-agent) has the calls and what you see.

## Where to go next

- [Build one with your agent](/docs/packs/with-your-agent): ask for what BrainDog lacks, and approve what it makes.
- [Your first add-on](/docs/packs/first-pack): a pack from nothing to the Kennel, with what each command prints.
- [The pack file](/docs/packs/format): the manifest and the declarations, key by key.
- [The kinds](/docs/packs/kinds): one example of each thing a pack can declare.
- [Settings](/docs/packs/settings): what the owner chooses, and how a pack reads it.
- [Pages, blocks and templates](/docs/packs/pages): a pack's pages, a kind of block of its own, and a page for each row.
- [Scripts and calling out](/docs/packs/scripts): code in a sandbox, and every host a pack may call.
- [Versions](/docs/packs/versions): what a version number promises.
- [The SDK](/docs/packs/sdk): making, checking and testing a pack on your own machine.
- [Publishing and review](/docs/packs/publishing): putting a pack on the Kennel, and taking a version back.
- [The catalogue](/docs/packs/catalogue): where records find packs and install them.
- [What a pack can and cannot do](/docs/packs/limits): the whole list, and the one thing no check prevents.
- [When an add-on will not install](/docs/packs/refusals): each sentence a pack can meet, and where.
