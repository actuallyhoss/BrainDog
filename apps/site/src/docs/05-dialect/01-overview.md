# The page dialect

Every page in BrainDog is text in one small format: Markdown for the words, and fenced blocks for the figures, lists and charts. This section draws each kind you can write in a fence live, with the text that drew it underneath, through the same renderer a record uses.

## A block is a fence

A block opens with three backticks, the kind, and a heading after a bar. Each line under it is one row, and a bar separates the cells of a row. The fence closes with three backticks on a line of their own.

```stat | This month
Money in | GBP 8,420.00 | from 12 customers
Owed to you | GBP 1,850.00 | 2 invoices out
Runway | 14 months | at this month's costs
```

~~~code | As written
```stat | This month
Money in | GBP 8,420.00 | from 12 customers
Owed to you | GBP 1,850.00 | 2 invoices out
Runway | 14 months | at this month's costs
```
~~~

The cells are positional. A `stat` row is a label, a figure and a note, in that order, so there is nothing to nest and nothing to name. A cell may be left empty, and the columns after it stay where they are. To put a bar inside a cell, write `\|`.

A fence may also open with three tildes, which is how the source of every example in this section is shown: a tilde fence holds backtick lines as text.

## Tones

A row may end with a tone word, `good`, `warn`, `bad` or `info`, and the block draws the row in that intent with its glyph. The glyph is part of the tone, so a row marked `warn` is never told apart by colour alone.

```timeline | The tones
Mon 21 Sep | Paid on time | good means it went well | good
Tue 22 Sep | Due in two days | warn means worth a look | warn
Wed 23 Sep | Twelve days late | bad means something is wrong | bad
Thu 24 Sep | Moved to October | info means worth knowing | info
```

~~~code | As written
```timeline | The tones
Mon 21 Sep | Paid on time | good means it went well | good
Tue 22 Sep | Due in two days | warn means worth a look | warn
Wed 23 Sep | Twelve days late | bad means something is wrong | bad
Thu 24 Sep | Moved to October | info means worth knowing | info
```
~~~

A tone after the heading, as in `note | Before you start | warn`, is the whole block's. Writing a colour role instead is read as its intent: `earn` is `good`, `danger` is `bad`, `risk` is `warn` and `accent` is `info`. The dialect names intent and the theme decides what it looks like, so a page written in it can never clash with a theme.

## Forms

Some kinds take one word after the kind, before the bar, that changes how they draw: `stat lead` makes the first figure the page's hero figure, `note lead` makes a note the page's opening sentence, `progress budget` and `progress range` read a progress row as a limit or as a band, `series net` draws what was left each month, and `steps path` draws steps as a path with a next stone. Each is shown on the page for its kind. Any other word after a kind is refused, and the refusal names the forms the kind has.

## When a block is written wrong

A block the renderer cannot read is never drawn wrong and never dropped. It is shown exactly as it was written, with one sentence above it saying what was wrong and what to write instead. A block is refused when:

- **The kind is unknown.** A misspelt kind, a kind in capitals, or a kind that belongs on a declared page rather than in a fence.
- **A row has too many cells,** or a cell holds something its column cannot read, such as a trend with no numbers in it.

When the author is an agent, that shown fence is the only feedback it gets, so the sentence always names the fault and the fix.

## The families

The pages after this one take the kinds a family at a time:

- [Words and emphasis](/docs/dialect/words): prose, notes and quotes.
- [Figures](/docs/dialect/figures): single figures, goals and small trends.
- [Charts](/docs/dialect/charts): amounts compared, parts of a whole, and figures over time.
- [Lists and tables](/docs/dialect/lists): labelled values, comparisons and links.
- [Plans and work](/docs/dialect/plans): tasks, steps, boards, dates and calendars.
- [Code, trees and changes](/docs/dialect/code): verbatim text, folders and before-and-after.
- [Live values](/docs/dialect/values): figures read from the record as the page is drawn.
- [Declared pages and layouts](/docs/dialect/pages): a page as a record stores it.
- [.dog files](/docs/dialect/dog-files): a page's source as a file you edit.
