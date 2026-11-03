# People

Clients, contractors and accountants, the organisations they are with, and where each one was seen. Every record starts
with it, and it is written here as a file anybody can read, the same as any other plugin.

- **The lists.** A person is their name, their role, the organisation they are with, every address and handle they are
  known by, a note, the day you were last in touch and where they were seen. An organisation is its name, its kind, its
  domain, the addresses it is known by and a note. Only the name must be said.
- **The pages.** People opens with who has gone quiet and since when, and how many people may be on the record twice,
  then everyone as a line with the day you last spoke. Each person and each organisation has a page of their
  own. Health, Calendar and Activity are pages here too.
- **What it does by itself.** Whoever writes in is met: the person a mail is from, the organisation the domain belongs
  to, and who a payment was with. Nobody is asked anything.
- **Projects and Money.** Which projects a person or an organisation was met in, and an organisation's projects and
  money, are there once the record has Projects and Money. Without them People goes in on its own and those parts wait.

The build still compiles the same lists, pages, figures and rules in as a module (`packages/seed/src/modules/people.ts`).
`people.test.ts` holds this file equal to it, part for part, on a record with Projects and Money, with Projects alone,
and with neither, and is deleted the day the module is. Two things the module leaves out on a smaller record, a part of
how a person is met and a list a page asks for, have no `when:` of their own: the plan takes each out with the part
that waits, and the test holds that.
