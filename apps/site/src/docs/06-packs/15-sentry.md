# Sentry

The Sentry add-on reads what is breaking in your apps from Sentry every hour and keeps it beside your projects: each project's open errors, the new ones, how many error events there were in a day and how many people they hit. It only reads. Nothing is ever sent to Sentry.

## What it adds

- **Sentry projects**, a list of the projects in your Sentry organization, each linked to a project of yours. A new Sentry project is linked to the project whose name its words are, with the part it names taken off, so `crumb-bot`, `bake-health` and `crumb-site` all go to Crumb.gg and `marlow-site` to Marlow & Co ("& Co", "Ltd" and the like do not count). One that only looks like a project of yours is not linked: it waits on the Errors page under Looks like one of yours for you to pick. Change a link on the row and it stays as you set it.
- **Sentry issues**, every open issue: what broke, where, how many times, how many people it hit, when it was last seen and a link to it on Sentry. An issue Sentry no longer lists as open is marked closed, never deleted.
- **Four numbers a project** in Numbers: Open errors, New errors in a day, Error events in a day and People hit in a day. They chart like any other feed, and a number is written when it moves and at least once a day.
- An **Errors** page with what is worth a look, every open issue and your Sentry projects; an **Errors** tile on each linked project's page; and two widgets for Today, Errors and Errors worth a look.

## When it tells you

An issue that is new and high priority, comes back after it was resolved, or is happening a lot more than usual rings the bell once, with the project, the error and how many people it hit. Inside your quiet hours nothing sounds. If it has hit at least as many people as the add-on's setting says (20 to start), it also waits for you in Needs you, with the link to it on Sentry. An issue that calms down and turns again later rings again.

## Connect it

1. In Sentry, open Settings, then Developer Settings, then Custom Integrations, and press Create New Integration. Choose Internal Integration and call it BrainDog. Under Permissions, set Project to Read, Issue & Event to Read and Organization to Read. Save, and copy the token shown on the integration's page.
2. Put the token in your keys as Sentry token. From a terminal, `braindog keys put "Sentry token" --opens us.sentry.io` reads it from standard input; or paste it where Install asks for it.
3. Install Sentry from Add-ons and set Organization to the part of your Sentry address before `.sentry.io`. Leave Region at `us.sentry.io` unless your organization is kept in the EU.
4. Within the hour, open Errors and check each Sentry project points at the right project of yours.

If you cannot make an integration, a Personal Token works too: User Settings, then Personal Tokens, with the scopes `org:read`, `project:read` and `event:read`. An Organization Token does not work, because it can only make releases.

## What your agents see

The issues are an ordinary list, `sentry_issues`, so an agent asked "what's breaking in Bake" lists the open ones whose project is Crumb.gg and gets each issue's title, how many people it hit and its link. The numbers are in `datapoints`, tagged `sentry`.

## How much it asks Sentry

One request for your projects, one for the day's counts, and one for each project's open issues, at most fifteen projects an hour, linked ones first. Fifty open issues a project are read each hour, newest first.
