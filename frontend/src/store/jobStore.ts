/**
 * Global document job state management store using Zustand.
 *
 * Tracks paginated job records, active search and filter controls,
 * loading states, and real-time SSE progress events keyed by job ID.
 *
 * @packageDocumentation
 */

import { create } from "zustand";
import type { JobListItem, JobFilters, ProgressEvent } from "@/types";

/**
 * Interface contract for the global Job state store.
 */
interface JobStore {
  /** Array of job items on the current page */
  jobs: JobListItem[];
  /** Total matching job count */
  total: number;
  /** Total page count */
  pages: number;
  /** Currently active page index */
  currentPage: number;
  /** Current search, status, and sorting filters */
  filters: JobFilters;
  /** Whether jobs list is actively fetching */
  isLoading: boolean;
  /** Error message string if list fetch failed */
  listError: string | null;
  /** Live progress update events mapped by job UUID */
  progress: Record<string, ProgressEvent>;

  /** Replace job list items and pagination metadata */
  setJobs: (jobs: JobListItem[], total: number, pages: number) => void;
  /** Merge partial filter updates and reset current page to 1 */
  setFilters: (filters: Partial<JobFilters>) => void;
  /** Change active page number */
  setCurrentPage: (page: number) => void;
  /** Set loading state */
  setLoading: (v: boolean) => void;
  /** Set list error message */
  setListError: (e: string | null) => void;
  /** Apply partial updates to an individual job within the local list cache */
  updateJobInList: (jobId: string, patch: Partial<JobListItem>) => void;
  /** Record a real-time progress update event */
  updateProgress: (jobId: string, event: ProgressEvent) => void;
}

/**
 * Global reactive Zustand hook managing job listings, pagination, and real-time event updates.
 */
export const useJobStore = create<JobStore>((set) => ({
  jobs: [],
  total: 0,
  pages: 1,
  currentPage: 1,
  filters: {
    status: "",
    search: "",
    sort_by: "created_at",
    sort_dir: "desc",
    page_size: 20,
  },
  isLoading: false,
  listError: null,

  progress: {},

  setJobs: (jobs, total, pages) => set({ jobs, total, pages }),
  setFilters: (f) =>
    set((s) => ({ filters: { ...s.filters, ...f }, currentPage: 1 })),
  setCurrentPage: (page) => set({ currentPage: page }),
  setLoading: (v) => set({ isLoading: v }),
  setListError: (e) => set({ listError: e }),

  updateJobInList: (jobId, patch) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j)),
    })),

  updateProgress: (jobId, event) =>
    set((s) => ({ progress: { ...s.progress, [jobId]: event } })),
}));