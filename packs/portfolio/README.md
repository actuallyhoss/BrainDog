# Projects

What you are building, and the plan for each. Every record that runs things starts with it, and it is written here as
a file anybody can read, the same as any other add-on.

- **The list.** A project is its name, one line about it, its status (building, earning, parked or finished), what it
  earned in a year and the year before, how it is going, its next step, how far along it is, the day it aims for and
  the agent on it, with a note, its repositories, folders and domains. Only the name and the status must be said, and
  a project others point at is not deleted out from under them.
- **The page.** Projects opens with how they are going, then each project in play as a card. Under it, folded where
  they can be: what each one earns, what an agent holds and what is coming up, then what is parked and finished.
- **The figures.** Eighteen, each over the projects: how many are in play, need you, are on track, have an agent, aim
  within thirty days or are past the day they aimed for, what they earned this year and the year before, and how many
  say so.
- **What it does by itself.** A project past the day it aimed for asks once whether to move the day or park it.
- **Work.** The line on each card of the work finished on it each week is Work's, and it is there once the record has
  Work. Without it Projects goes in on its own and that line waits.

The build still compiles the same list, page, figures and rule in as a module (`packages/seed/src/modules/portfolio.ts`).
`portfolio.test.ts` holds this file equal to it, part for part, on a record with Work and without it, and is deleted
the day the module is. Two things still live only in the seed: the project page, drawn for one project at a time,
which is `projectTemplate` and `crossPack` and in no add-on yet; and the choice of which neighbours Projects is cut on,
which the module makes and this file writes as one `when:`. Domains stays on the list as the module has it until it
moves to an add-on of its own.
