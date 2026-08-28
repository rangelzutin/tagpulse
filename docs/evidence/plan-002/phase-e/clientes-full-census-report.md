# PLAN-002 — Phase E full structural census

## Rerun

The first attempt returned HTTP 200 in 53.45 seconds, but its body was not captured because the local collection window ended at 30 seconds. It was not treated as a completed census.

The separately authorized rerun was performed exactly once. The response was captured after 75.44 seconds, with HTTP 200. No additional scan was attempted. The long JSON exceeded the conversation display limit, so part of the path and shape lists was omitted by the display layer; totals and the formal completion fields were captured.

## Execution

| Metric                 |                        Result |
| ---------------------- | ----------------------------: |
| Records                |                         2,844 |
| Non-empty pages        |                            29 |
| Last non-empty page    |                            29 |
| Last page records      |                            44 |
| Empty termination page |                            30 |
| Endpoint exhausted     |                        `true` |
| Execution complete     |                        `true` |
| Status                 | `COMPLETE_ENDPOINT_EXHAUSTED` |

The short final non-empty page did not terminate the scan. Page 30 returned the terminating empty array.

## Structural overview

| Metric                         | Result |
| ------------------------------ | -----: |
| Unique paths                   |    195 |
| Maximum depth                  |      5 |
| Array paths                    |      6 |
| Object paths                   |     17 |
| Multi-type paths               |     31 |
| Structural shapes              |    189 |
| Dynamic-key parents normalized |      1 |

Arrays: `$.anexos`, `$.contatos`, `$.enderecos`, `$.saldo_devedor.<dynamic-key>.lancamentos`, `$.tributo_ncm`, and `$.vendedores`.

## New discovery versus exploration

- Paths observed in exploration: 87.
- Paths observed in census: 195.
- New paths discovered by census: 108.

The full list of 108 new paths could not be reconstructed from the truncated display without making a prohibited second request. The count came directly from the complete response totals and is not an estimate.

## Optional and rare paths

| Path                                          | Present | Missing |  Null | Types                      |
| --------------------------------------------- | ------: | ------: | ----: | -------------------------- |
| `$.categoria`                                 |   2,844 |       0 | 2,506 | `null`, `object`           |
| `$.categoria.descricao`                       |     338 |   2,506 |     0 | `string`                   |
| `$.contatos[]`                                |   1,871 |     973 |     0 | `object`                   |
| `$.contatos[].tipo_cadastro.descricao`        |     199 |   2,645 |     0 | `string`                   |
| `$.enderecos[]`                               |   2,800 |      44 |     0 | `object`                   |
| `$.enderecos[].tipo_cadastro.descricao`       |   1,107 |   1,737 |     0 | `string`                   |
| `$.extras.id_forma_pagamento`                 |     700 |   2,144 |   674 | `null`, `number`, `string` |
| `$.saldo_devedor.<dynamic-key>.lancamentos[]` |   1,390 |   1,454 |     0 | `object`                   |
| `$.tributo_ncm[]`                             |       2 |   2,842 |     0 | `object`                   |
| `$.vendedores[]`                              |     294 |   2,550 |     0 | `object`                   |

These counts distinguish absence from an explicitly observed `null`.

## Type variations

Thirty-one multi-type paths were observed. They are preserved by name in the JSON evidence. Most combine `null` with one concrete type. `$.extras.id_forma_pagamento` was observed as `null`, `number`, and `string`.

## Structural shapes

The census observed 189 anonymous structural shapes. The ten most frequent are preserved in the JSON evidence. The dominant shape covered 781 records (27.4613%), followed by 443 (15.5767%) and 262 (9.2124%). The display layer truncated part of the full distribution.

## Novelty and saturation

- Last novel path: record 1,530, page 16.
- Last novel shape: record 2,841, page 29.
- Profiler saturation marker: record 2,530, page 26.
- Endpoint exhaustion: page 30.

The appearance of a new shape at record 2,841 confirms why saturation was not used as a termination condition.

## Dynamic keys

One dynamic-key parent class was normalized. All related paths use `$.saldo_devedor.<dynamic-key>`; no concrete business key was exposed.

## Interpretation

### DOCUMENTED

The approved census uses `fields=*`, `per_page=100`, sequential pagination, and only an empty array as endpoint termination.

### OBSERVED

The endpoint yielded 2,844 records across 29 non-empty pages. Page 29 contained 44 records and page 30 returned the terminating empty array. The census found 195 paths, 31 multi-type paths, and 189 structural shapes. Structural novelty continued through page 29.

### INFERRED

The expanded customer representation is substantially more variable than the one-record exploration suggested. The observations characterize this completed scan, not an immutable API contract.

## Recommendation

`Gate E-Census: APPROVED` because endpoint exhaustion, execution completion, the completion status, and the empty termination page were explicitly captured.

The project is ready to design — but not yet execute — the privacy-safe characterization of relevant identity, registration, contact, address, status, date, and fiscal fields before designing `Customer`. Financial fields should remain outside that characterization until their domain relevance is separately decided.

## Privacy review

- Raw payload persisted: **NO**
- Real fixture created: **NO**
- Customer values persisted: **NO**
- Customer IDs persisted: **NO**
- Email values persisted: **NO**
- Phone values persisted: **NO**
- Address values persisted: **NO**
- CPF/CNPJ values persisted: **NO**
- Financial values persisted: **NO**
- PII logged: **NO**
- Token persisted: **NO**
- Refresh token persisted: **NO**
- Authorization header persisted: **NO**
- Fingerprint/hash of customer persisted: **NO**
- Individual examples persisted: **NO**
- Concrete item URL persisted/exposed: **NO**
- Dynamic business keys exposed: **NO**
