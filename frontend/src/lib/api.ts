import axios, { AxiosError } from "axios";
import { useAuthStore } from "@/store/authStore";

import type {
  Job,
  JobListResponse,
  UploadResponse,
  ProcessingResult,
  ResultUpdateRequest,
  DocumentAnswerResponse,
  JobFilters,
} from "@/types";

const baseUrl = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/api/v1`
  : "/api/v1";

const api = axios.create({
  baseURL: baseUrl,
  // ✅ FIX: Render free tier can take ~30s to wake from sleep.
  // 60s gives it time to wake + respond without a spurious timeout error.
  timeout: 60_000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clearAuth();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
      return Promise.reject(
        new Error(
          "The server is waking up from sleep — this can take ~30 seconds on the free tier. " +
          "Please try again in a moment."
        )
      );
    }

    const msg =
      (err.response?.data as { detail?: string; message?: string })?.detail ||
      (err.response?.data as { detail?: string; message?: string })?.message ||
      err.message ||
      "An unexpected error occurred";
    return Promise.reject(new Error(msg));
  }
);

// ── Documents / Jobs ──────────────────────────────────────────────────────────

export async function uploadDocument(
  file: File,
  extractionMode: "classical" | "llm" = "classical"
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("extraction_mode", extractionMode);
  const { data } = await api.post<UploadResponse>("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function uploadDocuments(
  files: File[],
  extractionMode: "classical" | "llm" = "classical"
): Promise<{ uploaded: UploadResponse[]; errors: { filename: string; error: string }[] }> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  form.append("extraction_mode", extractionMode);
  const { data } = await api.post("/upload/bulk", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function listJobs(filters: JobFilters = {}): Promise<JobListResponse> {
  const params: Record<string, string | number> = {};
  if (filters.status)    params.status    = filters.status;
  if (filters.search)    params.search    = filters.search;
  if (filters.sort_by)   params.sort_by   = filters.sort_by;
  if (filters.sort_dir)  params.sort_dir  = filters.sort_dir;
  if (filters.page)      params.page      = filters.page;
  if (filters.page_size) params.page_size = filters.page_size;
  const { data } = await api.get<JobListResponse>("/jobs", { params });
  return data;
}

export async function getJob(jobId: string): Promise<Job> {
  const { data } = await api.get<Job>(`/jobs/${jobId}`);
  return data;
}

export async function retryJob(jobId: string): Promise<Job> {
  const { data } = await api.post<Job>(`/jobs/${jobId}/retry`);
  return data;
}

// ── Auth────────────────────────────────────────────────────────────
export async function registerUser(email: string, password: string) {
  const { data } = await api.post("/auth/register", { email, password });
  return data as { id: string; email: string; created_at: string };
}

export async function loginUser(email: string, password: string) {
  const { data } = await api.post("/auth/login", { email, password });
  return data as { access_token: string; token_type: string };
}

export async function getMe() {
  const { data } = await api.get("/auth/me");
  return data as { id: string; email: string; created_at: string };
}

// ── Result editing ────────────────────────────────────────────────────────────

export async function updateResult(
  jobId: string,
  update: ResultUpdateRequest
): Promise<ProcessingResult> {
  const { data } = await api.patch<ProcessingResult>(`/jobs/${jobId}/result`, update);
  return data;
}

export async function finalizeResult(jobId: string): Promise<ProcessingResult> {
  const { data } = await api.post<ProcessingResult>(`/jobs/${jobId}/finalize`, {
    confirmed: true,
  });
  return data;
}

export async function askDocument(
  jobId: string,
  question: string
): Promise<DocumentAnswerResponse> {
  const { data } = await api.post<DocumentAnswerResponse>(`/jobs/${jobId}/ask`, { question });
  return data;
}

// ── Export ────────────────────────────────────────────────────────────────────

export function getExportUrl(format: "json" | "csv", finalizedOnly = false): string {
  const base = process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/api/v1`
    : "/api/v1";
  return `${base}/export/${format}?finalized_only=${finalizedOnly}`;
}

export default api;
