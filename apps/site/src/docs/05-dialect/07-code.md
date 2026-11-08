# Code, trees and changes

The media kinds keep text exactly as it was written: a code sample, a tree of folders, a change shown line by line, and a gallery of pictures from the record.

## `code`

Every line is kept verbatim: never split on a bar, never trimmed, so indentation survives. The heading goes after the bar and is drawn as the caption.

```code | In a terminal
braindog page pull invoicing --out invoicing.dog
braindog page check invoicing.dog
```

~~~code | As written
```code | In a terminal
braindog page pull invoicing --out invoicing.dog
braindog page check invoicing.dog
```
~~~

A word straight after the kind, as in `code ts`, is the language, and a fence that names a language rather than one of the kinds (` ```ts `, ` ```bash `) or names nothing at all is drawn as code too. On a phone a code block scrolls inside itself, and it can be reached with the keyboard.

## `tree`

Folders and files, one to a line, with two spaces of indentation for each level.

```tree | A pack's folder
packs/hello
  hello.pack.json
  hello.test.json
  hello.test.ts
  README.md
```

~~~code | As written
```tree | A pack's folder
packs/hello
  hello.pack.json
  hello.test.json
  hello.test.ts
  README.md
```
~~~

## `diff`

A change, line by line. Each row starts with `- ` for a line taken out, `+ ` for a line put in, or two spaces for a line that stayed.

```diff | The page's title
  page: invoicing
- title: Invoicing
+ title: Invoices and payments
  nav: { section: Money, order: 20 }
```

~~~code | As written
```diff | The page's title
  page: invoicing
- title: Invoicing
+ title: Invoices and payments
  nav: { section: Money, order: 20 }
```
~~~

A row that starts any other way refuses the block, since a line with no mark would be dropped from the drawing. On a record, Needs you draws a proposed change to a document with this same kind.

## `gallery`

A row is a caption and a file, the file written as `file:<list>#<n>/<field>`: a picture the record already holds. The record draws the picture; anywhere else, as on this page, the tile shows the file's name instead.

```gallery | The shoot
The front | file:photos#12/picture
The back | file:photos#13/picture
The label | label.pdf
```

~~~code | As written
```gallery | The shoot
The front | file:photos#12/picture
The back | file:photos#13/picture
The label | label.pdf
```
~~~

Nothing outside the record is ever loaded into a gallery, so a page cannot be made to fetch a picture from somebody else's server.

## Video, designs and maps

The `embed` kind frames a video, a design or a map from a short list of providers, and it belongs on a [declared page](/docs/dialect/pages). It is drawn as a title and a link until a reader presses to load it, and only then is a sandboxed frame put on the page.
