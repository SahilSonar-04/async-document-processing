import { useJobStore } from "@/store/jobStore";
import type { JobStatus } from "@/types";

const STATUS_OPTIONS: { value: JobStatus | ""; label: string }[] = [
  { value: "",           label: "All statuses" },
  { value: "queued",     label: "Queued" },
  { value: "processing", label: "Processing" },
  { value: "completed",  label: "Completed" },
  { value: "failed",     label: "Failed" },
  { value: "cancelled",  label: "Cancelled" },
];

const SORT_OPTIONS = [
  { value: "created_at", label: "Date uploaded" },
  { value: "updated_at", label: "Last updated" },
  { value: "status",     label: "Status" },
];

export function FiltersBar() {
  const { filters, setFilters } = useJobStore();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <input
        type="text"
        placeholder="Search by filename…"
        value={filters.search ?? ""}
        onChange={(e) => setFilters({ search: e.target.value })}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
      />

      {/* Status filter */}
      <select
        value={filters.status ?? ""}
        onChange={(e) => setFilters({ status: e.target.value as JobStatus | "" })}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Sort */}
      <select
        value={filters.sort_by ?? "created_at"}
        onChange={(e) => setFilters({ sort_by: e.target.value })}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Sort direction */}
      <button
        onClick={() =>
          setFilters({ sort_dir: filters.sort_dir === "asc" ? "desc" : "asc" })
        }
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
        title="Toggle sort direction"
      >
        {filters.sort_dir === "asc" ? "↑ Asc" : "↓ Desc"}
      </button>
    </div>
  );
}
