# Welcome to BrainDog

BrainDog keeps everything you keep track of in one place, arranged around you. You and your AI agents keep it up to date, and every change says who made it.

## What your BrainDog holds

Your BrainDog is yours alone, with its own database. It holds lists of the things you track (bills, clients, tasks, subscriptions, whatever your life or work runs on), the pages you look at them through, and the history of every change: who made it, whether that was you, a colleague, an agent or a rule. Any change can be undone.

You can export all of it as one file whenever you want, and if you leave, you take it with you.

## Pages you actually check

A page is made of blocks: figures, charts, boards, calendars and tables, each reading from your lists. You can drag them around yourself, or tell Slash what you want to see.

Every page is written in a small text format called the dialect: Markdown, with fenced blocks for the figures. This page is written in it too, so the blocks below are drawn by the same renderer your BrainDog uses, and "Open as text" above shows the words that drew them.

```comparison | Who changes your BrainDog
Who | How they reach it | What they can do
You | The app, in a browser | Read and change anything you can see
Slash | Press ⌘J (Ctrl+J off a Mac) | Answer questions with your figures and make the changes you ask for, with an undo
Your agents | MCP, signed in with your yes | Read and write what you allowed, and act when you tell them to. Money and keys wait for your yes unless you let them do everything
```

## Slash

Slash is built into BrainDog. Press ⌘J, or Ctrl+J off a Mac, and ask. Ask what you owe this month and it answers with the bills. Ask it to add a task and it does, with an undo. Anything with money, keys, sharing or deletes waits for your yes. Press / to find a page, a person or anything else by name.

## Your agents

<!-- launch: codex -->
Claude, Codex, Cursor and anything else that speaks MCP can read and write your BrainDog once you allow it. When an agent wants to change something, you get a question first, unless you let your own agents act without asking, and its name stays on the change either way. Agents and scripts use your API keys without ever seeing them.
<!-- /launch -->
<!-- launch: !codex -->
Claude, Cursor and anything else that speaks MCP can read and write your BrainDog once you allow it. When an agent wants to change something, you get a question first, unless you let your own agents act without asking, and its name stays on the change either way. Agents and scripts use your API keys without ever seeing them.
<!-- /launch -->

## Things that arrive on their own

Forward bank texts and receipts by email, point a webhook at your BrainDog, or connect Stripe or Mercury. After three of the same kind, Slash suggests how to file them. Say yes, and the rest go in on their own, without using credits.

## Your first hour

```steps
Make your BrainDog | Answer a few short questions, and it is made around you | On the sign-up page
Bring in what you keep | Import a bank statement or your contacts, forward an email, or connect Stripe or Mercury | On Money, on People, or in the inbox
Connect an agent | Paste the MCP address, or run one command | From your agent
Ask Slash for a page | Press ⌘J and say what you want to see | On any page
```

## Where to go next

- [Making your BrainDog](/docs/use/first-run): the short conversation, the link, and your first Today.
- [How agents connect](/agents): the MCP address, and what an agent can do once it is in.
- The rest of these docs, from the list of sections beside this page.
