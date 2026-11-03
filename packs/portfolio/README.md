# Projects

What you are building, and the plan for each. Every record that runs things starts with it, and it is written here as
a file anybody can read, the same as any other plugin.

- **The list.** A project is its name, one line about it, its status (building, earning, parked or closed), what it
  earned in a year and the year before, how it is going, its next step, how far along it is, the day it aims for and
  the agent on it, with a note, its repositories, folders and domains. Only the name and the status must be said, and
  a project others point at is not deleted out from under them. A project can also say what kind it is: a business,
  client work, a product or content, and whether its plan is kept as its stages alone or as a roadmap alone.
- **Stages.** The stages a project goes through, in order, each with the line that says when it is done. Its page
  draws them as its road, the done ones marked and the next one said.
- **Numbers and key numbers.** Numbers holds the readings a project reports, one measure at one moment. Each project's
  key numbers say what it is judged by, where each one's values come from, which way is good, a target and by when,
  and how often a new value should arrive. Numbers came from the founder setup, which still adds who a reading is
  from and which service it is about.
- **The page.** Projects opens with how they are going, then each project in play as a card. Under it, folded where
  they can be: what each one earns, what an agent holds and what is coming up, then what is parked and closed.
- **The figures.** Twenty-five. Twenty-two are over the projects: how many are in play, need you, are on track, have an
  agent, aim within thirty days or are past the day they aimed for, what they earned this year and the year before, how
  many say so, and which shape a project's plan is kept in. One is over the stages, how many a project has. Two are over the numbers: how many key numbers are kept, and how long since a measure was read.
- **What it does by itself.** A project past the day it aimed for asks once whether to move the day or park it.
- **Work.** The line on each card of the work finished on it each week is Work's, and it is there once the record has
  Work. Without it Projects goes in on its own and that line waits.

The build still compiles the same lists, page, figures and rule in as a module (`packages/seed/src/modules/portfolio.ts`).
`portfolio.test.ts` holds this file equal to it, part for part, on a record with Work and without it, and is deleted
the day the module is. Two things still live only in the seed: the project page, drawn for one project at a time,
which is `projectTemplate` and `crossPack` and in no plugin yet; and the choice of which neighbours Projects is cut on,
which the module makes and this file writes as one `when:`. Domains stays on the list as the module has it until it
moves to a plugin of its own.
