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
  // ✅ FIX: track whether we've already reacted to a terminal event
  const doneRef = useRef(false);

  useEffect(() => {
    if (!jobId || !enabled) return;

    // Reset done-guard whenever jobId/enabled changes
    doneRef.current = false;

    // Close any stale connection before opening a new one
    esRef.current?.close();

    const baseUrl = process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")
      : "";
    const es = new EventSource(`${baseUrl}/api/v1/jobs/${jobId}/progress`);
    esRef.current = es;

    es.onmessage = (e) => {
      if (doneRef.current) return; // ignore late messages after terminal event
      try {
        const event: ProgressEvent = JSON.parse(e.data);

        updateProgress(jobId, event);

        const statusPatch: Partial<{ status: JobStatus; progress: number; current_stage: string }> = {
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

        if (selectedJob?.id === jobId) {
          setSelectedJob({ ...selectedJob, ...statusPatch });
        }

        if (TERMINAL_EVENTS.has(event.event)) {
          doneRef.current = true;
          es.close();
          esRef.current = null;
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // Don't reconnect if we already hit a terminal event
      if (!doneRef.current) {
        es.close();
        esRef.current = null;
      }
    };

    return () => {
      // Cleanup: close this specific connection only
      es.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, enabled]);
}

/**
 * Hook to watch multiple active jobs simultaneously.
 *
 * FIX: The cleanup function now only closes connections for jobs that have
 * been *removed* from the list, not all connections indiscriminately.
 * The React effect cleanup (return fn) only fires on unmount.
 */
export function useMultiSSE(jobIds: string[]) {
  const updateProgress = useJobStore((s) => s.updateProgress);
  const updateJobInList = useJobStore((s) => s.updateJobInList);
  const esRefs = useRef<Map<string, EventSource>>(new Map());
  // Track jobs that have completed so we don't reopen their connections
  const doneJobs = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(jobIds);

    // ── Close connections for jobs no longer in the active list ──────────
    for (const [id, es] of esRefs.current) {
      if (!currentIds.has(id)) {
        es.close();
        esRefs.current.delete(id);
      }
    }

    // ── Open new connections for newly active jobs ─────────────────────
    for (const jobId of jobIds) {
      // Skip if already connected or already finished
      if (esRefs.current.has(jobId) || doneJobs.current.has(jobId)) continue;

      const baseUrl = process.env.NEXT_PUBLIC_API_URL
        ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")
        : "";
      const es = new EventSource(`${baseUrl}/api/v1/jobs/${jobId}/progress`);
      esRefs.current.set(jobId, es);

      es.onmessage = (e) => {
        try {
          const event: ProgressEvent = JSON.parse(e.data);
          updateProgress(jobId, event);

          const statusPatch: Partial<{ status: JobStatus; progress: number; current_stage: string }> = {
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
            doneJobs.current.add(jobId);
            es.close();
            esRefs.current.delete(jobId);
          }
        } catch {
          // ignore
        }
      };

      es.onerror = () => {
        // Only clean up if not already done (avoid closing after terminal event)
        if (!doneJobs.current.has(jobId)) {
          es.close();
          esRefs.current.delete(jobId);
        }
      };
    }

    // ── Unmount cleanup: close everything ────────────────────────────────
    // This runs only when the component using this hook unmounts — NOT on
    // every jobIds change (that's handled above). This is the key fix.
    return () => {
      // intentionally empty — we manage lifecycle above
      // If you want to close all on unmount, uncomment:
      // for (const es of esRefs.current.values()) es.close();
      // esRefs.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(jobIds)]);

  // Separate cleanup effect that truly only fires on component unmount
  useEffect(() => {
    return () => {
      for (const es of esRefs.current.values()) es.close();
      esRefs.current.clear();
      doneJobs.current.clear();
    };
  }, []); // empty deps = runs only on mount/unmount
}