import { Search, ArrowUpDown } from "lucide-react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { useJobStore } from "@/store/jobStore";
import type { JobStatus } from "@/types";

const STATUS_OPTIONS: { value: JobStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "queued", label: "Queued" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const SORT_OPTIONS = [
  { value: "created_at", label: "Date uploaded" },
  { value: "updated_at", label: "Last updated" },
  { value: "status", label: "Status" },
];

export function FiltersBar() {
  const { filters, setFilters } = useJobStore();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-subtle bg-surface p-3">
      <div className="relative min-w-[220px] flex-1">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
        <input
          type="text"
          placeholder="Search by filename…"
          value={filters.search ?? ""}
          onChange={(e) => setFilters({ search: e.target.value })}
          className="w-full rounded-md border border-subtle bg-surface-raised py-2 pl-9 pr-3 text-sm text-primary placeholder:text-tertiary focus:border-accent focus:outline-none"
        />
      </div>

      <SegmentedControl
        options={STATUS_OPTIONS}
        value={filters.status ?? ""}
        onChange={(v) => setFilters({ status: v })}
      />

      <div className="relative">
        <ArrowUpDown size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary" />
        <select
          value={filters.sort_by ?? "created_at"}
          onChange={(e) => setFilters({ sort_by: e.target.value })}
          className="appearance-none rounded-md border border-subtle bg-surface-raised py-2 pl-8 pr-3 text-sm text-secondary focus:border-accent focus:outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={() => setFilters({ sort_dir: filters.sort_dir === "asc" ? "desc" : "asc" })}
        className="rounded-md border border-subtle bg-surface-raised px-2.5 py-2 font-mono text-xs text-secondary hover:text-primary"
        title="Toggle sort direction"
      >
        {filters.sort_dir === "asc" ? "↑" : "↓"}
      </button>
    </div>
  );
}
