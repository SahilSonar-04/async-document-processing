import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { cn, validateFile, ALLOWED_EXTENSIONS, MAX_FILE_SIZE_MB, formatBytes } from "@/lib/utils";
import { uploadDocuments } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import toast from "react-hot-toast";
import { useRouter } from "next/router";

interface QueuedFile {
  file: File;
  error: string | null;
}

export function DropZone() {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  const onDrop = useCallback((accepted: File[]) => {
    const items: QueuedFile[] = accepted.map((f) => ({
      file: f,
      error: validateFile(f),
    }));
    setQueue((prev) => [...prev, ...items]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    noClick: false,
  });

  const removeFile = (idx: number) =>
    setQueue((prev) => prev.filter((_, i) => i !== idx));

  const validFiles = queue.filter((q) => !q.error);

  const handleUpload = async () => {
    if (!validFiles.length) return;
    setUploading(true);
    try {
      const { uploaded, errors } = await uploadDocuments(validFiles.map((q) => q.file));
      if (uploaded.length) {
        toast.success(`${uploaded.length} file(s) queued for processing`);
      }
      if (errors.length) {
        errors.forEach((e) => toast.error(`${e.filename}: ${e.error}`));
      }
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
      {/* Drop area */}
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-brand-500 bg-brand-50"
            : "border-gray-300 hover:border-brand-400 hover:bg-gray-50"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-2xl">
            ↑
          </div>
          <div>
            <p className="font-medium text-gray-700">
              {isDragActive ? "Drop files here" : "Drag files here, or click to browse"}
            </p>
            <p className="text-sm mt-1">
              {ALLOWED_EXTENSIONS.join(", ")} · Max {MAX_FILE_SIZE_MB} MB per file
            </p>
          </div>
        </div>
      </div>

      {/* File queue */}
      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map((item, idx) => (
            <div
              key={idx}
              className={cn(
                "flex items-center justify-between px-4 py-3 rounded-lg border text-sm",
                item.error
                  ? "border-red-200 bg-red-50"
                  : "border-gray-200 bg-white"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-gray-400 text-xs font-mono flex-shrink-0">
                  {item.file.name.split(".").pop()?.toUpperCase()}
                </span>
                <span className="truncate text-gray-700">{item.file.name}</span>
                <span className="text-gray-400 flex-shrink-0">
                  {formatBytes(item.file.size)}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {item.error && (
                  <span className="text-red-600 text-xs">{item.error}</span>
                )}
                <button
                  onClick={() => removeFile(idx)}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {queue.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-gray-500">
            {validFiles.length} valid · {queue.length - validFiles.length} invalid
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => setQueue([])}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Clear all
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !validFiles.length}
              className={cn(
                "px-5 py-2 text-sm font-medium rounded-lg text-white transition-colors",
                uploading || !validFiles.length
                  ? "bg-brand-300 cursor-not-allowed"
                  : "bg-brand-600 hover:bg-brand-700"
              )}
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <Spinner className="w-4 h-4 text-white" />
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
