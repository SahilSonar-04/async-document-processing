import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { useJobStore } from "@/store/jobStore";
import { formatBytes, formatRelative, STAGE_LABELS } from "@/lib/utils";
import type { JobListItem } from "@/types";

interface Props {
  job: JobListItem;
}

export function JobCard({ job }: Props) {
  const liveProgress = useJobStore((s) => s.progress[job.id]);

  const progress = liveProgress?.progress ?? job.progress;
  const stage = liveProgress?.stage ?? job.current_stage;
  const status = job.status;

  return (
    <Link href={`/jobs/${job.id}`}>
      <div className="bg-white border border-gray-200 rounded-xl p-4 hover:border-brand-300 hover:shadow-sm transition-all cursor-pointer group">
        <div className="flex items-start gap-3">
          <FileTypeIcon type={job.document?.file_type ?? "txt"} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="font-medium text-gray-900 text-sm truncate group-hover:text-brand-700 transition-colors">
                {job.document?.original_filename ?? "Unknown file"}
              </p>
              <StatusBadge status={status} />
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
              <span>{formatBytes(job.document?.file_size ?? 0)}</span>
              <span>·</span>
              <span>{formatRelative(job.created_at)}</span>
              {job.retry_count > 0 && (
                <>
                  <span>·</span>
                  <span className="text-amber-600">Retry #{job.retry_count}</span>
                </>
              )}
            </div>

            {/* Progress bar — shown for queued/processing */}
            {(status === "queued" || status === "processing") && (
              <div>
                <ProgressBar progress={progress} status={status} />
                <p className="text-xs text-gray-400 mt-1">
                  {STAGE_LABELS[stage ?? "queued"] ?? stage}
                </p>
              </div>
            )}

            {status === "completed" && (
              <p className="text-xs text-green-600">
                {job.completed_at ? `Done ${formatRelative(job.completed_at)}` : "Completed"}
              </p>
            )}

            {status === "failed" && (
              <p className="text-xs text-red-600">Processing failed · click to retry</p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
