/**
 * Pill-style segmented button toggle control.
 *
 * @packageDocumentation
 */

import { cn } from "@/lib/utils";

/**
 * Option item for segmented control.
 */
interface Option<T extends string> {
  /** Value string of the option */
  value: T;
  /** Display label */
  label: string;
}

/**
 * Props contract for the SegmentedControl component.
 */
interface Props<T extends string> {
  /** List of selectable options */
  options: Option<T>[];
  /** Currently selected value */
  value: T;
  /** Change callback */
  onChange: (value: T) => void;
  /** Additional CSS class overrides */
  className?: string;
}

/**
 * Segmented button group allowing mutual exclusion selection between discrete options.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: Props<T>) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-subtle bg-surface p-1",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-surface-raised text-primary" : "text-secondary hover:text-primary"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
