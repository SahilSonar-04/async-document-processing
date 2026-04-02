import { useEffect, useCallback } from "react";
import { useJobStore } from "@/store/jobStore";
import { listJobs } from "@/lib/api";

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
