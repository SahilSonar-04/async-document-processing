import axios from "axios";
import type {
  Job,
  JobListResponse,
  UploadResponse,
  ProcessingResult,
  ResultUpdateRequest,
  JobFilters,
} from "@/types";

const baseUrl = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/api/v1`
  : "/api/v1";

const api = axios.create({
  baseURL: baseUrl,
  timeout: 30000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message ||
      "An unexpected error occurred";
    return Promise.reject(new Error(msg));
  }
);

// ── Documents / Jobs ──────────────────────────────────────────────────────────

export async function uploadDocument(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<UploadResponse>("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function uploadDocuments(
  files: File[]
): Promise<{ uploaded: UploadResponse[]; errors: { filename: string; error: string }[] }> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
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

// ── Export ────────────────────────────────────────────────────────────────────

export function getExportUrl(format: "json" | "csv", finalizedOnly = false): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/api/v1`
    : "/api/v1";
  return `${baseUrl}/export/${format}?finalized_only=${finalizedOnly}`;
}

export default api;
