# PLAN-002 — Phase D

## Execution

- Resource: `clientes`
- API: TagPlus `2.0`
- Started at: `2026-08-27T23:42:30.051Z`
- Completed at: `2026-08-27T23:42:52.098Z`
- Status: `COMPLETE_ENDPOINT_EXHAUSTED`
- Execution complete: `true`
- Records fetched: `2844`
- Non-empty pages: `29`
- Last non-empty page: `29`
- Records on the last non-empty page: `44`
- Empty termination page: `30`
- Endpoint exhausted: `true`

The scanner processed the short page 29 as a normal page and stopped only after page 30 returned an empty array. This is a complete census of the endpoint traversal observed during this execution, not a transactional snapshot or a permanent API contract.

Phase C also observed 2844 records, 29 non-empty pages, 44 records on the last non-empty page, and an empty termination page 30. The comparable execution metrics did not change between the two runs.

## Field characterization

| Field | Present | Missing | Observed types | Null | Empty | Whitespace only | Non-empty strings | Raw length | Trimmed length |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |
| `id` | 2844 | 0 | number | 0 | — | — | — | — | — |
| `id_entidade` | 2844 | 0 | number | 0 | — | — | — | — | — |
| `razao_social` | 2844 | 0 | string | 0 | 0 | 0 | 2844 | 3–60 | 3–60 |
| `nome_fantasia` | 2844 | 0 | null, string | 2005 | 352 | 0 | 487 | 0–62 | 0–62 |
| `cpf` | 2844 | 0 | null, string | 490 | 45 | 0 | 2309 | 0–14 | 0–14 |
| `cnpj` | 2844 | 0 | null, string | 2355 | 9 | 0 | 480 | 0–18 | 0–18 |

All six fields were present in every observed record. Presence does not imply a non-null or usable value.

## CPF/CNPJ

### CPF

- Null: `490`
- Empty string: `45`
- Whitespace-only: `0`
- Non-empty string: `2309`
- `DIGITS_ONLY`: `0`
- `STANDARD_PUNCTUATED`: `2309`
- `OTHER`: `0`
- Raw length distribution for non-empty strings: length `14` → `2309`

### CNPJ

- Null: `2355`
- Empty string: `9`
- Whitespace-only: `0`
- Non-empty string: `480`
- `DIGITS_ONLY`: `0`
- `STANDARD_PUNCTUATED`: `480`
- `OTHER`: `0`
- Raw length distribution for non-empty strings: length `18` → `480`

Format classification describes syntax only. It does not establish mathematical validity, ownership, or identity.

### CPF × CNPJ usability

| CPF usable | CNPJ usable | Records |
| --- | --- | ---: |
| Yes | No | 2309 |
| No | Yes | 480 |
| Yes | Yes | 0 |
| No | No | 55 |

“Usable” means only a string that remains non-empty after trimming.

## Identity candidates

| Field | Non-null | Distinct | Duplicate occurrences | Duplicate groups | Census observation |
| --- | ---: | ---: | ---: | ---: | --- |
| `id` | 2844 | 2844 | 0 | 0 | `OBSERVED_UNIQUE_IN_COMPLETE_CENSUS` |
| `id_entidade` | 2844 | 2844 | 0 | 0 | `OBSERVED_UNIQUE_IN_COMPLETE_CENSUS` |

Both fields were non-null and unique within this complete endpoint traversal. This does not establish either field as a guaranteed primary key, prove stability over time, or create a TagPlus contractual guarantee.

## Cardinality

- Paired records: `2844`
- Distinct pairs: `2844`
- IDs associated with multiple entity IDs: `0`
- Entity IDs associated with multiple IDs: `0`
- Maximum entity IDs per ID: `1`
- Maximum IDs per entity ID: `1`
- Observed cardinality: `OBSERVED_ONE_TO_ONE`

The one-to-one result applies only to the values observed in this census.

## Preliminary modeling implications

- `id` and `id_entidade` are both supported as identity candidates for later evaluation because each was non-null and census-unique.
- The observed one-to-one relationship means either identifier could technically support record correlation in this dataset, but stability and semantic ownership remain unproven.
- `razao_social` was always a non-empty string in the observed census.
- `nome_fantasia`, `cpf`, and `cnpj` require representations that preserve null and empty-string distinctions unless a later semantic decision explicitly normalizes them.
- CPF and CNPJ were syntactically homogeneous among non-empty values, but no verifier-digit validation was performed.
- CPF and CNPJ were mutually exclusive among usable values in this census; 55 records had neither usable value.
- A later modeling gate must decide identifier semantics, normalization policy, validation policy, and database constraints. This evidence does not define a final Prisma schema.

## Privacy review

- Raw payload persisted: **NO**
- Real fixture created: **NO**
- Customer values persisted: **NO**
- Customer IDs persisted: **NO**
- PII logged: **NO**
- Token persisted: **NO**
- Refresh token persisted: **NO**
- Authorization header persisted: **NO**
- Fingerprint/hash persisted: **NO**
- Individual examples persisted: **NO**

The evidence contains only fixed field names, execution states, types, counts, lengths, format classes, uniqueness metrics, and aggregate cardinality metrics.
