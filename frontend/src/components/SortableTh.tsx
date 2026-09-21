import React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { SortDirection } from "../utils/sortUtils";

interface SortableThProps<T extends string> {
  field: T;
  currentSortField: T | null;
  currentSortDirection: SortDirection;
  onSort: (field: T) => void;
  align?: "left" | "right" | "center";
  className?: string;
  scope?: string;
  children: React.ReactNode;
}

export function SortableTh<T extends string>({
  field,
  currentSortField,
  currentSortDirection,
  onSort,
  align = "left",
  className = "",
  scope = "col",
  children,
}: SortableThProps<T>) {
  const isActive = currentSortField === field;
  const alignClass =
    align === "right"
      ? "tp-th-right"
      : align === "center"
        ? "tp-th-center"
        : "tp-th-left";

  const justifyClass =
    align === "right"
      ? "tp-justify-end"
      : align === "center"
        ? "tp-justify-center"
        : "";

  return (
    <th
      scope={scope}
      className={`tp-clickable-th ${alignClass} ${isActive ? "is-active" : ""} ${className}`.trim()}
      onClick={() => onSort(field)}
      role="columnheader"
      aria-sort={
        isActive
          ? currentSortDirection === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <div className={`tp-th-content ${justifyClass}`.trim()}>
        <span>{children}</span>
        {isActive ? (
          currentSortDirection === "asc" ? (
            <ArrowUp size={12} className="tp-th-sort-icon is-active" aria-hidden="true" />
          ) : (
            <ArrowDown size={12} className="tp-th-sort-icon is-active" aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown size={12} className="tp-th-sort-icon is-inactive" aria-hidden="true" />
        )}
      </div>
    </th>
  );
}
