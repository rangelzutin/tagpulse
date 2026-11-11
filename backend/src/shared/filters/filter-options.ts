import { OperationUnit, SourceSystem } from "@prisma/client";

export interface FilterOptions {
  operationUnit?: OperationUnit;
  sourceSystem?: SourceSystem;
}

export const VALID_OPERATION_UNITS: readonly string[] = Object.values(OperationUnit);
export const VALID_SOURCE_SYSTEMS: readonly string[] = Object.values(SourceSystem);

export type ParseFilterResult<T> =
  | { valid: true; value?: T }
  | { valid: false; error: string };

export function parseOperationUnit(val?: unknown): ParseFilterResult<OperationUnit> {
  if (val === undefined || val === null || val === "") {
    return { valid: true };
  }
  if (typeof val === "string" && VALID_OPERATION_UNITS.includes(val)) {
    return { valid: true, value: val as OperationUnit };
  }
  return {
    valid: false,
    error: `Invalid operationUnit: '${String(val)}'. Valid values: ${VALID_OPERATION_UNITS.join(", ")}`,
  };
}

export function parseSourceSystem(val?: unknown): ParseFilterResult<SourceSystem> {
  if (val === undefined || val === null || val === "") {
    return { valid: true };
  }
  if (typeof val === "string" && VALID_SOURCE_SYSTEMS.includes(val)) {
    return { valid: true, value: val as SourceSystem };
  }
  return {
    valid: false,
    error: `Invalid sourceSystem: '${String(val)}'. Valid values: ${VALID_SOURCE_SYSTEMS.join(", ")}`,
  };
}

/**
 * Defensive query builder for OperationUnit filtering.
 * When filtering for NINECLOUDS, includes both explicit NINECLOUDS and NULL records
 * to guarantee resilience during transition and avoid omitting historical Nineclouds data.
 */
export function buildOperationUnitFilter(unit?: OperationUnit | string) {
  if (!unit) return undefined;
  if (unit === OperationUnit.NINECLOUDS || unit === "NINECLOUDS") {
    return {
      OR: [
        { operationUnit: OperationUnit.NINECLOUDS },
        { operationUnit: null },
      ],
    };
  }
  return { operationUnit: unit as OperationUnit };
}

/**
 * Defensive query builder for relations where operationUnit is on the related Sale.
 */
export function buildSaleOperationUnitFilter(unit?: OperationUnit | string) {
  if (!unit) return undefined;
  if (unit === OperationUnit.NINECLOUDS || unit === "NINECLOUDS") {
    return {
      sale: {
        OR: [
          { operationUnit: OperationUnit.NINECLOUDS },
          { operationUnit: null },
        ],
      },
    };
  }
  return { sale: { operationUnit: unit as OperationUnit } };
}

