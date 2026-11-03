# Sentry

What is breaking in your apps, read from Sentry every hour. Reads only: nothing is ever sent to Sentry.

- **Sentry projects**: each project in your Sentry organization, the project of yours it belongs to, and its open
  errors, new ones in a day, error events in a day and people hit in a day. A new Sentry project is linked to the
  project of yours whose name its words are, its part (`-site`, `-bot`, `-health`, `-api`, `-web`) taken off and "& Co",
  "Ltd" and punctuation ignored: `crumb-bot` goes to Crumb.gg, `marlow-site` to Marlow & Co. One that only looks alike
  is suggested on the Errors page, never linked. Change the link on the row and it stays yours.
- **Sentry issues**: every open issue, with how often it happened, how many people it hit, when it was last seen and a
  link to it on Sentry. Agents read it like any list, so "what's breaking in Bake" is a list of `sentry_issues` where
  the project is Crumb.gg.
- **Numbers**: Open errors, New errors in a day, Error events in a day and People hit in a day for each of your
  projects, tagged `sentry`, so they chart like any other feed.
- **Errors** page, an **Errors** tile on each linked project's page, and two Today widgets.
- An issue that is new and high priority, comes back after being resolved, or is escalating rings the bell once it has
  hit at least one person (held in your quiet hours). It rings once a burst: not again for the same issue until it has
  gone a day with no event or was resolved and came back. One that has hit at least as many people as the setting says
  also waits in Needs you.

## Connect it

1. In Sentry, go to Settings, Developer Settings, Custom Integrations, and press Create New Integration. Pick
   Internal Integration. Name it BrainDog, and under Permissions set Project to Read, Issue & Event to Read and
   Organization to Read. Save, and copy the token it shows on the integration's page.
   If you cannot make an integration, a Personal Token works too: User Settings, Personal Tokens, with the scopes
   `org:read`, `project:read` and `event:read`. An Organization Token does not work: it can only make releases.
2. Put the token in your keys under the name Sentry token, opening your region's host:
   `braindog keys put "Sentry token" --opens us.sentry.io` (it reads the token from standard input), or paste it where
   Install asks for it.
3. Install the plugin and set Organization to the part of your Sentry address before `.sentry.io`. Region is
   `us.sentry.io` unless your organization is kept in the EU (`de.sentry.io`).
4. Within the hour, open Errors. Check that each Sentry project points at the right project of yours under Your
   project, and pick one where it does not.

`sentry.js` is the script, the same text as the pack file's `source`.
