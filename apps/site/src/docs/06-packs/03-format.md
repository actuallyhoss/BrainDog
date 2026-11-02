# The add-on file

A pack is one file, `<id>.pack.json` or `<id>.pack.yaml`: a manifest saying what the pack is and what it needs, then its declarations and example rows. A record reads both forms through one parser, so choose whichever you would rather write.

## A whole add-on

This is the smallest useful pack, a list of things to do and a page of what is still open. It is the shape `braindog addon new` starts every pack in, shortened here by its `author` and `license` lines.

```code | hello.pack.json
{
  "pack": "hello",
  "version": "1.0.0",
  "title": "Hello",
  "summary": "A list of things to do and a page showing what is still open.",
  "changes": "The first version.",
  "requires": { "format": 1, "primitives": 1, "packs": {} },
  "declarations": [
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
    },
    {
      "page": "hello",
      "title": "Hello",
      "nav": { "section": "Hello", "order": 10 },
      "icon": "board",
      "requires": ["register.items"],
      "blocks": [
        {
          "kind": "table",
          "heading": "Open",
          "source": "register.items",
          "where": "state is open",
          "columns": [
            { "field": "name", "label": "Item" },
            { "field": "due", "label": "Due", "align": "end" }
          ],
          "order": [{ "field": "due", "dir": "asc" }],
          "limit": 20,
          "empty": "Nothing is open."
        }
      ]
    }
  ],
  "seeds": [
    { "register": "items", "fields": { "name": "Write the first real item", "due": "2026-10-01" } },
    { "register": "items", "fields": { "name": "Delete these two examples", "state": "done" } }
  ]
}
```

## The manifest

The top of the file says what the pack is. Its keys are the ones listed below; a record passes over any other key, and the Kennel refuses it.

- `pack` and `version`: the id a record holds the pack under, and its version as three numbers.
- `title` and `summary`: what a person sees when browsing, and in the plan before installing.
- `changes`: what this version changed, in words a person will notice. The catalogue shows it as the version's notes.
- `author` and `license`: who wrote it, and the licence it is shared under.
- `requires`: the dialect's format and primitives it is written for, and each pack it needs installed first, with a version range, as `"money-core": ">=3.0.0 <4.0.0"`.
- `declarations`: the lists, pages, figures, rules, digests, doors and scripts it adds.
- `extends`: optional fields and new values laid on another pack's list. Only optional fields, so every row stays readable and every other writer keeps working.
- `config`: settings a person fills in on the pack's page, which a script reads as `ctx.config`.
- `seeds`: example rows, marked as examples and clearable in one action.

## Lists

A `register` declaration is a list. Its `fields` each have an `id` and a `type`, such as `text`, `enum`, `day`, `money` or `int`, and may be `required` or carry a `default`. `title` names the field a row is called by. Ids are stable for ever: a field is retired, never renamed, and a new one added in its place. A list with example rows declares `tags` as a list of text, because that is where each example is marked. [The kinds](/docs/packs/kinds) has an example of each declaration.

### The table a list opens on

`table` is optional. It names the columns the list's table opens on, in the order they are drawn, one to nine of them. Each is a field of the list, or an object with three keys:

- `field`: the field the column draws.
- `or`: another field, read where `field` holds nothing.
- `label`: the column's heading, up to 40 characters, in place of the field's own label.

```json
"table": ["on", { "field": "payee", "or": "counterparty_text", "label": "Payee" }, "account", "category", "amount"]
```

That is the Ledger's: the date, who the money went to or came from (the bank's words where nobody gave a name), the account, the category and the amount. Every field named has to be a field of the list, or the install is refused with the field it could not find. A column over a field that waits for another list (`when`) waits with it.

Leave `table` out and the list opens on columns worked out for it: the `title`, the `mobile` fields, the `state` and a deadline. A pack written before `table` existed keeps those. Either way a person can hide a column from Display, and that choice is theirs alone.

## Pages

A `page` declaration is a [declared page](/docs/dialect/pages), in the same keys the page dialect uses. `requires` names the lists it reads, and a page cannot appear in a record that lacks them. Every block with a `source` says what it shows when it is empty.

## Scripts

A script lives twice in a pack's folder: as `<name>.js`, the file you edit and read, and as the `source` of its declaration in the pack file, which is what a record runs. A script opens with a comment saying what it does, in words a person deciding whether to install it can follow. It says when it runs, the lists it reads and writes, the hosts it may call, and the Keychain keys it uses by label, and the plan prints each of those before anything installs.

## The folder

```tree | A pack's folder
packs/hello
  hello.pack.json
  hello.test.json
  hello.test.ts
  README.md
```

~~~code | As written
```tree | A pack's folder
packs/hello
  hello.pack.json
  hello.test.json
  hello.test.ts
  README.md
```
~~~

`hello.test.json` is the test `braindog addon test` runs, described in [the SDK](/docs/packs/sdk). The packs in BrainDog's own repository each carry a `.test.ts` too, which installs the file exactly as it ships in a fresh record.
