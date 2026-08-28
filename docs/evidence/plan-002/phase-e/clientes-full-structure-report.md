# PLAN-002 — Phase E exploratory discovery

## DOCUMENTED

The official TagPlus API v2.0 guide states that collection responses include only the principal fields by default, that `fields=*` requests all fields, and that item access returns all fields by default. These documented statements motivated the comparison; they were not treated as observations before this execution.

Source: <https://developers.tagplus.com.br/doc>

## OBSERVED

Overall status: `COMPLETE`.

- `COLLECTION_DEFAULT`: HTTP 200, success, one record structurally profiled.
- `COLLECTION_FIELDS_ALL`: HTTP 200, success, one record structurally profiled.
- `ITEM_DETAIL`: HTTP 200, success, one record structurally profiled using only the default collection's `id` in memory.
- Same record across collections: `true`.
- Item matches default: `true`.

This was a one-record exploratory inspection, not a census and not a transactional snapshot.

| Mode | Unique paths | Maximum depth | Array paths | Object paths | Shapes |
| --- | ---: | ---: | ---: | ---: | ---: |
| `COLLECTION_DEFAULT` | 7 | 1 | 0 | 1 | 1 |
| `COLLECTION_FIELDS_ALL` | 87 | 5 | 6 | 9 | 1 |
| `ITEM_DETAIL` | 87 | 5 | 6 | 9 | 1 |

The default collection exposed only `$` plus `cnpj`, `cpf`, `id`, `id_entidade`, `nome_fantasia`, and `razao_social` for the observed record.

The expanded collection and item exposed the same observed path/type set. In addition to the default paths, the structure included root fields concerning status, classification, codes, dates, spouse/family data, personal/fiscal data, credit/balance data, email, telephone, contacts, addresses, sellers, attachments, NCM taxation, and other customer attributes. The complete privacy-safe path/type list is preserved in `clientes-full-structure-evidence.json`.

Observed arrays:

- `$.anexos`
- `$.contatos`
- `$.enderecos`
- `$.saldo_devedor.<dynamic-key>.lancamentos`
- `$.tributo_ncm`
- `$.vendedores`

Observed nested object paths:

- `$.contatos[]`
- `$.contatos[].tipo_contato`
- `$.enderecos[]`
- `$.enderecos[].cidade`
- `$.enderecos[].cidade.estado`
- `$.enderecos[].pais`
- `$.saldo_devedor`
- `$.saldo_devedor.<dynamic-key>`

The deepest observed paths reached depth 5. One path, `$.contatos[].tipo_contato`, was multi-type (`null | object`) within the single profiled record because different array elements had different types.

## COMPARISON

- Paths exclusive to default: none.
- Paths exclusive to `fields=*`: none, because every expanded path also appeared in item detail.
- Paths exclusive to item: none.
- Paths common to all: `$`, `cnpj`, `cpf`, `id`, `id_entidade`, `nome_fantasia`, `razao_social`.
- Type changes for shared paths: none in the observed record.
- `fields=*` and item detail had identical observed path/type sets, depths, array paths, and object paths.

Interpretation flags:

```text
default collection appears reduced: YES
fields=* expands collection: YES
item expands collection: YES
fields=* equivalent to item for observed record: YES
```

## INTERPRETATION

### DOCUMENTED

Collections are summarized by default; `fields=*` requests all fields; item access returns all fields by default.

### OBSERVED

For the same observed customer, the default projection contained 7 normalized paths, while both expanded mechanisms contained 87. Email, telephone, addresses, contacts, status, registration dates, personal/fiscal attributes and related nested structures appeared as field paths. No item-only path was observed.

### INFERRED

For this observed record, `/clientes?fields=*` appears structurally sufficient to obtain the same customer representation as `/clientes/{id}`. This does not prove equivalence for every customer, establish field nullability across the endpoint, or guarantee a permanent API contract.

## Recommended next path

`PATH A` is recommended: design a complete structural census of `/clientes?fields=*` before Customer modeling. It is materially more efficient than issuing one item request per customer and, for the observed record, contained all item paths.

The census should measure the union of paths, presence/missing/null, observed types, arrays, nested objects, structural shapes, saturation, payload/runtime impact, and endpoint exhaustion. It must not begin without a separate gate.

## Privacy review

- Raw payload persisted: **NO**
- Real fixture created: **NO**
- Customer values persisted: **NO**
- Customer IDs persisted: **NO**
- Email values persisted: **NO**
- Phone values persisted: **NO**
- Address values persisted: **NO**
- PII logged: **NO**
- Token persisted: **NO**
- Refresh token persisted: **NO**
- Authorization header persisted: **NO**
- Fingerprint/hash persisted: **NO**
- Individual examples persisted: **NO**
- Concrete item URL persisted/exposed: **NO**

Only fixed execution states, counts, normalized paths, observed JSON types, and structural comparisons were preserved.
