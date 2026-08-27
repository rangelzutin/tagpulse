# PLAN-002 — Phase C

## Execution

- Resource: `clientes`
- API: TagPlus `2.0`
- Started at: `2026-08-27T20:34:15.293Z`
- Completed at: `2026-08-27T20:34:42.068Z`
- Status: `COMPLETE_ENDPOINT_EXHAUSTED`
- Execution complete: `true`

This inspection represents the structural contract observed during this paginated execution. It is not evidence of a transactional snapshot, guaranteed stable ordering, or a complete historical contract of the API. Ordering remains `OBSERVED_NOT_GUARANTEED` based on the previously approved pagination characterization.

## Coverage

- First page: `1`
- Per page: `100`
- Last non-empty page: `29`
- Records on the last non-empty page: `44`
- Empty termination page: `30`
- Endpoint exhausted: `true`
- Records fetched: `2844`
- Unique records observed: unavailable
- Duplicate occurrences: unavailable
- Duplicate detection: `unavailable_without_assuming_identity_field`

The scanner continued after the short page 29 and terminated only after page 30 returned an empty array.

## Structural profile

- Unique paths, including `$`: `7`
- Maximum depth: `1`
- Multi-type paths: `3`
- Array paths: `0`
- Distinct structural shapes: `5`
- Dominant shape frequency: `0.7039381153305204` (`2002 / 2844`)
- Rare paths: `0`
- Dynamic-key parents normalized: `0`

Observed paths:

| Path | Parent | Depth | Present | Missing | Null | Types |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `$` | — | 0 | 2844 | 0 | 0 | object |
| `$.cnpj` | `$` | 1 | 2844 | 0 | 2355 | null, string |
| `$.cpf` | `$` | 1 | 2844 | 0 | 490 | null, string |
| `$.id` | `$` | 1 | 2844 | 0 | 0 | number |
| `$.id_entidade` | `$` | 1 | 2844 | 0 | 0 | number |
| `$.nome_fantasia` | `$` | 1 | 2844 | 0 | 2005 | null, string |
| `$.razao_social` | `$` | 1 | 2844 | 0 | 0 | string |

Every observed field path was present in every fetched record. Consequently, all field paths have `parentEligibleCount = 2844` and `missingWithinEligibleParent = 0`. The eligibility counters attached to the `$` pseudo-root are not interpreted as nested-field semantics because the root has no parent.

## Multi-type paths

| Path | Observed types | Type counts | Null records |
| --- | --- | --- | ---: |
| `$.cnpj` | null, string | null: 2355; string: 489 | 2355 |
| `$.cpf` | null, string | null: 490; string: 2354 | 490 |
| `$.nome_fantasia` | null, string | null: 2005; string: 839 | 2005 |

No type was normalized or selected as the definitive domain type.

## Arrays

No array path or array element was observed in the 2844 collection records. The profiler's array and heterogeneous-element semantics remain covered by synthetic tests, but this execution provides empirical evidence that the observed `/clientes` collection representation was flat and contained no arrays.

## Rare paths

No path met the analytical rarity thresholds. Every observed field path had a presence rate of `1`.

This rarity classification is an inspection convention and is not a TagPlus required/optional contract.

## Structural shapes

| Anonymous shape | Records | Frequency |
| --- | ---: | ---: |
| `3fe10f0be014` | 2002 | 0.7039381153305204 |
| `9246e8720cfb` | 487 | 0.17123769338959213 |
| `14e55c458b2f` | 352 | 0.12376933895921238 |
| `ac51e72afda9` | 2 | 0.0007032348804500703 |
| `d01cd648fe4a` | 1 | 0.00035161744022503517 |

The shapes differ only by observed JSON types, principally the null/string combinations of `$.cnpj`, `$.cpf`, and `$.nome_fantasia`. Shape identifiers are derived exclusively from normalized paths and types.

## Discovery curve

The complete per-page curve is preserved in `clientes-structural-evidence.json`.

| Checkpoint | Paths cumulative | New paths on page | Last novelty record | Last novelty page |
| ---: | ---: | ---: | ---: | ---: |
| 100 records | 7 | 7 | 48 | 1 |
| 500 records | 7 | 0 | 48 | 1 |
| 1000 records | 7 | 0 | 48 | 1 |
| 2844 records | 7 | 0 | 48 | 1 |

All seven paths were discovered during page 1. The last structural novelty was a type event at record 48.

## Saturation

- Minimum records before evaluation: `500`
- Novelty-free window: `1000`
- Saturation reached: `true`
- Saturation reached at record: `1048`
- Saturation reached at page: `11`
- Last novelty at record: `48`
- Last novelty at page: `1`
- Records since last novelty at completion: `2796`
- Late structural novelty count: `0`

Saturation means only that the approved provisional window of 1000 consecutive records without structural novelty was completed. It is not a universal or permanent API contract guarantee.

## Warnings and limitations

- Warning: `DUPLICATE_DETECTION_UNAVAILABLE`.
- Record identity was deliberately not inferred from `id`, `id_entidade`, or any other field.
- The scan is not a transactional snapshot.
- Stable ordering is not contractually guaranteed.
- No nested object or array occurred in this collection execution, so their absence—not a presumed schema—is the real observation.
- This phase characterizes only the `/clientes` collection representation and does not inspect a possible detail endpoint.

## Privacy validation

- Raw payload persisted: **NO**
- Real fixture created: **NO**
- Customer values persisted: **NO**
- Customer IDs persisted: **NO**
- PII values logged: **NO**
- OAuth token persisted: **NO**
- Authorization header persisted: **NO**
- Literal dynamic key persisted: **NO**

Before preservation, the serialized evidence was checked for email-like values, HTTP URLs, `Bearer`, access/refresh token markers, CPF/CNPJ-like numeric values, phone-like values, and unsafe normalized paths. No indicator was found.

## Gate C assessment

| Axis | Evidence |
| --- | --- |
| Coverage | 2844 records across 29 non-empty pages |
| Termination | Page 30 returned `[]`; endpoint exhausted |
| Path union | Seven normalized paths captured |
| Present/missing/null | Aggregated for every path |
| Nested eligibility | Semantics synthetically validated; no nested field observed in the real census |
| Types and multi-type | JSON types and three multi-type paths captured |
| Objects | Root object structure captured for every record |
| Arrays and elements | Profiler semantics validated; no array observed in the real census |
| Depth | Maximum observed depth 1 |
| Rare paths | Calculated; none observed |
| Structural shapes | Five anonymous shapes captured |
| Discovery curve | Preserved for every non-empty page |
| Saturation | Reached at record 1048/page 11 |
| Late novelty | Zero events after provisional saturation |
| Privacy | Runtime evidence reviewed and canary tests passed |
| Safe logging | No record, value, token, or payload logging introduced |

**Gate C: APPROVED**

Approval applies only to the structural inspection of the observed `/clientes` collection contract. It does not authorize Customer modeling, persistence, synchronization, migrations, or semantic normalization.
