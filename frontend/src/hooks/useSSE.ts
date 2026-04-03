import { useEffect, useRef } from "react";
import { useJobStore } from "@/store/jobStore";
import type { ProgressEvent, JobStatus } from "@/types";

const TERMINAL_EVENTS = new Set(["job_completed", "job_failed", "job_cancelled"]);

export function useSSE(jobId: string | null, enabled = true) {
  const updateProgress = useJobStore((s) => s.updateProgress);
  const updateJobInList = useJobStore((s) => s.updateJobInList);
  const setSelectedJob = useJobStore((s) => s.setSelectedJob);
  const selectedJob = useJobStore((s) => s.selectedJob);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId || !enabled) return;

    // Close any existing connection for this job
    if (esRef.current) {
      esRef.current.close();
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")
      : "";
    const es = new EventSource(`${baseUrl}/api/v1/jobs/${jobId}/progress`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: ProgressEvent = JSON.parse(e.data);

        // Update progress store
        updateProgress(jobId, event);

        // Derive status from terminal events
        let statusPatch: Partial<{ status: JobStatus; progress: number; current_stage: string }> = {
          progress: event.progress,
          current_stage: event.stage ?? undefined,
        };

        if (event.event === "job_completed") {
          statusPatch.status = "completed";
          statusPatch.progress = 100;
        } else if (event.event === "job_failed") {
          statusPatch.status = "failed";
        } else if (event.event === "job_started") {
          statusPatch.status = "processing";
        }

        updateJobInList(jobId, statusPatch);

        // Also patch the detail view if open
        if (selectedJob?.id === jobId) {
          setSelectedJob({ ...selectedJob, ...statusPatch });
        }

        // Close stream on terminal event
        if (TERMINAL_EVENTS.has(event.event)) {
          es.close();
          esRef.current = null;
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, enabled]);
}

/**
 * Hook to watch multiple active jobs simultaneously.
 * Fires up one SSE connection per active job.
 */
export function useMultiSSE(jobIds: string[]) {
  const updateProgress = useJobStore((s) => s.updateProgress);
  const updateJobInList = useJobStore((s) => s.updateJobInList);
  const esRefs = useRef<Map<string, EventSource>>(new Map());

  useEffect(() => {
    // Open new connections for new job IDs
    for (const jobId of jobIds) {
      if (esRefs.current.has(jobId)) continue;

      const baseUrl = process.env.NEXT_PUBLIC_API_URL
        ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")
        : "";
      const es = new EventSource(`${baseUrl}/api/v1/jobs/${jobId}/progress`);
      esRefs.current.set(jobId, es);

      es.onmessage = (e) => {
        try {
          const event: ProgressEvent = JSON.parse(e.data);
          updateProgress(jobId, event);

          let statusPatch: Partial<{ status: JobStatus; progress: number; current_stage: string }> = {
            progress: event.progress,
            current_stage: event.stage ?? undefined,
          };

          if (event.event === "job_completed") {
            statusPatch.status = "completed";
            statusPatch.progress = 100;
          } else if (event.event === "job_failed") {
            statusPatch.status = "failed";
          } else if (event.event === "job_started") {
            statusPatch.status = "processing";
          }

          updateJobInList(jobId, statusPatch);

          if (TERMINAL_EVENTS.has(event.event)) {
            es.close();
            esRefs.current.delete(jobId);
          }
        } catch {
          // ignore
        }
      };

      es.onerror = () => {
        es.close();
        esRefs.current.delete(jobId);
      };
    }

    // Close connections for jobs no longer in the list
    for (const [id, es] of esRefs.current) {
      if (!jobIds.includes(id)) {
        es.close();
        esRefs.current.delete(id);
      }
    }

    return () => {
      for (const es of esRefs.current.values()) es.close();
      esRefs.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(jobIds)]);
}
