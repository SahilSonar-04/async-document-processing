/**
 * React hook for fetching and synchronizing paginated job listings with the global store.
 *
 * @packageDocumentation
 */

import { useEffect, useCallback } from "react";
import { useJobStore } from "@/store/jobStore";
import { listJobs } from "@/lib/api";

/**
 * Hook to automatically synchronize the jobs listing with current filter and pagination state.
 *
 * @returns Object containing current jobs list, pagination counts, loading/error states, and manual refresh trigger.
 */
export function useJobs() {
  const {
    filters,
    currentPage,
    setJobs,
    setLoading,
    setListError,
    isLoading,
    jobs,
    total,
    pages,
    listError,
  } = useJobStore();

  const fetch = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await listJobs({ ...filters, page: currentPage });
      setJobs(res.items, res.total, res.pages);
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage, setJobs, setLoading, setListError]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { jobs, total, pages, isLoading, listError, refresh: fetch };
}
