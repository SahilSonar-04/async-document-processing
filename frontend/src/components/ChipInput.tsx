import { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChipInput({ values, onChange, disabled, placeholder = "Add keyword…" }: Props) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const cleaned = draft.trim();
    if (cleaned && !values.includes(cleaned)) onChange([...values, cleaned]);
    setDraft("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5",
        disabled
          ? "border-subtle bg-surface-raised/40"
          : "border-subtle bg-surface-raised focus-within:border-accent"
      )}
    >
      {values.map((v) => (
        <span
          key={v}
          className="flex items-center gap-1 rounded-full border border-subtle bg-surface px-2 py-0.5 font-mono text-xs text-secondary"
        >
          {v}
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-tertiary hover:text-primary"
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          placeholder={values.length ? "" : placeholder}
          className="min-w-[100px] flex-1 bg-transparent py-0.5 text-sm text-primary placeholder:text-tertiary focus:outline-none"
        />
      )}
    </div>
  );
}
