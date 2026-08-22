/**
 * Table list row component displaying job metadata, file icon, progress bar, and status badge.
 *
 * @packageDocumentation
 */

import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { useJobStore } from "@/store/jobStore";
import { formatBytes, formatRelative, STAGE_LABELS, cn } from "@/lib/utils";
import type { JobListItem } from "@/types";

/**
 * Props contract for the JobRow component.
 */
interface Props {
  /** Job summary item to render */
  job: JobListItem;
}

/**
 * Interactive list row item representing a document processing job with live SSE progress bindings.
 */
export function JobRow({ job }: Props) {
  const liveProgress = useJobStore((s) => s.progress[job.id]);

  const progress = liveProgress?.progress ?? job.progress;
  const stage = liveProgress?.stage ?? job.current_stage;
  const status = job.status;

  return (
    <Link href={`/jobs/${job.id}`}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-md border border-subtle px-3 py-3 transition-colors hover:border-strong hover:bg-surface-raised",
          liveProgress && "animate-flash"
        )}
      >
        <FileTypeIcon type={job.document?.file_type ?? "txt"} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-primary">
              {job.document?.original_filename ?? "Unknown file"}
            </p>
            {job.retry_count > 0 && (
              <span className="font-mono text-[10px] text-warn">retry #{job.retry_count}</span>
            )}
          </div>
          {(status === "queued" || status === "processing") && (
            <div className="mt-1.5 flex items-center gap-2">
              <ProgressBar progress={progress} status={status} className="max-w-[160px]" />
              <span className="font-mono text-[10px] text-tertiary">
                {STAGE_LABELS[stage ?? "queued"] ?? stage}
              </span>
            </div>
          )}
        </div>

        <span className="hidden font-mono text-xs text-tertiary sm:inline">
          {formatBytes(job.document?.file_size ?? 0)}
        </span>
        <span className="hidden font-mono text-xs text-tertiary md:inline">
          {formatRelative(job.created_at)}
        </span>
        <StatusBadge status={status} />
      </div>
    </Link>
  );
}
