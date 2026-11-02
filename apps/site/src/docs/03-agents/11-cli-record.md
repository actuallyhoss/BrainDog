# The command line: automations and files

The last of `braindog`: automations and scripts, your BrainDog as one file you can keep, check and put back, and another tool's export brought in. [The first page](/docs/agents/cli) covers signing in, keys and sessions.

## Automations and scripts

```comparison | Automations
Command | What it does
braindog automations list | Say every automation you can read, what starts it and how its runs went
braindog automations show <id> | One automation, with its last ten runs step by step
braindog automations run <id> | Start one now. You in the app, or your own agents while Let your agents do everything without asking is on
braindog automations cancel <run> | Stop a run that has not finished. You in the app, or your own agents while Let your agents do everything without asking is on
braindog scripts resume <id> | Start a script paused by three refused runs in a row. You in the app, or your own agents while Let your agents do everything without asking is on
```

Otherwise an agent that wants an automation run asks with `propose`, and you press Run now in the app.

## Your BrainDog as a file

```comparison | Files
Command | What it does
braindog export | Take your BrainDog as a .brainl file and check it here. --redact-grants makes a copy to share that cannot put keys back, and -o names the file
braindog export --mirror <folder> | Write everything into a folder as plain files a person can read and git can diff, one file for each thing a list holds. Only what changed is written, and it asks for no approval, so it can run every night
braindog export --shape | A copy of your BrainDog's shape, with every word, number and date made up, to test on
braindog import <file.brainl> | Check the file here, then put your BrainDog back from it, in place of everything it holds now. It takes only this BrainDog's own copy
braindog verify <file> | Check a .brainl file on this machine: its format, every table against its manifest, and its signature. --key names the key to check it against
```

`export` and `import` each ask you to approve that one operation in the app with six digits. `--shape` asks once, for a standing grant that takes shape copies and reads nothing else, and `--mirror` asks nothing. A backup made by `export` carries the keys sealed, and names the key they are sealed under; a copy made with `--redact-grants` is safe to hand to somebody and cannot put the keys back. `verify` sends nothing, except to fetch a key when you name one by its address.

## Bringing in another tool

```code | sh
braindog import <adapter> export.json --dry-run
braindog import <adapter> export.json
```

`import` with an adapter moves another tool's export into your BrainDog: the adapter is a pack that knows that tool's shape. Running it again updates what it added rather than adding it twice, and no key's value is ever read from the export. `--dry-run` says what it would do and writes nothing.

## A map instead of an adapter

When the export is one JSON file, you can bring it in with no adapter at all: write a map that says which part of the export fills which of your lists.

```code | sh
braindog import --map map.json export.json --dry-run
braindog import --map map.json export.json
```

```code | map.json
{
  "source": "Tallybook",
  "sections": {
    "items": {
      "register": "tasks",
      "name": "Tasks",
      "key": "id",
      "label": "what",
      "fields": { "what": "what", "by": { "from": "due", "as": "day" } }
    }
  }
}
```

Each part of `sections` is a place in the export, such as `items` or `book.accounts`, and says the list it fills, the field each thing is found again by (`key`), and how each field moves. A field written as a plain name is carried as text. Any other field names where it comes `from` and moves `as` one of five words:

```comparison | How a value moves
Word | What it does
text | Carried as it is written
day | The date, kept as a day
money | An amount and its currency, from the field "currency" names or the one currency "in" says. Two currencies are never added together
link | Points at a thing in another part of the same export, named by "to". One that is not there arrives without the link, and the report says so
one of | Turns the export's word into your list's through "values". A word it has not got is offered to the list, and carried as "else" until you accept it
```

Running it again finds each thing by its key and updates it, so nothing arrives twice, and a thing you deleted here stays deleted. Every part of the export the map does not read is named in the report, such as "Not read: holdings, 14 items." Add `--strict` and an import that leaves anything unread writes nothing, so you know the map is finished.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://app.brain.dog/<slug>
```
