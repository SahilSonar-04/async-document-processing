import { cn } from "@/lib/utils";
import type { JobStatus } from "@/types";

interface Props {
  progress: number;
  status: JobStatus;
  showLabel?: boolean;
  className?: string;
}

const BAR_COLOR: Record<JobStatus, string> = {
  queued: "bg-warn",
  processing: "bg-accent",
  completed: "bg-accent",
  failed: "bg-danger",
  cancelled: "bg-tertiary",
};

export function ProgressBar({ progress, status, showLabel = false, className }: Props) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-tertiary">Progress</span>
          <span className="font-mono text-xs text-secondary">{clamped}%</span>
        </div>
      )}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
        <div
          key={clamped}
          className={cn(
            "relative h-full overflow-hidden rounded-full transition-all duration-500 ease-out animate-blip",
            BAR_COLOR[status]
          )}
          style={{ width: `${clamped}%` }}
        >
          {status === "processing" && (
            <div className="absolute inset-y-0 w-1/3 animate-sweep bg-white/25" />
          )}
        </div>
      </div>
    </div>
  );
}
