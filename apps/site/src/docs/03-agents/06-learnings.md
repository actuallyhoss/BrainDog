# Learnings and skills

A learning is something one session found out that would otherwise trip up the next. A skill is a written method an agent reaches for when a task calls for it. Both live in your record, so what one agent learns on Monday is there for every agent after it.

## Recording a learning

A learning is a row in Learnings, written with `create`. Most sessions record none: it is worth writing only when a future session would otherwise get something wrong, and it says what went wrong in `because`.

```comparison | A learning's fields
Field | What it holds
lesson | The lesson, in 12 to 400 characters
because | The failure that taught it, in 24 to 600 characters
kind | method, for how to do something, or fact, for something that is so
project | Where it applies. Left empty, it applies everywhere
topic | The skill or topic it bears on
supersedes | The learning it replaces
confirmed_on | The last day somebody found it still true
```

```code | text
create {"register": "learnings", "fields": {"lesson": "Run the migrations before the seed, never after.", "because": "Seeding first wrote rows the next migration refused, and the build stopped halfway.", "kind": "method"}}
```

The briefing hands each session the learnings for its project and the ones that apply everywhere. A learning neither made nor confirmed in the last ninety days fades out of the briefing, and the briefing counts how many did, so an old lesson is looked at again rather than trusted forever.

## Skills

A skill has a name, a line saying when to use it, and its text. It can belong to one project or apply everywhere; where both exist, the one nearer the work wins.

An agent reads one at `braindog:skill/{name}`, and the briefing lists the ones that apply. A skill's text and its version change only through Needs you: an agent that wants to improve one proposes the new text, and you accept it or not. Which learnings led to it can be named on the skill, so its reasons travel with it.

## Skills on your machine

```code | sh
braindog skills sync
```

`skills sync` writes the record's skills into the folders Claude Code reads them from, and `braindog setup` runs it for you. It never overwrites a change made on the machine: a file edited since the last sync is kept, and its new text is proposed to you as the skill's next version. A skill file you wrote by hand, found in those folders, is added to the record. A file written into a repository is reported, never committed. `--dry-run` says what it would do and writes nothing.

What a sync wrote is kept in `skills-lock.json` in the `.braindog` folder in your home folder, which is how it tells your edits from its own.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://brain.dog/app/<slug>
```
