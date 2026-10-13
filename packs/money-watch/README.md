# Money watch

Reads the Ledger and asks once about what it notices. It needs Money.

- **Charged twice.** The same payee, amount and account within two days: "Talabat E£979.99 twice on 7 Oct. Both
  real?" "Both real" changes nothing. "One is a mistake" marks the newer of the two void.
- **Looks like it repeats.** Three payments to one payee about a month apart, within a tenth of each other: "Add
  Netflix to Repeating, E£219 around the 12th?" Yes writes the monthly line.

Each flag has its own switch in the add-on's settings, and both start on. A flag answered no three times in a row
switches itself off and says so in one line on the Money watch page; change that line to "Switched on again" and it
starts over.

How it is built: a script's answer can only change a line that exists, so each thing noticed is first a line in the
add-on's own list, Money watch. A new line starts the script again to ask about it, and the answer written on the line
starts it once more to act. `twice.js` and `repeats.js` are the scripts; the add-on file carries each as its `source`,
and the test holds the two to be the same text.
