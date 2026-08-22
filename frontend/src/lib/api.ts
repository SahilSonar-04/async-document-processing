/**
 * HTTP API client for DocFlow backend services.
 *
 * Configures Axios with base URL handling, automatic JWT bearer token injection,
 * 401 unauthenticated redirect interceptors, and typed API helper functions.
 *
 * @packageDocumentation
 */

import axios, { AxiosError } from "axios";
import { useAuthStore } from "@/store/authStore";

import type {
  Job,
  JobListResponse,
  UploadResponse,
  ProcessingResult,
  ResultUpdateRequest,
  DocumentAnswerResponse,
  AgentAnswerResponse,
  AgentHistoryResponse,
  JobFilters,
} from "@/types";

const baseUrl = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/api/v1`
  : "/api/v1";

const api = axios.create({
  baseURL: baseUrl,
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

/**
 * Upload a single document for background processing.
 *
 * @param file - Selected File object to upload.
 * @param extractionMode - Processing strategy ("classical" or "llm").
 * @returns Promise resolving to the created document and job descriptor.
 */
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

/**
 * Upload multiple documents concurrently in a single multipart request.
 *
 * @param files - Array of File objects to upload.
 * @param extractionMode - Processing strategy ("classical" or "llm").
 * @returns Promise resolving to successful upload descriptors and any individual file errors.
 */
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

/**
 * Fetch a paginated list of jobs matching search, status, and sort parameters.
 *
 * @param filters - Optional query parameters for filtering and pagination.
 * @returns Promise resolving to the paginated jobs envelope.
 */
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

/**
 * Retrieve full job details, target document attributes, and extraction results.
 *
 * @param jobId - UUID string of the target job.
 * @returns Promise resolving to the Job model.
 */
export async function getJob(jobId: string): Promise<Job> {
  const { data } = await api.get<Job>(`/jobs/${jobId}`);
  return data;
}

/**
 * Retry a failed or cancelled processing job.
 *
 * @param jobId - UUID string of the target job.
 * @returns Promise resolving to the updated Job model.
 */
export async function retryJob(jobId: string): Promise<Job> {
  const { data } = await api.post<Job>(`/jobs/${jobId}/retry`);
  return data;
}

/**
 * Register a new user account with email and password.
 *
 * @param email - User email address.
 * @param password - Plaintext password (8-128 chars).
 * @returns Promise resolving to created user record.
 */
export async function registerUser(email: string, password: string) {
  const { data } = await api.post("/auth/register", { email, password });
  return data as { id: string; email: string; created_at: string };
}

/**
 * Authenticate user credentials and retrieve a signed JWT token.
 *
 * @param email - User email address.
 * @param password - Plaintext password.
 * @returns Promise resolving to access token response.
 */
export async function loginUser(email: string, password: string) {
  const { data } = await api.post("/auth/login", { email, password });
  return data as { access_token: string; token_type: string };
}

/**
 * Fetch profile information of the currently authenticated user.
 *
 * @returns Promise resolving to authenticated user details.
 */
export async function getMe() {
  const { data } = await api.get("/auth/me");
  return data as { id: string; email: string; created_at: string };
}

/**
 * Modify editable metadata fields of an unfinalized processing result.
 *
 * @param jobId - Target job UUID.
 * @param update - Updated title, category, summary, or keywords.
 * @returns Promise resolving to the updated ProcessingResult.
 */
export async function updateResult(
  jobId: string,
  update: ResultUpdateRequest
): Promise<ProcessingResult> {
  const { data } = await api.patch<ProcessingResult>(`/jobs/${jobId}/result`, update);
  return data;
}

/**
 * Lock a processing result against further user edits.
 *
 * @param jobId - Target job UUID.
 * @returns Promise resolving to the finalized ProcessingResult.
 */
export async function finalizeResult(jobId: string): Promise<ProcessingResult> {
  const { data } = await api.post<ProcessingResult>(`/jobs/${jobId}/finalize`, {
    confirmed: true,
  });
  return data;
}

/**
 * Perform single-document RAG question answering against pgvector indexed chunks.
 *
 * @param jobId - Target job UUID.
 * @param question - Natural language question string.
 * @returns Promise resolving to answer text and source passage citations.
 */
export async function askDocument(
  jobId: string,
  question: string
): Promise<DocumentAnswerResponse> {
  const { data } = await api.post<DocumentAnswerResponse>(`/jobs/${jobId}/ask`, { question });
  return data;
}

/**
 * Run synchronous autonomous agent reasoning across all user documents.
 *
 * @param question - Natural language research question.
 * @returns Promise resolving to final answer and tool execution trace.
 */
export async function askAgent(question: string): Promise<AgentAnswerResponse> {
  const { data } = await api.post<AgentAnswerResponse>("/agent/ask", { question });
  return data;
}

/**
 * Fetch historical agent research queries and tool traces.
 *
 * @param limit - Maximum historical queries to retrieve (default: 10).
 * @returns Promise resolving to agent history response list.
 */
export async function getAgentHistory(limit = 10): Promise<AgentHistoryResponse> {
  const { data } = await api.get<AgentHistoryResponse>("/agent/history", {
    params: { limit },
  });
  return data;
}

/**
 * Download processed document records in CSV or JSON format as a file attachment.
 *
 * @param format - Export format identifier ("json" or "csv").
 * @param finalizedOnly - Restrict export exclusively to finalized documents.
 */
export async function exportRecords(format: "json" | "csv", finalizedOnly = false): Promise<void> {
  const { data } = await api.get(`/export/${format}`, {
    params: { finalized_only: finalizedOnly },
    responseType: "blob",
  });

  const blob = new Blob([data], {
    type: format === "csv" ? "text/csv" : "application/json",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `docflow_export.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default api;
