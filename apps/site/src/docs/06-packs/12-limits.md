# What a plugin can and cannot do

A pack is a file of data that a record reads, so what it can do is a short list, and everything else is refused at install with a sentence saying why. The list is short on purpose: it is small enough to read in full before you install something a stranger wrote.

## What a plugin can do

- Declare lists, and lay optional fields and new values on another pack's list with `extends`.
- Draw pages from declared blocks, over lists it declares or requires, and place its own pages in the rail.
- Match text arriving at a door and write typed fields from it.
- Count and add up figures, each with a target and a window.
- Set a theme's seed colour and schemes.
- Send a digest on a schedule.
- Tag, move, note, notify and set fields through rules, and make rows through a rule only up to a bound it declares.
- Run a script in a sandbox, reaching only what its declaration names.
- Call out to a host written out in full, as often as it says and no more often than every fifteen minutes, with a Keychain key named by its label.
- Carry example rows, marked as examples and counted on their own line in the plan.

## What a plugin cannot do

- **Draw a list it did not declare or require.** A page over a list nothing declares is refused, and a script reaches only the lists its `reads` and `writes` name.
- **Write rows at install**, except its own example rows.
- **Delete anything.** Uninstalling retires a pack's lists and pages and keeps every row.
- **Make rows without a ceiling**, or into a list another pack owns.
- **Write a colour outside a theme.** A page names intent, and the theme names the colour.
- **Carry a credential.** A key-shaped value anywhere in the file, an example row included, is refused.
- **Call a host the plan did not print**, or one built from anything but the literal address.
- **Hand another pack a power.** Nothing one pack declares widens what another can do.
- **Change what you installed without asking.** A new version is planned and approved the way the first was.

## The one thing a plugin can still do wrong

A pack can mislead. A figure could add up the wrong field under a plausible name, and a page could show it with confidence. No sandbox prevents that, because it is a question of meaning and not of code. So the plan names every declaration before you install, a figure must say its target and window, and a figure on a page shows where it came from.

The worst a pack you installed can do is show you a misleading page, and call out to the hosts printed on the plan you approved. Both were on the screen before you said yes, and uninstalling undoes both without losing a row.
