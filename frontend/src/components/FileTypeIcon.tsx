/**
 * Compact file extension badge displaying stylized uppercase format identifiers.
 *
 * @packageDocumentation
 */

import { cn } from "@/lib/utils";

/**
 * Props contract for the FileTypeIcon component.
 */
interface Props {
  /** Lowercase file extension (e.g. "pdf", "csv") */
  type: string;
  /** Additional CSS class overrides */
  className?: string;
}

/**
 * Visual badge displaying truncated monospace file type identifiers.
 */
export function FileTypeIcon({ type, className }: Props) {
  const label = type.toUpperCase().slice(0, 4);
  return (
    <span
      className={cn(
        "inline-flex h-8 w-10 flex-shrink-0 items-center justify-center rounded-md border border-subtle bg-surface-raised font-mono text-[10px] font-medium text-secondary",
        className
      )}
    >
      {label}
    </span>
  );
}
