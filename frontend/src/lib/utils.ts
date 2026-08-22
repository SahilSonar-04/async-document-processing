/**
 * Presentation helpers, class name merge utilities, formatting functions, and validation constants.
 *
 * @packageDocumentation
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format } from "date-fns";
import type { JobStatus } from "@/types";

/**
 * Merge Tailwind CSS class names with clsx conditional syntax support and conflict resolution.
 *
 * @param inputs - Class names, boolean conditionals, or class dictionaries.
 * @returns Merged deduplicated CSS class string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a byte count into a human-readable string (B, KB, MB).
 *
 * @param bytes - Numeric byte count.
 * @returns Formatted size string (e.g. "1.2 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format an ISO date string into a relative human-readable time interval (e.g. "5 minutes ago").
 *
 * @param dateStr - ISO formatted date string.
 * @returns Relative time string or original string if parsing fails.
 */
export function formatRelative(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

/**
 * Format an ISO date string into a fixed calendar representation (e.g. "Aug 21, 2026 15:30").
 *
 * @param dateStr - ISO formatted date string.
 * @returns Formatted date string or original string if parsing fails.
 */
export function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), "MMM d, yyyy HH:mm");
  } catch {
    return dateStr;
  }
}

/**
 * Visual badge styling configuration mapped by job status.
 */
export const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; color: string; bg: string; dot: string }
> = {
  queued: {
    label: "Queued",
    color: "text-warn",
    bg: "bg-warn/10 border border-warn/30",
    dot: "bg-warn",
  },
  processing: {
    label: "Processing",
    color: "text-accent",
    bg: "bg-accent/10 border border-accent/30",
    dot: "bg-accent animate-pulse",
  },
  completed: {
    label: "Completed",
    color: "text-accent",
    bg: "bg-accent/10 border border-accent/30",
    dot: "bg-accent",
  },
  failed: {
    label: "Failed",
    color: "text-danger",
    bg: "bg-danger/10 border border-danger/30",
    dot: "bg-danger",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-tertiary",
    bg: "bg-surface-raised border border-subtle",
    dot: "bg-tertiary",
  },
};

/**
 * Human-readable descriptive labels for document pipeline stages.
 */
export const STAGE_LABELS: Record<string, string> = {
  queued: "Waiting in queue",
  started: "Job started",
  parsing: "Parsing document",
  parsing_done: "Parsing complete",
  extracting: "Extracting fields",
  extraction_done: "Extraction complete",
  embedding: "Creating document index",
  embedding_done: "Document index ready",
  embedding_skipped: "Document index unavailable",
  storing: "Storing results",
  completed: "Complete",
  failed: "Failed",
};

/**
 * List of permitted file extensions for client-side dropzone validation.
 */
export const ALLOWED_EXTENSIONS = ["pdf", "txt", "csv", "json", "md", "docx"];

/**
 * Maximum allowed file upload size in megabytes.
 */
export const MAX_FILE_SIZE_MB = 50;

/**
 * Validate a candidate file against allowed extensions and size limits.
 *
 * @param file - Selected File instance to validate.
 * @returns Error message string if invalid, or null if validation passes.
 */
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
