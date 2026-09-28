# Charts

The chart kinds compare amounts: bars against each other, the parts of one whole, a figure walked from where it started to where it ended, money in and out by month, a measure over time, and how busy each day was.

## `bar`

A row is a label, a value and a note. Every bar is drawn on one scale, the largest value's.

```bar | Where the money went
Rent | GBP 1,200.00 | the flat
Food | GBP 410.00
Transport | GBP 95.00
Uncategorised | GBP 640.00 | 14 rows | hole
```

~~~code | As written
```bar | Where the money went
Rent | GBP 1,200.00 | the flat
Food | GBP 410.00
Transport | GBP 95.00
Uncategorised | GBP 640.00 | 14 rows | hole
```
~~~

A row whose tone is `hole` is a task rather than a value: what nobody has sorted yet. It sits last, outside the scale, so an unknown can never make every real bar a stub. On a record the hole is the button that opens those rows to sort them.

## `split`

One track cut into parts, with a legend. A row is a label, a value and a note, and a `hole` row sits after the parts as it does on a bar.

```split | Where the week went
Client work | 22 | hours
Admin | 9 | hours
Learning | 5 | hours
```

~~~code | As written
```split | Where the week went
Client work | 22 | hours
Admin | 9 | hours
Learning | 5 | hours
```
~~~

## `bridge`

From the first row to the last, the rows between moving it. A row is a label, an amount signed with `+` or `-`, and a note. When the rows between do not add up to the last, the block says so under the chart rather than drawing a figure that is wrong.

```bridge | This month
Start | GBP 9,000.00
Coming in | +GBP 2,000.00 | 5 invoices
Going out | -GBP 1,600.00 | rent and tools
End of month | GBP 9,400.00
```

~~~code | As written
```bridge | This month
Start | GBP 9,000.00
Coming in | +GBP 2,000.00 | 5 invoices
Going out | -GBP 1,600.00 | rent and tools
End of month | GBP 9,400.00
```
~~~

## `series`

Money in and out over time. The first row is a header naming each column, with `in:` before the column drawn above a zero line and `out:` before the one drawn below it. Each row after it is one month, week or day, and a last cell of `partial` marks a period still running.

```series | Money in and out
Month | in: Money in | out: Money out | state
July | GBP 7,650.00 | GBP 3,060.00
August | GBP 7,900.00 | GBP 3,090.00
September | GBP 8,420.00 | GBP 3,115.00 | partial
```

~~~code | As written
```series | Money in and out
Month | in: Money in | out: Money out | state
July | GBP 7,650.00 | GBP 3,060.00
August | GBP 7,900.00 | GBP 3,090.00
September | GBP 8,420.00 | GBP 3,115.00 | partial
```
~~~

## `series net`

The `net` form adds a line of what was left each period, in less out.

```series net | What was left
Month | in: Money in | out: Money out | state
July | GBP 7,650.00 | GBP 3,060.00
August | GBP 7,900.00 | GBP 3,090.00
September | GBP 8,420.00 | GBP 3,115.00 | partial
```

~~~code | As written
```series net | What was left
Month | in: Money in | out: Money out | state
July | GBP 7,650.00 | GBP 3,060.00
August | GBP 7,900.00 | GBP 3,090.00
September | GBP 8,420.00 | GBP 3,115.00 | partial
```
~~~

## `lines`

A measure over time as a line. The header names the time column and the measure, and a column headed `was:` is the period before, drawn as a quiet dashed line. The block leads with the last figure and its change.

```lines | Revenue
Day | Revenue | was: The 30 days before
1 Sep | GBP 4,000.00 | GBP 3,600.00
8 Sep | GBP 4,300.00 | GBP 3,650.00
15 Sep | GBP 4,100.00 | GBP 3,900.00
22 Sep | GBP 4,650.00 | GBP 3,850.00
```

~~~code | As written
```lines | Revenue
Day | Revenue | was: The 30 days before
1 Sep | GBP 4,000.00 | GBP 3,600.00
8 Sep | GBP 4,300.00 | GBP 3,650.00
15 Sep | GBP 4,100.00 | GBP 3,900.00
22 Sep | GBP 4,650.00 | GBP 3,850.00
```
~~~

An empty cell is a gap in the line, never a zero.

## `heat`

Twelve weeks by weekday, ending on this week, each day washed by how busy it was. A row is a day and a value, the value one when it is left off, and rows on one day are added together.

```heat | Days worked on the book
2026-08-10 | 2
2026-08-24 | 3
2026-09-02 | 1
2026-09-09 | 4
2026-09-16 | 2
2026-09-23 | 5
2026-09-25
```

~~~code | As written
```heat | Days worked on the book
2026-08-10 | 2
2026-08-24 | 3
2026-09-02 | 1
2026-09-09 | 4
2026-09-16 | 2
2026-09-23 | 5
2026-09-25
```
~~~

A day nobody wrote is a gap and never a zero, and a heat takes no tone, because the wash is the reading.
