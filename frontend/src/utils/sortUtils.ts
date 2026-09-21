export type SortDirection = "asc" | "desc";

/**
 * Compares two values ensuring that null/undefined values are ALWAYS placed at the end,
 * regardless of whether the sort direction is ASC or DESC.
 *
 * DESC: known values (high to low) -> null/undefined
 * ASC:  known values (low to high) -> null/undefined
 */
export function compareNullsLast<T>(
  a: T | null | undefined,
  b: T | null | undefined,
  direction: SortDirection,
  compareValues: (valA: T, valB: T) => number,
): number {
  const aIsNull = a === null || a === undefined;
  const bIsNull = b === null || b === undefined;

  if (aIsNull && bIsNull) return 0;
  if (aIsNull) return 1; // null is always at the end
  if (bIsNull) return -1; // null is always at the end

  const cmp = compareValues(a, b);
  return direction === "asc" ? cmp : -cmp;
}

/**
 * Numeric comparison helper with nulls always at the end.
 */
export function compareNumericNullsLast(
  a: number | null | undefined,
  b: number | null | undefined,
  direction: SortDirection,
): number {
  return compareNullsLast(a, b, direction, (valA, valB) => valA - valB);
}

/**
 * String comparison helper with nulls always at the end.
 */
export function compareStringNullsLast(
  a: string | null | undefined,
  b: string | null | undefined,
  direction: SortDirection,
): number {
  return compareNullsLast(a, b, direction, (valA, valB) =>
    valA.localeCompare(valB, "pt-BR", { sensitivity: "base" }),
  );
}
