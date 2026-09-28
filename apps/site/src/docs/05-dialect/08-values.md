# Live values

A page never types a figure the record already holds. It names the figure between double braces, and the record answers with what it is now, every time the page is drawn.

## A live figure

`{{path}}` asks the record for a value as the page is drawn. On a declared page, a path may name:

- a figure the record keeps, by its id, as `{{due-30d}}`, money drawn as money;
- a field of one row, by the row's id and the field, as `{{tasks#125.state}}`;
- how many rows a list holds, as `{{blockers.count}}`;
- how many rows of a list are in one state, as `{{tasks.open}}`, where `open` is one of the list's states.

~~~code | As written
```note lead
{{due-30d}} falls due in the next 30 days, and {{tasks.open}} tasks are open.
```
~~~

Live figures are read in a block's heading, its body, its empty sentence, its written cells and a column's label. A field is read only when the list declares it as a figure: a document, a note, a secret, a link to another row and a list are not figures, so a page cannot pour a paragraph into a sentence.

## When there is no value

A path whose value is missing draws a dash: never a blank, never the word undefined, and never a zero, because something that earned nothing and something nobody measured are different facts. A path that names nothing at all is drawn as the path itself, marked, so the author can see which one to fix.

## Typed values

A typed value is a form, a colon and an argument. The argument is a literal when it starts with a digit or a minus sign, and a path when it starts with a letter, so `{{ago:tasks#3.due}}` reads the day from the row.

```spec | Typed values, drawn
Money | {{money:129900 GBP}} | minor units, then the currency code
Quantity | {{quantity:3.5 kg}} | a number and its unit
Share | {{pct:12.5}} | a percentage
A day | {{date:2026-10-16}} | the day, and how far away it is
Since | {{ago:2026-09-14}} | how long ago
```

~~~code | As written
```spec | Typed values, drawn
Money | {{money:129900 GBP}} | minor units, then the currency code
Quantity | {{quantity:3.5 kg}} | a number and its unit
Share | {{pct:12.5}} | a percentage
A day | {{date:2026-10-16}} | the day, and how far away it is
Since | {{ago:2026-09-14}} | how long ago
```
~~~

The forms are `date`, `day`, `until`, `ago`, `money`, `quantity`, `pct` and `ref`. Money is written in minor units with an upper-case code, so `129900 GBP` is GBP 1,299.00. On a record a `date` links to that day on the calendar, and `{{ref:tasks#241}}` draws the row's short id as a link to the row. An argument that does not read, such as a currency code in lower case, is drawn as the author's text, marked, rather than quietly corrected.

## Glyphs

`{{icon:rocket}}` puts a glyph in the text, drawn in the text's own colour and kept on the same line as the word after it. A name the glyph set does not hold is drawn as the author's text, marked.

## Evidence

A figure somebody typed, rather than one the record reads, can say how it is known. The tag goes after the figure, in single braces.

```spec | The market, as far as we know
Players a day | about 2,700 {verified: the survey in August} | counted once
Per server | 0.04 {estimate} | from the survey
Next year | {unknown} | nobody has measured it
```

~~~code | As written
```spec | The market, as far as we know
Players a day | about 2,700 {verified: the survey in August} | counted once
Per server | 0.04 {estimate} | from the survey
Next year | {unknown} | nobody has measured it
```
~~~

The tags are `verified`, `inferred`, `estimate` and `unknown`, each with an optional source after a colon. `{unknown}` is a hole, drawn as the gap somebody has to close. The difference that matters: `{verified: path}` says somebody checked the figure against that path once, and `{{path}}` says go and read it now. A live figure needs no tag, because its path is where it came from.

## On a page made for each row

A page declared with `for:` is a template, one page for each row of a list. Inside it, `{{field}}` fills from that row's own fields, and `{{spoken}}` is the row's own id, which a block uses to name the row it reads, as `row: '{{spoken}}'`.
