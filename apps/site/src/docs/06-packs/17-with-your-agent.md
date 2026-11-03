# Build one with your agent

When BrainDog does not do something you want, the quickest way to an add-on is to ask the agent you already work with. It looks in the store first, writes an add-on when nothing fits, checks it against your BrainDog, and asks you before anything is installed. You never edit a file unless you want to.

This works with any agent connected to your BrainDog over MCP. Everything it does here goes through the one `act` tool, so connecting it is all the setup there is.

## What to say

Say what you want BrainDog to do, in your own words:

```code | To your agent
BrainDog has no way to track films I want to watch. Make me an add-on for it.
```

In clients that show MCP prompts, such as Claude Code, it is also a slash command: the `addon` prompt, Build an add-on. It takes what you want in a few words and walks the agent through the steps below.

## The four calls

An agent reaches the store and the add-on maker through `act`, each call named and given its arguments.

```spec | What the agent calls
addons | searches the store | a few words, and every word must match; with nothing found it names the nearest and says how to build one
addon | reads one listing | who made it, how far it was checked, what it asks for of yours, its versions, and with file true the file itself
addonNew | starts an add-on | an id, a title and the fields you want; it hands back a file that installs as it is: a list, a page and a Today card
addonCheck | checks a file against your BrainDog | each refusal with what to change, or Ready with what installing would add and ask you to approve
```

Then `installPack` with the file puts it to you. It installs nothing on its own.

What an add-on file may hold, and every rule a check holds it to, is in `braindog:grammar/pack`, which the agent reads as an MCP resource (or with `act arrangement {grammar: "pack"}` where its client reads no resources). That grammar is the reference an agent works from, and this page does not repeat it.

## The loop

1. **Look first.** The agent searches the store with `addons`. If something fits, it reads it with `addon` and asks you to install that one instead of making a new one.

2. **Start a file.** With nothing to fit, `addonNew` gives it a starter for what you described, which it changes to do what you asked.

3. **Check until ready.** `addonCheck` runs the same checks an install runs and writes nothing. The agent fixes each refusal it names and checks again, until it says Ready and lists what installing would add.

4. **Ask you.** `installPack` with the file files a question on Needs you, such as "Add Watch list?". Nothing is installed until you answer.

5. **Change it later.** The agent reads the file back with `addon {id, file: true}`, edits it, raises its version, checks it and asks you again. The update keeps every row you wrote.

A list of yours the add-on reads without naming it in `uses` is refused, and so is anything in the file that looks like a key. A refusal says what to change:

```code | What a refusal says
Not yet: This add-on uses register.transactions without asking. Name every place of yours it reads or changes in uses, so a person sees it before installing: "uses": ["register.transactions"].
```

## What you see

The question on Needs you shows the plan the record worked out from the file, not what the agent says about it: every list and page it adds, every list of yours it reads or changes, every outside address it would call and how often, and every key it would use, by its name. You approve it or throw it away, and an approved one is installed in one step or not at all.

If you turned on **Let your agents do everything without asking** in Settings › Agents, your own agents install what they make without the question. Each install still names the agent, and you can remove the add-on in Settings › Add-ons.

Once it is in, the add-on is labelled Made in this BrainDog in your add-ons, and its pages, lists and Today card are where any add-on's would be. It lives only in your BrainDog.

## What an agent cannot do with an add-on

- Take the id of an add-on in the store. A file that names one is refused at the check and again when it asks.
- Reach anything the file does not declare. Every list of yours, every outside address and every key is named in the file and shown to you before you approve.
- Put a key's value in the file. A script names a key by its label, and the value stays in your Keychain.
- Publish it as you. To share it, ask for the file and send it in as [Publishing and review](/docs/packs/publishing) says, where a person looks at it before it is listed.

## Where to go next

- [Add-ons](/docs/packs/overview): what an add-on is, and what installing shows you.
- [What a pack can and cannot do](/docs/packs/limits): the whole list.
- [When an add-on will not install](/docs/packs/refusals): each refusal a check can meet.
