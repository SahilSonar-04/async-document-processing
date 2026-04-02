import { cn, STATUS_CONFIG } from "@/lib/utils";
import type { JobStatus } from "@/types";

interface Props {
  status: JobStatus;
  className?: string;
}

export function StatusBadge({ status, className }: Props) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        cfg.bg,
        cfg.color,
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", cfg.dot)} />
      {cfg.label}
    </span>
  );
}
