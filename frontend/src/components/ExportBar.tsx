import { useState } from "react";
import { getExportUrl } from "@/lib/api";

export function ExportBar() {
  const [finalizedOnly, setFinalizedOnly] = useState(false);

  const handleExport = (format: "json" | "csv") => {
    const url = getExportUrl(format, finalizedOnly);
    window.open(url, "_blank");
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
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 font-medium"
      >
        Export JSON
      </button>
      <button
        onClick={() => handleExport("csv")}
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 font-medium"
      >
        Export CSV
      </button>
    </div>
  );
}
