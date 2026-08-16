import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown } from "lucide-react";
import { getExportUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ExportBar() {
  const [open, setOpen] = useState(false);
  const [finalizedOnly, setFinalizedOnly] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleExport = (format: "json" | "csv") => {
    window.open(getExportUrl(format, finalizedOnly), "_blank");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-raised px-3 py-2 text-sm text-secondary hover:text-primary"
      >
        <Download size={14} />
        Export
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-56 animate-fade-up rounded-lg border border-subtle bg-surface-raised p-2 shadow-lg">
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-secondary hover:bg-surface">
            <input
              type="checkbox"
              checked={finalizedOnly}
              onChange={(e) => setFinalizedOnly(e.target.checked)}
              className="accent-accent"
            />
            Finalized only
          </label>
          <div className="my-1 h-px bg-subtle" />
          <button
            onClick={() => handleExport("json")}
            className="block w-full rounded-md px-2 py-2 text-left text-sm text-secondary hover:bg-surface hover:text-primary"
          >
            Export as JSON
          </button>
          <button
            onClick={() => handleExport("csv")}
            className="block w-full rounded-md px-2 py-2 text-left text-sm text-secondary hover:bg-surface hover:text-primary"
          >
            Export as CSV
          </button>
        </div>
      )}
    </div>
  );
}
