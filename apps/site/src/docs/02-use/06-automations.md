# Automations

An automation starts on a change, an arrival, a clock, a figure, a decision or a button, and then does its steps in order. You draw it on a canvas, send it to Needs you, and it runs once you accept it.

## Everything that runs by itself

**Automations** in the sidebar is one place for everything your record does on its own, in five tabs:

```comparison | The five tabs
Tab | What it lists
Automations | What you and your agents drew: a trigger, then steps
Scheduled | Actions that fetch from, call or watch a web address on a clock, and write what they get to a list
Scripts | Your scripts, with their logs, versions and what each may read, write and fetch
Doors | The web addresses your record takes things in at
Runs | Every run of an automation, a scheduled action or a script, newest first, with what it said
```

Each row says what it is and where it stands: when it last ran, when it runs next, or why it is paused.

## Make one

```steps
Press New automation | A new canvas opens. Give it a name | On the Automations tab
Choose what starts it | A change, an arrival, a clock, a figure, a decision or a button | Under Starts
Narrow it if you need to | Only when a condition holds, such as a field's value | Under Only when
Add steps | Pick each from the step menu, in the order they should happen | Under Steps
Send to Needs you | It runs once it is accepted there | At the foot of the canvas
```

## Say it as a sentence

On the Automations tab, **Say it as a sentence** takes one line, such as "When a bill is due in 3 days, tell me". Press **Read it** and BrainDog shows what it understood, in parts you can press to change, with the steps in order. Drag a step, or press Alt with the up and down arrows, to move it. It also shows what the automation would have done over the last 30 days of your rows. Nothing runs from a sentence alone: **Keep it** files the same change the canvas does, and it runs once accepted. A reminder step puts its line on Today.

## What starts it

```comparison | Triggers
Starts on | When it runs
A change | A row in one list is added, changed or deleted
An arrival | Something arrives at a door: a webhook, an email, a paste
A clock | On a clock, every fifteen minutes or longer
A figure | A figure crosses a line. Figures are read every hour
A decision | A question in Needs you is answered, with any answer or one you name
A button | Only when somebody presses Run now
```

A clock can say what to do when a turn is reached late: run it however late, or skip it when it is more than a set time late. A skipped turn is kept in the runs with the reason.

## Steps

The step menu groups what a step can do:

- **Check**: If, Remember a value, Stop here.
- **Change**: Add a tag, Take a tag off, Set a field, Move to a state, Link to a row, Add a note, Add rows.
- **Ask**: Tell you, Suggest in Needs you, Ask a person, and Ask Slash.
- **Call out**: Call a service, Run a call on this row, Run a script.
- **Wait**: Wait, Come back later.

**If** takes one of two ways, **If so** and **If not**, and then carries on with the steps after it either way. A step you want only on one way goes inside that branch. Branches go three deep at most.

Drag a step to move it, or use Move up, Move down, Move into the branch and Move out of the branch from its menu. Undo takes back the last change on the canvas.

## Before it can be sent

The canvas checks the automation as you draw it. Anything that holds it back is said on the card it is about, and **Send to Needs you** waits until each is put right. If you change nothing, there is nothing to send.

Some automations run inside the change that starts them, and some run after it, one step at a time. The canvas says which, and says so again if an edit would move it from one to the other.

## Runs

Each run is listed with its state: waiting to start, running, waiting, done, failed or stopped. Open one to see what each step did and said. A run still going can be stopped. An automation that starts on a button has **Run now** once it is saved.

## Scheduled actions

A scheduled action fetches from, calls or watches a web address on a clock, and files what it gets in your record. It says when it last ran and when it runs next. When something goes wrong it says what, in a way you can act on:

- the other service did not answer, and it tries again on its own;
- the service turned the key away, and it is paused until you reconnect the key;
- the key is not in the Keychain, and it is paused until you add it;
- the record has used its allowance for the month, and it waits for next month.

Press **Resume** on a paused action to run it again.

## Automations and your plan

Runs of automations, scheduled actions and scripts count against the month's runs, and requests and data fetched from other services count too. [Usage and limits](/docs/use/usage) shows each against your plan.

## Agents can draw them too

An agent you connect can propose an automation, and it arrives in Needs you like anything else. Accepting it is yours.
