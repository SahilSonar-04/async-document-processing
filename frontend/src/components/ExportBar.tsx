import { useState } from "react";
import toast from "react-hot-toast";
import { exportRecords } from "@/lib/api";

export function ExportBar() {
  const [finalizedOnly, setFinalizedOnly] = useState(false);
  const [exporting, setExporting] = useState<"json" | "csv" | null>(null);

  const handleExport = async (format: "json" | "csv") => {
    setExporting(format);
    try {
      await exportRecords(format, finalizedOnly);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={finalizedOnly}
          onChange={(e) => setFinalizedOnly(e.target.checked)}
          className="rounded border-gray-300 text-brand-600 focus:ring-brand-400"
        />
        Finalized only
      </label>

      <button
        onClick={() => handleExport("json")}
        disabled={exporting !== null}
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {exporting === "json" ? "Exporting…" : "Export JSON"}
      </button>
      <button
        onClick={() => handleExport("csv")}
        disabled={exporting !== null}
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {exporting === "csv" ? "Exporting…" : "Export CSV"}
      </button>
    </div>
  );
}
