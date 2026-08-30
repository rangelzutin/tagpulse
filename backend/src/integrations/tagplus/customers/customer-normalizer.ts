export type CustomerNormalizationErrorCategory =
  | "CUSTOMER_INVALID_SOURCE_ID"
  | "CUSTOMER_INVALID_DATE"
  | "CUSTOMER_INVALID_CONTACT_ID"
  | "CUSTOMER_INVALID_ADDRESS_ID"
  | "CUSTOMER_NORMALIZATION_ERROR";

export type JsonStructuralType =
  "null" | "string" | "number" | "boolean" | "object" | "array";

export interface CustomerNormalizationDiagnostics {
  path: "$.data_cadastro" | "$.data_alteracao" | "$.data_nascimento";
  observedType: JsonStructuralType;
  expectedFormat: "timezone-qualified-datetime" | "YYYY-MM-DD";
  dateFormatClass?: Exclude<DateFormatClass, "OTHER_TYPE">;
}

export class CustomerNormalizationError extends Error {
  constructor(
    public readonly category: CustomerNormalizationErrorCategory,
    public readonly diagnostics?: CustomerNormalizationDiagnostics,
  ) {
    super(category);
    this.name = "CustomerNormalizationError";
  }
}

export type NormalizedCollection<T> =
  { state: "NOT_PROVIDED" } | { state: "PROVIDED"; items: T[] };

export interface NormalizedCustomerContact {
  sourceId: string;
  description: string | null;
  details: string | null;
  primary: boolean | null;
  foreignContact: boolean | null;
  registrationTypeId: string | null;
  registrationTypeDescription: string | null;
  contactTypeId: string | null;
  contactTypeDescription: string | null;
  position: number;
}

export interface NormalizedCustomerAddress {
  sourceId: string;
  sourceEntityAddressId: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  postalCode: string | null;
  primary: boolean | null;
  foreignAddress: boolean | null;
  additionalInformation: string | null;
  cityId: string | null;
  cityCode: string | null;
  cityName: string | null;
  stateId: string | null;
  stateCode: string | null;
  stateName: string | null;
  stateAbbreviation: string | null;
  countryId: string | null;
  countryCode: string | null;
  countryName: string | null;
  registrationTypeId: string | null;
  registrationTypeDescription: string | null;
  position: number;
}

export interface NormalizedCustomer {
  sourceId: string;
  sourceEntityId: string | null;
  code: string | null;
  externalCode: string | null;
  type: string | null;
  legalName: string | null;
  tradeName: string | null;
  sourceActive: boolean | null;
  cpf: string | null;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  acceptsEmail: boolean | null;
  sourceCreatedAt: Date | null;
  sourceUpdatedAt: Date | null;
  birthDate: Date | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  cnae: string | null;
  suframa: string | null;
  ieIndicator: string | null;
  foreignCustomer: boolean | null;
  contacts: NormalizedCollection<NormalizedCustomerContact>;
  addresses: NormalizedCollection<NormalizedCustomerAddress>;
}

type SourceRecord = Record<string, unknown>;

export function normalizeExternalId(
  value: unknown,
  required = false,
): string | null {
  if (value === null || value === undefined) {
    if (required)
      throw new CustomerNormalizationError("CUSTOMER_INVALID_SOURCE_ID");
    return null;
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isSafeInteger(value))
    return String(value);
  if (required)
    throw new CustomerNormalizationError("CUSTOMER_INVALID_SOURCE_ID");
  throw new CustomerNormalizationError("CUSTOMER_NORMALIZATION_ERROR");
}

export function normalizeTagPlusCustomer(value: unknown): NormalizedCustomer {
  if (!isRecord(value))
    throw new CustomerNormalizationError("CUSTOMER_NORMALIZATION_ERROR");
  return {
    sourceId: normalizeExternalId(value.id, true)!,
    sourceEntityId: optionalId(value.id_entidade),
    code: optionalString(value.codigo),
    externalCode: optionalString(value.codigo_externo),
    type: optionalString(value.tipo),
    legalName: optionalString(value.razao_social),
    tradeName: optionalString(value.nome_fantasia),
    sourceActive: optionalBoolean(value.ativo),
    cpf: optionalString(value.cpf),
    cnpj: optionalString(value.cnpj),
    email: optionalString(value.email),
    phone: optionalString(value.telefone),
    acceptsEmail: optionalBoolean(value.recebe_email),
    sourceCreatedAt: optionalDateTime(value.data_cadastro, "$.data_cadastro"),
    sourceUpdatedAt: optionalDateTime(value.data_alteracao, "$.data_alteracao"),
    birthDate: optionalCivilDate(value.data_nascimento, "$.data_nascimento"),
    stateRegistration: optionalString(value.ie),
    municipalRegistration: optionalString(value.im),
    cnae: optionalString(value.cnae),
    suframa: optionalString(value.suframa),
    ieIndicator: optionalBooleanString(value.indicador_ie),
    foreignCustomer: optionalBoolean(value.exterior),
    contacts: normalizeCollection(value.contatos, normalizeContact),
    addresses: normalizeCollection(value.enderecos, normalizeAddress),
  };
}

function normalizeContact(
  value: unknown,
  position: number,
): NormalizedCustomerContact {
  if (!isRecord(value))
    throw new CustomerNormalizationError("CUSTOMER_NORMALIZATION_ERROR");
  const registrationType = optionalRecord(value.tipo_cadastro);
  const contactType = optionalRecord(value.tipo_contato);
  return {
    sourceId: requiredChildId(value.id, "CUSTOMER_INVALID_CONTACT_ID"),
    description: optionalString(value.descricao),
    details: optionalString(value.detalhes),
    primary: optionalBoolean(value.principal),
    foreignContact: optionalBoolean(value.estrangeiro),
    registrationTypeId: optionalId(registrationType?.id),
    registrationTypeDescription: optionalString(registrationType?.descricao),
    contactTypeId: optionalId(contactType?.id),
    contactTypeDescription: optionalString(contactType?.descricao),
    position,
  };
}

function normalizeAddress(
  value: unknown,
  position: number,
): NormalizedCustomerAddress {
  if (!isRecord(value))
    throw new CustomerNormalizationError("CUSTOMER_NORMALIZATION_ERROR");
  const city = optionalRecord(value.cidade);
  const state = optionalRecord(city?.estado);
  const country = optionalRecord(value.pais);
  const registrationType = optionalRecord(value.tipo_cadastro);
  return {
    sourceId: requiredChildId(value.id, "CUSTOMER_INVALID_ADDRESS_ID"),
    sourceEntityAddressId: optionalId(value.id_endereco_entidade),
    street: optionalString(value.logradouro),
    number: optionalString(value.numero),
    complement: optionalString(value.complemento),
    district: optionalString(value.bairro),
    postalCode: optionalString(value.cep),
    primary: optionalBoolean(value.principal),
    foreignAddress: optionalBoolean(value.exterior),
    additionalInformation: optionalString(value.informacoes_adicionais),
    cityId: optionalId(city?.id),
    cityCode: optionalId(city?.codigo),
    cityName: optionalString(city?.nome),
    stateId: optionalId(state?.id),
    stateCode: optionalId(state?.codigo),
    stateName: optionalString(state?.nome),
    stateAbbreviation: optionalString(state?.sigla),
    countryId: optionalId(country?.id),
    countryCode: optionalId(country?.codigo),
    countryName: optionalString(country?.nome),
    registrationTypeId: optionalId(registrationType?.id),
    registrationTypeDescription: optionalString(registrationType?.descricao),
    position,
  };
}

function normalizeCollection<T>(
  value: unknown,
  normalize: (item: unknown, position: number) => T,
): NormalizedCollection<T> {
  if (value === null || value === undefined) {
    return { state: "NOT_PROVIDED" };
  }
  if (!Array.isArray(value)) {
    throw new CustomerNormalizationError("CUSTOMER_NORMALIZATION_ERROR");
  }
  const items = value.map(normalize);
  const ids = new Set<string>();
  for (const item of items as Array<T & { sourceId: string }>) {
    if (ids.has(item.sourceId))
      throw new CustomerNormalizationError("CUSTOMER_NORMALIZATION_ERROR");
    ids.add(item.sourceId);
  }
  return { state: "PROVIDED", items };
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string")
    throw new CustomerNormalizationError("CUSTOMER_NORMALIZATION_ERROR");
  return value;
}

function optionalBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean")
    throw new CustomerNormalizationError("CUSTOMER_NORMALIZATION_ERROR");
  return value;
}

function optionalBooleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  throw new CustomerNormalizationError("CUSTOMER_NORMALIZATION_ERROR");
}

function optionalId(value: unknown): string | null {
  return normalizeExternalId(value);
}

function requiredChildId(
  value: unknown,
  category: CustomerNormalizationErrorCategory,
): string {
  try {
    return normalizeExternalId(value, true)!;
  } catch {
    throw new CustomerNormalizationError(category);
  }
}

function optionalDateTime(
  value: unknown,
  path: "$.data_cadastro" | "$.data_alteracao",
): Date | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    throw invalidDate(value, path, "timezone-qualified-datetime");
  }
  const result = new Date(value);
  if (Number.isNaN(result.getTime()))
    throw invalidDate(value, path, "timezone-qualified-datetime");
  return result;
}

function optionalCivilDate(
  value: unknown,
  path: "$.data_nascimento",
): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalidDate(value, path, "YYYY-MM-DD");
  }
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year!, month! - 1, day));
  if (result.toISOString().slice(0, 10) !== value) {
    throw invalidDate(value, path, "YYYY-MM-DD");
  }
  return result;
}

function invalidDate(
  value: unknown,
  path: CustomerNormalizationDiagnostics["path"],
  expectedFormat: CustomerNormalizationDiagnostics["expectedFormat"],
): CustomerNormalizationError {
  const dateFormatClass = safeDateFormatClass(value);
  return new CustomerNormalizationError("CUSTOMER_INVALID_DATE", {
    path,
    observedType: structuralType(value),
    expectedFormat,
    ...(dateFormatClass ? { dateFormatClass } : {}),
  });
}

function safeDateFormatClass(
  value: unknown,
): Exclude<DateFormatClass, "OTHER_TYPE"> | undefined {
  if (typeof value !== "string") return undefined;
  const result = classifyDate(value);
  return result === "OTHER_TYPE" ? undefined : result;
}

function structuralType(value: unknown): JsonStructuralType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";
}

function optionalRecord(value: unknown): SourceRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is SourceRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
import {
  classifyDate,
  type DateFormatClass,
} from "../inspection/clientes-format-classifiers.js";
