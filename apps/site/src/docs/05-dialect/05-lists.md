# Lists and tables

The list kinds lay out facts to be read down a column: labelled values, settings, a comparison with real columns, and links worth keeping.

## `spec`

The workhorse. A row is a label, a value and a note, one fact to a line.

```spec | The flat
Rent | GBP 1,200.00 a month | paid on the 1st
Deposit | GBP 1,800.00 | held by the scheme
Lease ends | 30 Jun 2027 | notice by the end of April
```

~~~code | As written
```spec | The flat
Rent | GBP 1,200.00 a month | paid on the 1st
Deposit | GBP 1,800.00 | held by the scheme
Lease ends | 30 Jun 2027 | notice by the end of April
```
~~~

## `params`

The same row as a `spec`, for the settings something runs with rather than facts about a thing.

```params | The nightly copy
Time | 03:20 | in UTC
Kept | 30 copies | the oldest goes first
Where | beside the record | in its snapshots folder
```

~~~code | As written
```params | The nightly copy
Time | 03:20 | in UTC
Kept | 30 copies | the oldest goes first
Where | beside the record | in its snapshots folder
```
~~~

## `comparison`

A table with real columns. The first row is the header and fixes how many columns every row has. Use it for choices side by side.

```comparison | Cloud and Cloud Plus
Meter | Cloud | Cloud Plus
Runs a month | 15,000 | 75,000
Requests a month | 150,000 | 750,000
Data fetched a month | 1 GB | 5 GB
```

~~~code | As written
```comparison | Cloud and Cloud Plus
Meter | Cloud | Cloud Plus
Runs a month | 15,000 | 75,000
Requests a month | 150,000 | 750,000
Data fetched a month | 1 GB | 5 GB
```
~~~

A comparison is authored rows. The `table` kind, which reads the rows of a list, belongs on a [declared page](/docs/dialect/pages); written in a fence it is shown as written, with a sentence saying to use a comparison.

## `link`

A row is a title, an address and a note, the note optional. The address is an `https:` address, a `mailto:` address or a path on the same site, and anything else refuses the block. The host is drawn under the title, and nothing is fetched to draw it: no icon and no preview.

```link | Worth keeping
Slash | /slash | asking your record
How agents connect | /agents
A note to yourself | mailto:you@example.com | opens your mail
```

~~~code | As written
```link | Worth keeping
Slash | /slash | asking your record
How agents connect | /agents
A note to yourself | mailto:you@example.com | opens your mail
```
~~~
