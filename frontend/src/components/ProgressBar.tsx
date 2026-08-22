/**
 * Visual progress bar indicator reflecting job completion percentage and status colors.
 *
 * @packageDocumentation
 */

import { cn } from "@/lib/utils";
import type { JobStatus } from "@/types";

/**
 * Props contract for the ProgressBar component.
 */
interface Props {
  /** Current progress percentage (0-100) */
  progress: number;
  /** Current job status determining bar color theme */
  status: JobStatus;
  /** Whether to render percentage numerical label */
  showLabel?: boolean;
  /** Additional CSS class overrides */
  className?: string;
}

const BAR_COLOR: Record<JobStatus, string> = {
  queued: "bg-warn",
  processing: "bg-accent",
  completed: "bg-accent",
  failed: "bg-danger",
  cancelled: "bg-tertiary",
};

/**
 * Animated horizontal progress bar reflecting workflow stage advancement.
 */
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
