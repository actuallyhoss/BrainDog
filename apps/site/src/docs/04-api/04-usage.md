# Usage and limits

What a caller of the API or of MCP is held to: a budget per minute that stops a loop, a size for each request, and the ceilings on each read. None of them depends on your plan. What your plan counts is the work your record does on its own.

## Per minute

```comparison | Budgets per caller
Budget | How much | Counted for
Reads | 600 a minute | Each token, or each person signed in to the app
Writes | 120 a minute | Each token, or each person signed in to the app
Report rows | 600 a minute | Each report key
```

A webhook door has a budget of its own, and a sender past it is answered 429 with the seconds to wait. Reads and writes are separate budgets, so a burst of writes never starves reads. Two tokens on one record have a budget each, so a script that loops cannot lock you out of your own app.

An MCP call counts as a read, whichever tool it calls, because the host counts it before it opens the request. What the tool may do is still decided by the token's scope.

Past a budget, the answer is 429:

```code | json
{"ok": false, "refusal": {"code": "RATE_LIMITED", "fix": "Too many requests just now. Try again in 60 seconds.", "retry_after": 60}}
```

The same number is in the `Retry-After` header. Wait that long and send the same request; nothing else needs to change. The window is a fixed minute, so a caller can see up to twice the budget go through across the moment one minute ends and the next begins.

## Per request

```comparison | Sizes
What | The most
An API request body | One megabyte
A record put back from a file | Sixteen megabytes
An MCP message | One megabyte
A report key's call | 100 rows, and 256 KB of rows
A webhook arrival | One megabyte
A forwarded message | Five megabytes
A note on a row | 280 characters
```

## Per read

```comparison | Ceilings on a read
Read | Default | The most
list | 20 rows | 500 rows
search | 20 rows | 100 rows
activity | 50 changes | 200 changes
```

A long text field in a `list` answer is cut at 280 characters, and the row says it was. Name the field in `fields` to have it whole, or read the row with `get`.

## What your plan counts

Your plan's monthly allowance is spent by the work your record does by itself: the scheduled actions and scripts that fetch from other services, counted as runs, requests, data fetched and running time. Your own calls to the API and to MCP are not counted against it. Trying a draft script with `scriptTry` is the one call that is, as a run, because it fetches for real.

Past the allowance, an action waits for the first of next month, and failures are never held against it.

## Seeing where you stand

- `whoami` says who you are here and which verbs you reach.
- The app's list of tokens shows when each was last used.
- `usedBy` says which sessions used a key or a tool, the most recent first.
- `actions` and `scripts` say this month's runs for each scheduled action and script.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://app.brain.dog/<slug>
```
