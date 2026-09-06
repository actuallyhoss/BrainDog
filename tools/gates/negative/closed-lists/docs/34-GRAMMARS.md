## 6 · Every closed list, counted, with its owner

| List | Count | Members | Owner |
|---|---|---|---|
| Value types | 16 + 2 meta | §3 | 02 §5 |
| Pack kinds | 8 | `register page block ingest rule metric theme digest` | 04 §1 |
| Block kinds | 16 | §2.1 — one TypeScript table, `render`'s `KINDS` | 05 §2 |
| Post-v1 kinds | 4 | `diagram sparkline series forecast` | 05 §2 |
| Layout primitives | 8 | `panel grid rows proportional inline list table media` | 05 §1 |
| Tone words | 4 (+4 aliases, +`hole`) | `good warn bad info` | 13 §2.3 |
| Typed interpolations | 8 | `date day until ago money quantity pct ref` | 05 §7.2 |
| Evidence tags | 4 | `verified inferred estimate unknown` | 05 §7.3 |
| `where:` operators | 19 + `via` + `predicate` | §1.1 | 02 §6 |
| Quantifiers | 3 | `all any none` | 02 §6 |
| `where:` consumers | 7 | pages rules metrics alarms locks predictions ingest `match:` | 02 §6 |
| Aggregations | 11 | `sum count avg min max delta median distinct last running trend` | 08 §2 |
| Combinators | 3 | `ratio diff product` | 08 §2 |
| `derive:` combinators | 7 | `sum diff product ratio band via normalise` | 02 §5 |
| Rule actions | 10 | `set untag move schedule suggest link notify tag create stop` | 07 §6 |
| Extractors | 10 + 3 | `after before between money date text int decimal enum lookup` · `first nth default` | 07 §4 |
| Notification fields | 6 | `tone say because to key urgent` | 09 §4 |
| Series kinds | 5 | `gauge flow cumulative unique fact` | 08 §3 |
| Suggestion body kinds | 4 (+ `query`, never filed) | `options pattern rowset change` · `query` is the palette's unfiled answer | 23 §4 |
| Refusal codes | 99, in 8 families | pack and declaration 41 · grammar 13 · write path 18 · auth and vault 7 · format and lifecycle 6 · dialect 2 · spark 5 · connector 7 | 30 §6 |
| `SqlErrorCode` | 13 | 33 §3 — the adapter vocabulary, not refusal codes | 30 §13 |
| `Http` error names | 4 | `PrivateRange TooLarge Timeout Network` — a vocabulary, not refusal codes | 33 §1 |
| Event kinds | 40 | 30 §2 | 30 §2 |
| Schedule kinds | 10 | `digest reminder rule retry purge rotate pull analyse score snapshot` | 30 §1 |
| `schedule.state` | 5 | `pending firing done failed paused` | 09 §1 |
| Outbox kinds | 9 | `notify.email notify.push notify.webhook pull.fetch export.r2 erase.r2 infer.embed infer.prose infer.draft` | 30 §1 |
| Outbox states | 5 | `pending leased done failed dead` | 30 §1 |
| `inbox_raw.channel` | 5 | `email webhook pull paste api` | 30 §1 |
| `inbox_raw.state` | 7 | `untriaged matched skipped review proposed ignored erased` | 30 §1 |
| Member levels | 5 | `read append write decide owner` | 20 §1 |
| Token scopes | 3 | `read propose write` | 10 §2 |
| Principal kinds | 6 | `person token runner share system spark` | 33 §2 |
| Device-grant statuses | 6 | `pending approved active expired denied revoked` | 12 §6.1 |
| `device_grant.reach` | 6 | `login runner export import pack token` — the last four are operation grants | 30 §1 |
| Job kinds | 4 | `triage explain propose draft` | 26 §4 |
| Job statuses | 9 | `queued claimed ok needs_decision refused limit error interrupted cancelled` | 26 §5 |
| Job event kinds | 9 | `start say think tool out limit note end error` | 26 §5 |
| Grant kinds | 5 | `api_token password ssh_key recovery_codes note` | 12 §6 |
| Vault key purposes | 3 | `record connector signing` | 12 §6 |
| Connector `auth.kind` | 8 | 25 §3 | 25 §3 |
| Connector placeholders | 5 | 25 §3 | 25 §3 |
| `fetch.read.format` | 5 | `json csv xml html_table text` | 25 §3.2 |
| `.dog` sections | 5 | `data origin governance local header` | 03 §3 |
| Kernel tables | 27 + 4 header | 30 §1 | 30 §1 |
| `local` tables | 6 | `token device_grant auth_fail observation job job_event` — the other 25 travel | 02 §1 |
| Erase stores | 19 + R2 | 02 §10, in one transaction; R2 through the outbox is the twentieth | 02 §10 |
| Record methods | 64 | 9 DATA · 12 READ+ · 4 VAULT · 7 JOBS · 16 ADMIN · 16 INTERNAL — 33 §2 | 30 §5 |
| RPC groups | 6 | `DATA READ+ VAULT JOBS ADMIN INTERNAL` | 30 §5 |
| `/auth/*` routes | 10 | 33 §4 | 33 §4 |
| DO classes | 3 | `Record Spark Directory` | 01 §1 |
| Packages | 13 | `render ports where theme fixtures kernel declare extract record mcp spark connect host`, in build order | 31 §2 |
| Ports | 9 + `Ingress` | `Sql Scheduler Clock Blobs Inference Dispatch Http KeyStore Snapshots` | 31 §5 |
| Guarded SQL keywords | 6 | `BEGIN COMMIT END ROLLBACK SAVEPOINT RELEASE` | 33 §1 |
| `Assert` methods | 4 | `ok equal deepEqual fail` | 33 §3 |
| Theme checks | 16 | A–P | 28 §4 |
| Colour roles | 5 + 4 + 2 + 3(+3 fills) + 5 | 13 §2.1 | 13 §2.1 |
| Motion tokens | 6 | `--d-press --d-release --d-state --d-move --d-enter --d-exit` | 13 §9 |
| Type scale | 8 | `t-xs 12 · t-sm 13 · t-base 15 · t-md 17 · t-lg 20 · t-xl 24 · t-2xl 28 · t-3xl 34` | 13 §3 |
| Density | 3 | `compact comfortable roomy` → 28 / 32 / 36 px | 28 §1 |
| Empty states | 5 | `no-data-yet no-results cleared no-permission error` | 19 §6 |
| Test widths | 4 | `390 768 1024 1440` | 22 §10 |
| Fixture records | 9 | eight pages + `corpus` | 22 §10 |
| Playwright specs | 17 | 33 §8 — 50 §9's sixteen plus `vault-screen` | 33 §8 |
| First-party packs | 6 | `agents work portfolio money-core estate people` | 32 §5 |

**When a count is needed anywhere in the corpus, cite the owner rather than re-counting.** A CI gate reads this
table and every owner's enumeration and fails when they differ ([33-CONTRACTS](33-CONTRACTS.md) §8). A count is never
a budget: the numbers a gate asserts live in `tools/gates/budgets.json`, the enumerations live with their owners, and
this table indexes the second, never the first.

---

*Next: [33-CONTRACTS](33-CONTRACTS.md) — the interfaces, envelopes and surfaces those grammars are used through.*

