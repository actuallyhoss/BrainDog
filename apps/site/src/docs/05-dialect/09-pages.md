# Declared pages and layouts

A page in a record is a declaration: a stored description of which blocks to draw, over which lists, in which arrangement. The record draws it against the live rows every time it opens, with no build step and nothing to deploy.

## A page, whole

This is a page as a record stores it, in the text form you see under "How this is built" on any declared page. It opens on a sentence, then a section of cards over a list of parts, with a calendar in a side rail.

~~~code | launch.dog
page: launch
title: The launch
nav: { section: Work, order: 10 }
icon: rocket
layout: { rail: 4, sticky: true }
requires: [register.parts]

blocks:
  - kind: note
    body: "{{parts.open}} parts are still open."
    lead: true
  - kind: section
    heading: Parts
    source: register.parts
  - kind: cards
    source: register.parts
    where: state is open
    columns: [{ field: name, as: title }, { field: cost, as: figure }, { field: owner, as: fact }, { field: due, as: when }]
    order: [due asc]
    empty: Every part is done.
    lead: true
  - kind: calendar
    heading: Dates
    area: rail
    source: register.parts
    columns: [name, due]
    empty: No dates yet.
~~~

In the text a list is called a register, so `register.parts` is the list of parts.

## The page's keys

- `page` is the page's id and `title` its name.
- `nav` places it in the rail, in a section and an order. `tabs: true` in it draws every page of that section as a strip of tabs, each tab its own page with its own arrangement.
- `icon` is the glyph beside it in the rail.
- `requires` names the lists the page reads, so a page cannot appear without its data: take the list away and the page leaves the rail.
- `for` makes the page a template, one page for each row of a list, as a page for each project.
- `layout` is the arrangement, below.
- `blocks` is the blocks, in order.

## Layouts

Without a `layout`, a page is one column, twelve tracks wide, and each block's `span` says how many of the twelve it takes, so two blocks of `span: 6` sit side by side.

With `layout: { rail: 4 }`, the page is a main column and a side rail four twelfths wide. A block says which one it sits in with `area: main` or `area: rail`, `main` when it says nothing. The main column is its own twelve tracks, so a `span` keeps its meaning inside it; the rail is one stack. `sticky: true` keeps the rail in view while the main column scrolls, and on a narrow screen the rail falls under the main column. A rail is three, four or five twelfths, and any other width is refused.

A `section` block is a full-width heading with a count beside it, and the blocks after it, up to the next section, sit under it. `fold: true` starts it shut, one press to open, and `box: true` draws its blocks on one surface.

## Blocks over lists

A block with a `source` reads rows from the record rather than from text. The keys that shape the read:

- `where` is which rows, as a sentence: `state is open`, `due before today`, `tags has urgent`, with `or` between alternatives and a comma between clauses.
- `columns` is which fields, in order, and on cards what each field is.
- `order` is the sort, as `[due asc]`, and `limit` how many rows.
- `empty` is what the block says when nothing matches. It is required on every block with a source, because a record is mostly empty on its first day.
- `when` draws the block only while a figure meets a condition, as `when: { metric: overdue, gt: 0 }`, so a warning that does not apply is not shown.

## Cards

A `cards` block draws one card a row, in a grid that fills its column. Each column says what it is on the card: `title`, `figure`, up to three `fact`s, a `trend`, a `ring`, `who`, `when`, a `mark`, the `next` open step, a `reply` under the title, a `hue` for the card's mark, or a `picture`. With `lead: true` the first card is drawn two tracks wide. On the page above, the cards draw like this:

```cards lead | Parts
title | figure: Cost | fact: Owner | when: Due
Printed cards | GBP 150.00 | Sam | 9 Oct
The page | GBP 300.00 | you | 5 Oct
Photos | GBP 90.00 | the studio | 12 Oct
```

~~~code | What the record hands the renderer
```cards lead | Parts
title | figure: Cost | fact: Owner | when: Due
Printed cards | GBP 150.00 | Sam | 9 Oct
The page | GBP 300.00 | you | 5 Oct
Photos | GBP 90.00 | the studio | 12 Oct
```
~~~

That fence is what the record writes from the rows it read. An author never writes a `cards` fence by hand: in a note or an agent's write-up it is shown as written, with a sentence saying to use a comparison.

## Kinds that live on a page

These kinds draw what the record holds, so they are declared on a page and not written in a fence:

- `table` and `cards`: a list's rows, as a table or as cards.
- `section`: a heading with a count, over the blocks after it.
- `feed` and `agents`: what was done in the record, and by which agent.
- `queue`: what is waiting on you, each question with its ways to answer; `tiles: true` draws each with its suggested answer shown as what it is.
- `capture`: a one-line field that adds a row to a list.
- `inputs`: a few fields of one row to type into.
- `forecast`: cash walked forward from today, with what-ifs to move.
- `embed`: a video, a design or a map, loaded only when a reader presses.

The kinds on the earlier pages work on a page too, over a list, as `calendar` does above.

## Where a page comes from

A page is written by a person, by Slash from a description of what you want to see, by an agent through its key, or by a pack that ships it. Each one lands through the same door, and a page an agent or Slash writes arrives in Needs you first, for you to keep or refuse. To change a page's text directly, see [.dog files](/docs/dialect/dog-files).
