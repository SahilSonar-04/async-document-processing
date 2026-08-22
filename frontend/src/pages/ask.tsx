/**
 * Autonomous AI research assistant page supporting cross-document questions and streaming reasoning traces.
 *
 * @packageDocumentation
 */

import { useEffect, useRef, useState } from "react";
import Head from "next/head";
import { Send, PanelLeftClose, PanelLeft } from "lucide-react";
import { Layout } from "@/components/Layout";
import { AgentTracePanel } from "@/components/AgentTracePanel";
import { AgentHistoryPanel } from "@/components/AgentHistoryPanel";
import { useAgentStream } from "@/hooks/useAgentStream";
import { cn } from "@/lib/utils";
import type { AgentQueryHistoryItem, AgentStep } from "@/types";

function formatAnswer(answer: string) {
  return answer
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1");
}

interface Message {
  id: string;
  question: string;
  answer: string;
  steps: AgentStep[];
  latencyMs: number;
  llmCallCount: number;
}

/**
 * Cross-document conversational research interface driven by the autonomous ReAct agent.
 */
export default function AskPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyKey, setHistoryKey] = useState(0);
  const [railOpen, setRailOpen] = useState(true);
  const pendingQuestionRef = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const agentStream = useAgentStream();

  useEffect(() => {
    if (!agentStream.answer) return;
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        question: pendingQuestionRef.current,
        answer: agentStream.answer as string,
        steps: agentStream.steps,
        latencyMs: agentStream.latencyMs ?? 0,
        llmCallCount: agentStream.llmCallCount ?? 0,
      },
    ]);
    setHistoryKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentStream.answer]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentStream.steps, agentStream.pendingTool]);

  const handleAsk = () => {
    const q = input.trim();
    if (q.length < 3 || agentStream.isStreaming) return;
    pendingQuestionRef.current = q;
    agentStream.ask(q);
    setInput("");
  };

  const handleSelectHistory = (item: AgentQueryHistoryItem) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${item.id}-${prev.length}`,
        question: item.question,
        answer: item.answer,
        steps: item.tool_trace,
        latencyMs: item.latency_ms,
        llmCallCount: item.llm_call_count,
      },
    ]);
  };

  return (
    <Layout>
      <Head>
        <title>Ask | DocFlow</title>
        <meta name="description" content="Ask questions across all your documents" />
      </Head>

      <div className="flex h-[calc(100vh-8rem)] gap-4">
        <div className={cn("flex-shrink-0 overflow-hidden transition-all", railOpen ? "w-64" : "w-0")}>
          <div className="flex h-full w-64 flex-col rounded-lg border border-subtle bg-surface">
            <div className="flex items-center justify-between border-b border-subtle px-3 py-2.5">
              <span className="text-xs font-medium text-secondary">History</span>
              <button onClick={() => setRailOpen(false)} className="text-tertiary hover:text-primary">
                <PanelLeftClose size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5">
              <AgentHistoryPanel refreshKey={historyKey} onSelect={handleSelectHistory} />
            </div>
          </div>
        </div>

        {!railOpen && (
          <button
            onClick={() => setRailOpen(true)}
            className="h-fit flex-shrink-0 rounded-md border border-subtle p-2 text-tertiary hover:text-primary"
          >
            <PanelLeft size={14} />
          </button>
        )}

        <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-subtle bg-surface">
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && !agentStream.isStreaming && (
              <div className="flex h-full items-center justify-center text-center">
                <p className="max-w-sm text-sm text-tertiary">
                  Ask a question and the agent will search, compare, and look up your
                  documents to answer it.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-6">
              {messages.map((m) => (
                <div key={m.id} className="animate-fade-up">
                  <div className="mb-2 flex justify-end">
                    <div className="max-w-[80%] rounded-lg bg-surface-raised px-3 py-2 text-sm text-primary">
                      {m.question}
                    </div>
                  </div>
                  <div className="max-w-[85%] space-y-2">
                    {m.steps.length > 0 && <AgentTracePanel steps={m.steps} />}
                    <div className="rounded-lg border border-subtle bg-canvas px-3 py-2.5">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-primary">
                        {formatAnswer(m.answer)}
                      </p>
                      <p className="mt-2 font-mono text-[10px] text-tertiary">
                        {m.latencyMs} ms · {m.llmCallCount} LLM call
                        {m.llmCallCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {agentStream.isStreaming && (
                <div className="animate-fade-up">
                  <div className="mb-2 flex justify-end">
                    <div className="max-w-[80%] rounded-lg bg-surface-raised px-3 py-2 text-sm text-primary">
                      {pendingQuestionRef.current}
                    </div>
                  </div>
                  <div className="max-w-[85%]">
                    <AgentTracePanel steps={agentStream.steps} pendingTool={agentStream.pendingTool} />
                  </div>
                </div>
              )}

              {agentStream.error && <p className="text-sm text-danger">{agentStream.error}</p>}
            </div>
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-subtle p-3">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAsk();
                }}
                placeholder="Searches across all your documents…"
                disabled={agentStream.isStreaming}
                className="flex-1 rounded-md border border-subtle bg-surface-raised px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-accent focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={handleAsk}
                disabled={agentStream.isStreaming || input.trim().length < 3}
                className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={14} />
                Ask
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
