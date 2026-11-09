/**
 * `where:` — one predicate, one grammar, and the two things you can do with it.
 *
 * SEVEN CONSUMERS READ THIS: a block's query, a saved view, a rule's condition, a metric's window,
 * an ingest match, a lock, and an agent's `list`. They must agree, and the only way to be sure they
 * agree is for there to be one of it. The frontend learned this the expensive way — a page's
 * predicate and a URL's filter chips were two languages, and they disagreed about whether a date
 * was before today.
 *
 * TWO RENDERINGS, ONE MEANING. `compile` turns a predicate into SQL over `entry`, for the register
 * it was checked against; `evaluate` answers the same question about one row already in memory,
 * which is what a rule needs mid-write and what a test can assert without a database. A test here
 * runs both and compares, because two renderings that disagree are worse than one that is slow.
 *
 * A PREDICATE IS CHECKED AGAINST A REGISTER BEFORE IT IS RUN. A field that does not exist, an
 * operator its type cannot take, a value outside an enum — each is a refusal with a sentence, not a
 * clause that quietly matches nothing. The failure that motivated it: `state is not done` on a
 * register with no `done` state was true of every row, so a filter that looked like it had worked
 * returned the whole register.
 */

import type { Refusal } from '@braindog/ports';

export const QUANTIFIERS = ['all', 'any', 'none'] as const;
export type Quantifier = (typeof QUANTIFIERS)[number];

/**
 * `34 §1.1`'s nineteen tests, AND `matches`, WHICH IS NOT ONE OF THEM.
 *
 * The comment here said nineteen and the array holds twenty. Both are right about different things:
 * `§1.1`'s `test` production names nineteen, and `matches` is a LEAF FORM beside it — `{ matches: "…" }`
 * with no subject, because it asks about the register's text rather than about a field. It is in this list
 * so that the walk finds it where it finds the others, and the cost is that the refusal reciting "one of"
 * offers `matches` as a test. Left as it is, said out loud: taking it out would mean a second lookup on the
 * path every leaf takes, to fix a sentence rather than an answer.
 *
 * `near` needs the full-text index and is not read here yet.
 */
export const OPERATORS = [
  'is', 'not', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'before', 'after', 'between',
  'contains', 'matches', 'starts', 'ends', 'empty', 'present', 'has', 'lacks', 'near',
] as const;
export type Operator = (typeof OPERATORS)[number];

export type Money = { amount: number; currency: string };
export type Quantity = { value: number; unit: string };
export type Scalar = string | number | boolean | Money | Quantity;

export type Leaf = { field: string; via?: string } & Record<string, unknown>;
export type Group = { all: Node[] } | { any: Node[] } | { none: Node[] };
/**
 * A HOP AGAINST THE REF: true of a row when a live row of `register` whose ref field `by` holds this
 * row's id matches `where`. "Categories with a ledger row going the other way" and "projects with
 * nothing coming in" are both this shape, and `via` cannot say either: `via` walks a ref FORWARD, from
 * the row that holds it, and these walk it backwards, from the row it names. The key is `register`, not
 * `list`, so the kernel's reach check counts the list it reads with no change of its own.
 */
export type Pointed = { pointed: { register: string; by: string; where?: Predicate } };
export type Node = Group | Leaf | Pointed;
export type Predicate = Node;

/** What the predicate is allowed to name, and what each field can hold. */
/**
 * WHAT A SCHEMA SAYS ABOUT ONE FIELD, IN ONE PLACE.
 *
 * This shape was written out by hand in five places across two files, each one listing the keys
 * its own caller happened to read. They drifted, silently and in the direction that matters: the
 * kernel has always put `of` and `to` here, four of them named neither, and `sentence.ts` read
 * `to` through a sixth hand-written copy that did. A `list` is not a type on its own — `list<ref>`
 * and `list<text>` take different values — so a narrowing that drops `of` turns a filter over a
 * `list<ref>` into a search of a column of row ids for a title: it parses, it compiles, and it
 * matches nothing for ever. One name, and a key added to it reaches every reader at once.
 */
export type FieldSpec = {
  type: string;
  /** The element type of a `list`, which is the type `has` and `lacks` carry a value in. */
  of?: string;
  /** The register a `ref` points at, which is how a title is resolved to the id the column holds. */
  to?: string;
  values?: readonly string[];
  label?: string;
  labels?: Readonly<Record<string, string>>;
  /**
   * On a `day`: the day a row is due by, which the row carries from the moment it is written, rather
   * than the day something happened. The grammar does not read it; the kernel's as-of window does,
   * because a bill due on the 10th was already owed on the 5th and a payment on the 10th had not
   * happened yet.
   */
  deadline?: boolean;
  /**
   * WORKED OUT AT READ AND NEVER STORED (`02 §5`, the kernel's `derive.ts`): a total that is price times quantity,
   * filled where a row leaves the record. There is no value under it in the store to compare, so a filter or a sort
   * that names it would match nothing or sort by nothing; `derivedFault` refuses both in one sentence.
   */
  derived?: boolean;
  /**
   * A FIELD WORKED OUT THROUGH A LINK (`derive: { via }`): the ref on this list and the field read on the row it names.
   * Nothing is stored under it either, and a filter over it is answered on that row, as a semi-join, wherever the
   * schema can name the other list (`schemaOf`). So "filed under a category that says so" is a clause of the row's
   * own sentence, and a figure over the Ledger can leave such rows out.
   */
  through?: { ref: string; field: string };
  /** A `json` field of parts, each a patch over its row, adding up to this money field (the kernel's `parts.ts`). */
  parts_of?: string;
};

/** The one sentence a filter or a sort over a field worked out at read is refused with. */
export const derivedRefusal = (field: string): string => `${field} is worked out at read and never stored, so it cannot be filtered or sorted on.`;

/**
 * Why `field` of `schema` cannot be filtered or sorted on because it is worked out at read, or null.
 *
 * `MATCH_OP_UNSUPPORTED`, THE CODE THIS FILE GIVES A FIELD THAT CANNOT BE ASKED A TEST, because that is what it is: the
 * field exists and is named right, and no comparison reaches it. Exported so the kernel's `ORDER BY` refuses a sort in
 * the same words the compiler refuses a filter.
 */
export function derivedFault(schema: Pick<Schema, 'fields'>, field: string): Refusal | null {
  if (!Object.hasOwn(schema.fields, field) || schema.fields[field]?.derived !== true) return null;
  return { code: 'MATCH_OP_UNSUPPORTED', fix: derivedRefusal(field), at: field };
}

export type Schema = {
  register: string;
  /**
   * WHO IS LOOKING, WHEN A ROW KEPT PRIVATE BY SOMEBODY ELSE MUST NOT BE READ (kernel migration 40). Every `compile`
   * against this schema ends in that exclusion, so a figure, a forecast or a list built on it cannot count the row.
   */
  except?: string | undefined;
  /**
   * EVERY ROW OF THIS LIST KEPT FROM WHOEVER READS, when what each row says is worked out from rows kept private from
   * them (the kernel's nightly `snapshots`, whole-record totals). A `compile` against it is still checked and matches no
   * row, so a figure over the list reads it empty, as `list` answers it; a hop into it finds nothing, and a field read
   * through a link into it reads as null.
   */
  withheld?: true | undefined;
  /**
   * WHICH BACKEND, `34 §1.11`'s own word. Absent means `entry`, which is every register.
   *
   * IT EXISTS SO THAT "EXACTLY THESE FIELDS" CAN BE TRUE. `34 §1.9` says an ingest `match:` may name
   * exactly `from to subject body channel state ts`, but `specOf` grants every schema the record's five
   * kernel columns as well, so `{ field: id }` resolved against an arrival that has no such column. On
   * `entry` that fallback is right and load-bearing; on `inbox_raw` it is a name the grammar does not have.
   */
  subject?: 'entry' | 'inbox_raw';
  /**
   * `label` IS OPTIONAL AND IT IS NOT DECORATION.
   *
   * A page prints its own `where:` back to the reader using each field's LABEL, so
   * `direction is owed_to_me` is shown as `which way is owed to me`. Fed back to the record, that
   * was `FIELD_UNKNOWN: obligations has no field called which`: seven of the eleven filters the
   * shipped pages print could not be read by the record that printed them. The browser's copy of
   * this grammar accepts labels, which is why nobody noticed, and a differential pass over the
   * shipped seed is what found the two disagreeing.
   *
   * THE SENTENCE FORM IS FOR PEOPLE AND THE STRUCTURED FORM IS FOR MACHINES, which is `38 §1`'s own
   * division: a sentence somebody can be shown and cannot type back is not a sentence.
   */
  /**
   * AND `of` AND `to` ARE PART OF THE TYPE, not two keys that happen to be in the object.
   *
   * `list` is not a type on its own — `list<ref>` and `list<text>` take different values, and this
   * record published neither the element type nor the register a ref points at. Both were already
   * being put here by the kernel and read by `sentence.ts` through a hand-written parameter type,
   * which is a structural read of an undeclared key: it works until somebody trims the object to
   * what the type says, and then a filter over a `list<ref>` silently goes back to searching a
   * column of ids for a title. A key two files depend on belongs in the type they share.
   */
  fields: Record<string, FieldSpec>;
  /**
   * WHICH FIELD THE RECORD MIRRORS ONTO THE `state` COLUMN, AND WHY IT IS NOT JUST THE WORD.
   *
   * `02 §1` settles in bold that a predicate over the state compiles against the mirrored COLUMN
   * rather than the JSON, and `34 §1.2` and `38 §5.1` both write the exception as the NAME
   * `state`. The name is not enough, and the seed proves it twice over. A register declares which
   * of its fields is its lifecycle with a `state:` key, and one of the shipped registers points
   * that key at a field called `lane`; going by the name would have read a column for a register
   * that has no field called `state` and missed the one it does mirror. In the other direction, a
   * register may declare an ENUM field called `state` and no `state:` key at all, which installs
   * today: the write path mirrors nothing, the column stays NULL on every row of it, and a
   * predicate reading the column would have matched nothing while the JSON holds the answer.
   *
   * So the schema says which field is mirrored and this package believes it. Absent means the
   * register mirrors nothing, which is what a register with no lifecycle does.
   */
  state?: string;
  /**
   * WHETHER THE REGISTER IS A SERIES, WHICH HAS NO TEXT TO ASK ABOUT.
   *
   * `38 §2.2` writes this field into the schema by name, and `02 §5` turns off *"`matches`,
   * `contains`, `near`, `starts`, `ends` in any `where:` over the register"*, *"refused at install:
   * a series has no text"*. The schema had no such field and nothing sent one, so the rule was kept
   * by nothing. Driven against a `series: true` register holding two rows:
   *
   *     list, contains over a series register    ACCEPTED rows=1
   *     list, starts over a series register      ACCEPTED rows=1
   *     install, rule when contains over it      ACCEPTED
   *     install, metric where contains over it   ACCEPTED
   *     list, matches over a series register     REFUSED MATCH_OP_UNSUPPORTED, "it needs the text index"
   *
   * The answers were right. What was wrong is that a document states a rule and nothing kept it,
   * over the one register shape built to grow without bound, and that `matches` was refused for a
   * reason true of every register rather than the one true of this one. Absent means not a series.
   */
  series?: boolean;
  /**
   * THE SCHEMA OF ANOTHER REGISTER, WHICH A `pointed` HOP NEEDS TO CHECK THE QUESTION IT ASKS THERE.
   *
   * Absent means this compiler reads one register at a time and refuses the hop, as it refuses `via`:
   * an inner predicate nobody checked is a filter that compiles and matches nothing for ever, which is
   * the failure this package exists to prevent. `undefined` from the function is a register the record
   * does not have.
   *
   * AND A REGISTER THE READER MAY NOT READ IN FULL, which is the caller's to answer and not this file's.
   * The hop reads every live entry of the other register: it knows no grant, so a reader who cannot see
   * that list, or sees it narrowed to some entries, would learn about the entries they cannot see from
   * which of their own come back. Answering `undefined` refuses the hop as `REGISTER_UNKNOWN`, in the
   * same words as a list the record lacks, so the refusal does not say the list is there either. A
   * schema handed to `compile` for a predicate somebody sent is built per reader, never shared.
   */
  schemaOf?: (register: string) => Schema | undefined;
};

export type Compiled = {
  /** A SQL fragment over `entry`, parenthesised, safe to drop into a WHERE. */
  sql: string;
  params: (string | number)[];
  /** Everything the predicate asked for that could not be resolved. Non-empty means: run nothing. */
  bad: Refusal[];
};

/**
 * IS THIS A NODE AT ALL, which is a question this file did not used to ask.
 *
 * `packages/host` JSON-DECODES EVERY QUERY VALUE, so a caller chooses the SHAPE of `where` as well
 * as its contents: `?where=null`, `?where=5` and `?where={"all":{"length":1}}` are all things a
 * stranger can send. Each one reached `'matches' in leaf` or `childrenOf(…).map` and threw a
 * TypeError straight out of `k.list`, which is a 500 on a read. The kernel coerces `limit`, `cursor` and
 * `order` at the edge for exactly this reason and says so in as many words; `where` was left out of
 * that fix. A refusal is a value here, and an exception is not one.
 */
const isNode = (n: unknown): n is Node => typeof n === 'object' && n !== null && !Array.isArray(n);

const isGroup = (n: Node): n is Group => isNode(n) && ('all' in n || 'any' in n || 'none' in n);

const quantifierOf = (g: Group): Quantifier => ('all' in g ? 'all' : 'any' in g ? 'any' : 'none');
/* THE CHILDREN AS THE CALLER SENT THEM, and `unknown` rather than `Node[]` because the caller sends
   them. `?? []` read `{all: {length: 1}}` as a group with one child and then called `.map` on an
   object; the two readers below ask whether it is a list before they walk it. */
const childrenOf = (g: Group): unknown => ('all' in g ? g.all : 'any' in g ? g.any : g.none);

/**
 * A LEAF WITH SEVERAL TESTS IS ALL OF THEM, one leaf per test.
 *
 * `{field: 'n', gt: 1, lt: 3}` read only the first operator found and dropped the second, so a
 * range written the obvious way answered a wider question than it asked. Both renderings split the
 * leaf here, so both read it as `all` of its tests.
 *
 * AND `present: false` IS `empty`, and `empty: false` is `present`. The value used to be ignored,
 * so `present: false` matched exactly the rows it asked to leave out.
 */
const splitLeaf = (leaf: Record<string, unknown>): Record<string, unknown>[] => {
  const ops = OPERATORS.filter((o) => o in leaf);
  if (ops.length === 0) return [leaf];
  if (ops.length === 1 && !((ops[0] === 'present' || ops[0] === 'empty') && leaf[ops[0]] === false)) return [leaf];
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(leaf)) if (!(OPERATORS as readonly string[]).includes(k)) rest[k] = v;
  return ops.map((o) => {
    const v = leaf[o];
    if ((o === 'present' || o === 'empty') && v === false) return { ...rest, [o === 'present' ? 'empty' : 'present']: true };
    return { ...rest, [o]: v };
  });
};

/**
 * The JSON path a field is stored at, and the ONE place it is spelled.
 *
 * The partial index and the predicate have to be the same string or the index is never used, and
 * "the query got slow" is the only symptom — a year after somebody renamed a helper.
 */
/**
 * A field id as a JSON path, and the grammar check that makes it safe to inline.
 *
 * THE FIELD ID IS THE ONE IDENTIFIER THAT BECOMES SQL. Every value in this package is a bound
 * parameter; a path cannot be, because SQLite has no placeholder for one. So the grammar is the
 * security boundary, and this file has always said so — and two other files built the same string
 * by hand, from ids a PACK supplies. A pack is meant to be safe to install from a stranger.
 *
 * IT THROWS RATHER THAN RETURNING A REFUSAL, and that is deliberate: an id that reaches here without
 * having been checked is a bug in the caller, not a value a person typed, and the callers that take
 * one from a declaration validate it at install. This is the backstop, and a backstop that returns
 * a value can be ignored.
 */
export const jsonPath = (field: string): string => {
  if (!IDENT.test(field)) throw new TypeError(`${field} is not a field id, and a field id is what becomes a JSON path.`);
  return `$.${field}`;
};

const IDENT = /^[a-z][a-z0-9_]{0,31}$/;

/** A money or quantity value is an OBJECT, so its number lives one level down. */
const NUMERIC_SUBPATH: Record<string, string> = { money: '.amount', quantity: '.value' };

/**
 * THE FIVE THE RECORD KEEPS FOR ITSELF, AND THEY WERE ADDRESSABLE NOWHERE.
 *
 * `02 §6` publishes six field names that any `where:` may use without a register declaring them,
 * `id seq state created_at updated_at version`, and `38 §4.3` item 13 gives the type of the five
 * that are not `state`. The schema the kernel hands this compiler is the DECLARED fields and
 * nothing else, so `{ field: created_at, after: '-7d' }`, which is *rows added this week* and about
 * as ordinary a question as a register gets asked, came back `FIELD_UNKNOWN: obligations has no
 * field called created_at`. So did `id`, `seq`, `updated_at` and `version`. The refusal was honest,
 * which is why nothing was silently wrong: it was a capability three documents publish and this
 * package did not have.
 *
 * THE FALLBACK LIVES HERE AND NOT IN THE KERNEL'S `schemaOf`, and that is the whole reason
 * `38 §4.3` puts the list in this package. There are seven consumers of this grammar and two
 * renderings of it; adding five keys to one register-to-schema function would have taught the SQL
 * compiler a name the in-memory evaluator still could not read, which is the two-languages failure
 * this file's header opens by saying the package exists to prevent.
 *
 * `state` IS NOT ONE OF THEM, and leaving it out is deliberate. It is the sixth of `02 §6`'s six
 * and it resolves only when the register declares it, as that register's own enum (`38 §4.3`
 * item 13). A register with no lifecycle has no states to name, and `state is open` against one
 * should stay a refusal rather than quietly become a comparison against a column that is NULL on
 * every row of it, which is the clause that matches nothing this file was written against.
 */
export const KERNEL_FIELDS: Readonly<Record<string, string>> = {
  id: 'ref',
  seq: 'int',
  created_at: 'instant',
  updated_at: 'instant',
  version: 'int',
};

/**
 * The second backend's fields: `34 §1.9`'s `from to subject body channel state ts`, and the sender read out of `from`
 * as `from_name from_address from_domain`, ten names and nothing else.
 *
 * IT IS HERE BECAUSE THE GRAMMAR IS HERE. An ingest `match:` asks a question about an arrival rather than a
 * row, and `extract` is the package that asks it — but which names are legal, and what each one holds, is a
 * fact about the grammar and not about the asker. Put it in `extract` and the day a field is added there are
 * two lists, which is the same failure the path grammar had in three places.
 *
 * AND `§1.9`'s OTHER HALF IS ENFORCED HERE NOW, which the paragraph this replaces said could not be. It
 * argued that a schema cannot express the operator refusal, because `starts` on a text field is legal on
 * `entry` and refused here and the type is the same text either way. That is true of the TYPE and it was
 * never the question: the fact belongs to the backend, and `subject` is where the backend is written down.
 * Once `subject` became a property of the schema (`34 §1.11`), the thing that could not be said became one
 * comparison. See `INBOX_RAW_REFUSES`.
 */
/**
 * `34 §1.9`'s seven refused words, whatever field they are about.
 *
 * `via matches near` ARE IN THE LIST AND ALSO REFUSED EVERYWHERE, because this build reads no text index
 * and hops no ref. Keeping them here anyway makes this constant `§1.9`'s sentence rather than the part of
 * it this build happens to need, so the day the text index lands nobody has to notice that three of the
 * seven were being refused for an unrelated reason and are now unrefused for this one.
 *
 * READ BY `declare` TOO. It kept its own copy of these seven, beside a hand-kept copy of the field names
 * that had already drifted once. One list, exported by the package that owns the grammar.
 */
export const INBOX_RAW_REFUSES = ['via', 'has', 'lacks', 'near', 'matches', 'starts', 'ends'] as const;

/** The fourteen an arrival keeps, for the refusal to recite. `OPERATORS` minus the six of the seven in it. */
export const ARRIVAL_OPERATORS: readonly string[] = OPERATORS.filter(
  (o) => !(INBOX_RAW_REFUSES as readonly string[]).includes(o),
);

export const INBOX_RAW: Schema = {
  register: 'inbox_raw',
  subject: 'inbox_raw',
  fields: {
    /* `json_extract(headers, '$.<name>')`, lower-cased on arrival. */
    from: { type: 'text' },
    /* THE SENDER READ ONCE, beside `from` and never instead of it: `"Sara Ali" <sara@bank.example>` is `Sara Ali`,
       `sara@bank.example` and `bank.example`, so a pattern says `{ field: from_domain, is: bank.example }` and never
       takes the header apart with `contains`. The kernel fills them on arrival (`senderOf`); empty when it cannot. */
    from_name: { type: 'text' },
    from_address: { type: 'text' },
    from_domain: { type: 'text' },
    to: { type: 'text' },
    subject: { type: 'text' },
    /* The body AS STORED. `43 §5.2` step 1 is explicit that it is not the normalised copy, so that this
       answer equals the `instr(lower(body), lower(?))` the record could run over the same row. */
    body: { type: 'text' },
    channel: { type: 'enum', values: ['email', 'webhook', 'pull', 'paste', 'api'] },
    state: { type: 'enum', values: ['untriaged', 'matched', 'skipped', 'review', 'proposed', 'ignored', 'erased'] },
    ts: { type: 'instant' },
  },
};

/**
 * WHICH NAMES READ A COLUMN INSTEAD OF A KEY OF THE `fields` JSON.
 *
 * `02 §1` raises the question of what `{ field: state, is: open }` compiles against, calls it *not
 * a detail, the whole thing* for a state machine, and settles it in bold: `state` is mirrored, and
 * the predicate compiles against the COLUMN. `34 §1.2` and `38 §5.1` both restate it. This function
 * had no exception in it, so every leaf went through `json_extract(fields, '$.state')`.
 *
 * THE ANSWERS WERE RIGHT AND THAT IS WHY IT SURVIVED. The write path stores `state` inside `fields`
 * and mirrors it onto the column on the same statement, so reading the JSON gave the same value.
 * What was lost is the one thing the exception was granted for: `migrations/0001_kernel.ts` creates
 * `CREATE INDEX entry_state ON entry(register, state) WHERE deleted_at IS NULL`, and no predicate
 * this package emitted could use it. An index scan and a whole-register scan return the same rows,
 * so the only symptom is that the query got slow, which is the symptom nobody attributes.
 *
 * THE SET IS CLOSED AND EVERY MEMBER IS A LITERAL WRITTEN HERE, which is what makes handing the
 * name straight back safe where `jsonPath` has to check the grammar first. A field that satisfies
 * this test IS one of these five strings, and none of the five can carry a quote. The record
 * reserves all five (`34 §4`), so no register can declare one and there is nothing to disambiguate
 * against, which is exactly what is NOT true of `state`: see `Schema.state` and `mirrorsState`.
 */
export const isColumn = (field: string): boolean => Object.hasOwn(KERNEL_FIELDS, field);

/** The column `entry` mirrors a register's state onto, spelled once. `02 §1`, `30 §1`. */
const STATE_COLUMN = 'state';

/**
 * Does this register mirror THIS field onto the `state` column?
 *
 * The argument for asking the schema rather than the name is on `Schema.state`. This is the whole
 * of the exception `02 §1` grants, and it is one comparison.
 */
export const mirrorsState = (schema: Schema, field: string): boolean =>
  schema.state !== undefined && schema.state === field;

/**
 * What a field is allowed to hold, from the register or from the record's own five.
 *
 * ONE LOOKUP FOR BOTH RENDERINGS, for the reason `KERNEL_FIELDS` gives above: `compile` and
 * `evaluate` resolving a name by two different routes is how they come to disagree about which
 * names exist, and the disagreement is invisible until a rule fires on a row the list then does
 * not show.
 */
const specOf = (schema: Schema, field: string): FieldSpec | undefined =>
  Object.hasOwn(schema.fields, field)
    ? schema.fields[field]
    : schema.subject !== 'inbox_raw' && Object.hasOwn(KERNEL_FIELDS, field)
      ? { type: KERNEL_FIELDS[field]! }
      : undefined;

/**
 * Every name a predicate over this register may use, for the `allowed` list on a refusal.
 *
 * `38 §6` writes the sentence out: *"Use one of the register's fields: <ids…>, or id, seq,
 * created_at, updated_at, version."* A refusal that lists only the declared fields teaches an agent
 * that the other five do not exist, and `10 §7`'s whole contract is that the refusal teaches.
 */
/* AND NOT ON `inbox_raw`, WHERE THOSE FIVE ARE NOT COLUMNS. `specOf` withholds them there and this handed
   them out, so a refusal about an unknown field listed `created_at` among the names to use and the next
   call answered `FIELD_UNKNOWN` about it. One schema, two answers, and the one a person reads was the wrong
   one, which is the precise inverse of what `10 §7` asks a refusal to do. */
export const addressable = (schema: Schema): string[] =>
  schema.subject === 'inbox_raw'
    ? Object.keys(schema.fields)
    : [...Object.keys(schema.fields), ...Object.keys(KERNEL_FIELDS)];

/**
 * The SQL that reads one field, and it is EXPORTED so the sort and the filter cannot disagree.
 *
 * `31 §2` states the reason for `kernel -> where` in exactly these terms: this package owns
 * `jsonPath`, so `CREATE INDEX … json_extract(fields,'$.due')` and `WHERE
 * json_extract(fields,'$.due') < ?` are the same string, which is the difference between the
 * planner using the partial expression index and scanning it. An `ORDER BY` is the third place that
 * string has to be identical, and the kernel had no way to say it: `list` took no order at all, so
 * a page block declaring one was sorted by whatever the browser did afterwards, over the page it
 * had already been given.
 *
 * A MONEY OR QUANTITY SORTS BY ITS NUMBER, which is what `NUMERIC_SUBPATH` is for and why this is
 * one function rather than a caller building a path. Sorting `money` as an object sorts by the JSON
 * text, so `GBP 9.00` lands above `GBP 10.00`.
 *
 * AND A COLUMN IS A COLUMN, which is the exception `isColumn` above carries the argument for. It
 * is one line here and it reaches three places at once, because this is the one function that
 * spells a field expression: the filter, the sort and the kernel's `ORDER BY` all get the column
 * on the same commit. `part` is only ever passed for the two halves of a money or a quantity, and
 * none of the five is one, so the guard on it is belt and braces rather than a real case.
 *
 * IT DOES NOT KNOW ABOUT `state`, and that is why `fieldSqlIn` exists below. Whether a field is
 * the mirrored one is a fact about a REGISTER and this function is handed a field and a type, so
 * answering it here would mean guessing from the name, which `Schema.state`'s paragraph shows is
 * wrong in both directions.
 */
export const fieldSql = (field: string, type: string, part = ''): string =>
  part === '' && isColumn(field)
    ? field
    : `json_extract(fields, '${jsonPath(field)}${part || NUMERIC_SUBPATH[type] || ''}')`;

/**
 * The expression that reads one field OF A GIVEN REGISTER, and the one everything should call.
 *
 * `fieldSql` plus the one thing `fieldSql` cannot know on its own. It is exported for the same
 * reason `fieldSql` is and stated in the same terms by `31 §2`: the index, the filter and the
 * `ORDER BY` are the same string or the planner does not use the index, and "the query got slow"
 * is the only symptom a year later.
 */
export const fieldSqlIn = (schema: Schema, field: string, type?: string): string =>
  mirrorsState(schema, field)
    ? STATE_COLUMN
    : fieldSql(field, type ?? schema.fields[field]?.type ?? KERNEL_FIELDS[field] ?? 'text');

const extract = fieldSql;

/** The half of a compound value that is not its number: a currency, a unit. */
const QUALIFIER: Record<string, { part: string; key: string }> = {
  money: { part: 'currency', key: 'currency' },
  quantity: { part: 'unit', key: 'unit' },
};

const ORDERED = new Set(['int', 'decimal', 'duration', 'money', 'quantity', 'day', 'instant']);
/**
 * The types `contains`, `starts` and `ends` read the letters of.
 *
 * NOT `secret`, WHOSE COLUMN HOLDS THE ID OF A GRANT IN THE VAULT AND NEVER THE SECRET. Admitted here, the JSON form
 * compiled `{ field: token, contains: a }` and matched or missed rows on the letters of an id nobody is shown, while
 * the sentence refused the same question (`sentence.ts`'s `SPOKEN_AS_NOT_STORED`). A secret still answers `empty` and
 * `present`, the two questions a sealed field can.
 */
const TEXTUAL = new Set(['text', 'document', 'url', 'email', 'enum', 'ref']);

/**
 * A CURRENCY IS UPPER CASE ON THE WAY IN, SO IT IS UPPER CASE IN THE QUESTION TOO.
 *
 * `{ amount: 100000, currency: 'gbp' }` RETURNED NOTHING while `'GBP'` returned three rows, with an
 * empty `bad` list either way. The write path upper-cases: `coerce.ts:187` ends
 * `currency: currency.toUpperCase()`, and `34 §3` gives the stored shape as `"currency": "EGP"`,
 * so a lower-case literal is compared against a column that can never hold one. `evaluate` compares
 * with `===` as well, so both renderings agreed by both being wrong, which is the one kind of
 * disagreement the differential test at the bottom of `where.test.ts` cannot see.
 *
 * NORMALISED RATHER THAN REFUSED, and the reason is that `coerce` normalises. `CURRENCY` there is
 * `/^[A-Za-z]{3}$/`: a person who writes `gbp` in a row gets a row, and a person who writes `gbp` in
 * a filter would have got a refusal for the same three letters. One spelling accepted by the write
 * and refused by the read is the second language this package exists not to be, and
 * `MONEY_LITERAL_NEEDS_CURRENCY` would be the wrong sentence for it anyway, because the currency is there.
 *
 * A UNIT IS NOT FOLDED, because it is not a code. `coerce` only trims a quantity's unit, `m` is
 * metres and `M` is not, and case-folding one would answer a question about millilitres with megalitres.
 */
const canonicalHalf = (type: string, half: unknown): unknown =>
  type === 'money' && typeof half === 'string' ? half.toUpperCase() : half;

/**
 * Which operators a type can take at all. An operator its type cannot take is a refusal.
 *
 * EXPORTED, BECAUSE THE SENTENCE FORM HAS TO ASK THE SAME QUESTION. `sentence.ts` learned to say
 * `is empty` and `is set`, and the only two ways to know which fields may be asked that are to call
 * this or to write the table out a second time. A second copy is the drift this package is built
 * against: `38 §4.3` is one relation, and a relation held in two places is two relations the day
 * one of them is edited. The row it reads today says `empty` and `present` apply to every type
 * (`34 §1.2`, *"every type"*), so nothing is refused by this on those two yet, and that is the
 * point: the day the table narrows, both renderings narrow together.
 */
export function operatorAllowed(op: Operator, type: string): boolean {
  if (op === 'empty' || op === 'present') return true;
  if (op === 'is' || op === 'not' || op === 'in' || op === 'not_in') return type !== 'list';
  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte' || op === 'between') return ORDERED.has(type);
  if (op === 'before' || op === 'after') return type === 'day' || type === 'instant';
  if (op === 'contains' || op === 'starts' || op === 'ends') return TEXTUAL.has(type);
  if (op === 'has' || op === 'lacks') return type === 'list';
  return false;
}

/**
 * The clause that keeps a compound value whole.
 *
 * A money value is an amount AND a currency; a quantity is a number AND a unit. Comparing only the
 * numbers is the exact mistake minor units exist to make impossible, and it was being made
 * everywhere except `is` and the ordered operators.
 */
function qualifier(field: string, type: string, value: unknown, put: (v: string | number) => string): string {
  const q = QUALIFIER[type];
  if (!q || typeof value !== 'object' || value === null) return '';
  const half = (value as Record<string, unknown>)[q.key];
  return half === undefined ? '' : ` AND ${extract(field, type, `.${q.part}`)} = ${put(String(canonicalHalf(type, half)))}`;
}

/**
 * The qualifier a value would carry, as a plain string — or `null` where it carries none.
 *
 * FOR DEDUPLICATING BEFORE BINDING. The clause `qualifier` returns has a literal `?` in it, so two
 * different currencies produce the same string; deduplicating those and binding as you go puts more
 * parameters in the list than there are placeholders in the SQL.
 */
function currencyKey(field: string, type: string, value: unknown): string | null {
  const q = QUALIFIER[type];
  if (!q || typeof value !== 'object' || value === null) return null;
  const half = (value as Record<string, unknown>)[q.key];
  return half === undefined ? null : String(canonicalHalf(type, half));
}

/** Forty bytes. Past it a `LIKE` pattern reaches a platform ceiling that differs between hosts. */
const CONTAINS_MAX = 40;

/**
 * Three groups, counting the outermost as the first, and it is the documents' number rather than one
 * chosen here.
 *
 * `02-DATA-MODEL` §6: *"Groups nest to depth 3, counting the root group as level 1; a fourth level
 * is refused at install (`PREDICATE_TOO_DEEP`)."* `30 §6`'s table of ceilings says the same, and
 * `38-SPEC-WHERE` §5.3 writes it as rule G1, *"a group at `level > 3` … refuse, do not descend"*,
 * which is why the check below returns before it walks the children rather than after.
 *
 * THERE WAS NO COUNTER AT ALL. `walk` and `one` recursed as far as the JSON went, and `JSON.parse`
 * accepts a four-thousand-deep `all:` happily, so a read a stranger can send was a `RangeError:
 * Maximum call stack size exceeded` and a 500. `PREDICATE_TOO_DEEP` has been in `REFUSAL_CODES`
 * since the first draft with nothing anywhere emitting it.
 */
const MAX_DEPTH = 3;

/**
 * SIXTY-FOUR VALUES, WHICH IS WHERE A LIST STOPS BINDING ONE PARAMETER A VALUE.
 *
 * Three documents publish the number: `34 §1.10`'s limits table, `02 §6`'s operator table, and
 * `38 §5` step 3, which writes the algorithm out: slice at 64, one group per slice, `in` slices joined
 * with OR and `not_in` slices with AND, one parenthesis around them when there is more than one. A
 * list of 250 once came out of here as a single OR chain of 250 terms, and an unbounded OR chain is
 * an unbounded expression tree, which meets the Durable Object's expression depth
 * (`DO_LIMITS.exprDepth`), the one ceiling `guard` cannot count because counting it needs a parser.
 *
 * CHUNKING NEVER LOWERED THE PARAMETER COUNT, and the count is what a long list actually meets: the
 * adapter's hundred (`DO_LIMITS.variableNumber`), which the Durable Object refuses at 101 and `guard`
 * refuses as `TOO_MANY_PARAMS` wherever a host runs its statements through `guarded`. So above this
 * many values a field whose values carry no qualifier binds the whole list as ONE parameter instead
 * (`inJson` below), and a 300-value `in` on a text field is one `?`.
 * At or below it nothing changed: one bound value a member, the string this file always produced.
 *
 * MONEY AND QUANTITY STILL CHUNK, AND THEIR CEILING IS THE HUNDRED. Each of their values is a pair,
 * a number and the currency or unit it is in, and both halves are bound: an `in` of n money values
 * binds 2n parameters, and a `not_in` binds 2n plus one for each distinct currency. `kernel.list`'s
 * first-page statement binds the register and the limit beside them, so counted from that statement a
 * money `in` of 49 values is exactly 100 parameters and a fiftieth is `TOO_MANY_PARAMS`; a paged or
 * sorted page binds its cursor too and stops sooner. A chunk of 64 pairs is therefore never reached
 * through a list, and the chunk stays for the shape's sake. Lifting the hundred for them means
 * comparing both halves of each element inside the subquery, which is a different shape from
 * `inJson`'s and is not built.
 */
const IN_CHUNK = 64;

/** The clauses in slices of `IN_CHUNK`, in order. `38 §5` step 3: 130 values become 64, 64 and 2. */
const chunk = (clauses: string[]): string[][] => {
  const out: string[][] = [];
  for (let i = 0; i < clauses.length; i += IN_CHUNK) out.push(clauses.slice(i, i + IN_CHUNK));
  return out;
};

/**
 * A LONG LIST AS ONE BOUND PARAMETER: `lhs IN (SELECT value FROM json_each(?))`, the list bound as
 * one JSON text.
 *
 * `30 §7`'s `IN` row names this as the upgrade, and `38 §10`'s fifth ponytail records why: a predicate
 * could bind about ninety-five literal values in total (`38 §7`) before the adapter refused the
 * statement, so a filter that worked on a short list became a refusal on a long one.
 *
 * IT ANSWERS THE SAME ROWS AS THE `=` CHAIN IT REPLACES. `json_each` reads a JSON string out as TEXT
 * and a JSON number as a number, as a string and a number bound on their own arrive, and its `value`
 * column carries no affinity, so a `json_extract` read on the left compares with no conversion
 * either side: `2` is not `"2"` here any more than it was there. A bool arrives as the
 * 1 or 0 `bind` made of it, which is what `json_extract` reads a stored `true` or `false` as. A column
 * on the left (`seq`, the mirrored `state`) applies its affinity to the subquery's values as it did to
 * a bound one, because SQLite treats `a IN (SELECT b ...)` as `a = b` when it chooses an affinity.
 *
 * THE ONE PARAMETER IS BOUNDED BY SIZE, NOT BY COUNT. One bound text may weigh `DO_LIMITS.length`,
 * and a list sent to `/api` or `/mcp` arrives in a body those doors cap at a mebibyte
 * (`API_BODY_MOST_BYTES` in `packages/host`, `MAX_BODY_BYTES` in `packages/mcp`). A list too heavy for
 * one text is the driver's refusal, as a statement over the hundred was before.
 *
 * A NUMBER THAT IS NOT FINITE NEVER COMES HERE, because `JSON.stringify` writes it as `null`, and a
 * `NULL` inside `NOT IN` makes the answer NULL for every row the list does not hold. `compile` keeps
 * such a list on the chain, where the value is bound on its own and `guard` refuses it by name.
 */
const inJson = (lhs: string, values: readonly (string | number)[], put: (v: string | number) => string): string =>
  `${lhs} IN (SELECT value FROM json_each(${put(JSON.stringify(values))}))`;

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

const refuse = (code: string, fix: string, at?: string, allowed?: readonly string[]): Refusal => ({
  code,
  fix,
  ...(at === undefined ? {} : { at }),
  ...(allowed === undefined ? {} : { allowed }),
});

/** A day and an instant are written as a string; the three plain numbers are written as a number. */
const TEMPORAL = new Set(['day', 'instant']);

/**
 * A BARE DAY, WHICH IS WHAT A PERSON MEANS BY `today`.
 *
 * An `instant` is stored to the second and a day is ten characters, so `last_seen is today`
 * compiled to `last_seen = '2026-09-03'` against `'2026-09-03T11:57:00.000Z'` and matched NOTHING,
 * on every record, whatever it held. Its negation therefore matched EVERYTHING: `last_seen is not
 * today` returned the whole register. The sentence grammar resolves a relative word to a day, which
 * is right; the comparison was never made day-granular to meet it.
 *
 * A PERSON ASKING FOR TODAY MEANS THE DAY AND NOT THE SECOND, which is the rule the browser's copy
 * of this grammar has carried since it was written, and a differential pass over the shipped seed
 * is what found the two disagreeing. It applies to `before` and `after` too: without it a same-day
 * instant sorts AFTER the bare day it falls on, so `after today` included rows from this morning
 * while `before today` correctly excluded them, which is not an exclusive pair.
 */
const DAY_ONLY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
const asDay = (type: string, value: unknown): boolean =>
  type === 'instant' && typeof value === 'string' && DAY_ONLY.test(value);

const NUMERIC = new Set(['int', 'decimal', 'duration']);

/** The literal a comparison binds, or a refusal if the value is not one this type can hold. */
function bind(value: unknown, type: string): string | number | null {
  /**
   * A COMPOUND VALUE'S NUMBER, AND IT HAS TO BE A NUMBER.
   *
   * This read `.amount` off the object and returned whatever was there, which for
   * `{ currency: 'GBP' }` is `undefined` and not `null`. Every guard downstream is `=== null` or
   * `.filter((v) => v !== null)`, so the missing amount walked past all of them, `put(undefined)`
   * pushed it into `params`, and `node:sqlite` answered `TypeError: Provided value cannot be bound
   * to SQLite parameter 2`, which is a throw out of a read on a body a caller can send. `carriesUnit`
   * checks the CURRENCY half, so the literal passed the money guard on its way here.
   */
  if (type === 'money' || type === 'quantity') {
    const key = type === 'money' ? 'amount' : 'value';
    const half = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
    return typeof half === 'number' && Number.isFinite(half) ? half : null;
  }

  /* A BOOLEAN IS A BOOL'S LITERAL AND NOBODY ELSE'S, and `typeof value === 'boolean'` used to sit
     ABOVE this branch, so it answered for `int`, `decimal`, `duration`, `day` and `instant` as
     well. `{field: 'n', gt: false}` compiled to `json_extract(…,'$.n') > 0` and returned three
     rows while `evaluate` returned none, because `numeric()` and `comparable()` there answer `null`
     for a boolean. That is a rule firing mid-write and the list drawn afterwards disagreeing
     about the same row, which is the failure this package exists to make impossible.

     AND THE STRINGS THE SENTENCE GRAMMAR PRODUCES FOR ONE. `resolve` answers the string `'true'`
     for `done is yes`, `json_extract` answers the integer `1`, and `1 = 'true'` is false in SQLite
     — so the sentence form matched NOTHING while the structured form matched correctly, and the
     negation of the same sentence matched EVERYTHING. The second half of that is the clause that
     quietly matches every row, which this file's own header is written against. */
  if (type === 'bool') {
    if (value === true || value === 'true') return 1;
    if (value === false || value === 'false') return 0;
    return null;
  }

  /* A DAY IS A STRING AND A NUMBER IS NOT ONE, which is the same gap from the other side.
     `{field: 'due', gt: 0}` fell through to the catch-all below and compiled to a real comparison
     that SQLite answers TRUE of every dated row, because it orders INTEGER before TEXT: every
     obligation in the register, from a filter that looked like it had asked about a date. `evaluate`
     matched none of them. `VALUE_MALFORMED` is what the caller gets now, from the branches that
     already say it: a `day` takes a day, and an `int` takes an integer. */
  if (TEMPORAL.has(type)) return typeof value === 'string' ? value : null;
  if (NUMERIC.has(type)) return typeof value === 'number' && Number.isFinite(value) ? value : null;

  /* THE TEXTUAL TYPES STILL TAKE EITHER, and that is not an oversight: `has` and `lacks` bind an
     element of a list through here as `text`, and a list of `int` holds numbers. */
  if (typeof value === 'number' || typeof value === 'string') return value;
  return null;
}

/**
 * WHICH ELEMENT OF A LIST COUNTS AS THE VALUE, AND SQLITE'S `=` IS NOT THE EVALUATOR'S `===`.
 *
 * `json_each` reads a JSON `true` out as the integer 1 and a JSON `false` as 0, so the one-line
 * `WHERE value = ?` of `34 §1.2` matched a row holding `[true, false]` when the number 1 was bound,
 * while `38 §5.5`'s `eq`, which `evaluate` renders as `===`, did not. One row, two answers, from
 * the two halves of one grammar, which is the failure this package exists to prevent.
 *
 * SO THE ELEMENT'S JSON TYPE IS PART OF THE COMPARISON. `json_each.type` is the one thing left in
 * SQLite that still knows a `true` from a 1 and a 2 from a `"2"` once the value has been read out,
 * and knowing those two apart is the whole of what `===` knows here.
 *
 * A BOOLEAN IS COMPARED BY ITS TYPE ALONE, because the JSON types are spelled `true` and `false`
 * and there is nothing else to ask. `bind` is not on this path for one: it answers `null` for a
 * boolean under every type but `bool`, so `{field: tags, has: true}` was `VALUE_MALFORMED` and
 * `list<bool>` was a field a register may declare (`38 §4.3`) and nobody could ask about. The
 * literal is bound rather than written into the string, by `compile`'s own rule below.
 *
 * `null` IS NOT ONE. `34 §1.1` gives `scalar` as a string, a number, a boolean, a money, a
 * quantity, a ref, a day or an instant, and `34 §1.3` makes a JSON `null` a spelling of missing,
 * so a list holding one holds nothing there. The refusal is the caller's answer, and `evaluate`
 * answers false for a predicate `compile` refuses, so both renderings match nothing.
 */
const elementSql = (value: unknown, put: (v: string | number) => string): string | null => {
  if (typeof value === 'boolean') return `json_each.type = ${put(value ? 'true' : 'false')}`;
  const bound = bind(value, 'text');
  if (bound === null) return null;
  const kind = typeof bound === 'number' ? "IN ('integer', 'real')" : "= 'text'";
  return `json_each.value = ${put(bound)} AND json_each.type ${kind}`;
};

/**
 * Compile a predicate against a register into SQL and bound parameters.
 *
 * NOTHING IS INLINED. Every value is a bound parameter and every identifier has already matched
 * `^[a-z][a-z0-9_]{0,31}$` before it reaches a string — the field ids are inlined into
 * `json_extract` paths, which is the one place an identifier becomes SQL, so the grammar check is
 * the security boundary and not a nicety.
 */
export function compile(where: Predicate | undefined, schema: Schema): Compiled {
  const c = compileAt(where, schema, 1);
  if (c.bad.length || schema.subject === 'inbox_raw') return c;
  /* A LIST WHOSE EVERY ROW IS KEPT FROM WHOEVER READS (`withheld`): the question is still checked, and no row meets it. */
  if (schema.withheld === true) return { sql: '0', params: [], bad: [] };
  if (schema.except === undefined) return c;
  return { sql: `(${c.sql}) AND ${unprivate()}`, params: [...c.params, schema.except], bad: [] };
}

/**
 * THE ONE SQL CLAUSE THAT LEAVES OUT A ROW ITS MAKER KEPT PRIVATE (migration 40) for everybody but that maker; binds one
 * parameter, the viewer. Every raw-SQL reader that bypasses `compile` uses this and never writes it again. A reader with
 * no one in particular (a stored figure, a sweep) binds `''`, which is nobody, so no private row is in it.
 */
export const unprivate = (col = 'id'): string => `${col} NOT IN (SELECT entry_id FROM entry_private WHERE person_id <> ?)`;

/** The same clause for a line of the log: one about a row its maker kept private is left out for anybody else. Binds the viewer once. */
export const unprivateLine = (col = 'target'): string =>
  `NOT (${col} LIKE 'entry:%' AND substr(${col}, 7) IN (SELECT entry_id FROM entry_private WHERE person_id <> ?))`;

/* THE SAME COMPILE, STARTED PART WAY DOWN, which is how a `pointed` hop asks its question of the other
   register: the inner predicate counts toward `MAX_DEPTH` from where the hop sits, so a hop inside a hop
   inside a hop is refused as a fourth level and not walked until the stack gives out. */
function compileAt(where: Predicate | undefined, schema: Schema, start: number): Compiled {
  const bad: Refusal[] = [];
  const params: (string | number)[] = [];

  /**
   * A HOP AGAINST THE REF, COMPILED AS A SEMI-JOIN ON THE ROW'S OWN `id`.
   *
   * The scope asked for a correlated `EXISTS`, and a correlated `EXISTS` has to name the outer row,
   * which this fragment cannot: the kernel's list reads `FROM entry e` and the figures read a bare
   * `FROM entry`, so `e.id` breaks one and `entry.id` the other. `id IN (SELECT <by> FROM entry AS hopN
   * …)` asks the same question with the outer row named by a bare `id`, which resolves to whichever
   * alias the caller chose. The inner predicate is compiled by this same function against the other
   * register's schema, and its bare `fields` and `state` resolve to `hopN`, the innermost table.
   *
   * THE NULLS ARE KEPT OUT ON PURPOSE. A ledger entry with nothing in `by` would put a NULL in the set,
   * and `NOT (id IN (…, NULL))` is NULL for every row the set does not hold, so `none: [pointed]`
   * would have answered nothing at all.
   *
   * ONE PARAMETER FOR THE REGISTER, plus whatever the inner predicate binds, and none per row: the set
   * is the database's to build, which is what keeps a figure over a thousand categories one statement.
   */
  const hop = (leaf: Record<string, unknown>, level: number): string => {
    const no = (code: string, fix: string, allowed?: readonly string[]): string => {
      bad.push(refuse(code, fix, 'pointed', allowed));
      return '';
    };
    if (Object.keys(leaf).length !== 1)
      return no('VALUE_MALFORMED', 'pointed is a test of its own. Write the other test beside it, inside an all: group.');
    if (level > MAX_DEPTH)
      return no('PREDICATE_TOO_DEEP', `A predicate nests ${MAX_DEPTH} levels deep, and a hop counts as one. Flatten it.`);
    if (schema.subject === 'inbox_raw')
      return no('MATCH_OP_UNSUPPORTED', 'pointed asks what points at an entry, and an arrival is not one yet.', ARRIVAL_OPERATORS);
    const p = leaf.pointed as Record<string, unknown> | null;
    if (!isNode(p as Node) || typeof p!.register !== 'string' || typeof p!.by !== 'string')
      return no('VALUE_MALFORMED', 'pointed takes the list to look in as register, the field there that points here as by, and an optional where.');
    const { register, by, where: asked } = p as { register: string; by: string; where?: Predicate };
    if (schema.schemaOf === undefined)
      return no('MATCH_OP_UNSUPPORTED', 'pointed is a hop from another list, and this build reads one register at a time.');
    const there = schema.schemaOf(register);
    /* `null` TOO, which is how the kernel's other lookups say "no such list", and an arrival is not a list of entries:
       its schema would compile against `inbox_raw`'s columns inside a read of `entry`. */
    if (!there || (there.subject ?? 'entry') !== 'entry') return no('REGISTER_UNKNOWN', `The record has no list called ${register}.`);
    const refs = Object.keys(there.fields).filter((f) => there.fields[f]!.type === 'ref');
    const decl = Object.hasOwn(there.fields, by) ? there.fields[by]! : undefined;
    if (decl === undefined) return no('FIELD_UNKNOWN', `${register} has no field called ${by}.`, refs);
    if (decl.type !== 'ref' || !IDENT.test(by))
      return no('MATCH_OP_UNSUPPORTED', `${by} on ${register} is a ${decl.type}, and pointed follows a field that points at one entry.`, refs);
    if (decl.to !== undefined && decl.to !== schema.register)
      return no('VALUE_MALFORMED', `${by} on ${register} points at ${decl.to}, so it never holds an entry of ${schema.register}.`, refs);
    const inner = asked === undefined ? undefined : compileAt(asked, there, level + 1);
    if (inner?.bad.length) {
      bad.push(...inner.bad);
      return '';
    }
    const alias = `hop${level}`;
    const held = `json_extract(${alias}.fields, '${jsonPath(by)}')`;
    /* AND NOT A ROW KEPT PRIVATE FROM WHOEVER READS (`except` on the list hopped into, kernel migration 40). The hop read
       every live entry there, so a category came back for a Ledger entry somebody else kept to themselves, and which of
       her own rows came back said that a row she is not shown exists. */
    /* AND NOTHING AT ALL FROM A LIST WHOSE EVERY ROW IS KEPT FROM THEM (`withheld`). */
    const kept = there.withheld === true ? ' AND 0' : there.except === undefined ? '' : ` AND ${unprivate(`${alias}.id`)}`;
    params.push(register, ...(inner?.params ?? []), ...(there.withheld === true || there.except === undefined ? [] : [there.except]));
    return (
      `id IN (SELECT ${held} FROM entry AS ${alias} WHERE ${alias}.register = ? AND ${alias}.deleted_at IS NULL` +
      ` AND ${held} IS NOT NULL${inner === undefined ? '' : ` AND (${inner.sql})`}${kept})`
    );
  };

  /**
   * A CLAUSE OVER A FIELD READ THROUGH A LINK, COMPILED AS A SEMI-JOIN ON THE ROW THE LINK NAMES.
   *
   * The test is asked of the far field on the linked row, by this same function against that list's schema, and the row
   * here passes when its link names a live row that passes. A row whose link names nothing, or a row that is gone, has
   * no value there, and is answered as a row with nothing in the field is (`evaluate` over no fields), which is what
   * `derive-rows.ts` shows it as: null. So `kept is false` holds for an entry with no category, and a figure that says
   * it still counts every entry nobody filed.
   *
   * A LIST THE READER MAY NOT READ IN FULL (`schemaOf` answering nothing) IS READ AS NULL TOO, as the derived value is
   * read for that reader, so nothing about the far rows is learnt from which near rows come back. A COMPILE WITH NO
   * `schemaOf` AT ALL refuses, as a hop does: a rule is evaluated in memory, where the far row is not to hand.
   */
  const through = (leaf: Record<string, unknown>, field: string, via: { ref: string; field: string }, level: number): string => {
    const no = (code: string, fix: string): string => {
      bad.push(refuse(code, fix, field));
      return '';
    };
    const link = Object.hasOwn(schema.fields, via.ref) ? schema.fields[via.ref]! : undefined;
    if (link === undefined || link.type !== 'ref' || typeof link.to !== 'string' || !IDENT.test(via.ref) || !IDENT.test(via.field))
      return no('MATCH_OP_UNSUPPORTED', `${field} reads through ${via.ref}, which is not a link ${schema.register} holds.`);
    const asked = { ...leaf, field: via.field } as Node;
    const type = schema.fields[field]?.type ?? 'text';
    const bare: Schema = { register: link.to, fields: { [via.field]: { type, ...(schema.fields[field]?.values ? { values: schema.fields[field]!.values } : {}) } } };
    const there = schema.schemaOf!(link.to);
    /* AND A LIST WHOSE EVERY ROW IS KEPT FROM THEM (`withheld`), as one they may not read. */
    const far = there && (there.subject ?? 'entry') === 'entry' && there.withheld !== true ? there : undefined;
    let missing = false;
    try {
      missing = evaluate(asked, {}, far ?? bare);
    } catch {
      missing = false;
    }
    if (far === undefined) return missing ? '1 = 1' : '0 = 1';
    const inner = compileAt(asked, far, level + 1);
    if (inner.bad.length) {
      bad.push(...inner.bad);
      return '';
    }
    const alias = `via${level}`;
    const held = fieldSql(via.ref, 'ref');
    const live = `SELECT ${alias}.id FROM entry AS ${alias} WHERE ${alias}.register = ? AND ${alias}.deleted_at IS NULL`;
    params.push(link.to, ...inner.params, link.to);
    return `(CASE WHEN ${held} IN (${live} AND (${inner.sql})) THEN 1 WHEN ${held} IN (${live}) THEN 0 ELSE ${missing ? 1 : 0} END = 1)`;
  };

  const walk = (node: Node, level: number): string => {
    /* A `where` THAT IS NOT A PREDICATE IS A REFUSAL AND NOT A THROW. `null`, `5` and `[1]` all
       reached the `'matches' in leaf` test below and came out of `k.list` as a TypeError. */
    if (!isNode(node)) {
      bad.push(
        refuse('VALUE_MALFORMED', `A predicate is a group or a leaf, and ${JSON.stringify(node) ?? 'undefined'} is neither.`, 'where'),
      );
      return '';
    }

    if (isGroup(node)) {
      /**
       * A GROUP THAT NAMES TWO QUANTIFIERS IS REFUSED, AND IT USED TO ANSWER THE FIRST ONE.
       *
       * `Group` is a union of three one-key objects, and nothing checked that an incoming object
       * was one of them: `quantifierOf` and `childrenOf` each take the FIRST key they find, in the
       * order `all any none`. Measured against the suite's own fixture, `{all: [state is open],
       * none: [n gt 2]}` compiled with `bad=[]` and returned `a, d, e`; the `none` leg asked for
       * `a` to be left out, because `a` holds `n: 3`, and `a` came back. The whole second leg was
       * dropped in silence, which is worse than one wrong row: the SQL carries no trace of the
       * question that was skipped, so the person reading the list cannot see what happened.
       *
       * TypeScript REJECTS THE SHAPE AND THAT IS NOT THE GUARD, because a predicate is a value off
       * the wire on every one of the seven paths that read this grammar: `packages/host`
       * JSON-decodes `?where=`, a saved view is a row somebody stored, a pack is a file from a
       * stranger.
       *
       * IT IS A REFUSAL AND NOT A QUIET AND OF THE TWO LEGS. Reading the shape as an implicit `all`
       * would give a new meaning to a predicate that is already sitting in saved views and pack
       * files, so a list a person has read every morning for months would return fewer rows the day
       * they upgraded, with nothing on screen to say why. An ambiguous filter must say it cannot be
       * read. The fix line names the two words actually in the object rather than reciting the
       * three, because the reader's job is to delete one of their own.
       */
      /* `in` AND NOT A VALUE CHECK, WHICH IS A DECISION AND NOT AN OVERSIGHT. A key written
         explicitly and left `undefined` refuses, where before the guard it compiled as the other
         leg. That is deliberate on three grounds: `quantifierOf` and `childrenOf` both read the
         shape with `in`, so the guard agrees with the two readers it protects; the spec's
         invariant is about which keys a node has, not what they hold; and JSON cannot carry
         `undefined` at all, so no predicate arriving over the wire or out of a pack can reach it.
         The one caller that could is TypeScript writing `{ all: xs, none: cond ? ys : undefined }`,
         and a sweep of the tree found no such site. It is pinned by a test either way, because a
         boundary nobody asserted is a boundary that moves the next time somebody refactors here. */
      const named = QUANTIFIERS.filter((k) => k in node);
      if (named.length > 1) {
        bad.push(
          refuse(
            'VALUE_MALFORMED',
            `A group asks one question of its children, and this one names ${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}. Keep one, and write the other as a group nested inside it.`,
            'where',
            QUANTIFIERS,
          ),
        );
        return '';
      }
      const q = quantifierOf(node);
      /* REFUSED WITHOUT DESCENDING, which is `38-SPEC-WHERE` §5.3's rule G1 word for word and also
         the only way the check is worth having: descending first is the `RangeError` it prevents. */
      if (level > MAX_DEPTH) {
        bad.push(
          refuse(
            'PREDICATE_TOO_DEEP',
            `A predicate nests ${MAX_DEPTH} groups deep, counting the outermost as the first. Flatten it.`,
            q,
          ),
        );
        return '';
      }
      const said = childrenOf(node);
      /* `all: {length: 1}` IS NOT A GROUP WITH ONE CHILD. `?? []` made a missing list an empty
         group, which `all` reads as every row, and an object with a `length` reached `.map`. */
      if (!Array.isArray(said)) {
        bad.push(refuse('VALUE_MALFORMED', `${q} takes a list of predicates, and this one has ${JSON.stringify(said) ?? 'nothing'}.`, q));
        return '';
      }
      const kids = (said as Node[]).map((k) => walk(k, level + 1)).filter(Boolean);
      /* An EMPTY GROUP is not an empty question. `all: []` is true of everything and `any: []` of
         nothing, which is what the two words mean, and guessing either way would be a filter that
         silently passed or silently blocked. */
      if (kids.length === 0) return q === 'any' ? '0 = 1' : '1 = 1';
      /* `none` IS `NOT ANY`, and the difference bites the moment there are two children: joining
         with AND makes it "not all", which passes every row that fails only one of them. Both
         `34-GRAMMARS` §1.1 and `evaluate` below say NOT-OR, and this said NOT-AND — invisible in
         the tests because every `none` case in them had exactly one child, where the two joins are
         the same string. */
      const joined = kids.join(q === 'all' ? ' AND ' : ' OR ');
      return q === 'none' ? `NOT (${joined})` : `(${joined})`;
    }

    if ('pointed' in node) return hop(node as Record<string, unknown>, level);

    const leaf = node as Record<string, unknown>;

    const parts = splitLeaf(leaf);
    if (parts.length > 1) {
      const each = parts.map((p) => walk(p as Node, level));
      return each.every(Boolean) ? `(${each.join(' AND ')})` : '';
    }
    if (parts[0] !== leaf) return walk(parts[0] as Node, level);

    /**
     * `MATCH_OP_UNSUPPORTED`, AND NOT A CODE THIS FILE INVENTED FOR ITSELF.
     *
     * These four branches used to carry `WHERE_UNSUPPORTED`, `WHERE_OPERATOR_UNSUPPORTED` and
     * `WHERE_MALFORMED` — three names for one fact, none of them in `30 §6`, and none of them
     * anything a caller could branch on across versions. `30 §6` already has the code, and it is
     * written as the general one rather than as `inbox_raw`'s: *"`MATCH_OP_UNSUPPORTED` — the one
     * code for* this test cannot apply here*: `via has near matches starts ends` on the `inbox_raw`
     * backend (02 §6), an operator outside its type's set, `lacks` on a non-list, `near` anywhere but
     * the last leaf."* Every clause of that sentence is one of the branches below — `via`, `matches`,
     * `near`, an operator a type cannot take, an operator the switch does not implement — so the
     * grammar family had the word and this file spelled three of its own beside it.
     *
     * THE RULE IT KEEPS is `10 §7`'s: the refusal teaches, and it teaches from a code that is stable
     * across versions. An agent that learns `WHERE_UNSUPPORTED` from the compiler and
     * `MATCH_OP_UNSUPPORTED` from ingest has learned that the record has two words for one refusal,
     * which is the same as having none — and the browser's own compiler is a third consumer of this
     * grammar (34 §1, seven of them), so a name minted here is a name the whole product has to keep.
     *
     * A LEAF WITH NO TEST IS THE SAME FACT, and it is the branch below on `OPERATORS.find`. Either
     * the leaf named no operator or it named a word that is not one of the nineteen; both read as
     * *this test cannot apply here*, and the `fix` names the nineteen either way.
     */
    /* A SERIES HAS NO TEXT, AND THAT IS TRUE WHETHER OR NOT THIS BUILD READS THE TEXT INDEX.
       `38 §5.3` puts L5 (`matches` on a series) before L6 (an empty index), so the fact no deploy
       changes answers before the one a deploy would. `near` is L19's and is refused here with it,
       because this build refuses `near` below before it resolves a field at all. */
    if (schema.series === true)
      for (const key of ['matches', 'near'])
        if (key in leaf) {
          bad.push(
            refuse(
              'SERIES_HAS_NO_TEXT',
              `${key} over ${schema.register}, which is series: true. A series has no text; filter ${schema.register} on its key fields or its numbers.`,
              key,
            ),
          );
          return '';
        }

    /* `34 §1.9`, BEFORE THE BUILD-WIDE BRANCH BELOW, so a `matches` over an arrival is refused as a
       question the backend cannot be asked rather than as one this build has not implemented. The first is
       permanent and the second is a deploy away, and telling an author the second about the first sends
       them back to wait for a release that will not change the answer. */
    if (schema.subject === 'inbox_raw')
      for (const key of INBOX_RAW_REFUSES)
        if (key in leaf) {
          bad.push(
            refuse(
              'MATCH_OP_UNSUPPORTED',
              `${key} asks about a row, and a match: asks about an arrival. An arrival takes ${ARRIVAL_OPERATORS.join(', ')}.`,
              key,
              ARRIVAL_OPERATORS,
            ),
          );
          return '';
        }

    for (const key of ['matches', 'predicate', 'near'])
      if (key in leaf) {
        bad.push(
          refuse('MATCH_OP_UNSUPPORTED', `${key} is in the grammar and not read by this build: it needs the text index.`, key),
        );
        return '';
      }

    if ('via' in leaf && leaf.via !== undefined) {
      bad.push(refuse('MATCH_OP_UNSUPPORTED', 'via is a hop through a ref, and this build reads one register at a time.', 'via'));
      return '';
    }

    const field = leaf.field;
    /* `{not: {...}}` WITH NO FIELD IS SOMEBODY NEGATING A PREDICATE, and `not` compares a field with
       a value. `FIELD_UNKNOWN` about `undefined` did not say that. */
    if (field === undefined && 'not' in leaf && isNode(leaf.not)) {
      bad.push(
        refuse('VALUE_MALFORMED', 'not compares a field with a value. To leave out the rows a predicate matches, write none: [predicate].', 'not'),
      );
      return '';
    }
    if (typeof field !== 'string' || !IDENT.test(field)) {
      bad.push(refuse('FIELD_UNKNOWN', `A leaf needs a field, and ${JSON.stringify(field)} is not one.`, 'field'));
      return '';
    }

    /* `Object.hasOwn`, NOT a truthiness check: `constructor` is a real field id by the grammar and
       resolves against `Object.prototype`, so `{field: 'constructor', is: 'x'}` compiled to a clause
       that matched nothing — a filter that quietly returned an empty list, which is the failure this
       whole module exists to prevent. */
    /* AND THE RECORD'S OWN FIVE RESOLVE HERE TOO, which is `specOf`'s paragraph and `02 §6`'s
       list. This read `schema.fields` alone, so a register's declaration was the whole vocabulary
       and `created_at` was as unknown as a typo. */
    const decl = specOf(schema, field);
    if (!decl) {
      bad.push(
        refuse('FIELD_UNKNOWN', `${schema.register} has no field called ${field}.`, field, addressable(schema)),
      );
      return '';
    }

    /* A FIELD WORKED OUT AT READ HOLDS NOTHING IN THE STORE, so a clause over it is a filter that matches no row, UNLESS
       it is read through a link and this compile may hop: then it is asked of the linked row (`through`). */
    const worked = schema.subject === 'inbox_raw' ? null : derivedFault(schema, field);
    if (worked) {
      const via = schema.fields[field]?.through;
      if (via !== undefined && schema.schemaOf !== undefined) return through(leaf, field, via, level);
      bad.push(worked);
      return '';
    }

    const op = OPERATORS.find((o) => o in leaf);
    if (!op) {
      bad.push(
        refuse('MATCH_OP_UNSUPPORTED', `${field} carries no test this grammar knows. One of: ${OPERATORS.join(' · ')}.`, field, OPERATORS),
      );
      return '';
    }
    if (!operatorAllowed(op, decl.type)) {
      bad.push(
        refuse('MATCH_OP_UNSUPPORTED', `${field} is a ${decl.type}, which cannot be asked "${op}".`, field),
      );
      return '';
    }

    /* L19: THE OTHER THREE TEXT TESTS OVER A SERIES, after L18, so `contains` on one of a series'
       numbers is still the type's refusal and not this one. See `Schema.series`. */
    if (schema.series === true && (op === 'contains' || op === 'starts' || op === 'ends')) {
      bad.push(
        refuse(
          'SERIES_HAS_NO_TEXT',
          `${field}: ${op} over ${schema.register}, which is series: true. A series has no text; filter ${schema.register} on its key fields or its numbers.`,
          field,
        ),
      );
      return '';
    }

    const value = leaf[op];

    /**
     * THE `string` TERMINAL IS ONE BYTE OR MORE, and `""` is not a short string.
     *
     * `34 §1.1` writes it into the grammar — *"string = byte { byte }"* — and `34 §1.3` says why:
     * the empty string is MISSING. `34 §7` closes it from the other end, because a write stores
     * none of `null`, `""` or `[]`; the key is dropped. So no row in the record holds `""`, and a
     * leaf asking about one is asking a question of nothing.
     *
     * BOTH WAYS IT COMPILED WERE WRONG, AND IN OPPOSITE DIRECTIONS. `is: ""` became `field = ''`
     * and matched no row, ever. `contains: ""` became `instr(lower(field), lower(''))`, and SQLite
     * answers 1 for an empty needle, so it matched every row that had anything in the field. One
     * silently empty list and one silently complete one, from the same missing check — the pair of
     * failures this module exists to prevent, and `38 §4.1` invariant 6 has named them since
     * before the compiler was written.
     *
     * THE REFUSAL NAMES THE REPAIR, because a person who typed `""` meant one of two things and
     * the word is different for each: `empty: true` to ask for the rows that hold nothing, or a
     * value to ask for the rows that hold it.
     *
     * IT RUNS OVER EVERY VALUE THE OPERATOR TAKES, for the reason `carriesUnit` below is a
     * function rather than one comparison: `in` carries a list and `between` carries two, and a
     * rule that read only the scalar would leave `in: ['open', '']` compiling to a member that
     * nothing can match. `empty` and `present` are outside it — they carry the literal `true`, and
     * a rule whose repair is "write `empty`" has nothing to tell the leaf that already did.
     */
    if (op !== 'empty' && op !== 'present') {
      const carried = Array.isArray(value) ? value : [value];
      if (carried.some((v) => v === '')) {
        bad.push(
          refuse(
            'VALUE_MALFORMED',
            `${field} ${op} was given an empty string, and a value is one byte or more. An empty string is missing, so no row holds one: to ask for the rows with nothing in ${field}, write ${field} empty.`,
            field,
          ),
        );
        return '';
      }
    }

    /* AND THE MIRRORED STATE READS ITS COLUMN, which is `02 §1`'s decision and was in no line of
       this file: every leaf went through `json_extract(fields, '$.state')`, so `entry_state` was
       an index the compiler could not reach. See `fieldSqlIn`. */
    const path = fieldSqlIn(schema, field, decl.type);
    const put = (v: string | number): string => {
      params.push(v);
      return '?';
    };

    /* An enum value outside the declared set is the failure that motivated the whole evaluator:
       `state is not done` on a register with no `done` was true of every row.
       A `list<enum>` IS AN ENUM HERE, AND `values` IS HOW THE SCHEMA SAYS SO. This read
       `decl.type`, which is `list` and not `enum` for a `list<enum>`, so a literal the field
       cannot hold was never compared against anything. `Schema.fields` carries no `of`, it never
       has, and it does not need one: `values` means an enum's values and a plain list declares
       none, so a list that declares them is a `list<enum>` and nothing else is. Keying off the
       marker the schema already carries beats adding a key every builder would have to remember
       to set, which is the same forgetting this line is a case of. */
    const checkEnum = (v: unknown): boolean => {
      if ((decl.type !== 'enum' && decl.type !== 'list') || !decl.values) return true;
      if (typeof v === 'string' && decl.values.includes(v)) return true;
      bad.push(refuse('ENUM_VALUE_UNKNOWN', `${field} has no value ${String(v)}.`, field, decl.values));
      return false;
    };

    /**
     * A MONEY LITERAL CARRIES ITS CURRENCY AND A QUANTITY CARRIES ITS UNIT, or it is refused.
     *
     * `qualifier` RETURNED THE EMPTY STRING FOR A HALF THAT IS MISSING, so `amount over 1000` with
     * no currency compiled to a bare number comparison and matched every currency in the register:
     * a hundred thousand yen and a thousand pounds are the same integer, and the answer came back
     * confidently mixed. This file's own header says it in as many words twenty lines up: comparing
     * only the numbers is *"the exact mistake minor units exist to make impossible"*. The guard
     * against a mixed RANGE was written; the guard against no currency at all was not.
     *
     * `30 §6` line 916 SPECIFIES BOTH CODES for exactly this and both were emitted by nothing:
     * *"a literal without its currency or unit is refused"*. Two codes rather than one, because the
     * repair is a different word: send a currency, or send a unit.
     *
     * IT RUNS OVER EVERY VALUE THE OPERATOR TAKES, which is why it is a function rather than one
     * check: `between` carries two and `in` carries a list, and a rule that only read the scalar
     * would leave the range and the list compiling to the same silent match-everything.
     */
    const money = decl.type === 'money';
    const carriesUnit = (v: unknown): boolean => {
      const q = QUALIFIER[decl.type];
      if (!q) return true;
      /* BELOW OR ABOVE ZERO IS A SIGN, THE SAME IN EVERY CURRENCY (`signOnly`), so it needs none. */
      if (signOnly(op, decl.type, v)) return true;
      const half = typeof v === 'object' && v !== null ? (v as Record<string, unknown>)[q.key] : undefined;
      if (half !== undefined && half !== null && half !== '') return true;
      /* TWO CALLS AND NOT A TERNARY INSIDE ONE, so `refusals.mjs` can see both codes: it reads an
         emitted code as a literal after the constructor, crossing at most a condition with no quote
         in it, and `decl.type === 'money'` has one. Its header says why the pattern is that narrow:
         one that chewed through a whole file for an upper-case string would report enum values as
         refusal codes. */
      bad.push(
        money
          ? refuse(
              'MONEY_LITERAL_NEEDS_CURRENCY',
              `${field} is money, so this comparison needs a currency: { amount, currency }. Without one it matches every currency in the register.`,
              field,
            )
          : refuse(
              'QUANTITY_LITERAL_NEEDS_UNIT',
              `${field} is a quantity, so this comparison needs a unit: { value, unit }. Without one it matches every unit in the register.`,
              field,
            ),
      );
      return false;
    };
    if (QUALIFIER[decl.type] && op !== 'empty' && op !== 'present') {
      const said = leaf[op];
      const each = Array.isArray(said) ? said : [said];
      if (!each.every(carriesUnit)) return '';
    }

    switch (op) {
      /* THE THREE WAYS A VALUE IS ABSENT. A write stores none of them — `null`, `''` and `[]` all
         remove the key — but an IMPORT carries whatever the other record held, and a row written
         by an older build may carry an empty string. `IS NULL` alone read those as present, so a
         `where: note is empty` missed exactly the rows somebody was looking for. */
      case 'empty':
        return `(${path} IS NULL OR ${path} = '' OR ${path} = '[]')`;
      case 'present':
        return `(${path} IS NOT NULL AND ${path} <> '' AND ${path} <> '[]')`;

      case 'is':
      case 'not': {
        if (!checkEnum(value)) return '';
        const bound = bind(value, decl.type);
        if (bound === null) {
          /* NULL IS ASKED AS EMPTY: `is: null` is how most query languages ask for a missing value, and the
             refusal named no way to ask it here. */
          const empty = value === null ? ` For rows where it is ${op === 'not' ? 'set' : 'empty'}, send {"field":"${field}","${op === 'not' ? 'present' : 'empty'}":true}.` : '';
          bad.push(refuse('VALUE_MALFORMED', `${field} cannot be compared with ${JSON.stringify(value)}.${empty}`, field));
          return '';
        }
        /* A MONEY COMPARISON CARRIES ITS CURRENCY. Two currencies are two quantities, and comparing
           their numbers is the exact mistake minor units exist to make impossible.
           THE ORDER OF `put` IS THE ORDER OF THE PLACEHOLDERS: computing the currency clause first
           bound it to the amount's `?`, which made every money comparison match nothing — a filter
           that silently returned an empty list rather than a wrong one, which is the failure this
           whole package is built to avoid. */
        /* THE DATE PART WHEN THE BOUND IS A BARE DAY. See `asDay`: an instant is stored to the
           second, so comparing it against ten characters matched nothing and its negation matched
           everything. */
        const lhs = asDay(decl.type, bound) ? `substr(${path}, 1, 10)` : path;
        /**
         * `IS NOT NULL` FIRST, AND WITHOUT IT `none:` DROPPED EVERY ROW WITH NOTHING IN THE FIELD.
         *
         * `34 §1.3` and `02 §6` both say every positive operator is FALSE on a missing value, and
         * `02 §6` names the decision it rests on: *"SQL's three-valued surprises stop at the
         * compiler."* They did not stop here. `NULL = 'x'` is NULL, a `none:` group wraps its
         * children in `NOT (...)`, and `NOT NULL` is NULL rather than true, so a row with no value
         * in the field vanished from a query that should have kept it.
         *
         * IT IS THE TWO POSITIVE OPERATORS THAT WERE LEFT THREE-VALUED. `contains`, `gt`,
         * `between`, `starts` and `ends` all already open with this guard; `is` and `in` did not,
         * and they are the two a person writes most. The in-memory twin has always been two-valued,
         * because `absent` is tested before the comparison, so the two renderings of one grammar
         * disagreed about every `none:` over a sparse field.
         *
         * THE DIFFERENTIAL DID NOT SEE IT because all ten of its `none` cases name a field that
         * every fixture row happens to carry, which is the failure this file's own comment about
         * a shared mistake already names.
         */
        if (op === 'is') {
          const cmp = `${lhs} = ${put(bound)}`;
          return `(${path} IS NOT NULL AND ${cmp}${qualifier(field, decl.type, value, put)})`;
        }

        /* AND A FOREIGN-CURRENCY ROW IS NOT A MATCH EVEN UNDER NEGATION. `NOT(amount = 10000 AND
           currency = 'GBP')` is TRUE of a EUR row, so `fee is not GBP 100` returned every euro
           invoice in the record — a filter that quietly matched everything, which is the failure
           this module exists to prevent. The currency is asserted OUTSIDE the negation: a row in
           another currency is not the thing being talked about at all.

           THE QUALIFIER IS BOUND FIRST BECAUSE IT IS WRITTEN FIRST. `put` pushes in call order and
           the placeholders are read in string order, so computing the amount first here would bind
           the currency to the amount's `?` — the mistake the `is` branch above records. */
        const currency = qualifier(field, decl.type, value, put);
        const negated = `${lhs} = ${put(bound)}`;
        return currency
          ? `(${path} IS NULL OR (${currency.slice(' AND '.length)} AND NOT (${negated})))`
          : `(${path} IS NULL OR NOT (${negated}))`;
      }

      case 'in':
      case 'not_in': {
        const list = Array.isArray(value) ? value : [];
        if (list.length === 0) {
          /* `VALUE_MALFORMED`, WHICH THE NEXT BRANCH DOWN ALREADY SAYS FOR THE SAME FACT. An empty
             `in` and a member the field cannot hold are both "the value this operator was given is
             not the shape it takes", and `30 §6` writes that code as exactly that — *"a value outside
             its type's shape that cannot be coerced"*. Two codes eight lines apart for one sentence
             is how a registry stops being one. */
          bad.push(refuse('VALUE_MALFORMED', `${field} ${op} needs at least one value.`, field));
          return '';
        }
        for (const v of list) if (!checkEnum(v)) return '';
        const bounds = list.map((v) => bind(v, decl.type)).filter((v): v is string | number => v !== null);
        if (bounds.length !== list.length) {
          bad.push(refuse('VALUE_MALFORMED', `${field} was given a value it cannot hold.`, field));
          return '';
        }
        /* EVERY VALUE CARRIES ITS OWN QUALIFIER. `in` was compiled as a bare `IN (…)` over the
           amounts, so 24,000 EUR matched a list holding 24,000 GBP — the exact mistake the `is`
           branch was written to prevent, in the branch beside it. One clause per value, ORed. */
        /* AND EACH VALUE DECIDES ITS OWN GRANULARITY. See `asDay`: a bare day named against an
           instant is compared to the date part, and a full timestamp is compared as one, so a list
           holding both is answered correctly value by value. */
        const at = (i: number) => (asDay(decl.type, bounds[i]) ? `substr(${path}, 1, 10)` : path);
        /* AND `IS NOT NULL` HERE TOO, for the reason the `is` branch above gives at length: a
           positive operator is false on a missing value, and a bare `=` inside a `none:` group is
           NULL rather than false and takes the row with it. */
        /* ABOVE `IN_CHUNK` VALUES, WITH NO CURRENCY OR UNIT TO CARRY, THE LIST IS ONE PARAMETER. See
           `inJson`. Each value still decides its own granularity: the ones naming a bare day are one
           list compared with the date part and the rest are another compared whole, so an `in` over
           an instant binds at most two parameters however long it is. The two are ORed, and `not_in`
           negates them together, which is the De Morgan the chunks below rely on as well. Every value
           here was bound by `bind`, so none is `null`, and the finite check keeps `JSON.stringify` from
           writing one (see `inJson`), so `NOT IN` over the list is two-valued. */
        if (!QUALIFIER[decl.type] && bounds.length > IN_CHUNK && bounds.every((b) => typeof b === 'string' || Number.isFinite(b))) {
          const whole = bounds.filter((b) => !asDay(decl.type, b));
          const days = bounds.filter((b) => asDay(decl.type, b));
          /* WRITTEN IN THE ORDER IT IS BOUND, whole first, because `put` pushes in call order and the
             placeholders are read in string order. */
          const lists = [
            ...(whole.length ? [inJson(path, whole, put)] : []),
            ...(days.length ? [inJson(`substr(${path}, 1, 10)`, days, put)] : []),
          ];
          const hit = lists.length === 1 ? lists[0]! : `(${lists.join(' OR ')})`;
          return op === 'in' ? `(${path} IS NOT NULL AND ${hit})` : `(${path} IS NULL OR NOT (${hit}))`;
        }
        /* AND THE CLAUSES GO OUT IN SLICES OF SIXTY-FOUR, which is `IN_CHUNK`'s paragraph above and
           `38 §5` step 3's algorithm. One slice compiles to exactly the string this branch used to
           produce. Past one slice only money and quantity reach here, and a list holding a number
           that is not finite, since every other long list left through `inJson` above; `IN_CHUNK`'s
           paragraph states the hundred money and quantity meet first. */
        if (op === 'in') {
          const each = list.map((v, i) => `(${at(i)} = ${put(bounds[i]!)}${qualifier(field, decl.type, v, put)})`);
          const slices = chunk(each).map((s) => `(${s.join(' OR ')})`);
          return `(${path} IS NOT NULL AND ${slices.length === 1 ? slices[0]! : `(${slices.join(' OR ')})`})`;
        }

        /* `not_in` KEEPS THE CURRENCY AND NEGATES THE AMOUNTS, for the reason `not` does — and the
           currency clauses are bound first because they are written first.

           THE SET IS TAKEN BEFORE ANYTHING IS BOUND, which is the whole of the fix. This called
           `put` once per value and then deduplicated the resulting clause STRINGS — which are
           identical, because the `?` in them is literal — so two GBP values produced three
           placeholders and four parameters. `node:sqlite` raises `column index out of range` and
           the list, the metric or the page fails outright; a driver that tolerated the extra one
           would shift every binding by a place and answer `currency = 'GBP' AND NOT (amount =
           'GBP' OR amount = 10000)`, which returns a value that IS in the list. And `evaluate()`
           answers the same predicate without error, so a rule fires mid-write and the list behind
           it crashes. */
        /* EACH AMOUNT WITH ITS OWN QUALIFIER, exactly as `in` above does it. The currencies were
           collected into a SET and the amounts negated against the union of it, so
           `not_in [GBP 480, EUR 240]` excluded a GBP 240 row — a value that is not in the list —
           because 240 was in the amounts and GBP was in the currencies. The two halves were never
           put back together. `evaluate` pairs them and did not agree, which is the disagreement this
           package exists to make impossible. */
        const seen = new Set<string>();
        const same = (() => {
          const clauses: string[] = [];
          for (const v of list) {
            const key = currencyKey(field, decl.type, v);
            if (key === null || seen.has(key)) continue;
            seen.add(key);
            clauses.push(qualifier(field, decl.type, v, put).slice(' AND '.length));
          }
          return clauses.length ? `(${clauses.join(' OR ')}) AND ` : '';
        })();
        /* AND `not_in` CHUNKS TOO, negated slice by slice and joined with AND, which is `38 §5`
           step 3's other half and De Morgan's: NOT (a OR b) AND NOT (c OR d) is NOT (a OR b OR c OR
           d), so the rows do not move and only the shape does. One slice is the string this branch
           used to produce, unchanged. */
        const each = list.map((v, i) => `(${at(i)} = ${put(bounds[i]!)}${qualifier(field, decl.type, v, put)})`);
        const slices = chunk(each).map((s) => `NOT (${s.join(' OR ')})`);
        return `(${path} IS NULL OR (${same}${slices.length === 1 ? slices[0]! : `(${slices.join(' AND ')})`}))`;
      }

      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
      case 'before':
      case 'after': {
        const bound = bind(value, decl.type);
        if (bound === null) {
          bad.push(refuse('VALUE_MALFORMED', `${field} cannot be compared with ${JSON.stringify(value)}.`, field));
          return '';
        }
        const sign = op === 'gt' ? '>' : op === 'gte' ? '>=' : op === 'lt' || op === 'before' ? '<' : op === 'lte' ? '<=' : '>';
        // Bound first, qualifier second, in the order the placeholders appear. See `is` above.
        /* AND THE DATE PART WHEN THE BOUND IS A BARE DAY, for the reason `asDay` gives: without it a
           same-day instant sorts after the ten characters of its own day, so `after today` kept the
           rows `before today` had already excluded, and the pair was not exclusive. */
        const cmp = `${asDay(decl.type, bound) ? `substr(${path}, 1, 10)` : path} ${sign} ${put(bound)}`;
        const money = signOnly(op, decl.type, value) ? '' : qualifier(field, decl.type, value, put);
        /* A ROW WITH NO VALUE IS NOT BEFORE ANYTHING. `IS NOT NULL` is explicit rather than relying
           on SQLite's null comparison, because the same predicate is answered by `evaluate` in
           JavaScript, where `undefined < x` is false and `undefined > x` is also false — two
           languages agreeing by accident is not agreement. */
        return `(${path} IS NOT NULL AND ${cmp}${money})`;
      }

      case 'between': {
        const pair = Array.isArray(value) ? value : [];
        const lo = bind(pair[0], decl.type);
        const hi = bind(pair[1], decl.type);
        if (lo === null || hi === null) {
          bad.push(refuse('VALUE_MALFORMED', `${field} between takes two values, low first.`, field));
          return '';
        }
        /* The bounds carry their currency too: `between 20,000 and 30,000 USD` matched a GBP row and
           a EUR row in BOTH renderings, so nothing flagged it — a shared bug is invisible to a test
           that only compares the two.

           AND BOTH BOUNDS, NOT THE LOW ONE. The qualifier was taken from `pair[0]` alone, so a range
           written from GBP 200 to USD 300 silently reread the ceiling as GBP 300: a plausible answer
           to a question nobody asked. Two currencies are not a range, and saying so is the only
           honest answer. */
        if (currencyKey(field, decl.type, pair[0]) !== currencyKey(field, decl.type, pair[1])) {
          bad.push(refuse('MIXED_CURRENCY', `${field} between takes one currency, and this range has two.`, field));
          return '';
        }
        return `(${path} IS NOT NULL AND ${path} >= ${put(lo)} AND ${path} <= ${put(hi)}${qualifier(field, decl.type, pair[0], put)})`;
      }

      case 'contains':
      case 'starts':
      case 'ends': {
        if (typeof value !== 'string') {
          bad.push(refuse('VALUE_MALFORMED', `${field} ${op} takes a string.`, field));
          return '';
        }
        /* `contains` IS `instr`, NEVER `LIKE`, and the difference is a parity bug rather than a
           preference. One platform caps a `LIKE` pattern at fifty bytes and the other at fifty
           thousand, so a forty-nine character `contains` works on a laptop and fails in production
           — the exact shape of failure this package exists to make impossible. `instr` has no
           pattern, so it has no ceiling, and it needs no escape: a value containing `%` is a value.
           `starts` and `ends` keep `LIKE`, because a prefix IS a pattern; their literals are held
           to the same forty bytes so neither can reach a platform's limit. */

        /* AND THE MEASURE IS TAKEN ON WHAT SHIPS, WHICH IS NOT WHAT WAS TYPED.
           This measured the raw literal, and the string that reaches SQLite is the ESCAPED one plus
           a `%`: every `\`, `%` and `_` in the value doubles on the way in. So a forty-byte literal
           of `%%%…` compiled to an eighty-one-byte `LIKE` pattern and went straight past the check
           whose own paragraph, three lines up, says it exists to stop a pattern reaching a
           platform's fifty-byte ceiling. The failure it was written to prevent, produced by the
           check itself.

           `contains` still measures the literal, and that is not an inconsistency: it compiles to
           `instr` with the value as a bound parameter, so there is no pattern to overrun and the cap
           there is a bound on work rather than on a limit. The two ops measure different strings
           because they ARE different strings.

           THE MEASURE IS THE ESCAPED LITERAL AND NOT THE WHOLE PATTERN, so the anchoring `%` is
           outside it. The defect was escape DOUBLING — one character becoming two, without limit —
           and a single wildcard byte is not that. Counting it would refuse a forty-byte literal
           somebody has been allowed to write since this cap existed, to buy one byte of a ten-byte
           margin the cap already leaves under the platform's fifty. */
        const escaped = op === 'contains' ? value : value.replace(/[\\%_]/g, (c) => `\\${c}`);
        const pattern = op === 'contains' ? value : op === 'starts' ? `${escaped}%` : `%${escaped}`;

        if (byteLength(escaped) > CONTAINS_MAX) {
          bad.push(
            refuse(
              'CONTAINS_TOO_LONG',
              byteLength(escaped) === byteLength(value)
                ? `${field} ${op} takes at most ${CONTAINS_MAX} bytes, and this one is ${byteLength(value)}.`
                : /* THE SENTENCE SAYS WHICH NUMBER IT MEASURED, because a refusal reading "at most 40
                     bytes, and this one is 21" teaches nothing and reads as a bug in the record. */
                  `${field} ${op} takes at most ${CONTAINS_MAX} bytes as a LIKE pattern, and this one is ${byteLength(value)} bytes that escape to ${byteLength(escaped)}.`,
              field,
            ),
          );
          return '';
        }
        if (op === 'contains') return `(${path} IS NOT NULL AND instr(lower(${path}), lower(${put(value)})) > 0)`;

        return `(${path} IS NOT NULL AND ${path} LIKE ${put(pattern)} ESCAPE '\\')`;
      }

      case 'has':
      case 'lacks': {
        /* AND THE CHECK HAS TO BE CALLED FROM HERE, which is the half that was actually load
           bearing. `operatorAllowed` refuses `is`, `not`, `in` and `not_in` on a list, so the two
           arms that already ask `checkEnum` are the two a `list<enum>` can never reach; these are
           the only operators it admits, and neither asked. Teaching `checkEnum` about lists and
           stopping there would have changed nothing a caller could observe. Before `bind`, as the
           `is` arm does it, so the refusal names the value somebody wrote. */
        if (!checkEnum(value)) return '';
        const element = elementSql(value, put);
        if (element === null) {
          bad.push(refuse('VALUE_MALFORMED', `${field} ${op} takes one value to look for in the list.`, field));
          return '';
        }
        /* GUARDED, because `json_each` RAISES on a bare string. `json_each(NULL)` is fine, so an
           absent row was never the problem — a row holding a scalar where a list belongs was, and
           one of them made the whole query throw and lost every other row's answer. An import
           carries whatever the other record held, and the `.brain` reader writes `fields` without
           coercing it, which is exactly the case the `empty`/`present` branch above is written for.
           A scalar is not a list, so it holds nothing: `'[]'` is the honest substitute. */
        /* AND THE GUARD ASKS THE DOCUMENT WHAT IS AT THE PATH, rather than re-reading what came
           out of it. It asked `json_valid(json_extract(…))`, and the TEXT `["urgent"]` is valid
           JSON, so an imported row holding the characters of a list was unwrapped into one and
           `tags has urgent` matched it, where `evaluate`'s `Array.isArray` did not. `json_extract`
           hands back the same string for a stored array and for a stored string of one, so no
           question asked of its result can tell them apart; the two-argument `json_type` is asked
           of `fields` and the path, which is the question `Array.isArray` answers. It is also the
           guard the kernel already writes for its own `json_each` scans (`kernel/src/index.ts`),
           so this is one spelling arriving where two were rather than a new one.
           THE VALUE ITSELF READS THROUGH `path`, which is `fieldSqlIn`, for `31 §2`'s reason: a
           field expression spelled a second time here is a second expression to keep in step with
           the index and the `ORDER BY`, and this copy knew neither of the helper's two exceptions. */
        const list = `CASE WHEN json_type(fields, '${jsonPath(field)}') = 'array' THEN ${path} ELSE '[]' END`;
        const exists = `EXISTS (SELECT 1 FROM json_each(${list}) WHERE ${element})`;
        return op === 'has' ? `(${exists})` : `(NOT ${exists})`;
      }

      default:
        bad.push(refuse('MATCH_OP_UNSUPPORTED', `${op} is in the grammar and not read by this build.`, field));
        return '';
    }
  };

  const compiled = where === undefined ? '1 = 1' : walk(where, start);

  /**
   * A REFUSAL ANYWHERE IN THE PREDICATE MATCHES NOTHING, AND NOT JUST A REFUSAL AT THE ROOT.
   *
   * The fallback used to be `walk(where) || '0 = 1'`, which is only reached when the whole walk
   * returns the empty string, and only a top-level leaf does that. Inside a group the refused
   * child was dropped by the `.filter(Boolean)` above and the group compiled to its SURVIVORS, so
   * `{none: [{field: 'state', is: 'open'}, {field: 'nope', is: 'x'}]}` came out as
   * `NOT (state = 'open')` and returned rows the question had asked to exclude. `none` is the
   * direction that bites: dropping a child of a `NOT (… OR …)` makes the clause strictly WIDER than
   * what was asked, which is this package's one unforgivable failure: a filter that looks like it
   * worked and returned more than it should have. `all` widens the same way. The test that claimed
   * this property held seeded a top-level leaf, the single shape where it did.
   *
   * THE PARAMETERS GO WITH IT. `0 = 1` has no placeholder, and handing back the values bound before
   * the refusal would be a caller passing three parameters to a statement that wants none, which
   * `node:sqlite` answers with an exception, turning a belt-and-braces guard into the crash it
   * exists to prevent.
   */
  if (bad.length) return { sql: '0 = 1', params: [], bad };
  return { sql: compiled || '0 = 1', params, bad };
}

/** Does this predicate hop to another register anywhere, by `pointed` or by a field read through a link? Bounded as `namesColumn` is, below the compile check. */
const hops = (node: unknown, schema: Schema, level = 1): boolean => {
  if (level > MAX_DEPTH || !isNode(node as Node)) return false;
  const n = node as Record<string, unknown>;
  if ('pointed' in n) return true;
  for (const q of QUANTIFIERS) if (Array.isArray(n[q])) return (n[q] as unknown[]).some((k) => hops(k, schema, level + 1));
  return typeof n.field === 'string' && Object.hasOwn(schema.fields, n.field) && schema.fields[n.field]?.through !== undefined;
};

/**
 * Does this predicate name one of the record's own five? Asked once, before anything is walked.
 *
 * IT IS ASKED UP FRONT BECAUSE THE WALK SHORT-CIRCUITS. `any:` stops at its first true child and
 * `all:` at its first false one, so a check made where the leaf is read would fire on some rows and
 * not others, and an exception that depends on the data is worse than either answering or refusing.
 * The predicate is a handful of leaves and this walk allocates nothing.
 */
const namesColumn = (node: unknown, schema: Schema, level = 1): boolean => {
  /* AND IT COUNTS ITS DEPTH, because the first version of this walk did not and a four-thousand
     deep `all:` was a `RangeError: Maximum call stack size exceeded` again, out of a guard added to
     prevent a silent wrong answer. `MAX_DEPTH`'s paragraph is that failure, and the test that
     catches it was already in the file. It is belt and braces below `evaluate`'s compile check,
     which refuses a fourth level before this is reached, and belt and braces is what a backstop
     is. */
  if (level > MAX_DEPTH || !isNode(node as Node)) return false;
  const n = node as Record<string, unknown>;
  for (const q of QUANTIFIERS) {
    const kids = n[q];
    if (Array.isArray(kids)) return kids.some((k) => namesColumn(k, schema, level + 1));
  }
  /* A KERNEL COLUMN ONLY WHERE THERE ARE KERNEL COLUMNS. On `inbox_raw` these five are not fields at
     all, so a predicate naming one must answer false through `specOf` rather than ask the caller for a row
     that does not exist. */
  if (schema.subject === 'inbox_raw') return false;
  return typeof n.field === 'string' && Object.hasOwn(KERNEL_FIELDS, n.field);
};

/**
 * The same question, about one row already in memory.
 *
 * A rule mid-write has the row and no transaction to query from, and a test wants an answer without
 * a database. What matters is that this and `compile` say the same thing — there is a test that runs
 * both over the same rows and compares, because two renderings that disagree are worse than one
 * that is slow.
 *
 * `row` IS THE FOURTH ARGUMENT AND IT IS THE HARD PART OF ADDRESSING A KERNEL FIELD.
 *
 * `compile` reads `created_at` off a COLUMN of `entry`. This rendering is handed a row's `fields`,
 * which is the JSON blob beside those columns, and a column is not in it: `id`, `seq`,
 * `created_at`, `updated_at` and `version` are stored precisely where this argument cannot see
 * them. Making the name compile and leaving this side blind would have answered `false` about every
 * row for a question the SQL side answers correctly, which is not a smaller bug than the refusal it
 * replaced. It is a bigger one, because a refusal is visible and `false` is not.
 *
 * SO THE ROW TRAVELS BESIDE ITS FIELDS RATHER THAN INSTEAD OF THEM. A fourth optional argument
 * keeps the three-argument call every existing caller makes, and `38 §5.5` step 3 describes exactly
 * this lookup: `state` reads the row, a kernel field reads the row, everything else reads `fields`.
 * The alternative was to widen the second argument to accept either a bare `fields` map or a whole
 * row and tell them apart by looking for a `fields` key, and a register may legitimately declare a
 * field called `fields`, so the two shapes are not reliably distinguishable.
 *
 * AND ASKING WITHOUT THE ROW THROWS, for the reason `jsonPath` throws near the top of this file:
 * a caller holding a row that hands over only half of it is a bug in the caller, not a value a
 * person typed, and a backstop that returns a value can be ignored. There is exactly one honest
 * answer to "is this row's `created_at` after Monday" when the row was not supplied, and it is not
 * `false`.
 */
export function evaluate(
  where: Predicate | undefined,
  fields: Record<string, unknown>,
  schema: Schema,
  row?: Readonly<Record<string, unknown>>,
): boolean {
  if (where === undefined) return true;

  /**
   * WHAT `compile` REFUSES, THIS ANSWERS `false` TO for every row, and by construction rather
   * than by inspection.
   *
   * This walked the predicate on its own and had its own holes: `null` and `5` threw the same
   * TypeError the compiler did, a four-thousand-deep `all:` was the same `RangeError`, and a refused
   * child inside a `none:` was silently dropped here too, so a rule fired on rows the predicate had
   * asked to exclude. Mirroring each of those checks by hand is how the two renderings drift, which
   * is the one thing this file is not allowed to do: asking the compiler is the only way the answers
   * cannot disagree about what is answerable.
   *
   * IT COSTS ONE COMPILE PER CALL, and that is the honest price. A predicate is a handful of leaves,
   * the callers are a rule against one write and an ingest against one arrival, and the string this
   * builds is thrown away. A wrong answer about one row, delivered quickly, is not cheaper.
   */
  if (compile(where, schema).bad.length) return false;

  /* A HOP READS OTHER ENTRIES, AND THIS IS HANDED ONE. `pointed` compiles when the schema can name the
     other register, and a row in memory has no table to look in, so the predicate is refused here as a
     whole: answering `false` for the hop alone would make `none: [pointed]` true of every row. */
  if (hops(where, schema)) return false;

  /* AND A QUESTION ABOUT A COLUMN NEEDS THE ROW, which is the fourth argument's paragraph above.
     It is asked AFTER the compile check so that a predicate the compiler already refuses answers
     `false` rather than throwing: an unreadable predicate is a refusal at this boundary, and only
     a readable one the caller under-supplied is a bug in the caller. */
  if (row === undefined && namesColumn(where, schema))
    throw new TypeError(
      `A predicate over ${schema.register} names one of ${Object.keys(KERNEL_FIELDS).join(', ')}, which the record keeps in a column of the row and not in its fields. Pass the row as evaluate()'s fourth argument.`,
    );

  const one = (node: Node): boolean => {
    if (isGroup(node)) {
      const q = quantifierOf(node);
      /* The compiler has already refused anything that is not a list of nodes, above. */
      const kids = childrenOf(node) as Node[];
      if (kids.length === 0) return q !== 'any';
      if (q === 'all') return kids.every(one);
      if (q === 'any') return kids.some(one);
      return !kids.some(one);
    }

    const parts = splitLeaf(node as Record<string, unknown>);
    if (parts.length > 1) return parts.every((p) => one(p as Node));
    const leaf = parts[0]!;
    const field = typeof leaf.field === 'string' ? leaf.field : '';
    /* THE SAME LOOKUP THE COMPILER MAKES, and it has to be, or one rendering knows a name the other
       does not. See `specOf`. */
    const decl = specOf(schema, field);
    if (!decl) return false;

    /**
     * WHERE A LEAF'S VALUE COMES FROM, AND IT IS NOT ALWAYS `fields`.
     *
     * `38 §5.5` step 3 gives the three cases and this is them: one of the record's own five reads
     * the row, `state` reads the row when the caller handed one over, and everything else reads the
     * declared field out of `fields`.
     *
     * THE MIRRORED FIELD FALLS BACK TO THE JSON RATHER THAN INSISTING ON THE COLUMN, because the
     * write path stores it in both places on the same statement and the two hold the same string.
     * Insisting would have broken every caller that passes a row's `fields` and nothing else, to
     * buy an answer that is already correct. The five have no such fallback: `fields` never holds
     * them, so there is nothing to fall back to and the guard above refuses to guess.
     */
    const raw = Object.hasOwn(KERNEL_FIELDS, field)
      ? row?.[field]
      : mirrorsState(schema, field) && row !== undefined && Object.hasOwn(row, STATE_COLUMN)
        ? row[STATE_COLUMN]
        : fields[field];
    const type = decl.type;
    const numeric = (v: unknown): number | null => {
      if (type === 'money') return typeof v === 'object' && v !== null ? (v as Money).amount : null;
      if (type === 'quantity') return typeof v === 'object' && v !== null ? (v as Quantity).value : null;
      if (typeof v === 'number') return v;
      return null;
    };
    /* AND AN INSTANT COMPARED AGAINST A BARE DAY IS CUT TO ITS DAY, which is `asDay`'s argument and
       the same cut the compiler makes. Without it this half of the grammar disagrees with the SQL
       half about every relative word on an instant, and the two are meant to be one grammar. */
    const comparable = (v: unknown, against?: unknown): string | number | null => {
      if (type !== 'day' && type !== 'instant') return numeric(v);
      if (typeof v !== 'string') return null;
      return against !== undefined && asDay(type, against) ? v.slice(0, 10) : v;
    };

    const op = OPERATORS.find((o) => o in leaf);
    /* A FIELD WORKED OUT AT READ IS NOT HELD BY THE ROW THE STORE HANDS HERE, and `compile` refuses it; in memory it
       matches nothing, as a test the grammar cannot answer does. */
    if (!op || !operatorAllowed(op, type) || decl.derived === true) return false;
    const value = leaf[op];
    /* THE THREE WAYS A VALUE IS ABSENT, and the compiler says the same three. A write stores none
       of them, but an import carries whatever the other record held. */
    const absent =
      raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);

    switch (op) {
      case 'empty':
        return absent;
      case 'present':
        return !absent;
      case 'is':
        return !absent && same(raw, value, type, asDay(type, value));
      /* AND A FOREIGN-CURRENCY ROW IS NOT A MATCH EVEN UNDER NEGATION: it is not the thing being
         talked about. `NOT(amount = 10000 AND currency = 'GBP')` was true of every euro row. */
      case 'not':
        return absent || (sameQualifier(type, raw, value) && !same(raw, value, type, asDay(type, value)));
      case 'in':
        return !absent && Array.isArray(value) && value.some((v) => same(raw, v, type, asDay(type, v)));
      case 'not_in':
        return (
          absent ||
          !Array.isArray(value) ||
          (value.some((v) => sameQualifier(type, raw, v)) && !value.some((v) => same(raw, v, type, asDay(type, v))))
        );
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
      case 'before':
      case 'after': {
        if (absent) return false;
        const a = comparable(raw, value);
        const b = comparable(value, value);
        if (a === null || b === null) return false;
        if (!signOnly(op, type, value) && !sameQualifier(type, raw, value)) return false;
        if (op === 'gt' || op === 'after') return a > b;
        if (op === 'gte') return a >= b;
        if (op === 'lt' || op === 'before') return a < b;
        return a <= b;
      }
      case 'between': {
        if (absent || !Array.isArray(value)) return false;
        const a = comparable(raw);
        const lo = comparable(value[0]);
        const hi = comparable(value[1]);
        /* THE BOUNDS CARRY THEIR CURRENCY TOO. Without this, `between 20,000 and 30,000 USD` matched
           a GBP row and a EUR row — and it was wrong in BOTH renderings, so comparing them against
           each other flagged nothing. A shared mistake is the one a differential test cannot see. */
        if (!sameQualifier(type, raw, value[0])) return false;
        return a !== null && lo !== null && hi !== null && a >= lo && a <= hi;
      }
      /* CASE-FOLDED, because SQLite's LIKE is and `34-GRAMMARS` §1.2 says the operator is. This was
         `includes` on the raw strings, so a rule evaluated mid-write and the list drawn afterwards
         disagreed about the same row — the exact failure this module's header names, in the module
         that names it. */
      case 'contains':
        return !absent && typeof raw === 'string' && typeof value === 'string' && fold(raw).includes(fold(value));
      case 'starts':
        return !absent && typeof raw === 'string' && typeof value === 'string' && fold(raw).startsWith(fold(value));
      case 'ends':
        return !absent && typeof raw === 'string' && typeof value === 'string' && fold(raw).endsWith(fold(value));
      case 'has':
        return Array.isArray(raw) && raw.some((v) => v === value);
      case 'lacks':
        return !Array.isArray(raw) || !raw.some((v) => v === value);
      default:
        return false;
    }
  };

  return one(where);
}

/** ASCII case folding, which is what SQLite's LIKE does and therefore what the operator means. */
const fold = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/**
 * Do a stored value and an operand agree about the half that is not the number?
 *
 * A currency for money, a unit for a quantity. Every comparison of a compound value has to ask this,
 * and the ones that did not were comparing 24,000 GBP with 24,000 EUR and calling them equal.
 */
/**
 * AN AMOUNT COMPARED WITH ZERO, ORDERED, WITH NO CURRENCY: `balance lt { amount: 0 }`. Nought is nought in every currency,
 * so whether an amount is below or above it is a sign and not a comparison of two currencies' numbers, which is the
 * mistake a missing currency is refused for. Any other amount, and `is`, `between` and `in`, still need one. A
 * comparison that does carry a currency is held to it as before.
 */
function signOnly(op: string, type: string, value: unknown): boolean {
  if (type !== 'money' || (op !== 'gt' && op !== 'gte' && op !== 'lt' && op !== 'lte')) return false;
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.amount === 0 && (v.currency === undefined || v.currency === null || v.currency === '');
}

function sameQualifier(type: string, a: unknown, b: unknown): boolean {
  const q = QUALIFIER[type];
  if (!q) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  /* THROUGH `canonicalHalf`, BECAUSE THE COMPILER BINDS THROUGH IT. A currency the caller wrote
     lower-case is upper-cased on both sides or the two renderings disagree about `gbp`, and the
     paragraph beside `canonicalHalf` is the argument for upper-casing it at all. */
  return canonicalHalf(type, (a as Record<string, unknown>)[q.key]) === canonicalHalf(type, (b as Record<string, unknown>)[q.key]);
}

/** Equality, by type: money is equal when both halves are, because a number is not an amount. */
function same(a: unknown, b: unknown, type: string, byDay = false): boolean {
  /* AN INSTANT AGAINST A BARE DAY IS EQUAL WHEN THE DAY IS. See `asDay`: `last_seen is today`
     compared twenty-four characters against ten and matched nothing, on every record. */
  if (byDay) return typeof a === 'string' && typeof b === 'string' && a.slice(0, 10) === b;
  if (type === 'money')
    return (
      typeof a === 'object' &&
      a !== null &&
      typeof b === 'object' &&
      b !== null &&
      (a as Money).amount === (b as Money).amount &&
      /* The same folding the compiler binds through, and `canonicalHalf` is the argument for it. */
      canonicalHalf('money', (a as Money).currency) === canonicalHalf('money', (b as Money).currency)
    );
  if (type === 'quantity')
    return (
      typeof a === 'object' &&
      a !== null &&
      typeof b === 'object' &&
      b !== null &&
      (a as Quantity).value === (b as Quantity).value &&
      (a as Quantity).unit === (b as Quantity).unit
    );
  /* A BOOL IS TRUE OR FALSE HOWEVER IT WAS SPELLED. The sentence grammar resolves `open is yes` to
     the STRING `'true'`, and `true === 'true'` is false — so the sentence form matched nothing here
     while the SQL side had the mirror-image bug, and the two agreed by both being wrong. The
     compiler's `bind` reads the same two spellings; this is that rule on this side. */
  if (type === 'bool') return truth(a) === truth(b) && truth(a) !== null;
  return a === b;
}

/** `true`, `false` or `null` for a value that is neither, whichever of the two spellings it wore. */
const truth = (v: unknown): boolean | null =>
  v === true || v === 'true' ? true : v === false || v === 'false' ? false : null;

/* ── the sentence form ───────────────────────────────────────────────────── */

export { clausesOf, daySaid, lookupRef, NO_ROW, parseWhere, quoteValue, resolveDay, unquoted } from './sentence.ts';
export type { Parsed, RefFound, SentenceDeps } from './sentence.ts';

/* One path into a body a stranger sent — `47 §4.3`'s grammar, read by connect, extract and the
   record's `applyPull`. It shares this package's posture and none of its vocabulary; see `path.ts`. */
export { fansOut, pathFault, readPath, selectAll } from './path.ts';
export type { Json, PathInvalid, Read } from './path.ts';
