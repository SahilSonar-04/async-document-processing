import { create } from "zustand";
import type { Job, JobListItem, JobFilters, ProgressEvent } from "@/types";

interface JobStore {
  // List state
  jobs: JobListItem[];
  total: number;
  pages: number;
  currentPage: number;
  filters: JobFilters;
  isLoading: boolean;
  listError: string | null;

  // Detail state
  selectedJob: Job | null;
  isDetailLoading: boolean;
  detailError: string | null;

  // Live progress (keyed by job_id)
  progress: Record<string, ProgressEvent>;

  // Actions
  setJobs: (jobs: JobListItem[], total: number, pages: number) => void;
  setFilters: (filters: Partial<JobFilters>) => void;
  setCurrentPage: (page: number) => void;
  setLoading: (v: boolean) => void;
  setListError: (e: string | null) => void;

  setSelectedJob: (job: Job | null) => void;
  setDetailLoading: (v: boolean) => void;
  setDetailError: (e: string | null) => void;

  updateJobInList: (jobId: string, patch: Partial<JobListItem>) => void;
  updateProgress: (jobId: string, event: ProgressEvent) => void;
  clearProgress: (jobId: string) => void;
}

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

  selectedJob: null,
  isDetailLoading: false,
  detailError: null,

  progress: {},

  setJobs: (jobs, total, pages) => set({ jobs, total, pages }),
  setFilters: (f) =>
    set((s) => ({ filters: { ...s.filters, ...f }, currentPage: 1 })),
  setCurrentPage: (page) => set({ currentPage: page }),
  setLoading: (v) => set({ isLoading: v }),
  setListError: (e) => set({ listError: e }),

  setSelectedJob: (job) => set({ selectedJob: job }),
  setDetailLoading: (v) => set({ isDetailLoading: v }),
  setDetailError: (e) => set({ detailError: e }),

  updateJobInList: (jobId, patch) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j)),
    })),

  updateProgress: (jobId, event) =>
    set((s) => ({ progress: { ...s.progress, [jobId]: event } })),

  clearProgress: (jobId) =>
    set((s) => {
      const next = { ...s.progress };
      delete next[jobId];
      return { progress: next };
    }),
}));
