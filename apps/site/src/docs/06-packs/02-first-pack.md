# Your first plugin

This page makes a small plugin from nothing, a reading list, and takes it through the five commands that carry any pack from an idea to the Kennel. What each command prints is shown as it prints it, so you can tell at a glance whether yours did the same.

You need the `braindog` command line, which [the SDK](/docs/packs/sdk) says how to get. Nothing on this page sends anything anywhere until the last step.

## Start it

```code | In a terminal
braindog addon new reading-list --title "Reading list" --author "Your name"
```

```code | What it prints
Reading list 1.0.0 written to /home/you/reading-list: reading-list.pack.json with one list, a page over it and two example rows, reading-list.test.json and a README. Check it with braindog addon check reading-list, and test it with braindog addon test reading-list.
```

The folder holds three files. `reading-list.pack.json` is the plugin itself: one list called Items, a page that shows what is still open, and two example rows. `reading-list.test.json` is its test, and `README.md` says in five lines how to check, test and publish it. Add `--yaml` to write `reading-list.pack.yaml` instead; a record reads both the same way.

A list that carries example rows needs a `tags` field, because that is where each example is marked so it can be told from your real rows and cleared in one action. Make sure yours has one:

```code | In reading-list.pack.json, the list's fields
"fields": [
  { "id": "name", "type": "text", "required": true },
  { "id": "state", "type": "enum", "values": ["open", "done"], "default": "open" },
  { "id": "due", "type": "day" },
  { "id": "tags", "type": "list", "of": "text" }
]
```

## Check it

```code | In a terminal
braindog addon check reading-list
```

```code | What it prints
Reading list 1.0.0 reads as a plugin: 1 lists, 1 pages and 2 example rows. Nothing was sent.
  By Your name, MIT.
  Installs first: none
  Adds lists: Items; pages: Reading list; rules: none
  Example rows: 2; suggests skills: none
  Calls out to: nothing. It reads and writes only your BrainDog.
  Installs in a scratch BrainDog: 2 declarations and 2 example rows, and one page.
```

`check` reads the file the way BrainDog will, then installs it in a scratch BrainDog in memory. The lines in the middle are the plan an owner sees before installing: what the plugin adds, what it needs installed first, and every host it would call out to. The last line says the install went through.

When something is wrong, the last line says what, with its code in brackets. Here the page was pointed at a list called `books` that nothing declares:

```code | What it prints when the file is wrong
  Refused in a scratch BrainDog: reading-list points at the books list (page.reading-list.requires), which is not here and reading-list does not declare. Install the pack that declares books first, or declare it in reading-list. (REGISTER_UNRESOLVED)
Reading list 1.0.0 would be refused by BrainDog, as said above.
```

Every refusal a pack can meet is on [one page](/docs/packs/refusals), with its sentence.

## Test it

```code | In a terminal
braindog addon test reading-list
```

```code | What it prints
Reading list 1.0.0, tested in a scratch BrainDog after installing it:
  passed  items holds 3 rows.
  passed  row 1's state is "open".
```

The test installs the plugin with its example rows, writes each row in `rows` as a person would, and then holds the record to each line of `expect`. The starting test writes one row, so the list holds three. When an expectation does not hold, it says so, and the command ends with a failure a script or a CI job can see:

```code | What it prints when a test fails
Reading list 1.0.0, tested in a scratch BrainDog after installing it:
  FAILED  items holds 4 rows; it holds 3.
  passed  row 1's state is "open".
Some of what the test expects did not hold, as said above.
```

## Look at it

```code | In a terminal
braindog addon preview reading-list
```

```code | What it prints
Previewing Reading list 1.0.0 on a scratch BrainDog. Open http://localhost:5870/plugins/reading-list?kind=pack and press Review the plan. Stop with Ctrl+C; the scratch BrainDog is removed.
```

`preview` starts a whole BrainDog on your machine with nothing in it but your plugin in its catalogue. Open the address, review the plan, install it, and use its page the way somebody who installs it will. `--port <n>` chooses another port. Starting the scratch BrainDog takes a little while the first time.

## Publish it

When it is ready for other people, send it to the Kennel, the public catalogue every BrainDog reads:

```code | In a terminal
braindog addon publish reading-list/reading-list.pack.json --kennel
```

```code | What it prints
Reading list 1.0.0 is with the Kennel at https://brain.dog, waiting for review. It is listed once the operator has looked at it; nothing is offered until then.
```

A submission says who sent it: sign in first with `braindog login`, or sign the file with `--sign <key file>`. Without either, nothing is sent:

```code | What it prints when nobody is named
The Kennel needs to know who publishes this: sign it with --sign <key file>, or sign in with braindog login https://app.brain.dog. Nothing was sent.
```

Once the Kennel's operator trusts you as a publisher, what you submit is listed straight away instead:

```code | What it prints for a trusted publisher
Reading list 1.0.0 is listed on the Kennel at https://brain.dog. Anyone can find it with braindog addon search and install it by its id.
```

[Publishing and review](/docs/packs/publishing) has the rest: author keys, what review looks at, and taking a version back.

## Where to go next

- [The pack file](/docs/packs/format) says what every key of the file means.
- [The kinds](/docs/packs/kinds) has one example of each thing a pack can declare.
- [Settings](/docs/packs/settings), [pages](/docs/packs/pages) and [scripts](/docs/packs/scripts) go further into each.
