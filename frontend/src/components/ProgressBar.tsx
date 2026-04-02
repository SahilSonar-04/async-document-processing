import { cn } from "@/lib/utils";
import type { JobStatus } from "@/types";

interface Props {
  progress: number;
  status: JobStatus;
  showLabel?: boolean;
  className?: string;
}

const BAR_COLOR: Record<JobStatus, string> = {
  queued:     "bg-amber-400",
  processing: "bg-blue-500",
  completed:  "bg-green-500",
  failed:     "bg-red-500",
  cancelled:  "bg-gray-400",
};

export function ProgressBar({ progress, status, showLabel = false, className }: Props) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={cn("w-full", className)}>
      <div className="flex justify-between items-center mb-1">
        {showLabel && (
          <span className="text-xs text-gray-500">Progress</span>
        )}
        {showLabel && (
          <span className="text-xs font-medium text-gray-700">{clampedProgress}%</span>
        )}
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            BAR_COLOR[status],
            status === "processing" && "animate-progress-pulse"
          )}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}
