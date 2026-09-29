/**
 * The kernel schema, migration 15: `token.reach`, what the owner let a token open beyond its scope.
 *
 * An agent reads the money inbox when the token he mints names the `inbox` reach. The record's gate (d41ec831) reads
 * `reach` on the token principal, and before this there was nowhere to keep it: `createToken` wrote scope and label,
 * and a token minted "with the inbox reach" verified as one without it (`test/token-reach.test.ts`).
 *
 * A JSON LIST, OR NULL FOR NONE. The list is closed in code (`TOKEN_REACHES` in `token.ts`) and not in a CHECK, because
 * the next reach would otherwise be a table rebuild; the CHECK only refuses what could never be read as a list, so a
 * hand-written `'inbox'` fails here rather than as a substring match at the gate. Every row that existed before reads
 * NULL, which is what it was: a token that reaches nothing beyond its scope.
 *
 * NOT A FORMAT REVISION. `token` is `local`, so no `.brain` file carries it.
 */
export default `
ALTER TABLE token ADD COLUMN reach TEXT CHECK (reach IS NULL OR (json_valid(reach) AND json_type(reach) = 'array'));
`;
