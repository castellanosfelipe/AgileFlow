"use client";

import { ArrowUpDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

export type SortState<TKey extends string> = {
  direction: SortDirection;
  key: TKey;
};

type SortableGridHeaderProps<TKey extends string> = {
  align?: "left" | "center" | "right";
  className?: string;
  label: string;
  onSortChange: (state: SortState<TKey>) => void;
  sortKey: TKey;
  sortState: SortState<TKey>;
};

export function getNextSortState<TKey extends string>(
  current: SortState<TKey>,
  key: TKey
): SortState<TKey> {
  if (current.key !== key) {
    return { key, direction: "asc" };
  }

  return {
    key,
    direction: current.direction === "asc" ? "desc" : "asc"
  };
}

export function SortableGridHeader<TKey extends string>({
  align = "left",
  className,
  label,
  onSortChange,
  sortKey,
  sortState
}: SortableGridHeaderProps<TKey>) {
  const isActive = sortState.key === sortKey;

  return (
    <button
      aria-label={`Ordenar por ${label}`}
      aria-sort={
        isActive
          ? sortState.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded-md px-2 py-1 text-left transition hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        align === "center" && "justify-center text-center",
        align === "right" && "justify-end text-right",
        isActive && "bg-primary/5 text-primary",
        className
      )}
      onClick={() => onSortChange(getNextSortState(sortState, sortKey))}
      role="columnheader"
      type="button"
    >
      <span className="min-w-0 truncate">{label}</span>
      <ArrowUpDown
        className={cn(
          "size-3.5 shrink-0 rounded-full border bg-background p-0.5 text-muted-foreground",
          isActive && "border-primary/30 text-primary"
        )}
      />
    </button>
  );
}

export type SortableValue = Date | boolean | null | number | string | undefined;

export function compareSortableValues(
  first: SortableValue,
  second: SortableValue
) {
  const firstEmpty = first === null || first === undefined || first === "";
  const secondEmpty = second === null || second === undefined || second === "";

  if (firstEmpty && secondEmpty) return 0;
  if (firstEmpty) return 1;
  if (secondEmpty) return -1;

  if (first instanceof Date || second instanceof Date) {
    const firstTime =
      first instanceof Date ? first.getTime() : new Date(String(first)).getTime();
    const secondTime =
      second instanceof Date
        ? second.getTime()
        : new Date(String(second)).getTime();

    return (Number.isNaN(firstTime) ? 0 : firstTime) -
      (Number.isNaN(secondTime) ? 0 : secondTime);
  }

  if (typeof first === "number" && typeof second === "number") {
    return first - second;
  }

  if (typeof first === "boolean" && typeof second === "boolean") {
    return Number(first) - Number(second);
  }

  return String(first).localeCompare(String(second), "es", {
    numeric: true,
    sensitivity: "base"
  });
}

export function sortByState<TRow, TKey extends string>(
  rows: TRow[],
  sortState: SortState<TKey>,
  getValue: (row: TRow, key: TKey) => SortableValue
) {
  return [...rows].sort((first, second) => {
    const result = compareSortableValues(
      getValue(first, sortState.key),
      getValue(second, sortState.key)
    );

    return sortState.direction === "asc" ? result : -result;
  });
}
