# Plans and work

The plan kinds draw work: tasks to tick, steps in order, a path with the next step marked, dated events, a board of lanes, tasks on a time axis, and months of dates.

## `todo`

A row starts with `[ ]` or `[x]`, then a title, a detail, and up to two short facts, which are drawn together as one quiet line under the title.

```todo | This week
[ ] Send the Northwind invoice | GBP 1,200.00 | due Fri 2 Oct | changed by you
[x] Renew the domain | done on Monday
[ ] Book the printer | for the launch
```

~~~code | As written
```todo | This week
[ ] Send the Northwind invoice | GBP 1,200.00 | due Fri 2 Oct | changed by you
[x] Renew the domain | done on Monday
[ ] Book the printer | for the launch
```
~~~

On a record, a todo drawn over a list can be ticked from the page. Here it is drawn read only.

## `steps`

An ordered list, numbered. A row is a title, a detail and a note.

```steps | Setting up
Start a record | sign up, and it opens on Today | a minute
Bring in what you keep | forward an email, or connect a bank | ten minutes
Connect an agent | give it a key and the address | from your agent
```

~~~code | As written
```steps | Setting up
Start a record | sign up, and it opens on Today | a minute
Bring in what you keep | forward an email, or connect a bank | ten minutes
Connect an agent | give it a key and the address | from your agent
```
~~~

## `steps path`

The `path` form reads the third cell as a mark: `done`, `next`, or nothing for later. At most one step is next. A first row of `short | <name>` names a short view, and each step in it says `short` after its mark; a last row of `more | <n>` says how many open steps the short view left out.

```steps path | The launch
short | This week
Name the thing | chosen with the team | done short
Book the printer | the quote came in on Monday | next short
Write the page | two drafts so far | short
Send the first mail | to the waiting list |
more | 3
```

~~~code | As written
```steps path | The launch
short | This week
Name the thing | chosen with the team | done short
Book the printer | the quote came in on Monday | next short
Write the page | two drafts so far | short
Send the first mail | to the waiting list |
more | 3
```
~~~

A mark the path does not know, a second next, or a row after the count refuses the block, because a step drawn in the wrong place is worse than a step shown as written.

## `timeline`

Dated events. A row is a date, a title and a detail, and a tone.

```timeline | Arrived and filed
Mon 28 Sep | Receipt for hosting, GBP 42.00 | filed to Costs
Fri 25 Sep | Contract signed by Hollis and Park | filed to Customers | good
Thu 24 Sep | Card payment with no receipt | waiting for one | warn
```

~~~code | As written
```timeline | Arrived and filed
Mon 28 Sep | Receipt for hosting, GBP 42.00 | filed to Costs
Fri 25 Sep | Contract signed by Hollis and Park | filed to Customers | good
Thu 24 Sep | Card payment with no receipt | waiting for one | warn
```
~~~

## `board`

A grid of lanes. A row is a lane, a card and a detail.

```board | The launch
Doing | Write the page | Claude
Doing | Book the printer | you
Waiting | Photos | from the studio
Done | Name the thing | last week
```

~~~code | As written
```board | The launch
Doing | Write the page | Claude
Doing | Book the printer | you
Waiting | Photos | from the studio
Done | Name the thing | last week
```
~~~

On a record, a card on a board over a list can be dragged to another lane, or moved with its "Move to" menu under a finger.

## `roadmap`

Tasks on one time axis. A row is a task, the day it is due by, and its effort in days, the effort optional. A task with an effort is a bar ending on its due day; one without is a dated stem.

```roadmap | The launch
Write the page | 2026-10-05 | 4
Print the cards | 2026-10-09 | 2
Photos back | 2026-10-12 | 1
Launch day | 2026-10-16 | 1 | good
```

~~~code | As written
```roadmap | The launch
Write the page | 2026-10-05 | 4
Print the cards | 2026-10-09 | 2
Photos back | 2026-10-12 | 1
Launch day | 2026-10-16 | 1 | good
```
~~~

A day reads as `2026-10-05` or as `5 Oct 2026`. A row whose day or effort does not read is named under the drawing and never placed.

## `calendar`

Months of dates. A row is a title and a day, and a tone. Every month from the first row's to the last row's is drawn as a grid of weeks, Monday first, each day naming its first rows and counting the rest, then an agenda of every day that holds anything.

```calendar | October
Rent | 2026-10-01
Northwind invoice due | 2026-10-02 | warn
Launch day | 2026-10-16 | good
Dentist | 2026-10-16
Quarter's tax | 2026-10-31 | bad
```

~~~code | As written
```calendar | October
Rent | 2026-10-01
Northwind invoice due | 2026-10-02 | warn
Launch day | 2026-10-16 | good
Dentist | 2026-10-16
Quarter's tax | 2026-10-31 | bad
```
~~~

Nothing in a calendar is hidden behind a control, so the app, the read-only mirror of a page and a digest mail all draw the same months.
