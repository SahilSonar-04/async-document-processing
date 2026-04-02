import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { Layout } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { Spinner } from "@/components/Spinner";
import { useSSE } from "@/hooks/useSSE";
import { useJobStore } from "@/store/jobStore";
import {
  getJob,
  retryJob,
  updateResult,
  finalizeResult,
} from "@/lib/api";
import {
  formatBytes,
  formatDate,
  formatRelative,
  STAGE_LABELS,
  cn,
} from "@/lib/utils";
import type { Job, ResultUpdateRequest } from "@/types";
import toast from "react-hot-toast";

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

  // Editable fields
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editKeywords, setEditKeywords] = useState("");

  // Live progress via SSE
  const liveProgress = useJobStore((s) => (jobId ? s.progress[jobId] : null));
  useSSE(jobId, job?.status === "queued" || job?.status === "processing");

  // Fetch job detail
  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    getJob(jobId)
      .then((data) => {
        setJob(data);
        if (data.result) {
          setEditTitle(data.result.title ?? "");
          setEditCategory(data.result.category ?? "");
          setEditSummary(data.result.summary ?? "");
          setEditKeywords(data.result.keywords?.join(", ") ?? "");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [jobId]);

  // Refresh when SSE says completed/failed
  useEffect(() => {
    if (
      liveProgress &&
      (liveProgress.event === "job_completed" || liveProgress.event === "job_failed")
    ) {
      if (jobId) {
        setTimeout(() => {
          getJob(jobId).then((data) => {
            setJob(data);
            if (data.result) {
              setEditTitle(data.result.title ?? "");
              setEditCategory(data.result.category ?? "");
              setEditSummary(data.result.summary ?? "");
              setEditKeywords(data.result.keywords?.join(", ") ?? "");
            }
          });
        }, 500);
      }
    }
  }, [liveProgress, jobId]);

  const handleRetry = async () => {
    if (!jobId) return;
    setRetrying(true);
    try {
      const updated = await retryJob(jobId);
      setJob(updated);
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
        keywords: editKeywords
          ? editKeywords.split(",").map((k) => k.trim()).filter(Boolean)
          : undefined,
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

  const progress = liveProgress?.progress ?? job?.progress ?? 0;
  const stage = liveProgress?.stage ?? job?.current_stage;
  const status = job?.status ?? "queued";
  const isFinalized = job?.result?.is_finalized ?? false;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Spinner className="w-8 h-8" />
        </div>
      </Layout>
    );
  }

  if (error || !job) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-red-600 mb-3">{error ?? "Job not found"}</p>
          <Link href="/" className="text-sm text-brand-600 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Head>
        <title>
          {job.document?.original_filename ?? "Job Detail"} | DocFlow
        </title>
      </Head>

      {/* Breadcrumb */}
      <div className="mb-5">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-brand-600 transition-colors"
        >
          ← Back to dashboard
        </Link>
      </div>

      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex items-start gap-4">
          <FileTypeIcon
            type={job.document?.file_type ?? "txt"}
            className="w-12 h-12 text-sm"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h1 className="text-lg font-semibold text-gray-900 truncate">
                {job.document?.original_filename ?? "Unknown"}
              </h1>
              <StatusBadge status={status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
              <span>{formatBytes(job.document?.file_size ?? 0)}</span>
              <span>Uploaded {formatRelative(job.created_at)}</span>
              {job.retry_count > 0 && (
                <span className="text-amber-600">Retry #{job.retry_count}</span>
              )}
              {job.completed_at && (
                <span className="text-green-600">
                  Completed {formatDate(job.completed_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Progress */}
        {(status === "queued" || status === "processing") && (
          <div className="mt-4">
            <ProgressBar progress={progress} status={status} showLabel />
            <p className="text-sm text-gray-500 mt-1">
              {STAGE_LABELS[stage ?? "queued"] ?? stage ?? "Waiting…"}
            </p>
            {liveProgress?.message && (
              <p className="text-xs text-gray-400 mt-0.5">
                {liveProgress.message}
              </p>
            )}
          </div>
        )}

        {/* Failed — retry button */}
        {status === "failed" && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 mb-2">
              {job.error_message ?? "Processing failed"}
            </p>
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="px-4 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {retrying ? "Retrying…" : "Retry job"}
            </button>
          </div>
        )}
      </div>

      {/* Result section */}
      {job.result && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">
              Extracted Output
            </h2>
            {isFinalized && (
              <span className="text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">
                ✓ Finalized
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Title
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={isFinalized}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg text-sm",
                  isFinalized
                    ? "bg-gray-50 border-gray-200 text-gray-600"
                    : "border-gray-300 focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
                )}
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Category
              </label>
              <input
                type="text"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                disabled={isFinalized}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg text-sm",
                  isFinalized
                    ? "bg-gray-50 border-gray-200 text-gray-600"
                    : "border-gray-300 focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
                )}
              />
            </div>

            {/* Summary */}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Summary
              </label>
              <textarea
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                disabled={isFinalized}
                rows={3}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg text-sm resize-none",
                  isFinalized
                    ? "bg-gray-50 border-gray-200 text-gray-600"
                    : "border-gray-300 focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
                )}
              />
            </div>

            {/* Keywords */}
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={editKeywords}
                onChange={(e) => setEditKeywords(e.target.value)}
                disabled={isFinalized}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg text-sm",
                  isFinalized
                    ? "bg-gray-50 border-gray-200 text-gray-600"
                    : "border-gray-300 focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
                )}
              />
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
            {job.result.word_count != null && (
              <span>Word count: {job.result.word_count}</span>
            )}
            {job.result.language && <span>Language: {job.result.language}</span>}
            {job.result.edited_at && (
              <span>Last edited: {formatDate(job.result.edited_at)}</span>
            )}
            {job.result.finalized_at && (
              <span>Finalized: {formatDate(job.result.finalized_at)}</span>
            )}
          </div>

          {/* Actions */}
          {!isFinalized && (
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="px-4 py-2 text-sm font-medium border border-green-600 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50"
              >
                {finalizing ? "Finalizing…" : "✓ Finalize"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Raw JSON */}
      {job.result?.raw_json && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Raw Extraction Data
          </h2>
          <pre className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 overflow-x-auto max-h-80">
            {JSON.stringify(job.result.raw_json, null, 2)}
          </pre>
        </div>
      )}
    </Layout>
  );
}
