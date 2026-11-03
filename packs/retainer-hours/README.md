# Agency

## What an agency lead asks every Monday

Written first, before the plugin, by somebody who runs a small agency of four people on monthly retainers.

1. Which clients have used up their hours this month, and which are over?
2. Which client is furthest over?
3. Of the hours we worked this month, how many did we bill?
4. Who is billing the least of their time?
5. What do the retainers bring in a month?
6. Whose retainer renews soon?
7. What did everyone do last week?
8. Who has not logged their hours?
9. What are we really earning an hour on each client?

## What the plugin adds

It asks for People, since a client is one of People's organisations and a timesheet is one of People's people. Nothing
in BrainDog's core knows about it: it is this one file.

- **Retainers.** A client from People's organisations, the fee a month as money, the hours it buys a month, the day it
  renews and whether it is live, paused or ended. The renewal day is a deadline, so the record reminds a month before, a
  week before and on the day.
- **Timesheets.** A person from People, the retainer the hours are on, the day, the hours and whether they are billable.
  Once the record keeps Projects, a timesheet can say its project too. It is never asked for, and without Projects the
  field waits.
- **Clients**, the page. It opens with what the live retainers bring in a month and how much of this month's hours were
  billed. Under it, each live retainer's hours used since the first of the month set against the hours it bought, then
  every retainer with its client, fee and renewal day.
- **Timesheets**, the page. The last seven days of hours, how many hours and how many people, and this month's billed
  hours by person.
- **A page for each retainer**, with its hours used this month and the month's timesheets on it.

The answers, question by question:

1. Clients, under "Hours used this month": each retainer's hours used against its hours bought.
2. Not as one answer. See below.
3. The figure "Hours billed of hours worked this month", on the Clients page.
4. In part: hours worked and hours billed this month by person are two figures, and the second is drawn on Timesheets.
5. The figure "Retainer income a month", the live fees added up. Fees in two currencies are kept apart, never added.
6. Clients, "Every retainer", soonest renewal first, and the reminders before each renewal day.
7. Timesheets: the last seven days, with how many hours and how many people.
8. Not as one answer. See below.
9. Not at all. See below.

## What it cannot answer yet

Each Monday question the grammar could not say, and what was missing.

- **Which client is furthest over (2).** The Clients page sets each retainer's hours against its own hours bought, so
  each one over can be seen. But no figure takes a field of one list (hours bought) away from a sum over another
  (hours used) row by row and keeps the largest, so there is no one number, no line on Home and nothing to warn on.
- **Who is billing the least of their time (4).** A ratio is not read in parts in this build (`a ratio is not grouped
  in this build`), so the share for each person is two figures to set side by side and not one.
- **Who has not logged their hours (8).** A figure counts the people who did log hours this week. Naming the people in
  People with no timesheet in the week needs a sentence over one list that reads another, and the grammar has none.
- **What we earn an hour on each client (9).** A fee on a retainer divided by the hours its timesheets add up to is a
  figure per row over two lists, which the grammar cannot say. A progress block sets hours against hours only.
- **Billed over worked (3), written round two limits.** It is answered, but not plainly. A ratio's two halves read the
  same rows, so "billed" cannot be its own sentence; it is each row's hours times a table that gives billable 100 and
  not billable 0, over the hours times 100. The 100 is there because a product rounds each row to a whole number, and
  a quarter of an hour would be lost.
