import { useEffect, useRef } from "react";
import { useJobStore } from "@/store/jobStore";
import type { ProgressEvent, JobStatus } from "@/types";

const TERMINAL_EVENTS = new Set(["job_completed", "job_failed", "job_cancelled"]);

export function useSSE(jobId: string | null, enabled = true) {
  const updateProgress = useJobStore((s) => s.updateProgress);
  const updateJobInList = useJobStore((s) => s.updateJobInList);
  const esRef = useRef<EventSource | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!jobId || !enabled) return;

    doneRef.current = false;
    esRef.current?.close();

    const baseUrl = process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")
      : "";
    const es = new EventSource(`${baseUrl}/api/v1/jobs/${jobId}/progress`);
    esRef.current = es;

    es.onmessage = (e) => {
      if (doneRef.current) return;
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
          doneRef.current = true;
          es.close();
          esRef.current = null;
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      if (!doneRef.current) {
        es.close();
        esRef.current = null;
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, enabled]);
}

export function useMultiSSE(jobIds: string[]) {
  const updateProgress = useJobStore((s) => s.updateProgress);
  const updateJobInList = useJobStore((s) => s.updateJobInList);
  const esRefs = useRef<Map<string, EventSource>>(new Map());
  const doneJobs = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(jobIds);

    for (const [id, es] of esRefs.current) {
      if (!currentIds.has(id)) {
        es.close();
        esRefs.current.delete(id);
      }
    }

    for (const jobId of jobIds) {
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
        if (!doneJobs.current.has(jobId)) {
          es.close();
          esRefs.current.delete(jobId);
        }
      };
    }

    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(jobIds)]);

  useEffect(() => {
    return () => {
      for (const es of esRefs.current.values()) es.close();
      esRefs.current.clear();
      doneJobs.current.clear();
    };
  }, []);
}