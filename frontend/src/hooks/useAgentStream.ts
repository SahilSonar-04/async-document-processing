/**
 * React hook for streaming autonomous agent reasoning steps and tool execution traces over SSE.
 *
 * @packageDocumentation
 */

import { useCallback, useRef, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import type { AgentStep, AgentStreamEvent } from "@/types";

/**
 * State container for an active or completed agent research session.
 */
interface AgentStreamState {
  /** Whether the agent reasoning SSE stream is currently connected and processing */
  isStreaming: boolean;
  /** Chronological list of completed tool calls */
  steps: AgentStep[];
  /** Identifier of a tool call currently in progress */
  pendingTool: string | null;
  /** Synthesized final answer */
  answer: string | null;
  /** Total latency in milliseconds */
  latencyMs: number | null;
  /** Total LLM completions generated */
  llmCallCount: number | null;
  /** Error message if streaming failed */
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

/**
 * Hook providing reactive streaming execution for the autonomous AI document research agent.
 *
 * Exposes the active execution state, a trigger function (`ask`), and a cancellation function (`stop`).
 *
 * @returns Combined agent streaming state and action handlers.
 */
export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>(initialState);
  const esRef = useRef<EventSource | null>(null);
  const pendingArgsRef = useRef<Map<string, Record<string, unknown>>>(new Map());

  /**
   * Abort the active agent reasoning stream.
   */
  const stop = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setState((s) => ({ ...s, isStreaming: false }));
  }, []);

  /**
   * Start a streaming research session for a given natural language question.
   *
   * @param question - Natural language research query.
   */
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
