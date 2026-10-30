# What a key can do

A token is how something that is not a person reaches your BrainDog: an agent, a script, a server, a machine. Each kind reaches exactly one thing, and all of them are shown to you once and kept only as a fingerprint.

## Agent tokens

An agent token has a scope (read, propose or write), a name, and a life of one day to a year, ninety days unless you say. It carries the person who made it, and reaches the smaller of its scope and that person's levels, list by list, on every call.

Make one in the app, or from a terminal:

```code | sh
braindog token create --name "Weekly report script" --scope propose --days 30
```

The command asks you to approve that one mint in the app with six digits, then prints the token once. It looks like `<record id>.<secret>`: the first part tells the host which BrainDog to look in, and BrainDog keeps only the secret's SHA-256, so nothing, this product included, can show you a token again. Lost is lost; make another and revoke the first.

The app lists every token with its scope, whose it is and when it was last used, never the token itself, and revokes one at a press. A colleague in your BrainDog can make keys for their own agents, capped by their own levels, and sees and revokes only those.

A token stops working when it is revoked, when it runs out, when its person is removed or suspended, or when the operator ends every token made before a moment, which is how a host answers a leak.

## Reaches beyond the scope

A token can be given one more reach when it is made. So far there is one: `inbox`, which lets an owner's token over the whole of a BrainDog read the inbox and file from it. [The inbox reach](/docs/agents/inbox) explains it.

## Every kind of credential

```comparison | What each one reaches
Credential | How it is made | What it reaches
Agent token | In the app, or braindog token create | The reads and everyday writes, at its scope
Connected app | An MCP client's sign-in, allowed on the consent screen | The same as an agent token at the scope you chose, for ninety days
Machine sign-in | braindog login or setup, six digits approved in the app | Write, for ninety days, kept in the machine's hosts file
Keychain access | braindog login --keychain, six digits approved in the app | Opening the keys of one project, and nothing else
Operation grant | Six digits approved in the app, for one export, import or token | That one operation, once, within ten minutes
Report key | In the app, for one list | Adding rows to that list, and nothing else
Runner | braindog runner enrol, six digits approved in the app | Claiming, reporting on and stopping the jobs you approved
Shared link | Sharing a page from the app | Reading that one page
Door address | Minted for a webhook door in the app | Sending arrivals to that one door
```

Each is sent as `Authorization: Bearer <token>`, except a shared link, which is `Authorization: Share <token>`, and a door address, which is the address itself.

## Keeping one safe

- Put a token in an environment variable or your secret store, never in a file you commit.
- Give each script its own token, so revoking one stops one thing.
- Use the lowest scope that does the job. A report key is the right one for a project that only sends numbers.
- A token that has leaked: revoke it in the app. The next call it makes is refused.

## Set up a machine

```code | sh
curl -fsSL https://brain.dog/cli/install.sh | sh
braindog setup https://app.brain.dog/<slug>
```
