"use client";

import { useMemo, useState, type ReactNode } from "react";

export interface SortableColumn<Row> {
  key: string;
  label: string;
  value: (row: Row) => string | number;
  render?: (row: Row) => ReactNode;
  // Columns of numbers default to descending on first click (best score
  // first); text columns default to ascending (A-Z) - mirrors how a reader
  // expects "biggest first" for stats but "alphabetical" for names.
  numeric?: boolean;
  cellClassName?: string;
}

interface SortState {
  column: string;
  direction: "asc" | "desc";
}

export function SortableTable<Row>({
  columns,
  rows,
  rowKey,
  defaultSort,
  minWidthClassName = "min-w-[480px]",
  emptyMessage = "No data yet.",
}: {
  columns: SortableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string | number;
  defaultSort: SortState;
  minWidthClassName?: string;
  emptyMessage?: string;
}) {
  const [sort, setSort] = useState<SortState>(defaultSort);

  function toggleSort(column: SortableColumn<Row>) {
    setSort((prev) =>
      prev.column === column.key
        ? { column: column.key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column: column.key, direction: column.numeric ? "desc" : "asc" },
    );
  }

  const sortedRows = useMemo(() => {
    const activeColumn = columns.find((column) => column.key === sort.column);
    if (!activeColumn) {
      return rows;
    }

    const sorted = [...rows].sort((a, b) => {
      const left = activeColumn.value(a);
      const right = activeColumn.value(b);
      if (typeof left === "string" || typeof right === "string") {
        return String(left).localeCompare(String(right));
      }
      return left - right;
    });

    return sort.direction === "asc" ? sorted : sorted.reverse();
  }, [rows, columns, sort]);

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className={`w-full ${minWidthClassName} border-collapse text-sm`}>
        <thead>
          <tr className="border-b border-white/10 bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort(column)}
                  className="flex items-center gap-1 uppercase tracking-wide text-zinc-500 hover:text-zinc-200"
                >
                  {column.label}
                  {sort.column === column.key && (
                    <span className="text-brand-gold-500">
                      {sort.direction === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sortedRows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-6 text-center text-zinc-500"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
          {sortedRows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-white/5">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-4 py-2.5 ${column.cellClassName ?? "text-zinc-300"}`}
                >
                  {column.render ? column.render(row) : column.value(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
