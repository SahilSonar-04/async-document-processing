import { useState } from "react";
import { ChevronRight, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

function valueClass(v: unknown): string {
  if (v === null) return "text-tertiary";
  switch (typeof v) {
    case "string":
      return "text-accent";
    case "number":
      return "text-info";
    case "boolean":
      return "text-warn";
    default:
      return "text-primary";
  }
}

function formatPrimitive(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

function Node({ label, value, depth }: { label: string | null; value: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const isObject = value !== null && typeof value === "object";

  if (!isObject) {
    return (
      <div className="flex gap-1.5 py-0.5 font-mono text-xs" style={{ paddingLeft: depth * 14 }}>
        {label !== null && <span className="text-secondary">{label}:</span>}
        <span className={valueClass(value)}>{formatPrimitive(value)}</span>
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const [openBracket, closeBracket] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 py-0.5 font-mono text-xs text-secondary hover:text-primary"
        style={{ paddingLeft: depth * 14 }}
      >
        <ChevronRight size={12} className={cn("text-tertiary transition-transform", open && "rotate-90")} />
        {label !== null && <span>{label}:</span>}
        <span className="text-tertiary">
          {openBracket}
          {!open && `…${closeBracket}`}
        </span>
      </button>
      {open && (
        <div>
          {entries.map(([k, v]) => (
            <Node key={k} label={Array.isArray(value) ? null : k} value={v} depth={depth + 1} />
          ))}
          <div className="font-mono text-xs text-tertiary" style={{ paddingLeft: depth * 14 }}>
            {closeBracket}
          </div>
        </div>
      )}
    </div>
  );
}

export function JsonTreeViewer({ data, title }: { data: unknown; title?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-subtle bg-surface">
      <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
        <span className="text-xs font-medium text-secondary">{title ?? "JSON"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-tertiary hover:text-primary"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="max-h-96 overflow-auto p-3">
        <Node label={null} value={data} depth={0} />
      </div>
    </div>
  );
}
