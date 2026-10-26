# Publishing and review

The Kennel is the public catalogue every BrainDog reads packs and starters from. Anybody can submit to it from the command line, and a person looks at what a stranger submits before any record is offered it.

## Submitting a version

```code | In a terminal
braindog addon check reading-list
braindog addon test reading-list
braindog addon publish reading-list/reading-list.pack.json --kennel
```

`publish --kennel` sends the file to the Kennel at `https://brain.dog/api/kennel/v1/`, or to the one named after `--kennel`, and says whether the version is listed now or waits for review. A later version is published the same way, with its `changes` line saying what moved.

The Kennel reads a submission the way a record installs one, and holds it to a little more: it must have a title, and a manifest key outside the known set is refused rather than passed over. A version already there, or one earlier than the latest, is refused, and so is a version whose number is smaller than what it changed.

## Who is publishing

A submission says who sent it in one of two ways, never both:

- **Signed with an author key**, with `--sign <key file>`. The key's id is the publisher.
- **As the person signed in** to that Kennel's host with `braindog login`. The host says who that is.

The name inside the file is only what readers see; the publisher is the key or the person. An id belongs to whoever published it first, so a later version must come from the same person, or be signed by a key that signed it before, or a key that one was rotated to.

## Author keys

```code | In a terminal
braindog addon key ~/keys/me.key --author "Your name"
```

This makes an author key in a file you choose. Keep it outside any repository, and keep it private: it signs what you publish. When a key has to change, `braindog addon key rotate <old key> <new key> --to <folder>` names the new key as the old one's successor, signed by the old key, so readers who trusted one trust the other. `braindog addon key revoke <key> --to <folder> --reason <why>` marks a key as untrusted, and the versions it signed are then said as untrusted and not offered.

## Review

Nothing from outside is listed until a person has looked at it, unless the Kennel's operator has said its publisher is trusted. Until then a submission waits, and a publisher can submit only a limited number of versions a day.

The operator reviews from the command line, with the Kennel's operator key in the environment:

```spec | braindog kennel review
(on its own) | what waits | each submission, its publisher, when it came and what it reaches
show <kind> <id> <version> | look at one | installs it in a scratch record and prints everything it reaches and every host it calls out to
list <kind> <id> <version> | list it | makes its preview from the record's own drawing of its pages, and lists it with that
refuse <kind> <id> <version> --reason <why> | refuse it | the reason is kept with the refusal
trust <publisher> | trust a publisher | their later versions are listed at once
```

~~~code | As written
```spec | braindog kennel review
(on its own) | what waits | each submission, its publisher, when it came and what it reaches
show <kind> <id> <version> | look at one | installs it in a scratch record and prints everything it reaches and every host it calls out to
list <kind> <id> <version> | list it | makes its preview from the record's own drawing of its pages, and lists it with that
refuse <kind> <id> <version> --reason <why> | refuse it | the reason is kept with the refusal
trust <publisher> | trust a publisher | their later versions are listed at once
```
~~~

The preview a listing carries is the record's drawing of the pack's pages, never a picture the author supplied, so what a reader sees before installing is what they will get.

## Yanking

```code | In a terminal
braindog addon yank reading-list 1.2.0 --reason "The due dates were read a day early."
```

A yanked version is never offered again, and a record that holds it is told why. Its number is used up, so the fix goes out as the next version.

## What a published version is

Once listed, a version's file never changes, and the Kennel serves it as a file that can be kept for ever. The index, and every refusal, is always read fresh. Reading the Kennel is public and needs no account: the index, each published file and its preview are open to any BrainDog, any command line and any browser.
