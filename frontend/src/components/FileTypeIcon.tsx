import { cn } from "@/lib/utils";

interface Props {
  type: string;
  className?: string;
}

const TYPE_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  pdf:  { label: "PDF",  color: "text-red-700",    bg: "bg-red-100" },
  txt:  { label: "TXT",  color: "text-gray-700",   bg: "bg-gray-100" },
  csv:  { label: "CSV",  color: "text-green-700",  bg: "bg-green-100" },
  json: { label: "JSON", color: "text-yellow-700", bg: "bg-yellow-100" },
  md:   { label: "MD",   color: "text-purple-700", bg: "bg-purple-100" },
  docx: { label: "DOCX", color: "text-blue-700",   bg: "bg-blue-100" },
};

export function FileTypeIcon({ type, className }: Props) {
  const cfg = TYPE_STYLES[type.toLowerCase()] ?? {
    label: type.toUpperCase().slice(0, 4),
    color: "text-gray-600",
    bg: "bg-gray-100",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-10 h-10 rounded-lg text-xs font-bold flex-shrink-0",
        cfg.bg,
        cfg.color,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}
