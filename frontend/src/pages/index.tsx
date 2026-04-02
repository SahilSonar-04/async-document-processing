import Head from "next/head";
import Link from "next/link";
import { Layout } from "@/components/Layout";
import { JobCard } from "@/components/JobCard";
import { FiltersBar } from "@/components/FiltersBar";
import { ExportBar } from "@/components/ExportBar";
import { Spinner } from "@/components/Spinner";
import { useJobs } from "@/hooks/useJobs";
import { useMultiSSE } from "@/hooks/useSSE";
import { useJobStore } from "@/store/jobStore";
import { useEffect } from "react";

export default function Dashboard() {
  const { jobs, total, pages, isLoading, listError, refresh } = useJobs();
  const { currentPage, setCurrentPage } = useJobStore();

  // Subscribe to SSE for all active (queued/processing) jobs
  const activeJobIds = jobs
    .filter((j) => j.status === "queued" || j.status === "processing")
    .map((j) => j.id);
  useMultiSSE(activeJobIds);

  // Auto-refresh list when active jobs finish (progress hits terminal)
  const progress = useJobStore((s) => s.progress);
  useEffect(() => {
    const terminalEvents = Object.values(progress).filter(
      (p) => p.event === "job_completed" || p.event === "job_failed"
    );
    if (terminalEvents.length > 0) {
      const timer = setTimeout(refresh, 1000);
      return () => clearTimeout(timer);
    }
  }, [progress, refresh]);

  return (
    <Layout>
      <Head>
        <title>Dashboard | DocFlow</title>
        <meta name="description" content="Document processing dashboard - track all jobs" />
      </Head>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} document{total !== 1 ? "s" : ""} total
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportBar />
          <Link
            href="/upload"
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
          >
            Upload files
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5">
        <FiltersBar />
      </div>

      {/* Job list */}
      {isLoading && jobs.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="w-8 h-8" />
        </div>
      ) : listError ? (
        <div className="text-center py-20">
          <p className="text-red-600 text-sm mb-3">{listError}</p>
          <button
            onClick={refresh}
            className="text-sm text-brand-600 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-3xl mx-auto mb-4">
            📄
          </div>
          <p className="text-gray-500 mb-4">No documents yet</p>
          <Link
            href="/upload"
            className="text-sm text-brand-600 hover:underline"
          >
            Upload your first document
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <span className="text-sm text-gray-500">
                Page {currentPage} of {pages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(pages, currentPage + 1))}
                disabled={currentPage >= pages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Loading overlay for subsequent loads */}
      {isLoading && jobs.length > 0 && (
        <div className="fixed bottom-6 right-6 bg-white shadow-lg rounded-full px-4 py-2 flex items-center gap-2 border border-gray-200">
          <Spinner className="w-4 h-4" />
          <span className="text-sm text-gray-600">Refreshing…</span>
        </div>
      )}
    </Layout>
  );
}
