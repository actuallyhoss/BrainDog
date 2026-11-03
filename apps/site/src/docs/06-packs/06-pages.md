# Pages, blocks and templates

A pack's page is a declared page: a title, a place in the rail, the lists it reads, and blocks in order. It uses the same keys as any page in the dialect, so [declared pages](/docs/dialect/pages) is the reference for every key and every kind of block. This page is what a pack author needs on top of it.

## A page in a plugin

```code | A page with a side rail
{
  "page": "reading-list",
  "title": "Reading list",
  "nav": { "section": "Reading list", "order": 10 },
  "icon": "board",
  "layout": { "rail": 4 },
  "requires": ["register.items"],
  "blocks": [
    {
      "kind": "table",
      "heading": "Open",
      "source": "register.items",
      "where": "state is open",
      "columns": [{ "field": "name", "label": "Item" }, { "field": "due", "label": "Due", "align": "end" }],
      "order": [{ "field": "due", "dir": "asc" }],
      "limit": 20,
      "empty": "Nothing is open."
    },
    { "kind": "note", "area": "rail", "body": "Open items are the ones not done yet." }
  ]
}
```

- **`requires`** names every list the page reads or writes, as `register.<id>`. A list that neither this pack nor an installed one declares is refused at install, so a page can never outlive its list.
- **`nav`** puts the page in the rail, under `section`, at `order`. A pack places only its own pages and never moves yours. `tabs: true` draws every page in the section as a strip of tabs.
- **`layout`** splits the page into a main column and a side rail `rail` twelfths wide, and a block goes in the rail with `area: "rail"`.
- **`empty`** is what a block with a `source` says when nothing matches. Write it as a sentence a person reads.

A page names intent and never appearance. `tone` is `good`, `warn`, `bad` or `info`, and a colour anywhere on a page is refused, because the theme decides how things look. There is no key for a font or a spacing value to go in.

## Blocks

A block's `kind` is one the renderer draws, and the list is the blocks in [Writing pages](/docs/dialect/overview). Each kind reads its own keys, and a key the kind does not read is refused with its name, so a misspelt key is caught at install and not by a reader.

A block that reads a list names it in `source` and filters it with `where`, in the words the dialect's filters use: `state is open`, `due before +7d`, `tags has soon`. `order` and `limit` shape what it shows.

## A kind of your own

When no kind draws what you need, a pack can declare one with a `block` declaration: a primitive to draw on and the shape of its rows.

```code | A kind, and a page block that uses it
{ "block": "shelf", "title": "Shelf", "primitive": "grid", "cells": 3, "tone": true, "minSpan": 4, "purpose": "list" }

{ "kind": "block.shelf", "heading": "The shelf", "source": "register.items", "empty": "Nothing on the shelf." }
```

`primitive` is one of `panel`, `grid`, `rows`, `proportional`, `inline` and `list`. `cells` is how many cells a row takes, `minSpan` the narrowest the block may be in twelfths, and `purpose` the group the add-block picker lists it under: `say`, `figure`, `list`, `plan` or `media`. Every number is checked at install, and a page naming `block.<id>` that no installed pack declares is refused.

## Templates: one page per row

A page with `for` is a template. The record makes one page for each row of the list, fills `{{field}}` from that row, and takes the page's address from its title.

```code | A page for each item
{
  "page": "item",
  "title": "{{name}}",
  "for": { "register": "items" },
  "nav": { "section": "Reading list", "order": 20 },
  "requires": ["register.items"],
  "blocks": [
    { "kind": "note", "body": "Due {{due}}." },
    {
      "kind": "table",
      "heading": "The same day",
      "source": "register.items",
      "where": "due is {{due}}",
      "columns": [{ "field": "name", "label": "Item" }],
      "empty": "Nothing else is due that day."
    }
  ]
}
```

`for` may carry a `where` of its own, so only the rows it admits get a page. With `nav.tabs` on, a template's pages sit in their section as tabs, one to a row.

## Checking a page

`braindog addon check` installs the page in a scratch BrainDog and reads every block once, so a key a kind does not read, a list the page does not require, or a kind nobody declares is said with its code before anybody installs it. `braindog addon preview` draws it, which is the way to see how it reads at a phone's width as well as a desk's.
