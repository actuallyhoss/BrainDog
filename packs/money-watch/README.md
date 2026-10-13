# Money watch

Reads the Ledger and asks once about what it notices. It needs Money.

- **Charged twice.** The same payee, amount and account within two days: "Talabat E£979.99 twice on 7 Oct. Both
  real?" "Both real" changes nothing. "One is a mistake" marks the newer of the two void, as the entry stands on the
  day you answer. "Both real" is remembered for about ninety days: a pair of that payee, account and amount inside
  them is not asked about, and one after them is asked about once more. A mistake is remembered for its own pair only,
  and a different amount or account is asked about.
- **Looks like it repeats.** Three payments to one payee about a month apart, within a tenth of each other: "Add
  Netflix to Repeating, E£219 around the 12th?" Yes writes the monthly line, next due a month after the newest
  payment the Ledger holds that day.

Each flag has its own switch in the add-on's settings, and both start on. Charged twice stops asking about a payee
whose last three answers were "Both real", and goes on watching everyone else. Looks like it repeats switches itself
off after three "No" in a row. Either says so in one line on the Money watch page; change that line to "Switched on
again" and it starts over.

How it is built: a script's answer can only change a line that exists, so each thing noticed is first a line in the
add-on's own list, Money watch. A new line starts the script again to ask about it, and the answer written on the line
starts it once more to act: mark the mistake void, or add the Repeating line. `twice.js` and `repeats.js` are the scripts; the add-on file carries each as its `source`,
and the test holds the two to be the same text.

1.1.0 changed three things. The answer "One is a mistake" no longer carries a change to the Ledger entry read on the
day of the question, which was refused once the entry had been edited; the run the answer starts marks it void. Next
on a new Repeating line is counted from the newest payment on the day of the answer. And the line Charged twice
writes when it switches itself off says both charges were real three times in a row, where it said "three no's".
Also in 1.1.0: "Both real" is remembered for the payee, account and amount for about
ninety days, where it was remembered only within two days of the pair. And three of "Both real" in a row are counted
a payee at a time, so they switch Charged twice off for that payee alone, where three answers about three payees
switched it off for everyone. A line written by the earlier count names no payee and still holds for the whole flag
until it is changed to "Switched on again".
1.2.0 reads the shop where 1.1.0 read the card. A bank line that leads with the card and the terminal, such as
`HSBC CARD 7731 POS 55 KFC`, was read up to the card's number, so every shop paid with that card was the one payee
"Hsbc Card": KFC and Carrefour at the same amount were asked about as one charge made twice, and the three in a row
counted the card. Both scripts now cut the card (`HSBC CARD 7731`, `CARD XX7731`) and the terminal (`POS 55`) before
they read the name, so each shop is its own payee. A one digit number after POS is left, since it may be the shop's
own (7 Eleven), and a card that was bought (`GIFT CARD 1234`) is left as written. A line already in Money watch under
a card's name stays as it is and matches no shop: "Both real" said about it quiets nothing, and a shop is asked about
once more.
1.3.0 keeps a short number that is part of a shop's name. The name stopped at the first word holding a digit, so
`Studio 54 Cafe` read "Studio": two shops that start alike were one payee, and a question could name the wrong shop.
A word now ends the name only when it holds three digits or more (a branch, a day, a reference), so `Studio 54 Cafe`
is its own payee and `CHILLOUT 0418 CAIRO` is still Chillout. A card number written in groups (`CARD 1234 5678
NETFLIX`, or masked, `CARD XXXX XXXX XXXX 7731`) is cut whole, where the second group led the name as "5678 Netflix".
A line already in Money watch under the shorter name stays as it is and matches no shop: "Both real" said about
Studio quiets nothing about Studio 54 Cafe, which is asked about once more. A branch number of one or two digits
(`KFC 12 CAIRO`) now stays in the name with the words after it, so two branches are two payees.
After an edit to a script, copy its text into the matching `source` in `money-watch.pack.json`.
