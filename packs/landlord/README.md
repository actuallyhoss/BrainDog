# Landlord

## What a landlord asks every Monday

Written before the plugin, from the side of somebody who rents out six flats and keeps the rest of their life
elsewhere. These are the questions, in the order they come up over a first coffee.

1. **What rent is due this month, and how much has come in so far?** The whole of it, across every flat.
2. **Who has not paid yet?** The tenancies where nothing has arrived this month, by name, so I know whom to text.
3. **Is anybody late, and by how many days?** Rent falls on a day of the month that differs by tenant, so "not paid"
   on the 3rd is not late for someone whose rent falls on the 15th.
4. **What does each flat bring in, and what came in for it this month?** One line per property, not one number for
   the lot.
5. **Which tenancy ends next, and am I early enough to renew it or find someone new?** Two months' warning is about
   right for notice and viewings.
6. **Is anything empty?** A flat with nobody in it is the most expensive thing I own.
7. **What repairs are still open, where, and what have repairs cost me this year?**
8. **What do I hold in deposits?** The sum I owe back if every tenancy ended today.
9. **How much does each tenant owe me, all told?** Everything due since they moved in, less everything they paid.
10. **What did the flats make this month once repairs are paid?** Rent in, less repairs out.
11. **Which of the payments in my bank were rent, and for which flat?**

## What the plugin adds

- **Four lists.** Properties (a name, an address, a kind and a note); Tenancies (the property, the tenant from People,
  the monthly rent, the day of the month it falls, the start and end days, the deposit and a state); Rent received
  (the tenancy, the amount and the day); Repairs (the property, what it is, the cost, the day it was reported and the
  day it was done). A payment against a tenancy is in the tenancy's currency when it is written with none.
- **A reminder 60 days before every tenancy ends**, armed on the end day the moment it is written.
- **Lettings**, a page in the rail: the month's rent due and received, what is empty, what is open, who has not paid,
  which tenancies end next, and every property as a card. Each property has a page of its own under **Properties** in
  the rail, with its rent due, its tenancies, who has not paid there this month, and its repairs.
- **Eight figures over the four lists**, and two more read a property at a time (its rent due and its open repairs).
- No script, nothing that runs at night, no example rows. It needs People, because a tenant is a person.

## The answers

| Question | Answered by |
| --- | --- |
| 1 | Lettings opens with it, and the tiles say it: **Rent due this month** (the rent roll, the monthly rent of every live tenancy or one under notice) and **Received this month** (rent received since the 1st). |
| 2 | **Not paid this month** on Lettings: every tenancy in force that no payment since the 1st points at. Each property's page has the same list for that property. |
| 3 | Not answered. See below. |
| 4 | Half. Each property's page says its rent due. What came in for it does not. See below. |
| 5 | **Ending next** on Lettings, soonest first, and the reminder 60 days before each end. |
| 6 | **Empty**: properties no live tenancy or one under notice points at. |
| 7 | **Open repairs** and **Repairs this year** on Lettings, and each property's repairs on its own page. |
| 8 | **Deposits held**, over every tenancy in force. |
| 9 | Not answered. See below. |
| 10 | Not answered. See below. |
| 11 | Not answered. See below. |

## What it cannot answer yet

Each is a Monday question the grammar could not say, and the list, field or figure that was missing.

- **The card of each property cannot say its own rent due, its rent received or its next tenancy to end** (questions
  4 and 5, on the card). A card draws the fields of its own row, one figure as a trend over weeks or months, and the
  first open step from a list of steps. A figure per card as a plain number (`{ metric: 'rent-due-at:{{name}}' }` as a
  fact) is refused: only a trend may name a figure. The next tenancy to end could be drawn as a step only if
  Tenancies said its rows are steps of a property, done by a yes-or-no field, and a tenancy's state is a word with four
  values, not a yes or no. So the cards say where each property is and what it is, and the page around them says the
  money and the dates. Missing: a card fact that reads a figure filled from its row.
- **What came in for one property this month** (question 4). A payment points at a tenancy and the tenancy points at
  the property. A filter may ask what points at a row (`pointed`), but not follow a link forward and then another
  (`via` is refused: "this build reads one register at a time"). So "rent received where the tenancy's property is
  Elm Court" cannot be said. Missing: a forward hop through a link in `where:`.
- **Who is late, and by how many days** (question 3). The rent falls on a day of the month, and lateness is that day
  compared with today. A filter compares a field with a fixed day or a day word (`today`, `bom`), never a field with
  a day made from today's month and another field. Missing: a day built from a field (`bom + rent_day`) in `where:`.
- **What each tenant owes, all told** (question 9). That is the monthly rent times the months since the start, less
  the sum of what that tenancy received. A figure adds, counts or multiplies by a fixed table; it does not count months
  between two days, and it does not take one list's sum away from another's. Missing: a figure over two lists, and a
  count of months between two days.
- **Rent in less repairs out** (question 10). The same: two figures over two lists, one taken from the other. A page
  can show them side by side, which it does, but not the difference. Missing: a figure that is the difference of two
  figures.
- **Which bank payments were rent, and for which flat** (question 11). The unit asked for an optional Property link on
  Money's ledger and on what repeats, laid with `extends` and waiting until Money is there. `extends` sits on the
  plugin's manifest, outside the parts that may wait (`holdingParts` in `packages/declare/src/when.ts` reads
  declarations only), and a list the record lacks leaves the plan unresolved. So it is not laid, and Landlord does not
  ask for Money. Missing: an `extends` that waits on `when: { holds }`.
- Smaller: **rent that is not monthly** (weekly or quarterly) has no field of its own, so the rent roll reads every
  rent as a month's. **Repairs this year** counts a repair by the day it was reported, not the day it was paid.
