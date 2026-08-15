import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AgentStep } from "@/types";

interface Props {
  steps: AgentStep[];
}

const TOOL_LABELS: Record<string, string> = {
  search_document_chunks: "Searched this document",
  search_across_documents: "Searched all documents",
  get_document_metadata: "Looked up document metadata",
  list_user_documents: "Listed your documents",
  compare_documents: "Compared two documents",
};

function describeStep(step: AgentStep, index: number): string {
  const label = TOOL_LABELS[step.tool] ?? step.tool;
  const query = typeof step.args.query === "string" ? ` for "${step.args.query}"` : "";
  return `${index + 1}. ${label}${query}`;
}

export function AgentTracePanel({ steps }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!steps.length) return null;

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white">
      <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
        Agent trace · {steps.length} step{steps.length !== 1 ? "s" : ""}
      </div>
      <ol className="divide-y divide-gray-100">
        {steps.map((step, index) => (
          <li key={index}>
            <button
              onClick={() => setExpanded(expanded === index ? null : index)}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between gap-2"
            >
              <span className={cn(step.error && "text-red-600")}>
                {describeStep(step, index)}
              </span>
              <span className="text-gray-400">{expanded === index ? "▲" : "▼"}</span>
            </button>
            {expanded === index && (
              <div className="px-3 pb-3 text-xs text-gray-600">
                {step.error ? (
                  <p className="text-red-600">{step.error}</p>
                ) : (
                  <pre className="bg-gray-50 rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {JSON.stringify(step.result, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
