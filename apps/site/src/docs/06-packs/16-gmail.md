# Gmail

The Gmail add-on brings your mail into BrainDog: who you are in touch with, mail waiting on your reply, and bills, receipts and dates to look at. It only reads. Nothing is ever sent, changed or deleted in your Gmail, and a mail is never kept whole.

## What it adds

- **Mail**, a list of your mail from the last two weeks: the subject, who it is from or to, the day, a short snippet and the link to it in Gmail, with whether it is unread, waiting on your reply, or looks like a bill, a receipt or a date.
- **People and organisations** met from your mail. Every hour the add-on meets the person behind a mail from a person and everyone you write to, and moves their Last in touch to the mail's day. Newsletters, no-reply addresses and notifications are left out.
- **Questions in Needs you** for a mail waiting on your reply, a bill, a receipt and a date from a person, each asked once with the link. Nothing acts on its own.
- A **Mail** page, and two widgets for Today, Mail and Waiting on your reply.

## Connect it

The sender is a short script in your own Google account, so no Google Cloud app or review is needed.

1. Install the add-on, open Add-ons, Gmail, and press **Make the address**.

2. Open script.google.com and press **New project**.

3. In **Project Settings**, tick **Show "appsscript.json" manifest file in editor**.

4. Paste the first box on the add-on's page into `appsscript.json` and the second into `Code.gs`, and save.

5. Run `start`, and allow it to read your mail.

Mail arrives within a minute. To stop it, run `stop` in the same project, or delete the project.
