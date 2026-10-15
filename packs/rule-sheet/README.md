# Rule sheet
Fourteen pages in one section, drawn as tabs, that put every rule of a value, a block and a layout on a real record:
Values, Blocks, Counts, Layout, and Tab 5 to Tab 14. A project called Rule sheet also gets a page, `/p/rule-sheet`,
holding the Counts ring as a project draws it, where it counts that project's tasks and the ones on no project.
Since 1.1.0 that page also reads the project's own next step, how many domains and repositories it holds and its
day, and Values shows one day as it reads in Greenwich time and in Cairo at the same moment; `expect.json`'s `example` is
the invented project a proof record holds for those lines.
`expect.json` says, rule by rule, which page to open, where to look on it and what should be read there. The gate that
reads it is `tools/gates/rule-sheet.mjs`. It is installed on proof records, and needs Work and Portfolio. The pages
read the record's own tasks, so a record with none draws the counts as nothing.
