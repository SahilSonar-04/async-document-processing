/**
 * Sidebar history panel listing past agent queries and enabling historical trace review.
 *
 * @packageDocumentation
 */

import { useEffect, useState } from "react";
import { getAgentHistory } from "@/lib/api";
import { formatRelative, cn } from "@/lib/utils";
import type { AgentQueryHistoryItem } from "@/types";

/**
 * Props contract for the AgentHistoryPanel component.
 */
interface Props {
  /** Numeric key incremented to trigger list refetch */
  refreshKey: number;
  /** Callback invoked when a user clicks a historical query record */
  onSelect: (item: AgentQueryHistoryItem) => void;
  /** Active query record ID to highlight */
  activeId?: string | null;
}

/**
 * Historical query sidebar panel loading previous agent research interactions.
 */
export function AgentHistoryPanel({ refreshKey, onSelect, activeId }: Props) {
  const [items, setItems] = useState<AgentQueryHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getAgentHistory(20)
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading) {
    return <p className="px-3 py-2 text-xs text-tertiary">Loading…</p>;
  }

  if (!items.length) {
    return <p className="px-3 py-2 text-xs text-tertiary">No questions yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={item.id}>
          <button
            onClick={() => onSelect(item)}
            className={cn(
              "w-full rounded-md px-3 py-2 text-left text-xs transition-colors",
              activeId === item.id
                ? "bg-surface-raised text-primary"
                : "text-secondary hover:bg-surface-raised hover:text-primary"
            )}
          >
            <p className="truncate">{item.question}</p>
            <p className="mt-0.5 font-mono text-[10px] text-tertiary">
              {formatRelative(item.created_at)} · {item.steps_taken} step
              {item.steps_taken !== 1 ? "s" : ""}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}
