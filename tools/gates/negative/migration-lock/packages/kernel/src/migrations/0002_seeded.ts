/** A planted second migration, locked as `name TEXT` and then edited by one byte to `nane TEXT`. */
export default `
ALTER TABLE seeded ADD COLUMN nane TEXT;
`;
