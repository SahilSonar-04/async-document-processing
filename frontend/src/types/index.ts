/**
 * Domain types, request models, response envelopes, and event contracts for DocFlow.
 *
 * @packageDocumentation
 */

/**
 * Lifecycle status states for document processing jobs.
 */
export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

/**
 * Uploaded document entity representation.
 */
export interface Document {
  /** Unique document UUID */
  id: string;
  /** Original filename uploaded by the user */
  original_filename: string;
  /** Lowercase file extension */
  file_type: string;
  /** File size in bytes */
  file_size: number;
  /** ISO timestamp when file was uploaded */
  uploaded_at: string;
}

/**
 * Extracted document metadata, summary, and classification result.
 */
export interface ProcessingResult {
  /** Unique result UUID */
  id: string;
  /** UUID of associated processing job */
  job_id: string;
  /** Extracted or inferred title */
  title: string | null;
  /** Classified document category */
  category: string | null;
  /** Extractive or generative summary */
  summary: string | null;
  /** Extracted key phrase keywords */
  keywords: string[] | null;
  /** Total word count */
  word_count: number | null;
  /** Detected ISO language code */
  language: string | null;
  /** Snippet of extracted document text */
  extracted_text: string | null;
  /** Complete diagnostic and raw metadata payload */
  raw_json: Record<string, unknown> | null;
  /** Whether result has been locked against further user edits */
  is_finalized: boolean;
  /** ISO timestamp when result was finalized */
  finalized_at: string | null;
  /** ISO timestamp when result was last edited */
  edited_at: string | null;
  /** Creation timestamp */
  created_at: string;
}

/**
 * Detailed processing job entity including nested document and result relations.
 */
export interface Job {
  /** Unique job UUID */
  id: string;
  /** UUID of target document */
  document_id: string;
  /** Celery background task UUID */
  celery_task_id: string | null;
  /** Current processing state */
  status: JobStatus;
  /** Progress percentage (0 to 100) */
  progress: number;
  /** Current workflow stage identifier */
  current_stage: string | null;
  /** Error message if job failed */
  error_message: string | null;
  /** Number of retry attempts executed */
  retry_count: number;
  /** Extraction strategy applied */
  extraction_mode: "classical" | "llm";
  /** Job creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
  /** Completion or termination timestamp */
  completed_at: string | null;
  /** Associated document summary if populated */
  document?: Document;
  /** Extracted processing result if completed */
  result?: ProcessingResult | null;
}

/**
 * Lightweight job entity for paginated list tables.
 */
export interface JobListItem {
  /** Unique job UUID */
  id: string;
  /** Target document UUID */
  document_id: string;
  /** Current job status */
  status: JobStatus;
  /** Progress completion percentage (0-100) */
  progress: number;
  /** Current workflow stage */
  current_stage: string | null;
  /** Retry counter */
  retry_count: number;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
  /** Completion timestamp */
  completed_at: string | null;
  /** Associated document summary */
  document?: Document;
}

/**
 * Paginated jobs response envelope.
 */
export interface JobListResponse {
  /** List of jobs for the current page */
  items: JobListItem[];
  /** Total matching records count */
  total: number;
  /** Current page index (1-based) */
  page: number;
  /** Page size limit */
  page_size: number;
  /** Total pages available */
  pages: number;
}

/**
 * Response payload returned after uploading a document.
 */
export interface UploadResponse {
  /** Created document UUID */
  document_id: string;
  /** Created job UUID */
  job_id: string;
  /** Sanitized storage filename */
  filename: string;
  /** Initial job status */
  status: JobStatus;
  /** Status confirmation message */
  message: string;
}

/**
 * Real-time progress update event payload received over SSE.
 */
export interface ProgressEvent {
  /** Associated job UUID */
  job_id: string;
  /** Event name identifier */
  event: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current workflow stage identifier */
  stage: string | null;
  /** Progress status description message */
  message: string | null;
  /** Event generation ISO timestamp */
  timestamp: string;
}

/**
 * Payload for modifying editable fields of an unfinalized processing result.
 */
export interface ResultUpdateRequest {
  /** Updated title */
  title?: string;
  /** Updated category */
  category?: string;
  /** Updated summary */
  summary?: string;
  /** Updated keyword array */
  keywords?: string[];
}

/**
 * Semantic search citation excerpt retrieved via pgvector cosine distance.
 */
export interface ChunkCitation {
  /** Zero-based index of the chunk passage in the document */
  chunk_index: number;
  /** Text excerpt snippet */
  snippet: string;
  /** Cosine similarity score (0.0 to 1.0) */
  similarity: number;
}

/**
 * Direct RAG question answering response for a single document.
 */
export interface DocumentAnswerResponse {
  /** Synthesized answer */
  answer: string;
  /** Supporting citations retrieved from vector search */
  citations: ChunkCitation[];
  /** Total query latency in milliseconds */
  latency_ms: number;
  /** Total LLM API calls executed */
  llm_call_count: number;
}

/**
 * Autonomous agent tool invocation step descriptor.
 */
export interface AgentStep {
  /** Name of the executed tool */
  tool: string;
  /** Input arguments passed to the tool */
  args: Record<string, unknown>;
  /** Output returned by the tool */
  result: unknown;
  /** Error message if tool execution failed */
  error: string | null;
}

/**
 * Synchronous agent execution response envelope.
 */
export interface AgentAnswerResponse {
  /** Final synthesized research answer */
  answer: string;
  /** Total tool calling steps executed */
  steps_taken: number;
  /** Chronological trace of tool invocations */
  tool_trace: AgentStep[];
  /** Execution latency in milliseconds */
  latency_ms: number;
  /** Total LLM invocations */
  llm_call_count: number;
}

/**
 * Historical record of a completed agent research query.
 */
export interface AgentQueryHistoryItem {
  /** Query log UUID */
  id: string;
  /** Original user question */
  question: string;
  /** Synthesized answer */
  answer: string;
  /** Steps executed */
  steps_taken: number;
  /** Tool invocation trace */
  tool_trace: AgentStep[];
  /** Query creation timestamp */
  created_at: string;
  /** Execution latency in milliseconds */
  latency_ms: number;
  /** Total LLM calls */
  llm_call_count: number;
}

/**
 * Agent query history list envelope.
 */
export interface AgentHistoryResponse {
  /** List of historical agent queries */
  items: AgentQueryHistoryItem[];
}

/**
 * Real-time SSE streaming events emitted by the autonomous ReAct agent loop.
 */
export type AgentStreamEvent =
  | { event: "reasoning_started"; step: number }
  | { event: "tool_call_started"; tool: string; args: Record<string, unknown> }
  | { event: "tool_call_completed"; tool: string; result: unknown }
  | { event: "tool_call_failed"; tool: string; error: string }
  | {
      event: "final_answer";
      answer: string;
      steps_taken: number;
      latency_ms: number;
      llm_call_count: number;
    }
  | { event: "error"; message: string };

/**
 * Query filter parameters for the jobs list view.
 */
export interface JobFilters {
  /** Filter by status */
  status?: JobStatus | "";
  /** Search by filename or type substring */
  search?: string;
  /** Field to sort results by */
  sort_by?: string;
  /** Sort direction */
  sort_dir?: "asc" | "desc";
  /** Target page number (1-based) */
  page?: number;
  /** Items per page limit */
  page_size?: number;
}
