# Starter jobs

Three kinds of job a record can run on its owner's own machine, through `braindog runner`. Installing the add-on asks
the owner in Decide, and each kind runs only once the install is accepted and the machine has allowed it
(`braindog runner allow job.week-in-review`).

- **Review my week** (`job.week-in-review`) reads the last seven days through the record's own tools and proposes one
  note on the week. It works in an empty folder.
- **Sort what arrived** (`job.inbox-triage`) reads what waits in the inbox and proposes where each message goes. It
  files nothing itself.
- **Where this repository stands** (`job.repo-status`) reads a repository's history and changes and proposes the next
  step. It works in the folder the machine maps to the name `project`:
  `braindog runner repos add project <folder>`.

Every kind asks nothing while it runs (`dontAsk`), uses only the tools it names, changes no file, and ends by proposing:
the owner decides. None of them can skip its permissions, because the record refuses a kind that would.
