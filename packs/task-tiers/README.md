# Task tiers

Four numbers on a task, each from 0 to 25, and the record works out its priority and says why.

- **Brings money**, **Unblocks other work**, **Has a clock on it**, **Cheap to do**: all optional, laid on Work's tasks.
- When a task is filed with any of them, or one changes, `tier.js` adds them. Under 40 is Low, 40 to 59 Normal, 60 to
  79 High, 80 and over Urgent.
- It writes Priority and Why this tier in one update: "Money 20, unblocks 15, clock 25, cheap 5: 65 of 100." Words a
  person wrote in the reason are kept after that line.
- A task with none of the four is left alone, so a priority somebody typed stands.

It needs Work 1.19.0 or later. `tier.js` is the file to read and edit; the pack file carries the same text as the
script's `source`, and the test holds the two equal.
