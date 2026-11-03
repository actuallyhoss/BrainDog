# Gmail

Your Gmail in BrainDog: who you are in touch with, mail waiting on your reply, and bills, receipts and dates to look
at. Reads only. Nothing is ever sent, changed or deleted in your Gmail, and a mail is never kept whole: a row holds the
subject, who it is from or to, the day, a snippet of at most 160 characters and the link to it in Gmail.

- **Mail**: one row a mail of the last two weeks, found again by its Gmail id, so a mail that is read or answered later
  is updated, never written twice. Whether it is unread, whether it is waiting on your reply, and whether it looks like
  a bill, a receipt or a date.
- **People and organisations** (1.2.0): nobody is added for being in your mail. Somebody already in People is linked
  to their mail and their Last in touch moves to the mail's day. Somebody new is added only when they are of use: in
  the last two weeks you wrote to them and they wrote to you as a person, or you both wrote in one thread, the rule
  Connect Google keeps for your contacts. One of your own addresses is you. A shared inbox or a machine (info@,
  support@, admin@, no-reply@, notifications@), a newsletter or a list is never a person, and a display name that is
  only an address is no name. An organisation comes only with a person of use from it.
- **Needs you** (1.2.0): asked once, with the link to the mail. A reply only when a person wrote to you directly (on
  To, not only Cc or a list), nobody answered since, it is not an invitation, its update or a machine's mail, and it
  asks you something; a forward with nothing asked by whoever forwarded it is for your information. One question a
  thread: a newer mail joins the one waiting. One bill or receipt an order or invoice, with the amount first: the same
  order number, or the same amount within ten days from one seller or a payment service, is one. A date only from a
  person naming a day, never for an invitation or an event already on your calendar. A first look, or an hour that
  would ask more than five, asks one question in their place ("12 mails may need you"); **Leave them** takes them all
  off the lists. Nothing acts in Gmail: you answer and you act. **I replied** or **No reply needed** takes a mail off
  Waiting on your reply, and **Not a bill** or **Not a receipt** clears what it looked like.
- **Bills and receipts** (1.1.0): the hourly script decides, once, when it first looks at a mail. A bill needs
  "invoice" in its subject, or bill words with an amount in a currency or a sender known to send bills (a biller's
  domain such as stripe.com, or an address such as billing@). A receipt needs receipt or order words with the same.
  A newsletter (sent to a list, or filed by Gmail as promotions, social or forums) never raises a bill, a receipt or a
  date. Tune `kindOf` in `gmail.js`.
- **Older than two weeks** (1.1.0): a mail still waiting on your reply, or still unread, stays in BrainDog with its
  question until you answer it or reply. The 1.1.0 script in Google keeps looking at up to 60 such mails after they
  leave its 14 days, so a late reply or read still reaches BrainDog. The 1.0.0 script keeps working as it was; it just
  does not see a reply made after two weeks, so answer the question instead.
- **The hourly script runs** (1.1.1): 1.1.0's script asked its list for something a script's list does not take, so
  every run was refused before it read a mail, and nobody was met and nothing reached Needs you. An hour with no new
  mail now does nothing. People and organisations are matched as the record matches them (an address in any case,
  Gmail's dots and +tags, a known organisation's subdomains), so meeting somebody already there never stops the run.
- **What 1.2.0 reads that the door did not** comes in the lines it already had: Connect Google says a mail you are only
  copied on is not waiting on your reply, and calls a calendar's mail (an invitation by its sender or type, or a mail
  about an event your calendar holds) `event` as Gmail's guess, once the plugin knows that word. A script pasted before
  keeps working, and the hourly script reads invitations and forwards from their subject and words.
- A **Mail** page, and two Today widgets: **Mail** (need a reply, unread) and **Waiting on your reply**. Both stay off
  the board until the first mail arrives; until then the Connect tile on the plugin page is where to start.

## Connect Google (the simpler way, since 2 Nov)

BrainDog can read Gmail itself once Google is connected: **Connect Google** on this plugin's page, or in Settings, What
comes in. It is Google's own sign-in, read only (`gmail.readonly`, `calendar.readonly`, `contacts.readonly`,
`userinfo.email`), and BrainDog keeps Google's refresh token sealed on its server, never in a row, a note or an answer.
Every 15 minutes it reads what changed (Gmail's history, from a two-week start) and posts each mail through this
plugin's own door, `gmail_in`, as the very lines the script below posts. So the list, the page, the questions, the Today
widgets and the people met are the same whichever way the mail came, and a mail is never written twice. With Google
connected, this plugin's page says Connected in place of the paste steps, and the script can be stopped.

The script stays for anybody who would rather not connect Google, and keeps working beside it.

## Why a script in your own Google account

Reading Gmail from a server needs a Google Cloud app, and an app that reads mail needs Google's restricted-scope review
before anybody but its maker can use it, which takes weeks and a security assessment. Forwarding to the record's mail
address was the other choice, and it was turned down: Gmail asks you to confirm a forwarding address with a code, a
forwarded mail arrives whole (body and attachments), and a forward cannot say whether a mail is unread or answered.

So the plugin takes mail in at a webhook door (`gmail_in`, checked by the token in its address) and the sender is a
short Google Apps Script you paste into script.google.com once. It runs as you, under your own Google account, every 15
minutes. It asks Google only for `gmail.readonly` (read your mail), `script.external_request` (post to your BrainDog)
and `script.scriptapp` (run on a timer). It sends only what a row keeps. No key goes in the plugin, a row or a note:
the token is in the door's address, which the record keeps only as a digest, and the address is shown to you once.

## Connect it (about two minutes)

1. Install the plugin, then open Plugins, Gmail, and press **Make the address**. The page shows two boxes with your
   address and time zone already filled in.
2. Open script.google.com, signed in to your Gmail, and press **New project**.
3. Press **Project Settings** (the gear) and tick **Show "appsscript.json" manifest file in editor**. Go back to
   **Editor**.
4. Open `appsscript.json`, select everything and paste the first box. Open `Code.gs`, select everything and paste the
   second box. Press **Save**.
5. Pick `start` in the bar at the top and press **Run**. Press **Review permissions**, choose your account, then
   **Advanced** and **Go to the project**, and **Allow**. Google says the app is not verified because it is your own
   script, not one a company made.

Mail starts arriving within a minute; people, links and questions within the hour. To stop it, run `stop` in the same
project, or delete the project. Making a new address in BrainDog stops the old one at once.

## The files

- `gmail.pack.json`: the plugin.
- `gmail.js`: the hourly script, the same text as the pack file's `source`.
- `apps-script.gs` and `appsscript.json`: the recipe the plugin page shows, the same text as the door's `connect.files`.
  `BRAINDOG_ADDRESS` and `BRAINDOG_TIMEZONE` are filled in by the page.

The pack file is built from these files; when one changes, its text in `gmail.pack.json` changes with it.

## The script and its versions

The door reads the same lines from every version of the script, so a script pasted from 1.0.0 keeps working with the
1.1.0 plugin. The 1.1.0 script differs in two places only: it keeps looking at a mail still waiting or unread after it
is 14 days old, and in `gmail.kind=` it may say `list` for a newsletter. Since 1.1.0 that line is read into `hint`
(Gmail's guess) and never into `kind`, so Gmail updating a mail later cannot bring back a bill you cleared.
