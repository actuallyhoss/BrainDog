# Dates

The days somebody else fixed: a filing deadline, a renewal, a fair that runs four days. Not work you chose to do,
which is a task.

- **The list.** A date is what it is and its day. Give it a last day and it is a window. Its kind is a deadline or an
  event, and a record adds kinds of its own. The day is a deadline, so the record reminds a week and a day before.
- **Repeating.** Each date says whether it comes round: every week, month or year, or on the first or the last day of
  each month. Once a day `roll.js` moves a repeating date whose last day has passed on to its next turn, a window by
  its whole length. Each move is an update, so a date's history holds every turn it has had.
- **The page.** A calendar of this month and the next two, the windows open or coming, and what is coming.

Two things it does not do yet, both waiting on the shell. The windows are a table and not a time strip, because
`lanes` reads instants and looks back from now. And today is the UTC day, because a script cannot yet ask for the
record's local day.
