# Figures

The figure kinds say a number and what it means: a row of headline figures, a goal and how far along it is, a budget and how much is left, or a small trend beside the number it ends at.

## `stat`

A row is a label, a figure, a note and a trend, the trend a run of numbers and optional. A row may end with a tone, and a stat holds a handful of rows: past its limit the block is refused rather than squeezed.

```stat | This week
Open tasks | 14 | 3 due tomorrow | 22 19 17 14
Done | 9 | 2 more than last week | good
Waiting on others | 4 | the oldest for 6 days | warn
```

~~~code | As written
```stat | This week
Open tasks | 14 | 3 due tomorrow | 22 19 17 14
Done | 9 | 2 more than last week | good
Waiting on others | 4 | the oldest for 6 days | warn
```
~~~

A fourth cell that holds no number is refused, because it is a note written in the trend's column.

## `stat lead`

The `lead` form draws the first figure as the page's one hero figure, larger than the rest.

```stat lead | Cash
Cash now | GBP 42,300.00 | across 3 accounts
Runway | 14 months | at this month's costs
```

~~~code | As written
```stat lead | Cash
Cash now | GBP 42,300.00 | across 3 accounts
Runway | 14 months | at this month's costs
```
~~~

## `gauge`

One row: a label, a value and the most it can be. The track fills to the value's share of the target.

```gauge | Storage
Files | 640 | 1000
```

~~~code | As written
```gauge | Storage
Files | 640 | 1000
```
~~~

## `ring`

One row is progress toward a target, drawn as a small dial with the figure in its centre. A value written as `3/5` or `60%` needs no target. Two to five rows are the parts of a whole, the third cell then a note.

```ring | This quarter
Paying customers | 12 | 15
```

```ring | Where the week went
Client work | 22 | hours
Admin | 9 | hours
Learning | 5 | hours
```

~~~code | As written
```ring | This quarter
Paying customers | 12 | 15
```

```ring | Where the week went
Client work | 22 | hours
Admin | 9 | hours
Learning | 5 | hours
```
~~~

A ring stops at five parts, because a sixth arc is a sliver nobody can find. A value that does not read draws the words and no dial, since an empty dial reads as zero.

## `progress`

A row is a label, a value, a target and a note, the note optional. Each row is one track filled toward its target.

```progress | Goals
Chapters written | 7 | 12 | the draft is due in November
Savings | GBP 3,400.00 | GBP 5,000.00
```

~~~code | As written
```progress | Goals
Chapters written | 7 | 12 | the draft is due in November
Savings | GBP 3,400.00 | GBP 5,000.00
```
~~~

## `progress budget`

The `budget` form reads the target as a limit, where filling it is not the aim. A row is marked from nine tenths of its limit, and the part past the limit is drawn as the overspend.

```progress budget | September's budget
Food | GBP 380.00 | GBP 400.00
Transport | GBP 95.00 | GBP 150.00
Fun | GBP 240.00 | GBP 200.00 | a concert
```

~~~code | As written
```progress budget | September's budget
Food | GBP 380.00 | GBP 400.00
Transport | GBP 95.00 | GBP 150.00
Fun | GBP 240.00 | GBP 200.00 | a concert
```
~~~

## `progress range`

The `range` form reads the same cells as a label, what was spent, the low and the high. Each row is a band on one scale for the whole block, with what was spent marked on it, and the block adds the total line itself, so a total can never disagree with the rows above it.

```progress range | The launch budget
Printing | GBP 150.00 | GBP 100.00 | GBP 200.00
Site |  | GBP 300.00 | GBP 400.00
Photos | GBP 90.00 | GBP 80.00 | GBP 120.00
```

~~~code | As written
```progress range | The launch budget
Printing | GBP 150.00 | GBP 100.00 | GBP 200.00
Site |  | GBP 300.00 | GBP 400.00
Photos | GBP 90.00 | GBP 80.00 | GBP 120.00
```
~~~

## `sparkline`

A row is a label, a run of numbers and the figure the run ends at. An `x` in the run is a gap.

```sparkline | Weekly
Visitors | 180 210 x 260 240 310 | 310
Sign-ups | 4 6 5 9 8 12 | 12 | good
```

~~~code | As written
```sparkline | Weekly
Visitors | 180 210 x 260 240 310 | 310
Sign-ups | 4 6 5 9 8 12 | 12 | good
```
~~~

## `chips`

A run of pills. A row is a glyph name, a number and a word, and a row without both the number and the word is left out, because a glyph alone is a riddle and a colour alone is unreadable to some readers.

```chips | Where things stand
check | 6 | shipped | good
clock | 2 | waiting | warn
alert | 1 | blocked | bad
```

~~~code | As written
```chips | Where things stand
check | 6 | shipped | good
clock | 2 | waiting | warn
alert | 1 | blocked | bad
```
~~~

A glyph name the set does not hold draws no glyph and never moves the number or the word.
