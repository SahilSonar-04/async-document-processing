export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface Document {
  id: string;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  uploaded_at: string;
  is_deleted: boolean;
}

export interface ProcessingResult {
  id: string;
  job_id: string;
  title: string | null;
  category: string | null;
  summary: string | null;
  keywords: string[] | null;
  word_count: number | null;
  language: string | null;
  extracted_text: string | null;
  raw_json: Record<string, unknown> | null;
  is_finalized: boolean;
  finalized_at: string | null;
  edited_at: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  document_id: string;
  celery_task_id: string | null;
  status: JobStatus;
  progress: number;
  current_stage: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  document?: Document;
  result?: ProcessingResult | null;
}

export interface JobListItem {
  id: string;
  document_id: string;
  status: JobStatus;
  progress: number;
  current_stage: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  document?: {
    id: string;
    original_filename: string;
    file_type: string;
    file_size: number;
    uploaded_at: string;
  };
}

export interface JobListResponse {
  items: JobListItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface UploadResponse {
  document_id: string;
  job_id: string;
  filename: string;
  status: JobStatus;
  message: string;
}

export interface ProgressEvent {
  job_id: string;
  event: string;
  progress: number;
  stage: string | null;
  message: string | null;
  timestamp: string;
}

export interface ResultUpdateRequest {
  title?: string;
  category?: string;
  summary?: string;
  keywords?: string[];
}

export interface JobFilters {
  status?: JobStatus | "";
  search?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  page?: number;
  page_size?: number;
}
