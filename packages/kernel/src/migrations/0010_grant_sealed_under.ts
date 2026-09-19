/**
 * The kernel schema, migration 10: which of the record's two keys sealed a grant.
 *
 * WHY A COLUMN AND NOT AN INFERENCE. `12 §6` keeps two data keys apart, `record` and `connector`, so that what a
 * scheduled run can open is only ever a credential meant for one — even if a runner were compromised outright. The
 * separation was real in the vault and invisible in the grant table: a row carried `kek_id`, which says which KEK
 * wrapped the key, and said nothing at all about WHICH key. So `sealedGrant` reached for the connector DEK and handed
 * it back beside whatever ciphertext the row held, and a credential a person had sealed under the record key was
 * offered to a runner that could not open it.
 *
 * THE FAILURE THAT WAS NOT A REFUSAL. Handing back the wrong pair does not produce a wrong answer, it produces a
 * decrypt that throws in the host, several layers from the cause, with nothing in the record saying why. The column
 * turns that into `OUT_OF_BOUNDS` at the door, in one sentence, before any bytes leave.
 *
 * `'record'` IS THE DEFAULT, AND IT IS THE HONEST ONE. Every grant that exists when this runs was sealed by
 * `bindGrant` with no notion of a connector key, which means the record's. Defaulting to `'connector'` would be
 * claiming a fact about old rows nobody checked, and the claim would be wrong in exactly the direction that matters.
 * The cost is that an existing credential must be re-sealed before a connector can use it, which is right: nothing
 * else can turn a record-sealed secret into a connector-sealed one.
 *
 * NOT A FORMAT REVISION. The column is `NOT NULL DEFAULT`, so an older `.brain` file imports without it and reads as
 * `'record'`, which is what those rows are. `30-BLUEPRINT §11`'s format stays 1.
 */
export default `
ALTER TABLE grant ADD COLUMN sealed_under TEXT NOT NULL DEFAULT 'record'
  CHECK (sealed_under IN ('record','connector'));
`;
