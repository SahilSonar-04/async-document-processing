/**
 * Detailed job view displaying live processing status, field editing, finalization, RAG Q&A, and raw JSON diagnostics.
 *
 * @packageDocumentation
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { Layout } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { Spinner } from "@/components/Spinner";
import { ChipInput } from "@/components/ChipInput";
import { JsonTreeViewer } from "@/components/JsonTreeViewer";
import { useSSE } from "@/hooks/useSSE";
import { useJobStore } from "@/store/jobStore";
import { getJob, retryJob, updateResult, finalizeResult, askDocument } from "@/lib/api";
import { formatBytes, formatDate, formatRelative, STAGE_LABELS, cn } from "@/lib/utils";
import type { DocumentAnswerResponse, Job, ResultUpdateRequest } from "@/types";
import toast from "react-hot-toast";

function formatDocumentAnswer(answer: string) {
  return answer
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1");
}

/**
 * Job detail page for inspecting processing progress, editing extracted metadata, and asking questions.
 */
export default function JobDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const jobId = typeof id === "string" ? id : null;

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [documentAnswer, setDocumentAnswer] = useState<DocumentAnswerResponse | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editKeywords, setEditKeywords] = useState<string[]>([]);

  const liveProgress = useJobStore((s) => (jobId ? s.progress[jobId] : null));
  useSSE(jobId, job?.status === "queued" || job?.status === "processing");

  const refreshedForEvent = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    refreshedForEvent.current = null;

    getJob(jobId)
      .then((data) => {
        setJob(data);
        if (data.result) {
          setEditTitle(data.result.title ?? "");
          setEditCategory(data.result.category ?? "");
          setEditSummary(data.result.summary ?? "");
          setEditKeywords(data.result.keywords ?? []);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => {
    if (!liveProgress || !jobId) return;

    const isTerminal =
      liveProgress.event === "job_completed" || liveProgress.event === "job_failed";

    if (isTerminal && refreshedForEvent.current !== liveProgress.event) {
      refreshedForEvent.current = liveProgress.event;

      const timer = setTimeout(() => {
        getJob(jobId)
          .then((data) => {
            setJob(data);
            if (data.result) {
              setEditTitle(data.result.title ?? "");
              setEditCategory(data.result.category ?? "");
              setEditSummary(data.result.summary ?? "");
              setEditKeywords(data.result.keywords ?? []);
            }
          })
          .catch(() => {});
      }, 600);

      return () => clearTimeout(timer);
    }
  }, [liveProgress, jobId]);

  const handleRetry = async () => {
    if (!jobId) return;
    setRetrying(true);
    try {
      const updated = await retryJob(jobId);
      setJob(updated);
      refreshedForEvent.current = null;
      toast.success("Job re-queued for processing");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  const handleSave = async () => {
    if (!jobId) return;
    setSaving(true);
    try {
      const update: ResultUpdateRequest = {
        title: editTitle || undefined,
        category: editCategory || undefined,
        summary: editSummary || undefined,
        keywords: editKeywords,
      };
      const updated = await updateResult(jobId, update);
      setJob((prev) => (prev ? { ...prev, result: updated } : prev));
      toast.success("Changes saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!jobId) return;
    setFinalizing(true);
    try {
      const updated = await finalizeResult(jobId);
      setJob((prev) => (prev ? { ...prev, result: updated } : prev));
      toast.success("Result finalized!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Finalize failed");
    } finally {
      setFinalizing(false);
    }
  };

  const handleAskDocument = async () => {
    if (!jobId || !question.trim()) return;
    setAsking(true);
    try {
      const answer = await askDocument(jobId, question.trim());
      setDocumentAnswer(answer);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Document Q&A failed");
    } finally {
      setAsking(false);
    }
  };

  const progress = liveProgress?.progress ?? job?.progress ?? 0;
  const stage = liveProgress?.stage ?? job?.current_stage;
  const status = job?.status ?? "queued";
  const isFinalized = job?.result?.is_finalized ?? false;

  if (loading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <Spinner className="h-8 w-8" />
          <p className="text-sm text-tertiary">Loading…</p>
        </div>
      </Layout>
    );
  }

  if (error || !job) {
    return (
      <Layout>
        <div className="py-20 text-center">
          <p className="mb-3 text-danger">{error ?? "Job not found"}</p>
          <Link href="/" className="text-sm text-accent hover:underline">
            Back to dashboard
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Head>
        <title>{job.document?.original_filename ?? "Job Detail"} | DocFlow</title>
      </Head>

      <div className="mb-5">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-tertiary hover:text-primary">
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>
      </div>

      <div className="mb-5 rounded-lg border border-subtle bg-surface p-5">
        <div className="flex items-start gap-4">
          <FileTypeIcon type={job.document?.file_type ?? "txt"} className="h-12 w-14 text-xs" />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h1 className="truncate text-lg font-semibold text-primary">
                {job.document?.original_filename ?? "Unknown"}
              </h1>
              <StatusBadge status={status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-tertiary">
              <span>{formatBytes(job.document?.file_size ?? 0)}</span>
              <span>uploaded {formatRelative(job.created_at)}</span>
              {job.retry_count > 0 && <span className="text-warn">retry #{job.retry_count}</span>}
              {job.completed_at && (
                <span className="text-accent">completed {formatDate(job.completed_at)}</span>
              )}
            </div>
          </div>
        </div>

        {(status === "queued" || status === "processing") && (
          <div className="mt-4">
            <ProgressBar progress={progress} status={status} showLabel />
            <p className="mt-1 text-sm text-secondary">
              {STAGE_LABELS[stage ?? "queued"] ?? stage ?? "Waiting…"}
            </p>
          </div>
        )}

        {status === "failed" && (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger/5 p-3">
            <p className="mb-2 text-sm text-danger">{job.error_message ?? "Processing failed"}</p>
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="rounded-md bg-danger px-4 py-1.5 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50"
            >
              {retrying ? "Retrying…" : "Retry job"}
            </button>
          </div>
        )}
      </div>

      {job.result && (
        <div className="mb-5 rounded-lg border border-subtle bg-surface p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-primary">Extracted output</h2>
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide",
                  job.extraction_mode === "llm"
                    ? "border-accent/30 bg-accent/10 text-accent"
                    : "border-subtle text-tertiary"
                )}
              >
                {job.extraction_mode === "llm" ? "AI (Gemini)" : "Classical"}
              </span>
            </div>
            {isFinalized && (
              <span className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                <Check size={12} />
                Finalized
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-tertiary">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={isFinalized}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-sm",
                  isFinalized
                    ? "border-subtle bg-surface-raised/40 text-secondary"
                    : "border-subtle bg-surface-raised text-primary focus:border-accent focus:outline-none"
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-tertiary">Category</label>
              <input
                type="text"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                disabled={isFinalized}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-sm",
                  isFinalized
                    ? "border-subtle bg-surface-raised/40 text-secondary"
                    : "border-subtle bg-surface-raised text-primary focus:border-accent focus:outline-none"
                )}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-tertiary">Summary</label>
              <textarea
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                disabled={isFinalized}
                rows={3}
                className={cn(
                  "w-full resize-none rounded-md border px-3 py-2 text-sm",
                  isFinalized
                    ? "border-subtle bg-surface-raised/40 text-secondary"
                    : "border-subtle bg-surface-raised text-primary focus:border-accent focus:outline-none"
                )}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-tertiary">Keywords</label>
              <ChipInput values={editKeywords} onChange={setEditKeywords} disabled={isFinalized} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 border-t border-subtle pt-4 font-mono text-xs text-tertiary">
            {job.result.word_count != null && <span>{job.result.word_count} words</span>}
            {job.result.language && <span>lang: {job.result.language}</span>}
            {job.result.edited_at && <span>edited {formatDate(job.result.edited_at)}</span>}
            {job.result.finalized_at && <span>finalized {formatDate(job.result.finalized_at)}</span>}
          </div>

          {!isFinalized && (
            <div className="mt-4 flex items-center gap-3 border-t border-subtle pt-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-md border border-subtle px-4 py-2 text-sm font-medium text-secondary hover:text-primary disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50"
              >
                {finalizing ? "Finalizing…" : "Finalize"}
              </button>
            </div>
          )}
        </div>
      )}

      {job.status === "completed" && (
        <div className="mb-5 rounded-lg border border-subtle bg-surface p-5">
          <h2 className="text-base font-semibold text-primary">Ask about this document</h2>
          <p className="mt-1 text-sm text-tertiary">
            Answers use the most relevant indexed excerpts and cite their sources.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAskDocument();
              }}
              placeholder="Ask a question about this document"
              className="min-w-0 flex-1 rounded-md border border-subtle bg-surface-raised px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleAskDocument}
              disabled={asking || question.trim().length < 3}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {asking ? "Asking…" : "Ask"}
            </button>
          </div>

          {documentAnswer && (
            <div className="mt-4 rounded-md border border-subtle bg-canvas p-4">
              <p className="whitespace-pre-wrap text-sm leading-6 text-primary">
                {formatDocumentAnswer(documentAnswer.answer)}
              </p>
              <p className="mt-2 font-mono text-[10px] text-tertiary">
                {documentAnswer.latency_ms} ms · {documentAnswer.llm_call_count} LLM call
                {documentAnswer.llm_call_count !== 1 ? "s" : ""}
              </p>

              <details className="mt-3 border-t border-subtle pt-3">
                <summary className="cursor-pointer text-xs font-medium text-secondary">
                  Sources ({documentAnswer.citations.length})
                </summary>
                <div className="mt-3 space-y-2">
                  {documentAnswer.citations.map((citation) => (
                    <div key={citation.chunk_index} className="rounded-md border border-subtle bg-surface p-3">
                      <p className="mb-1 font-mono text-[10px] text-tertiary">
                        excerpt {citation.chunk_index + 1} · similarity {citation.similarity}
                      </p>
                      <p className="text-xs text-secondary">{citation.snippet}</p>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      {job.result?.raw_json && <JsonTreeViewer data={job.result.raw_json} title="Raw extraction data" />}
    </Layout>
  );
}
