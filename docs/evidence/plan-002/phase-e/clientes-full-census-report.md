# PLAN-002 — Phase E full structural census

## Rerun

The first attempt returned HTTP 200 in 53.45 seconds, but its body was not captured because the local collection window ended at 30 seconds. It was not treated as a completed census.

The separately authorized rerun was performed exactly once. The server completed it in 77.4229394 seconds with HTTP 200, and the client captured the complete aggregate response in 77.424504 seconds. No additional scan was attempted.

## Execution

| Metric | Result |
| --- | ---: |
| Records fetched | 2,844 |
| Non-empty pages | 29 |
| Last non-empty page | 29 |
| Last page records | 44 |
| Empty termination page | 30 |
| Endpoint exhausted | `true` |
| Execution complete | `true` |
| Status | `COMPLETE_ENDPOINT_EXHAUSTED` |

The short final non-empty page did not terminate the scan. Page 30 returned the explicitly observed terminating empty array.

## Structural overview

| Metric | Result |
| --- | ---: |
| Unique paths | 195 |
| Maximum depth | 5 |
| Array paths | 6 |
| Object paths | 17 |
| Multi-type paths | 31 |
| Structural shapes | 189 |
| Dynamic-key parents normalized | 1 |

Arrays: `$.anexos`, `$.contatos`, `$.enderecos`, `$.saldo_devedor.<dynamic-key>.lancamentos`, `$.tributo_ncm`, `$.vendedores`.

Objects: `$`, `$.categoria`, `$.contatos[]`, `$.contatos[].tipo_cadastro`, `$.contatos[].tipo_contato`, `$.enderecos[]`, `$.enderecos[].cidade`, `$.enderecos[].cidade.estado`, `$.enderecos[].pais`, `$.enderecos[].tipo_cadastro`, `$.extras`, `$.saldo_devedor`, `$.saldo_devedor.<dynamic-key>`, `$.saldo_devedor.<dynamic-key>.lancamentos[]`, `$.tributo_ncm[]`, `$.tributo_ncm[].tributo_detalhe`, `$.vendedores[]`.

## Exploration versus census

- Exploration paths: 87.
- Census paths: 195.
- New paths found: 108.

Complete new-path list:

- `$.categoria.descricao`
- `$.categoria.id`
- `$.categoria.id_categoria_mae`
- `$.contatos[].tipo_cadastro.descricao`
- `$.contatos[].tipo_cadastro.id`
- `$.enderecos[].tipo_cadastro.descricao`
- `$.enderecos[].tipo_cadastro.id`
- `$.extras.id_forma_pagamento`
- `$.extras.pasta`
- `$.extras.servidor`
- `$.extras.url_get`
- `$.saldo_devedor.<dynamic-key>.lancamentos[]`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].descricao`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].email`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].id_financeiro`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].telefone`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].valor`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].valor_com_juros`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].vencimento`
- `$.tributo_ncm[]`
- `$.tributo_ncm[].descricao`
- `$.tributo_ncm[].id`
- `$.tributo_ncm[].ncm`
- `$.tributo_ncm[].tributo_detalhe`
- `$.tributo_ncm[].tributo_detalhe.aliquota_calculo_credito`
- `$.tributo_ncm[].tributo_detalhe.aliquota_cbs`
- `$.tributo_ncm[].tributo_detalhe.aliquota_cide`
- `$.tributo_ncm[].tributo_detalhe.aliquota_cofins`
- `$.tributo_ncm[].tributo_detalhe.aliquota_cofins_st`
- `$.tributo_ncm[].tributo_detalhe.aliquota_cred_presumido`
- `$.tributo_ncm[].tributo_detalhe.aliquota_diferimento_cbs`
- `$.tributo_ncm[].tributo_detalhe.aliquota_diferimento_estadual`
- `$.tributo_ncm[].tributo_detalhe.aliquota_diferimento_municipal`
- `$.tributo_ncm[].tributo_detalhe.aliquota_fcp`
- `$.tributo_ncm[].tributo_detalhe.aliquota_fcp_interestadual`
- `$.tributo_ncm[].tributo_detalhe.aliquota_fcp_st`
- `$.tributo_ncm[].tributo_detalhe.aliquota_fcp_st_ret`
- `$.tributo_ncm[].tributo_detalhe.aliquota_ibs_estadual`
- `$.tributo_ncm[].tributo_detalhe.aliquota_ibs_municipal`
- `$.tributo_ncm[].tributo_detalhe.aliquota_icms`
- `$.tributo_ncm[].tributo_detalhe.aliquota_icms_desonerado`
- `$.tributo_ncm[].tributo_detalhe.aliquota_icms_desonerado_st`
- `$.tributo_ncm[].tributo_detalhe.aliquota_icms_efetivo`
- `$.tributo_ncm[].tributo_detalhe.aliquota_icms_st`
- `$.tributo_ncm[].tributo_detalhe.aliquota_icms_st_fcp`
- `$.tributo_ncm[].tributo_detalhe.aliquota_ii`
- `$.tributo_ncm[].tributo_detalhe.aliquota_interna_uf_destino_fcp`
- `$.tributo_ncm[].tributo_detalhe.aliquota_iof`
- `$.tributo_ncm[].tributo_detalhe.aliquota_ipi`
- `$.tributo_ncm[].tributo_detalhe.aliquota_pis`
- `$.tributo_ncm[].tributo_detalhe.aliquota_pis_st`
- `$.tributo_ncm[].tributo_detalhe.base_calculo_cide`
- `$.tributo_ncm[].tributo_detalhe.base_calculo_icms`
- `$.tributo_ncm[].tributo_detalhe.calculo_icms_interestadual`
- `$.tributo_ncm[].tributo_detalhe.cest`
- `$.tributo_ncm[].tributo_detalhe.cfop`
- `$.tributo_ncm[].tributo_detalhe.class_trib_descricao`
- `$.tributo_ncm[].tributo_detalhe.cod_class_trib`
- `$.tributo_ncm[].tributo_detalhe.cod_cred_presumido`
- `$.tributo_ncm[].tributo_detalhe.codigo_autorizacao`
- `$.tributo_ncm[].tributo_detalhe.codigo_beneficio_fiscal`
- `$.tributo_ncm[].tributo_detalhe.codigo_produto_anp`
- `$.tributo_ncm[].tributo_detalhe.csosn`
- `$.tributo_ncm[].tributo_detalhe.cst_a`
- `$.tributo_ncm[].tributo_detalhe.cst_b`
- `$.tributo_ncm[].tributo_detalhe.cst_cofins`
- `$.tributo_ncm[].tributo_detalhe.cst_ipi`
- `$.tributo_ncm[].tributo_detalhe.cst_is`
- `$.tributo_ncm[].tributo_detalhe.cst_pis`
- `$.tributo_ncm[].tributo_detalhe.descricao_produto_anp`
- `$.tributo_ncm[].tributo_detalhe.enquadramento_ipi`
- `$.tributo_ncm[].tributo_detalhe.id`
- `$.tributo_ncm[].tributo_detalhe.informacoes_interesse_fisco`
- `$.tributo_ncm[].tributo_detalhe.modalidade_base_calculo_icms`
- `$.tributo_ncm[].tributo_detalhe.modalidade_base_calculo_icms_st`
- `$.tributo_ncm[].tributo_detalhe.modalidade_calculo_ipi`
- `$.tributo_ncm[].tributo_detalhe.modalidade_cofins`
- `$.tributo_ncm[].tributo_detalhe.modalidade_cofins_st`
- `$.tributo_ncm[].tributo_detalhe.modalidade_pis`
- `$.tributo_ncm[].tributo_detalhe.modalidade_pis_st`
- `$.tributo_ncm[].tributo_detalhe.motivo_desonerado`
- `$.tributo_ncm[].tributo_detalhe.motivo_desonerado_st`
- `$.tributo_ncm[].tributo_detalhe.mva_icms_st`
- `$.tributo_ncm[].tributo_detalhe.natureza_operacao`
- `$.tributo_ncm[].tributo_detalhe.observacoes_item`
- `$.tributo_ncm[].tributo_detalhe.percentual_gas_natural_importado`
- `$.tributo_ncm[].tributo_detalhe.percentual_gas_natural_nacional`
- `$.tributo_ncm[].tributo_detalhe.percentual_glp_petroleo`
- `$.tributo_ncm[].tributo_detalhe.quantidade_combustivel`
- `$.tributo_ncm[].tributo_detalhe.reducao_base_calculo_efetivo`
- `$.tributo_ncm[].tributo_detalhe.reducao_base_calculo_icms`
- `$.tributo_ncm[].tributo_detalhe.reducao_base_calculo_icms_st`
- `$.tributo_ncm[].tributo_detalhe.st_cofins`
- `$.tributo_ncm[].tributo_detalhe.st_pis`
- `$.tributo_ncm[].tributo_detalhe.uf_consumo`
- `$.tributo_ncm[].tributo_detalhe.valor_aliquota_cofins`
- `$.tributo_ncm[].tributo_detalhe.valor_aliquota_cofins_st`
- `$.tributo_ncm[].tributo_detalhe.valor_aliquota_pis`
- `$.tributo_ncm[].tributo_detalhe.valor_aliquota_pis_st`
- `$.tributo_ncm[].tributo_detalhe.valor_cide`
- `$.tributo_ncm[].tributo_detalhe.valor_icms_substituto`
- `$.tributo_ncm[].tributo_detalhe.valor_partida`
- `$.tributo_ncm[].tributo_detalhe.valor_unidade_tributavel`
- `$.vendedores[]`
- `$.vendedores[].cpf`
- `$.vendedores[].data_alteracao`
- `$.vendedores[].id`
- `$.vendedores[].nome`

## Optional and rare paths

Every path with `presentCount < recordsFetched` is listed below. Missing and explicit `null` remain separate.

| Path | Present | Missing | Null | Observed types |
| --- | ---: | ---: | ---: | --- |
| `$.categoria.descricao` | 338 | 2,506 | 0 | `string` |
| `$.categoria.id` | 338 | 2,506 | 0 | `number` |
| `$.categoria.id_categoria_mae` | 338 | 2,506 | 0 | `number` |
| `$.contatos[]` | 1,871 | 973 | 0 | `object` |
| `$.contatos[].descricao` | 1,871 | 973 | 0 | `string` |
| `$.contatos[].detalhes` | 1,871 | 973 | 552 | `null`, `string` |
| `$.contatos[].estrangeiro` | 1,871 | 973 | 0 | `boolean` |
| `$.contatos[].id` | 1,871 | 973 | 0 | `number` |
| `$.contatos[].principal` | 1,871 | 973 | 0 | `boolean` |
| `$.contatos[].tipo_cadastro` | 1,871 | 973 | 1,696 | `null`, `object` |
| `$.contatos[].tipo_cadastro.descricao` | 199 | 2,645 | 0 | `string` |
| `$.contatos[].tipo_cadastro.id` | 199 | 2,645 | 0 | `number` |
| `$.contatos[].tipo_contato` | 1,871 | 973 | 31 | `null`, `object` |
| `$.contatos[].tipo_contato.descricao` | 1,867 | 977 | 0 | `string` |
| `$.contatos[].tipo_contato.id` | 1,867 | 977 | 0 | `number` |
| `$.enderecos[]` | 2,800 | 44 | 0 | `object` |
| `$.enderecos[].bairro` | 2,800 | 44 | 0 | `string` |
| `$.enderecos[].cep` | 2,800 | 44 | 0 | `string` |
| `$.enderecos[].cidade` | 2,800 | 44 | 0 | `object` |
| `$.enderecos[].cidade.codigo` | 2,800 | 44 | 0 | `number` |
| `$.enderecos[].cidade.estado` | 2,800 | 44 | 0 | `object` |
| `$.enderecos[].cidade.estado.codigo` | 2,800 | 44 | 0 | `number` |
| `$.enderecos[].cidade.estado.id` | 2,800 | 44 | 0 | `number` |
| `$.enderecos[].cidade.estado.nome` | 2,800 | 44 | 0 | `string` |
| `$.enderecos[].cidade.estado.sigla` | 2,800 | 44 | 0 | `string` |
| `$.enderecos[].cidade.id` | 2,800 | 44 | 0 | `number` |
| `$.enderecos[].cidade.nome` | 2,800 | 44 | 0 | `string` |
| `$.enderecos[].complemento` | 2,800 | 44 | 0 | `string` |
| `$.enderecos[].exterior` | 2,800 | 44 | 0 | `boolean` |
| `$.enderecos[].id` | 2,800 | 44 | 0 | `number` |
| `$.enderecos[].id_endereco_entidade` | 2,800 | 44 | 0 | `number` |
| `$.enderecos[].informacoes_adicionais` | 2,800 | 44 | 84 | `null`, `string` |
| `$.enderecos[].logradouro` | 2,800 | 44 | 0 | `string` |
| `$.enderecos[].numero` | 2,800 | 44 | 0 | `string` |
| `$.enderecos[].pais` | 2,800 | 44 | 0 | `object` |
| `$.enderecos[].pais.codigo` | 2,800 | 44 | 0 | `number` |
| `$.enderecos[].pais.id` | 2,800 | 44 | 0 | `number` |
| `$.enderecos[].pais.nome` | 2,800 | 44 | 0 | `string` |
| `$.enderecos[].principal` | 2,800 | 44 | 0 | `boolean` |
| `$.enderecos[].tipo_cadastro` | 2,800 | 44 | 1,729 | `null`, `object` |
| `$.enderecos[].tipo_cadastro.descricao` | 1,107 | 1,737 | 0 | `string` |
| `$.enderecos[].tipo_cadastro.id` | 1,107 | 1,737 | 0 | `number` |
| `$.extras.id_forma_pagamento` | 700 | 2,144 | 674 | `null`, `number`, `string` |
| `$.extras.pasta` | 1,265 | 1,579 | 0 | `string` |
| `$.extras.servidor` | 1,265 | 1,579 | 0 | `string` |
| `$.extras.url_get` | 1,265 | 1,579 | 0 | `string` |
| `$.saldo_devedor.<dynamic-key>.lancamentos[]` | 1,390 | 1,454 | 0 | `object` |
| `$.saldo_devedor.<dynamic-key>.lancamentos[].descricao` | 1,390 | 1,454 | 0 | `string` |
| `$.saldo_devedor.<dynamic-key>.lancamentos[].email` | 1,390 | 1,454 | 0 | `string` |
| `$.saldo_devedor.<dynamic-key>.lancamentos[].id_financeiro` | 1,390 | 1,454 | 0 | `number` |
| `$.saldo_devedor.<dynamic-key>.lancamentos[].telefone` | 1,390 | 1,454 | 0 | `string` |
| `$.saldo_devedor.<dynamic-key>.lancamentos[].valor` | 1,390 | 1,454 | 0 | `number` |
| `$.saldo_devedor.<dynamic-key>.lancamentos[].valor_com_juros` | 1,390 | 1,454 | 0 | `number` |
| `$.saldo_devedor.<dynamic-key>.lancamentos[].vencimento` | 1,390 | 1,454 | 0 | `string` |
| `$.tributo_ncm[]` | 2 | 2,842 | 0 | `object` |
| `$.tributo_ncm[].descricao` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].id` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].ncm` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe` | 2 | 2,842 | 0 | `object` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_calculo_credito` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_cbs` | 2 | 2,842 | 0 | `number` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_cide` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_cofins` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_cofins_st` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_cred_presumido` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_diferimento_cbs` | 2 | 2,842 | 0 | `number` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_diferimento_estadual` | 2 | 2,842 | 0 | `number` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_diferimento_municipal` | 2 | 2,842 | 0 | `number` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_fcp` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_fcp_interestadual` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_fcp_st` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_fcp_st_ret` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_ibs_estadual` | 2 | 2,842 | 0 | `number` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_ibs_municipal` | 2 | 2,842 | 0 | `number` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_icms` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_icms_desonerado` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_icms_desonerado_st` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_icms_efetivo` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_icms_st` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_icms_st_fcp` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_ii` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_interna_uf_destino_fcp` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_iof` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_ipi` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_pis` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.aliquota_pis_st` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.base_calculo_cide` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.base_calculo_icms` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.calculo_icms_interestadual` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.cest` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.cfop` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.class_trib_descricao` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.cod_class_trib` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.cod_cred_presumido` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.codigo_autorizacao` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.codigo_beneficio_fiscal` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.codigo_produto_anp` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.csosn` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.cst_a` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.cst_b` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.cst_cofins` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.cst_ipi` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.cst_is` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.cst_pis` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.descricao_produto_anp` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.enquadramento_ipi` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.id` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.informacoes_interesse_fisco` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.modalidade_base_calculo_icms` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.modalidade_base_calculo_icms_st` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.modalidade_calculo_ipi` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.modalidade_cofins` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.modalidade_cofins_st` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.modalidade_pis` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.modalidade_pis_st` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.motivo_desonerado` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.motivo_desonerado_st` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.mva_icms_st` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.natureza_operacao` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.observacoes_item` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.percentual_gas_natural_importado` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.percentual_gas_natural_nacional` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.percentual_glp_petroleo` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.quantidade_combustivel` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.reducao_base_calculo_efetivo` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.reducao_base_calculo_icms` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.reducao_base_calculo_icms_st` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.st_cofins` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.st_pis` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.uf_consumo` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.valor_aliquota_cofins` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.valor_aliquota_cofins_st` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.valor_aliquota_pis` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.valor_aliquota_pis_st` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.valor_cide` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.valor_icms_substituto` | 2 | 2,842 | 0 | `string` |
| `$.tributo_ncm[].tributo_detalhe.valor_partida` | 2 | 2,842 | 2 | `null` |
| `$.tributo_ncm[].tributo_detalhe.valor_unidade_tributavel` | 2 | 2,842 | 0 | `string` |
| `$.vendedores[]` | 294 | 2,550 | 0 | `object` |
| `$.vendedores[].cpf` | 294 | 2,550 | 0 | `string` |
| `$.vendedores[].data_alteracao` | 294 | 2,550 | 0 | `string` |
| `$.vendedores[].id` | 294 | 2,550 | 0 | `number` |
| `$.vendedores[].nome` | 294 | 2,550 | 0 | `string` |

## Type variations

All 31 paths with more than one observed type:

| Path | Present | Missing | Null | Observed types |
| --- | ---: | ---: | ---: | --- |
| `$.categoria` | 2,844 | 0 | 2,506 | `null`, `object` |
| `$.cnae` | 2,844 | 0 | 2,777 | `null`, `string` |
| `$.cnpj` | 2,844 | 0 | 2,355 | `null`, `string` |
| `$.codigo` | 2,844 | 0 | 21 | `null`, `string` |
| `$.codigo_externo` | 2,844 | 0 | 2,227 | `null`, `string` |
| `$.conjuge_cpf` | 2,844 | 0 | 1,800 | `null`, `string` |
| `$.conjuge_nome` | 2,844 | 0 | 1,377 | `null`, `string` |
| `$.conjuge_profissao` | 2,844 | 0 | 1,800 | `null`, `string` |
| `$.contatos[].detalhes` | 1,871 | 973 | 552 | `null`, `string` |
| `$.contatos[].tipo_cadastro` | 1,871 | 973 | 1,696 | `null`, `object` |
| `$.contatos[].tipo_contato` | 1,871 | 973 | 31 | `null`, `object` |
| `$.cpf` | 2,844 | 0 | 490 | `null`, `string` |
| `$.data_alteracao` | 2,844 | 0 | 93 | `null`, `string` |
| `$.data_nascimento` | 2,844 | 0 | 2,820 | `null`, `string` |
| `$.enderecos[].informacoes_adicionais` | 2,800 | 44 | 84 | `null`, `string` |
| `$.enderecos[].tipo_cadastro` | 2,800 | 44 | 1,729 | `null`, `object` |
| `$.estado_civil` | 2,844 | 0 | 1,760 | `null`, `string` |
| `$.extras` | 2,844 | 0 | 881 | `null`, `object` |
| `$.extras.id_forma_pagamento` | 700 | 2,144 | 674 | `null`, `number`, `string` |
| `$.filiacao_mae` | 2,844 | 0 | 1,800 | `null`, `string` |
| `$.filiacao_pai` | 2,844 | 0 | 1,800 | `null`, `string` |
| `$.identidade_estrangeiro` | 2,844 | 0 | 1,377 | `null`, `string` |
| `$.ie` | 2,844 | 0 | 1,327 | `null`, `string` |
| `$.im` | 2,844 | 0 | 2,314 | `null`, `string` |
| `$.informacao_adicional` | 2,844 | 0 | 52 | `null`, `string` |
| `$.nome_fantasia` | 2,844 | 0 | 2,005 | `null`, `string` |
| `$.profissao` | 2,844 | 0 | 1,800 | `null`, `string` |
| `$.responsavel` | 2,844 | 0 | 2,749 | `null`, `string` |
| `$.rg` | 2,844 | 0 | 1,800 | `null`, `string` |
| `$.sexo` | 2,844 | 0 | 497 | `null`, `string` |
| `$.suframa` | 2,844 | 0 | 1,377 | `null`, `string` |

## Structural shapes

Complete aggregate distribution; IDs are structural and deterministic, with no customer fingerprint.

| Shape ID | Records | Percentage | Path count |
| --- | ---: | ---: | ---: |
| SHAPE_001 | 781 | 27.4613% | 80 |
| SHAPE_002 | 443 | 15.5767% | 90 |
| SHAPE_003 | 262 | 9.2124% | 102 |
| SHAPE_004 | 190 | 6.6807% | 97 |
| SHAPE_005 | 171 | 6.0127% | 101 |
| SHAPE_006 | 75 | 2.6371% | 96 |
| SHAPE_007 | 53 | 1.8636% | 99 |
| SHAPE_008 | 30 | 1.0549% | 95 |
| SHAPE_009 | 28 | 0.9845% | 87 |
| SHAPE_010 | 27 | 0.9494% | 87 |
| SHAPE_011 | 27 | 0.9494% | 98 |
| SHAPE_012 | 27 | 0.9494% | 101 |
| SHAPE_013 | 24 | 0.8439% | 87 |
| SHAPE_014 | 24 | 0.8439% | 98 |
| SHAPE_015 | 23 | 0.8087% | 91 |
| SHAPE_016 | 21 | 0.7384% | 85 |
| SHAPE_017 | 21 | 0.7384% | 87 |
| SHAPE_018 | 20 | 0.7032% | 52 |
| SHAPE_019 | 19 | 0.6681% | 99 |
| SHAPE_020 | 19 | 0.6681% | 99 |
| SHAPE_021 | 19 | 0.6681% | 91 |
| SHAPE_022 | 18 | 0.6329% | 88 |
| SHAPE_023 | 18 | 0.6329% | 101 |
| SHAPE_024 | 17 | 0.5977% | 96 |
| SHAPE_025 | 16 | 0.5626% | 100 |
| SHAPE_026 | 14 | 0.4923% | 97 |
| SHAPE_027 | 12 | 0.4219% | 98 |
| SHAPE_028 | 12 | 0.4219% | 88 |
| SHAPE_029 | 11 | 0.3868% | 96 |
| SHAPE_030 | 11 | 0.3868% | 99 |
| SHAPE_031 | 10 | 0.3516% | 100 |
| SHAPE_032 | 10 | 0.3516% | 86 |
| SHAPE_033 | 9 | 0.3165% | 101 |
| SHAPE_034 | 9 | 0.3165% | 95 |
| SHAPE_035 | 9 | 0.3165% | 98 |
| SHAPE_036 | 9 | 0.3165% | 101 |
| SHAPE_037 | 8 | 0.2813% | 96 |
| SHAPE_038 | 8 | 0.2813% | 98 |
| SHAPE_039 | 8 | 0.2813% | 87 |
| SHAPE_040 | 7 | 0.2461% | 98 |
| SHAPE_041 | 7 | 0.2461% | 98 |
| SHAPE_042 | 7 | 0.2461% | 89 |
| SHAPE_043 | 7 | 0.2461% | 86 |
| SHAPE_044 | 7 | 0.2461% | 91 |
| SHAPE_045 | 7 | 0.2461% | 88 |
| SHAPE_046 | 6 | 0.2110% | 89 |
| SHAPE_047 | 6 | 0.2110% | 95 |
| SHAPE_048 | 6 | 0.2110% | 97 |
| SHAPE_049 | 6 | 0.2110% | 94 |
| SHAPE_050 | 6 | 0.2110% | 93 |
| SHAPE_051 | 6 | 0.2110% | 95 |
| SHAPE_052 | 6 | 0.2110% | 101 |
| SHAPE_053 | 6 | 0.2110% | 100 |
| SHAPE_054 | 6 | 0.2110% | 100 |
| SHAPE_055 | 6 | 0.2110% | 87 |
| SHAPE_056 | 6 | 0.2110% | 99 |
| SHAPE_057 | 6 | 0.2110% | 97 |
| SHAPE_058 | 6 | 0.2110% | 87 |
| SHAPE_059 | 5 | 0.1758% | 100 |
| SHAPE_060 | 5 | 0.1758% | 102 |
| SHAPE_061 | 5 | 0.1758% | 100 |
| SHAPE_062 | 5 | 0.1758% | 60 |
| SHAPE_063 | 4 | 0.1406% | 96 |
| SHAPE_064 | 4 | 0.1406% | 90 |
| SHAPE_065 | 4 | 0.1406% | 65 |
| SHAPE_066 | 4 | 0.1406% | 98 |
| SHAPE_067 | 3 | 0.1055% | 104 |
| SHAPE_068 | 3 | 0.1055% | 96 |
| SHAPE_069 | 3 | 0.1055% | 61 |
| SHAPE_070 | 3 | 0.1055% | 98 |
| SHAPE_071 | 3 | 0.1055% | 100 |
| SHAPE_072 | 3 | 0.1055% | 95 |
| SHAPE_073 | 3 | 0.1055% | 96 |
| SHAPE_074 | 3 | 0.1055% | 100 |
| SHAPE_075 | 3 | 0.1055% | 99 |
| SHAPE_076 | 3 | 0.1055% | 91 |
| SHAPE_077 | 3 | 0.1055% | 88 |
| SHAPE_078 | 3 | 0.1055% | 100 |
| SHAPE_079 | 2 | 0.0703% | 87 |
| SHAPE_080 | 2 | 0.0703% | 95 |
| SHAPE_081 | 2 | 0.0703% | 100 |
| SHAPE_082 | 2 | 0.0703% | 99 |
| SHAPE_083 | 2 | 0.0703% | 88 |
| SHAPE_084 | 2 | 0.0703% | 88 |
| SHAPE_085 | 2 | 0.0703% | 100 |
| SHAPE_086 | 2 | 0.0703% | 98 |
| SHAPE_087 | 2 | 0.0703% | 79 |
| SHAPE_088 | 2 | 0.0703% | 91 |
| SHAPE_089 | 2 | 0.0703% | 55 |
| SHAPE_090 | 2 | 0.0703% | 61 |
| SHAPE_091 | 2 | 0.0703% | 87 |
| SHAPE_092 | 2 | 0.0703% | 89 |
| SHAPE_093 | 2 | 0.0703% | 92 |
| SHAPE_094 | 2 | 0.0703% | 95 |
| SHAPE_095 | 2 | 0.0703% | 53 |
| SHAPE_096 | 2 | 0.0703% | 98 |
| SHAPE_097 | 2 | 0.0703% | 91 |
| SHAPE_098 | 2 | 0.0703% | 53 |
| SHAPE_099 | 2 | 0.0703% | 87 |
| SHAPE_100 | 2 | 0.0703% | 96 |
| SHAPE_101 | 2 | 0.0703% | 103 |
| SHAPE_102 | 2 | 0.0703% | 101 |
| SHAPE_103 | 2 | 0.0703% | 98 |
| SHAPE_104 | 2 | 0.0703% | 103 |
| SHAPE_105 | 2 | 0.0703% | 87 |
| SHAPE_106 | 2 | 0.0703% | 52 |
| SHAPE_107 | 1 | 0.0352% | 89 |
| SHAPE_108 | 1 | 0.0352% | 95 |
| SHAPE_109 | 1 | 0.0352% | 99 |
| SHAPE_110 | 1 | 0.0352% | 97 |
| SHAPE_111 | 1 | 0.0352% | 101 |
| SHAPE_112 | 1 | 0.0352% | 97 |
| SHAPE_113 | 1 | 0.0352% | 98 |
| SHAPE_114 | 1 | 0.0352% | 104 |
| SHAPE_115 | 1 | 0.0352% | 87 |
| SHAPE_116 | 1 | 0.0352% | 93 |
| SHAPE_117 | 1 | 0.0352% | 103 |
| SHAPE_118 | 1 | 0.0352% | 99 |
| SHAPE_119 | 1 | 0.0352% | 90 |
| SHAPE_120 | 1 | 0.0352% | 90 |
| SHAPE_121 | 1 | 0.0352% | 97 |
| SHAPE_122 | 1 | 0.0352% | 90 |
| SHAPE_123 | 1 | 0.0352% | 94 |
| SHAPE_124 | 1 | 0.0352% | 89 |
| SHAPE_125 | 1 | 0.0352% | 89 |
| SHAPE_126 | 1 | 0.0352% | 100 |
| SHAPE_127 | 1 | 0.0352% | 97 |
| SHAPE_128 | 1 | 0.0352% | 93 |
| SHAPE_129 | 1 | 0.0352% | 86 |
| SHAPE_130 | 1 | 0.0352% | 89 |
| SHAPE_131 | 1 | 0.0352% | 98 |
| SHAPE_132 | 1 | 0.0352% | 98 |
| SHAPE_133 | 1 | 0.0352% | 99 |
| SHAPE_134 | 1 | 0.0352% | 78 |
| SHAPE_135 | 1 | 0.0352% | 87 |
| SHAPE_136 | 1 | 0.0352% | 78 |
| SHAPE_137 | 1 | 0.0352% | 100 |
| SHAPE_138 | 1 | 0.0352% | 98 |
| SHAPE_139 | 1 | 0.0352% | 86 |
| SHAPE_140 | 1 | 0.0352% | 96 |
| SHAPE_141 | 1 | 0.0352% | 98 |
| SHAPE_142 | 1 | 0.0352% | 89 |
| SHAPE_143 | 1 | 0.0352% | 100 |
| SHAPE_144 | 1 | 0.0352% | 88 |
| SHAPE_145 | 1 | 0.0352% | 88 |
| SHAPE_146 | 1 | 0.0352% | 91 |
| SHAPE_147 | 1 | 0.0352% | 88 |
| SHAPE_148 | 1 | 0.0352% | 91 |
| SHAPE_149 | 1 | 0.0352% | 98 |
| SHAPE_150 | 1 | 0.0352% | 98 |
| SHAPE_151 | 1 | 0.0352% | 88 |
| SHAPE_152 | 1 | 0.0352% | 87 |
| SHAPE_153 | 1 | 0.0352% | 53 |
| SHAPE_154 | 1 | 0.0352% | 97 |
| SHAPE_155 | 1 | 0.0352% | 98 |
| SHAPE_156 | 1 | 0.0352% | 108 |
| SHAPE_157 | 1 | 0.0352% | 62 |
| SHAPE_158 | 1 | 0.0352% | 100 |
| SHAPE_159 | 1 | 0.0352% | 85 |
| SHAPE_160 | 1 | 0.0352% | 80 |
| SHAPE_161 | 1 | 0.0352% | 91 |
| SHAPE_162 | 1 | 0.0352% | 98 |
| SHAPE_163 | 1 | 0.0352% | 83 |
| SHAPE_164 | 1 | 0.0352% | 80 |
| SHAPE_165 | 1 | 0.0352% | 104 |
| SHAPE_166 | 1 | 0.0352% | 89 |
| SHAPE_167 | 1 | 0.0352% | 89 |
| SHAPE_168 | 1 | 0.0352% | 183 |
| SHAPE_169 | 1 | 0.0352% | 98 |
| SHAPE_170 | 1 | 0.0352% | 98 |
| SHAPE_171 | 1 | 0.0352% | 89 |
| SHAPE_172 | 1 | 0.0352% | 99 |
| SHAPE_173 | 1 | 0.0352% | 101 |
| SHAPE_174 | 1 | 0.0352% | 171 |
| SHAPE_175 | 1 | 0.0352% | 87 |
| SHAPE_176 | 1 | 0.0352% | 96 |
| SHAPE_177 | 1 | 0.0352% | 101 |
| SHAPE_178 | 1 | 0.0352% | 100 |
| SHAPE_179 | 1 | 0.0352% | 85 |
| SHAPE_180 | 1 | 0.0352% | 89 |
| SHAPE_181 | 1 | 0.0352% | 88 |
| SHAPE_182 | 1 | 0.0352% | 103 |
| SHAPE_183 | 1 | 0.0352% | 98 |
| SHAPE_184 | 1 | 0.0352% | 95 |
| SHAPE_185 | 1 | 0.0352% | 86 |
| SHAPE_186 | 1 | 0.0352% | 91 |
| SHAPE_187 | 1 | 0.0352% | 100 |
| SHAPE_188 | 1 | 0.0352% | 95 |
| SHAPE_189 | 1 | 0.0352% | 77 |

## Novelty and saturation

- Last novel path: record 1,530, page 16.
- Last novel shape: record 2,841, page 29.
- Profiler saturation marker: record 2,530, page 26.
- Endpoint exhaustion: page 30.

Structural saturation was not used as endpoint termination. A new shape at record 2,841 confirms why traversal continued through the empty page.

## Dynamic keys

All dynamic business keys were normalized. The only normalized class is `$.saldo_devedor.<dynamic-key>`; related structural paths are:

- `$.saldo_devedor.<dynamic-key>`
- `$.saldo_devedor.<dynamic-key>.lancamentos`
- `$.saldo_devedor.<dynamic-key>.lancamentos[]`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].descricao`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].email`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].id_financeiro`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].telefone`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].valor`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].valor_com_juros`
- `$.saldo_devedor.<dynamic-key>.lancamentos[].vencimento`
- `$.saldo_devedor.<dynamic-key>.total`
- `$.saldo_devedor.<dynamic-key>.total_com_juros`

## Interpretation

### DOCUMENTED

TagPlus collection expansion uses `fields=*`. The approved implementation requests `per_page=100` sequentially and treats only an empty array as endpoint termination.

### OBSERVED

This execution returned 2,844 records on 29 non-empty pages. Page 29 contained 44 records, and page 30 returned the terminal empty array. The captured aggregate contains 195 paths, 31 multi-type paths, and 189 structural shapes.

### INFERRED

The expanded representation is substantially more structurally variable than the one-record exploration suggested. These observations characterize this completed traversal, not an immutable API contract or transactional snapshot.

## Recommendation

`Gate E-Census: APPROVED` because endpoint exhaustion, execution completion, completion status, and the terminal empty page were all explicitly captured.

There is sufficient structural evidence to design the next privacy-safe field-characterization step before modeling `Customer`. This does not authorize Phase F, Customer creation, Prisma changes, migrations, or persistence.

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
