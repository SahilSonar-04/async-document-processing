import { cn } from "@/lib/utils";

interface Props {
  type: string;
  className?: string;
}

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
