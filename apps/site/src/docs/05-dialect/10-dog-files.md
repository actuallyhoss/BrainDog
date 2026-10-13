# .dog files

A `.dog` file is one page's source as text: exactly what the record stores for the page, printed so a person can read it and edit it. Change the text, apply it, and the page changes by exactly what you changed.

## One page, one file

Open any declared page, choose "How this is built", and the page's text is there, with a button to save it as `<page>.dog`. The same text comes from the command line:

```code | In a terminal
braindog page pull launch --out launch.dog
```

A `.dog` is one page. The whole record, every list and row and page, is a different file, the `.brain`, which is what an export takes.

A page made for each row of a list has no text of its own, so pulling one writes the template it was made from, and the command says so.

## Lossless, and terse where terse is exact

The text is the stored page, whole: nothing is left out to make it shorter, and reading it back gives the same page key for key. It is short where short is still exact:

- a column that is only its field prints bare, as `columns: [client, amount]`;
- an order prints as `[due asc]`;
- a `where` prints as the sentence the record holds, as `where: state is sent or part`;
- a flat list or a flat set of keys prints in brackets, as `nav: { section: Money, order: 20 }`;
- anything deeper, such as a column with several settings of its own, prints as one line of JSON after its key.

Text that would read back as something else, such as `"2024"` or `"true"`, is quoted. Text with line breaks is a block under its key, started with a bar:

~~~code | A note with two paragraphs
  - kind: note
    heading: Reminder
    body: |
      Line one.

      A blank line survives too.
~~~

The page's keys print first, in the order `page title for nav icon tone layout requires blocks`, and a block's keys in the order `kind heading area span source register row where when columns cells order limit`, each followed by any others alphabetically. So two people pulling the same page get the same bytes, and a change shows up in a diff as the lines that changed.

## Check before you apply

```code | In a terminal
braindog page check launch.dog
```

`check` reads the file with the same parser the record uses and runs the record's own validation on this machine. Nothing is sent. A fault is said with the line it is on, and a key the record would refuse is named with what to write instead, as `size:` is told that a block is made wider with `span:`.

## Applying an edited page

A page is applied in the app, by the record's owner. Under "How this is built" the text can be edited in place:

```steps | Changing a page by its text
Open the source | choose "How this is built" on the page | in the app
Edit the text | the page is drawn as it will look after each pause in your typing | beside the text, or under it on a phone
Apply it | press "Apply this page", or "Apply to every <list> page" on a template | the record checks it first
Put it back if you want | "Put back" restores the page as it was before | one press
```

~~~code | As written
```steps | Changing a page by its text
Open the source | choose "How this is built" on the page | in the app
Edit the text | the page is drawn as it will look after each pause in your typing | beside the text, or under it on a phone
Apply it | press "Apply this page", or "Apply to every <list> page" on a template | the record checks it first
Put it back if you want | "Put back" restores the page as it was before | one press
```
~~~

If the record refuses the text, its sentence is shown at the line it is about, and your text is kept. If somebody changed the page while you were editing, applying says so rather than writing over their change, and your text is still there to copy.

## From the command line

`braindog page push launch.dog` sends a file as the page. Changing what a page is takes the owner in the app, and a key held by the command line or an agent is never enough, by design. So with a key the push is filed as one question on Decide and prints its number, and nothing changes until you accept it there. The same file pushed twice is still one question. Pull and check are how a `.dog` file is written and tested outside the app; applying is yours.
