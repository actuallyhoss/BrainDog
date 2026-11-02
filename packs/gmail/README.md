# Gmail

Your Gmail in BrainDog: who you are in touch with, mail waiting on your reply, and bills, receipts and dates to look
at. Reads only. Nothing is ever sent, changed or deleted in your Gmail, and a mail is never kept whole: a row holds the
subject, who it is from or to, the day, a snippet of at most 160 characters and the link to it in Gmail.

- **Mail**: one row a mail of the last two weeks, found again by its Gmail id, so a mail that is read or answered later
  is updated, never written twice. Whether it is unread, whether it is waiting on your reply, and whether it looks like
  a bill, a receipt or a date.
- **People and organisations**: every hour the add-on meets the person behind a mail from a person (not a newsletter, a
  no-reply address or a notification) and everyone you write to, by their address, and moves their Last in touch to the
  mail's day. Their organisation is met by the address's domain, unless it is a mail service anybody can sign up to.
- **Needs you**: a mail waiting on your reply, a bill, a receipt, and a date from a person are each asked about once,
  with the link to the mail. Nothing acts on its own: you answer and you act.
- A **Mail** page, and two Today widgets: **Mail** (need a reply, unread) and **Waiting on your reply**.

## Why a script in your own Google account

Reading Gmail from a server needs a Google Cloud app, and an app that reads mail needs Google's restricted-scope review
before anybody but its maker can use it, which takes weeks and a security assessment. Forwarding to the record's mail
address was the other choice, and it was turned down: Gmail asks you to confirm a forwarding address with a code, a
forwarded mail arrives whole (body and attachments), and a forward cannot say whether a mail is unread or answered.

So the add-on takes mail in at a webhook door (`gmail_in`, checked by the token in its address) and the sender is a
short Google Apps Script you paste into script.google.com once. It runs as you, under your own Google account, every 15
minutes. It asks Google only for `gmail.readonly` (read your mail), `script.external_request` (post to your BrainDog)
and `script.scriptapp` (run on a timer). It sends only what a row keeps. No key goes in the add-on, a row or a note:
the token is in the door's address, which the record keeps only as a digest, and the address is shown to you once.

## Connect it (about two minutes)

1. Install the add-on, then open Add-ons, Gmail, and press **Make the address**. The page shows two boxes with your
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

- `gmail.pack.json`: the add-on.
- `gmail.js`: the hourly script, the same text as the pack file's `source`.
- `apps-script.gs` and `appsscript.json`: the recipe the add-on page shows, the same text as the door's `connect.files`.
  `BRAINDOG_ADDRESS` and `BRAINDOG_TIMEZONE` are filled in by the page.

The pack file is built from these files; when one changes, its text in `gmail.pack.json` changes with it.
