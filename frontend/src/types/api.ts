// Shared API response/request types for the Cortex backend contract.
// Keep this file in sync with the backend contract exactly — every endpoint's
// request/response shape should be represented here so the rest of the app
// never needs `any`.

export type UserRole = "admin" | "analyst" | "viewer";

export type DocumentCategory =
  | "general"
  | "finance"
  | "hr"
  | "legal"
  | "engineering";

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "general",
  "finance",
  "hr",
  "legal",
  "engineering",
];

export type LoginUserId = "admin" | "analyst" | "viewer";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  categories: DocumentCategory[];
  avatar: string;
}

export interface LoginRequest {
  user_id: LoginUserId;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type DocumentStatus =
  | "uploaded"
  | "extracting"
  | "chunking"
  | "indexing"
  | "ready"
  | "failed";

export const TERMINAL_DOCUMENT_STATUSES: DocumentStatus[] = ["ready", "failed"];

export interface DocumentRecord {
  id: string;
  document_name: string;
  document_category: DocumentCategory;
  uploaded_by: string;
  upload_timestamp: string;
  status: DocumentStatus;
  page_count: number | null;
  chunk_count: number | null;
}

export interface UpdateDocumentCategoryRequest {
  category: DocumentCategory;
}

// ---------------------------------------------------------------------------
// Chat / SSE
// ---------------------------------------------------------------------------

export interface ChatRequest {
  message: string;
  /** Lets the backend keep several independent conversations alive per user
   * (see services/rag.py CONVERSATIONS). Omit to fall back to the JWT session. */
  thread_id?: string;
}

export interface ChatCitation {
  document_name: string;
  page_number: number;
  excerpt: string;
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** SSE "message" event payload — an incremental text delta. */
export interface ChatDeltaEvent {
  delta: string;
}

/** SSE "done" event payload — sent once, at the end of the stream. */
export interface ChatDoneEvent {
  citations: ChatCitation[];
  usage: ChatUsage | null;
  latency_ms: number;
  output_flagged?: boolean;
  blocked?: boolean;
  quota_exceeded?: boolean;
}

export type ChatSSEEventType = "message" | "done" | "error" | string;

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export interface UsageBucket {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  embedding_tokens: number;
  query_count: number;
}

export interface RecentQuery {
  id: string;
  timestamp: string;
  message_preview: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
}

/** None `limit` means the caller's role has no configured quota (unlimited). */
export interface QuotaStatus {
  limit: number | null;
  used: number;
  remaining: number | null;
  percent_used: number | null;
  exceeded: boolean;
}

export interface MyUsageResponse {
  today: UsageBucket;
  week: UsageBucket;
  month: UsageBucket;
  all_time: UsageBucket;
  recent_queries: RecentQuery[];
  quota: QuotaStatus;
}

export interface LeaderboardEntry {
  user_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  embedding_tokens: number;
  total_tokens: number;
  query_count: number;
  estimated_cost: number;
}

export interface DailyTrendPoint {
  date: string;
  prompt_tokens: number;
  completion_tokens: number;
  embedding_tokens: number;
  total_tokens: number;
  query_count: number;
}

export interface AllUsageResponse {
  leaderboard: LeaderboardEntry[];
  daily_trend: DailyTrendPoint[];
}

/** Per-user drill-down for the Admin Usage Analytics leaderboard. */
export interface UserUsageDetail {
  user_id: string;
  today: UsageBucket;
  week: UsageBucket;
  month: UsageBucket;
  all_time: UsageBucket;
  recent_queries: RecentQuery[];
  daily_history: DailyTrendPoint[];
}

export type ExportFormat = "csv" | "json";

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

// Must match app/services/audit.py's VALID_EVENT_TYPES exactly - these are the only
// event_type values the backend ever actually writes.
export type AuditEventType =
  | "login"
  | "logout"
  | "document_upload"
  | "document_delete"
  | "chat_query"
  | "content_safety_flag"
  | "rbac_denial"
  | "admin_action";

export const AUDIT_EVENT_TYPES: AuditEventType[] = [
  "login",
  "logout",
  "document_upload",
  "document_delete",
  "chat_query",
  "content_safety_flag",
  "rbac_denial",
  "admin_action",
];

export interface AuditTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  user_id: string;
  user_email: string;
  user_role: UserRole;
  event_type: AuditEventType;
  action: string;
  resource: string;
  ip_address: string;
  session_id: string;
  details: string;
  token_usage?: AuditTokenUsage;
}

export interface AuditQueryParams {
  user_id?: string;
  event_type?: AuditEventType;
  date_from?: string;
  date_to?: string;
  document?: string;
  page_size?: number;
  continuation_token?: string;
}

export interface AuditResponse {
  items: AuditLogItem[];
  next_continuation_token: string | null;
}

// ---------------------------------------------------------------------------
// Generic API error shape
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  detail?: string;
  message?: string;
}
