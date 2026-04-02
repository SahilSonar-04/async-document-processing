import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format } from "date-fns";
import type { JobStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRelative(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

export function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), "MMM d, yyyy HH:mm");
  } catch {
    return dateStr;
  }
}

export const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; color: string; bg: string; dot: string }
> = {
  queued: {
    label: "Queued",
    color: "text-amber-700",
    bg: "bg-amber-50 border border-amber-200",
    dot: "bg-amber-400",
  },
  processing: {
    label: "Processing",
    color: "text-blue-700",
    bg: "bg-blue-50 border border-blue-200",
    dot: "bg-blue-500 animate-pulse",
  },
  completed: {
    label: "Completed",
    color: "text-green-700",
    bg: "bg-green-50 border border-green-200",
    dot: "bg-green-500",
  },
  failed: {
    label: "Failed",
    color: "text-red-700",
    bg: "bg-red-50 border border-red-200",
    dot: "bg-red-500",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-gray-600",
    bg: "bg-gray-100 border border-gray-200",
    dot: "bg-gray-400",
  },
};

export const STAGE_LABELS: Record<string, string> = {
  queued:          "Waiting in queue",
  started:         "Job started",
  parsing:         "Parsing document",
  parsing_done:    "Parsing complete",
  extracting:      "Extracting fields",
  extraction_done: "Extraction complete",
  storing:         "Storing results",
  completed:       "Complete",
  failed:          "Failed",
};

export const ALLOWED_EXTENSIONS = ["pdf", "txt", "csv", "json", "md", "docx"];
export const MAX_FILE_SIZE_MB = 50;

export function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `File type .${ext} not supported. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: ${MAX_FILE_SIZE_MB} MB`;
  }
  return null;
}
