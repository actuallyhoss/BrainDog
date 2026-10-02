/**
 * The kernel schema, migration 21: `suggestion.drafted_by`, who drafted a question Slash filed.
 *
 * `opened_by` SAYS SLASH FILED IT AND NOT WHERE IT CAME FROM. Slash files what its own rules drafted from how the record
 * is used and what a model drafted, both as `slash`, and Decide says which ("From how you use BrainDog", or the model's
 * name). That was known only to the press that filed it: after a reload a waiting question could say neither. `rules` is
 * Slash's own rules, any other value is the model's name, and NULL is a question filed before this column, or by anybody
 * but Slash, which says nothing about who drafted it.
 *
 * ONE NULLABLE COLUMN AND NO REBUILD, as `0020` is: an older file imports without it and reads NULL, which is what that
 * file knew, so the format is still 1.
 */
export default `
ALTER TABLE suggestion ADD COLUMN drafted_by TEXT;
`;
