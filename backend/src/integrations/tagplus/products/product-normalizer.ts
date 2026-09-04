export type ProductNormalizationErrorCategory =
  | "PRODUCT_INVALID_SOURCE_ID"
  | "PRODUCT_INVALID_DATE"
  | "PRODUCT_INVALID_TYPE"
  | "PRODUCT_INVALID_STRUCTURE"
  | "PRODUCT_NORMALIZATION_ERROR";

export type JsonStructuralType =
  "null" | "string" | "number" | "boolean" | "object" | "array";

export interface ProductNormalizationDiagnostics {
  path: string;
  observedType: JsonStructuralType;
  expectedFormat?: "timezone-qualified-datetime";
  expectedTypeOrFormat?:
    | "object"
    | "array"
    | "string"
    | "number"
    | "boolean"
    | "string-or-safe-integer";
}

export class ProductNormalizationError extends Error {
  constructor(
    public readonly category: ProductNormalizationErrorCategory,
    public readonly diagnostics?: ProductNormalizationDiagnostics,
  ) {
    super(category);
    this.name = "ProductNormalizationError";
  }
}

export interface NormalizedProduct {
  sourceId: string;
  code: string | null;
  externalCode: string | null;
  barcode: string | null;
  taxableBarcode: string | null;
  gradeCode: string | null;
  description: string | null;
  shortDescription: string | null;
  active: boolean | null;
  moved: boolean | null;
  commercializable: boolean | null;
  soldSeparately: boolean | null;
  type: string | null;
  purpose: string | null;
  brand: string | null;
  parentSourceId: string | null;
  categorySourceId: string | null;
  categoryDescription: string | null;
  departmentSourceId: string | null;
  departmentDescription: string | null;
  retailSalePrice: number | null;
  offerPrice: number | null;
  effectiveCost: number | null;
  averageCost: number | null;
  otherExpensesCost: number | null;
  stockQuantity: number | null;
  stockMinQuantity: number | null;
  stockMaxQuantity: number | null;
  outputUnitSourceId: string | null;
  outputUnitAbbreviation: string | null;
  outputUnitDescription: string | null;
  outputUnitFractioned: boolean | null;
  sourceCreatedAt: Date | null;
  sourceUpdatedAt: Date | null;
}

type SourceRecord = Record<string, unknown>;

export function normalizeExternalId(
  value: unknown,
  required = false,
  path = "$",
): string | null {
  if (value === null || value === undefined) {
    if (required) {
      throw structuralError(
        "PRODUCT_INVALID_SOURCE_ID",
        path,
        value,
        "string-or-safe-integer",
      );
    }
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      if (required) {
        throw structuralError(
          "PRODUCT_INVALID_SOURCE_ID",
          path,
          value,
          "string-or-safe-integer",
        );
      }
      return null;
    }
    return trimmed;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return String(value);
  }
  throw structuralError(
    "PRODUCT_INVALID_SOURCE_ID",
    path,
    value,
    "string-or-safe-integer",
  );
}

export function normalizeTagPlusProduct(payload: unknown): NormalizedProduct {
  if (!isRecord(payload)) {
    throw structuralError("PRODUCT_INVALID_STRUCTURE", "$", payload, "object");
  }

  const sourceId = normalizeExternalId(payload.id, true, "$.id")!;
  const parentSourceId = normalizeExternalId(payload.id_pai, false, "$.id_pai");
  const code = optionalString(payload.codigo, "$.codigo");
  const externalCode = normalizeExternalId(
    payload.codigo_externo,
    false,
    "$.codigo_externo",
  );
  const barcode = optionalString(payload.codigo_barras, "$.codigo_barras");
  const taxableBarcode = optionalString(
    payload.codigo_barras_tributavel,
    "$.codigo_barras_tributavel",
  );
  const gradeCode = optionalString(payload.codigo_grade, "$.codigo_grade");
  const description = optionalString(payload.descricao, "$.descricao");
  const shortDescription = optionalString(
    payload.descricao_curta,
    "$.descricao_curta",
  );

  const active = optionalBoolean(payload.ativo, "$.ativo");
  const moved = optionalBoolean(payload.movimentado, "$.movimentado");
  const commercializable = optionalBoolean(
    payload.comercializavel,
    "$.comercializavel",
  );
  const soldSeparately = optionalBoolean(
    payload.vendido_separado,
    "$.vendido_separado",
  );

  const type = optionalString(payload.tipo, "$.tipo");
  const purpose = optionalString(payload.finalidade, "$.finalidade");
  const brand = optionalString(payload.marca, "$.marca");

  // Category (nested object)
  const categoryRecord = optionalRecord(payload.categoria, "$.categoria");
  const categorySourceId = categoryRecord
    ? normalizeExternalId(categoryRecord.id, false, "$.categoria.id")
    : null;
  const categoryDescription = categoryRecord
    ? optionalString(categoryRecord.descricao, "$.categoria.descricao")
    : null;

  // Department (nested object)
  const departmentRecord = optionalRecord(
    payload.departamento,
    "$.departamento",
  );
  const departmentSourceId = departmentRecord
    ? normalizeExternalId(departmentRecord.id, false, "$.departamento.id")
    : null;
  const departmentDescription = departmentRecord
    ? optionalString(departmentRecord.descricao, "$.departamento.descricao")
    : null;

  // Commercial / Costs
  const retailSalePrice = optionalNumeric(
    payload.valor_venda_varejo,
    "$.valor_venda_varejo",
  );
  const offerPrice = optionalNumeric(payload.valor_oferta, "$.valor_oferta");
  const effectiveCost = optionalNumeric(
    payload.custo_utilizado,
    "$.custo_utilizado",
  );
  const averageCost = optionalNumeric(payload.custo_medio, "$.custo_medio");
  const otherExpensesCost = optionalNumeric(
    payload.custo_outras_despesas,
    "$.custo_outras_despesas",
  );

  // Stock: check nested estoque object first, fallback to top-level qtd_revenda
  const stockRecord = optionalRecord(payload.estoque, "$.estoque");
  const stockQuantity = stockRecord
    ? (optionalNumeric(stockRecord.qtd_revenda, "$.estoque.qtd_revenda") ??
      optionalNumeric(payload.qtd_revenda, "$.qtd_revenda"))
    : optionalNumeric(payload.qtd_revenda, "$.qtd_revenda");
  const stockMinQuantity = stockRecord
    ? optionalNumeric(stockRecord.qtd_min, "$.estoque.qtd_min")
    : null;
  const stockMaxQuantity = stockRecord
    ? optionalNumeric(stockRecord.qtd_max, "$.estoque.qtd_max")
    : null;

  // Unit of output (unidade_saida)
  const outputUnitRecord = optionalRecord(
    payload.unidade_saida,
    "$.unidade_saida",
  );
  const outputUnitSourceId = outputUnitRecord
    ? normalizeExternalId(outputUnitRecord.id, false, "$.unidade_saida.id")
    : null;
  const outputUnitAbbreviation = outputUnitRecord
    ? optionalString(outputUnitRecord.sigla, "$.unidade_saida.sigla")
    : null;
  const outputUnitDescription = outputUnitRecord
    ? optionalString(outputUnitRecord.descricao, "$.unidade_saida.descricao")
    : null;
  const outputUnitFractioned = outputUnitRecord
    ? optionalBoolean(outputUnitRecord.fracionado, "$.unidade_saida.fracionado")
    : null;

  // Timestamps
  const sourceCreatedAt = optionalDateTime(
    payload.data_criacao,
    "$.data_criacao",
  );
  const sourceUpdatedAt = optionalDateTime(
    payload.data_alteracao,
    "$.data_alteracao",
  );

  return {
    sourceId,
    code,
    externalCode,
    barcode,
    taxableBarcode,
    gradeCode,
    description,
    shortDescription,
    active,
    moved,
    commercializable,
    soldSeparately,
    type,
    purpose,
    brand,
    parentSourceId,
    categorySourceId,
    categoryDescription,
    departmentSourceId,
    departmentDescription,
    retailSalePrice,
    offerPrice,
    effectiveCost,
    averageCost,
    otherExpensesCost,
    stockQuantity,
    stockMinQuantity,
    stockMaxQuantity,
    outputUnitSourceId,
    outputUnitAbbreviation,
    outputUnitDescription,
    outputUnitFractioned,
    sourceCreatedAt,
    sourceUpdatedAt,
  };
}

function optionalString(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number") {
    return String(value);
  }
  throw structuralError("PRODUCT_INVALID_TYPE", path, value, "string");
}

function optionalBoolean(value: unknown, path: string): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  throw structuralError("PRODUCT_INVALID_TYPE", path, value, "boolean");
}

function optionalNumeric(value: unknown, path: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw structuralError("PRODUCT_INVALID_TYPE", path, value, "number");
    }
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw structuralError("PRODUCT_INVALID_TYPE", path, value, "number");
    }
    return parsed;
  }
  throw structuralError("PRODUCT_INVALID_TYPE", path, value, "number");
}

function optionalRecord(value: unknown, path: string): SourceRecord | null {
  if (value === null || value === undefined) return null;
  if (isRecord(value)) return value;
  throw structuralError("PRODUCT_INVALID_TYPE", path, value, "object");
}

function isRecord(value: unknown): value is SourceRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalDateTime(value: unknown, path: string): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const tagPlusLocal = parseTagPlusLocalDateTime(value);
    if (tagPlusLocal) return tagPlusLocal;

    if (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      )
    ) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  throw new ProductNormalizationError("PRODUCT_INVALID_DATE", {
    path,
    observedType: structuralType(value),
    expectedFormat: "timezone-qualified-datetime",
  });
}

function parseTagPlusLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const [year, month, day, hour, minute, second] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
  ].map(Number);

  const result = new Date(0);
  result.setFullYear(year!, month! - 1, day);
  result.setHours(hour!, minute!, second, 0);
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month! - 1 ||
    result.getDate() !== day ||
    result.getHours() !== hour ||
    result.getMinutes() !== minute ||
    result.getSeconds() !== second
  ) {
    return null;
  }
  return result;
}

function structuralType(value: unknown): JsonStructuralType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";
}

function structuralError(
  category: ProductNormalizationErrorCategory,
  path: string,
  value: unknown,
  expectedTypeOrFormat: NonNullable<
    ProductNormalizationDiagnostics["expectedTypeOrFormat"]
  >,
): ProductNormalizationError {
  return new ProductNormalizationError(category, {
    path,
    observedType: structuralType(value),
    expectedTypeOrFormat,
  });
}
