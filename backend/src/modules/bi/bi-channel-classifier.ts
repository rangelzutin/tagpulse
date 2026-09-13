import type { CommercialChannel } from "./bi-types.js";

export interface ChannelClassificationInput {
  hasPedido: boolean;
  cnpj?: string | null | undefined;
  cpf?: string | null | undefined;
  customerName?: string | null | undefined;
}

/**
  * Canal de comercialização homologado no TagPulse:
  * - Pedido presente -> ATACADO
  * - CNPJ -> ATACADO
  * - CPF -> VAREJO
  * - Consumidor Hustler -> VAREJO
  * - Sem evidência -> INDETERMINADO
  * - Conflito de evidências -> CONFLITO
  *
  * Precedência e Regras:
  * 1. Detecção de conflito direto (quando não há Pedido e o cliente apresenta tanto CNPJ quanto CPF ou Hustler).
  * 2. Pedido presente: autoridade de negociação de pedido/atacado -> ATACADO.
  * 3. CNPJ (pessoa jurídica direta sem pedido) -> ATACADO.
  * 4. CPF (pessoa física direta sem pedido) -> VAREJO.
  * 5. Consumidor Hustler (cliente institucional de varejo) -> VAREJO.
  * 6. Sem nenhuma evidência documental ou de pedido -> INDETERMINADO.
  */
export function classifySaleChannel(
  input: ChannelClassificationInput,
): CommercialChannel {
  const cleanCnpj = input.cnpj?.replace(/\D/g, "");
  const hasValidCnpj = Boolean(cleanCnpj && cleanCnpj.length === 14);

  const cleanCpf = input.cpf?.replace(/\D/g, "");
  const hasValidCpf = Boolean(cleanCpf && cleanCpf.length === 11);

  const isHustler = Boolean(
    input.customerName?.toUpperCase().includes("HUSTLER"),
  );

  // Conflito direto: cliente simultaneamente associado a PJ e PF (sem vínculo com Pedido que determine atacado)
  if (!input.hasPedido && hasValidCnpj && (hasValidCpf || isHustler)) {
    return "CONFLITO";
  }

  // 1. Pedido presente -> ATACADO
  if (input.hasPedido) {
    return "ATACADO";
  }

  // 2. CNPJ -> ATACADO
  if (hasValidCnpj) {
    return "ATACADO";
  }

  // 3. CPF -> VAREJO
  if (hasValidCpf) {
    return "VAREJO";
  }

  // 4. Consumidor Hustler -> VAREJO
  if (isHustler) {
    return "VAREJO";
  }

  // 5. Sem evidência
  return "INDETERMINADO";
}
