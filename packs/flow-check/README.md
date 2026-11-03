# Flow check

A plugin that proves automations work on a record that has never been used, so a broken trigger is a red test and not
a quiet night. It brings two lists, Checks and Notes, a door of its own and one figure, and these automations: one for
each way an automation can start (a check added, an arrival at the door, the clock every 15 minutes, the late checks
crossing their line, a decision in Decide, and Run now), each writing a note in Notes that says what started it; a
clock on the last day of each month; four rules on Checks whose order decides which one sets the ruling; a rule that
names a place before anybody has made it; two questions to a person, one that waits a quarter of an hour and one that
waits the usual seven days; two automations on Notes, one that follows what rules write and one that does not, over a
chain of five; and a note written after a value is set. `flow-check.test.ts` installs the file through the record's own
plan and install and reads back what each one did. The plugin is unlisted: it is installed by name, never offered.
