# Photographer

A plugin for somebody who photographs weddings, families and small businesses. It is a file and nothing else: three
lists, three pages and six figures, on top of People, with no script and nothing in BrainDog's own code.

## What a photographer asks every Monday

Written before the file, as a photographer would say it on a Monday morning with a coffee and the week ahead.

1. What am I shooting next, and where?
2. How many shoots have I got booked this month?
3. How much am I still owed, and by whom?
4. What do I still owe my clients, and is any of it late?
5. Which enquiries are waiting on me?
6. How many days until my next shoot?
7. How long has my oldest enquiry been waiting for an answer?
8. Has this client paid the deposit, or only the full fee?
9. What did I earn this month, counted by the day the money came in?
10. Is any of my gear about to fall out of its cover?
11. Am I about to book two weddings on the same day?

## What the plugin adds

**Lists.**

- **Shoots**: the shoot's name, the client (a person on People), the day, the place, the fee as money, what has been
  paid so far (a deposit, or the whole fee), and a status
  that moves from Enquiry to Booked, Shot, Delivered and Paid. A status moves only one step on, or one step back
  (Booked back to Enquiry, Delivered back to Shot, Paid back to Delivered), so an enquiry is never marked paid by a slip.
- **Deliverables**: what a shoot still owes the client (the sneak peek, the edited set, the album), which shoot it is
  for, the day it is due, and the day it was sent. A reminder goes three days before it is due and on the day.
- **Gear**: the item, what it cost as money, and the day its cover ends, with a reminder a month before and on the day.

**Pages.**

- **Shoots**: one sentence on the month, the line to add an enquiry, the month's three figures, and a board with a lane
  for each status in the order a shoot moves through them.
- **Due**: every deliverable still to send, soonest first, and the gear whose cover ends in the next 90 days.
- **A page for each shoot**, named by the shoot: who it is for, the day, the place, the fee and its status, what it still
  owes, and its notes.

**Figures.** Booked this month (shoots past enquiry whose day falls this month), Fees not yet paid (the fees of shoots
booked, shot or delivered, less what has been paid on them), Next shoot (the soonest booked day from today), Still to send, Late to send, and Shoots not yet paid.

## The Monday questions, answered

| Question | Answered by |
| --- | --- |
| 1. What am I shooting next, and where? | Next shoot on the Shoots page, and the shoot's own page for the place. |
| 2. How many booked this month? | Booked this month. |
| 3. How much am I still owed, and by whom? | Fees not yet paid, and the Booked, Shot and Delivered lanes say whose. |
| 4. What do I owe clients, and is any late? | The Due page, and Late to send. |
| 5. Which enquiries are waiting? | The Enquiry lane of the board. |
| 6. How many days until my next shoot? | Not yet, see below. Next shoot says the day instead. |
| 7. How long has the oldest enquiry waited? | Not yet, see below. |
| 8. Deposit or full fee? | Paid so far on the shoot's own page, and Fees not yet paid takes deposits off. |
| 9. Earned this month, by the day it came in? | Not yet, see below. |
| 10. Is gear about to fall out of cover? | The Due page, and the reminder a month before. |
| 11. Two weddings on one day? | Not yet, see below. |

## What it cannot answer yet

Each question the grammar could not say, and what was missing.

- **6. How many days until my next shoot.** A figure can say the day of the next shoot (`min` over the day), and it can
  count days back from a day (`age`), but `age` reads the newest day and stops at nought, so a day still to come is
  always nought days old. Missing: a figure that counts whole days forward from today to a day, or `age` read forward.
- **7. How long the oldest enquiry has waited.** `age` reads the newest day in a field, never the oldest, so it says how
  long since the latest enquiry came in. Missing: an `age` over the oldest day (`age` with `min`), so a figure can say
  how long the longest wait is.
- **8, in part. What is still owed on each shoot, shown on the board.** The total is said (`diff` of the fees and what
  was paid), but a board or a table can only show fields a row holds, and the balance of one shoot is a field less
  another. Missing: a column worked out from two of the row's money fields in the same currency.
- **9. Earned this month, by the day the money came in.** The status says a shoot is paid, and no figure can read the
  day a status changed to a value. This version keeps no day the fee was paid, so the only month it can count by is the
  shoot's. Missing: a figure over the day a row last moved into a state, or a rule with no script that writes the day
  into a field when the status moves (a later version can add a `Paid on` day and ask for it on the move to Paid).
- **11. Two weddings on one day.** A field can be `unique` across every row, which would refuse an enquiry on a day
  already booked as well as a second booking. Missing: uniqueness among the rows a sentence picks (`unique` with a
  `where`, such as "status is not enquiry").

And one limit that is not a question: Fees not yet paid adds fees, and two currencies are never added, so a
photographer who quotes in two currencies sees the figure refused until the fees are in one.

## Its test

`photographer.test.ts` builds a fresh record with People as BrainDog ships it, installs this file exactly as it ships,
and writes a month of invented work through the record's API: eight shoots across the five statuses, ten deliverables
and four pieces of gear. It holds the board's lanes, each figure's number, the reminders on a deliverable and on a
cover's end, a status move the list does not allow, each page drawn with nothing refused, and a record without People,
which is refused with "Install people first".

```
node --test packs/photographer/photographer.test.ts
```
