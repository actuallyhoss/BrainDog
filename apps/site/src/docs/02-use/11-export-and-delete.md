# Export and deleting

Your BrainDog is yours to take. The owner can export all of it as one signed file at any time, whatever state it is in, and anybody can check that a copy is whole. Deleting is the other end: a row can always be put back, and a BrainDog, once deleted, cannot.

## Export everything

In Settings, under Export, the owner can take:

```comparison | What you can export
Export | What is in it
Everything, in one file | All of it: its lists, pages, rules and rows
The way you work | Your lists, pages, figures and rules, without a single row of what you wrote in them
What you wrote | Every row you have written, without the lists and pages around them
A starter for someone else | The way you work, as a plugin somebody else can install, with your rows left out
```

```steps
Open Export | Everything, in one file is the first row | Settings, under Export
Press Download a copy | The file downloads, and BrainDog says it is in your downloads | In your browser
Check it if you like | Check a file reads it back against its own list of contents and its signature | Settings, under Export
```

The whole file, a `.brainl`, is plain text, one line per row, each line written as JSON, so any tool that reads JSON can read it. Every export is signed. **Check a file** runs in your browser over a file you already hold, sends it nowhere, and says whether it is whole and signed, or what is wrong with it. Anybody who can open your BrainDog can check a file; only an owner can take one.

Export stays available when a BrainDog is read-only because its payment lapsed. You never have to pay to leave.

## Backups

Your BrainDog is backed up every night. The 30 newest are kept, plus the latest. The owner can also press **Back up now**, and download any backup from the list.

Backups are sealed with a key that is not inside them, kept outside the product on purpose.

Going back to a backup is asked for, not pressed. Nothing in the app can put a BrainDog back to how it was, so a restore is something you ask the host for.

## Taking things away inside it

```comparison | What goes, and what stays
You | What happens
Archive a row | It leaves every list until it is put back. History keeps every change
Hide a page from the sidebar | It leaves your sidebar only. Settings, under Navigation, shows it again
Remove a block from a page | The block goes. The rows it read stay in their list
Take a list out of the sidebar | The list leaves the sidebar. Its rows are kept
Turn a plugin off | Its lists leave the sidebar. The rows are kept, and turning it on again brings them back
```

Nothing in History can be deleted. Every change, and who made it, stays there for as long as your BrainDog exists.

To remove everything one person wrote, the owner uses **Erase a person** in Settings, under People & sharing. See [Sharing and access](/docs/use/sharing).

## Delete your BrainDog

**Delete my BrainDog**, the last area in Settings, is the one act with no way back.

```note | Before you delete | bad
Deleting your BrainDog removes every list, page and row in it, and it cannot be undone. Its name is given up for good, and no other BrainDog can use it again. A final copy is kept for 30 days, for recovery only, and then deleted; you cannot open it yourself, so export a copy first if you want the rows.
```

To confirm, type its name exactly as it appears in its address. When it is done, BrainDog says it is deleted and you can close the tab.

## Close your account

Deleting a BrainDog and closing your account are different things. Your account is your sign-in, and it can open several BrainDogs. **Close your account**, in Settings under Identity, removes your passkeys, sessions and sign-in email and takes you out of every BrainDog you belong to, and each one keeps its own history of what you did there. It needs a sign-in from the last fifteen minutes and your sign-in email typed to confirm.
