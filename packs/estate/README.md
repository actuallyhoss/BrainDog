# Services

Domains, hosting, subscriptions, memberships, insurance and bills: what each costs to keep, and when it renews. Not
everybody keeps these, so it is a plugin and not part of what every record starts with.

- **The list.** A service is its name, its type, who it is with, what it costs and how often, the day it renews, its
  status and what it points at. Only the name, the type, how often and the status must be said: a price or a renewal
  day nobody has looked up yet is left blank, and a blank day reminds nobody. The renewal day is a deadline, so the
  record reminds a month before, a week before and on the day.
- **The page.** Renewals opens with what it costs a month to keep everything running, every yearly price at a twelfth.
  Under it: anything still paid for that points at nothing, each service that is lapsing by name, the month by type, the next ninety days, and what each domain points at and every service, folded shut.
- **What it does by itself.** A service still marked live after its renewal day is marked lapsing, once. Two weeks
  before a live service with a price renews, the record asks whether to keep it, and the answer keeps or cancels it.
- **The five lines you can set.** Most a month, most a year, most renewing in 30 days, most lapsing at once, and most a
  year on one project. Each starts empty, so no figure is judged until you say the line you mean.
- **Projects.** Which project a service is for, and what one project costs a year, are there once the record has
  Projects. Without Projects, Services goes in on its own and those two parts wait.

The build still compiles the same list, page, figures and rules in as a module (`packages/seed/src/modules/estate.ts`).
`estate.test.ts` holds this file equal to it, part for part, on a record with Projects and on one without, and is
deleted the day the module is.
