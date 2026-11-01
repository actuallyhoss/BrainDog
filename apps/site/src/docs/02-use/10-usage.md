# Usage and limits

Your BrainDog includes a month of work: automation and script runs, requests to other services, data fetched, script time, and Slash questions. **Usage** shows where this month stands against each, and what happens when one runs out.

## What a plan includes

Each month, from the first of the month in UTC. Cloud and Cloud Plus are monthly plans, coming soon and priced at launch; nothing you make on Free is lost or locked when they arrive.

```comparison | A month's allowance, for each BrainDog
Meter | Free | Cloud | Cloud Plus
Slash questions | 20 | 80 | 400
AI tools connected | 3 | 15 | 75
Runs of automations, scheduled actions and scripts | 1,000 | 15,000 | 75,000
Requests to other services | 10,000 | 150,000 | 750,000
Data fetched from other services | 100 MB | 1 GB | 5 GB
Script time | 5 hours | 50 hours | 250 hours
```

Failures are counted and never limited. The owner sets Slash's limit in Settings, under Agents, and zero turns it off. See [Slash](/docs/use/slash).

## Reading the Usage page

Open **Usage** from the foot of the sidebar, or with See usage in Settings, under Billing. It shows one month at a time, this one first, with a way back to the months before it.

- **The plan and its meters**: each of the four against its allowance, with a thin bar and a sentence, and the one nearest its limit named.
- **What ran**: runs, requests, data and time, by project, with each project's actions under it and the ones that belong to no project under Everywhere. A project's page links straight to its own slice.
- **Runs by week**, as bars.
- **Slash**: your questions this month against the limit, the background work's own allowance apart, and your questions by day, each with what it cost and a link to what it filed.
- **Deliveries and arrivals**: notices BrainDog sent and things that reached its doors. They are counted here and never held by the monthly limit, because neither is work BrainDog chose to run.

## When a meter runs out

```steps
The meter reaches its allowance | Usage names the meter that ran out | On Usage
Scheduled work waits | Your scheduled actions say they are waiting until the month turns, and which meter held them | On Automations and Usage
The month turns | Everything that waited runs again on its own | On the first of the month, UTC
```

Nothing already in your BrainDog is touched while work waits. What you type still goes in, and what arrives at your doors is counted and never held by the limit, since neither is work BrainDog chose to run.

When Slash's questions run out, Slash says when they reset and offers two ways on: use your own key from a model provider, which that provider bills and Slash does not limit, or open Settings to change the limit.

## Limits that hold everywhere

These hold for every BrainDog:

```comparison | Other limits
What | Limit
Rows drawn on one list at a time | 2,000. Filter, or export, to reach the rest
An automation's clock | Every fifteen minutes or longer
Branches inside an automation | Three deep
A figure that starts an automation | Read every hour
A key for a script or server | Ninety days
An invitation link | Once, within 24 hours, for one address
A sign-in link | Once, within fifteen minutes
Wrong sign-in attempts | Ten, then sign-in waits fifteen minutes
Forwarding addresses for mail | One at a time
```

## When a payment does not go through

Billing belongs to the owner, in Settings under Billing. If a payment fails, Stripe tries again, and Billing asks you to update the card. A BrainDog that stays unpaid becomes read-only, and Billing says the day it will be deleted unless it is paid. Export is always available, whatever state it is in, so your rows are never held back from you. See [Export and deleting](/docs/use/export-and-delete).
