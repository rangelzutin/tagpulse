/**
 * Typed representation of normalized staging rows from the Hustler legacy TagPlus dump.
 * Financial values are preserved as decimal strings (e.g. "1234.56") to avoid float inaccuracy.
 * Date/time values are preserved as canonical raw strings (e.g. "2015-05-05 14:08:18").
 * IDs and foreign keys are preserved as raw strings/numbers.
 */

export interface LegacyVendaRow {
  id: string;
  id_empresa: string | null;
  id_cliente: string | null;
  id_caixa: string | null;
  id_nota_fiscal: string | null;
  id_vendedor: string | null;
  data_hr_venda: string | null;
  aliquota_acrescimo: string | null;
  aliquota_desconto: string | null;
  coo: string | null;
  ccf: string | null;
  vr_desconto: string | null;
  vr_acrescimo: string | null;
  vr_total: string;
  vr_pago: string | null;
  vr_troco: string | null;
  observacoes: string | null;
  cancelado: number;
  tipo_acrescimo: string | null;
  tipo_desconto: string | null;
  ordem_aplicacao: string | null;
  md5: string | null;
}

export interface LegacyNotaFiscalRow {
  id: string;
  codigo_externo: string | null;
  id_empresa: string | null;
  id_entidade: string | null;
  id_moeda: string | null;
  id_endereco_destinatario: string | null;
  id_endereco_retirada: string | null;
  id_endereco_remetente: string | null;
  id_endereco_entrega: string | null;
  id_funcionario: string | null;
  id_vendedor: string | null;
  numero_nota: string | null;
  numero_fatura: string | null;
  id_dav: string | null;
  id_pre_venda: string | null;
  id_nota_fiscal_geradora: string | null;
  id_intermediador: string | null;
  tipo: string | null;
  serie: string | null;
  identificador_emitente: string | null;
  indicador_forma_pagamento: string | null;
  subserie: string | null;
  modelo: string | null;
  cfop: string | null;
  cpfcnpj_responsavel_entrega: string | null;
  cpfcnpj_responsavel_retirada: string | null;
  data_confirmacao: string | null;
  data_criacao: string | null;
  data_emissao: string | null;
  data_alteracao: string | null;
  data_entrada_saida: string | null;
  finalidade_emissao: string | null;
  hr_entrada_saida: string | null;
  situacao: string | null;
  qtd_parcelas: number | null;
  vr_total_nota: string | null;
  vr_total_produtos: string | null;
  vr_desconto: string | null;
  vr_frete: string | null;
  nota_cancelada: number | null;
  [key: string]: string | number | null;
}

export interface LegacyNotaFiscalLancamentoRow {
  id: string;
  id_nota_fiscal: string;
  id_produto: string;
  id_empresa: string | null;
  id_moeda: string | null;
  item: number | null;
  quantidade: string;
  vr_produto: string;
  vr_subtotal: string;
  vr_desconto_bruto: string | null;
  vr_acrescimo_bruto: string | null;
  cfop: string | null;
  cst: string | null;
  csosn: string | null;
  [key: string]: string | number | null;
}

export interface LegacyNfeRow {
  id: string;
  id_nota_fiscal: string;
  cnf: string | null;
  tipo_emissao: string | null;
  formato_danfe: string | null;
  ambiente: string | null;
  finalidade_emissao: string | null;
  chave_acesso: string | null;
  enviada: number | null;
  [key: string]: string | number | null;
}

export interface LegacyPagamentoRow {
  id: string;
  id_nota_fiscal: string | null;
  id_pre_venda: string | null;
  id_forma_pagamento: string | null;
  nome_forma_pagamento_base: string | null;
  numero_documento: string | null;
  parcela: number | null;
  data_vencimento: string | null;
  acrescimo: string | null;
  desconto: string | null;
  valor_parcela: string;
  pagamento_no_banco: number | null;
  status: string | null;
  tipo: string | null;
  [key: string]: string | number | null;
}

export interface LegacyFinanceiroLancamentoRow {
  id: string;
  codigo_externo: string | null;
  id_caixa: string | null;
  id_conta: string | null;
  id_empresa: string | null;
  id_entidade: string | null;
  id_forma_pagamento: string | null;
  id_funcionario: string | null;
  id_lancamento_vinculado: string | null;
  id_nota_fiscal_pagamento: string | null;
  id_pagamento: string | null;
  id_plano_conta: string | null;
  id_setor: string | null;
  id_vendedor: string | null;
  confirmado: number;
  data_alteracao: string | null;
  data_confirmacao: string | null;
  data_lancamento: string | null;
  data_vencimento: string | null;
  data_competencia: string | null;
  descricao: string | null;
  documento: string | null;
  parcela: number | null;
  total_parcelas: number | null;
  vr_bruto: string | null;
  vr_original: string | null;
  vr_pago: string | null;
  vr_desconto: string | null;
  vr_total: string;
  tipo: string; // 'E' or 'S'
  transferencia: number | null;
  [key: string]: string | number | null;
}

export interface LegacyProdutoBaseRow {
  id: string;
  codigo_externo: string | null;
  id_categoria: string | null;
  cod_barra: string | null;
  cod_secundario: string | null;
  cod_ncm: string | null;
  ativo: number;
  comercializavel: number | null;
  descricao_produto: string;
  descricao_resumida: string | null;
  marca: string | null;
  tipo: string | null;
  [key: string]: string | number | null;
}

export interface LegacyClienteRow {
  id: string;
  codigo_externo: string | null;
  id_entidade: string;
  id_cliente_principal: string | null;
  id_funcionario: string | null;
  cod_barra: string | null;
  credito: string | null;
  data_alteracao: string | null;
  data_cadastro: string | null;
  nome_fantasia: string | null;
  [key: string]: string | number | null;
}

export interface LegacyEntidadeRow {
  id: string;
  id_categoria: string | null;
  ativo: number;
  tipo: string; // 'F' (Física) or 'J' (Jurídica)
  razao_social: string;
  cnpj: string | null;
  cpf: string | null;
  ie: string | null;
  rg: string | null;
  exterior: number | null;
  data_alteracao: string | null;
  [key: string]: string | number | null;
}

export interface LegacyContatoRow {
  id: string;
  id_entidade: string;
  id_tipo_contato: string | null;
  id_tipo_cadastro: string | null;
  descricao: string | null;
  detalhes: string | null;
  principal: number | null;
  email_cobranca: string | null;
  [key: string]: string | number | null;
}

export interface LegacyEnderecoRow {
  id: string;
  id_cidade: string | null;
  id_pais: string | null;
  cep: string | null;
  logradouro: string | null;
  bairro: string | null;
  ativo: number;
  exterior: number | null;
}

export interface LegacyEnderecoEntidadeRow {
  id: string;
  id_endereco: string;
  id_tipo_cadastro: string | null;
  id_entidade: string;
  principal: number | null;
  numero: string | null;
  complemento: string | null;
  informacoes_adicionais: string | null;
}

export interface HustlerDumpFileMetadata {
  filename: string;
  filePath: string;
  sizeBytes: number;
  sizeMb: number;
  sha256: string;
}

export interface HustlerDumpProfileSummary {
  metadata: HustlerDumpFileMetadata;
  parseDurationMs: number;
  tablesFoundCount: number;
  allTablesFound: string[];
  supportedTables: string[];
  rowsByTable: Record<string, number>;
  ignoredRowsByTable: Record<string, number>;
  ignoredStatementsByTable: Record<string, number>;
  totalSupportedRows: number;
  totalIgnoredRows: number;
  totalRowsProcessed: number;
  parseErrorsCount: number;
}
