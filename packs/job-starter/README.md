# Starter jobs

Kinds of job a record can run on its owner's own machine, through `braindog runner`. Installing the plugin asks
the owner in Decide, and each kind runs only once the install is accepted and the machine has allowed it
(`braindog runner allow job.week-in-review`).

- **Review my week** (`job.week-in-review`) reads the last seven days through the record's own tools and proposes one
  note on the week. It works in an empty folder.
- **Sort what arrived** (`job.inbox-triage`) reads what waits in the inbox and proposes where each message goes. It
  files nothing itself.
- **Where this repository stands** (`job.repo-status`) reads a repository's history and changes and proposes the next
  step. It works in the folder the machine maps to the name `project`:
  `braindog runner repos add project <folder>`.

Those kinds ask nothing while they run (`dontAsk`), use only the tools they name, change no file, and end by
proposing: the owner decides. None of them can skip its permissions, because the record refuses a kind that would.

Two more carry a request the owner sends from any row ("Send to…", Claude on a machine):

- **Claude on your machine, reading** (`job.claude`) takes the request through the record's own `instructions` tool,
  reads the rows sent with it and the folder it works in, proposes what should change, and replies on the request.
- **Claude on your machine, changing files** (`job.claude-change`) does the same and may change files in that folder
  (`acceptEdits`), and only there. It never commits, pushes or deletes a file.

Each works in the folder the request names, which the machine maps (`braindog runner repos add <name> <folder>`), or in
an empty folder of its own when the request names none. Money, keys, sharing and deleting stay proposals.
