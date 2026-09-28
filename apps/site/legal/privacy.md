DRAFT for review, not in force.

# Privacy Policy

Last updated: 2026-09-28

## The short version

- BrainDog keeps a record for you: your lists, pages, rules, files and history. We host it and run it. We don't sell it, show ads, or use it to train AI models.
- You sign in with a passkey, or a link we email you. There are no passwords.
- Every record is its own database. No table holds two customers.
- The keys you save for other services are sealed before they are stored.
- We can technically read a record's rows. We only look to support you, keep BrainDog safe or follow the law, and we record why each time.
- You can export your whole record at any time, erase a person from it, delete it, and close your account.
- Deleted data is gone from our backups 30 days after it leaves the live record.

## Who we are

BrainDog, at brain.dog, is run by Quartz Apps LLC, a Wyoming limited liability company whose post goes to c/o Cloud Peak Law, 1309 Coffeen Ave STE 1200, Sheridan, WY 82801, United States.

We have two roles, and this policy covers both:

- **For your account and billing**, we decide how your information is used, so under UK and EU law we are its "controller".
- **For what's in a record**, the record's owner decides what goes in and who sees it. If the owner is a business, it is the controller and we are its "processor": we handle that information only to run BrainDog for it, under the [Data processing addendum](/legal/processing). If you're in someone else's record and have a question about what it holds, ask its owner first.

Write to us about privacy at **privacy@brain.dog**.

## What we collect, and why

### When you visit brain.dog

- **Connection details.** Our host, Cloudflare, receives your IP address and browser details to send you the page, as every website's host does. Technical logs of requests are kept for a short time to fix faults and stop attacks. [owner: confirm how long Workers logs are kept, 7 days on the paid plan]
- **No tracking.** The marketing site sets no cookies and runs no ad or tracking scripts. [owner: confirm Cloudflare Web Analytics is off for brain.dog, or add a paragraph for it]

### When you sign up

- **Your email address**, to make your account and send you a link to prove it's yours.
- **A name for your record**, and your time zone, so dates in the record are right.
- **A bot check.** When sign-up asks for it, Cloudflare Turnstile checks that you are a person and not a script. It looks at your browser and connection, and Cloudflare uses what it sees only to tell people from bots.
- **Payment.** You pay through Stripe (see below).

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

We keep Stripe's reference for you and your subscription, your plan, whether it is paid, when the paid period ends, and when a record became read-only. We also count how much of each allowance a record uses each day, so we can show it and bill extra usage if you turned it on.

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

When you ask Slash a question, or it does its daily check, it reads the parts of your record the question needs and sends them to an AI model. The model runs on Cloudflare (Workers AI), through Cloudflare's AI Gateway. The gateway is set not to keep prompts or answers. [owner: confirm gateway logging and caching of prompts and answers are off in the dashboard]

Slash never sees your saved keys. We keep a count of each call (the model, the tokens used and the cost), with no prompt text, to run your monthly credits.

If you connect your own model provider's key, such as Anthropic or OpenAI, Slash sends its questions to that provider instead, under your agreement with them.

### Agents and apps

When you connect an agent or app, we keep the key's label, its access (read, propose or write), when it was made and when it expires. We store only a scrambled form of the key itself. Everything the agent writes is kept in your record's history under its name.

### Email we send

We send sign-in links, notices about your account and billing, and, if you want them, your record's daily email and alerts. We send them through Cloudflare's email service from hello@brain.dog. Cloudflare keeps a copy of each email we send for about 7 days.

### Notifications on your devices

If you turn on notifications, your browser gives us an address to ring on its push service (run by your browser's maker, such as Google, Apple or Mozilla). The push carries no content: your device opens BrainDog to see what it is.

### When you email us

We keep your message and our reply, so we can help you and keep a record.

## Our legal reasons (UK and EU)

UK and EU law asks us to give a legal reason for each use of your information.

- **Your account, sign-in, records, Slash and email we send:** contract. It's the service you asked for.
- **Billing and usage counts:** contract, and legal obligation for tax records.
- **Bot checks, failed-attempt counts, logs and security:** legitimate interests, keeping BrainDog safe and working.
- **Looking inside a record to support you:** contract, when you ask us; legitimate interests, when we must fix a fault or stop abuse.
- **Answering your emails:** legitimate interests.
- **What's in a record:** the owner's legal reason, since they are the controller. We process it on their behalf.

Where we rely on legitimate interests, you can object, and we will stop unless there is a strong reason to go on, such as someone's safety.

## Cookies and storage

- **One sign-in cookie** keeps you signed in. It holds a random session ID and lasts up to 30 days from your last visit. [owner: confirm a session also ends 90 days after you last proved it's you] Signing out removes it.
- **Small settings in your browser's storage**, such as a hint you dismissed. They never leave your device.

That's all. Both are needed for something you asked for, so they don't need your consent. The cookie is locked to brain.dog and can't be read by scripts.

## Who we share it with

We don't sell your information, and we don't share it for advertising.

These companies help us run BrainDog, and handle your information only to do that. The [Data processing addendum](/legal/processing) lists them with what each one does.

- **Cloudflare** (USA): hosting, every record's database, file and backup storage, the AI model behind Slash, sending email, bot checks and security.
- **Stripe** (USA): payments and invoices.
- **Our email provider**: stores the messages you send to our @brain.dog addresses. [owner: name the inbox provider support@brain.dog is routed to]

We also share information:

- **with the services you connect**, when your record calls them for you;
- **with the people and agents you let into a record**, as far as the access you gave them;
- **with anyone who has a link to a page you shared**;
- **when the law requires it**, or to protect someone from serious harm;
- **if BrainDog changes hands**, with the new owner, who must keep these promises or tell you first;
- **when you ask us to.**

## What we can see

We'd rather say this plainly.

- **Your record's rows.** They are not end-to-end encrypted, because BrainDog has to read them to show your pages, run your rules and answer your agents. So we can technically read them.
- **Your saved keys.** They are sealed with a key that belongs to your record, which is itself sealed with a key only BrainDog's servers hold. If you turn on a vault passphrase, we can no longer open your saved keys. That takes full effect after 30 days, when the older backups have expired.
- **Keys your connections use while you're away.** A connection that runs on a schedule must open its key with nobody present, so we can still open those, even with a passphrase on. BrainDog tells you so when you save one.
- **Slash's questions.** Not kept by us or the gateway, as above.

**When we look.** Only to support you, keep BrainDog safe, or follow the law. Every time we open a record, we record who did it and why. Support will never ask for your vault passphrase.

## Where your information goes

We are in the United States. Our providers store and process information in the United States and across Cloudflare's worldwide network. [owner: confirm; records and the storage bucket have no EU-only setting] If you are in the UK or the EU, your information goes to the US. Our providers protect it with approved safeguards, such as the EU-US Data Privacy Framework with its UK extension, or standard contractual clauses.

## How long we keep it

- **Your account:** until you close it.
- **Sessions:** until you sign out, or they expire.
- **Failed-attempt counts:** 15 minutes.
- **A record:** until an owner deletes it, or it has been read-only for 90 days after a plan ended.
- **A deleted record's final sealed copy:** 30 days, then nothing of the record remains. [owner: confirm 30 days]
- **Nightly backups:** we copy each record, and our account directory, every night, sealed so the stored copy alone opens nothing. We keep the last 30. So anything deleted is gone from backups 30 days later. Cloudflare's own history of each database also covers 30 days.
- **An automation's runs:** 90 days.
- **Pages a connection fetched:** their contents are kept 30 days, so a filing rule can still be rolled back.
- **Billing records:** as long as the law requires for tax and accounting. [owner: confirm 7 years]
- **Usage counts:** as long as the record exists.
- **Technical logs:** a short time, as above.
- **Copies of emails we send:** about 7 days.
- **Emails with us:** 2 years. [owner: confirm 2 years]

We keep anything longer only when the law requires it.

## Your rights

Wherever you live, you can ask us to:

- **show** you the information we have about you, and give you a copy;
- **correct** it;
- **delete** it;
- **send** it to you in a standard format, to take elsewhere;
- **stop or limit** a use of it, or **object** to one;
- **withdraw** a consent you gave.

**Do it yourself.** In Settings you can export your whole record as one file, change your email address, remove passkeys, sign out other devices, delete a record and close your account. A record's owner can **erase a person** from it: their details are removed from the live record at once, and from backups 30 days later. The record keeps only the fact that something changed, and when.

**How to ask.** Email privacy@brain.dog from the address on your account. To protect you, we check that the request comes from you before we act. We reply within 30 days.

If your information is in somebody else's record, that record's owner controls it. Ask them first. If they don't help, write to us and we'll pass your request on.

**Closing your account.** In Settings, type your email to confirm. If you're the only owner of a record that is still open, delete it or make somebody else its owner first. Closing removes your email, passkeys, sessions, sign-in links and memberships from our directory. We email you once to confirm, then forget your address. Records you were a member of keep their own history, which each owner can erase. Our directory's nightly copies age out in 30 days.

**Complaints.** If you're unhappy with how we handled your information, please tell us first at privacy@brain.dog. You can also complain to your data protection authority: in the UK, the Information Commissioner's Office (ico.org.uk); in the EU, the authority in your country.

## Children

BrainDog is for people aged 18 and over. [owner: confirm 18] We don't knowingly collect information from anyone younger. If we learn that an account belongs to a child, we close it.

## Keeping it safe

- There are no passwords to steal. You sign in with a passkey, or a link that works once.
- Every record is its own database, so no query can reach from one record into another.
- Saved keys are sealed before they are stored, and nightly backups are sealed to a key kept outside Cloudflare.
- An agent's key can't open your saved keys, erase data or delete a record.
- Our security policy is published, and we welcome reports at security@brain.dog.
- If a security problem ever puts your information at risk, we will tell you, and the authorities, as the law requires.

## Changes to this policy

When we change this policy, we change the date at the top. If a change matters, we tell account holders by email before it takes effect.

## Contact

- Privacy: privacy@brain.dog
- Anything else: support@brain.dog
- Post: Quartz Apps LLC, c/o Cloud Peak Law, 1309 Coffeen Ave STE 1200, Sheridan, WY 82801, United States
