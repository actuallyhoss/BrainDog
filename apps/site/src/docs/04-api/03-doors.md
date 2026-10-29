# Webhooks and mail-in addresses

A door is how something outside gets into your record without being an agent: a service that calls a webhook, a bank text or receipt you forward by mail, or a project that reports its own numbers. Each door writes, and none of them can read anything back.

## Webhook doors

A webhook door is declared on the record like a list or a page: which list it writes to, how its payload is read, and how a sender proves who it is. `braindog:grammar/ingest` gives the declaration with one that installs, and the app's doors screen lists every door the record declares.

A door is checked in one of two ways:

```comparison | How a door knows its sender
Check | How it works | Address
A token in the address | The app mints a random token for the door and shows the whole address once. Minting again replaces it | /in/webhook/<record id>/<door>/<token>
A signature | The sender signs the body with a shared key kept in your Keychain: an HMAC-SHA256 under a header the door names, GitHub's X-Hub-Signature-256, or Stripe's own signature | /in/webhook/<record id>/<door>
```

```code | sh
curl -s -X POST "https://brain.dog/in/webhook/<record id>/<door>/<token>" -H "content-type: application/json" -d '{"amount": 1200, "currency": "USD", "from": "Northwind"}'
```

## What a sender is told

Nothing. Every payload that is stored is answered 202 with an empty body, so somebody holding an address cannot tell whether it matched a pattern or count what they wrote. Only four things are refused before a payload is stored: an address nobody serves, a door nobody declared, a sender over the door's budget (429 with `Retry-After`), and a body over the limit.

## An arrival nobody vouched for is kept, never trusted

A payload with a wrong or missing token or signature is still stored, so you can see in the inbox that something tried. It stays untriaged, and no rule ever files it. A door that declares no check, or one whose key is missing, is treated the same way: reachable, and trusted by nothing.

```comparison | Limits on a door
Door | The most one arrival may be
Webhook | One megabyte
Forwarded mail | Five megabytes
```

## Forwarded mail

Your record has its own address to forward mail to, which the app gives you. A message names no door, so it is matched against every door the record declares. Mail counts as checked only when the checks on who forwarded it pass; anything else is stored and left in the inbox for you.

## Report keys

A report key lets a project send rows to one list and do nothing else. It cannot read lists, figures or people, so it is safe in a CI job or on a server. You make one in the app for one list, and may fix up to eight fields it always carries, which the project cannot change. A key can also name a field it stamps with the time a row arrived, whenever the row leaves that field empty.

```code | sh
curl -s -X POST https://brain.dog/api/report -H "Authorization: Bearer $REPORT_KEY" -H "content-type: application/json" -d '{"rows": [{"metric": "signups", "value": 42}, {"metric": "trials", "value": 9}]}'
```

The body is `{"rows": [...]}`, or one row's fields on their own. The rows go in together or not at all, each signed by the key, so History says which project sent it.

```comparison | Limits on a report key
Limit | What happens past it
100 rows a call | The whole batch is refused, never half written
256 KB a call, as the JSON of its rows | The whole batch is refused
600 rows a minute | Refused with 429 and the seconds to wait
```

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://app.brain.dog/<slug>
```
