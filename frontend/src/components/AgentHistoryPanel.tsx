import { useEffect, useState } from "react";
import { getAgentHistory } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import type { AgentQueryHistoryItem } from "@/types";

interface Props {
  refreshKey: number;
}

export function AgentHistoryPanel({ refreshKey }: Props) {
  const [items, setItems] = useState<AgentQueryHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getAgentHistory(10)
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

  if (loading || !items.length) return null;

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white">
      <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
        Recent agent questions
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => setExpanded(expanded === item.id ? null : item.id)}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between gap-2"
            >
              <span className="truncate">{item.question}</span>
              <span className="text-gray-400 flex-shrink-0">
                {formatRelative(item.created_at)}
              </span>
            </button>
            {expanded === item.id && (
              <div className="px-3 pb-3 text-xs text-gray-600 whitespace-pre-wrap">
                {item.answer}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
