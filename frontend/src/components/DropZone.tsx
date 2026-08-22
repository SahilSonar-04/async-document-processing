/**
 * Drag-and-drop document upload interface with file validation and extraction mode selection.
 *
 * @packageDocumentation
 */

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload as UploadIcon, X } from "lucide-react";
import { cn, validateFile, ALLOWED_EXTENSIONS, MAX_FILE_SIZE_MB, formatBytes } from "@/lib/utils";
import { uploadDocuments } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import toast from "react-hot-toast";
import { useRouter } from "next/router";

/**
 * File item queued for upload with client-side validation error status.
 */
interface QueuedFile {
  /** Selected browser File instance */
  file: File;
  /** Validation error message if invalid, or null */
  error: string | null;
}

const MODE_INFO: Record<"classical" | "llm", string> = {
  classical: "Fast, deterministic, no API cost.",
  llm: "Gemini-powered — richer output, adds latency and cost.",
};

/**
 * Interactive drag-and-drop file upload zone supporting multi-file queueing,
 * format validation, extraction mode toggling, and batch job scheduling.
 */
export function DropZone() {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extractionMode, setExtractionMode] = useState<"classical" | "llm">("classical");
  const router = useRouter();

  const onDrop = useCallback((accepted: File[]) => {
    const items: QueuedFile[] = accepted.map((f) => ({ file: f, error: validateFile(f) }));
    setQueue((prev) => [...prev, ...items]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    noClick: false,
  });

  const removeFile = (idx: number) => setQueue((prev) => prev.filter((_, i) => i !== idx));
  const validFiles = queue.filter((q) => !q.error);

  const handleUpload = async () => {
    if (!validFiles.length) return;
    setUploading(true);
    try {
      const { uploaded, errors } = await uploadDocuments(
        validFiles.map((q) => q.file),
        extractionMode
      );
      if (uploaded.length) toast.success(`${uploaded.length} file(s) queued for processing`);
      if (errors.length) errors.forEach((e) => toast.error(`${e.filename}: ${e.error}`));
      setQueue([]);
      router.push("/");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors",
          isDragActive ? "border-accent bg-accent/5" : "border-subtle hover:border-strong hover:bg-surface"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <UploadIcon size={28} className="text-tertiary" />
          <div>
            <p className="font-medium text-primary">
              {isDragActive ? "Drop files here" : "Drag files here, or click to browse"}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {ALLOWED_EXTENSIONS.map((ext) => (
                <span
                  key={ext}
                  className="rounded border border-subtle px-1.5 py-0.5 font-mono text-[10px] text-tertiary"
                >
                  {ext}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-tertiary">Max {MAX_FILE_SIZE_MB} MB per file</p>
          </div>
        </div>
      </div>

      {queue.length > 0 && (
        <div className="space-y-1.5">
          {queue.map((item, idx) => (
            <div
              key={idx}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
                item.error ? "border-danger/40 bg-danger/5" : "border-subtle bg-surface"
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex-shrink-0 font-mono text-[10px] text-tertiary">
                  {item.file.name.split(".").pop()?.toUpperCase()}
                </span>
                <span className="truncate text-secondary">{item.file.name}</span>
                <span className="flex-shrink-0 font-mono text-xs text-tertiary">
                  {formatBytes(item.file.size)}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                {item.error && <span className="text-xs text-danger">{item.error}</span>}
                <button onClick={() => removeFile(idx)} className="text-tertiary hover:text-primary">
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <fieldset className="rounded-lg border border-subtle p-4">
        <legend className="px-1 text-sm font-medium text-secondary">Extraction mode</legend>
        <div className="mt-1 flex gap-1 rounded-lg border border-subtle bg-surface p-1">
          {(["classical", "llm"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setExtractionMode(mode)}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                extractionMode === mode
                  ? "bg-surface-raised text-primary"
                  : "text-secondary hover:text-primary"
              )}
            >
              {mode === "classical" ? "Classical NLP" : "AI (Gemini)"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-tertiary">{MODE_INFO[extractionMode]}</p>
      </fieldset>

      {queue.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          <span className="font-mono text-xs text-tertiary">
            {validFiles.length} valid · {queue.length - validFiles.length} invalid
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => setQueue([])}
              className="rounded-md border border-subtle px-4 py-2 text-sm text-secondary hover:text-primary"
            >
              Clear all
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !validFiles.length}
              className={cn(
                "rounded-md px-5 py-2 text-sm font-medium",
                uploading || !validFiles.length
                  ? "cursor-not-allowed bg-accent/40 text-canvas/70"
                  : "bg-accent text-canvas hover:opacity-90"
              )}
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <Spinner className="h-4 w-4 text-canvas" />
                  Uploading…
                </span>
              ) : (
                `Upload ${validFiles.length} file${validFiles.length !== 1 ? "s" : ""}`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
