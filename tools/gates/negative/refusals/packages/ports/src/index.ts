/* A fixture. The pack family is one code short of the table it is checked against. */

/** Pack and declaration — 47. */
const PACK = [
  'KIND_UNKNOWN', 'FIELD_TYPE_UNKNOWN', 'FIELDS_OVER_CAP', 'INDEXES_OVER_CAP', 'PATTERN_OVER_CAP',
  'METRIC_NEEDS_TARGET_OR_WINDOW', 'MIXED_CURRENCY', 'CONTRAST_FLOOR', 'REQUIRED_ON_POPULATED', 'ID_RENAMED',
  'COLOUR_OUTSIDE_THEME', 'DEPENDENCY_UNRESOLVED', 'CREATE_UNBOUNDED', 'CREATE_OVER_BOUND',
  'CREATE_FOREIGN_REGISTER', 'TRANSITION_ILLEGAL', 'GROUP_BY_TWICE', 'GROUP_BY_CARDINALITY',
  'RATIO_MIXED_SOURCE', 'RATIO_MIXED_CURRENCY', 'QUANTITY_MIXED_UNIT', 'STATE_NOT_ENUM',
  'FORMAT_OUT_OF_RANGE', 'PRIMITIVES_OUT_OF_RANGE', 'BAND_EDGES_MISMATCH', 'SERIES_HAS_NO_TEXT',
  'REQUIRED_WHEN_OP_UNSUPPORTED', 'PREDICATE_CYCLE', 'SEQ_PREFIX_TAKEN', 'SEARCH_FIELD_TYPE',
  'FIELD_TYPE_CHANGED', 'PROVIDES_MISMATCH', 'PLAN_STALE', 'THEME_VALUE_INVALID', 'INTENT_INSEPARABLE',
  'THEME_LADDER_ORDER', 'PACK_MALFORMED', 'PROVIDES_CONFLICT', 'REMOTE_ASSET', 'SECRET_IN_PACK',
  
  /* The 2026-09-08 audit's six: a caller naming a declaration this record has not got. The family is
     named for what its codes are ABOUT and not for the moment they are raised — `TRANSITION_ILLEGAL`
     above has said "one code, two moments" since the first draft — which is why a page read at 7am
     belongs here rather than under a family whose first line is "refused before any row is written". */
  'DECLARATION_UNKNOWN', 'PAGE_UNKNOWN', 'METRIC_UNKNOWN', 'SOURCE_UNKNOWN', 'LOOKUP_UNKNOWN',
  'LOOKUP_MISSING',
] as const;

/** Grammar — 14. */
const GRAMMAR = [
  'PREDICATE_TOO_DEEP', 'VIA_TWICE', 'VIA_NESTED_SUBQUERY', 'MONEY_LITERAL_NEEDS_CURRENCY',
  'QUANTITY_LITERAL_NEEDS_UNIT', 'MATCH_FIELD_UNKNOWN', 'MATCH_OP_UNSUPPORTED', 'CONTAINS_TOO_LONG',
  'RELATIVE_LITERAL_UNKNOWN', 'RELATIVE_UNIT_FOR_DAY', 'EXTRACTOR_UNKNOWN', 'DATE_FORMAT_INVALID',
  'PATH_INVALID',
  /* THE ONE THAT WAS RENAMED AWAY AND HAD TO COME BACK. `REF_UNKNOWN` reads like `VALUE_MALFORMED`,
     whose row says "an unresolvable id or spoken reference" — and `declare`'s rule linter branches
     on it, surviving this refusal and no other because a name with nothing behind it today may be
     written tomorrow. Two refusals are one when no caller has to tell them apart. One does. */
  'REF_UNKNOWN',
] as const;

/** Write path — 18. */
const WRITE = [
  'REGISTER_UNKNOWN', 'FIELD_UNKNOWN', 'ROW_LOCKED', 'HUMAN_ONLY', 'TEXT_JSON_QUOTED',
  'TEXT_ESCAPED_NEWLINE', 'INT_OUT_OF_RANGE', 'VALUE_MALFORMED', 'REQUIRED_MISSING', 'ENUM_VALUE_UNKNOWN',
  'OUT_OF_BOUNDS', 'IMMUTABLE_FIELD', 'UNIQUE_VIOLATION', 'ALREADY_KNOWN', 'REF_REGISTER_MISMATCH',
  'DELETE_WHILE_REFERENCED', 'VERSION_STALE', 'LEVEL_REQUIRED',
] as const;

/** Auth and vault — 7. */
const AUTH = [
  'UNAUTHORIZED', 'FORBIDDEN', 'NEEDS_BROWSER_SESSION', 'WRONG_KEY', 'GRANT_REVOKED', 'DEVICE_CODE_EXPIRED',
  'DEVICE_CODE_TRIES',
] as const;

/** Format and lifecycle — 8. */
const LIFECYCLE = [
  'FORMAT_NEWER_THAN_READER', 'CHECKSUM_MISMATCH', 'SIGNATURE_INVALID', 'IMPORT_NOT_EMPTY',
  'SCHEMA_MISMATCH', 'SCHEMA_NEWER',
  /* Two facts the family already implied and had no word for: a file that is not a `.dogl` at all
     (nothing has been checksummed, so `CHECKSUM_MISMATCH` would be a lie), and a declaration that is
     correct against its document and ahead of this code — the same sentence the three `*_NEWER*`
     codes say about a version integer, which is why it is filed beside them. */
  'FILE_MALFORMED', 'NOT_IN_THIS_BUILD',
] as const;

/** Dialect — 2. */
const DIALECT = [
  'DIALECT_ARITY', 'DIALECT_KIND_UNKNOWN',
] as const;

/** Slash — 5. */
const SLASH = [
  'PROPOSAL_UNCITED', 'PROPOSAL_NO_ROWS', 'PROPOSAL_SCHEMA', 'PREDICTION_UNMEASURABLE', 'SLASH_BUDGET_SPENT',
] as const;

/** Connector — 7. */
const CONNECTOR = [
  'PULL_AUTH_REJECTED', 'PULL_PROVIDER_UNAVAILABLE', 'PULL_REQUEST_REFUSED', 'PULL_EXPECT_FAILED',
  'PULL_SHAPE_MISMATCH', 'PULL_ORIGIN_REFUSED', 'PULL_LEASE_EDGE',
] as const;

/**
 * Host and client — 4. The ninth family, and the one this document had never had.
 *
 * The other eight are all about the record's CONTENT — what a pack may declare, what a predicate may
 * ask, what a write may do — and none of them is about the surface every caller actually touches. So
 * `serveApi`, the self-host and the client each invented a word, and `httpStatus` grew a table of
 * codes `30 §6` had never heard of. That is not a tidiness problem: a code outside the registry is a
 * code outside the status map, and `RECORD_UNAVAILABLE` — which said `SCHEMA_UNAVAILABLE` while
 * having nothing to do with a schema — therefore answered **422** for a record nobody may act on,
 * where `49 §5.1` step 5.3 says 503.
 */
const HOST = [
  'ROUTE_UNKNOWN', 'BODY_MALFORMED', 'RECORD_UNAVAILABLE', 'UNREACHABLE',
] as const;
/** The hundred and twelve, in `30 §6`'s order. */
export const REFUSAL_CODES = [
  ...PACK, ...GRAMMAR, ...WRITE, ...AUTH, ...LIFECYCLE, ...DIALECT, ...SLASH, ...CONNECTOR, ...HOST,
] as const;
