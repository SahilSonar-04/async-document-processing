import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { FileText, Upload as UploadIcon } from "lucide-react";
import { Layout } from "@/components/Layout";
import { JobRow } from "@/components/JobRow";
import { FiltersBar } from "@/components/FiltersBar";
import { ExportBar } from "@/components/ExportBar";
import { SkeletonList } from "@/components/SkeletonRow";
import { Spinner } from "@/components/Spinner";
import { useJobs } from "@/hooks/useJobs";
import { useMultiSSE } from "@/hooks/useSSE";
import { useJobStore } from "@/store/jobStore";

export default function Dashboard() {
  const { jobs, total, pages, isLoading, listError, refresh } = useJobs();
  const { currentPage, setCurrentPage } = useJobStore();

  const activeJobIds = jobs
    .filter((j) => j.status === "queued" || j.status === "processing")
    .map((j) => j.id);
  useMultiSSE(activeJobIds);

  const refreshedJobs = useRef<Set<string>>(new Set());
  const progress = useJobStore((s) => s.progress);

  useEffect(() => {
    let needsRefresh = false;
    for (const [jobId, p] of Object.entries(progress)) {
      if (
        (p.event === "job_completed" || p.event === "job_failed") &&
        !refreshedJobs.current.has(jobId)
      ) {
        refreshedJobs.current.add(jobId);
        needsRefresh = true;
      }
    }
    if (!needsRefresh) return;
    const timer = setTimeout(refresh, 1000);
    return () => clearTimeout(timer);
  }, [progress, refresh]);

  return (
    <Layout>
      <Head>
        <title>Dashboard | DocFlow</title>
        <meta name="description" content="Document processing dashboard" />
      </Head>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-primary">Dashboard</h1>
          <p className="mt-1 font-mono text-xs text-tertiary">
            {total} document{total !== 1 ? "s" : ""}
            {activeJobIds.length > 0 && (
              <>
                {" "}
                · <span className="text-accent">{activeJobIds.length} processing</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportBar />
          <Link
            href="/upload"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas hover:opacity-90"
          >
            Upload files
          </Link>
        </div>
      </div>

      <div className="mb-4">
        <FiltersBar />
      </div>

      {isLoading && jobs.length === 0 ? (
        <SkeletonList rows={6} />
      ) : listError ? (
        <div className="rounded-lg border border-subtle py-16 text-center">
          <p className="mb-3 text-sm text-danger">{listError}</p>
          <button onClick={refresh} className="text-sm text-accent hover:underline">
            Retry
          </button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-subtle py-20 text-center">
          <FileText size={32} className="mx-auto mb-4 text-tertiary opacity-40" />
          <p className="mb-4 text-sm text-secondary">No documents yet</p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            <UploadIcon size={14} />
            Upload your first document
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {jobs.map((job, i) => (
              <div
                key={job.id}
                className="animate-fade-up"
                style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
              >
                <JobRow job={job} />
              </div>
            ))}
          </div>

          {pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="rounded-md border border-subtle px-3 py-1.5 text-sm text-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
              >
                Prev
              </button>
              <span className="font-mono text-xs text-tertiary">
                Page {currentPage} / {pages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(pages, currentPage + 1))}
                disabled={currentPage >= pages}
                className="rounded-md border border-subtle px-3 py-1.5 text-sm text-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {isLoading && jobs.length > 0 && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full border border-subtle bg-surface-raised px-3 py-1.5">
          <Spinner className="h-3.5 w-3.5" />
          <span className="text-xs text-secondary">Refreshing…</span>
        </div>
      )}
    </Layout>
  );
}
