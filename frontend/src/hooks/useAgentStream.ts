import { useCallback, useRef, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import type { AgentStep, AgentStreamEvent } from "@/types";

interface AgentStreamState {
  isStreaming: boolean;
  steps: AgentStep[];
  pendingTool: string | null;
  answer: string | null;
  latencyMs: number | null;
  llmCallCount: number | null;
  error: string | null;
}

const initialState: AgentStreamState = {
  isStreaming: false,
  steps: [],
  pendingTool: null,
  answer: null,
  latencyMs: null,
  llmCallCount: null,
  error: null,
};

export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>(initialState);
  const esRef = useRef<EventSource | null>(null);
  const pendingArgsRef = useRef<Map<string, Record<string, unknown>>>(new Map());

  const stop = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setState((s) => ({ ...s, isStreaming: false }));
  }, []);

  const ask = useCallback((question: string) => {
    esRef.current?.close();
    pendingArgsRef.current.clear();
    setState({ ...initialState, isStreaming: true });

    const baseUrl = process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")
      : "";
    const token = useAuthStore.getState().token;
    const url = `${baseUrl}/api/v1/agent/ask/stream?question=${encodeURIComponent(
      question
    )}&token=${encodeURIComponent(token ?? "")}`;

    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      let event: AgentStreamEvent;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }

      switch (event.event) {
        case "tool_call_started":
          pendingArgsRef.current.set(event.tool, event.args);
          setState((s) => ({ ...s, pendingTool: event.tool }));
          break;

        case "tool_call_completed":
          setState((s) => ({
            ...s,
            pendingTool: null,
            steps: [
              ...s.steps,
              {
                tool: event.tool,
                args: pendingArgsRef.current.get(event.tool) ?? {},
                result: event.result,
                error: null,
              },
            ],
          }));
          break;

        case "tool_call_failed":
          setState((s) => ({
            ...s,
            pendingTool: null,
            steps: [
              ...s.steps,
              {
                tool: event.tool,
                args: pendingArgsRef.current.get(event.tool) ?? {},
                result: null,
                error: event.error,
              },
            ],
          }));
          break;

        case "final_answer":
          setState((s) => ({
            ...s,
            answer: event.answer,
            latencyMs: event.latency_ms,
            llmCallCount: event.llm_call_count,
            isStreaming: false,
            pendingTool: null,
          }));
          es.close();
          esRef.current = null;
          break;

        case "error":
          setState((s) => ({ ...s, error: event.message, isStreaming: false, pendingTool: null }));
          es.close();
          esRef.current = null;
          break;
      }
    };

    es.onerror = () => {
      setState((s) =>
        s.isStreaming
          ? { ...s, error: "Connection to agent lost", isStreaming: false, pendingTool: null }
          : s
      );
      es.close();
      esRef.current = null;
    };
  }, []);

  return { ...state, ask, stop };
}
