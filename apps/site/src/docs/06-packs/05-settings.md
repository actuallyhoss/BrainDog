# Settings

A pack's settings are the few values its owner should choose rather than you: which tag to use, how many days ahead to look, which Keychain key to send. They are declared under `config` in the manifest, shown on the pack's page in the record, and read two ways: by a declaration when the pack is installed, and by a script each time it runs.

## Declaring them

```code | In the manifest
"config": {
  "tag": { "type": "text", "default": "soon", "label": "Tag", "note": "The tag put on an item due within a week." },
  "days": { "type": "number", "default": 7, "label": "Days ahead", "note": "How many days ahead the script looks." },
  "pace": { "type": "enum", "values": ["slow", "fast"], "default": "slow", "label": "Pace" },
  "shelves": { "type": "list", "max": 10, "default": ["Fiction", "Work"], "label": "Shelves" }
}
```

A setting's name is lower-case letters, digits and underscores. Each one has a `type`, and may have a `default`, a `label` a person reads and a `note` that says what it does. An `enum` names its `values`, and a `list` is a few lines of text, with `max` saying how many.

The types a setting may take are `text`, `enum`, `bool`, `money`, `day`, `duration`, `number`, `list` and `secret`. Two field types are left out on purpose, and a setting of one is refused:

- **`ref`**, because a setting that pointed at a list would let a pack configure its way into a list it did not declare.
- **`file`**, because a manifest is a file people share, so a setting never holds a document.

A **`secret`** setting never holds a credential either: it holds the label of a key in the Keychain, such as `"Calendar link"`, and a script names `{{config:<name>}}` in its `keys`. A link or a key typed into it is refused. Install asks for that key to be in the Keychain first. When the pack works without it, because there is another way in, write `"optional": true` on the setting: the pack then installs with the key missing, and its script is the one that skips quietly until the key is added. Calendar does this, since Connect Google fills the same list. A key that is there but cannot be opened is still refused, and `optional` is a `secret` setting's only.

A default is checked the way a row's field is: a money default is an amount and a currency, a day is a day that exists, and a text that looks like a key is refused.

## In a declaration: `{{config:<name>}}`

Anywhere in a declaration, `{{config:<name>}}` stands for a setting's value:

```code | A rule that tags with the owner's chosen word
{
  "rule": "due_soon",
  "name": "Tag what is due within a week",
  "on": { "written": { "register": "items", "op": ["create", "update"], "fields": ["due"] } },
  "when": "due before +7d",
  "steps": [{ "tag": "{{config:tag}}" }]
}
```

It is filled when the pack is planned and installed, from the value the owner chose or else the default, so the plan shows the rule as it will run. Changing a setting later changes nothing already installed: a declaration reads it again when the pack is next planned and installed. A placeholder for a setting the manifest does not declare is refused.

## In a script: `ctx.config`

A script reads its pack's settings as `ctx.config`, with every default filled in:

```code | overdue.js
/**
 * Tag each open item that is due within the owner's chosen number of days.
 */
export default async function run(ctx) {
  const days = ctx.config.days;
  const soon = new Date(Date.parse(ctx.now()) + days * 86400000).toISOString().slice(0, 10);
  for (const row of await ctx.record.list('items', { field: 'state', is: 'open' })) {
    const tags = row.fields.tags ?? [];
    if (row.fields.due && row.fields.due <= soon && !tags.includes(ctx.config.tag))
      ctx.update('items#' + row.seq, { tags: [...tags, ctx.config.tag] }, row.version);
  }
}
```

Unlike a placeholder, `ctx.config` is read at each run, so a change on the settings screen holds from the next run with no reinstall. It is frozen: a script cannot change the owner's settings by writing to it. A script no pack owns reads `{}`.

## What a setting cannot do

A setting changes a value, never what a pack can reach. It cannot name a list, so it cannot open one the pack did not declare, and it cannot hold a key. Write every address a pack calls out to in full; [scripts and calling out](/docs/packs/scripts) says why.
