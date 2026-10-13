# Money watch

Reads the Ledger and asks once about what it notices. It needs Money.

- **Charged twice.** The same payee, amount and account within two days: "Talabat E£979.99 twice on 7 Oct. Both
  real?" "Both real" changes nothing. "One is a mistake" marks the newer of the two void, as the entry stands on the
  day you answer.
- **Looks like it repeats.** Three payments to one payee about a month apart, within a tenth of each other: "Add
  Netflix to Repeating, E£219 around the 12th?" Yes writes the monthly line, next due a month after the newest
  payment the Ledger holds that day.

Each flag has its own switch in the add-on's settings, and both start on. A flag whose last three answers changed
nothing ("Both real", or "No") switches itself off and says so in one line on the Money watch page; change that line
to "Switched on again" and it starts over.

How it is built: a script's answer can only change a line that exists, so each thing noticed is first a line in the
add-on's own list, Money watch. A new line starts the script again to ask about it, and the answer written on the line
starts it once more to act: mark the mistake void, or add the Repeating line. `twice.js` and `repeats.js` are the scripts; the add-on file carries each as its `source`,
and the test holds the two to be the same text.

1.1.0 changed three things. The answer "One is a mistake" no longer carries a change to the Ledger entry read on the
day of the question, which was refused once the entry had been edited; the run the answer starts marks it void. Next
on a new Repeating line is counted from the newest payment on the day of the answer. And the line Charged twice
writes when it switches itself off says both charges were real three times in a row, where it said "three no's".
After an edit to a script, copy its text into the matching `source` in `money-watch.pack.json`.
