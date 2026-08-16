import { useState } from "react";
import { Search, FileText, GitCompare, ListChecks, Files, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentStep } from "@/types";

interface Props {
  steps: AgentStep[];
  pendingTool?: string | null;
}

const TOOL_META: Record<string, { label: string; icon: typeof Search }> = {
  search_document_chunks: { label: "Searched this document", icon: Search },
  search_across_documents: { label: "Searched all documents", icon: Files },
  get_document_metadata: { label: "Looked up document metadata", icon: FileText },
  list_user_documents: { label: "Listed your documents", icon: ListChecks },
  compare_documents: { label: "Compared two documents", icon: GitCompare },
};

function ToolChip({
  step,
  expanded,
  onToggle,
}: {
  step: AgentStep;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = TOOL_META[step.tool] ?? { label: step.tool, icon: Search };
  const Icon = meta.icon;

  return (
    <div className="rounded-md border border-subtle bg-surface">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-secondary hover:bg-surface-raised"
      >
        <span className={cn("flex items-center gap-2", step.error && "text-danger")}>
          <Icon size={13} />
          {meta.label}
        </span>
        <ChevronDown
          size={12}
          className={cn("text-tertiary transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="border-t border-subtle px-3 py-2">
          {step.error ? (
            <p className="text-xs text-danger">{step.error}</p>
          ) : (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-tertiary">
              {JSON.stringify(step.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentTracePanel({ steps, pendingTool }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!steps.length && !pendingTool) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((step, i) => (
        <ToolChip
          key={i}
          step={step}
          expanded={expanded === i}
          onToggle={() => setExpanded(expanded === i ? null : i)}
        />
      ))}
      {pendingTool && (
        <div className="flex items-center gap-2 rounded-md border border-subtle bg-surface px-3 py-2 text-xs text-tertiary">
          <Loader2 size={13} className="animate-spin text-accent" />
          {TOOL_META[pendingTool]?.label ?? pendingTool}…
        </div>
      )}
    </div>
  );
}
