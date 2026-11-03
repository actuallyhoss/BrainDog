# The writing guide

**CONTRACT.** Made from `tools/gates/words.json` by `node tools/gates/words-guide.mjs`, and checked against it by
`tools/gates/test/words.test.mjs`. Change the list and run the script; an edit made here by hand turns the test red.

The words a person reads name their own things, in plain sentences. Two checks hold it: the `words` gate reads every
copy file the app ships and every title, heading, label, body and empty text of a page the seed or a plugin
declares; the page lint reads what a page prints on a real record, and Health shows what it finds.

## Words a person never reads

| Never | Say | Why | On a page |
|---|---|---|---|
| row | the thing's own name: a bill, a task, a person | A row is how the database holds a thing, not what the person calls it. | `plain-words` |
| list item | the thing's own name | The machinery's word for whatever the list holds. | `plain-words` |
| entity | the thing's own name | An engineer's word for a thing; nobody keeps an entity. | `plain-words` |
| credential | key | The product calls them keys, and the Keys page is where they live. | `plain-words` |
| register | list | Register as a noun is the kernel's word for a list. To register, the verb, is plain and is not matched. | `plain-words` |
| pack | plugin | Say plugins, not packs, on screen. To pack and send an order, the verb, is plain and is not matched. | `system-word` |
| slug | address | A developer's word for the end of an address. | `system-word` |
| schema | the fields a list holds | Developer vocabulary in visible copy. | `system-word` |
| declaration | what a plugin sets up | How the engine is built, not what the person sees. | `system-word` |
| MCP | the agent app by its name, such as Claude Code or Cursor | A protocol's initials; the person knows the app they use. | `system-word` |
| snapshot | backup | The Backups page holds copies of the record, and a backup is the word for one. | `system-word` |
| Spark | Slash | The assistant was renamed Slash, everywhere. | `system-word` |
| recommended | suggested | Suggested is the one word. | `system-word` |
| Submit | a verb and its object, such as Save the bill | A button says what it does to what. | the source only |
| OK | Done, or a verb and its object | A button says what it does to what. | the source only |
| isn't code | not just code | The product's words are "not just code". | `system-word` |
| an id in a sentence | the thing's name; a run's handle only beside its name | Names, never ids, in anything a person reads. The page lint's raw-id rule holds the same on a drawn page. | the source only |
| palette | the search, or the box you type in | The command palette is a developer's name for the box that opens on a key (U-C7). | the source only |
| gate | what it checks, or a rule | A gate is how the build is checked, not something a person keeps (U-C7). | the source only |
| host | this BrainDog, or the server's name | The machine a BrainDog runs on is not a thing a person names (U-C7). | the source only |
| kernel | BrainDog | The kernel is how BrainDog is built inside (U-C7). | the source only |
| bytes | a size in KB or MB | A size reads in the units a phone shows (U-C7). | the source only |
| sealed | locked, or kept | Sealed is the word for how a key is stored, not for what the person can do with it (U-C7). | the source only |
| vital signs | how BrainDog is doing | A medical metaphor for health checks (U-C7). | the source only |
| house look | BrainDog's look, or the usual look | The house look is the builders' name for the default theme (U-C7). | the source only |
| the long dash | a comma, a colon or a new sentence | No em dashes in copy a person reads. A dash alone is the drawn mark for no value and is forgiven. The page lint's em-dash rule holds the same on a drawn page. | the source only |

## Titles, headings, labels and buttons

A title, a heading, a label or a button is a name, not a sentence. A key ending in one of those words holds one. Say the same words with no full stop. A body is a sentence and ends in one; an ellipsis promises more and is not a full stop.

## Buttons of one word

Only Undo, Cancel, Done, Close and Back. Any other button says what it does to what: Save the bill, not Save.

## What the page lint finds in the words

| Rule | What it finds | Read in |
|---|---|---|
| `em-dash` | An em dash in the words; a comma, a colon or a new sentence reads better. | the product's copy |
| `plain-words` | A word for the machinery, such as row, entity or credential, where the words should name the thing itself. | the product's copy |
| `system-word` | A word for how the app is built, such as pack, schema or MCP, where a plain word goes. | the product's copy |
| `dev-name` | A name from the code, such as a dotted or hyphened identifier, where a sentence should say what it is. | every part of a page |
| `bare-key` | A value of a closed list printed as its key, such as a service's type, where its name goes. | every part of a page |
| `one-word-button` | A button of one word that is not Undo, Cancel, Done, Close or Back, where a verb and its object say what it does. | the product's copy |
| `title-stop` | A title, a heading or a button that ends in a full stop, where a name goes and not a sentence. | the product's copy |
| `raw-fault` | An error from the code, such as TypeError, Cannot read or a stack line, where a sentence should say what went wrong. | every part of a page |

A rule read in the product's copy is not read in the person's own words, such as a note they wrote. No rule reads code:
a span in backticks or a type's angle brackets is drawn as code and left as typed. Today's debts are
held by file in `words.json`, each with its reason, and that list only shrinks.
