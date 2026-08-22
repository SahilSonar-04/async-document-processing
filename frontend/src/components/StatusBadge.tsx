/**
 * Status indicator badge with color-coded dot and uppercase state label.
 *
 * @packageDocumentation
 */

import { cn, STATUS_CONFIG } from "@/lib/utils";
import type { JobStatus } from "@/types";

/**
 * Props contract for the StatusBadge component.
 */
interface Props {
  /** Target job status enum value */
  status: JobStatus;
  /** Additional CSS class overrides */
  className?: string;
}

/**
 * Visual badge displaying styled status indicator dot and label.
 */
export function StatusBadge({ status, className }: Props) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", cfg.dot)} />
      <span className={cn("font-mono text-[11px] uppercase tracking-wide", cfg.color)}>
        {cfg.label}
      </span>
    </span>
  );
}
