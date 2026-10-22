# Privacy Policy

Last updated: 2026-10-22

## The short version

- BrainDog keeps a record for you: your lists, pages, rules, files and history. We host it and run it. We don't sell it, show ads, or use it to train AI models.
- You sign in with a passkey, or a link we email you. There are no passwords.
- Every record is its own database, so what's in your record is never stored alongside another customer's.
- The keys you save for other services are sealed before they are stored.
- We can technically read a record's rows. We only look to support you, keep BrainDog safe or follow the law.
- You can export your whole record at any time, erase a person from it, delete it, and close your account.
- Deleted data is gone from our nightly backups 30 days after it leaves the live record. Copies an owner takes by hand are kept until newer ones replace them or the record is deleted.

## Who we are

BrainDog, at brain.dog, is run by Quartz Apps LLC.

We have two roles, and this policy covers both:

- **For your account and billing**, we decide how your information is used, so under UK and EU law we are its "controller".
- **For what's in a record**, the record's owner decides what goes in and who sees it. If the owner is a business, it is the controller and we are its "processor": we handle that information only to run BrainDog for it, under the [Data processing addendum](/legal/processing). If you're in someone else's record and have a question about what it holds, ask its owner first.

Write to us about privacy at **support@brain.dog**, with "Privacy" in the subject.

## What we collect, and why

### When you visit brain.dog

- **Connection details.** Our host, Cloudflare, receives your IP address and browser details to send you the page, as every website's host does. Technical logs of requests are kept for up to 7 days to fix faults and stop attacks.
- **No tracking.** The marketing site sets no cookies of its own and runs no ad or tracking scripts, and we don't use Cloudflare Web Analytics or any other analytics service. If you're signed in, the site reads the small signed-in marker (see "Cookies and storage") so it can show "Open BrainDog" in place of "Start free".
- **Counting visits.** When a page opens, it tells us which of our pages it is and the name of the site that linked to it, if any. We add one to that day's total for that page and that kind of place: no link, one of our own pages, one of a short list of sites such as search engines and AI assistants, or somewhere else. We keep only the daily totals, never your IP address, your browser, the full link you came from, or anything that tells one visitor from another. The request carries no cookie, and if your browser sends Global Privacy Control, it isn't sent at all.

### When you sign up

- **Your email address**, to make your account and send you a link to prove it's yours.
- **A name for your record**, and your time zone, so dates in the record are right.
- **A bot check.** When sign-up asks for it, Cloudflare Turnstile checks that you are a person and not a script. It looks at your browser and connection, and Cloudflare uses what it sees only to tell people from bots.
- **Payment.** You pay through Stripe (see below).

### When you ask for an invitation

While sign-up is by invitation, you can ask for one. We keep the name and email address you give, what you'd use BrainDog for and the link you add, if any, so we can decide. The bot check above may run here too. Once we've invited you or said no, we keep your application for 90 days, then delete it.

### When you're invited

An invitation is a link with a code in it, and we email it to you. We keep only a scrambled form of the code, a note of who it is for (usually your email address) and when it ends. When the code is used, we note when, and which account it made.

### Your account

We keep, in a directory separate from any record:

- **your email address**;
- **your passkeys.** Only the public half of each passkey is stored, with a label such as "iPhone". Your fingerprint or face never leaves your device;
- **your sessions**: a scrambled form (a keyed hash) of each session's ID, when it was proved and when it was last used. It is what Settings shows as your list of devices;
- **sign-in links**: a scrambled form of each link, never the link itself. A link works once;
- **failed attempts**: to stop guessing, we count failed sign-ins and link requests against your address and your network address, and forget them after 15 minutes;
- **which records you belong to**, and your role in each;
- **apps you've let in**: which app, which record, and the access you approved.

### When you pay

Payments are handled by Stripe. Stripe collects your card details, your billing email and address, and what it needs for tax and fraud checks. **We never see your card number.** Stripe's privacy policy covers what it does.

So that a payment makes the right record, we give Stripe your email address, our reference for you, and the new record's name, web address, time zone and plan. We never give Stripe what's in a record.

We keep Stripe's reference for you and your subscription, your plan, whether it is paid, when the paid period ends, and when a record became read-only. We also count how much of each allowance a record uses each day, so we can show it and hold the record to its plan's allowance.

### What's in your record

A record holds what you, your members, your agents and your connections put in it:

- **your lists, pages, rules and automations**;
- **the history of every change**: what changed, when, and who or which agent made it;
- **files you attach**;
- **email and webhooks you forward in**, kept as they arrived until they are filed or you remove them;
- **what your connections fetch** from the services you connect;
- **the people in it**: the name and email of each member and each person invited;
- **your saved keys** for other services, sealed (see "What we can see");
- **a search index**, including one that searches by meaning, built from your record so search works.

A record may hold information about other people, such as clients or colleagues. The owner is responsible for having the right to keep it there.

### Slash

When you ask Slash a question, or it does its daily check, writes your daily email or learns how to file something that arrived, it reads the parts of your record the job needs and sends them to an AI model. The model runs on Cloudflare (Workers AI), through Cloudflare's AI Gateway. Each call asks the gateway not to keep prompts or answers.

To make search by meaning work, text from your record is also sent to a model on Workers AI, through the same gateway, which turns it into numbers for the search index.

Slash never sees your saved keys. We keep a count of each call (the model, the tokens used and the cost), with no prompt text, to run your monthly credits.

If you connect your own model provider's key, such as Anthropic or OpenAI, Slash sends its questions to that provider instead, under your agreement with them. The search index still uses Workers AI.

### Agents and apps

When you connect an agent or app, we keep the key's label, its access (read, propose or write), when it was made and when it expires. We store only a scrambled form of the key itself. Everything the agent writes is kept in your record's history under its name.

### Email we send

We send sign-in links, invitations, notices about your account and billing, and, if you want them, your record's daily email and alerts. We send them through Cloudflare's email service from hello@brain.dog. Cloudflare keeps a log of each email we send, and may keep a copy of it, for a short time.

### Notifications on your devices

If you turn on notifications, your browser gives us an address to ring on its push service (run by your browser's maker, such as Google, Apple or Mozilla). The push carries no content: your device opens BrainDog to see what it is.

### Counting how BrainDog is used

We may count requests to BrainDog by their kind: which door they came in by, what kind of app sent them, what they asked for, how they ended and how long they took. A count never holds content, names or email addresses, and the record's ID in it is scrambled with a key that changes every month. Counts are kept in Cloudflare's Analytics Engine for 3 months.

Each night we also count how many records have each pack from the public catalogue installed. Only the rounded totals are published, and they name no record.

To see how well BrainDog helps people get started, each record notes once when its first agent connected and when its first brief was written. We count how many new accounts reach each step each week. The counts name nobody and are seen only by us.

### Publishing a pack

If you publish a pack to the public catalogue, the pack and the publisher name shown with it are public.

### When you email us

We keep your message and our reply, so we can help you and keep a record.

## Our legal reasons (UK and EU)

UK and EU law asks us to give a legal reason for each use of your information.

- **Your account, sign-in, records, Slash and email we send:** contract. It's the service you asked for.
- **Billing and usage counts:** contract, and legal obligation for tax records.
- **Applications and invitations:** legitimate interests, letting people in while sign-up is by invitation.
- **Bot checks, failed-attempt counts, logs, counting visits and how BrainDog is used, and security:** legitimate interests, keeping BrainDog safe and working.
- **Looking inside a record to support you:** contract, when you ask us; legitimate interests, when we must fix a fault or stop abuse.
- **Answering your emails:** legitimate interests.
- **What's in a record:** the owner's legal reason, since they are the controller. We process it on their behalf.

Where we rely on legitimate interests, you can object, and we will stop unless there is a strong reason to go on, such as someone's safety.

## Cookies and storage

- **One sign-in cookie** keeps you signed in. It holds a random session ID and lasts up to 30 days from your last visit, and a session ends 90 days after you last signed in with a passkey or a link, however often you visit. Signing out removes it.
- **One signed-in marker** tells brain.dog that someone is signed in on this browser, so the site can show "Open BrainDog" in place of "Start free". It holds your record's web address, or just a 1, and never your email or anything that could sign you in. It lasts up to 30 days, and signing out removes it. Scripts on the page can read it, which is why it holds nothing more.
- **One preferences cookie** in the app remembers how you like it to look, such as dark mode and text size, so the page draws right away. It holds no ID.
- **Small settings in your browser's storage**, such as a hint you dismissed. They never leave your device.

That's all. Each is needed for something you asked for, so none needs your consent. The sign-in cookie is locked to brain.dog and can't be read by scripts.

## Who we share it with

We don't sell your information, and we don't share it for advertising.

These companies help us run BrainDog, and handle your information only to do that. The [Data processing addendum](/legal/processing) lists them with what each one does.

- **Cloudflare** (USA): hosting, every record's database, running your scripts, file and backup storage, the AI models behind Slash and search, receiving the email you forward in, sending email, bot checks, usage counts and security.
- **Stripe** (USA): payments and invoices.
- **Google** (USA), through Gmail: stores the messages you send to our @brain.dog addresses, which Cloudflare passes on to it.

We also share information:

- **with the services you connect**, when your record calls them for you;
- **with the people and agents you let into a record**, as far as the access you gave them;
- **with anyone who has a link to a page you shared**, until the link ends or you close it;
- **when the law requires it**, or to protect someone from serious harm;
- **if BrainDog changes hands**, with the new owner, who must keep these promises or tell you first;
- **when you ask us to.**

## What we can see

We'd rather say this plainly.

- **Your record's rows.** They are not end-to-end encrypted, because BrainDog has to read them to show your pages, run your rules and answer your agents. So we can technically read them.
- **Your saved keys.** They are sealed with a key that belongs to your record, which is itself sealed with a key only BrainDog's servers hold. If you turn on a vault passphrase, we can't open your saved keys without it. You type it each time you open one, and BrainDog uses it for that moment only and never stores it. Copies of the record made before you turned it on can still be opened without it until they are deleted: 30 days for nightly copies, and longer for copies taken by hand (see "How long we keep it").
- **Keys your connections use while you're away.** A connection that runs on a schedule must open its key with nobody present, so we can still open those, even with a passphrase on. BrainDog tells you so when you save one.
- **Slash's questions.** Not kept by us, and the gateway is asked not to keep them, as above.

**When we look.** Only to support you, keep BrainDog safe, or follow the law. Support will never ask for your vault passphrase.

## Where your information goes

We are in the United States. Our providers store and process information in the United States and across Cloudflare's worldwide network. If you are in the UK or the EU, your information goes to the US. Our providers protect it with approved safeguards, such as the EU-US Data Privacy Framework with its UK extension, or standard contractual clauses.

## How long we keep it

- **Your account:** until you close it.
- **Sessions:** until you sign out, or they expire.
- **Failed-attempt counts:** 15 minutes.
- **An application for an invitation:** until we decide, then 90 days.
- **An invitation:** the note of who it was for, and when it was used, as long as sign-up is by invitation.
- **A record:** until an owner deletes it, or it has been read-only for 90 days after a plan ended.
- **A deleted record's final sealed copy:** 30 days, then nothing of the record remains.
- **Nightly backups:** we copy each record, and our account directory, every night, sealed so the stored copy alone opens nothing. We keep the last 30. So anything deleted is gone from nightly backups 30 days later. Cloudflare's own history of each database also covers 30 days.
- **Copies taken by hand:** a copy an owner takes with Back up now, and the copy taken before a restore, is kept until newer ones replace it (we keep up to 30) or the record is deleted.
- **An automation's runs:** 90 days.
- **Pages a connection fetched:** their contents are kept 30 days, so a filing rule can still be rolled back.
- **A shared page's link:** until it ends (30 days unless the owner chooses another length, up to 90) or the owner closes it.
- **Billing records:** 7 years, as tax and accounting law requires.
- **A record's usage counts:** as long as the record exists.
- **Counts of how BrainDog is used:** 3 months.
- **Daily visit totals:** as long as they're useful. They name nobody.
- **Technical logs:** a short time, as above.
- **Copies of emails we send:** a short time, at Cloudflare.
- **Emails with us:** 2 years.

We keep anything longer only when the law requires it.

## Your rights

Wherever you live, you can ask us to:

- **show** you the information we have about you, and give you a copy;
- **correct** it;
- **delete** it;
- **send** it to you in a standard format, to take elsewhere;
- **stop or limit** a use of it, or **object** to one;
- **withdraw** a consent you gave.

**Do it yourself.** In Settings you can export your whole record as one file, change your email address, remove passkeys, sign out other devices, delete a record and close your account. A record's owner can **erase a person** from it: their details are removed from the live record and its files at once, and from nightly backups 30 days later. Copies an owner took by hand keep them until those copies are replaced or the record is deleted. The record keeps only the fact that something changed, when, and who changed it.

**How to ask.** Email support@brain.dog from the address on your account, with "Privacy" in the subject. To protect you, we check that the request comes from you before we act. We reply within 30 days.

If your information is in somebody else's record, that record's owner controls it. Ask them first. If they don't help, write to us and we'll pass your request on.

**Closing your account.** In Settings, type your email to confirm. If you're the only owner of a record that is still open, delete it or make somebody else its owner first. Closing removes your email, passkeys, sessions, sign-in links and memberships from our directory. We email you once to confirm, then forget your address. Closing doesn't cancel a plan you pay for, and Stripe keeps its own billing records; cancel the plan in Settings first. Records you were a member of keep their own history, which each owner can erase. Our directory's nightly copies age out in 30 days.

**Complaints.** If you're unhappy with how we handled your information, please tell us first at support@brain.dog. You can also complain to your data protection authority: in the UK, the Information Commissioner's Office (ico.org.uk); in the EU, the authority in your country.

## Children

BrainDog is for people aged 18 and over. We don't knowingly collect information from anyone younger. If we learn that an account belongs to a child, we close it.

## Keeping it safe

- There are no passwords to steal. You sign in with a passkey, or a link that works once.
- Every record is its own database, so no query can reach from one record into another.
- Saved keys are sealed before they are stored, and nightly backups are sealed to a key kept outside Cloudflare.
- An agent's key can't open your saved keys, erase data or delete a record.
- Our security page is published, and we welcome reports at support@brain.dog.
- If a security problem ever puts your information at risk, we will tell you, and the authorities, as the law requires.

## Changes to this policy

When we change this policy, we change the date at the top. If a change matters, we tell account holders by email before it takes effect.

## Contact

- Privacy, and anything else: support@brain.dog
