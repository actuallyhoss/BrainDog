# Words and emphasis

Between the fences a page is Markdown, in a small closed subset, and two kinds carry words of their own: a note, which is a paragraph with a tone, and a quote, which is one line said by somebody.

## The Markdown subset

Outside a fence the renderer reads:

- headings, written with one to four `#` signs;
- paragraphs, where a blank line ends one and a single line break does not;
- flat lists, each item on a line starting with `-` or `*`;
- a rule, written as three dashes on a line of their own;
- **bold** between double asterisks, *emphasis* between single ones, and `code` between backticks;
- [links](/docs/dialect/overview), written as `[words](address)`.

A link goes to an `https:` address, a `mailto:` address, an anchor on the page, or a path on the same site. Any other address is drawn as text. A blockquote, a table, an image or raw HTML is shown as the text it was written as, because the renderer has one parser and one escape, and nothing in a page can inject markup.

A code span is read first, so a literal `{{figure}}` inside backticks stays as typed rather than being read as a [live value](/docs/dialect/values).

## `note`

A note is prose in a panel: a heading after the bar, a tone after the heading when it has one, and paragraphs inside. It is the only kind whose body is written as paragraphs rather than rows.

```note | Before you start | warn
Connect the bank before the first month closes, or the month starts **empty**. A blank line starts a new paragraph.

Everything else can wait.
```

~~~code | As written
```note | Before you start | warn
Connect the bank before the first month closes, or the month starts **empty**. A blank line starts a new paragraph.

Everything else can wait.
```
~~~

The fence scan is flat: a fence inside a note ends the note, so a note holds words and no other blocks.

## `note lead`

The `lead` form is the sentence a page opens on, said from its figures. The host sets it as the screen's one sentence, larger than the prose around it.

```note lead
September brought in GBP 8,420.00 and cost GBP 3,115.00. Two invoices are still out.
```

~~~code | As written
```note lead
September brought in GBP 8,420.00 and cost GBP 3,115.00. Two invoices are still out.
```
~~~

On a declared page the numbers in a lead note are [live values](/docs/dialect/values), so the sentence is true every time the page opens.

## `quote`

A quote is one row: what was said, then who said it.

```quote
Give your business a memory. | The BrainDog site
```

~~~code | As written
```quote
Give your business a memory. | The BrainDog site
```
~~~

A quote takes no tone, and a second row is refused, because a quote is one thing somebody said.
