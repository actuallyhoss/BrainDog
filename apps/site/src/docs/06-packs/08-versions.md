# Versions

A pack's version is three numbers, and a published version never changes. A record that installed a version is held to that file's checksum, so every change, however small, is a new version, and the number says how big the change is.

## Which number moves

```comparison | Which part of the version to raise
Change | Raise | Example
A list, a page or a module goes, or a field changes type | the first, a major | 1.4.2 to 2.0.0
A declaration, a module or a host to call out to is added | the second, a minor | 1.4.2 to 1.5.0
Anything else | the third, a patch | 1.4.2 to 1.4.3
```

~~~code | As written
```comparison | Which part of the version to raise
Change | Raise | Example
A list, a page or a module goes, or a field changes type | the first, a major | 1.4.2 to 2.0.0
A declaration, a module or a host to call out to is added | the second, a minor | 1.4.2 to 1.5.0
Anything else | the third, a patch | 1.4.2 to 1.4.3
```
~~~

A patch covers a changed page, rule, script, title or word. Publishing checks the bump against what actually changed, so a version that takes something away without being a major is refused, and so is a version that is not later than the one before it. `braindog pack diff <earlier> <later>` says what moved between two files and the least bump that needs.

## Saying which versions you need

A pack that builds on another names it in `requires.packs` with a range: comparators joined by spaces, such as `">=3.0.0 <4.0.0"`. There is no `||` and no `x` in a range. A record resolves the range when the pack is installed and pins the version it chose. A pack whose requirements the record cannot meet says so at install and installs nothing.

`requires.format` and `requires.primitives` name the dialect the pack is written for. A record refuses a pack that asks for primitives newer than its own, rather than drawing its pages wrong.

## Upgrading a record

Nothing updates on its own. A pack that silently updated could silently change what a page says about your money, so a new version is installed the way the first was: the record works out the plan, shows what the new version adds, changes and retires, and applies it only when you say so.

Some changes a record refuses as an ordinary upgrade, each with its reason:

- **A field's type changed.** Retire the field and add a new one; the old values stay where they were.
- **An id was renamed.** Ids are stable for ever, and there is no alias.
- **A field became required on a list that already has rows.** Existing rows would break the rule the moment it landed.
- **The upgrade would leave rows under a list it retires.** Uninstalling is the way to do that on purpose, and it keeps the rows.

## Taking a version back

A version published by mistake is yanked, not deleted: `braindog pack yank <id> <version> --reason <why>`. It is never offered again, and a record that holds it is told why. The number is used up; the fix goes out as the next version.
