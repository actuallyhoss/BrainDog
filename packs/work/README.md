# Work

Tasks, the threads of work they belong to, and how each thread is going. Every record runs on these, so the build
still puts them in by itself; this file is the same thing written so anybody can read it and share it.

- **The lists.** A task is what needs doing, its status, the day it is due, who holds it and which agent took it, and
  what it is part of. A thread is a line of work you are in the middle of, with six states and the moves between them,
  and the day it aims for. An update is what was true about a thread on a day, who said so and how it was going.
- **The pages.** Work opens with one line on what is late and what waits on you, and a box to type what needs doing.
  Under it: what is late, this week, what an agent holds and what waits on you; then, folded, after this week, no due
  day and later; then what was done lately. Board is the same tasks by their status, with everything open in one
  table under it.
- **What it does by itself.** A task marked done closes the steps under it that are still open, and leaves one in
  review or dropped as it is. A new step under a task starts where its parent is: the parent's project, thread and
  owner, each one it left empty, and its agent when that agent made the step. Both are the two script files beside
  this one, `close-follow-ups.js` and `start-with-parent.js`, and they read and write tasks and nothing else.
- **Projects and People.** Which project a task or a thread is for, the filter by project at the top of Work, and the
  nine figures asked of one project are there once the record has Projects. Who owns a task, and handing a task to a
  person by its owner, are there once it has People. Without either, Work goes in on its own and those parts wait.
- **Not quite the build's yet.** On a record without Projects, a task's and a thread's phone line still name the
  project, and Work keeps an empty list of filters. Neither draws anything.

The build still compiles the same lists, pages, figures, rules and scripts in as a module
(`packages/seed/src/modules/work.ts`). `work.test.ts` holds this file equal to it, part for part, on a record with
Projects and People, with one of them, and with neither, says the two things above out loud, and is deleted the day the
module is.
